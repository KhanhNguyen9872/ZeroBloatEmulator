import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from backend.utils.logger import get_logger
from backend import config as cfg

logger = get_logger(__name__)


class QemuManager:
    """Manages the lifecycle of a QEMU virtual machine."""

    def __init__(self):
        self.current_process: subprocess.Popen | None = None

    # ── Properties ────────────────────────────────────────────────────────

    @property
    def pid(self) -> int | None:
        return self.current_process.pid if self.current_process else None

    @property
    def is_running(self) -> bool:
        return self.current_process is not None and self.current_process.poll() is None

    # ── Service control ───────────────────────────────────────────────────

    def start_service(self, target_path: str | None = None) -> int:
        """
        Spawn the QEMU process and return its PID immediately.
        Does NOT wait for SSH – the caller should poll /api/service/status.

        Args:
            target_path: Path to the target Android disk image (Drive 1).
                         Pass None to boot without a second drive.

        Returns:
            PID of the spawned QEMU process.

        Raises:
            FileNotFoundError: If QEMU executable or worker image is missing.
            RuntimeError: If a VM is already running.
        """
        if self.is_running:
            raise RuntimeError(
                f"A QEMU VM is already running (PID {self.pid}). "
                "Call stop_service() first."
            )

        if not os.path.isfile(cfg.QEMU_EXECUTABLE):
            raise FileNotFoundError(
                f"QEMU executable not found: {cfg.QEMU_EXECUTABLE!r}. "
                "Run from the project root directory."
            )

        if not os.path.isfile(cfg.WORKER_IMAGE):
            raise FileNotFoundError(f"Worker image not found: {cfg.WORKER_IMAGE!r}.")

        cmd = [
            cfg.QEMU_EXECUTABLE,
            "-m", cfg.VM_RAM,
            "-nographic",
            "-net", f"user,hostfwd=tcp::{cfg.SSH_PORT}-:22",
            "-net", "nic",
            "-drive", f"file={cfg.WORKER_IMAGE},format=qcow2,if=virtio,index=0",
        ]

        if target_path is not None:
            if not os.path.isfile(target_path):
                raise FileNotFoundError(f"Target disk image not found: {target_path!r}.")
            cmd += ["-drive", f"file={target_path},format=raw,if=virtio,index=1"]

        self.current_process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )

        logger.info("QEMU Process started with PID: %d", self.current_process.pid)
        return self.current_process.pid

    def stop_service(self) -> None:
        """
        Terminate the QEMU process.
        Sends terminate() first; if still alive after 2 s, sends kill().
        Clears self.current_process on exit.
        """
        if not self.is_running:
            logger.warning("stop_service() called but no VM is running.")
            self.current_process = None
            return

        pid = self.current_process.pid
        logger.info("Stopping service (PID %d)…", pid)

        try:
            self.current_process.terminate()
            try:
                self.current_process.wait(timeout=2)
                logger.info("Service stopped (PID %d) via SIGTERM.", pid)
            except subprocess.TimeoutExpired:
                logger.warning("PID %d did not exit – sending SIGKILL.", pid)
                self.current_process.kill()
                self.current_process.wait()
                logger.info("Service stopped (PID %d) via SIGKILL.", pid)
        except Exception as exc:
            logger.error("Error stopping service: %s", exc)
        finally:
            self.current_process = None
            logger.info("Service stopped.")

    # ── Legacy aliases (keep backward-compat with existing code) ─────────

    def start_vm(self, target_disk_path: str | None = None) -> int:
        return self.start_service(target_disk_path)

    def stop_vm(self) -> None:
        return self.stop_service()
