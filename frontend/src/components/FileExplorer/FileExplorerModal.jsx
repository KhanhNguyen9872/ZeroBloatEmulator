import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Folder, File, FileCode, Archive,
  ChevronRight, ChevronUp, RefreshCw, X,
  FolderPlus, Upload, ArrowUpDown, Check, Trash2, Square, CheckSquare,
  Search, Copy, UploadCloud
} from 'lucide-react'
import { FileExplorerAPI } from '../../services/api'
import FileEditorModal from './FileEditorModal'
import ConfirmDialog from '../ConfirmDialog'
import ConflictDialog from '../ConflictDialog'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(dateStr) {
  return dateStr || '—'
}

function getIcon(item) {
  if (item.type === 'dir')
    return <Folder className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
  const ext = item.name.split('.').pop().toLowerCase()
  if (['apk', 'sh', 'py', 'js', 'ts', 'json', 'xml'].includes(ext))
    return <FileCode className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
  if (['zip', 'gz', 'tar', 'bz2', 'xz', 'rar', '7z'].includes(ext))
    return <Archive className="w-4 h-4 text-purple-500 dark:text-purple-400 shrink-0" />
  return <File className="w-4 h-4 text-zinc-400 shrink-0" />
}

function isArchive(name) {
  return /\.(zip|tar\.gz|tgz|gz|tar|rar|7z|iso|wim|apk)$/i.test(name)
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-md animate-pulse">
          <div className="w-4 h-4 rounded bg-zinc-300 dark:bg-zinc-700 shrink-0" />
          <div
            className="h-3.5 rounded bg-zinc-200 dark:bg-zinc-700 flex-1"
            style={{ width: `${40 + (i * 13) % 45}%` }}
          />
          <div className="h-3 rounded bg-zinc-200 dark:bg-zinc-700/70 w-16" />
          <div className="h-3 rounded bg-zinc-200 dark:bg-zinc-700/70 w-20" />
        </div>
      ))}
    </div>
  )
}

// ── Context Menu ──────────────────────────────────────────────────────────────

