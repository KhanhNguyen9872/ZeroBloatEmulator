import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from backend.utils.logger import get_logger
from backend import config as cfg

logger = get_logger(__name__)


import psutil

class QemuManager:
    """Manages the lifecycle of a QEMU virtual machine."""

    def __init__(self):
        self.current_process: subprocess.Popen | None = None
        self._attached_pid: int | None = None

    # ── Properties ────────────────────────────────────────────────────────

    @property
    def pid(self) -> int | None:
        if self.current_process:
            return self.current_process.pid
        return self._attached_pid

    @property
    def is_running(self) -> bool:
        if self.current_process:
             return self.current_process.poll() is None
        
        if self._attached_pid:
            # Check if attached process still exists
            import psutil
            if psutil.pid_exists(self._attached_pid):
                return True
            else:
                self._attached_pid = None # Cleanup dead pid
                return False
        
        return False

    # ── Service control ───────────────────────────────────────────────────

    def start_service(self, target_path: str | None = None) -> int:
        """
        Spawn the Core Process and return its PID immediately.
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
                f"A Core VM is already running (PID {self.pid}). "
                "Call stop_service() first."
            )

        if not os.path.isfile(cfg.QEMU_EXECUTABLE):
            raise FileNotFoundError(
                f"Core binary not found: {cfg.QEMU_EXECUTABLE!r}. "
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
            
            # Detect disk format based on extension
            ext = os.path.splitext(target_path)[1].lower()
            disk_fmt = "raw"
            if ext == ".vmdk":
                disk_fmt = "vmdk"
            elif ext == ".qcow2":
                disk_fmt = "qcow2"
            elif ext == ".vhd":
                disk_fmt = "vpc"  # QEMU uses 'vpc' for legacy VHD
            elif ext == ".vhdx":
                disk_fmt = "vhdx"

            cmd += ["-drive", f"file={target_path},format={disk_fmt},if=virtio,index=1"]

        logger.debug(f"[CORE] CMD: {" ".join(cmd)}")
        # Redirect output to qemu.log for debugging
        log_path = os.path.join(os.path.dirname(cfg.LOG_FILE), "qemu.log")
        self._log_file = open(log_path, "w", encoding="utf-8")

        self.current_process = subprocess.Popen(
            cmd,
            stdout=self._log_file,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )

        logger.info("[CORE] Core Process started with PID: %d", self.current_process.pid)
        return self.current_process.pid

    def attach(self, pid: int) -> None:
        """Attach to an existing Core Process (orphaned from previous run)."""
        self._attached_pid = pid
        logger.info("[CORE] Attached to existing Core Process (PID %d)", pid)

    def stop_service(self) -> None:
        """
        Terminate the QEMU process.
        Sends terminate() first; if still alive after 2 s, sends kill().
        Clears self.current_process on exit.
        """
        if not self.is_running:
            logger.warning("[CORE] stop_service() called but no VM is running.")
            self.current_process = None
            self._attached_pid = None
            return

        pid = self.pid
        logger.info("[CORE] Stopping service (PID %d)…", pid)

        # Case 1: Child process (we spawned it)
        if self.current_process:
            try:
                self.current_process.terminate()
                try:
                    self.current_process.wait(timeout=2)
                    logger.info("[CORE] Core stopped (PID %d).", pid)
                except subprocess.TimeoutExpired:
                    logger.warning("[CORE] PID %d did not exit – forcing shutdown.", pid)
                    self.current_process.kill()
                    self.current_process.wait()
                    self.current_process = None # Ensure we clear it
                    logger.info("[CORE] Core force-stopped (PID %d).", pid)
            except Exception as exc:
                logger.error("[CORE] Error stopping service: %s", exc)
            finally:
                self.current_process = None
        
        # Case 2: Attached process (orphaned)
        elif self._attached_pid:
            import psutil
            try:
                proc = psutil.Process(self._attached_pid)
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except psutil.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                logger.info("[CORE] Attached Core Process stopped (PID %d).", self._attached_pid)
            except psutil.NoSuchProcess:
                logger.info("[CORE] Attached Core PID %d already gone.", self._attached_pid)
            except Exception as exc:
                logger.error("[CORE] Error stopping attached service: %s", exc)
            finally:
                self._attached_pid = None # Clear attached PID

        logger.info("[CORE] Service stopped.")

    def find_existing_process(self) -> int | None:
        """
        Scan for a running Core Process that matches our configuration
        (specifically the SSH port forwarding rule).
        """
        target_sub = f"hostfwd=tcp::{cfg.SSH_PORT}-:22"
        
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if proc.info['name'] and "qemu-system-x86_64" in proc.info['name'].lower():
                    cmdline = proc.info.get('cmdline') or []
                    # Check if this QEMU instance is forwarding our SSH port
                    if any(target_sub in arg for arg in cmdline):
                        return proc.info['pid']
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        return None

    def reconnect_session(self, ssh_worker) -> bool:
        """
        Attempt to adopt an existing QEMU process.
        Returns True if successful, False otherwise.
        """
        pid = self.find_existing_process()
        if not pid:
            return False

        logger.info("[CORE] Recovering existing Core session (PID %d)...", pid)
        
        # Verify it's actually responsive via SSH
        if ssh_worker.check_health():
            try:
                ssh_worker.connect()
                # If we get here, SSH is working.
                # Adopt the process.
                self.attach(pid)
                # Ideally, we should also try to mount the disk if not already mounted,
                # but ssh_worker.app calls might handle that lazily.
                # For robustness, let's try to ensure mount.
                try:
                    ssh_worker.mount_target()
                    logger.info("[CORE] Reconnected and verified disk mount.")
                except Exception as exc:
                    logger.warning("[CORE] Reconnected to SSH but failed to mount disk: %s", exc)

                logger.info("[CORE] Existing Core session detected and recovered (PID: %d)", pid)
                return True
            except Exception as exc:
                logger.error("[CORE] Failed to reconnect SSH to existing PID %d: %s", pid, exc)
        else:
            logger.warning("[CORE] Existing Core Process (PID %d) is unresponsive to SSH.", pid)

        # If we found a process but couldn't verify it, it's likely a zombie or stuck.
        # Kill it to ensure a clean slate for the next start.
        logger.info("[CORE] Terminating unresponsive/orphaned Core Process (PID %d)...", pid)
        try:
            proc = psutil.Process(pid)
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except psutil.TimeoutExpired:
                proc.kill()
        except psutil.NoSuchProcess:
            pass
        except Exception as exc:
             logger.error("[CORE] Failed to kill orphaned process: %s", exc)

        return False

    # ── Legacy aliases (keep backward-compat with existing code) ─────────

    def start_vm(self, target_disk_path: str | None = None) -> int:
        return self.start_service(target_disk_path)

    def stop_vm(self) -> None:
        return self.stop_service()
