"""
backend/emulators/definitions/memu.py
Detection strategy for MEmu Play.
"""

import os
import logging

from backend.emulators.base import BaseEmulator

logger = logging.getLogger(__name__)

_EXES = {"memuconsole.exe", "memu.exe"}

_IMAGE_MAP = {
    "96": "Android 9 (64-bit)",
    "51": "Android 5.1 (32-bit)",
    "71": "Android 7.1 (32-bit)",
    "76": "Android 7.1 (64-bit)",
}


class MemuStrategy(BaseEmulator):

    def identifier(self) -> str:
        return "MEMU"

    def detect(self, path: str) -> dict | None:
        files = self._filenames_lower(path)
        if not _EXES.issubset(files):
            return None
        logger.info("MEmu detected at: %s", path)
        return self._result(path)

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _result(path: str) -> dict:
        image_dir = os.path.join(path, "image")
        versions = []

        if os.path.isdir(image_dir):
            for key, label in _IMAGE_MAP.items():
                if os.path.isdir(os.path.join(image_dir, key)):
                    versions.append(label)
                    logger.info("MEmu: found image/%s → %s", key, label)

        if not versions:
            logger.warning("MEmu detected but no known image sub-folders found.")
            return {
                "type": "MEmu",
                "versions": [],
                "status": "error",
                "message": "MEmu found but no supported Android image sub-folders detected.",
            }

        if len(versions) == 1:
            return {
                "type": "MEmu",
                "versions": versions,
                "selected": versions[0],
                "status": "auto_selected",
            }

        return {
            "type": "MEmu",
            "versions": versions,
            "status": "manual_select_required",
        }
