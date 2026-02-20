import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

import { BackendProvider } from './context/BackendContext'
import ErrorBoundary from './components/ErrorBoundary'
import WebOS from './components/OS/WebOS'
import BootScreen from './components/OS/BootScreen'
import PowerOnScreen from './components/OS/PowerOnScreen'
import NotificationCenter from './components/OS/NotificationCenter'
import { HealthAPI, CoreAPI } from './services/api'
import { useWindowManager } from './store/useWindowManager'

// ── States: CHECKING → POWER_OFF | BOOTING → RUNNING ─────────────────────────
const POWER_STATES = {
  CHECKING: 'CHECKING',
  POWER_OFF: 'POWER_OFF',
  BOOTING:   'BOOTING',
  RUNNING:   'RUNNING',
}

// Minimalist full-screen spinner shown during initial health check
function CheckingScreen() {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
      <Loader2 size={28} className="text-white/30 animate-spin" />
    </div>
  )
}

// ── Inner app ─────────────────────────────────────────────────────────────────
function AppInner() {
  const [powerState, setPowerState] = useState(POWER_STATES.CHECKING)
  const addShortcut = useWindowManager((s) => s.addShortcut)
  const desktopShortcuts = useWindowManager((s) => s.desktopShortcuts)

  // Restore mounted drive shortcuts from the guest VM
  const restoreMountedShortcuts = async () => {
    try {
      const resp = await CoreAPI.getMounts()
      const activeMounts = resp.data?.mounts ?? []
      for (const drive of activeMounts) {
        const partitions = drive.partitions ?? []
        const isMulti = partitions.length > 1
        for (const p of partitions) {
          const partName = p.partition.split('/').pop()
          const shortcutId = `guest-drive-${drive.id}-${partName}`
          // Don't add if a shortcut with this id already exists
          const already = desktopShortcuts.find((s) => s.id === shortcutId)
          if (already) continue
          addShortcut({
            id: shortcutId,
            label: `Disk (${partName})`,
            icon: 'HardDrive',
            component: 'FileExplorer',
            driveId: drive.id,
            partition: p.partition,
            initialPath: p.mount_path,
          })

        }
      }
    } catch {
      // Silently ignore — not critical
    }
  }

  // 1. On mount: probe backend to determine initial power state
  useEffect(() => {
    let cancelled = false

    const probe = async () => {
      try {
        const resp = await HealthAPI.check(4000)
        if (cancelled) return
        if (resp.data?.is_running) {
          setPowerState(POWER_STATES.RUNNING)
          // Restore any previously mounted drive shortcuts
          restoreMountedShortcuts()
        } else {
          setPowerState(POWER_STATES.POWER_OFF)
        }
      } catch {
        if (!cancelled) setPowerState(POWER_STATES.POWER_OFF)
      }
    }

    probe()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <AnimatePresence mode="wait">

        {/* CHECKING — brief spinner while probing /api/health */}
        {powerState === POWER_STATES.CHECKING && (
          <motion.div
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            <CheckingScreen />
          </motion.div>
        )}

        {/* POWER_OFF — minimalist dark screen with power button */}
        {powerState === POWER_STATES.POWER_OFF && (
          <motion.div
            key="power-off"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <PowerOnScreen
              onBooting={() => setPowerState(POWER_STATES.BOOTING)}
              onRunning={() => setPowerState(POWER_STATES.RUNNING)}
            />
          </motion.div>
        )}

        {/* BOOTING — Windows 11 boot animation */}
        {powerState === POWER_STATES.BOOTING && (
          <motion.div
            key="booting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            className="absolute inset-0 z-50"
          >
            <BootScreen
              onBootComplete={() => setPowerState(POWER_STATES.RUNNING)}
            />
          </motion.div>
        )}

        {/* RUNNING — full OS desktop */}
        {powerState === POWER_STATES.RUNNING && (
          <motion.div
            key="running"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
          >
            <WebOS onPowerOff={() => setPowerState(POWER_STATES.POWER_OFF)} />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <BackendProvider>
        <NotificationCenter />
        <AppInner />
      </BackendProvider>
    </ErrorBoundary>
  )
}
