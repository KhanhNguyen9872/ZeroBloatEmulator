"""
backend/utils/shortcut.py – Windows .lnk shortcut resolver
"""

import os


def resolve_shortcut(lnk_path: str) -> str:
    """
    Resolve a Windows shortcut (.lnk) file to its target path.

    Uses win32com.client (pywin32) which is the most reliable method on Windows.
    Falls back to a raw binary parse if pywin32 is not available.

    Returns the resolved target path string, or raises ValueError on failure.
    """
    lnk_path = os.path.normpath(lnk_path)

    if not os.path.isfile(lnk_path):
        raise ValueError(f"File not found: {lnk_path}")

    if not lnk_path.lower().endswith(".lnk"):
        raise ValueError(f"Not a .lnk file: {lnk_path}")

    # Primary: pywin32 (most reliable)
    try:
        import win32com.client  # type: ignore
        shell = win32com.client.Dispatch("WScript.Shell")
        shortcut = shell.CreateShortcut(lnk_path)
        target = shortcut.TargetPath
        if target:
            return os.path.normpath(target)
    except Exception:
        pass

    # Fallback: read the binary structure of the .lnk file
    # The target path starts at a known offset in the LinkInfo block.
    try:
        target = _parse_lnk_binary(lnk_path)
        if target:
            return os.path.normpath(target)
    except Exception:
        pass

    raise ValueError(f"Could not resolve shortcut: {lnk_path}")


def _parse_lnk_binary(lnk_path: str) -> str | None:
    """
    Minimal binary parser for Windows Shell Link (.lnk) files.
    Extracts the local base path from the LinkInfo block.
    Reference: MS-SHLLINK specification.
    """
    import struct

    with open(lnk_path, "rb") as f:
        data = f.read()

    # Header: 0x4C bytes, magic = 0x0000004C
    if len(data) < 0x4C or struct.unpack_from("<I", data, 0)[0] != 0x4C:
        return None

    header_size = 0x4C
    link_flags = struct.unpack_from("<I", data, 0x14)[0]

    offset = header_size

    # Skip LinkTargetIDList if present (flag bit 0)
    if link_flags & 0x01:
        id_list_size = struct.unpack_from("<H", data, offset)[0]
        offset += 2 + id_list_size

    # LinkInfo block (flag bit 1)
    if link_flags & 0x02:
        link_info_size = struct.unpack_from("<I", data, offset)[0]
        local_base_path_offset = struct.unpack_from("<I", data, offset + 0x10)[0]
        raw_path = data[offset + local_base_path_offset:]
        null = raw_path.find(b"\x00")
        if null != -1:
            return raw_path[:null].decode("mbcs", errors="replace")

    return None
