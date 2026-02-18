"""
backend/emulators/definitions/memu.py
Detection strategy for MEmu Play.
"""

import os
import logging
from backend.emulators.base import BaseEmulator

logger = logging.getLogger(__name__)

_EXES = {"memuconsole.exe", "memu.exe"}

# Map folder names in 'image/' to friendly names
_IMAGE_MAP = {
    "96": "Android 9.0 (64-bit)",
    "76": "Android 7.1 (64-bit)",
    "71": "Android 7.1 (32-bit)",
    "51": "Android 5.1 (32-bit)",
}


class MemuStrategy(BaseEmulator):

    def identifier(self) -> str:
        return "MEMU"

    def detect(self, path: str) -> dict | None:
        files = self._filenames_lower(path)
        if not _EXES.issubset(files):
            return None

        logger.info("MEmu detected at: %s", path)

        # Scan 'image/' subdirectory for versions
        image_dir = os.path.join(path, "image")
        detected_versions = []

        if os.path.isdir(image_dir):
            try:
                # Check for each known image folder
                for folder_name, label in _IMAGE_MAP.items():
                    if os.path.isdir(os.path.join(image_dir, folder_name)):
                        detected_versions.append({"id": folder_name, "label": label})
            except OSError:
                pass

        # Decide status based on findings
        if not detected_versions:
            # Fallback if structure is weird
            return {
                "type": "MEMU",
                "status": "manual_select",
                "options": [{"id": k, "label": v} for k, v in _IMAGE_MAP.items()],
                "base_path": path,
                "warning": "Could not auto-detect MEmu version."
            }
        
        if len(detected_versions) == 1:
            # Single version found -> Auto select
            return {
                "type": "MEMU",
                "detected_version": detected_versions[0]["label"],
                "status": "auto",
                "options": detected_versions, # Pass for reference
                "base_path": path
            }
        
        # Multiple versions -> User must choose
        return {
            "type": "MEMU",
            "status": "manual_select",
            "options": detected_versions,
            "base_path": path
        }
