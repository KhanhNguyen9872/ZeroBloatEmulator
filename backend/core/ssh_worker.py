import socket
import time
import sys
import os

import paramiko

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
        
        # Candidate paths to scan relative to MOUNT_POINT
        candidates = [
            ("app", "/app"),
            ("app", "/system/app"),
            ("priv-app", "/priv-app"),
            ("priv-app", "/system/priv-app"),
            ("vendor-app", "/vendor/app"),
            ("vendor-priv-app", "/vendor/priv-app"),
            ("product-app", "/product/app"),
            ("product-priv-app", "/product/priv-app"),
        ]

        logger.info("[DEBLOAT] Starting APK scan (skip_packages=%s)...", skip_packages)
        
        # We'll use a blacklist/whitelist approach later, for now just list everything intelligently.
        # Strategy:
        # 1. `find` all .apk files.
        # 2. For each APK, read the first 4KB header OR full file to parse manifest.
        # 3. Use pyaxmlparser to get package name.
        
        if not skip_packages:
            try:
                from pyaxmlparser import APK
            except ImportError:
                logger.error("pyaxmlparser not installed. Falling back to simple directory listing.")
                return self._list_bloatware_legacy(candidates)

        for category, subpath in candidates:
            base_path = f"{cfg.MOUNT_POINT}{subpath}"
            
            # Check if directory exists
            check = self.execute_command(f"[ -d {base_path} ] && echo YES || echo NO")
            if check.strip() != "YES":
                continue

            # Find all APKs: /mnt/android/system/app/YouTube/YouTube.apk
            # We want to group by parent folder if possible, or just list the APK.
            # Output format: ./YouTube/YouTube.apk
            raw_find = self.execute_command(f"cd {base_path} && find . -name '*.apk' -maxdepth 2")
            
            apk_files = [line.strip() for line in raw_find.splitlines() if line.strip().endswith(".apk")]
            
            # Remove /mnt/android/ for user display
            display_path = base_path.replace(cfg.MOUNT_POINT, "")
            if not display_path: display_path = "/"
            
            logger.info("[DEBLOAT] Found %d APKs in %s", len(apk_files), display_path)
            
            for apk_rel_path in apk_files:
                # apk_rel_path is like "./YouTube/YouTube.apk" or "./Calculator.apk"
                full_path = f"{base_path}/{apk_rel_path.lstrip('./')}"
                
                # Determine the "app folder" to delete.
                # If APK is in a subfolder (e.g. YouTube/YouTube.apk), delete "YouTube".
                # If APK is at root (e.g. Calculator.apk), delete "Calculator.apk".
                parts = apk_rel_path.strip("./").split("/")
                if len(parts) > 1:
                    delete_target = f"{subpath}/{parts[0]}"  # e.g. /system/app/YouTube
                    name = parts[0]
                else:
                    delete_target = f"{subpath}/{parts[0]}"  # e.g. /system/app/Calculator.apk
                    name = parts[0] # Calculator.apk

                # Parse Package Name
                pkg_name = None
                if not skip_packages:
                    pkg_name = self._fetch_package_name(full_path)
                
                item = {
                    "name": name,
                    "path": delete_target,
                    "package": pkg_name or name, # Fallback to filename if parsing fails
                    "category": category
                }
                
                # Avoid duplicates if multiple APKs in same folder (unlikely but possible)
                if not any(x['path'] == item['path'] for x in result[category]):
                    result[category].append(item)

        # Sort by name
        for k in result:
            result[k].sort(key=lambda x: x['name'].lower())
            
        # Return detected roots as well
        category_roots = {}
        for cat, sub in candidates:
            if cat not in category_roots:
                # Check if this subpath actually exists and had apps
                check = self.execute_command(f"[ -d {cfg.MOUNT_POINT}{sub} ] && echo YES || echo NO")
                if check.strip() == "YES":
                    category_roots[cat] = sub

        return {"apps": result, "category_roots": category_roots}

    def upload_file(self, local_path: str, remote_path: str) -> None:
        """Upload a file from local filesystem to the VM via SFTP."""
        if self._client is None:
            raise RuntimeError("SSH not connected.")
        
        # logger.debug("[CORE] Generic upload: %s to %s", local_path, remote_path)
        sftp = self._client.open_sftp()
        try:
            # Ensure parent directory exists
            parent = os.path.dirname(remote_path).replace("\\", "/")
            self.execute_command(f"mkdir -p {parent}")
            sftp.put(local_path, remote_path)
        finally:
            sftp.close()

    def rename_path(self, old_path: str, new_name: str) -> str:
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
        
        logger.info("[CORE] Renaming %s -> %s", vm_old, vm_new)
        # Use quotes for paths with spaces
        cmd = f"mv \"{vm_old}\" \"{vm_new}\""
        self.execute_command(cmd)
        return new_path

    def move_path(self, old_path: str, new_category_root: str) -> str:
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
        
        logger.info("[CORE] Moving %s -> %s", vm_old, vm_new)
        # Use quotes for paths with spaces
        cmd = f"mv \"{vm_old}\" \"{vm_new}\""
        self.execute_command(cmd)
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
                    "category": category
                })
        return result
