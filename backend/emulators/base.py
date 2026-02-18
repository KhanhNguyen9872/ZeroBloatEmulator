"""
backend/emulators/base.py
Abstract base class for all emulator detection strategies.
"""

from abc import ABC, abstractmethod


class BaseEmulator(ABC):
    """
    Each concrete strategy must implement:
      - identifier()  → unique string key used in API responses (e.g. "MEMU")
      - detect(path)  → dict result or None if not detected
    """

    @abstractmethod
    def identifier(self) -> str:
        """Return a unique string key for this emulator (e.g. 'MEMU', 'LDPLAYER')."""

    @abstractmethod
    def detect(self, path: str) -> dict | None:
        """
        Analyse *path* and return a result dict if this emulator is found,
        or None if not detected.

        Result dict shape examples:
            { "type": "LDPlayer", "versions": [...], "status": "manual_select_required" }
            { "type": "MEmu",     "versions": [...], "selected": "...", "status": "auto_selected" }
        """

    # ── Shared utilities ──────────────────────────────────────────────────────

    @staticmethod
    def _filenames_lower(path: str) -> set[str]:
        """Return a set of lowercased filenames directly inside *path*."""
        import os
        try:
            return {f.lower() for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))}
        except (PermissionError, FileNotFoundError):
            return set()

    @staticmethod
    def _has_file(path: str, *names: str) -> bool:
        """True if ALL of *names* (case-insensitive) exist directly in *path*."""
        import os
        files = BaseEmulator._filenames_lower(path)
        return all(n.lower() in files for n in names)

    @staticmethod
    def _has_any_file(path: str, *names: str) -> bool:
        """True if ANY of *names* (case-insensitive) exist directly in *path*."""
        files = BaseEmulator._filenames_lower(path)
        return any(n.lower() in files for n in names)
