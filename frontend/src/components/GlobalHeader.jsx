import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useBackend } from '../context/BackendContext'
import { EMULATOR_MAP } from '../config/emulatorMap'

// ── Icons ─────────────────────────────────────────────────────────────────────
function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function WifiOffIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
    </svg>
  )
}

function SpinnerIcon({ className }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Language Dropdown ─────────────────────────────────────────────────────────
const LANG_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
]

function LangDropdown() {
  const { i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef(null)
  const current = i18n.language?.slice(0, 2) ?? 'en'

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (code) => {
    i18n.changeLanguage(code)
    localStorage.setItem('lang', code)
    setIsOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="h-8 px-2.5 rounded-md text-xs font-semibold uppercase tracking-wide border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors touch-manipulation flex items-center gap-1"
      >
        {current.toUpperCase()}
        <svg className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 w-36 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden z-50"
          >
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                onClick={() => select(opt.code)}
                className={[
                  'w-full text-left px-3 py-2 text-sm transition-colors',
                  current === opt.code
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Service Status Badge ──────────────────────────────────────────────────────
function ServiceStatus({ isConnected, isReconnecting, onReconnect }) {
  const [showLabel, setShowLabel] = useState(false)
  const timerRef = useRef(null)
  const isFirstRender = useRef(true)

  // Auto-reveal for 3s on status change (skip first mount)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setShowLabel(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setShowLabel(false), 3000)
    return () => clearTimeout(timerRef.current)
  }, [isConnected, isReconnecting])

  const handleMouseEnter = () => {
    clearTimeout(timerRef.current)
    setShowLabel(true)
  }

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setShowLabel(false), 800)
  }

  // Derive visual state
  const state = isReconnecting ? 'reconnecting' : isConnected ? 'connected' : 'disconnected'

  const CONFIG = {
    connected: {
      label: 'Connected',
      labelCls: 'text-emerald-600 dark:text-emerald-400',
      icon: <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />,
    },
    disconnected: {
      label: 'Disconnected',
      labelCls: 'text-red-500 dark:text-red-400',
      icon: <WifiOffIcon className="w-3.5 h-3.5 text-red-400 shrink-0" />,
    },
    reconnecting: {
      label: 'Connecting...',
      labelCls: 'text-amber-500 dark:text-amber-400',
      icon: <SpinnerIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    },
  }

  const { label, labelCls, icon } = CONFIG[state]

  return (
    <button
      onClick={!isConnected && !isReconnecting ? onReconnect : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={label}
      className={[
        'flex items-center gap-1.5 h-8 px-2 rounded-md border transition-colors select-none',
        'border-zinc-200 dark:border-zinc-700',
        !isConnected && !isReconnecting
          ? 'cursor-pointer hover:border-red-400 dark:hover:border-red-500'
          : 'cursor-default',
      ].join(' ')}
    >
      {/* Animated label */}
      <AnimatePresence>
        {showLabel && (
          <motion.span
            key="label"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`whitespace-nowrap overflow-hidden text-xs font-medium ${labelCls}`}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Status icon / dot */}
      {icon}
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
function FolderIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" 
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function EditIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GlobalHeader({ isDark, onToggleTheme, currentPath, onSwitchFolder, detectionResult }) {
  const { t } = useTranslation()
  const { isConnected, isReconnecting, isAdmin, reconnect } = useBackend()

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-4 sm:px-6 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">

      {/* ── Left: Branding & Path ── */}
      <div className="flex items-center gap-2.5 min-w-0">
        <img
          src="/assets/logo.png"
          alt="ZeroBloatEmulator Logo"
          className="w-10 h-10 object-contain shrink-0"
        />
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-sm leading-tight tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
            ZeroBloatEmulator
          </span>
          {currentPath && (
            <div className="flex items-center gap-1 min-w-0 mt-0.5 md:hidden">
              <FolderIcon className="w-3 h-3 text-[var(--accent)] shrink-0" />
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate font-medium" title={currentPath}>
                {currentPath}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Center/Left Desktop: Emulator Context ── */}
      {detectionResult && (
        <div 
          onClick={onSwitchFolder}
          title="Click to Switch Emulator"
          className="hidden md:flex items-center gap-4 ml-6 border-l border-zinc-200 dark:border-zinc-800 pl-6 mr-auto cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors rounded-md pr-4 py-1"
        >
           {/* Emulator Logo */}
           {EMULATOR_MAP[detectionResult.type] && EMULATOR_MAP[detectionResult.type].logo && (
             <img 
               src={EMULATOR_MAP[detectionResult.type].logo} 
               alt={detectionResult.type} 
               className="h-6 w-6 object-contain" 
             />
           )}
           {/* Path */}
           <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                {EMULATOR_MAP[detectionResult.type]?.name || detectionResult.type}
              </span>
              <span className="text-xs text-zinc-400 font-mono truncate max-w-[300px] xl:max-w-[400px]" title={detectionResult.base_path}>
                {detectionResult.base_path}
              </span>
           </div>
        </div>
      )}

      {/* ── Right: Actions ── */}
      <div className="flex items-center gap-2">

        {/* Switch Folder Button */}
        {currentPath && onSwitchFolder && (
          <button
            onClick={onSwitchFolder}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors border border-[var(--accent)]/20 md:hidden"
            title="Switch Folder"
          >
            <EditIcon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Switch</span>
          </button>
        )}

        <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 hidden sm:block" />

        <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 hidden sm:block" />

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title={isDark ? t('header.theme_light') : t('header.theme_dark')}
          className="h-8 w-8 rounded-md flex items-center justify-center border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors touch-manipulation"
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Language dropdown */}
        <LangDropdown />

        {/* Service status — rightmost */}
        <ServiceStatus
          isConnected={isConnected}
          isReconnecting={isReconnecting}
          onReconnect={reconnect}
        />
      </div>
    </header>
  )
}
