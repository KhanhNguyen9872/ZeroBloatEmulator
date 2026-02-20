import os
import socket
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

    @staticmethod
    def is_port_in_use(port: int) -> bool:
        """Return True if *port* on localhost is already bound by another process."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return False  # bind succeeded → port is free
            except OSError:
                return True   # bind failed → port is occupied

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

        if self.is_port_in_use(cfg.SSH_PORT):
            raise RuntimeError(
                f"Port {cfg.SSH_PORT} is blocked by another application. "
                "Please close any other SSH or emulator processes and try again."
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
            "-monitor", "tcp:127.0.0.1:4444,server,nowait",
            "-device", "virtio-scsi-pci,id=scsi0",
            "-drive", f"file={cfg.WORKER_IMAGE},format=qcow2,if=virtio,index=0",
        ]

        logger.debug(f"[CORE] CMD: {' '.join(cmd)}")
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
                # SSH is working. Adopt the process.
                self.attach(pid)
                logger.debug("[CORE] Reconnected to existing Core session.")


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

    # ── Hotplug Operations ────────────────────────────────────────────────

    def send_monitor_command(self, cmd: str) -> str:
        """Send a command to the QEMU Human Monitor Protocol (HMP) and return the response."""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(2.0)
                s.connect(("127.0.0.1", 4444))
                
                # Read greeting until we see the '(qemu)' prompt
                resp = ""
                while "(qemu)" not in resp:
                    chunk = s.recv(4096).decode("utf-8", errors="replace")
                    if not chunk:
                        break
                    resp += chunk
                
                s.sendall((cmd + "\n").encode("utf-8"))
                
                # Receive response until next prompt
                resp = ""
                while "(qemu)" not in resp:
                    chunk = s.recv(4096).decode("utf-8", errors="replace")
                    if not chunk:
                        break
                    resp += chunk
                
                return resp
        except Exception as e:
            logger.error("[CORE] Monitor command '%s' failed: %s", cmd, e)
            raise RuntimeError(f"Failed to communicate with QEMU monitor: {e}")

    def hotplug_drive(self, file_path: str, drive_id: str) -> None:
        """Dynamically attach a virtual disk using VirtIO SCSI."""
        if not self.is_running:
            raise RuntimeError("Cannot hotplug: QEMU is not running.")
        
        ext = os.path.splitext(file_path)[1].lower()
        disk_fmt = "raw"
        if ext == ".vmdk":   disk_fmt = "vmdk"
        elif ext == ".qcow2": disk_fmt = "qcow2"
        elif ext == ".vhd":  disk_fmt = "vpc"
        elif ext == ".vhdx": disk_fmt = "vhdx"
        elif ext == ".vdi":  disk_fmt = "vdi"
        
        # 1. Add the block device
        drive_cmd = f"drive_add 0 file={file_path},format={disk_fmt},if=none,id={drive_id}"
        resp_drive = self.send_monitor_command(drive_cmd)
        logger.debug("[CORE] Hotplug drive_add: %s", resp_drive.strip())
        
        # 2. Attach to VirtIO SCSI bus
        device_cmd = f"device_add scsi-hd,drive={drive_id},id=dev_{drive_id}"
        resp_dev = self.send_monitor_command(device_cmd)
        logger.debug("[CORE] Hotplug device_add: %s", resp_dev.strip())

    def hotunplug_drive(self, drive_id: str) -> None:
        """Dynamically detach a virtual disk using VirtIO SCSI."""
        if not self.is_running:
            return
            
        dev_cmd = f"device_del dev_{drive_id}"
        resp_dev = self.send_monitor_command(dev_cmd)
        logger.debug("[CORE] Hotunplug device_del: %s", resp_dev.strip())
        
        drive_cmd = f"drive_del {drive_id}"
        resp_drive = self.send_monitor_command(drive_cmd)
        logger.debug("[CORE] Hotunplug drive_del: %s", resp_drive.strip())

    # ── Legacy aliases (keep backward-compat with existing code) ─────────

    def start_vm(self, target_disk_path: str | None = None) -> int:
        return self.start_service(target_disk_path)

    def stop_vm(self) -> None:
        return self.stop_service()
