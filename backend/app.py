"""
backend/app.py – ZeroBloatEmulator Flask API (v4 – Core Lifecycle)
Run from the project root:  python backend/app.py
"""

import os
import sys
import time

from flask import Flask, jsonify, request, send_from_directory, send_file, after_this_request
import zipfile
import tempfile
import shutil
from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect, generate_csrf, CSRFError
from flask_talisman import Talisman
from threading import Lock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Import config (ensure backend/config.py exists and has SECRET_KEY)
import backend.config as config

from backend.utils.logger import get_logger, read_log_tail, clear_logs
from backend.utils.admin import is_admin, restart_as_admin
from backend.utils.shortcut import resolve_shortcut
from backend.core.vm_manager import QemuManager
from backend.core.ssh_worker import SSHWorker
from backend.emulators.loader import detect_emulator
import backend.utils.bootstrap as bootstrap

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="/")
app.config.from_object(config)

# Security Headers (Allow everything for local dev, but force some security)
talisman = Talisman(app, content_security_policy=None, force_https=False)

# CSRF Protection
csrf = CSRFProtect(app)

# Strict CORS
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:5173", "http://127.0.0.1:5173",
            "http://localhost:5000", "http://127.0.0.1:5000"
        ],
        "supports_credentials": True
    }
})

# ---------------------------------------------------------------------------
# PROFILES API
# ---------------------------------------------------------------------------

@app.route("/api/profiles", methods=["GET"])
def api_profiles():
    """
    Get available debloat profiles for the CURRENTLY selected emulator type.
    """
    from backend.emulators.loader import get_strategy
    
    # If no emulator type is set yet, we can't return specific profiles
    if not ssh.emulator_type:
        return jsonify({"status": "ok", "profiles": []})

    strategy = get_strategy(ssh.emulator_type)
    if not strategy:
        return jsonify({"status": "ok", "profiles": []})

    # Try to detect Android version if running
    android_version = None
    if qemu.is_running and ssh._client:
        try:
             # Search for build.prop in common locations
             # Then grep for ro.build.version.release=
             cmd = f"grep '^ro.build.version.release=' {config.MOUNT_POINT}/system/build.prop {config.MOUNT_POINT}/build.prop 2>/dev/null | head -n 1 | cut -d= -f2"
             out = ssh.execute_command(cmd)
             if out:
                 android_version = out.strip()
        except Exception as e:
            logger.debug(f"[CORE] Failed to read build.prop: {e}")
            pass

    profiles = strategy.get_profiles(android_version=android_version)
    return jsonify({"status": "ok", "profiles": profiles, "android_version": android_version})


@app.route("/api/profiles/<profile_id>", methods=["GET"])
def api_profile_packages(profile_id):
    """
    Get the list of package paths for a specific profile.
    """
    from backend.emulators.loader import get_strategy
    
    if not ssh.emulator_type:
         return _error("No emulator type selected. Start the core first.", 400)
         
    strategy = get_strategy(ssh.emulator_type) 
    if not strategy:
        return _error(f"Unknown strategy for {ssh.emulator_type}", 400)
        
    packages = strategy.get_profile_packages(profile_id)
    return jsonify({"status": "ok", "profile_id": profile_id, "packages": packages})


@app.route("/api/apps/targets", methods=["GET"])
def api_app_targets():
    """
    Returns a list of available system directories where apps can be installed.
    Only returns directories that actually exist on the target mount.
    """
    if not qemu.is_running or not ssh._client:
        return _error("Core not running or connected.", 400)

    # Base targets that are almost always there
    candidates = [
        {"id": "app", "path": "/system/app", "label": "app (default)"},
        {"id": "priv-app", "path": "/system/priv-app", "label": "priv-app"},
        {"id": "vendor/app", "path": "/vendor/app", "label": "vendor/app"},
        {"id": "vendor/priv-app", "path": "/vendor/priv-app", "label": "vendor/priv-app"},
        {"id": "product/app", "path": "/product/app", "label": "product/app"},
        {"id": "product/priv-app", "path": "/product/priv-app", "label": "product/priv-app"},
    ]

    valid = []
    for c in candidates:
        full_path = f"{config.MOUNT_POINT}{c['path']}"
        check = ssh.execute_command(f"[ -d {full_path} ] && echo YES || echo NO")
        if check.strip() == "YES":
            valid.append(c)
    
    return jsonify({"status": "ok", "targets": valid})


