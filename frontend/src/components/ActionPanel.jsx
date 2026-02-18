import React from 'react'
import { useTranslation } from 'react-i18next'

export default function ActionPanel({ selectedCount, onDelete, onDisconnect, loading, connected }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      {/* Delete selected */}
      <button
        onClick={onDelete}
        disabled={!connected || loading || selectedCount === 0}
        className={`
          w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl
          font-semibold text-sm tracking-wide transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
          focus:ring-offset-[var(--bg-primary)]
          ${connected && selectedCount > 0 && !loading
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
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {t('dashboard.delete_selected')}
            {selectedCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-red-500/30 text-xs">
                {selectedCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Save & Exit */}
      <button
        onClick={onDisconnect}
        disabled={!connected || loading}
        className={`
          w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl
          font-semibold text-sm tracking-wide transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2
          focus:ring-offset-[var(--bg-primary)]
          ${connected && !loading
            ? 'bg-[var(--bg-card)] hover:bg-slate-700 active:scale-[0.98] text-[var(--text-primary)] border border-[var(--border)]'
            : 'bg-[var(--bg-card)]/40 text-[var(--text-muted)] cursor-not-allowed border border-[var(--border)]/40'
          }
        `}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        {t('dashboard.save_exit')}
      </button>
    </div>
  )
}
