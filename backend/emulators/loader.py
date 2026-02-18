"""
backend/emulators/loader.py

Auto-discovers all strategy classes in `definitions/` and runs them
against a given path. Returns the first match, or {"type": "Unknown"}.

To add a new emulator:
  1. Create backend/emulators/definitions/my_emu.py
  2. Define class MyEmuStrategy(BaseEmulator) with identifier() and detect()
  3. Done — the loader picks it up automatically.
"""

import importlib
import inspect
import logging
import os
import pkgutil

from backend.emulators.base import BaseEmulator

logger = logging.getLogger(__name__)

# ── Strategy registry (populated once at import time) ─────────────────────────
_STRATEGIES: list[BaseEmulator] = []


def _load_strategies() -> list[BaseEmulator]:
    """Import every module in definitions/ and collect BaseEmulator subclasses."""
    strategies: list[BaseEmulator] = []
    pkg_path = os.path.join(os.path.dirname(__file__), "definitions")
    pkg_name = "backend.emulators.definitions"

    for _finder, module_name, _is_pkg in pkgutil.iter_modules([pkg_path]):
        full_name = f"{pkg_name}.{module_name}"
        try:
            module = importlib.import_module(full_name)
        except Exception as exc:
            logger.warning("Could not import %s: %s", full_name, exc)
            continue

        for _name, obj in inspect.getmembers(module, inspect.isclass):
            if (
                issubclass(obj, BaseEmulator)
                and obj is not BaseEmulator
                and obj.__module__ == full_name
            ):
                strategies.append(obj())
                logger.debug("Registered strategy: %s", obj.__name__)

    return strategies


# Load once at module import
_STRATEGIES = _load_strategies()
logger.info("Loaded %d emulator strategies: %s",
            len(_STRATEGIES), [s.identifier() for s in _STRATEGIES])


# ── Public API ────────────────────────────────────────────────────────────────

def detect_emulator(path: str) -> dict:
    """
    Run all registered strategies against *path*.
    Returns the first match, or {"type": "Unknown"} if none match.
    """
    path = os.path.normpath(path)
    logger.info("Detecting emulator at: %s", path)

    for strategy in _STRATEGIES:
        try:
            result = strategy.detect(path)
            if result is not None:
                logger.info("Matched strategy: %s → type=%s", strategy.identifier(), result.get("type"))
                return result
        except Exception as exc:
            logger.warning("Strategy %s raised an error: %s", strategy.identifier(), exc)

    logger.info("No emulator detected at: %s", path)
    return {"type": "Unknown"}