@app.route("/api/apps/upload", methods=["POST"])
@csrf.exempt # Exempting for simplicity with multi-part, consider token if needed
def api_app_upload():
    """
    Body: Multipart file 'apk' + string field 'target_path' (e.g. /system/app)
    """
    if not qemu.is_running or not ssh._client:
        return _error("Core not running or connected.", 400)

    if 'apk' not in request.files:
        return _error("No APK file uploaded.", 400)
    
    apk_file = request.files['apk']
    target_path = request.form.get('target_path', '/system/app')

    if not apk_file.filename.endswith('.apk'):
        return _error("Invalid file type. Only .apk allowed.", 400)

    import tempfile
    import re
    import unicodedata
    import gc
    import warnings
    from pyaxmlparser import APK

    # Suppress pyaxmlparser noise
    warnings.filterwarnings("ignore", category=UserWarning, module="pyaxmlparser")

    def sanitize_name(name: str) -> str:
        # Remove extension
        name = os.path.splitext(name)[0]
        # Normalize unicode (remove accents/marks)
        name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
        # Remove non-alphanumeric (keep only letters, numbers, underscores, dots)
        name = re.sub(r'[^a-zA-Z0-9._]', '', name)
        # Trim and ensure not empty
        name = name.strip() or "unnamed_app"
        return name

    def get_pkg_name(path):
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=UserWarning, module="pyaxmlparser")
                apk = APK(path)
                return apk.package
        except:
            return None

    tmp_path = tempfile.mktemp(suffix=".apk")
    apk_file.save(tmp_path)

    import hashlib

    # Calculate local SHA256 before upload
    def calculate_local_sha256(filepath):
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    try:
        pkg_name = get_pkg_name(tmp_path)
        
        if not pkg_name:
            pkg_name = sanitize_name(apk_file.filename)

        # Calculate local hash
        local_hash = calculate_local_sha256(tmp_path)
        logger.info(f"[CORE] Local APK hash (SHA256): {local_hash}")

        # Target full path on VM: /mnt/android/system/app/com.example.app/base.apk
        remote_dir = f"{config.MOUNT_POINT}{target_path}/{pkg_name}"
        remote_apk = f"{remote_dir}/base.apk"
        
        # Check overwrite
        overwrite = request.form.get('overwrite') == 'true'
        check = ssh.execute_command(f"[ -f \"{remote_apk}\" ] && echo YES || echo NO")
        if check.strip() == "YES" and not overwrite:
            return _error(f"App already exists: {pkg_name}", 409)

        # Ensure write access
        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")

        # Create dir
        ssh.execute_command(f"mkdir -p {remote_dir}")
        
        logger.info(f"[CORE] Uploading APK: {pkg_name} (overwrite={overwrite})")
        # Upload with metadata preservation
        ssh.upload_file(tmp_path, remote_apk, preserve_metadata=True)
        
        # Verify Integrity
        try:
            remote_hash = ssh.calculate_checksum(remote_apk, "sha256")
            logger.info(f"[CORE] Remote APK hash (SHA256): {remote_hash}")
            
            if local_hash != remote_hash:
                raise ValueError("Integrity Verify Failed: Local and Remote hashes do not match!")
            
            logger.info("[CORE] Integrity Verified.")
        except Exception as verify_err:
            logger.error(f"[CORE] Verification failed: {verify_err}")
            # Cleanup remote file
            ssh.execute_command(f"rm -rf {remote_dir}")
            raise verify_err

        # Set permissions (standard for system apps)
        # Note: We preserved target metadata if it existed, but for new files or if target didn't exist, we set defaults
        # If we overwrote, upload_file preserved metadata. But we might want to enforce system standard anyway?
        # If it was a system app, it should have 644/755. 
        # Making sure it's correct is safer than just preserving potential garbage.
        ssh.execute_command(f"chmod 755 {remote_dir}")
        ssh.execute_command(f"chmod 644 {remote_apk}")

        logger.info(f"[CORE] APK {pkg_name} installed successfully")

        # Determine category for frontend optimistic update
        # target_path is like /system/app or /vendor/app
        category = "app"
        if "priv-app" in target_path:
            category = "priv-app"
            if "vendor" in target_path: category = "vendor-priv-app"
            elif "product" in target_path: category = "product-priv-app"
        elif "vendor" in target_path: category = "vendor-app"
        elif "product" in target_path: category = "product-app"

        new_app = {
            "name": pkg_name,
            "path": f"{target_path}/{pkg_name}",
            "package": pkg_name,
            "category": category
        }

        return jsonify({"status": "ok", "app": new_app, "category": category})

    except Exception as e:
        return _error(f"Upload failed: {e}")
    finally:
        # Force garbage collection to release file handles before removal on Windows
        gc.collect()
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception as e:
                logger.warning(f"Could not remove temp file {tmp_path}: {e}")

# ===========================================================================
# FILE EXPLORER APIs  (/api/core/files/*)
# ===========================================================================

import gc
import posixpath
import re
import tempfile
import unicodedata

from backend.core.file_ops import safe_remote_path as _safe_path


def _fe_guard():
    """Return an error response if core is not ready, else None."""
    if not qemu.is_running or not ssh._client:
        return _error("Core not running or SSH not connected.", 503)
    return None


# ── GET /api/core/files/list ─────────────────────────────────────────────────

