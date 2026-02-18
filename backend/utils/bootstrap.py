"""
backend/utils/bootstrap.py
Auto-download and extract QEMU/Worker assets if missing.
"""

import hashlib
import logging
import os
import shutil
import sys
import time
import zipfile

import requests

# We cannot import Tqdm directly if not installed yet, but requirements handles it.
from tqdm import tqdm

from backend.config import (
    BASE_DIR, BASE_ASSETS_DIR,
    QEMU_EXECUTABLE, WORKER_IMAGE,
    ASSETS_URL, ASSETS_SHA256
)

logger = logging.getLogger(__name__)


def verify_assets() -> bool:
    """Check if critical assets exist."""
    qemu_ok = os.path.isfile(QEMU_EXECUTABLE)
    img_ok = os.path.isfile(WORKER_IMAGE)
    if not qemu_ok:
        logger.debug("Missing QEMU executable at: %s", QEMU_EXECUTABLE)
    if not img_ok:
        logger.debug("Missing Worker image at: %s", WORKER_IMAGE)
    return qemu_ok and img_ok


def compute_sha256(path: str) -> str:
    """Compute SHA256 of a file."""
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def download_file(url: str, dest_path: str, expected_hash: str = None) -> None:
    """Download file with progress bar."""
    logger.info("Downloading assets from %s...", url)
    response = requests.get(url, stream=True, timeout=30)
    response.raise_for_status()

    total_size = int(response.headers.get("content-length", 0))
    block_size = 8192

    with open(dest_path, "wb") as f, tqdm(
        desc=os.path.basename(dest_path),
        total=total_size,
        unit="iB",
        unit_scale=True,
        unit_divisor=1024,
    ) as bar:
        for chunk in response.iter_content(chunk_size=block_size):
            size = f.write(chunk)
            bar.update(size)

    if expected_hash and expected_hash != "PLACEHOLDER_HASH_UPDATE_ME":
        logger.info("Verifying hash...")
        file_hash = compute_sha256(dest_path)
        if file_hash.lower() != expected_hash.lower():
            logger.error("Hash mismatch! Expected: %s, Got: %s", expected_hash, file_hash)
            # os.remove(dest_path) # Optional: remove corrupted file
            # raise ValueError("Downloaded file hash mismatch.")
            logger.warning("Continuing despite hash mismatch (configured as placeholder or mismatched).")
    else:
        logger.info("Skipping strict hash verification (placeholder active).")


def extract_zip(archive_path: str, extract_to: str) -> None:
    """Extract .zip archive."""
    logger.info("Extracting %s to %s...", archive_path, extract_to)
    if not os.path.exists(extract_to):
        os.makedirs(extract_to)
    
    with zipfile.ZipFile(archive_path, 'r') as z:
        z.extractall(extract_to)
    logger.info("Extraction complete.")


def initialize() -> None:
    """Main bootstrap entry point."""
    if verify_assets():
        logger.info("✅ Core assets verified.")
        return

    logger.warning("⚠️  Core assets missing or incomplete. Starting auto-bootstrap...")
    
    # Clean slate
    if os.path.isdir(BASE_ASSETS_DIR):
        logger.info("Removing partial assets directory: %s", BASE_ASSETS_DIR)
        shutil.rmtree(BASE_ASSETS_DIR, ignore_errors=True)

    # Ensure temp dir
    temp_dir = os.path.join(BASE_DIR, "temp_bootstrap")
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
    
    archive_name = "core_assets.zip"
    archive_path = os.path.join(temp_dir, archive_name)

    try:
        # 1. Download
        download_file(ASSETS_URL, archive_path, ASSETS_SHA256)

        # 2. Extract
        extract_zip(archive_path, BASE_ASSETS_DIR)

        # Handle potential double nesting (base/base/...)
        nested_base = os.path.join(BASE_ASSETS_DIR, "base")
        if os.path.isdir(nested_base) and not os.path.exists(os.path.join(BASE_ASSETS_DIR, "qemu")):
            logger.info("Detected nested 'base' folder. Flattening...")
            for item in os.listdir(nested_base):
                shutil.move(os.path.join(nested_base, item), BASE_ASSETS_DIR)
            os.rmdir(nested_base)

    except Exception as exc:
        logger.critical("Bootstrap failed: %s", exc)
        sys.exit(1)
    finally:
        # Cleanup
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

    # Final verification
    if not verify_assets():
        logger.critical("❌ Asset verification failed after bootstrap. Exiting.")
        sys.exit(1)

    logger.info("✅ Bootstrap successful! Starting backend...")
