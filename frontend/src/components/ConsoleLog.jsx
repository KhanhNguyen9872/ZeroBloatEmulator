import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export default function ConsoleLog({ logs, onClear }) {
  const { t } = useTranslation()
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[#0b0d14] overflow-hidden flex flex-col h-full">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <span className="text-xs text-[var(--text-muted)] ml-2 font-mono">{t('dashboard.log_title') || 'console'}</span>
        
        <div className="flex-1" />

        <button 
          onClick={onClear}
          className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
          title={t('dashboard.clear_logs') || 'Clear Logs'}
        >
          {t('dashboard.clear') || 'Clear'}
        </button>
      </div>

      {/* Log entries */}
      <div className="font-mono text-xs p-3 flex-1 overflow-y-auto space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-[var(--text-muted)] opacity-50">{t('dashboard.no_logs') || 'No logs'}</span>
        ) : (
          logs.map((line, i) => {
             const txt = typeof line === 'string' ? line : (line.message || JSON.stringify(line))
             
             const color = txt.includes('[ERROR]') ? 'text-red-400'
               : txt.includes('[WARNING]') ? 'text-amber-400'
               : txt.includes('[INFO]') ? 'text-zinc-300'
               : 'text-zinc-500'

            return <div key={i} className={`break-all ${color}`}>{txt}</div>
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
