"""
backend/emulators/definitions/bluestacks.py
Detection strategy for BlueStacks 4 & 5.
"""

import os
import logging
from backend.emulators.base import BaseEmulator

logger = logging.getLogger(__name__)

_EXES = {"hd-player.exe", "bluestacks.exe", "hd-frontend.exe"}


class BlueStacksStrategy(BaseEmulator):

    def identifier(self) -> str:
        return "BLUESTACKS"

    def detect(self, path: str) -> dict | None:
        # Check for any valid BlueStacks executable
        if not self._has_any_file(path, *_EXES):
            return None

        logger.info("BlueStacks detected at: %s", path)

        detected_version = None
        
        # 1. Attempt to detect BlueStacks 5 via config
        # BS5 usually has HD-Player.exe and a bluestacks.conf
        if self._has_file(path, "hd-player.exe"):
            conf_path = os.path.join(path, "bluestacks.conf")
            if os.path.isfile(conf_path):
                try:
                    with open(conf_path, "r", encoding="utf-8", errors="ignore") as f:
                        if "bst.bluestacks_5" in f.read():
                            detected_version = "BlueStacks 5"
                except Exception:
                    pass

        # 2. Attempt to detect BlueStacks 4 via executables
        # BS4 typically uses Bluestacks.exe or HD-Frontend.exe as entry points
        if not detected_version:
            if self._has_any_file(path, "bluestacks.exe", "hd-frontend.exe"):
                detected_version = "BlueStacks 4"

        # 3. Return result
        if detected_version:
            return {
                "type": "BLUESTACKS",
                "detected_version": detected_version,
                "status": "auto",
                "options": [],
                "base_path": path
            }

        # 4. Fallback: verification needed
        return {
            "type": "BLUESTACKS",
            "detected_version": None,
            "status": "manual_select",
            "options": [
                {"id": "bs4", "label": "BlueStacks 4"},
                {"id": "bs5", "label": "BlueStacks 5"},
            ],
            "base_path": path
        }

    def get_disk_path(self, base_path: str, version_id: str | None) -> str:
        import os
        # version_id might be "bs4", "bs5" or the actual folder name if we improve detection later.
        # For now, stick to standard BS5 structure fallback.
        # Structure: Engine/Nougat32/Root.vhd
        
        # If version_id is a known folder name, use it
        if version_id and os.path.isdir(os.path.join(base_path, "Engine", version_id)):
             return os.path.join(base_path, "Engine", version_id, "Root.vhd")
        
        # Fallback to standard Nougat32
        return os.path.join(base_path, "Engine", "Nougat32", "Root.vhd")
