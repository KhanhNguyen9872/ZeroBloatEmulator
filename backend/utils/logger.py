"""
backend/utils/logger.py – Central application logger for ZeroBloatEmulator.

Usage:
    from backend.utils.logger import get_logger
    logger = get_logger(__name__)
    logger.info("Hello")
"""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler

_LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")
_LOG_FILE = os.path.join(_LOG_DIR, "app.log")
_FORMAT = "[%(asctime)s] [%(levelname)s] %(message)s"
_DATE_FORMAT = "%H:%M:%S"

_configured = False


def _configure():
    global _configured
    if _configured:
        return

    os.makedirs(_LOG_DIR, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)

    fmt = logging.Formatter(_FORMAT, datefmt=_DATE_FORMAT)

    # ── stdout handler ────────────────────────────────────────────────────
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setLevel(logging.INFO)
    stdout_handler.setFormatter(fmt)

    # ── rotating file handler (5 MB × 3 backups) ─────────────────────────
    file_handler = RotatingFileHandler(
        _LOG_FILE,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)

    root.addHandler(stdout_handler)
    root.addHandler(file_handler)

    _configured = True


def get_logger(name: str) -> logging.Logger:
    """Return a named logger, configuring the root logger on first call."""
    _configure()
    return logging.getLogger(name)


def read_log_tail(n: int = 50) -> list[str]:
    """
    Read the last *n* lines from the log file.
    Returns an empty list if the file does not exist yet.
    """
    if not os.path.isfile(_LOG_FILE):
        return []
    try:
        with open(_LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        return [line.rstrip("\n") for line in lines[-n:]]
    except OSError:
        return []
