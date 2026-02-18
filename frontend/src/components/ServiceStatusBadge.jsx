import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBackend } from '../context/BackendContext'

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconConnected() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  )
}

function IconDisconnected() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 3l18 18M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01M16.53 9.47a7.5 7.5 0 00-9.06 0M5.28 5.28A13.5 13.5 0 011.394 9.39m21.213 0a13.5 13.5 0 00-3.887-4.11" />
    </svg>
  )
}

function IconSpinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
/**
 * Props:
 *   inline – if true, renders without fixed positioning (for use inside HeaderToolbar)
 */
export default function ServiceStatusBadge({ inline = false }) {
  const { isConnected, isReconnecting, reconnect } = useBackend()

  const prevConnected = useRef(isConnected)
  const [showText, setShowText] = useState(false)
  const hideTimer = useRef(null)

  useEffect(() => {
    const changed = prevConnected.current !== isConnected
    prevConnected.current = isConnected
    if (changed) {
      setShowText(true)
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setShowText(false), 3000)
    }
    return () => clearTimeout(hideTimer.current)
  }, [isConnected])

  const state = isReconnecting ? 'reconnecting' : isConnected ? 'connected' : 'disconnected'

  const CONFIG = {
    connected:    { label: 'Connected',    icon: <IconConnected />,    dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
    disconnected: { label: 'Disconnected', icon: <IconDisconnected />, dot: 'bg-red-500',     text: 'text-red-600 dark:text-red-400',         border: 'border-red-500/30' },
    reconnecting: { label: 'Reconnecting', icon: <IconSpinner />,      dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',     border: 'border-amber-500/30' },
  }

  const cfg = CONFIG[state]

  const badge = (
    <motion.div
      layout
      className={`
        flex items-center gap-1.5 px-2.5 py-1 rounded-md border
        bg-white dark:bg-zinc-900
        ${cfg.border} ${cfg.text}
        cursor-pointer select-none transition-colors duration-300
      `}
      onClick={state === 'disconnected' ? reconnect : undefined}
      title={state === 'disconnected' ? 'Click to reconnect' : cfg.label}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${state === 'connected' ? 'animate-pulse' : ''}`} />
      {/* Icon */}
      <span className="shrink-0">{cfg.icon}</span>
      {/* Sliding label */}
      <AnimatePresence>
        {showText && (
          <motion.span
            key={state}
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="text-xs font-medium whitespace-nowrap overflow-hidden"
          >
            {cfg.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )

  if (inline) return badge

  return (
    <div className="fixed top-2 right-2 z-[9999] flex items-center" style={{ pointerEvents: 'auto' }}>
      {badge}
    </div>
  )
}
