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
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(fmt)

    root.addHandler(stdout_handler)
    root.addHandler(file_handler)

    # ── Silence verbose third-party loggers ──────────────────────────────
    logging.getLogger("paramiko").setLevel(logging.WARNING)
    logging.getLogger("paramiko.transport").setLevel(logging.CRITICAL)

    _configured = True


def get_logger(name: str) -> logging.Logger:
    """Return a named logger, configuring the root logger on first call."""
    _configure()
    return logging.getLogger(name)


def read_log_tail(n: int = 50) -> list[str]:
    """
    Read the last lines from the log file, filtering for relevant Core/Debloat events.
    """
    if not os.path.isfile(_LOG_FILE):
        return []

    # Keywords to INCLUDE
    whitelist = ["[CORE]", "[DEBLOAT]", "[ERROR]", "Error", "Exception", "Traceback"]
    # Keywords to EXCLUDE (even if whitelist matches, though unlikely for overlap)
    blacklist = ["/api/", "GET /", "POST /", "OPTIONS /", "werkzeug", "[DEBUG]"]

    filtered_lines = []
    try:
        with open(_LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            # Read all lines first (or seek to end for efficiency if file is huge, 
            # but for <5MB logs, reading all is fine)
            for line in f:
                line = line.rstrip("\n")
                if not line:
                    continue
                
                # Check blacklist first
                if any(keyword in line for keyword in blacklist):
                    continue
                
                # Check whitelist
                if any(keyword in line for keyword in whitelist):
                    filtered_lines.append(line)
        
        # Return only the last n filtered lines
        return filtered_lines[-n:]
    except OSError:
        return []


def clear_logs():
    """Truncate the log file to zero bytes."""
    if os.path.isfile(_LOG_FILE):
        try:
            with open(_LOG_FILE, "w", encoding="utf-8") as f:
                f.truncate(0)
            return True
        except OSError:
            return False
    return True
