
import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Add project root to sys.path so we can import backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.ssh_worker import SSHWorker
from backend import config as cfg

class TestSSHWorkerMount(unittest.TestCase):

    def setUp(self):
        self.worker = SSHWorker()
        # Mock the SSH client
        self.worker._client = MagicMock()
        # Mock execute_command to return default success for mkdir/umount
        self.worker.execute_command = MagicMock(return_value="")

    def test_mount_ldplayer_vdb2_exists(self):
        """Test LDPlayer strategy: if /dev/vdb2 exists, use it."""
        self.worker.set_emulator_type("LDPLAYER")
        
        # Scenario: lsblk says vdb2 exists
        def side_effect(cmd):
            if "mkdir" in cmd: return ""
            if "umount" in cmd: return ""
            # The command is "lsblk /dev/vdb2 >/dev/null 2>&1 && echo YES || echo NO"
            if "lsblk /dev/vdb2" in cmd and "echo YES" in cmd: return "YES"
            if "mount" in cmd and "/dev/vdb2" in cmd: return ""
            if "mountpoint" in cmd: return "OK"
            return ""

        self.worker.execute_command.side_effect = side_effect

        mounted = self.worker.mount_target()
        self.assertEqual(mounted, "/dev/vdb2")

    def test_mount_ldplayer_fallback(self):
        """Test LDPlayer strategy: if /dev/vdb2 missing, fall back to default logic."""
        self.worker.set_emulator_type("LDPLAYER")

        def side_effect(cmd):
            # The command is "lsblk /dev/vdb2 >/dev/null 2>&1 && echo YES || echo NO"
            if "lsblk /dev/vdb2" in cmd and "echo YES" in cmd: return "NO"
            
            # Default logic: lsblk -n -b -o NAME,SIZE,TYPE /dev/vdb
            if "lsblk -n -b -o NAME,SIZE,TYPE /dev/vdb" in cmd:
                return """
vdb1 10485760 part
vdb2 2147483648 part
"""
            if "mount" in cmd and "/dev/vdb2" in cmd and "-t ext4" in cmd: return ""
            if "mountpoint" in cmd: return "OK"
            return ""

        self.worker.execute_command.side_effect = side_effect
        
        # It should pick vdb2 because it's the largest
        mounted = self.worker.mount_target()
        self.assertEqual(mounted, "/dev/vdb2")

    def test_mount_default_largest_partition(self):
        """Test default strategy: pick largest 'part'."""
        self.worker.set_emulator_type("MEmu")

        def side_effect(cmd):
            if "lsblk -n -b -o NAME,SIZE,TYPE /dev/vdb" in cmd:
                return """
vdb1 100 part
vdb2 5000 part
vdb3 200 part
"""
            if "mount" in cmd and "/dev/vdb2" in cmd: return ""
            if "mountpoint" in cmd: return "OK"
            return ""

        self.worker.execute_command.side_effect = side_effect
        
        mounted = self.worker.mount_target()
        self.assertEqual(mounted, "/dev/vdb2")

    def test_mount_default_fallback_candidates(self):
        """Test fallback to candidates if intelligent selection fails."""
        self.worker.set_emulator_type("Unknown")
        
        last_attempt = [None]

        # Simulate lsblk failure
        def side_effect(cmd):
            if "lsblk" in cmd: raise RuntimeError("lsblk failed")
            
            if "mount -t ext4" in cmd:
                if "/dev/vdb1" in cmd: last_attempt[0] = "vdb1"
                if "/dev/vdb " in cmd: last_attempt[0] = "vdb"
                return ""

            if "mountpoint" in cmd:
                if last_attempt[0] == "vdb": return "OK"
                return "FAIL"
            
            return ""

        self.worker.execute_command.side_effect = side_effect

        # Mock candidates in config to be sure
        # We need to ensure we are patching the config imported in ssh_worker!
        # But here we imported ssh_worker which imports config as cfg.
        # We need to patch `backend.core.ssh_worker.cfg.DRIVE1_CANDIDATES`
        with patch("backend.core.ssh_worker.cfg.DRIVE1_CANDIDATES", ["/dev/vdb1", "/dev/vdb"]):
             mounted = self.worker.mount_target()
             self.assertEqual(mounted, "/dev/vdb")

if __name__ == '__main__':
    unittest.main()
