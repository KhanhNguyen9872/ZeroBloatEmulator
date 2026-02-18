"""
backend/utils/admin.py – Windows administrator privilege utilities.
"""

import ctypes
import sys
import os


def is_admin() -> bool:
    """Return True if the current process has administrator rights."""
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def restart_as_admin() -> None:
    """
    Re-launch the current Python process with 'runas' (UAC elevation prompt).

    Reconstructs the original command line so the app starts exactly as before.
    After triggering ShellExecute, calls sys.exit(0) to kill the current
    non-admin process immediately.

    Note: This function never returns normally.
    """
    # Rebuild the argument list (skip argv[0] which is the script path)
    script = os.path.abspath(sys.argv[0])
    extra_args = " ".join(f'"{a}"' for a in sys.argv[1:])
    params = f'"{script}"'
    if extra_args:
        params += f" {extra_args}"

    # ShellExecuteW: hwnd, operation, file, params, directory, show_cmd
    # show_cmd=1 → SW_SHOWNORMAL
    result = ctypes.windll.shell32.ShellExecuteW(
        None,       # hwnd
        "runas",    # operation – triggers UAC
        sys.executable,
        params,
        None,       # working directory (inherit)
        1,          # SW_SHOWNORMAL
    )

    # ShellExecuteW returns > 32 on success
    if result <= 32:
        raise RuntimeError(
            f"ShellExecuteW failed with code {result}. "
            "User may have cancelled the UAC prompt."
        )

    # Kill the current (non-admin) process
    sys.exit(0)
