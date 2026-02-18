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

// ── Theme hook ────────────────────────────────────────────────────────────────
function useTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark') || localStorage.getItem('theme') === 'dark'
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
  
  // Chỉ lưu ID phiên bản người dùng chọn, không lưu đường dẫn file disk
  const [selectedVersionId, setSelectedVersionId] = useState(null)
  const [isPathRestored, setIsPathRestored] = useState(false)

  useDocTitle(screen, showBrowser, detectionResult)

  // ── Persistence & Validation ────────────────────────────────────────────────
  useEffect(() => {
    const savedPath = localStorage.getItem('last_emulator_path')
    if (!savedPath) {
      setIsPathRestored(true)
      return
    }

    const validate = async () => {
      try {
        const { data } = await SystemAPI.validatePath(savedPath)
        if (data.exists) {
            handleFolderConfirm(savedPath)
        } else {
            localStorage.removeItem('last_emulator_path')
            setIsPathRestored(true)
        }
      } catch {
        localStorage.removeItem('last_emulator_path')
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
      // data.result bây giờ chứa cả type, options, và auto-detected version từ backend
      setDetectionResult({ ...data.result, base_path: path })
    } catch {
      setDetectionResult({ type: 'Unknown', base_path: path })
    }
    setIsPathRestored(true)
    setScreen(SCREENS.SELECTION)
  }

  const handleResetSession = () => {
    if (window.confirm('Are you sure you want to switch folders? Current session will be cleared.')) {
        localStorage.removeItem('last_emulator_path')
        setDetectionResult(null)
        setSelectedVersionId(null)
        setScreen(SCREENS.INTRO)
    }
  }

  const handleStart = (versionId) => {
    // Chỉ lưu ID và chuyển màn hình. 
    // DashboardPage sẽ gọi API CoreAPI.start(base_path, versionId)
    setSelectedVersionId(versionId)
    setScreen(SCREENS.DASHBOARD)
  }

  const handleRetry = () => { setDetectionResult(null); setScreen(SCREENS.INTRO) }
  const handleDisconnect = () => { setDetectionResult(null); setSelectedVersionId(null); setScreen(SCREENS.INTRO) }

  if (!isPathRestored) return null 

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--bg-primary)]">
      <GlobalHeader 
        isDark={isDark} 
        onToggleTheme={toggleTheme} 
        currentPath={detectionResult?.base_path}
        onSwitchFolder={handleResetSession}
      />

      <div className="pt-16">
        <AnimatePresence>
          {!isConnected && (
            <motion.div
              key="disconnected-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 top-16 z-[9980] pointer-events-auto cursor-not-allowed"
            >
              <div className="absolute inset-0 backdrop-blur-[3px] bg-white/30 dark:bg-zinc-950/40" />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
                <motion.div
                  initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 16, opacity: 0 }}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium text-zinc-700 dark:text-zinc-300"
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
            <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <IntroPage onSelectFolder={() => setShowBrowser(true)} />
              {showBrowser && (
                <FolderBrowserModal onConfirm={handleFolderConfirm} onClose={() => setShowBrowser(false)} />
              )}
            </motion.div>
          )}
          {screen === SCREENS.DETECTING && (
            <motion.div key="detecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DetectionPage />
            </motion.div>
          )}
          {screen === SCREENS.SELECTION && (
            <motion.div key="selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SelectionPage result={detectionResult} onStart={handleStart} onRetry={handleRetry} />
            </motion.div>
          )}
          {screen === SCREENS.DASHBOARD && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DashboardPage 
                basePath={detectionResult?.base_path} 
                emulatorType={detectionResult?.type}
                versionId={selectedVersionId} 
                onDisconnect={handleDisconnect} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BackendProvider>
      <Toaster position="bottom-right" />
      <AppInner />
    </BackendProvider>
  )
}