function ContextMenu({ x, y, item, currentPath, onClose, onRefresh, onOpenEditor, onOpenBinaryDialog, onChecksum, onDelete }) {
  const menuRef = useRef(null)
  const { t } = useTranslation()

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const targetPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`

  const handleRename = async () => {
    onClose()
    const newName = window.prompt('New name:', item.name)
    if (!newName || newName === item.name) return
    // Compute new path: same parent, new filename
    const parentPath = currentPath === '/' ? '' : currentPath
    const newPath = `${parentPath}/${newName}`
    try {
      await FileExplorerAPI.rename(targetPath, newPath)
      toast.success(`Renamed to "${newName}"`)
      onRefresh()
    } catch (err) {
      toast.error(`Rename failed: ${err.response?.data?.message ?? err.message}`)
    }
  }

  const handleDelete = () => {
    onClose()
    onDelete(item)
  }

  const handleExtract = async () => {
    onClose()
    try {
      const { FileExplorerAPI: api } = await import('../../services/api')
      const apiClient = (await import('../../services/api')).default
      toast.info('Extracting with 7-Zip…')
      await apiClient.post('/api/core/files/extract', { path: targetPath, dest_path: currentPath })
      toast.success('Extracted successfully')
      onRefresh()
    } catch (err) {
      toast.error(`Extract failed: ${err.response?.data?.message ?? err.message}`)
    }
  }

  const handleDownload = async () => {
    onClose()
    try {
      toast.info(`Downloading "${item.name}"…`)
      await FileExplorerAPI.download(targetPath, item.name)
    } catch (err) {
      toast.error(`Download failed: ${err.response?.data?.message ?? err.message}`)
    }
  }

  const handleEdit = async () => {
    onClose()
    // Show a toast while detecting
    const tid = toast.loading(`Opening ${item.name}…`)
    try {
      const { data } = await FileExplorerAPI.getContent(targetPath)
      toast.dismiss(tid)
      if (data.is_binary) {
        onOpenBinaryDialog({ path: targetPath, name: item.name })
      } else {
        onOpenEditor(targetPath)
      }
    } catch (err) {
      toast.dismiss(tid)
      toast.error(`Cannot open file: ${err.response?.data?.message ?? err.message}`)
    }
  }

  const handleChecksumClick = (algo) => {
    onClose()
    onChecksum(item, targetPath, algo)
  }



  return (
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[168px] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl py-1 text-sm"
      style={{ top: y, left: x }}
    >
      <button
        onClick={handleRename}
        className="w-full text-left px-4 py-2 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] transition-colors"
      >
        {t('file_explorer.rename')}
      </button>
      {item.type === 'file' && (
        <>
          <button
            onClick={handleEdit}
            className="w-full text-left px-4 py-2 hover:bg-[var(--bg-secondary)] text-emerald-600 dark:text-emerald-400 transition-colors"
          >
            {t('file_explorer.edit', 'Edit')}
          </button>
          <button
            onClick={handleDownload}
            className="w-full text-left px-4 py-2 hover:bg-[var(--bg-secondary)] text-blue-600 dark:text-blue-400 transition-colors"
          >
            {t('file_explorer.download')}
          </button>
          <hr className="my-1 border-[var(--border)]" />
          <button
            onClick={() => handleChecksumClick('sha256')}
            className="w-full text-left px-4 py-2 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] transition-colors"
          >
            Checksum (SHA256)
          </button>
          <button
            onClick={() => handleChecksumClick('md5')}
            className="w-full text-left px-4 py-2 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] transition-colors"
          >
            Checksum (MD5)
          </button>
          <hr className="my-1 border-[var(--border)]" />
        </>
      )}
      <button
        onClick={handleDelete}
        className="w-full text-left px-4 py-2 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 transition-colors"
      >
        {t('file_explorer.delete')}
      </button>
      {isArchive(item.name) && (
        <button
          onClick={handleExtract}
          className="w-full text-left px-4 py-2 hover:bg-[var(--bg-secondary)] text-purple-600 dark:text-purple-400 transition-colors"
        >
          {t('file_explorer.extract')}
        </button>
      )}
    </div>
  )
}

// ── Binary File Dialog ────────────────────────────────────────────────

function BinaryFileDialog({ file, onClose, onDownload }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <span className="text-3xl mt-0.5">💾</span>
          <div>
            <h3 className="font-bold text-[var(--text-primary)] text-base">Binary File Detected</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 leading-relaxed">
              <span className="font-medium text-[var(--text-primary)]">{file?.name}</span> contains binary
              data and cannot be edited as text. Use the Download option to view or edit it locally.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => { onClose(); onDownload() }}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            ⬇️ Download
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Checksum Dialog ──────────────────────────────────────────────────────
function ChecksumDialog({ data, onClose }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(data.hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Hash copied to clipboard')
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            <FileCode className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-[var(--text-primary)] text-base">File Checksum</h3>
            <p className="text-sm text-[var(--text-muted)] truncate">{data.name}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {data.algo.toUpperCase()}
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-3 py-2 text-xs font-mono text-[var(--text-primary)] break-all">
              {data.hash}
            </code>
            <button
              onClick={handleCopy}
              className="p-2 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border)]"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function FileExplorerModal({ onClose }) {
  const [currentPath, setCurrentPath] = useState('/')
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)              // single hover-selected row
  const [bulkSelected, setBulkSelected] = useState(new Set()) // multi-select paths
  const [contextMenu, setContextMenu] = useState(null)
  const [sortKey, setSortKey] = useState('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef = useRef(null)
  const fileInputRef = useRef(null)
  // Editor states
  const [editorPath, setEditorPath] = useState(null)     // truthy → open FileEditorModal
  const [binaryFile, setBinaryFile] = useState(null)     // truthy → open BinaryFileDialog
  const [checksumData, setChecksumData] = useState(null) // truthy → open ChecksumDialog { name, algo, hash }

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  // Bulk delete state
  const [deletingBulk, setDeletingBulk] = useState(false)

  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false })
  const [conflictDialog, setConflictDialog] = useState({ isOpen: false, file: null, originalFile: null })

  // Drag & Drop
  const [isDragging, setIsDragging] = useState(false)

  // ── Fetch files ──────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async (path) => {
    setLoading(true)
    setSelected(null)
    setBulkSelected(new Set())
    setIsSearching(false)
    setSearchQuery('')
    try {
      const { data } = await FileExplorerAPI.list(path)
      setFiles(data.files ?? [])
    } catch (err) {
      toast.error(`Failed to list files: ${err.response?.data?.message ?? err.message}`)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFiles(currentPath)
  }, [currentPath, fetchFiles])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Navigation ───────────────────────────────────────────────────────────

  const navigateTo = (path) => {
    setContextMenu(null)
    setCreatingFolder(false)
    setBulkSelected(new Set())
    setCurrentPath(path)
  }

  const navigateUp = () => {
    if (currentPath === '/') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigateTo(parts.length === 0 ? '/' : '/' + parts.join('/'))
  }

  const handleDoubleClick = (item) => {
    if (item.type === 'dir') {
      navigateTo(currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`)
    }
  }

  // ── Breadcrumb ───────────────────────────────────────────────────────────

  const breadcrumbs = ['/', ...currentPath.split('/').filter(Boolean)]

  // ── Sort ─────────────────────────────────────────────────────────────────

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    let cmp = 0
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
    else cmp = a.size - b.size
    return sortAsc ? cmp : -cmp
  })

  // ── Search ──────────────────────────────────────────────────────────────

  const handleSearch = async (e) => {
    if (e.key === 'Enter' || e.type === 'click') {
      if (!searchQuery.trim()) return
      setLoading(true)
      setIsSearching(true)
      setBulkSelected(new Set())
      try {
        const { data } = await FileExplorerAPI.search(currentPath, searchQuery)
        setSearchResults(data.results ?? [])
      } catch (err) {
        toast.error(`Search failed: ${err.message}`)
        setSearchResults([])
      } finally {
        setLoading(false)
      }
    }
  }

  const clearSearch = () => {
    setIsSearching(false)
    setSearchQuery('')
    setSearchResults([])
    // fetchFiles(currentPath) // Optional, but we likely already have the files
  }

  const displayList = isSearching ? searchResults : sorted

  // ── Checksum Handler ─────────────────────────────────────────────────────

  const handleChecksum = async (item, path, algo) => {
    const tid = toast.loading(`Calculating ${algo.toUpperCase()}...`)
    try {
      const { data } = await FileExplorerAPI.checksum(path, algo)
      setChecksumData({ name: item.name, algo, hash: data.hash })
      toast.dismiss(tid)
    } catch (err) {
      toast.dismiss(tid)
      toast.error(`Checksum failed: ${err.message}`)
    }
  }

  // ── Create Folder ────────────────────────────────────────────────────────

  const startCreateFolder = () => {
    setCreatingFolder(true)
    setNewFolderName('')
    setTimeout(() => newFolderInputRef.current?.focus(), 50)
  }

  const confirmCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolder(false); return }
    const targetPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
    try {
      await FileExplorerAPI.mkdir(targetPath)
      toast.success(`Folder "${name}" created`)
      setCreatingFolder(false)
      fetchFiles(currentPath)
    } catch (err) {
      toast.error(`Failed to create folder: ${err.response?.data?.message ?? err.message}`)
    }
  }

  // ── Upload ───────────────────────────────────────────────────────────────

  const uploadFile = async (file) => {
    if (!file) return
    const toastId = toast.loading(`Uploading "${file.name}"…`)
    try {
      await FileExplorerAPI.upload(file, currentPath)
      toast.success(`"${file.name}" uploaded`, { id: toastId })
      fetchFiles(currentPath)
    } catch (err) {
      if (err.response?.status === 409) {
          toast.dismiss(toastId)
          setConflictDialog({ isOpen: true, file: file, originalFile: file }) // Keep ref to original blob
      } else {
          toast.error(`Upload failed: ${err.response?.data?.message ?? err.message}`, { id: toastId })
      }
    }
  }

  const handleConflictOverwrite = async () => {
      const { file } = conflictDialog
      if (!file) return
      setConflictDialog({ isOpen: false, file: null, originalFile: null })
      
      const toastId = toast.loading(`Overwriting "${file.name}"…`)
      try {
          await FileExplorerAPI.upload(file, currentPath, true) // Pass overwrite=true (need to update API wrapper too or manually call)
          toast.success(`"${file.name}" overwritten`, { id: toastId })
          fetchFiles(currentPath)
      } catch (err) {
          toast.error(`Overwrite failed: ${err.response?.data?.message ?? err.message}`, { id: toastId })
      }
  }

  const handleConflictRename = async (newName) => {
      const { originalFile } = conflictDialog
      if (!originalFile) return
      setConflictDialog({ isOpen: false, file: null, originalFile: null })
      
      // Create new File object with new name
      const renamedFile = new File([originalFile], newName, { type: originalFile.type })
      uploadFile(renamedFile) // Retry upload with new name
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (file) await uploadFile(file)
    e.target.value = ''
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        await uploadFile(files[i])
      }
    }
  }

  // ── Delete Actions ──────────────────────────────────────────────────────

  const handleSingleDeleteRequest = (item) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Item',
      message: `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      type: 'danger',
      onConfirm: async () => {
        const targetPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
        try {
          await FileExplorerAPI.delete(targetPath)
          toast.success(`"${item.name}" deleted`)
          fetchFiles(currentPath)
        } catch (err) {
          toast.error(`Delete failed: ${err.response?.data?.message ?? err.message}`)
        } finally {
          setConfirmDialog({ isOpen: false })
        }
      }
    })
  }

  // ── Context menu ─────────────────────────────────────────────────────────

  const handleContextMenu = (e, item) => {
    e.preventDefault()
    setSelected(item.name)
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }

  // ── Bulk select helpers ───────────────────────────────────────────────────

  const toggleBulk = (name) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const selectAll = () => setBulkSelected(new Set(displayList.map(i => i.name)))
  const deselectAll = () => setBulkSelected(new Set())

  const handleBulkDelete = () => {
    if (bulkSelected.size === 0) return
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Multiple Items',
      message: `Are you sure you want to delete ${bulkSelected.size} item(s)? This cannot be undone.`,
      confirmText: deletingBulk ? 'Deleting...' : 'Delete All',
      type: 'danger',
      onConfirm: async () => {
         await executeBulkDelete()
         setConfirmDialog({ isOpen: false })
      }
    })
  }

  const executeBulkDelete = async () => {
    setDeletingBulk(true)
    const items = [...bulkSelected]
    let ok = 0, fail = 0
    for (const name of items) {
      const itemPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
      try {
        await FileExplorerAPI.delete(itemPath)
        ok++
      } catch {
        fail++
      }
    }
    setDeletingBulk(false)
    setBulkSelected(new Set())
    if (ok)   toast.success(`Deleted ${ok} item(s)`)
    if (fail) toast.error(`Failed to delete ${fail} item(s)`)
    fetchFiles(currentPath)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const isBulkMode = bulkSelected.size > 0

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm md:p-4">
      {/* Editor Modal */}
      <AnimatePresence>
        {editorPath && (
          <FileEditorModal
            filePath={editorPath}
            onClose={() => setEditorPath(null)}
            onDownload={() => {
              setEditorPath(null)
              const name = editorPath.split('/').pop()
              toast.info(`Downloading "${name}"…`)
              FileExplorerAPI.download(editorPath, name)
            }}
          />
        )}
      </AnimatePresence>

      {/* Binary File Dialog */}
      <AnimatePresence>
        {binaryFile && (
          <BinaryFileDialog
            file={binaryFile}
            onClose={() => setBinaryFile(null)}
            onDownload={() => {
              const { path, name } = binaryFile
              toast.info(`Downloading "${name}"…`)
              FileExplorerAPI.download(path, name)
            }}
          />
        )}
      </AnimatePresence>

      {/* Checksum Dialog */}
      <AnimatePresence>
        {checksumData && (
          <ChecksumDialog
            data={checksumData}
            onClose={() => setChecksumData(null)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />

      <ConflictDialog
        isOpen={conflictDialog.isOpen}
        filename={conflictDialog.file?.name || ''}
        onOverwrite={handleConflictOverwrite}
        onRename={handleConflictRename}
        onCancel={() => setConflictDialog({ isOpen: false, file: null, originalFile: null })}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18 }}
        className="
          flex flex-col overflow-hidden shadow-2xl
          bg-[var(--bg-card)] border-[var(--border)]
          fixed inset-0 w-full h-full rounded-none
          md:relative md:inset-auto md:w-[90vw] md:h-[85vh] md:max-w-7xl md:rounded-xl md:border
        "
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag Overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-zinc-100/90 dark:bg-zinc-900/90 border-2 border-dashed border-[var(--accent)] rounded-lg flex flex-col items-center justify-center pointer-events-none"
            >
               <UploadCloud className="w-16 h-16 text-[var(--accent)] mb-4" />
               <p className="text-xl font-bold text-[var(--text-primary)]">Drop files to upload</p>
               <p className="text-sm text-[var(--text-muted)] mt-1">to {currentPath}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
          <span className="hidden lg:inline text-sm font-semibold text-[var(--text-primary)] mr-1">📂 File Explorer</span>

          {/* Search Bar */}
          <div className="flex items-center gap-2 bg-[var(--bg-primary)] px-2 py-1 rounded-md border border-[var(--border)] focus-within:ring-1 focus-within:ring-blue-500/50 mx-2">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              placeholder="Search..."
              className="bg-transparent border-none outline-none text-xs w-24 md:w-40 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            {isSearching && (
              <button onClick={clearSearch} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-hide bg-[var(--bg-primary)] rounded-md px-2 py-1">
            {breadcrumbs.map((seg, idx) => {
              const path = idx === 0 ? '/' : '/' + breadcrumbs.slice(1, idx + 1).join('/')
              const isLast = idx === breadcrumbs.length - 1
              return (
                <React.Fragment key={idx}>
                  <button
                    onClick={() => !isLast && navigateTo(path)}
                    className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap transition-colors
                      ${isLast
                        ? 'text-[var(--text-primary)] font-semibold cursor-default'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer'
                      }`}
                  >
                    {idx === 0 ? '/' : seg}
                  </button>
                  {!isLast && <ChevronRight className="w-3 h-3 text-[var(--text-muted)] opacity-50 shrink-0" />}
                </React.Fragment>
              )
            })}
          </div>

          {/* Nav buttons */}
          <button
            onClick={navigateUp}
            disabled={currentPath === '/'}
            title="Up one level"
            className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => fetchFiles(currentPath)}
            disabled={loading}
            title="Refresh"
            className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0 h-[50px]">
          {isBulkMode ? (
            /* Bulk Actions Toolbar */
            <div className="flex items-center gap-3 w-full animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200 dark:border-blue-800">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{bulkSelected.size} selected</span>
              </div>
              
              <div className="h-4 w-px bg-[var(--border)] mx-1" />

              <button
                onClick={handleBulkDelete}
                disabled={deletingBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                {deletingBulk ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Selected
              </button>

              <button
                onClick={deselectAll}
                className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            /* Standard Toolbar */
            <>
              <button
                onClick={startCreateFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] text-xs font-medium transition-colors"
                title="Create New Folder"
              >
                <FolderPlus className="w-3.5 h-3.5" /> New Folder
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] text-xs font-medium transition-colors"
                title="Upload Files"
              >
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />

              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => toggleSort('name')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                    ${sortKey === 'name'
                      ? 'bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                    }`}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  Name {sortKey === 'name' && (sortAsc ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => toggleSort('size')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                    ${sortKey === 'size'
                      ? 'bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                    }`}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  Size {sortKey === 'size' && (sortAsc ? '↑' : '↓')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── File List ── */}
        <div
          className="flex-1 overflow-y-auto min-h-0 bg-[var(--bg-primary)]"
          onClick={() => { setSelected(null); setContextMenu(null) }}
        >
          {/* Search info bar */}
          {isSearching && (
             <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/10 text-xs text-blue-600 dark:text-blue-400 border-b border-blue-100 dark:border-blue-900/20">
               Found {searchResults.length} results for "{searchQuery}" in "{currentPath}"
             </div>
          )}

          {/* Column headers */}
          <div className="sticky top-0 z-10 grid grid-cols-[32px_1fr_80px_140px] gap-2 px-3 py-2 bg-[var(--bg-secondary)]/80 backdrop-blur-sm text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border)] items-center">
            <div className="flex justify-center">
              <button
                onClick={bulkSelected.size === displayList.length && displayList.length > 0 ? deselectAll : selectAll}
                className="opacity-50 hover:opacity-100"
                title="Select All"
              >
                {displayList.length > 0 && bulkSelected.size === displayList.length ? (
                  <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <span>Name</span>
            <span className="text-right">Size</span>
            <span className="text-right">Modified</span>
          </div>

          {loading ? (
            <Skeleton />
          ) : displayList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-[var(--text-muted)]">
              <Folder className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">{isSearching ? 'No results found' : 'Empty directory'}</p>
            </div>
          ) : (
            <div className="flex flex-col py-1">
              {/* Inline new-folder input row */}
              {creatingFolder && (
                <div className="flex items-center gap-3 px-5 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/40">
                  <FolderPlus className="w-4 h-4 text-amber-500 shrink-0" />
                  <input
                    ref={newFolderInputRef}
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmCreateFolder()
                      if (e.key === 'Escape') setCreatingFolder(false)
                    }}
                    placeholder="New folder name…"
                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    onClick={confirmCreateFolder}
                    className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCreatingFolder(false)}
                    className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {displayList.map((item) => (
                  <div
                    key={item.name}
                    onClick={(e) => {
                      if (e.shiftKey) { toggleBulk(item.name); return }
                      e.stopPropagation(); setSelected(item.name)
                    }}
                    onDoubleClick={() => handleDoubleClick(item)}
                    onContextMenu={(e) => { e.stopPropagation(); handleContextMenu(e, item) }}
                    className={`
                      grid grid-cols-[32px_1fr_80px_140px] gap-2 items-center
                      px-3 py-2.5 cursor-pointer select-none
                      border-b border-[var(--border)]/40 last:border-0
                      transition-colors duration-100 group
                      ${selected === item.name || bulkSelected.has(item.name)
                        ? 'bg-blue-100 dark:bg-blue-600/20 border-blue-300 dark:border-blue-600/30'
                        : 'hover:bg-[var(--bg-secondary)]'
                      }
                    `}
                  >
                    <div className="flex justify-center" onClick={(e) => { e.stopPropagation(); toggleBulk(item.name) }}>
                       {bulkSelected.has(item.name) ? (
                         <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                       ) : (
                         <Square className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 group-hover:dark:text-zinc-500" />
                       )}
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getIcon(item)}
                      <span className="text-sm text-[var(--text-primary)] truncate">{item.name}</span>
                    </div>
                  <span className="text-xs text-[var(--text-muted)] text-right whitespace-nowrap">
                    {item.type === 'dir' ? '—' : formatBytes(item.size)}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] text-right whitespace-nowrap">
                    {formatDate(item.modified)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Status Bar ── */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] text-[11px] text-[var(--text-muted)] shrink-0">
          <span>{displayList.length} item{displayList.length !== 1 ? 's' : ''}</span>
          <span>
            {selected ? `Selected: ${selected}` : 'Right-click an item for options'}
          </span>
        </div>
      </motion.div>

      {/* ── Context Menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            key="ctx"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
          >
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              item={contextMenu.item}
              currentPath={currentPath}
              onClose={() => setContextMenu(null)}
              onRefresh={() => fetchFiles(currentPath)}
              onOpenEditor={setEditorPath}
              onOpenBinaryDialog={setBinaryFile}
              onChecksum={handleChecksum}
              onDelete={handleSingleDeleteRequest}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
