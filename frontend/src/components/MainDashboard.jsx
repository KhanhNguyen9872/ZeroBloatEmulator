import React, { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useBackend } from '../context/BackendContext'
import AppList from './AppList'

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { t } = useTranslation()
  const CONFIG = {
    stopped:  { dot: 'bg-zinc-400',                    cls: 'text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700' },
    starting: { dot: 'bg-amber-400 animate-pulse',     cls: 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700' },
    running:  { dot: 'bg-emerald-400 animate-pulse',   cls: 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' },
  }
  const cfg = CONFIG[status] ?? CONFIG.stopped
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {t(`status.${status}`, status)}
    </span>
  )
}

// ── Log console ───────────────────────────────────────────────────────────────
function LogConsole({ logs }) {
  const { t } = useTranslation()
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  return (
    <div className="rounded-lg border border-[var(--border)] bg-zinc-950 dark:bg-black overflow-hidden flex flex-col h-full">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <span className="text-xs text-zinc-500 ml-2 font-mono">{t('dashboard.log_title')}</span>
      </div>
      {/* Lines */}
      <div className="font-mono text-xs p-3 flex-1 overflow-y-auto space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-zinc-600">{t('dashboard.no_logs')}</span>
        ) : (
          logs.map((line, i) => {
            const color = line.includes('[ERROR]') ? 'text-red-400'
              : line.includes('[WARNING]') ? 'text-amber-400'
              : line.includes('[INFO]') ? 'text-zinc-300'
              : 'text-zinc-500'
            return <div key={i} className={`break-all ${color}`}>{line}</div>
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Shield icon ───────────────────────────────────────────────────────────────
function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MainDashboard({ diskPath, onDisconnect }) {
  const { t } = useTranslation()
  const { isConnected, isAdmin } = useBackend()
  const [coreStatus, setCoreStatus] = useState('stopped')
  const [actionLoading, setActionLoading] = useState(false)
  const [apps, setApps] = useState({})
  const [appsLoading, setAppsLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [logLines, setLogLines] = useState([])
  const pollRef = useRef(null)

  // ── Polling ───────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/core/status')
      setCoreStatus(data.status)
    } catch { setCoreStatus('stopped') }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/logs')
      setLogLines(data.logs ?? [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchStatus(); fetchLogs()
    pollRef.current = setInterval(() => { fetchStatus(); fetchLogs() }, 2000)
    return () => clearInterval(pollRef.current)
  }, [fetchStatus, fetchLogs])

  // Auto-scan when core becomes running
  const prevStatus = useRef(coreStatus)
  useEffect(() => {
    if (prevStatus.current !== 'running' && coreStatus === 'running') handleScanApps()
    prevStatus.current = coreStatus
  }, [coreStatus])

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleSelected = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleStart = async () => {
    if (!isConnected) return
    setActionLoading(true)
    try {
      const { data } = await axios.post('/api/core/start', { image_path: diskPath })
      toast.success(`Core started (PID ${data.pid})`)
      setCoreStatus('starting')
    } catch (err) {
      toast.error(`Failed to start core: ${err.response?.data?.message ?? err.message}`)
    } finally { setActionLoading(false) }
  }

  const handleStop = async () => {
    setActionLoading(true)
    try {
      await axios.post('/api/core/stop')
      toast.success('Core stopped.')
      setCoreStatus('stopped'); setApps({}); setSelected(new Set())
    } catch (err) {
      toast.error(`Failed to stop core: ${err.response?.data?.message ?? err.message}`)
    } finally { setActionLoading(false) }
  }

  const handleScanApps = async () => {
    if (coreStatus !== 'running') return
    setAppsLoading(true)
    try {
      await axios.post('/api/connect', { filepath: diskPath })
      const { data } = await axios.get('/api/apps')
      setApps(data.apps ?? {})
      const total = Object.values(data.apps ?? {}).reduce((s, a) => s + a.length, 0)
      toast.success(`Found ${total} apps`)
    } catch (err) {
      toast.error(`Scan failed: ${err.response?.data?.message ?? err.message}`)
    } finally { setAppsLoading(false) }
  }

  const handleDelete = async () => {
    if (selected.size === 0) return
    setConfirmDelete(false)
    const paths = Array.from(selected).map((id) => `/mnt/android/${id}`)
    setActionLoading(true)
    try {
      const { data } = await axios.post('/api/delete', { paths })
      toast.success(`Deleted ${Object.keys(data.deleted ?? {}).length} app(s)`)
      if (data.errors) {
        for (const [p, e] of Object.entries(data.errors)) {
          toast.error(`Error deleting ${p.split('/').pop()}: ${e}`)
        }
      }
      const { data: appsData } = await axios.get('/api/apps')
      setApps(appsData.apps ?? {}); setSelected(new Set())
    } catch (err) {
      toast.error(`Delete failed: ${err.response?.data?.message ?? err.message}`)
    } finally { setActionLoading(false) }
  }

  const handleExit = async () => {
    setActionLoading(true)
    try { await axios.post('/api/core/stop') } catch { /* best effort */ }
    setActionLoading(false); onDisconnect()
  }

  const isRunning = coreStatus === 'running'
  const busy = actionLoading || appsLoading

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 sm:px-6 py-3 flex items-center gap-3 pr-32 sm:pr-36">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-[var(--accent)] flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{t('dashboard.title')}</h1>
            {isAdmin && (
              <span className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
                <ShieldIcon className="w-3 h-3" />
                {t('admin.badge_short')}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] truncate" title={diskPath}>{diskPath}</p>
        </div>
        <StatusBadge status={coreStatus} />
        <button
          onClick={handleExit}
          disabled={busy}
          className="ml-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 touch-manipulation"
        >
          {t('dashboard.back')}
        </button>
      </header>

      {/* ── Body: responsive grid ── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6 overflow-hidden">

        {/* ── Control panel (left on desktop, top on mobile) ── */}
        <aside className="
          lg:col-span-4
          border-b lg:border-b-0 lg:border-r border-[var(--border)]
          bg-[var(--bg-secondary)]
          flex flex-col gap-4
          p-4 sm:p-5
          overflow-y-auto
          lg:max-h-[calc(100vh-57px)]
        ">
          {/* Core control */}
          <section>
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Micro-VM Core
            </h2>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">{t('dashboard.core_status')}</span>
                <StatusBadge status={coreStatus} />
              </div>

              <AnimatePresence mode="wait">
                {coreStatus === 'stopped' ? (
                  <motion.button
                    key="start"
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    onClick={handleStart}
                    disabled={busy || !isConnected}
                    className="w-full py-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation"
                  >
                    {actionLoading ? t('dashboard.starting') : `▶ ${t('dashboard.start_core')}`}
                  </motion.button>
                ) : (
                  <motion.button
                    key="stop"
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    onClick={handleStop}
                    disabled={busy}
                    className="w-full py-3 rounded-md bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100 text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation"
                  >
                    {actionLoading ? t('dashboard.stopping') : `■ ${t('dashboard.stop_core')}`}
                  </motion.button>
                )}
              </AnimatePresence>

              {coreStatus === 'starting' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  {t('dashboard.waiting_boot')}
                </p>
              )}
            </div>
          </section>

          {/* Scan */}
          <section>
            <button
              onClick={handleScanApps}
              disabled={!isRunning || busy}
              className={`
                w-full py-3 rounded-md text-sm font-semibold transition-all touch-manipulation
                ${isRunning && !busy
                  ? 'bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-card)]/40 border border-[var(--border)]/40 text-[var(--text-muted)] cursor-not-allowed'
                }
              `}
            >
              {appsLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('dashboard.scanning')}
                </span>
              ) : `🔍 ${t('dashboard.scan_apps')}`}
            </button>
          </section>

          {/* Actions */}
          <section>
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Actions</h2>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => selected.size > 0 && setConfirmDelete(true)}
                disabled={!isRunning || busy || selected.size === 0}
                className={`
                  w-full flex items-center justify-center gap-2 py-3 rounded-md text-sm font-semibold transition-all touch-manipulation
                  ${isRunning && selected.size > 0 && !busy
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-red-500/10 text-red-400/50 cursor-not-allowed border border-red-500/20'
                  }
                `}
              >
                🗑 {t('dashboard.delete_selected')}
                {selected.size > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/30 text-xs">{selected.size}</span>
                )}
              </button>
              <button
                onClick={handleExit}
                disabled={busy}
                className="w-full py-3 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors disabled:opacity-40 touch-manipulation"
              >
                {t('dashboard.save_exit')}
              </button>
            </div>
          </section>
        </aside>

        {/* ── Right panel (app list + log) ── */}
        <div className="lg:col-span-8 flex flex-col overflow-hidden">
          {/* App list */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('dashboard.installed_apps')}</h2>
              {isRunning && (
                <button
                  onClick={handleScanApps}
                  disabled={appsLoading || busy}
                  className="text-xs text-[var(--accent)] hover:opacity-80 transition-opacity disabled:opacity-40 touch-manipulation"
                >
                  ↺ {t('dashboard.refresh')}
                </button>
              )}
            </div>
            <AppList apps={apps} selected={selected} onToggle={toggleSelected} loading={appsLoading} />
          </div>

          {/* Log console – fixed height, responsive */}
          <div className="p-3 sm:p-4 border-t border-[var(--border)] shrink-0 h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80">
            <LogConsole logs={logLines} />
          </div>
        </div>
      </main>

      {/* ── Confirm Delete Dialog ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 sm:p-6 w-full max-w-sm shadow-2xl"
          >
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">{t('dashboard.confirm_delete_title')}</h3>
            <p className="text-sm text-[var(--text-muted)] mb-5">
              {t('dashboard.confirm_delete_msg', { count: selected.size })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors touch-manipulation"
              >
                {t('dashboard.cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors touch-manipulation"
              >
                {t('dashboard.delete')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
