import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Select from 'react-select'

const EMULATOR_ICONS = {
  LDPlayer: '🎮',
  MEmu: '📱',
  Unknown: '❓',
}

const selectStyles = {
  control: (base, state) => ({
    ...base,
    background: 'var(--bg-secondary)',
    borderColor: state.isFocused ? 'var(--accent)' : 'var(--border)',
    boxShadow: state.isFocused ? '0 0 0 1px var(--accent)' : 'none',
    '&:hover': { borderColor: 'var(--accent)' },
    borderRadius: '0.5rem',
    padding: '2px 4px',
    minHeight: '44px',
  }),
  menu: (base) => ({
    ...base,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '0.75rem',
    overflow: 'hidden',
  }),
  option: (base, state) => ({
    ...base,
    background: state.isSelected
      ? 'var(--accent)'
      : state.isFocused
      ? 'rgba(37,99,235,0.12)'
      : 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  }),
  singleValue: (base) => ({ ...base, color: 'var(--text-primary)' }),
  placeholder: (base) => ({ ...base, color: 'var(--text-muted)' }),
  input: (base) => ({ ...base, color: 'var(--text-primary)' }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base) => ({ ...base, color: 'var(--text-muted)' }),
}

// ── Unknown ──────────────────────────────────────────────────────────────────
function UnknownCard({ onRetry }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center text-3xl sm:text-4xl">
        ⚠️
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">No Supported Emulator Found</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-sm">
          The selected folder doesn't appear to contain a supported emulator.
          Make sure you select the <strong>root installation folder</strong> of LDPlayer or MEmu.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="px-6 py-2.5 rounded-md border border-[var(--border)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors touch-manipulation"
      >
        ← Try Another Folder
      </button>
    </div>
  )
}

// ── Detected Card ─────────────────────────────────────────────────────────────
function DetectedCard({ result, selectedVersion, onVersionChange, onStart, onRetry }) {
  const isManual = result.status === 'manual_select_required'
  const canStart = !isManual || selectedVersion !== null

  const versionOptions = (result.versions ?? []).map((v) => ({ value: v, label: v }))

  return (
    <div className="flex flex-col gap-6 w-full max-w-md">
      {/* Emulator card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl shrink-0">
          {EMULATOR_ICONS[result.type] ?? '📦'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{result.type} Detected</h2>
            {result.status === 'auto_selected' && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Auto-selected
              </span>
            )}
            {isManual && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Choose version
              </span>
            )}
          </div>
          {result.status === 'auto_selected' && (
            <p className="text-sm text-indigo-300 mt-1 font-medium">{result.selected}</p>
          )}
          <p className="text-xs text-[var(--text-muted)] mt-1 truncate" title={result.base_path}>
            {result.base_path}
          </p>
        </div>
      </div>

      {/* Version selector (manual only) */}
      {isManual && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[var(--text-muted)]">
            Select Android Version
          </label>
          <Select
            options={versionOptions}
            value={selectedVersion}
            onChange={onVersionChange}
            placeholder="Choose a version…"
            styles={selectStyles}
            isSearchable={false}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="px-5 py-2.5 rounded-md border border-[var(--border)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors touch-manipulation"
        >
          ← Back
        </button>
        <motion.button
          whileHover={canStart ? { scale: 1.02 } : {}}
          whileTap={canStart ? { scale: 0.97 } : {}}
          onClick={canStart ? onStart : undefined}
          disabled={!canStart}
          className={`
            flex-1 py-2.5 rounded-md font-semibold text-sm transition-all
            ${canStart
              ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white'
              : 'bg-[var(--accent)]/20 text-[var(--accent)]/40 cursor-not-allowed'
            }
          `}
        >
          Start Debloater →
        </motion.button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SelectionScreen({ result, onStart, onRetry }) {
  const [selectedVersion, setSelectedVersion] = useState(
    result?.status === 'auto_selected'
      ? { value: result.selected, label: result.selected }
      : null
  )

  const handleStart = () => {
    const version =
      result.status === 'auto_selected'
        ? result.selected
        : selectedVersion?.value
    onStart(version)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center px-4 py-16 sm:px-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={result?.type}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col items-center gap-6 w-full max-w-md"
        >
          {/* Conditional header */}
          <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
              {result?.type === 'Unknown' ? 'No Emulator Found' : 'Emulator Detected'}
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {result?.type === 'Unknown'
                ? 'We could not identify a supported emulator.'
                : 'Review the details below and click Start.'}
            </p>
          </div>

          {result?.type === 'Unknown' ? (
            <UnknownCard onRetry={onRetry} />
          ) : (
            <DetectedCard
              result={result}
              selectedVersion={selectedVersion}
              onVersionChange={setSelectedVersion}
              onStart={handleStart}
              onRetry={onRetry}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
