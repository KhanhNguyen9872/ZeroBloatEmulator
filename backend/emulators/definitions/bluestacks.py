"""
backend/emulators/definitions/bluestacks.py
Detection strategy for BlueStacks (5 / 10).
"""

import os
import logging

from backend.emulators.base import BaseEmulator

logger = logging.getLogger(__name__)

# BlueStacks 5 / 10 main executable
_EXES = {"hd-player.exe"}

# BlueStacks stores Android images in Engine/ sub-dirs
_ENGINE_DIR = "Engine"


class BlueStacksStrategy(BaseEmulator):

    def identifier(self) -> str:
        return "BLUESTACKS"

    def detect(self, path: str) -> dict | None:
        if not self._has_any_file(path, *_EXES):
            return None
        logger.info("BlueStacks detected at: %s", path)
        versions = self._versions(path)
        if len(versions) == 1:
            return {
                "type": "BlueStacks",
                "versions": versions,
                "selected": versions[0],
                "status": "auto_selected",
            }
        if versions:
            return {
                "type": "BlueStacks",
                "versions": versions,
                "status": "manual_select_required",
            }
        # Detected but no version sub-dirs found — still report it
        return {
            "type": "BlueStacks",
            "versions": ["BlueStacks 5"],
            "selected": "BlueStacks 5",
            "status": "auto_selected",
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _versions(path: str) -> list[str]:
        """Scan Engine/ sub-directories for installed instances."""
        engine_dir = os.path.join(path, _ENGINE_DIR)
        if not os.path.isdir(engine_dir):
            return []
        versions = []
        try:
            for item in sorted(os.listdir(engine_dir)):
                full = os.path.join(engine_dir, item)
                if os.path.isdir(full):
                    versions.append(item)
        except (PermissionError, FileNotFoundError):
            pass
        return versions
