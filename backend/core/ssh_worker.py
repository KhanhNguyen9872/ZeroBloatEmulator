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
            timeout=10,
            banner_timeout=30,
            auth_timeout=15,
            look_for_keys=False,
            allow_agent=False,
        )
        self._client = client
        logger.info("[CORE] SSH connected to %s:%d", cfg.SSH_HOST, cfg.SSH_PORT)

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
                logger.info("[CORE] SSH ready after %d attempt(s).", attempt)
                return
            except (paramiko.AuthenticationException, paramiko.SSHException, OSError) as exc:
                logger.debug("SSH not ready yet: %s", exc)
                time.sleep(2)

        raise TimeoutError(f"Could not connect to VM via SSH within {timeout} seconds.")

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
            logger.info("[CORE] SSH connection closed.")

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
            logger.debug("stderr: %s", err.strip())
        return (out + err).strip()

    # ── Disk operations ───────────────────────────────────────────────────

    def mount_target(self) -> str:
        self.execute_command(f"mkdir -p {cfg.MOUNT_POINT}")
        self.execute_command(f"umount {cfg.MOUNT_POINT} 2>/dev/null || true")

        # Intelligent Selection Strategy
        candidate_device = None

        # Strategy 1: LDPlayer specific (usually vdb2 is the data partition)
        if self.emulator_type == "LDPLAYER":
            try:
                # Check if vdb2 exists
                check = self.execute_command("lsblk /dev/vdb2 >/dev/null 2>&1 && echo YES || echo NO")
                if check.strip() == "YES":
                    logger.info("[CORE] Detected LDPlayer: selecting /dev/vdb2")
                    candidate_device = "/dev/vdb2"
            except Exception as exc:
                logger.warning("[CORE] LDPlayer strategy failed to check vdb2: %s", exc)

        # Strategy 2: Largest Partition (General Fallback)
        if not candidate_device:
            try:
                # List partitions on vdb (or sdb)
                raw = self.execute_command(
                    "lsblk -n -b -o NAME,SIZE,TYPE /dev/vdb 2>/dev/null || "
                    "lsblk -n -b -o NAME,SIZE,TYPE /dev/sdb 2>/dev/null"
                )
                # Parse: vdb1 10485760 part
                best_part = None
                max_size = -1

                for line in raw.splitlines():
                    parts = line.split()
                    if len(parts) >= 3 and parts[2] == "part":
                        name = parts[0]
                        try:
                            size = int(parts[1])
                            if size > max_size:
                                max_size = size
                                best_part = name
                        except ValueError:
                            continue
                
                if best_part:
                    # lsblk might return just name "vdb1", ensure /dev/ prefix
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
                logger.info("[CORE] Mounted %s at %s", device, cfg.MOUNT_POINT)
                
                # Post-mount verification (check for Android folders)
                check_fs = self.execute_command(f"ls {cfg.MOUNT_POINT}/app || ls {cfg.MOUNT_POINT}/system 2>/dev/null && echo CHECK_OK || echo CHECK_FAIL")
                if "CHECK_FAIL" in check_fs:
                     logger.warning("[CORE] Warning: Mounted partition %s might not be the Android system partition.", device)

                return device
            
            logger.debug("[CORE] Could not mount %s", device)

        raise RuntimeError(
            f"Failed to mount any of {candidates} at {cfg.MOUNT_POINT}."
        )

    def list_bloatware(self) -> dict[str, list[dict]]:
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

        logger.info("[DEBLOAT] Starting APK scan...")
        
        # We'll use a blacklist/whitelist approach later, for now just list everything intelligently.
        # Strategy:
        # 1. `find` all .apk files.
        # 2. For each APK, read the first 4KB header OR full file to parse manifest.
        # 3. Use pyaxmlparser to get package name.
        
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
            logger.info("[DEBLOAT] Found %d APKs in %s", len(apk_files), base_path)
            
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
            
        return result

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
                    if attr.st_size > 100 * 1024 * 1024: # 100MB limit
                        logger.warning(f"Skipping parsing large APK: {remote_apk_path} ({attr.st_size} bytes)")
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
