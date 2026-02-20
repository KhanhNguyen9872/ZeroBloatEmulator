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


  /** Validate if a path exists on the server. */
  validatePath: (path) =>
    apiClient.post('/api/system/validate-path', { path }),

  /** Request UAC elevation (backend will restart as admin). */
  elevate: () =>
    apiClient.post('/api/system/elevate', {}, { timeout: 3000 }),
}

// ── Core (QEMU VM) ────────────────────────────────────────────────────────────
export const CoreAPI = {
  /**
   * Start the QEMU VM. No body needed — server uses worker.qcow2 from config.
   */
  start: () =>
    apiClient.post('/api/core/start'),

  /** Stop the running QEMU VM. */
  stop: () =>
    apiClient.post('/api/core/stop'),

  /** Get current VM status: 'stopped' | 'starting' | 'running'. */
  getStatus: () =>
    apiClient.get('/api/core/status'),

  /** Mount a host disk image to the running VM. */
  mount: (hostPath) =>
    apiClient.post('/api/core/mount', { path: hostPath }),

  /** Get all currently active hotplug mounts (for shortcut restore on refresh). */
  getMounts: () =>
    apiClient.get('/api/core/mounts'),

  /** Unmount and eject a drive from the VM. */
  eject: (driveId) =>
    apiClient.post('/api/core/eject', { id: driveId }),
}

// ── Host File System ──────────────────────────────────────────────────────────
export const HostAPI = {
  /** List root drives on the host machine. */
  getDrives: () =>
    apiClient.get('/api/host/drives'),

  /** List files & folders at a specific host path. */
  getFiles: (path) =>
    apiClient.get('/api/host/files', { params: { path } }),
}

// ── Apps ──────────────────────────────────────────────────────────────────────
export const AppsAPI = {
  /** Rename an app folder / file. */
  rename: (path, newName) =>
    apiClient.post('/api/apps/rename', { path, new_name: newName }),

  /** Move an app to a new category. */
  move: (path, targetCategoryRoot) =>
    apiClient.post('/api/core/apps/move', { path, targetCategoryRoot }),
  
  moveBatch: (sources, destination) =>
    apiClient.post('/api/core/files/move-batch', { sources, destination }),
  
  scan: () => apiClient.get('/api/core/apps/scan'),
}

// ── Logs ──────────────────────────────────────────────────────────────────────
export const LogsAPI = {
  /** Fetch the last N lines from the backend log. */
  getTail: (n = 50) =>
    apiClient.get('/api/logs', { params: { n } }),

  /** Clear the backend log file. */
  clear: () =>
    apiClient.post('/api/logs/clear'),
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

// ── File Explorer (remote /mnt/android) ───────────────────────────────────────
export const FileExplorerAPI = {
  /** List files in a directory on the mounted Android image. */
  list: (path = '/') =>
    apiClient.get('/api/core/files/list', { params: { path } }),

  /** Create a directory on the mounted Android image. */
  mkdir: (path) =>
    apiClient.post('/api/core/files/mkdir', { path }),

  /** Delete a file or folder on the mounted Android image. */
  delete: (path) =>
    apiClient.post('/api/core/files/delete', { path }),

  /** Rename/move a file or folder (full paths, frontend-relative). */
  rename: (old_path, new_path) =>
    apiClient.post('/api/core/files/rename', { old_path, new_path }),

  /** Upload a file to a directory on the mounted Android image. */
  upload: (file, destPath, overwrite = false) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('path', destPath)
    fd.append('overwrite', overwrite)
    return apiClient.post('/api/core/files/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /**
   * Download a file from the VM as a browser file save.
   * Returns a direct URL string (for window.open or <a> href).
   */
  downloadUrl: (path) =>
    `/api/core/files/download?path=${encodeURIComponent(path)}`,

  /** Fetch file as a blob and trigger browser Save-As dialog. */
  download: async (path, filename) => {
    const resp = await apiClient.get('/api/core/files/download', {
      params: { path },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || path.split('/').pop() || 'download'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 2000)
  },

  /** Read a file's text content from the VM. Returns { content, is_binary }. */
  getContent: (path) =>
    apiClient.get('/api/core/files/content', { params: { path } }),

  /** Overwrite a text file on the VM with new content. */
  saveContent: (path, content) =>
    apiClient.post('/api/core/files/content', { path, content }),

  /** Calculate checksum of a file. algo: 'md5' | 'sha256' */
  checksum: (path, algo = 'sha256') =>
    apiClient.get('/api/core/files/checksum', { params: { path, algo } }),

  /** Search for files. */
  search: (path, query) =>
    apiClient.get('/api/core/files/search', { params: { path, query } }),
}

// ── Apps Export ────────────────────────────────────────────────────────────────
export const AppsExportAPI = {
  /**
   * Export an installed APK from the VM as a browser file save.
   * @param {string} apkPath      - VM path to the APK file (frontend-relative).
   * @param {string} packageName  - Package name used as the download filename.
   */
  export: async (apkPath, packageName) => {
    const resp = await apiClient.get('/api/core/apps/export', {
      params: { path: apkPath, package_name: packageName },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${packageName || 'app'}.apk`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 2000)
  },

  /**
   * Batch export multiple files as a ZIP.
   * @param {Array} files - List of { path, name } objects.
   */
  exportBatch: async (files) => {
    const resp = await apiClient.post('/api/core/apps/export-batch', { files }, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    // Content-Disposition header usually handles filename, but fallback:
    a.download = `exported_apps_${Date.now()}.zip`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 2000)
  },

  /** Returns a direct URL for the export (for window.open). */
  exportUrl: (apkPath, packageName) =>
    `/api/core/apps/export?path=${encodeURIComponent(apkPath)}&package_name=${encodeURIComponent(packageName || '')}`,
}

// HealthAPI full status check — returns is_running + ssh_connected
HealthAPI.check = (timeout = 4000) =>
  apiClient.get('/api/health', { timeout })

export default apiClient
