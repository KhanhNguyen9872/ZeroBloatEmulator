/**
 * frontend/src/services/api.js
 *
 * Centralised Axios client and named API groups.
 * All components should import from here instead of calling axios directly.
 */

import axios from 'axios'
import { API_BASE_URL, API_TIMEOUT } from '../config'

// ── Shared client ─────────────────────────────────────────────────────────────
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Enable cookies/CSRF
})

// Inject CSRF token if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('csrf_token') // Or store in memory
  if (token) {
    config.headers['X-CSRFToken'] = token
  }
  return config
})

// ── System / File-browser ─────────────────────────────────────────────────────
export const SystemAPI = {
  /** List available disk drives. */
  getDrives: () =>
    apiClient.get('/api/system/drives'),

  /** List folders (and .lnk files) inside a directory. */
  getFolders: (path) =>
    apiClient.post('/api/system/folders', { path }),

  /** Return the current user's Desktop path. */
  getDesktop: () =>
    apiClient.get('/api/system/desktop'),

  /** Resolve a Windows .lnk shortcut to its target path. */
  resolveShortcut: (path) =>
    apiClient.post('/api/system/resolve', { path }),

  /** Check whether the backend is running as Administrator. */
  getAdminStatus: () =>
    apiClient.get('/api/system/admin-status'),

  /** Request UAC elevation (backend will restart as admin). */
  elevate: () =>
    apiClient.post('/api/system/elevate', {}, { timeout: 3000 }),
}

// ── Core (QEMU VM) ────────────────────────────────────────────────────────────
export const CoreAPI = {
  /** Start the QEMU VM with the given disk image path. */
  start: (imagePath) =>
    apiClient.post('/api/core/start', { image_path: imagePath }),

  /** Stop the running QEMU VM. */
  stop: () =>
    apiClient.post('/api/core/stop'),

  /** Get current VM status: 'stopped' | 'starting' | 'running'. */
  getStatus: () =>
    apiClient.get('/api/core/status'),
}

// ── Logs ──────────────────────────────────────────────────────────────────────
export const LogsAPI = {
  /** Fetch the last N lines from the backend log. */
  getTail: (n = 50) =>
    apiClient.get('/api/logs', { params: { n } }),
}

// ── Emulator detection ────────────────────────────────────────────────────────
export const DetectAPI = {
  /** Detect the emulator type in the given folder path. */
  detect: (path) =>
    apiClient.post('/api/detect', { path }),
}

// ── Health ────────────────────────────────────────────────────────────────────
export const HealthAPI = {
  /** Simple liveness probe. */
  ping: (timeout = 3000) =>
    apiClient.get('/api/health', { timeout }),
}

// ── Security ──────────────────────────────────────────────────────────────────
export const SecurityAPI = {
  /** Fetch a new CSRF token from the backend. */
  getCsrfToken: () => 
    apiClient.get('/api/security/csrf-token'),
}

export default apiClient