@app.route("/api/core/files/list", methods=["GET"])
def api_core_files_list():
    """List the contents of a directory inside /mnt/android.

    Query param:
        path (str): Frontend-relative path, e.g. "/" or "/system/app".
                    Defaults to "/".
    """
    if (err := _fe_guard()): return err

    user_path = request.args.get("path", "/")
    try:
        vm_path, display_path = _safe_path(user_path, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    try:
        files = ssh.list_remote_directory(vm_path)
        return jsonify({
            "status": "ok",
            "path": display_path,
            "current_path": display_path,
            "files": files,
        })
    except Exception as exc:
        return _error(f"Failed to list directory: {exc}")


# ── POST /api/core/files/mkdir ───────────────────────────────────────────────

@app.route("/api/core/files/mkdir", methods=["POST"])
def api_core_files_mkdir():
    """Create a directory inside /mnt/android.

    Body (JSON): { "path": "/new/folder" }
    """
    if (err := _fe_guard()): return err

    data = request.get_json(silent=True) or {}
    user_path = data.get("path", "")
    if not user_path:
        return _error("Missing 'path'.", 400)

    try:
        vm_path, display_path = _safe_path(user_path, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    try:
        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        ssh.create_folder(vm_path)
        return jsonify({"status": "ok", "message": f"Folder '{display_path}' created."})
    except Exception as exc:
        return _error(f"mkdir failed: {exc}")


# ── POST /api/core/files/delete ──────────────────────────────────────────────

@app.route("/api/core/files/delete", methods=["POST"])
def api_core_files_delete():
    """Delete a file or folder inside /mnt/android.

    Body (JSON): { "path": "/some/file_or_dir" }
    """
    if (err := _fe_guard()): return err

    data = request.get_json(silent=True) or {}
    user_path = data.get("path", "")
    if not user_path:
        return _error("Missing 'path'.", 400)

    try:
        vm_path, display_path = _safe_path(user_path, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    # Safety: never delete the mount root itself
    if vm_path.rstrip("/") == config.MOUNT_POINT.rstrip("/"):
        return _error("Cannot delete the filesystem root.", 400)

    try:
        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        ssh.delete_item(vm_path)
        return jsonify({"status": "ok", "message": f"'{display_path}' deleted."})
    except Exception as exc:
        return _error(f"delete failed: {exc}")


# ── POST /api/core/files/rename ──────────────────────────────────────────────

@app.route("/api/core/files/rename", methods=["POST"])
def api_core_files_rename():
    """Rename a file or folder inside /mnt/android.

    Body (JSON): { "old_path": "/old/name", "new_path": "/old/new_name" }
    """
    if (err := _fe_guard()): return err

    data = request.get_json(silent=True) or {}
    old_user = data.get("old_path", "")
    new_user = data.get("new_path", "")
    if not old_user or not new_user:
        return _error("Missing 'old_path' or 'new_path'.", 400)

    try:
        old_vm, old_display = _safe_path(old_user, config.MOUNT_POINT)
        new_vm, new_display = _safe_path(new_user, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    try:
        # Check if target exists
        overwrite = data.get("overwrite", False)
        # Check if new path exists
        check = ssh.execute_command(f"[ -e \"{new_vm}\" ] && echo YES || echo NO")
        if check.strip() == "YES" and not overwrite:
             return _error(f"Target already exists: {new_display}", 409)

        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        ssh.rename_item(old_vm, new_vm)
        return jsonify({
            "status": "ok",
            "message": "Renamed.",
            "old_path": old_display,
            "new_path": new_display,
        })
    except Exception as exc:
        return _error(f"rename failed: {exc}")


# ── POST /api/core/files/upload ──────────────────────────────────────────────

@app.route("/api/core/files/upload", methods=["POST"])
@csrf.exempt
def api_core_files_upload():
    """Upload a file to a directory inside /mnt/android.

    Multipart body:
        file  – The file to upload.
        path  – Destination directory (frontend-relative), e.g. "/system/app".
    """
    if (err := _fe_guard()): return err

    if "file" not in request.files:
        return _error("No 'file' part in request.", 400)

    upload = request.files["file"]
    user_dir = request.form.get("path", "/")

    if not upload.filename:
        return _error("File has no name.", 400)

    def _sanitize(name: str) -> str:
        name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
        name = re.sub(r"[^\w.\-]", "_", name)
        return name.strip("_") or "upload"

    safe_name = _sanitize(upload.filename)

    try:
        vm_dir, display_dir = _safe_path(user_dir, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    vm_dest = posixpath.join(vm_dir, safe_name)

    # Additional traversal check on the full destination path
    try:
        _safe_path("/" + posixpath.relpath(vm_dest, config.MOUNT_POINT), config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    tmp_path = tempfile.mktemp(suffix="_" + safe_name)
    upload.save(tmp_path)

    try:
        # Check overwrite
        overwrite = request.form.get("overwrite") == 'true'
        check = ssh.execute_command(f"[ -f \"{vm_dest}\" ] && echo YES || echo NO")
        if check.strip() == "YES" and not overwrite:
             return _error(f"File already exists: {safe_name}", 409)

        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        ssh.execute_command(f'mkdir -p "{vm_dir}"')
        ssh.upload_file(tmp_path, vm_dest, preserve_metadata=True)
        logger.info("[FileExplorer] Uploaded: %s -> %s", safe_name, vm_dest)
        return jsonify({
            "status": "ok",
            "message": f"'{safe_name}' uploaded to '{display_dir}'.",
            "name": safe_name,
        })
    except Exception as exc:
        return _error(f"Upload failed: {exc}")
    finally:
        gc.collect()
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception as e:
                logger.warning("Could not remove temp file %s: %s", tmp_path, e)


# ── GET /api/core/files/download ─────────────────────────────────────────────

@app.route("/api/core/files/download", methods=["GET"])
def api_core_files_download():
    """Download a file from the mounted Android image.

    Query param:
        path (str): Frontend-relative path of the file, e.g. "/system/app/YouTube/base.apk".
    """
    if (err := _fe_guard()): return err

    user_path = request.args.get("path", "")
    if not user_path:
        return _error("Missing 'path' query parameter.", 400)

    try:
        vm_path, _ = _safe_path(user_path, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    filename = posixpath.basename(vm_path) or "download"
    tmp_path = tempfile.mktemp(suffix="_" + filename)

    try:
        ssh.download_file(vm_path, tmp_path)
        return send_file(
            tmp_path,
            as_attachment=True,
            download_name=filename,
        )
    except Exception as exc:
        return _error(f"Download failed: {exc}")
    # Note: temp file cleanup on Windows must happen after send_file returns.
    # Flask's send_file streams lazily so we schedule it via a finalizer.


# ── POST /api/core/files/extract ─────────────────────────────────────────────

@app.route("/api/core/files/extract", methods=["POST"])
def api_core_files_extract():
    """Extract an archive (zip, tar, gz, tgz) on the VM.

    Body (JSON): { "path": "/path/to/archive.zip", "dest_path": "/extract/here" }
    """
    if (err := _fe_guard()): return err

    data = request.get_json(silent=True) or {}
    user_path = data.get("path", "")
    dest_user = data.get("dest_path", "")

    if not user_path:
        return _error("Missing 'path'.", 400)
    
    # default dest to same folder if missing
    if not dest_user:
        dest_user = posixpath.dirname(user_path)

    try:
        vm_path, _ = _safe_path(user_path, config.MOUNT_POINT)
        vm_dest, _ = _safe_path(dest_user, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    try:
        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        ssh.extract_archive(vm_path, vm_dest)
        return jsonify({"status": "ok", "message": "Extraction complete."})
    except Exception as exc:
        return _error(f"Extraction failed: {exc}")



# ── GET /api/core/apps/export ─────────────────────────────────────────────────

@app.route("/api/core/apps/export", methods=["GET"])
def api_core_apps_export():
    """Export an installed app's APK from the Android image.

    Query params:
        path         (str): Path to the APK on the VM, e.g. "/system/app/YouTube/base.apk".
        package_name (str): Package name, used to name the downloaded file.
    """
    if (err := _fe_guard()): return err

    user_path    = request.args.get("path", "")
    package_name = request.args.get("package_name", "").strip()

    if not user_path:
        return _error("Missing 'path' query parameter.", 400)

    try:
        vm_path, _ = _safe_path(user_path, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    # Build a clean download filename
    safe_pkg = re.sub(r"[^\w.\-]", "_", package_name) if package_name else "app"
    download_name = f"{safe_pkg}.apk"

    tmp_path = tempfile.mktemp(suffix=".apk")

    try:
        ssh.download_file(vm_path, tmp_path)
        return send_file(
            tmp_path,
            as_attachment=True,
            download_name=download_name,
            mimetype="application/vnd.android.package-archive",
        )
    except Exception as exc:
        return _error(f"APK export failed: {exc}")


# ── GET /api/core/files/content ─────────────────────────────────────────────

@app.route("/api/core/files/content", methods=["GET"])
def api_core_files_get_content():
    """Read a file from the VM and return its text content (UTF-8).

    Query param:
        path (str): VM path relative to the mount point.

    Returns:
        { status, content, is_binary }
        is_binary=true means the file cannot be decoded as UTF-8 text.
    """
    if (err := _fe_guard()): return err

    user_path = request.args.get("path", "")
    if not user_path:
        return _error("Missing 'path' query parameter.", 400)

    try:
        vm_path, _ = _safe_path(user_path, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    try:
        result = ssh.get_file_content(vm_path)
        return jsonify({"status": "ok", **result})
    except ValueError as e:
        return _error(str(e), 413)    # 413 Request Entity Too Large
    except Exception as exc:
        return _error(f"Could not read file: {exc}")


# ── POST /api/core/files/content ─────────────────────────────────────────────

@app.route("/api/core/files/content", methods=["POST"])
def api_core_files_save_content():
    """Overwrite a text file on the VM with new UTF-8 content.

    JSON body:
        path    (str): VM path relative to the mount point.
        content (str): New file content (UTF-8 text).
    """
    if (err := _fe_guard()): return err

    body = request.get_json(silent=True) or {}
    user_path = body.get("path", "")
    content   = body.get("content")

    if not user_path:
        return _error("Missing 'path' in request body.", 400)
    if content is None:
        return _error("Missing 'content' in request body.", 400)

    try:
        vm_path, _ = _safe_path(user_path, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    try:
        ssh.save_file_content(vm_path, content)
        return jsonify({"status": "ok", "message": "File saved."})
    except Exception as exc:
        return _error(f"Could not save file: {exc}")


# ── GET /api/core/files/checksum ─────────────────────────────────────────────

@app.route("/api/core/files/move-batch", methods=["POST"])
def api_core_files_move_batch():
    """Batch move files/folders."""
    if (err := _fe_guard()): return err

    data = request.json or {}
    sources = data.get("sources", [])
    destination = data.get("destination", "")

    if not sources or not destination:
        return _error("Missing 'sources' list or 'destination' path", 400)

    try:
        # Check write access for destination (remount if needed)
        # We'll just try to remount /mnt/android rw anyway to be safe, or relies on system logic
        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        
        overwrite = data.get("overwrite", False)

        results = []
        errors = []
        conflicts = []

        # First pass: Check for conflicts
        if not overwrite:
            for src in sources:
                 # src is like /system/app/YouTuble
                 filename = posixpath.basename(src)
                 
                 # destination is like /system/priv-app (absolute)
                 if not destination.startswith(config.MOUNT_POINT):
                     vm_dest_root = f"{config.MOUNT_POINT}{destination}".replace("//", "/")
                 else:
                     vm_dest_root = destination
                 
                 vm_target = f"{vm_dest_root}/{filename}".replace("//", "/")
                 
                 check = ssh.execute_command(f"[ -e \"{vm_target}\" ] && echo YES || echo NO")
                 if check.strip() == "YES":
                      conflicts.append(filename)
            
            if conflicts:
                 return jsonify({
                     "status": "error",
                     "message": "Conflict detected",
                     "conflicts": conflicts
                 }), 409

        for src in sources:
            try:
                # src is like /system/app/YouTuble
                # destination is like /system/priv-app
                # verify paths
                vm_src, _ = _safe_path(src, config.MOUNT_POINT)
                
                # destination might be absolute from root or relative
                # Assuming destination is an absolute path on the android system (e.g. /system/app)
                # We need to prepend mount point if not present
                if not destination.startswith(config.MOUNT_POINT):
                     # If it starts with /, treat as Android root
                     # if destination = "/system/app", vm_dest = "/mnt/android/system/app"
                    vm_dest_root = f"{config.MOUNT_POINT}{destination}".replace("//", "/")
                else:
                    vm_dest_root = destination

                # Use core logic to move
                # We can reuse move_path logic or just mv
                # ssh.move_path expects (old_path, new_category_root_on_android)
                # But here we have full paths.
                # Let's use simple mv command to be generic
                
                # Check if src exists
                # Extract filename
                filename = os.path.basename(vm_src)
                vm_target = f"{vm_dest_root}/{filename}".replace("//", "/")
                
                logger.info(f"[BATCH-MOVE] {vm_src} -> {vm_target}")
                
                # Use rename_path logic which now supports metadata preservation (if we exposed it helpers)
                # simpler: just call ssh.rename_path if it's a rename? No, rename_path assumes same dir or specific args.
                # Let's reuse the mv command but add metadata support manually if overwrite is True
                
                if overwrite:
                     # Get target metadata if exists
                     meta = ssh.get_file_metadata(vm_target)
                     cmd = f'mv "{vm_src}" "{vm_target}"'
                     ssh.execute_command(cmd)
                     if meta: ssh.apply_file_metadata(vm_target, meta)
                else:
                     cmd = f'mv "{vm_src}" "{vm_target}"'
                     ssh.execute_command(cmd)
                
                results.append(src)
            except Exception as e:
                logger.error(f"[BATCH-MOVE] Error moving {src}: {e}")
                errors.append(f"{src}: {str(e)}")

        return jsonify({
            "status": "ok",
            "moved": results,
            "errors": errors
        })

    except Exception as exc:
        return _error(f"Batch move failed: {exc}")


@app.route("/api/core/apps/export-batch", methods=["POST"])
def api_core_apps_export_batch():
    """Batch export apps as a ZIP file.
    
    Input: { "files": [ { "path": "/path/to/apk_or_folder", "name": "Label" }, ... ] }
    """
    if (err := _fe_guard()): return err

    data = request.json or {}
    files = data.get("files", []) # List of { path, name }

    if not files:
        return _error("No files specified", 400)

    try:
        # Create a temp dir
        tmp_dir = tempfile.mkdtemp(prefix="zbe_export_")
        
        # We will create a zip file
        zip_filename = f"exported_apps_{int(time.time())}.zip"
        zip_path = os.path.join(tmp_dir, zip_filename)

        exported_count = 0
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for item in files:
                remote_path = item.get("path") # e.g. /mnt/android/system/app/YouTube/base.apk or dir
                name_label = item.get("name", "unknown")
                
                if not remote_path: continue
                
                # Check if it starts with mount point, if not assume it's missing it? 
                # The frontend sends `app.rawPath` which might be `/system/app/YouTube` (Android path)
                # or `/mnt/android/system/app/YouTube` if we changed logic.
                # The Task 1 update said we updated ssh_worker to return `path` without mount point? 
                # Wait, looking at `ssh_worker.py`:
                # `vm_abs_path = f"{subpath}/{clean_rel}"` -> `/system/app/YouTube/YouTube.apk`
                # So we need to prepend MOUNT_POINT
                
                if not remote_path.startswith(config.MOUNT_POINT):
                     vm_path = f"{config.MOUNT_POINT}{remote_path}".replace("//", "/")
                else:
                    vm_path = remote_path

                # Determine local filename
                # If it's an APK, we want `{name_label}.apk`
                # If name_label has no extension, add .apk
                safe_name = "".join(c for c in name_label if c.isalnum() or c in (' ', '.', '_', '-')).strip()
                if not safe_name.lower().endswith(".apk"):
                    safe_name += ".apk"
                
                local_file = os.path.join(tmp_dir, safe_name)
                
                try:
                    # Download
                    # Check if it is a directory or file?
                    # The scanner now returns path to .apk file, so it should be a file.
                    ssh.download_file(vm_path, local_file)
                    
                    # Add to zip
                    zipf.write(local_file, arcname=safe_name)
                    exported_count += 1
                except Exception as e:
                    logger.error(f"[BATCH-EXPORT] Failed to export {vm_path}: {e}")
        
        if exported_count == 0:
             shutil.rmtree(tmp_dir)
             return _error("Failed to export any files", 500)

        # Serve the zip file, then delete tmp_dir
        @after_this_request
        def cleanup(response):
            try:
                shutil.rmtree(tmp_dir)
            except Exception as e:
                logger.error(f"Cleanup failed: {e}")
            return response
            
        return send_file(
            zip_path,
            mimetype='application/zip',
            as_attachment=True,
            download_name=zip_filename
        )

    except Exception as exc:
        return _error(f"Batch export failed: {exc}")


# ── GET /api/core/files/search ───────────────────────────────────────────────

@app.route("/api/core/files/search", methods=["GET"])
def api_core_files_search():
    """Search for files in the remote system.

    Query params:
        path  (str): frontend-relative root path to search from (default '/')
        query (str): search term (filename glob/substring)
    """
    if (err := _fe_guard()): return err

    user_path = request.args.get("path", "/")
    query = request.args.get("query", "")

    if not query:
        return _error("Missing 'query'", 400)

    try:
        vm_path, display_path = _safe_path(user_path, config.MOUNT_POINT)
    except ValueError as e:
        return _error(str(e), 400)

    try:
        results = ssh.search_files(vm_path, query)
        
        # Post-process results to be frontend-friendly (relative paths)
        # ssh.search_files returns 'name' as full absolute path because of how ls is called
        clean_results = []
        for item in results:
            full_abs_path = item["name"]
            # Relativize to MOUNT_POINT to give a display path
            # If full_abs_path starts with config.MOUNT_POINT, strip it
            
            # Note: item["name"] from ssh.search_files might be just /mnt/android/path/to/file
            if full_abs_path.startswith(config.MOUNT_POINT):
                rel_path = full_abs_path[len(config.MOUNT_POINT):]
            else:
                rel_path = full_abs_path # fallback

            # Ensure leading slash for display
            if not rel_path.startswith("/"):
                rel_path = "/" + rel_path
                
            # Update name to be just basename for display in list?
            # Or keep full path? Frontend usually expects 'name' to be basename for current view
            # but for search results, we want to know where it is.
            # We can use 'name' as display name (rel_path) or stick to standard (basename) + extra 'path' field.
            # FileExplorer usually navigates.
            
            item["path"] = rel_path
            item["name"] = os.path.basename(rel_path)
            clean_results.append(item)
            
        return jsonify({"status": "ok", "results": clean_results})
    except Exception as exc:
        return _error(f"Search failed: {exc}")



# ---------------------------------------------------------------------------
qemu = QemuManager()
ssh = SSHWorker()
connection_lock = Lock()
# Emulator detection is handled by the plugin loader (backend/emulators/)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def _error(message: str, code: int = 500):
    logger.error(message)
    return jsonify({"status": "error", "message": message}), code

@app.errorhandler(CSRFError)
def handle_csrf_error(e):
    return jsonify({"status": "error", "message": "CSRF token missing or invalid."}), 403


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    full = os.path.join(app.static_folder, path)
    if path and os.path.isfile(full):
        return send_from_directory(app.static_folder, path)
    index = os.path.join(app.static_folder, "index.html")
    if os.path.isfile(index):
        return send_from_directory(app.static_folder, "index.html")
    return jsonify({"status": "ok", "message": "ZeroBloatEmulator API running"}), 200


# ===========================================================================
# SECURITY API
# ===========================================================================

@app.route("/api/security/csrf-token", methods=["GET"])
def api_csrf_token():
    """Return a fresh CSRF token for the frontend to use in headers."""
    token = generate_csrf()
    return jsonify({"csrf_token": token})


# ===========================================================================
# HEALTH CHECK
# ===========================================================================

@app.route("/api/health", methods=["GET"])
def api_health():
    """Simple liveness probe used by the frontend BackendContext."""
    return jsonify({"status": "ok"})


# ===========================================================================
# CORE (QEMU VM) LIFECYCLE APIs
# ===========================================================================

@app.route("/api/core/start", methods=["POST"])
def api_core_start():
    """
    Body: { 
      "base_path": "D:/LDPlayer",
      "emulator_type": "LDPLAYER",
      "version_id": "ld9" 
    }
    Spawns QEMU and returns the PID immediately (does NOT wait for SSH).
    """
    from backend.emulators.loader import get_strategy

    data = request.get_json(silent=True) or {}
    base_path = data.get("base_path")
    emu_type = data.get("emulator_type")
    version_id = data.get("version_id")

    if not base_path or not emu_type:
        return _error("Missing 'base_path' or 'emulator_type' in request body.", 400)

    # 1. Resolve strategy
    strategy = get_strategy(emu_type)
    if not strategy:
        return _error(f"Unknown emulator type: {emu_type}", 400)

    # 2. Resolve disk path
    ssh.set_emulator_type(emu_type)
    try:
        image_path = strategy.get_disk_path(base_path, version_id)
        logger.info("[CORE] Resolved disk path: %s", image_path)
    except Exception as exc:
        return _error(f"Failed to resolve disk path: {exc}")

    if not os.path.isfile(image_path):
        return _error(f"Image file not found: {image_path}", 400)

    # If core is already started, no need to start next
    if qemu.is_running:
        logger.info("[CORE] core already running (PID %d). Returning existing session.", qemu.pid)
        return jsonify({"status": "ok", "pid": qemu.pid})

    try:
        pid = qemu.start_service(target_path=image_path)
        logger.info("Service started. PID: %d", pid)
        return jsonify({"status": "ok", "pid": pid})
    except Exception as exc:
        return _error(f"Failed to start service: {exc}")


@app.route("/api/core/stop", methods=["POST"])
def api_core_stop():
    """Stop the QEMU VM and close the SSH connection."""
    try:
        ssh.close()
    except Exception:
        pass
    try:
        qemu.stop_service()
    except Exception as exc:
        return _error(f"Failed to stop service: {exc}")
    return jsonify({"status": "ok", "message": "Service stopped."})


@app.route("/api/core/status", methods=["GET"])
def api_core_status():
    """
    Returns one of:
      { "status": "stopped" }   – QEMU process is dead
      { "status": "starting" }  – QEMU alive but SSH health check fails
      { "status": "running" }   – QEMU alive AND SSH health check passes
    """
    if not qemu.is_running:
        return jsonify({"status": "stopped", "pid": None})

    pid = qemu.pid
    
    # Check if we have an active persistent connection
    if ssh._client is None:
        # Prevent concurrent connection attempts
        if connection_lock.acquire(blocking=False):
            try:
                # Double-check inside lock
                if ssh._client is None:
                    ssh.connect()
                    ssh.mount_target()
                    logger.info("[CORE] Core connection established and disk mounted.")
            except Exception as exc:
                # Fallback to health check to see if it's at least booting
                logger.debug("[CORE] status check connection failed: %s", exc)
            finally:
                connection_lock.release()
        else:
            # Another request is already trying to connect; just return 'starting' for now
            return jsonify({"status": "starting", "pid": pid})

    if ssh._client is not None:
        return jsonify({
            "status": "running", 
            "pid": pid,
            "is_android_mounted": ssh.is_android_mounted
        })

    # If no persistent connection, check if it's reachable at all
    healthy = ssh.check_health()
    if healthy:
        # It's reachable but we failed to connect persistently/mount above.
        # Report running so frontend might retry scanning, which will trigger connect attempt.
        return jsonify({"status": "running", "pid": pid})
    else:
        return jsonify({"status": "starting", "pid": pid})


# ===========================================================================
# LOGS API
# ===========================================================================

@app.route("/api/logs", methods=["GET"])
def api_logs():
    """Return the last 50 lines of backend/logs/app.log."""
    n = request.args.get("n", 50, type=int)
    lines = read_log_tail(n)
    return jsonify({"status": "ok", "logs": lines})


@app.route("/api/logs/clear", methods=["POST"])
def api_logs_clear():
    """Clear the backend log file."""
    if clear_logs():
        return jsonify({"status": "ok", "message": "Log cleared."})
    else:
        return _error("Failed to clear log file.", 500)


# ===========================================================================
# SYSTEM / FILE-BROWSER APIs
# ===========================================================================

@app.route("/api/system/drives", methods=["GET"])
def api_drives():
    import psutil
    try:
        partitions = psutil.disk_partitions(all=False)
        drives = [p.mountpoint.replace("\\", "/") for p in partitions]
        return jsonify({"status": "ok", "drives": drives})
    except Exception as exc:
        return _error(f"Failed to list drives: {exc}")


@app.route("/api/system/validate-path", methods=["POST"])
def api_validate_path():
    """
    Check if a directory exists on the server filesystem.
    Body: { "path": "D:/Games/LDPlayer" }
    Returns: { "exists": true/false }
    """
    data = request.get_json(silent=True) or {}
    path = data.get("path", "")
    if not path:
        return jsonify({"exists": False})
    
    path = os.path.normpath(path)
    return jsonify({"exists": os.path.isdir(path)})


@app.route("/api/system/folders", methods=["POST"])
def api_folders():
    data = request.get_json(silent=True) or {}
    path = data.get("path", "")
    if not path:
        return _error("Missing 'path' in request body.", 400)
    path = os.path.normpath(path)
    if not os.path.isdir(path):
        return _error(f"Path is not a directory: {path}", 400)

    entries = []
    try:
        for entry in sorted(os.scandir(path), key=lambda e: e.name.lower()):
            try:
                name = entry.name
                if entry.is_dir(follow_symlinks=False):
                    entries.append({"name": name, "type": "dir"})
                elif name.lower().endswith(".lnk"):
                    entries.append({"name": name, "type": "lnk"})
            except PermissionError:
                pass
    except PermissionError:
        return jsonify({
            "error": True,
            "code": "PERMISSION_DENIED",
            "message": f"Access denied to: {path}",
        }), 403

    # Keep backward-compat: also return flat 'folders' list
    folders = [e["name"] for e in entries if e["type"] == "dir"]
    return jsonify({"status": "ok", "path": path, "folders": folders, "entries": entries})





@app.route("/api/system/desktop", methods=["GET"])
def api_desktop():
    """Return the current user's Desktop path."""
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    desktop = os.path.normpath(desktop)
    if not os.path.isdir(desktop):
        # OneDrive-redirected Desktop fallback
        onedrive = os.environ.get("OneDrive", "")
        alt = os.path.join(onedrive, "Desktop") if onedrive else ""
        if alt and os.path.isdir(alt):
            desktop = os.path.normpath(alt)
        else:
            return _error("Desktop folder not found.", 404)
    return jsonify({"status": "ok", "path": desktop})


@app.route("/api/system/resolve", methods=["POST"])
def api_resolve():
    """
    Resolve a Windows .lnk shortcut to its target path.
    Body: { "path": "C:/Users/.../LDPlayer.lnk" }
    Returns: { "target": "D:/Program Files/LDPlayer" }
    """
    data = request.get_json(silent=True) or {}
    lnk_path = data.get("path", "")
    if not lnk_path:
        return _error("Missing 'path' in request body.", 400)
    try:
        target = resolve_shortcut(lnk_path)
        return jsonify({"status": "ok", "target": target})
    except ValueError as exc:
        return _error(str(exc), 400)
    except Exception as exc:
        return _error(f"Failed to resolve shortcut: {exc}")


@app.route("/api/system/elevate", methods=["POST"])
def api_elevate():
    """
    Trigger UAC elevation: re-launch the process as Administrator.
    The server will exit immediately after ShellExecuteW, so the client
    should expect the connection to drop (BackendContext handles reconnect).
    """
    if is_admin():
        return jsonify({"status": "ok", "message": "Already running as Administrator."})
    try:
        logger.info("Elevation requested – restarting as Administrator…")
        restart_as_admin()   # calls sys.exit(0) internally
    except RuntimeError as exc:
        # User cancelled UAC prompt
        return _error(f"Elevation cancelled or failed: {exc}", 403)
    # Never reached (sys.exit called above), but Flask needs a return
    return jsonify({"status": "ok"})


# ===========================================================================
# EMULATOR DETECTION API
# ===========================================================================

@app.route("/api/detect", methods=["POST"])
def api_detect():
    data = request.get_json(silent=True) or {}
    path = data.get("path", "")
    if not path:
        return _error("Missing 'path' in request body.", 400)
    path = os.path.normpath(path)
    if not os.path.isdir(path):
        return _error(f"Path does not exist or is not a directory: {path}", 400)
    try:
        result = detect_emulator(path)
        result["base_path"] = path
        return jsonify({"status": "ok", "result": result})
    except Exception as exc:
        return _error(f"Detection failed: {exc}")


# ===========================================================================
# VM / SSH APIs (legacy – kept for backward compat)
# ===========================================================================

@app.route("/api/connect", methods=["POST"])
def api_connect():
    data = request.get_json(silent=True) or {}
    filepath = data.get("filepath")
    if not filepath:
        return _error("Missing 'filepath' in request body.", 400)
    filepath = os.path.normpath(filepath)
    if not os.path.isfile(filepath):
        return _error(f"File not found: {filepath}", 400)

    if qemu.is_running:
        try:
            ssh.close()
        except Exception:
            pass
        qemu.stop_service()

    try:
        pid = qemu.start_service(target_path=filepath)
    except Exception as exc:
        return _error(f"Failed to start Core: {exc}")

    try:
        ssh.wait_for_connection(timeout=60)
    except TimeoutError as exc:
        qemu.stop_service()
        return _error(f"SSH connection timed out: {exc}")
    except Exception as exc:
        qemu.stop_service()
        return _error(f"SSH error: {exc}")

    try:
        mounted_device = ssh.mount_target()
    except Exception as exc:
        ssh.close()
        qemu.stop_service()
        return _error(f"Failed to mount target disk: {exc}")

    try:
        partitions_raw = ssh.execute_command(
            "lsblk -rno NAME,SIZE,TYPE /dev/vdb 2>/dev/null || "
            "lsblk -rno NAME,SIZE,TYPE /dev/sdb 2>/dev/null || echo ''"
        )
        partitions = [line.split() for line in partitions_raw.splitlines() if line.strip()]
    except Exception:
        partitions = []

    return jsonify({
        "status": "connected",
        "pid": pid,
        "mounted_device": mounted_device,
        "partitions": partitions,
    })


@app.route("/api/apps", methods=["GET"])
def api_apps():
    if not qemu.is_running:
        return _error("No VM is running. Call /api/connect first.", 400)
    
    # Ensure connection
    if ssh._client is None:
        try:
            ssh.connect()
            ssh.mount_target()
        except Exception as exc:
             return _error(f"Failed to connect/mount: {exc}")

    try:
        skip = request.args.get("skip_packages", "false").lower() == "true"
        bloatware_data = ssh.list_bloatware(skip_packages=skip)
    except Exception as exc:
        return _error(f"Failed to list apps: {exc}")
    
    return jsonify({
        "status": "ok", 
        "apps": bloatware_data["apps"],
        "category_roots": bloatware_data["category_roots"]
    })


@app.route("/api/apps/rename", methods=["POST"])
def api_apps_rename():
    if not qemu.is_running:
        return _error("No VM is running. Call /api/connect first.", 400)
    data = request.get_json(silent=True) or {}
    old_path = data.get("path")
    new_name = data.get("new_name")
    
    if not old_path or not new_name:
        return _error("Missing 'path' or 'new_name' in request body.", 400)
    
    try:
        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        new_relative_path = ssh.rename_path(old_path, new_name)
        return jsonify({
            "status": "ok", 
            "message": "Renamed successfully.",
            "new_path": new_relative_path
        })
    except Exception as exc:
        return _error(f"Rename failed: {exc}", 500)


@app.route("/api/apps/move", methods=["POST"])
def api_apps_move():
    if not qemu.is_running:
        return _error("No VM is running. Call /api/connect first.", 400)
    data = request.get_json(silent=True) or {}
    old_path = data.get("path")
    new_category_root = data.get("new_category_root")
    
    if not old_path or not new_category_root:
        return _error("Missing 'path' or 'new_category_root' in request body.", 400)
    
    try:
        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        new_relative_path = ssh.move_path(old_path, new_category_root)
        return jsonify({
            "status": "ok", 
            "message": "Moved successfully.",
            "new_path": new_relative_path
        })
    except Exception as exc:
        return _error(f"Move failed: {exc}", 500)


@app.route("/api/delete", methods=["POST"])
def api_delete():
    if not qemu.is_running:
        return _error("No VM is running. Call /api/connect first.", 400)
    data = request.get_json(silent=True) or {}
    paths: list = data.get("paths", [])
    if not paths:
        return _error("Missing or empty 'paths' list in request body.", 400)
    for p in paths:
        if not p.startswith("/mnt/android/"):
            return _error(f"Unsafe path rejected: {p}", 400)

    results = {}
    errors = {}
    try:
        ssh.execute_command("mount -o remount,rw /mnt/android 2>&1 || true")
        for p in paths:
            try:
                out = ssh.execute_command(f"rm -rf {p!r} 2>&1")
                results[p] = out or "deleted"
                display_path = p.replace("/mnt/android", "")
                logger.info("[DEBLOAT] Deleted: %s", display_path)
            except Exception as exc:
                errors[p] = str(exc)
                logger.error("Failed to delete %s: %s", p, exc)
        ssh.execute_command("mount -o remount,ro /mnt/android 2>&1 || true")
    except Exception as exc:
        return _error(f"Delete operation failed: {exc}")

    response = {"status": "ok", "deleted": results}
    if errors:
        response["errors"] = errors
    return jsonify(response)


@app.route("/api/disconnect", methods=["POST"])
def api_disconnect():
    if not qemu.is_running:
        return jsonify({"status": "ok", "message": "No VM was running."})
    try:
        ssh.execute_command("umount /mnt/android 2>/dev/null || true")
    except Exception:
        pass
    try:
        ssh.close()
    except Exception:
        pass
    try:
        qemu.stop_service()
    except Exception as exc:
        return _error(f"Failed to stop VM: {exc}")
    return jsonify({"status": "ok", "message": "VM stopped."})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
# (check_recovery removed - logic moved to vm_manager.py)


if __name__ == "__main__":
    # Ensure assets (Core, Worker) are present
    bootstrap.initialize()

    # Attempt to recover legacy session in background
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        import threading
        threading.Thread(target=qemu.reconnect_session, args=(ssh,), daemon=True).start()

    logger.info("ZeroBloatEmulator backend starting on http://0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
