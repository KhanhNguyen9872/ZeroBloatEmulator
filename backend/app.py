"""
backend/app.py – ZeroBloatEmulator Flask API (v4 – Core Lifecycle)
Run from the project root:  python backend/app.py
"""

import os
import sys

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect, generate_csrf, CSRFError
from flask_talisman import Talisman

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Import config (ensure backend/config.py exists and has SECRET_KEY)
import backend.config as config

from backend.utils.logger import get_logger, read_log_tail
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
# Singletons
# ---------------------------------------------------------------------------
qemu = QemuManager()
ssh = SSHWorker()
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
    Body: { "image_path": "C:/path/to/system.img" }
    Spawns QEMU and returns the PID immediately (does NOT wait for SSH).
    """
    data = request.get_json(silent=True) or {}
    image_path = data.get("image_path")

    if not image_path:
        return _error("Missing 'image_path' in request body.", 400)

    image_path = os.path.normpath(image_path)

    if not os.path.isfile(image_path):
        return _error(f"Image file not found: {image_path}", 400)

    # Stop any previous session first
    if qemu.is_running:
        logger.info("Stopping previous VM before starting a new one…")
        try:
            ssh.close()
        except Exception:
            pass
        qemu.stop_service()

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
    healthy = ssh.check_health()

    if healthy:
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


@app.route("/api/system/admin-status", methods=["GET"])
def api_admin_status():
    """Return whether the backend process is running as Administrator."""
    return jsonify({"is_admin": is_admin()})


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
        return _error(f"Failed to start QEMU: {exc}")

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
    try:
        bloatware = ssh.list_bloatware()
    except Exception as exc:
        return _error(f"Failed to list apps: {exc}")
    return jsonify({"status": "ok", "apps": bloatware})


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
                logger.info("Deleted: %s", p)
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
if __name__ == "__main__":
    # Ensure assets (QEMU, Worker) are present
    bootstrap.initialize()

    logger.info("ZeroBloatEmulator backend starting on http://0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
