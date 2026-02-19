"""
backend/core/file_ops.py – Path-safety helpers for the remote File Explorer.

All user-supplied paths are normalised and validated against the configured
MOUNT_POINT before being handed to SSHWorker commands. This prevents directory
traversal attacks (../../etc/passwd style).
"""

import posixpath
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from backend.utils.logger import get_logger

logger = get_logger(__name__)


def safe_remote_path(user_path: str, mount_point: str = "/mnt/android") -> tuple[str, str]:
    """
    Validate and resolve a user-supplied path relative to *mount_point*.

    The frontend treats the VM root as "/" — so user_path="/system/app" maps
    to "/mnt/android/system/app" on the worker VM.

    Args:
        user_path:    Path as presented by the frontend (e.g. "/" or "/system/app").
        mount_point:  The actual base on the worker VM (default: "/mnt/android").

    Returns:
        (vm_path, display_path) where:
          - vm_path      is the full path on the VM   (e.g. "/mnt/android/system/app")
          - display_path is the user-facing canonical path (e.g. "/system/app")

    Raises:
        ValueError: If the resolved path escapes *mount_point*.
    """
    mount_point = mount_point.rstrip("/")

    # Normalise the user path (remove .., collapse slashes, etc.)
    # posixpath.normpath always produces an absolute path when given one.
    clean = posixpath.normpath("/" + user_path.lstrip("/"))

    # Build the full VM path
    vm_path = mount_point + clean

    # Security check: re-normalise the VM path and verify it still starts
    # with mount_point.  posixpath.normpath resolves all ".." components.
    canonical = posixpath.normpath(vm_path)

    if not (canonical == mount_point or canonical.startswith(mount_point + "/")):
        raise ValueError(
            f"Path traversal detected: '{user_path}' resolves outside '{mount_point}'"
        )

    # display_path is what the frontend considers "current path"
    display_path = clean  # e.g. "/system/app"

    logger.debug("[FileOps] user_path=%r  vm_path=%r  display=%r", user_path, canonical, display_path)
    return canonical, display_path
