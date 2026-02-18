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
        except Exception as exc:
            logger.debug("Health check failed: %s", exc)
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

        for device in cfg.DRIVE1_CANDIDATES:
            logger.info("Trying to mount %s → %s …", device, cfg.MOUNT_POINT)
            self.execute_command(f"mount -o ro {device} {cfg.MOUNT_POINT} 2>&1")
            check = self.execute_command(f"mountpoint -q {cfg.MOUNT_POINT} && echo OK || echo FAIL")
            if check.strip() == "OK":
                logger.info("[CORE] Mounted %s at %s", device, cfg.MOUNT_POINT)
                return device
            logger.debug("[CORE] Could not mount %s", device)

        raise RuntimeError(
            f"Failed to mount any of {cfg.DRIVE1_CANDIDATES} at {cfg.MOUNT_POINT}."
        )

    def list_bloatware(self) -> dict[str, list[str]]:
        result: dict[str, list[str]] = {}
        for subdir in ("app", "priv-app"):
            path = f"{cfg.MOUNT_POINT}/{subdir}"
            exists = self.execute_command(f"[ -d {path} ] && echo YES || echo NO")
            if exists.strip() != "YES":
                continue
            raw = self.execute_command(f"ls -F {path}")
            folders = [e.rstrip("/") for e in raw.splitlines() if e.endswith("/")]
            result[subdir] = folders
            logger.info("[DEBLOAT] Found %d entries in %s", len(folders), path)
        return result
