import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SystemAPI } from '../services/api'
import osToast from './OS/osToast';
const toast = osToast;
import { useTranslation } from 'react-i18next'
import ConfirmDialog from './ConfirmDialog'

// ── Icons ─────────────────────────────────────────────────────────────────────
function FolderIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function ShortcutIcon() {
  return (
    <span className="relative inline-flex shrink-0">
      <svg className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <svg className="absolute -bottom-0.5 -right-1 w-2.5 h-2.5 text-[var(--accent)] bg-[var(--bg-card)] rounded-sm" fill="currentColor" viewBox="0 0 24 24">
        <path d="M5 3l14 9-14 9V3z" />
      </svg>
    </span>
  )
}

function SpinnerIcon({ className }) {
  return (
    <svg className={`animate-spin ${className ?? 'w-4 h-4'}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function ChevronUp() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  )
}


// ── Main ──────────────────────────────────────────────────────────────────────
export default function FolderBrowserModal({ onConfirm, onClose }) {
  const { t } = useTranslation()
  const [drives, setDrives] = useState([])
  const [currentPath, setCurrentPath] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState(null)
  const [showElevateDialog, setShowElevateDialog] = useState(false)

  // ── Navigation history ─────────────────────────────────────────────────────
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < history.length - 1

  // Address bar
  const [addressValue, setAddressValue] = useState('')
  const addressRef = useRef(null)

  useEffect(() => { setAddressValue(currentPath ?? '') }, [currentPath])

  // Load drives on mount
  useEffect(() => {
    SystemAPI.getDrives()
      .then(({ data }) => setDrives(data.drives ?? []))
      .catch(() => setError('Failed to load drives.'))
  }, [])

  // ── Core loader (does NOT push history) ───────────────────────────────────
  const _loadPath = useCallback(async (path) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await SystemAPI.getFolders(path)
      if (data.code === 'PERMISSION_DENIED') {
        setShowElevateDialog(true)
        setLoading(false)
        return false
      }
      setCurrentPath(data.path)
      setEntries(data.entries ?? (data.folders ?? []).map((n) => ({ name: n, type: 'dir' })))
      return true
    } catch (err) {
      const body = err.response?.data
      if (body?.code === 'PERMISSION_DENIED') {
        setShowElevateDialog(true)
      } else {
        setError(body?.message ?? err.message ?? 'Failed to open folder.')
      }
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Navigate (pushes to history) ──────────────────────────────────────────
  const navigateTo = useCallback(async (path) => {
    const ok = await _loadPath(path)
    if (!ok) return
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1)
      next.push(path)
      return next
    })
    setHistoryIndex((prev) => prev + 1)
  }, [_loadPath, historyIndex])

  // ── Back / Forward ────────────────────────────────────────────────────────
  const goBack = useCallback(async () => {
    if (!canGoBack) return
    const newIdx = historyIndex - 1
    await _loadPath(history[newIdx])
    setHistoryIndex(newIdx)
  }, [canGoBack, historyIndex, history, _loadPath])

  const goForward = useCallback(async () => {
    if (!canGoForward) return
    const newIdx = historyIndex + 1
    await _loadPath(history[newIdx])
    setHistoryIndex(newIdx)
  }, [canGoForward, historyIndex, history, _loadPath])

  // ── Desktop quick-access ──────────────────────────────────────────────────
  const goToDesktop = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await SystemAPI.getDesktop()
      await navigateTo(data.path)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not find Desktop.')
      setLoading(false)
    }
  }, [navigateTo])

  // ── .lnk resolution ──────────────────────────────────────────────────────
  const resolveShortcut = useCallback(async (lnkName) => {
    if (!currentPath) return
    const sep = currentPath.includes('/') ? '/' : '\\'
    const lnkPath = currentPath.replace(/[/\\]$/, '') + sep + lnkName
    try {
      const { data } = await SystemAPI.resolveShortcut(lnkPath)
      toast.success(`${t('folder_browser.shortcut')} resolved \u2192 ${data.target}`)
      onConfirm(data.target)
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Could not resolve shortcut.')
    } finally {
      setResolving(false)
    }
  }, [currentPath, onConfirm, t])

  // ── Elevation ─────────────────────────────────────────────────────────────
  const handleElevate = async () => {
    setShowElevateDialog(false)
    toast.info(t('admin.restarting'), { duration: 6000 })
    try { await SystemAPI.elevate() } catch { /* expected */ }
  }

  // ── Address bar ───────────────────────────────────────────────────────────
  const handleAddressGo = () => {
    const val = addressValue.trim()
    if (val) navigateTo(val)
  }

  const handleAddressKeyDown = (e) => {
    if (e.key === 'Enter') handleAddressGo()
    if (e.key === 'Escape') { setAddressValue(currentPath ?? ''); addressRef.current?.blur() }
  }

  // ── Breadcrumbs ───────────────────────────────────────────────────────────
  const breadcrumbs = currentPath
    ? currentPath.replace(/\\/g, '/').split('/').filter(Boolean)
    : []

  const navigateToBreadcrumb = (index) => {
    const parts = breadcrumbs.slice(0, index + 1)
    navigateTo(parts.join('/') + '/')
  }

  const navigateUp = () => {
    if (!currentPath) return
    const parts = currentPath.replace(/\\/g, '/').replace(/\/$/, '').split('/')
    if (parts.length <= 1) return
    parts.pop()
    navigateTo(parts.join('/') + '/')
  }

  const openEntry = (entry) => {
    if (entry.type === 'lnk') { resolveShortcut(entry.name); return }
    const sep = currentPath?.includes('/') ? '/' : '\\'
    navigateTo((currentPath ?? '').replace(/[/\\]$/, '') + sep + entry.name)
  }

  // ── Active state helpers ──────────────────────────────────────────────────
  const isActiveDrive = (drive) =>
    (currentPath ?? '').replace(/\\/g, '/').startsWith(drive.replace(/\\/g, '/'))

  const isDesktopActive = (currentPath ?? '').replace(/\\/g, '/').toLowerCase().includes('/desktop')

  // ── Style helpers ─────────────────────────────────────────────────────────
  const navBtnCls = (enabled) =>
    [
      'h-7 w-7 rounded-md flex items-center justify-center transition-colors touch-manipulation shrink-0',
      enabled
        ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer'
        : 'text-[var(--text-muted)] opacity-30 cursor-not-allowed',
    ].join(' ')

  const tabCls = (active) =>
    [
      'shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors touch-manipulation border',
      active
        ? 'bg-blue-600 dark:bg-zinc-800 text-white border-blue-600 dark:border-zinc-700'
        : 'bg-transparent text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-[var(--text-primary)]',
    ].join(' ')

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <AnimatePresence>
        {/* Backdrop */}
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 hidden md:block"
        />

        {/* Modal panel */}
        <motion.div
          key="modal"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="fixed z-50 inset-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[82vh] bg-[var(--bg-card)] flex flex-col overflow-hidden rounded-t-2xl md:rounded-xl border-t border-[var(--border)] md:border shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--border)] shrink-0">
            <h2 className="font-semibold text-sm text-[var(--text-primary)]">{t('folder_browser.title')}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors touch-manipulation"
            >
              {'\u2715'}
            </button>
          </div>

          {/* Drive + Desktop tabs */}
          <div className="px-4 sm:px-5 py-2 border-b border-[var(--border)] shrink-0">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              <button onClick={goToDesktop} className={tabCls(isDesktopActive)}>
                {t('folder_browser.desktop')}
              </button>
              {drives.map((drive) => (
                <button
                  key={drive}
                  onClick={() => navigateTo(drive)}
                  className={tabCls(isActiveDrive(drive) && !isDesktopActive)}
                >
                  {drive}
                </button>
              ))}
            </div>
          </div>

          {/* Address bar: [<] [>] [^] | [input] [Go] */}
          <div className="px-4 sm:px-5 py-2.5 border-b border-[var(--border)] shrink-0 flex items-center gap-1.5">
            <button onClick={goBack} disabled={!canGoBack} className={navBtnCls(canGoBack)} title={t('folder_browser.back_hint')}>
              <ChevronLeft />
            </button>
            <button onClick={goForward} disabled={!canGoForward} className={navBtnCls(canGoForward)} title={t('folder_browser.forward_hint')}>
              <ChevronRight />
            </button>
            <button onClick={navigateUp} disabled={!currentPath} className={navBtnCls(!!currentPath)} title={t('folder_browser.go_up_hint')}>
              <ChevronUp />
            </button>

            <div className="w-px h-4 bg-[var(--border)] shrink-0 mx-0.5" />

            <input
              ref={addressRef}
              type="text"
              value={addressValue}
              onChange={(e) => setAddressValue(e.target.value)}
              onKeyDown={handleAddressKeyDown}
              placeholder={t('folder_browser.address_placeholder')}
              className="flex-1 h-8 px-3 rounded-md text-sm bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors font-mono"
            />

            <button
              onClick={handleAddressGo}
              disabled={!addressValue.trim()}
              className="h-8 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold disabled:opacity-40 transition-colors touch-manipulation shrink-0"
            >
              {t('folder_browser.go')}
            </button>
          </div>

          {/* Breadcrumb */}
          {currentPath && (
            <div className="px-4 sm:px-5 py-1.5 border-b border-[var(--border)] flex items-center gap-1 flex-nowrap text-xs text-[var(--text-muted)] shrink-0 overflow-x-auto scrollbar-none">
              {breadcrumbs.map((seg, i) => (
                <React.Fragment key={i}>
                  <button
                    onClick={() => navigateToBreadcrumb(i)}
                    className="hover:text-[var(--accent)] transition-colors truncate max-w-[90px] sm:max-w-[130px] touch-manipulation shrink-0"
                    title={seg}
                  >
                    {seg}
                  </button>
                  {i < breadcrumbs.length - 1 && <span className="shrink-0 opacity-40">/</span>}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* File list */}
          <div className="flex-1 overflow-y-auto px-2 sm:px-3 py-2 relative">
            {resolving && (
              <div className="absolute inset-0 bg-[var(--bg-card)]/80 flex items-center justify-center z-10 gap-2 text-[var(--text-muted)]">
                <SpinnerIcon className="w-5 h-5" />
                <span className="text-sm">{t('folder_browser.resolving')}</span>
              </div>
            )}

            {!currentPath && !loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--text-muted)]">
                <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <p className="text-sm text-center">{t('common.select_drive')}</p>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-12 gap-2 text-[var(--text-muted)]">
                <SpinnerIcon />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            )}

            {error && <p className="text-sm text-red-500 text-center py-8">{error}</p>}

            {!loading && !error && entries.length === 0 && currentPath && (
              <p className="text-sm text-[var(--text-muted)] text-center py-10">{t('folder_browser.no_folders')}</p>
            )}

            {!loading && entries.map((entry) => (
              <button
                key={entry.name}
                onClick={() => openEntry(entry)}
                className="w-full flex items-center gap-3 px-3 py-3 sm:py-2.5 rounded-lg text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors group touch-manipulation"
              >
                {entry.type === 'lnk' ? <ShortcutIcon /> : <FolderIcon />}
                <span className="flex-1 truncate">{entry.name}</span>
                {entry.type === 'lnk' && (
                  <span className="text-xs text-[var(--accent)] opacity-70 shrink-0 hidden sm:block">{t('folder_browser.shortcut')} {'\u2192'}</span>
                )}
                {entry.type === 'dir' && (
                  <span className="text-[var(--text-muted)] opacity-0 group-hover:opacity-60 transition-opacity text-xs hidden sm:block">{t('folder_browser.open')} {'\u2192'}</span>
                )}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-5 py-3 border-t border-[var(--border)] flex items-center gap-2 shrink-0">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--text-muted)] truncate" title={currentPath ?? ''}>
                {currentPath ? t('folder_browser.selected_hint', { path: currentPath }) : t('common.no_folder')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-md text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors touch-manipulation"
            >
              {t('common.cancel')}
            </button>
            <motion.button
              whileHover={currentPath ? { scale: 1.02 } : {}}
              whileTap={currentPath ? { scale: 0.98 } : {}}
              onClick={() => currentPath && onConfirm(currentPath)}
              disabled={!currentPath}
              className={[
                'px-4 sm:px-5 py-2 rounded-md text-sm font-semibold transition-all touch-manipulation',
                currentPath
                  ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white'
                  : 'bg-[var(--accent)]/20 text-[var(--accent)]/40 cursor-not-allowed',
              ].join(' ')}
            >
              {t('folder_browser.select_btn')}
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Elevation dialog */}
      <AnimatePresence>
        {showElevateDialog && (
          <ConfirmDialog
            title={t('admin.dialog_title')}
            message={t('admin.dialog_msg')}
            confirmText={t('admin.restart_btn')}
            cancelText={t('common.cancel')}
            onConfirm={handleElevate}
            onCancel={() => setShowElevateDialog(false)}
            type="warning"
          />
        )}
      </AnimatePresence>
    </>
  )
}
