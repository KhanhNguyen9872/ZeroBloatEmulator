import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'sonner'

import { BackendProvider, useBackend } from './context/BackendContext'
import { DetectAPI, SystemAPI } from './services/api'
import GlobalHeader from './components/GlobalHeader'
import IntroPage from './pages/IntroPage'
import FolderBrowserModal from './components/FolderBrowserModal'
import DetectionPage from './pages/DetectionPage'
import SelectionPage from './pages/SelectionPage'
import DashboardPage from './pages/DashboardPage'

const SCREENS = {
  INTRO: 'intro',
  DETECTING: 'detecting',
  SELECTION: 'selection',
  DASHBOARD: 'dashboard',
}

function resolveDiskPath(basePath, emulatorType, selectedVersion) {
  const base = basePath.replace(/[/\\]$/, '')
  if (emulatorType === 'MEmu') {
    const KEY_MAP = {
      'Android 9 (64-bit)': '96',
      'Android 5.1 (32-bit)': '51',
      'Android 7.1 (32-bit)': '71',
      'Android 7.1 (64-bit)': '76',
    }
    return `${base}\\image\\${KEY_MAP[selectedVersion] ?? '96'}\\system.img`
  }
  if (emulatorType === 'LDPlayer') {
    if (selectedVersion && !selectedVersion.startsWith('LDPlayer')) {
      return `${base}\\vms\\${selectedVersion}\\system.vmdk`
    }
    return `${base}\\system.vmdk`
  }
  return basePath
}

// ── Theme hook ────────────────────────────────────────────────────────────────
function useTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )
  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }
  return { isDark, toggleTheme }
}

// ── Dynamic title hook ────────────────────────────────────────────────────────
function useDocTitle(screen, showBrowser, detectionResult) {
  useEffect(() => {
    const titles = {
      [SCREENS.INTRO]:      showBrowser ? 'Select Folder' : 'Home',
      [SCREENS.DETECTING]:  'Analyzing…',
      [SCREENS.SELECTION]:  detectionResult?.type === 'Unknown' ? 'Scan Failed' : 'Select Version',
      [SCREENS.DASHBOARD]:  'Dashboard',
    }
    document.title = `ZeroBloatEmulator – ${titles[screen] ?? 'Home'}`
  }, [screen, showBrowser, detectionResult])
}

// ── Inner app ─────────────────────────────────────────────────────────────────
function AppInner() {
  const { isConnected } = useBackend()
  const { isDark, toggleTheme } = useTheme()
  const [screen, setScreen] = useState(SCREENS.INTRO)
  const [showBrowser, setShowBrowser] = useState(false)
  const [detectionResult, setDetectionResult] = useState(null)
  const [diskPath, setDiskPath] = useState('')

  const [isPathRestored, setIsPathRestored] = useState(false)

  useDocTitle(screen, showBrowser, detectionResult)

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    const savedPath = localStorage.getItem('last_emulator_path')
    if (!savedPath) {
      setIsPathRestored(true)
      return
    }

    // validate path
    const validate = async () => {
      try {
        const { data } = await SystemAPI.validatePath(savedPath)
        if (data.exists) {
            handleFolderConfirm(savedPath)
        } else {
            localStorage.removeItem('last_emulator_path')
        }
      } catch {
        localStorage.removeItem('last_emulator_path')
      } finally {
        setIsPathRestored(true)
      }
    }
    validate()
  }, [])

  const handleFolderConfirm = async (path) => {
    setShowBrowser(false)
    localStorage.setItem('last_emulator_path', path)
    setScreen(SCREENS.DETECTING)
    try {
      const { data } = await DetectAPI.detect(path)
      setDetectionResult({ ...data.result, base_path: path })
    } catch {
      setDetectionResult({ type: 'Unknown', base_path: path })
    }
    setScreen(SCREENS.SELECTION)
  }

  const handleResetSession = () => {
    if (confirm('Are you sure you want to switch folders? Current session will be cleared.')) {
        localStorage.removeItem('last_emulator_path')
        setDetectionResult(null)
        setDiskPath('')
        setScreen(SCREENS.INTRO)
    }
  }

  const handleStart = (selectedVersion) => {
    setDiskPath(resolveDiskPath(detectionResult.base_path, detectionResult.type, selectedVersion))
    setScreen(SCREENS.DASHBOARD)
  }

  const handleRetry = () => { setDetectionResult(null); setScreen(SCREENS.INTRO) }
  const handleDisconnect = () => { setDetectionResult(null); setDiskPath(''); setScreen(SCREENS.INTRO) }

  if (!isPathRestored) return null // or a loading spinner

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--bg-primary)]">
      {/* Global header – always on top */}
      <GlobalHeader 
        isDark={isDark} 
        onToggleTheme={toggleTheme} 
        currentPath={detectionResult?.base_path}
        onSwitchFolder={handleResetSession}
      />

      {/* Offset for fixed header height (h-16) */}
      <div className="pt-16">
        {/* ── Disconnected overlay ── */}
        <AnimatePresence>
          {!isConnected && (
            <motion.div
              key="disconnected-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 top-16 z-[9980] pointer-events-auto"
              style={{ cursor: 'not-allowed' }}
            >
              {/* Blur + dim layer – blocks all clicks */}
              <div className="absolute inset-0 backdrop-blur-[3px] bg-white/30 dark:bg-zinc-950/40" />

              {/* Pill notification – centred near bottom */}
              <div
                className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none"
                style={{ cursor: 'default' }}
              >
                <motion.div
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 16, opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium text-zinc-700 dark:text-zinc-300 select-none"
                >
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
                  Waiting for backend…
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {screen === SCREENS.INTRO && (
            <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <IntroPage onSelectFolder={() => setShowBrowser(true)} />
              {showBrowser && (
                <FolderBrowserModal onConfirm={handleFolderConfirm} onClose={() => setShowBrowser(false)} />
              )}
            </motion.div>
          )}
          {screen === SCREENS.DETECTING && (
            <motion.div key="detecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DetectionPage />
            </motion.div>
          )}
          {screen === SCREENS.SELECTION && (
            <motion.div key="selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <SelectionPage result={detectionResult} onStart={handleStart} onRetry={handleRetry} />
            </motion.div>
          )}
          {screen === SCREENS.DASHBOARD && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DashboardPage diskPath={diskPath} onDisconnect={handleDisconnect} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BackendProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            borderRadius: '6px',
            fontSize: '13px',
          },
        }}
      />
      <AppInner />
    </BackendProvider>
  )
}
