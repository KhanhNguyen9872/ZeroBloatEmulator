// pages/SelectionPage.jsx
import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Select from 'react-select'
import { getEmulatorConfig } from '../config/emulatorMap'

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
    zIndex: 50,
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
      <div className="w-20 h-20 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center text-4xl shadow-inner">
        ⚠️
      </div>
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">No Supported Emulator Found</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-sm mx-auto leading-relaxed">
          The selected folder doesn't appear to contain a supported emulator.
          <br />
          Please select the <strong>installation folder</strong> of LDPlayer or MEmu.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="px-6 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-all touch-manipulation"
      >
        ← Try Another Folder
      </button>
    </div>
  )
}

// ── Detected Card ─────────────────────────────────────────────────────────────
function DetectedCard({ result, selectedVersion, onVersionChange, onStart, onRetry }) {
  // result = { type, status, detected_version, options, base_path }
  
  const isAuto = result.status === 'auto'
  const isManual = result.status === 'manual_select'
  
  // Prepare options for react-select: { value, label }
  // Backend options: { id, label }
  const dropdownOptions = (result.options ?? []).map((opt) => ({
    value: opt.id,
    label: opt.label,
  }))

  const canStart = isAuto || (isManual && selectedVersion !== null)

  // Determine which config to use (handling BlueStacks versions)
  let configKey = result.type
  if (result.type === 'BLUESTACKS') {
    if (result.detected_version === 'BlueStacks 4') configKey = 'BLUESTACKS4'
    else if (result.detected_version === 'BlueStacks 5') configKey = 'BLUESTACKS5'
    else if (selectedVersion?.value === 'bs4') configKey = 'BLUESTACKS4'
    else if (selectedVersion?.value === 'bs5') configKey = 'BLUESTACKS5'
  }

  const cfg = getEmulatorConfig(configKey)

  return (
    <div className="flex flex-col gap-6 w-full max-w-md">
      {/* Emulator Info Card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 flex items-center gap-5 shadow-sm relative overflow-hidden">
        {/* Logo */}
        <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 p-2 overflow-hidden">
          {cfg.logo ? (
            <img src={cfg.logo} alt={cfg.name} className="w-full h-full object-contain" />
          ) : (
            <span className="text-2xl">📱</span>
          )}
        </div>

        <div className="flex-1 min-w-0 z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{cfg.name}</h2>
            {isAuto && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Auto-Detected
              </span>
            )}
            {isManual && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Action Required
              </span>
            )}
          </div>
          
          {isAuto ? (
             <p className="text-sm text-[var(--accent)] mt-1 font-semibold">{result.detected_version}</p>
          ) : (
             <p className="text-xs text-[var(--text-muted)] mt-1">Please select version below</p>
          )}

          <p className="text-[10px] text-[var(--text-muted)] mt-1 truncate opacity-60 font-mono" title={result.base_path}>
            {result.base_path}
          </p>
        </div>
      </div>

      {/* Manual Selection Dropdown */}
      <AnimatePresence>
        {isManual && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            entry={{ opacity: 1 }}
            className="flex flex-col gap-2 overflow-visible"
          >
            <label className="text-sm font-medium text-[var(--text-muted)]">
              Select Android Version
            </label>
            <Select
              options={dropdownOptions}
              value={selectedVersion}
              onChange={onVersionChange}
              placeholder="Choose a version..."
              styles={selectStyles}
              isSearchable={false}
              menuPlacement="auto"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex gap-3 mt-2">
        <button
          onClick={() => {
             // If user goes back from selection, we should probably reset the session 
             // so they can choose a different folder if they want.
             // Currently onRetry does: setDetectionResult(null); setScreen(SCREENS.INTRO)
             // App.jsx will handle this, but if persistence is ON, it might just loop back?
             // No, App.jsx handles "INTRO" by showing existing path or not?
             // Actually, App.jsx's handleRetry just goes to INTRO.
             // But if `last_emulator_path` is still set, IntroPage might auto-skip if we added that logic?
             // Wait, our App.jsx "useEffect" only runs ON MOUNT.
             // So going back to INTRO is fine, it will show the Intro screen.
             // BUT, if they select the folder again, it works.
             // To be clean, we might want to ask. But `onRetry` is "Back".
             // Let's simple call `onRetry` which is passed from App.jsx
             onRetry() 
          }}
          className="px-5 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-all touch-manipulation"
        >
          {cfg.common?.back || "Back"}
        </button>
        <motion.button
          whileHover={canStart ? { scale: 1.02, filter: 'brightness(1.1)' } : {}}
          whileTap={canStart ? { scale: 0.98 } : {}}
          onClick={canStart ? onStart : undefined}
          disabled={!canStart}
          className={`
            flex-1 py-2.5 rounded-lg font-bold text-sm transition-all
            ${canStart
              ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20'
              : 'bg-[var(--accent)]/10 text-[var(--text-muted)] opacity-50 cursor-not-allowed'
            }
          `}
        >
          {isAuto ? 'Continue' : 'Confirm & Continue'}
        </motion.button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SelectionPage({ result, onStart, onRetry }) {
  // Local state for the dropdown (only used if manual)
  const [selectedVersion, setSelectedVersion] = useState(null)

  // Reset selection if result changes (e.g. re-scan)
  useEffect(() => {
    setSelectedVersion(null)
  }, [result])

  const type = result?.type?.toUpperCase()
  const isUnknown = !type || type === 'UNKNOWN'

  const handleStart = () => {
    // Pass the simple ID string (e.g. "ld9" or "96")
    const versionId = result.status === 'auto'
      ? result.detected_version // This might be the label, actually we probably want the ID. 
                                // Let's check backend... MEmu auto returns `detected_version` label.
                                // For auto, the "version" passed to onStart is less critical 
                                // if the backend already knows what to do, OR we might need to fix this.
                                // 
                                // Wait, `onStart(version)` usually expects the ID to load the correct script/profile?
                                // If status is auto, the backend returned `detected_version` (label).
                                // Backend memu.py detects single version -> returns `options` list too.
                                // So we can grab the ID from options[0].id if needed.
                                //
                                // SAFE BET: Pass the full object or ID. 
                                // Let's assume onStart expects the ID string.
      : selectedVersion?.value

    // If auto, try to find the ID from options if available
    let finalVersion = versionId
    if (result.status === 'auto' && result.options?.[0]?.id) {
       finalVersion = result.options[0].id
    }

    onStart(finalVersion)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center px-4 py-16 sm:px-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={result?.base_path || 'unknown'}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col items-center gap-8 w-full max-w-md"
        >
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
              {isUnknown ? 'Scan Result' : 'Emulator Detected'}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {isUnknown
                ? 'Authentication failed. Please check your folder.'
                : 'We found a supported emulator environment.'}
            </p>
          </div>

          {isUnknown ? (
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
