import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderInput, Archive, Trash2, FolderOpen, Plus, Play, Square, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Status Badge Component ────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { t } = useTranslation()
  const CONFIG = {
    stopped:  { dot: 'bg-zinc-400',                    cls: 'text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700' },
    starting: { dot: 'bg-amber-400',                   cls: 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700' },
    running:  { dot: 'bg-emerald-400',                 cls: 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' },
  }
  const cfg = CONFIG[status] ?? CONFIG.stopped
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {t(`status.${status}`, status)}
    </span>
  )
}

export default function ActionPanel({ 
  coreStatus, 
  isAndroidMounted, 
  isConnected, 
  busy, 
  loading, // generic loading for actions
  restartRequired,
  onStart, 
  onStop, 
  onRestart,
  onScan, 
  onDeepScan,
  onAddApp, 
  onOpenFileExplorer,
  selectedCount, 
  onDelete, 
  onMove, 
  onExport,
  scanningType, // 'fast' | 'deep' | null
  packagesLoaded
}) {
  const { t } = useTranslation()
  const isRunning = coreStatus === 'running'
  const isOperational = isRunning && isAndroidMounted
  
  // Combine busy states
  const isBusy = busy || loading

  return (
    <aside className="
      lg:col-span-3
      border-b lg:border-b-0 lg:border-r border-[var(--border)]
      bg-[var(--bg-secondary)]
      flex flex-col gap-4
      p-4 sm:p-5
      lg:overflow-y-auto
      h-auto lg:h-full
    ">
      {/* ── Core Control ── */}
      <section>
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
          {t('dashboard.core_status', 'Micro-VM Core')}
        </h2>
        <div className={`rounded-lg border ${restartRequired ? 'border-amber-500/50 bg-amber-500/10' : 'border-[var(--border)] bg-[var(--bg-card)]'} p-4 flex flex-col gap-3 transition-colors`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">{t('dashboard.status', 'Status')}</span>
            <StatusBadge status={restartRequired ? 'changing' : coreStatus} />
          </div>

          {restartRequired && (
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
                  {t('dashboard.restart_required_msg', 'Target changed. Restart core to apply.')}
              </div>
          )}

          {coreStatus === 'running' && !isAndroidMounted && (
              <div className="text-xs text-red-600 dark:text-red-400 font-bold mb-1 p-2 bg-red-500/10 rounded border border-red-500/20">
                  ⚠️ {t('dashboard.invalid_mount_msg', 'Android files not found. Please check your path and restart core.')}
              </div>
          )}

          <AnimatePresence mode="wait">
            {coreStatus === 'stopped' ? (
              <motion.button
                key="start"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                onClick={onStart}
                disabled={isBusy || !isConnected}
                className="w-full py-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation flex items-center justify-center gap-2"
              >
                {loading ? (
                    t('dashboard.starting', 'Starting...')
                ) : (
                    <>
                        <Play className="w-4 h-4 fill-current" />
                        {t('dashboard.start_core', 'Start Core')}
                    </>
                )}
              </motion.button>
            ) : (
              <motion.button
                key="stop"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                onClick={(restartRequired || !isAndroidMounted) ? onRestart : onStop}
                disabled={isBusy}
                className={`w-full py-3 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation flex items-center justify-center gap-2 ${
                    (restartRequired || !isAndroidMounted) 
                    ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse' 
                    : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100'
                }`}
              >
                {loading ? (
                    (restartRequired || !isAndroidMounted) ? t('dashboard.restarting', 'Restarting...') : t('dashboard.stopping', 'Stopping...')
                ) : ( 
                    (restartRequired || !isAndroidMounted) ? (
                        <>
                            <RotateCcw className="w-4 h-4" />
                            {t('dashboard.restart_core', 'Restart Core')}
                        </>
                    ) : (
                        <>
                            <Square className="w-4 h-4 fill-current" />
                            {t('dashboard.stop_core', 'Stop Core')}
                        </>
                    )
                )}
              </motion.button>
            )}
          </AnimatePresence>

          {coreStatus === 'starting' && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              {t('dashboard.waiting_boot', 'Waiting for boot...')}
            </p>
          )}
        </div>
      </section>

      {/* ── Scan & Manage ── */}
      <section>
        {/* Fast Scan Button (Default) */}
        <button
          onClick={onScan}
          disabled={!isOperational || isBusy}
          className={`
            w-full py-3 rounded-md text-sm font-semibold transition-all touch-manipulation mb-2 flex items-center justify-center gap-2
            ${isOperational && !isBusy
              ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm'
              : 'bg-[var(--bg-card)]/40 border border-[var(--border)]/40 text-[var(--text-muted)] cursor-not-allowed'
            }
          `}
        >
          {scanningType === 'fast' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('dashboard.scanning', 'Scanning...')}
            </span>
          ) : (
            <>
                <span>⚡</span>
                {t('dashboard.fast_scan', 'Fast Scan')}
            </>
          )}
        </button>

        {/* Slow Scan Button (Deep) */}
        <button
          onClick={onDeepScan}
          disabled={!isOperational || isBusy}
          className={`
            w-full py-2.5 rounded-md text-xs font-semibold transition-all touch-manipulation flex items-center justify-center gap-2
            ${isOperational && !isBusy
              ? 'bg-[var(--bg-card)] border border-amber-500/50 hover:border-amber-500 text-amber-600 dark:text-amber-400'
              : 'bg-[var(--bg-card)]/40 border border-[var(--border)]/40 text-[var(--text-muted)] cursor-not-allowed'
            }
          `}
        >
          {scanningType === 'deep' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('dashboard.scanning', 'Scanning...')}
            </span>
          ) : (
             <>
                <span>🔍</span>
                {t('dashboard.slow_scan', 'Deep Scan')}
             </>
          )}
        </button>
        
        <button
          onClick={onAddApp}
          disabled={!isOperational || isBusy}
          className={`
            w-full py-3 rounded-md text-sm font-semibold transition-all touch-manipulation mt-2 flex items-center justify-center gap-2
            ${isOperational && !isBusy
              ? 'bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--accent)]'
              : 'bg-[var(--bg-card)]/40 border border-[var(--border)]/40 text-[var(--text-muted)] cursor-not-allowed'
            }
          `}
        >
          <Plus className="w-4 h-4" />
          {t('dashboard.add_app', 'Add App')}
        </button>

        <button
          onClick={onOpenFileExplorer}
          disabled={!isOperational || isBusy}
          className={`
            w-full py-3 rounded-md text-sm font-semibold transition-all touch-manipulation mt-1 flex items-center justify-center gap-2
            ${isOperational && !isBusy
              ? 'bg-[var(--bg-card)] border border-[var(--border)] hover:border-blue-500/50 text-[var(--text-primary)]'
              : 'bg-[var(--bg-card)]/40 border border-[var(--border)]/40 text-[var(--text-muted)] cursor-not-allowed'
            }
          `}
        >
          <FolderOpen className="w-4 h-4" />
          {t('dashboard.file_explorer', 'File Explorer')}
        </button>
      </section>

      {/* ── Bulk Actions ── */}
      <section>
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
          {t('dashboard.actions', 'Actions')}
        </h2>
        <div className="flex flex-col gap-3">
          {/* Delete selected */}
          <button
            onClick={onDelete}
            disabled={!isOperational || isBusy || selectedCount === 0}
            className={`
              w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl
              font-semibold text-sm tracking-wide transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
              focus:ring-offset-[var(--bg-primary)]
              ${isOperational && selectedCount > 0 && !isBusy
                ? 'bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white'
                : 'bg-red-900/20 text-red-400/40 cursor-not-allowed border border-red-900/30'
              }
            `}
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('dashboard.delete')}…
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {t('dashboard.delete_selected')}
                {selectedCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-red-500/30 text-xs text-white/90">
                    {selectedCount}
                  </span>
                )}
              </>
            )}
          </button>

          {/* Move & Export Row */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onMove}
              disabled={!isOperational || isBusy || selectedCount === 0}
              className={`
                flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                font-semibold text-sm tracking-wide transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-500
                ${isOperational && selectedCount > 0 && !isBusy
                  ? 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-md shadow-blue-500/20'
                  : 'bg-blue-900/20 text-blue-400/40 cursor-not-allowed border border-blue-900/30'
                }
              `}
            >
              <FolderInput className="w-4 h-4" />
              {t('dashboard.move', 'Move')}
            </button>

            <button
              onClick={onExport}
              disabled={!isOperational || isBusy || selectedCount === 0}
              className={`
                flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                font-semibold text-sm tracking-wide transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-emerald-500
                ${isOperational && selectedCount > 0 && !isBusy
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 shadow-md shadow-emerald-500/20'
                  : 'bg-emerald-900/20 text-emerald-400/40 cursor-not-allowed border border-emerald-900/30'
                }
              `}
            >
              <Archive className="w-4 h-4" />
              {t('dashboard.export', 'Export')}
            </button>
          </div>
        </div>
      </section>
    </aside>
  )
}
