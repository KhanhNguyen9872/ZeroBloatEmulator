import React, { useEffect, useRef } from 'react'

const LEVEL_STYLES = {
  info:    'text-slate-300',
  success: 'text-emerald-400',
  warn:    'text-amber-400',
  error:   'text-red-400',
}

const LEVEL_PREFIX = {
  info:    '›',
  success: '✓',
  warn:    '⚠',
  error:   '✗',
}

export default function ConsoleLog({ logs }) {
  const bottomRef = useRef(null)

  // Auto-scroll to bottom on new log
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[#0b0d14] overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <span className="text-xs text-[var(--text-muted)] ml-2 font-mono">console</span>
      </div>

      {/* Log entries */}
      <div className="font-mono text-xs p-3 h-36 overflow-y-auto space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-[var(--text-muted)] opacity-50">Waiting for activity…</span>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className={`flex gap-2 ${LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.info}`}>
              <span className="shrink-0 w-3">{LEVEL_PREFIX[entry.level] ?? '›'}</span>
              <span className="text-[var(--text-muted)] shrink-0">{entry.time}</span>
              <span className="break-all">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
