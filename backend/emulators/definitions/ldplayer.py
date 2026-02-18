"""
backend/emulators/definitions/ldplayer.py
Detection strategy for LDPlayer (any version).
"""

import logging
from backend.emulators.base import BaseEmulator

logger = logging.getLogger(__name__)

_EXES = {"dnplayer.exe", "ldplayer.exe"}


class LDPlayerStrategy(BaseEmulator):

    def identifier(self) -> str:
        return "LDPLAYER"

    def detect(self, path: str) -> dict | None:
        # Check for core executables
        if not self._has_any_file(path, *_EXES):
            return None

        logger.info("LDPlayer detected at: %s", path)

        # LDPlayer version detection is unreliable via file structure alone.
        # We enforce manual selection with valid Python profile IDs.
        return {
            "type": "LDPLAYER",
            "detected_version": None,
            "status": "manual_select",
            "options": [
                {"id": "ld5", "label": "Android 5.1 (32-bit)"},
                {"id": "ld7", "label": "Android 7.1 (32-bit)"},
                {"id": "ld9", "label": "Android 9 (64-bit)"},
            ],
            "base_path": path
        }

    def get_disk_path(self, base_path: str, version_id: str | None) -> str:
        import os
        # LDPlayer uses a single shared system.vmdk in the installation root
        return os.path.join(base_path, "system.vmdk")
