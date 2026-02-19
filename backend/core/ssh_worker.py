import os
from datetime import datetime
import paramiko
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from backend.utils.logger import get_logger
from backend import config as cfg

logger = get_logger(__name__)

# Sentinel string used by check_health()
_HEALTH_SENTINEL = "KhanhNguyen9872"


class SSHWorker:
    """Thin SSH wrapper around the Alpine Linux worker VM."""

    def __init__(self):
        self._client: paramiko.SSHClient | None = None
        self.emulator_type: str | None = None
        self.is_android_mounted: bool = False

    def set_emulator_type(self, emu_type: str) -> None:
        """Set the emulator type (e.g., 'LDPLAYER', 'MEMU') for adaptive logic."""
        self.emulator_type = emu_type

    # ── Connection ────────────────────────────────────────────────────────

    def connect(self) -> None:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=cfg.SSH_HOST,
            port=cfg.SSH_PORT,
            username=cfg.SSH_USER,
            password=cfg.SSH_PASS,
            timeout=15,
            banner_timeout=30,
            auth_timeout=15,
            look_for_keys=False,
            allow_agent=False,
        )
        self._client = client
        logger.info("[CORE] Core connected")

    def wait_for_connection(self, timeout: int = 30) -> None:
        """Poll until SSH is reachable or *timeout* seconds elapse."""
        deadline = time.monotonic() + timeout
        attempt = 0

        while time.monotonic() < deadline:
            attempt += 1
            remaining = deadline - time.monotonic()
            logger.debug("SSH attempt %d (%.0f s remaining)…", attempt, remaining)

            try:
                with socket.create_connection((cfg.SSH_HOST, cfg.SSH_PORT), timeout=2):
                    pass
            except OSError:
                time.sleep(2)
                continue

            try:
                self.connect()
                logger.info("[CORE] Core ready.")
                return
            except (paramiko.AuthenticationException, paramiko.SSHException, OSError) as exc:
                logger.debug("SSH not ready yet: %s", exc)
                time.sleep(2)

        raise TimeoutError(f"Could not connect to VM via SSH within {timeout} seconds.")

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
            logger.info("[CORE] Core disconnected.")

    # ── Health check ──────────────────────────────────────────────────────

    def check_health(self) -> bool:
        """
        Quick liveness probe.

        Opens a *fresh* SSH connection with a 2-second timeout, runs
        ``echo 'KhanhNguyen9872'``, and returns True only if the output
        matches exactly.  Any connection or execution error returns False.
        The probe connection is always closed before returning.
        """
        probe: paramiko.SSHClient | None = None
        try:
            probe = paramiko.SSHClient()
            probe.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            probe.connect(
                hostname=cfg.SSH_HOST,
                port=cfg.SSH_PORT,
                username=cfg.SSH_USER,
                password=cfg.SSH_PASS,
                timeout=2,
                banner_timeout=5,
                auth_timeout=3,
                look_for_keys=False,
                allow_agent=False,
            )
            _, stdout, _ = probe.exec_command(f"echo '{_HEALTH_SENTINEL}'", timeout=3)
            output = stdout.read().decode(errors="replace").strip()
            return output == _HEALTH_SENTINEL
        except (OSError, Exception) as exc:
            # WinError 10038 can happen if socket is closed unexpectedly during handshake
            logger.debug("Health check failed (likely booting): %s", exc)
            return False
        finally:
            if probe is not None:
                try:
                    probe.close()
                except Exception:
                    pass

    # ── Command execution ─────────────────────────────────────────────────

    def execute_command(self, cmd: str) -> str:
        if self._client is None:
            raise RuntimeError("Not connected. Call connect() or wait_for_connection() first.")

        logger.debug("Executing: %s", cmd)
        _, stdout, stderr = self._client.exec_command(cmd, timeout=30)
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        
        if err.strip():
            # Hide raw command and technical details
            if "ls" in cmd and "app" in cmd:
                logger.error("[CORE] Could not locate APK directory on current partition.")
            else:
                logger.error("[CORE] System operation failed.")
            
        return (out + err).strip()

    # ── Disk operations ───────────────────────────────────────────────────

    def mount_target(self) -> str:
        self.execute_command(f"mkdir -p {cfg.MOUNT_POINT}")
        self.execute_command(f"umount {cfg.MOUNT_POINT} 2>/dev/null || true")

        # Intelligent Selection Strategy
        candidate_device = None

        # Strategy 1: LDPlayer specific (usually vdb2 is the system/data partition on Android 5.1/7.1/9.1)
        if self.emulator_type == "LDPLAYER":
            try:
                # Check if vdb2 exists - use lsblk -d to check specifically for that block device
                check = self.execute_command("lsblk -d -n -o NAME /dev/vdb2 2>/dev/null && echo YES || echo NO")
                if check.strip() == "YES":
                    logger.info("[CORE] Detected LDPlayer: prioritizing /dev/vdb2 (System/Data)")
                    candidate_device = "/dev/vdb2"
            except Exception as exc:
                logger.warning("[CORE] LDPlayer strategy failed to check vdb2: %s", exc)

        # Strategy 2: Largest Partition (General Fallback)
        if not candidate_device:
            try:
                # List partitions on vdb (or sdb) in raw format to avoid tree characters
                raw = self.execute_command(
                    "lsblk -rn -b -o NAME,SIZE,TYPE /dev/vdb 2>/dev/null || "
                    "lsblk -rn -b -o NAME,SIZE,TYPE /dev/sdb 2>/dev/null"
                )
                
                best_part = None
                max_size = -1

                for line in raw.splitlines():
                    parts = line.split()
                    if len(parts) >= 3 and parts[2] == "part":
                        # Raw format 'vdb2 2684354560 part' - parts[0] is clean
                        name = parts[0]
                        try:
                            size = int(parts[1])
                            if size > max_size:
                                max_size = size
                                best_part = name
                        except ValueError:
                            continue
                
                if best_part:
                    if not best_part.startswith("/"):
                        candidate_device = f"/dev/{best_part}"
                    else:
                        candidate_device = best_part
                    logger.info(
                        "[CORE] Default strategy: Selecting largest partition %s (%.2f GB)",
                        candidate_device, max_size / (1024**3)
                    )

            except Exception as exc:
                 logger.warning("[CORE] define_largest_partition strategy failed: %s", exc)

        # 3. Execution & Verification / Fallback Loop
        # If we have a smart candidate, try it first.
        # If it fails, fall back to the config list.

        candidates = []
        if candidate_device:
             candidates.append(candidate_device)
        
        # Add default candidates as fallback (avoid duplicates)
        for cand in cfg.DRIVE1_CANDIDATES:
            if cand != candidate_device:
                candidates.append(cand)

        for device in candidates:
            logger.info("Trying to mount %s → %s …", device, cfg.MOUNT_POINT)
            self.execute_command(f"mount -t ext4 -o rw,noatime {device} {cfg.MOUNT_POINT} 2>&1")
            
            # Verify mount success
            check = self.execute_command(f"mountpoint -q {cfg.MOUNT_POINT} && echo OK || echo FAIL")
            if check.strip() == "OK":
                # Clean up device name (remove symbols like └─ or ├─)
                clean_device = device.replace('└─', '').replace('├─', '').replace('─', '').replace('│', '').replace(' ', '')
                logger.info("[CORE] Partition %s mounted", clean_device)
                
                # Post-mount verification (check for Android folders)
                check_fs = self.execute_command(f"ls {cfg.MOUNT_POINT}/app || ls {cfg.MOUNT_POINT}/system 2>/dev/null && echo CHECK_OK || echo CHECK_FAIL")
                if "CHECK_FAIL" in check_fs:
                     # Abstracted warning
                     logger.warning("[CORE] Warning: Mounted partition %s does not appear to contain Android system files.", clean_device)
                     self.is_android_mounted = False
                else:
                     self.is_android_mounted = True

                return device
            
            # logger.debug("[CORE] Could not mount %s", device)

        raise RuntimeError(
            f"Failed to mount any of {candidates} at {cfg.MOUNT_POINT}."
        )

    def list_bloatware(self, skip_packages: bool = False) -> dict[str, list[dict]]:
        result: dict[str, list[dict]] = {
            "app": [], "priv-app": [],
            "vendor-app": [], "vendor-priv-app": [],
            "product-app": [], "product-priv-app": []
        }
        
        candidates = [
            ("user-app", "/data/app"),
            ("app", "/app"),
            ("app", "/system/app"),
            ("priv-app", "/priv-app"),
            ("priv-app", "/system/priv-app"),
            ("vendor-app", "/vendor/app"),
            ("vendor-priv-app", "/vendor/priv-app"),
            ("product-app", "/product/app"),
            ("product-priv-app", "/product/priv-app"),
            ("product-app", "/system/product/app"),
            ("product-priv-app", "/system/product/priv-app"),
            ("vendor-app", "/system/vendor/app"),
            ("vendor-priv-app", "/system/vendor/priv-app"),
        ]

        logger.info("[DEBLOAT] Starting APK scan (skip_packages=%s)...", skip_packages)

        if not skip_packages:
            try:
                from pyaxmlparser import APK
            except ImportError:
                 logger.error("pyaxmlparser not installed.")

        # Return detected roots as well
        category_roots = {}
        found_packages = set()

        for category, subpath in candidates:
            base_path = f"{cfg.MOUNT_POINT}{subpath}"
            
            # Check if directory exists
            check = self.execute_command(f"[ -d {base_path} ] && echo YES || echo NO")
            if check.strip() != "YES":
                continue
            
            # Found a valid root for this category
            if category not in category_roots:
                category_roots[category] = subpath

            # Find all APKs: /mnt/android/system/app/YouTube/YouTube.apk
            # Output format: ./YouTube/YouTube.apk
            raw_find = self.execute_command(f"cd {base_path} && find . -type f -name '*.apk' -maxdepth 3")
            
            apk_files = [line.strip() for line in raw_find.splitlines() if line.strip().endswith(".apk")]
            
            # Helper to open SFTP once
            sftp_size = None
            try:
                sftp_size = self._client.open_sftp()
            except Exception:
                pass

            for apk_rel_path in apk_files:
                # apk_rel_path: ./YouTube/YouTube.apk or ./Calculator.apk
                # Full path on VM
                full_path = f"{base_path}/{apk_rel_path.lstrip('./')}"
                
                # Frontend path (relative to mount point, e.g. /system/app/YouTube/YouTube.apk)
                # Ensure it starts with /
                clean_rel = apk_rel_path.lstrip("./")
                vm_abs_path = f"{subpath}/{clean_rel}".replace("//", "/")
                
                # Get file size and time
                size_bytes = None
                mod_time = None
                if sftp_size:
                    try:
                        attr = sftp_size.stat(full_path)
                        size_bytes = attr.st_size
                        # Convert timestamp to YYYY-MM-DD HH:MM:SS
                        if attr.st_mtime:
                             mod_time = datetime.fromtimestamp(attr.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                    except: pass
                
                # Package Name parsing
                pkg_name = None
                if not skip_packages:
                    pkg_name = self._fetch_package_name(full_path)
                
                apk_filename = os.path.basename(full_path)
                display_name = apk_filename
                
                # If pkg_name is missing, try to use folder name or filename
                # If pkg_name is missing, try to use folder name or filename
                if not pkg_name:
                    pkg_name = apk_filename.replace(".apk", "")
                
                # Deduplication: If we already found this package, skip it
                if pkg_name in found_packages:
                    continue
                found_packages.add(pkg_name)

                label = pkg_name # Default label
                
                item = {
                    "name": label,             # Label in UI (usually package name or filename)
                    "package": pkg_name,   # Distinct field
                    "path": vm_abs_path,       # Actual path to the APK
                    "apkFilename": apk_filename,
                    "category": category,
                    "size": size_bytes,
                    "time": mod_time,
                }
                
                # Ensure category exists in result if it's a new one like 'user-app'
                if category not in result:
                     result[category] = []
                result[category].append(item)

            if sftp_size: sftp_size.close()

        # Sort
        for k in result:
            result[k].sort(key=lambda x: x['name'].lower())

        return {"apps": result, "category_roots": category_roots}

    def get_file_metadata(self, path: str) -> dict | None:
        """
        Get ownership and permissions of a file. 
        Returns dict with 'mode', 'uid', 'gid' or None if not found/error.
        """
        try:
            # stat -c '%a %u %g' path
            # %a = octal mode (e.g. 644), %u = uid, %g = gid
            cmd = f"stat -c '%a %u %g' \"{path}\""
            logger.info(f"[CORE] {cmd}")
            out = self.execute_command(cmd)
            parts = out.split()
            if len(parts) == 3:
                return {"mode": parts[0], "uid": parts[1], "gid": parts[2]}
        except Exception as e:
            logger.debug(f"[CORE] Failed to get metadata for {path}: {e}")
        return None

    def apply_file_metadata(self, path: str, metadata: dict) -> None:
        """
        Apply ownership and permissions to a file.
        """
        try:
            if not metadata: return
            mode = metadata.get("mode")
            uid = metadata.get("uid")
            gid = metadata.get("gid")
            
            if uid and gid:
                self.execute_command(f"chown {uid}:{gid} \"{path}\"")
            if mode:
                self.execute_command(f"chmod {mode} \"{path}\"")
            logger.info(f"[CORE] Restored metadata {mode} {uid}:{gid} on {path}")
        except Exception as e:
            logger.warning(f"[CORE] Failed to apply metadata to {path}: {e}")



    def rename_path(self, old_path: str, new_name: str, preserve_metadata: bool = False) -> str:
        """
        Rename/Move a folder or file within the mounted Android system.
        Input path is absolute within the Android root (e.g. /system/app/YouTube).
        Returns the new absolute path within Android root.
        """
        if not old_path.startswith("/"):
             old_path = "/" + old_path
        
        # Calculate new path
        parent = os.path.dirname(old_path).replace("\\", "/")
        new_path = f"{parent}/{new_name}".replace("//", "/")
        
        # MicroVM path (prefixed with mount point)
        vm_old = f"{cfg.MOUNT_POINT}{old_path}".replace("//", "/")
        vm_new = f"{cfg.MOUNT_POINT}{new_path}".replace("//", "/")
        
        metadata = None
        if preserve_metadata:
             metadata = self.get_file_metadata(vm_new)

        logger.info("[CORE] Renaming %s -> %s", vm_old, vm_new)
        # Use quotes for paths with spaces
        cmd = f"mv \"{vm_old}\" \"{vm_new}\""
        self.execute_command(cmd)

        if metadata:
             self.apply_file_metadata(vm_new, metadata)

        return new_path

    def move_path(self, old_path: str, new_category_root: str, preserve_metadata: bool = False) -> str:
        """
        Move a folder or file to a new category root.
        e.g. move /system/app/YouTube to /system/priv-app
        Returns the new absolute path within Android root.
        """
        if not old_path.startswith("/"):
             old_path = "/" + old_path
        
        filename = os.path.basename(old_path)
        new_path = f"{new_category_root}/{filename}".replace("//", "/")
        
        # MicroVM paths
        vm_old = f"{cfg.MOUNT_POINT}{old_path}".replace("//", "/")
        vm_new = f"{cfg.MOUNT_POINT}{new_path}".replace("//", "/")
        
        metadata = None
        if preserve_metadata:
             metadata = self.get_file_metadata(vm_new)
        
        logger.info("[CORE] Moving %s -> %s", vm_old, vm_new)
        # Use quotes for paths with spaces
        cmd = f"mv \"{vm_old}\" \"{vm_new}\""
        self.execute_command(cmd)

        if metadata:
             self.apply_file_metadata(vm_new, metadata)

        return new_path

    def _fetch_package_name(self, remote_apk_path: str) -> str | None:
        """
        Download the APK (or header) and parse using pyaxmlparser.
        """
        import tempfile
        import warnings
        
        # Suppress pyaxmlparser spammy warnings
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=UserWarning, module="pyaxmlparser")
            try:
                from pyaxmlparser import APK
            except ImportError:
                 return None

            local_tmp = tempfile.mktemp(suffix=".apk")
            try:
                # Transfer the file. 
                # Optimization: Try to read first 20KB? No, AXML is often compressed or at end.
                # Local QEMU transfer is fast (100MB/s+). Just SCP it.
                ftp = self._client.open_sftp()
                try:
                    # Check size first. If > 50MB, maybe skip or warn?
                    attr = ftp.stat(remote_apk_path)
                    if attr.st_size > 100 * 1024 * 1024:  # 100MB limit
                        display_path = remote_apk_path.replace(cfg.MOUNT_POINT, "")
                        logger.warning(f"Skipping parsing large APK: {display_path} ({attr.st_size} bytes)")
                        return None
                    
                    ftp.get(remote_apk_path, local_tmp)
                finally:
                    ftp.close()
                    
                apk = APK(local_tmp)
                return apk.package
            except Exception as e:
                # logger.debug(f"Failed to parse APK {remote_apk_path}: {e}")
                return None
            finally:
                if os.path.exists(local_tmp):
                    try: os.remove(local_tmp)
                    except: pass

    def _list_bloatware_legacy(self, candidates) -> dict[str, list[dict]]:
        """Fallback to old directory listing method."""
        result = {k: [] for k, _ in candidates} # Initialize list
        # ... (simplified legacy logic, adapting to new dict structure) ...
        # Since we changed return type to list[dict], we need to adapt legacy strings
        for category, subpath in candidates:
            path = f"{cfg.MOUNT_POINT}{subpath}"
            exists = self.execute_command(f"[ -d {path} ] && echo YES || echo NO")
            if exists.strip() != "YES": continue
            raw = self.execute_command(f"ls -F {path}")
            folders = [e.rstrip("/") for e in raw.splitlines() if e.endswith("/")]
            for f in folders:
                result[category].append({
                    "name": f,
                    "path": f"{subpath}/{f}",
                    "package": None,
                    "category": category,
                    "size": None,
                })
        return result

    # ── File Explorer operations ──────────────────────────────────────────────

    def list_remote_directory(self, vm_path: str) -> list[dict]:
        """
        List files and directories at *vm_path* on the worker VM.

        Uses ``ls -lan --full-time`` which produces a stable 9-column format
        on both Alpine/Busybox and standard GNU coreutils:

            drwx------ 2 0 0 4096 2026-02-18 19:05:38 +0700 dirname
            -rw-r--r-- 1 0 0 1234 2026-02-18 19:05:38 +0700 file.txt

        Column layout:
            0:perms  1:links  2:uid  3:gid  4:size
            5:date   6:time   7:tz-offset  8+:name

        Returns a list of dicts:
            [{ "name": str, "type": "dir"|"file", "size": int,
               "modified": str, "permissions": str }, ...]
        """
        cmd = f'ls -lan --full-time "{vm_path}" 2>&1'
        raw = self.execute_command(cmd)

        # Log raw output for debugging
        logger.debug("[list_remote_directory] raw stdout for %s:\n%s", vm_path, raw)

        entries = []
        for line in raw.splitlines():
            line = line.strip()

            # Skip empty lines, totals line, and error messages
            if not line or line.startswith("total ") or line.startswith("ls:"):
                continue

            parts = line.split()
            if len(parts) < 9:
                # Fallback: try older ls format perms links user group size date time name
                # (name at index 7, no tz column)
                if len(parts) >= 8:
                    perms = parts[0]
                    try:
                        size = int(parts[4])
                    except ValueError:
                        size = 0
                    modified = f"{parts[5]} {parts[6]}"
                    name = " ".join(parts[7:])
                    ftype = "dir" if perms.startswith("d") else "file"
                    if name not in (".", ".."):
                        entries.append({
                            "name": name.split(" -> ")[0],
                            "type": ftype,
                            "size": size,
                            "modified": modified,
                            "permissions": perms,
                        })
                continue

            perms = parts[0]
            # size is at index 4
            try:
                size = int(parts[4])
            except ValueError:
                size = 0

            # date + time form the modification timestamp; tz offset at [7]
            modified = f"{parts[5]} {parts[6]}"  # "2026-02-18 19:05:38"

            # name starts at index 8 (after tz-offset at index 7)
            name = " ".join(parts[8:])

            # Skip . and ..
            if name in (".", ".."):
                continue

            # Strip symlink target ("name -> target")
            if " -> " in name:
                name = name.split(" -> ")[0].rstrip()

            ftype = "dir" if perms.startswith("d") else "file"

            entries.append({
                "name":        name,
                "type":        ftype,
                "size":        size,
                "modified":    modified,
                "permissions": perms,
            })

        # Directories first, then alphabetical
        entries.sort(key=lambda x: (x["type"] != "dir", x["name"].lower()))
        return entries

    def create_folder(self, vm_path: str) -> None:
        """Create a directory (and parents) at *vm_path* on the worker VM."""
        logger.info("[FileExplorer] mkdir -p %s", vm_path)
        self.execute_command(f"mkdir -p {vm_path!r}")

    def delete_item(self, vm_path: str) -> None:
        """Delete a file or directory (recursively) at *vm_path* on the worker VM."""
        logger.info("[FileExplorer] rm -rf %s", vm_path)
        self.execute_command(f"rm -rf {vm_path!r} 2>&1")

    def rename_item(self, old_vm_path: str, new_vm_path: str) -> None:
        """Rename/move an item from *old_vm_path* to *new_vm_path* on the worker VM."""
        logger.info("[FileExplorer] mv %s -> %s", old_vm_path, new_vm_path)
        cmd = f'mv "{old_vm_path}" "{new_vm_path}"'
        self.execute_command(cmd)

    def upload_file(self, local_path: str, remote_path: str, preserve_metadata: bool = False) -> None:
        """
        [FIXED] Single upload function for both Bloatware and File Explorer.
        Uploads a file via SFTP and optionally restores metadata (mode/uid/gid).
        """
        if self._client is None:
            raise RuntimeError("SSH not connected. Call connect() first.")

        # 1. Capture existing metadata if requested
        metadata = None
        if preserve_metadata:
            try:
                # Check if file exists on remote before trying to stat
                check = self.execute_command(f'[ -f "{remote_path}" ] && echo YES || echo NO')
                if check.strip() == "YES":
                    metadata = self.get_file_metadata(remote_path)
            except Exception as e:
                logger.warning(f"[CORE] Could not capture metadata for {remote_path}: {e}")

        # 2. Perform SFTP Upload with retry logic
        sftp = None
        try:
            sftp = self._client.open_sftp()
            # Ensure parent directory exists on the VM
            parent_dir = os.path.dirname(remote_path).replace("\\", "/")
            self.execute_command(f"mkdir -p {parent_dir}")
            
            logger.info(f"[SFTP] Putting {local_path} -> {remote_path}")
            sftp.put(local_path, remote_path)
        except Exception as e:
            logger.warning(f"[SFTP] Upload failed, attempting reconnect: {e}")
            self.connect() # Re-establish connection
            sftp = self._client.open_sftp()
            sftp.put(local_path, remote_path)
        finally:
            if sftp:
                sftp.close()

        # 3. Restore metadata if it was captured
        if metadata and preserve_metadata:
            self.apply_file_metadata(remote_path, metadata)

    def download_file(self, vm_path: str, local_path: str) -> None:
        """Download a file from *vm_path* on the worker VM to *local_path* on this machine via SFTP."""
        if self._client is None:
            raise RuntimeError("Not connected.")
        
        sftp = self._client.open_sftp()
        try:
            sftp.get(vm_path, local_path)
        finally:
            sftp.close()
        logger.info("[SFTP] put %s -> %s", local_path, vm_path)
        sftp = self._client.open_sftp()
        try:
            sftp.put(local_path, vm_path)
        finally:
            sftp.close()

    def download_file(self, vm_path: str, local_path: str) -> None:
        """Download a file from *vm_path* on the worker VM to *local_path* on this machine via SFTP."""
        if self._client is None:
            raise RuntimeError("Not connected.")
        logger.info("[SFTP] get %s -> %s", vm_path, local_path)
        sftp = self._client.open_sftp()
        try:
            sftp.get(vm_path, local_path)
        finally:
            sftp.close()

    def extract_archive(self, archive_vm_path: str, dest_vm_path: str) -> None:
        """
        Extract an archive (ZIP, RAR, 7Z, ISO, TAR, GZ, etc.) on the worker VM.
        Prioritizes '7zz' if available, falls back to 'tar'/'unzip'.
        """
        lower_name = archive_vm_path.lower()
        filename = os.path.basename(archive_vm_path)
        
        # Determine strict subdirectory name (remove known extensions)
        # e.g. "archive.tar.gz" -> "archive"
        base_name = filename
        for ext in [".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".zip", ".rar", ".7z", ".iso", ".wim", ".apk", ".gz", ".tar"]:
            if lower_name.endswith(ext):
                base_name = filename[:-len(ext)]
                break
        
        # 1. Try 7-Zip first (Universal)
        has_7zz = "YES" in self.execute_command("command -v 7zz >/dev/null && echo YES || echo NO")
        
        if has_7zz:
            # 7zz -y x "/path/to/file.zip" -o"/path/to/parent/file"
            # Note: -o expects no space between switch and path
            out_dir = f"{dest_vm_path}/{base_name}".replace("//", "/")
            cmd = f'7zz x "{archive_vm_path}" -o"{out_dir}" -y'
            logger.info("[FileExplorer] 7zz extract: %s -> %s", archive_vm_path, out_dir)
            out = self.execute_command(cmd)
            # Check for success (7zz exit code isn't easily captured via exec_command string return, 
            # but we can check output or assume success if no error logged)
            # If 7zz fails significantly, paramiko might not throw, but output will have errors.
            return

        # 2. Fallback: ZIP Extraction
        if lower_name.endswith(".zip"):
            # Check for unzip binary
            check = self.execute_command("command -v unzip 2>/dev/null || echo MISSING")
            if "MISSING" in check:
                # Try busybox fallback
                check2 = self.execute_command("busybox unzip --help 2>/dev/null || echo MISSING")
                if "MISSING" in check2:
                    logger.error("[FileExplorer] 'unzip' not found and '7zz' missing.")
                    raise RuntimeError("Install '7zz' or 'unzip' to extract this file.")
                cmd = f'busybox unzip -o "{archive_vm_path}" -d "{dest_vm_path}"'
            else:
                cmd = f'unzip -o "{archive_vm_path}" -d "{dest_vm_path}"'

        # 3. Fallback: TAR / GZIP Extraction
        elif lower_name.endswith((".tar.gz", ".tgz", ".gz", ".tar")):
            self.execute_command(f'mkdir -p "{dest_vm_path}"')
            cmd = f'tar -xzf "{archive_vm_path}" -C "{dest_vm_path}"'
        
        else:
             raise RuntimeError(f"No suitable extractor found for: {filename}. Install '7zz'.")

        logger.info("[FileExplorer] legacy extract: %s -> %s", archive_vm_path, dest_vm_path)
        out = self.execute_command(cmd)
        logger.debug("[FileExplorer] extract output: %s", out[:200])

    # ── Text file editing ─────────────────────────────────────────────────

    MAX_EDIT_BYTES = 10 * 1024 * 1024  # 10 MB guardrail

    def get_file_content(self, vm_path: str) -> dict:
        """
        Read a file from the VM via SFTP and attempt UTF-8 decoding.

        Returns a dict:
            { "content": str,  "is_binary": False }  – decodable text
            { "content": None, "is_binary": True  }  – binary/non-UTF-8

        Raises ValueError if the file exceeds MAX_EDIT_BYTES.
        Raises RuntimeError if not connected.
        """
        if self._client is None:
            raise RuntimeError("Not connected.")

        sftp = self._client.open_sftp()
        try:
            stat = sftp.stat(vm_path)
            size = stat.st_size or 0
            if size > self.MAX_EDIT_BYTES:
                raise ValueError(
                    f"File is too large to edit ({size / 1_048_576:.1f} MB). "
                    "Maximum is 10 MB."
                )
            with sftp.open(vm_path, "rb") as fh:
                data = fh.read()
        finally:
            sftp.close()

        try:
            content = data.decode("utf-8")
            return {"content": content, "is_binary": False}
        except UnicodeDecodeError:
            return {"content": None, "is_binary": True}

    def save_file_content(self, vm_path: str, text: str) -> None:
        """
        Write *text* (UTF-8) back to *vm_path* on the VM via SFTP.

        Raises RuntimeError if not connected.
        """
        if self._client is None:
            raise RuntimeError("Not connected.")

        logger.info("[SFTP] write %s (%d chars)", vm_path, len(text))
        data = text.encode("utf-8")
        sftp = self._client.open_sftp()
        try:
            with sftp.open(vm_path, "wb") as fh:
                fh.write(data)
        finally:
            sftp.close()

    # ── Checksum & Search ────────────────────────────────────────────────

    def calculate_checksum(self, vm_path: str, algorithm: str = "sha256") -> str:
        """
        Calculate the checksum of a remote file.
        Supported algorithms: 'md5', 'sha256'
        """
        cmd_map = {
            "md5": "md5sum",
            "sha256": "sha256sum"
        }
        cmd_bin = cmd_map.get(algorithm)
        if not cmd_bin:
            raise ValueError(f"Unsupported algorithm: {algorithm}")

        # Execute e.g. "sha256sum /path/to/file"
        # Output format: "hash_string  /path/to/file"
        cmd = f'{cmd_bin} "{vm_path}"'
        output = self.execute_command(cmd)
        
        # Parse output
        parts = output.strip().split()
        if not parts:
            raise RuntimeError(f"Failed to calculate checksum: empty output for {cmd}")
            
        return parts[0]

    def search_files(self, start_path: str, query: str) -> list[dict]:
        """
        Search for files matching *query* (case-insensitive) under *start_path*.
        Returns a list of file objects (like list_remote_directory).
        """
        # Limit depth to 5 to avoid timeouts
        # Use simple find first to get paths, then ls -land for details
        # find "/path" -iname "*query*" -maxdepth 5
        find_cmd = f'find "{start_path}" -iname "*{query}*" -maxdepth 5'
        paths_raw = self.execute_command(find_cmd)
        
        paths = [p.strip() for p in paths_raw.splitlines() if p.strip()]
        
        if not paths:
            return []

        # Now get details for these paths. 
        # If too many paths, process in chunks or limit total?
        # Let's limit to first 100 results for performance
        MAX_RESULTS = 100
        if len(paths) > MAX_RESULTS:
            paths = paths[:MAX_RESULTS]

        # Use ls -land --full-time to get details for each path
        # Construct command: ls -land --full-time "p1" "p2" ...
        # Escape quotes in paths
        safe_paths = [f'"{p}"' for p in paths]
        # Splitting into chunks to avoid command line length limits
        
        chunk_size = 20
        all_entries = []
        
        for i in range(0, len(safe_paths), chunk_size):
            chunk = safe_paths[i : i + chunk_size]
            ls_cmd = f'ls -land --full-time {" ".join(chunk)}'
            raw_ls = self.execute_command(ls_cmd)
            
            # Re-use parsing logic from list_remote_directory
            # But we can't easily call list_remote_directory since it takes a directory path
            # We'll parse manualy or refactor parsing logic?
            # For now, let's duplicate the parsing logic but adapt for 'ls -ld' output which is the same lines
            
            for line in raw_ls.splitlines():
                line = line.strip()
                if not line or line.startswith("total ") or line.startswith("ls:"):
                    continue
                
                parts = line.split()
                if len(parts) < 9:
                    # Fallback old busybox format
                    if len(parts) >= 8:
                        perms = parts[0]
                        try: size = int(parts[4])
                        except: size = 0
                        modified = f"{parts[5]} {parts[6]}"
                        name_part = " ".join(parts[7:]) # This might include the full path or just name depending on ls behavior
                        # ls -d usually outputs the path as given.
                        # We need to extract basename for 'name' but keep full path? 
                        # 'list_remote_directory' returns 'name' relative to the listed folder.
                        # For search, we probably want the full path or relative path from start_path.
                        # But the UI expects 'name'. 
                        # Actually getting the full path is better for search results.
                        
                        # Let's interpret 'name' as the basename and add a 'path' field?
                        # Or just return 'name' as the full path (or relative to search root).
                        # Let's return 'name' as the full path for now or basename and add 'dir'.
                        
                        full_name = name_part
                        if " -> " in full_name:
                            full_name = full_name.split(" -> ")[0]
                        
                        entries = self._parse_ls_line(line, start_path_context=None) 
                        if entries:
                            all_entries.append(entries)
                    continue

                # Standard parsing
                # Refactored parsing to helper method?
                entry = self._parse_ls_line(line)
                if entry:
                    all_entries.append(entry)

        return all_entries

    def _parse_ls_line(self, line: str, start_path_context: str = None) -> dict | None:
        """
        Parses a single line of ls -lan --full-time output.
        """
        parts = line.split()
        if len(parts) < 8: return None
        
        # Typical: drwxr-xr-x 2 0 0 4096 2026-02-19 10:00:00 +0000 /path/to/file
        # Busybox sometimes: -rw-r--r-- 1 0 0 1234 Jan 01 00:00 filename (no full time)
        # But we forced --full-time if available.
        
        # Check for GNU format (9+ cols)
        if len(parts) >= 9:
            perms = parts[0]
            try: size = int(parts[4])
            except: size = 0
            modified = f"{parts[5]} {parts[6]}"
            name = " ".join(parts[8:])
        else:
            # Fallback
            perms = parts[0]
            try: size = int(parts[4])
            except: size = 0
            modified = f"{parts[5]} {parts[6]}" # might be incorrect for short format
            name = " ".join(parts[7:]) 
            
        if name in (".", ".."): return None

        if " -> " in name:
            name = name.split(" -> ")[0].rstrip()

        ftype = "dir" if perms.startswith("d") else "file"
        
        return {
            "name": name, # This will be the full path if ls was called with full path
            "type": ftype,
            "size": size,
            "modified": modified,
            "permissions": perms
        }

