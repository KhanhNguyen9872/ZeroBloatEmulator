"""
backend/emulators/definitions/ldplayer.py
Detection strategy for LDPlayer (any version).
"""

import os
import logging

from backend.emulators.base import BaseEmulator

logger = logging.getLogger(__name__)

_EXES = {"dnplayer.exe", "dnmultiplayer.exe"}


class LDPlayerStrategy(BaseEmulator):

    def identifier(self) -> str:
        return "LDPLAYER"

    def detect(self, path: str) -> dict | None:
        if not self._has_any_file(path, *_EXES):
            return None
        if not self._has_vmdk(path):
            return None
        logger.info("LDPlayer detected at: %s", path)
        versions = self._versions(path)
        return {
            "type": "LDPlayer",
            "versions": versions or ["LDPlayer 5", "LDPlayer 7", "LDPlayer 9"],
            "status": "manual_select_required",
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _has_vmdk(path: str) -> bool:
        """Recursively look for *.vmdk under *path* (max depth 3)."""
        for root, _dirs, files in os.walk(path):
            depth = root[len(path):].count(os.sep)
            if depth > 3:
                continue
            if any(f.lower().endswith(".vmdk") for f in files):
                return True
        return False

    @staticmethod
    def _versions(path: str) -> list[str]:
        """Heuristic: scan vms/ sub-dirs for leidian* / ldplayer* folders."""
        vms_dir = os.path.join(path, "vms")
        search_root = vms_dir if os.path.isdir(vms_dir) else path
        versions = []
        try:
            for item in sorted(os.listdir(search_root)):
                full = os.path.join(search_root, item)
                if os.path.isdir(full) and item.lower().startswith(("leidian", "ldplayer", "ld")):
                    versions.append(item)
        except (PermissionError, FileNotFoundError):
            pass
        return versions
