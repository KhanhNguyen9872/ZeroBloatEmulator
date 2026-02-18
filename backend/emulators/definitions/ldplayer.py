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

    def get_profiles(self, android_version: str | None = None) -> list[dict]:
        ver = None
        if android_version:
            if android_version.startswith("9"): ver = 9
            elif android_version.startswith("7"): ver = 7
            elif android_version.startswith("5"): ver = 5
        
        # Base profiles
        profiles = [
            {
                "id": "minimal",
                "name": "Minimal Debloat",
                "description": "Removes obvious bloatware, keeps Google services."
            },
            {
                "id": "optimization",
                "name": "Full Optimization",
                "description": "Removes all unnecessary apps including Google Play Store."
            },
            {
                "id": "gaming",
                "name": "Gaming Mode",
                "description": "Optimized for maximum FPS, removes background services."
            }
        ]
        
        # Add version-specific info to description
        if ver:
            for p in profiles:
                p["description"] += f" (Android {ver})"
                p["id"] = f"{p['id']}_v{ver}"

        return profiles

    def get_profile_packages(self, profile_id: str) -> list[str]:
        # Parse version from ID (e.g., "minimal_v9")
        ver = 0  # 0 = generic
        if "_v" in profile_id:
            try:
                base_id, v_str = profile_id.rsplit("_v", 1)
                ver = int(v_str)
                profile_id = base_id # revert to base ID for logic
            except: pass

        common = [
            "/system/app/CalendarGoogle",
            "/system/app/Drive",
            "/system/app/Gmail2",
            "/system/app/GoogleContactsSyncAdapter",
            "/system/app/GoogleTTS",
            "/system/app/Hangouts",
            "/system/app/Maps",
            "/system/app/Photos",
            "/system/app/YouTube",
            "/system/priv-app/Velvet"  # Google App
        ]
        
        # Android 9 (LD9) specifics
        if ver == 9:
            common.extend([
                "/product/app/YouTube",
                "/product/priv-app/Velvet",
                "/vendor/app/YourPhone",
            ])
            
        if profile_id == "minimal":
            return common
            
        if profile_id == "optimization":
            base = common + [
                "/system/priv-app/Phonesky",  # Play Store
                "/system/priv-app/GmsCore",   # Play Services
                "/system/priv-app/GoogleServicesFramework",
            ]
            if ver == 9:
                base.extend([
                     "/product/priv-app/Phonesky",
                     "/product/priv-app/GmsCore",
                ])
            return base
            
        if profile_id == "gaming":
            base = common + [
                "/system/app/BasicDreams",
                "/system/app/Email",
                "/system/app/Exchange2",
                "/system/app/Galaxy4",
                "/system/app/HoloSpiralWallpaper",
                "/system/app/LiveWallpapers",
                "/system/app/Music2",
                "/system/app/PrintSpooler",
            ]
            if ver == 9:
                 base.extend(["/product/app/Music2"])
            return base
            
        return []
