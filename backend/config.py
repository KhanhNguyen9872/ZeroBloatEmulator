"""
backend/config.py – Centralised configuration for ZeroBloatEmulator backend.

All hardcoded paths, ports, and credentials live here.
Import this module instead of scattering constants across core files.
"""

import os

# ---------------------------------------------------------------------------
# Base paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------
HOST = "0.0.0.0"
PORT = 5000
DEBUG = True
SECRET_KEY = os.urandom(24).hex()  # Random key on every start
WTF_CSRF_ENABLED = False # User requested temporary disable
WTF_CSRF_TIME_LIMIT = None         # Valid for session duration

# ---------------------------------------------------------------------------
# QEMU / VM
# ---------------------------------------------------------------------------
BASE_DIR_NAME  = "base"
BASE_ASSETS_DIR = os.path.join(BASE_DIR, BASE_DIR_NAME)

QEMU_BIN_DIR   = os.path.join(BASE_ASSETS_DIR, "qemu")
QEMU_EXEC      = "qemu-system-x86_64.exe"
QEMU_EXECUTABLE = os.path.join(QEMU_BIN_DIR, QEMU_EXEC)

WORKER_IMAGE   = os.path.join(BASE_ASSETS_DIR, "image", "worker.qcow2")

ASSETS_URL     = "https://github.com/KhanhNguyen9872/ZeroBloatEmulator/releases/download/base-1.0.0/base.zip"
ASSETS_SHA256  = "PLACEHOLDER_HASH_UPDATE_ME"

VM_RAM         = "512"          # MB passed to QEMU -m flag

# ---------------------------------------------------------------------------
# SSH (worker VM)
# ---------------------------------------------------------------------------
SSH_HOST       = "localhost"
SSH_PORT       = 10022
SSH_USER       = "root"
SSH_PASS       = "KhanhNguyen9872"       # Change to key-based auth in production

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE       = os.path.join(BASE_DIR, "logs", "app.log")

# ---------------------------------------------------------------------------
# Android disk mount
# ---------------------------------------------------------------------------
MOUNT_POINT         = "/mnt/android"
DRIVE1_CANDIDATES   = ["/dev/vdb2", "/dev/vdb1", "/dev/vdb", "/dev/sdb2", "/dev/sdb1", "/dev/sdb"]
