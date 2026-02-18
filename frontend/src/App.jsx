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
  const [shouldAutoStart, setShouldAutoStart] = useState(false)

  useDocTitle(screen, showBrowser, detectionResult)

  // ── Persistence & Validation ────────────────────────────────────────────────
  // ── Persistence & Validation ────────────────────────────────────────────────
  useEffect(() => {
    // 1. If Backend is not live, do nothing and wait
    if (!isConnected) return

    // 2. If already restored, do not run again
    if (isPathRestored) return

    const savedPath = localStorage.getItem('last_emulator_path')
    const savedVersion = localStorage.getItem('last_android_version')

    // If nothing to restore, pass
    if (!savedPath) {
      setIsPathRestored(true)
      return
    }

    const validateAndRestore = async () => {
      try {
        // Backend is live, safe to make request
        const { data } = await SystemAPI.validatePath(savedPath)
        
        if (data.exists) {
            // Detect emulator info
            const { data: detectData } = await DetectAPI.detect(savedPath)
            setDetectionResult({ ...detectData.result, base_path: savedPath })

            if (savedVersion) {
                // Restore session completely
                setSelectedVersionId(savedVersion)
                setShouldAutoStart(false) // Refreshing page should NOT auto-start
                setScreen(SCREENS.DASHBOARD)
            } else {
                setScreen(SCREENS.SELECTION)
            }
        } else {
            // Folder invalid, clean up
            localStorage.removeItem('last_emulator_path')
            localStorage.removeItem('last_android_version')
        }
      } catch (err) {
        console.error("Restoration failed:", err)
        // If API error even if backend is live, clear cache
        localStorage.removeItem('last_emulator_path')
      } finally {
        setIsPathRestored(true)
      }
    }
    
    validateAndRestore()
  }, [isConnected, isPathRestored])

  const handleFolderConfirm = async (path) => {
    setShowBrowser(false)
    localStorage.setItem('last_emulator_path', path)
    setScreen(SCREENS.DETECTING)
    try {
      const { data } = await DetectAPI.detect(path)
      // data.result contains type, options, auto-detected version
      setDetectionResult({ ...data.result, base_path: path })
      setScreen(SCREENS.SELECTION)
    } catch {
      setDetectionResult({ type: 'Unknown', base_path: path })
      setScreen(SCREENS.SELECTION)
    }
  }

  const handleResetSession = () => {
    if (window.confirm('Are you sure you want to switch folders? Current session will be cleared.')) {
        localStorage.removeItem('last_emulator_path')
        localStorage.removeItem('last_android_version')
        setDetectionResult(null)
        setSelectedVersionId(null)
        setScreen(SCREENS.INTRO)
    }
  }

  const handleStart = (versionId) => {
    // Save version and switch to dashboard
    localStorage.setItem('last_android_version', versionId)
    setSelectedVersionId(versionId)
    setShouldAutoStart(false) // Disable auto-start on selection
    setScreen(SCREENS.DASHBOARD)
  }

  const handleRetry = () => { setDetectionResult(null); setScreen(SCREENS.INTRO) }
  const handleDisconnect = () => { setDetectionResult(null); setSelectedVersionId(null); setScreen(SCREENS.INTRO) }
  
  if (!isPathRestored) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)]">
             <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-[var(--border)] opacity-30"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-[var(--accent)] animate-spin"></div>
             </div>
             <p className="text-sm font-medium text-[var(--text-muted)] animate-pulse">Initializing system...</p>
          </div>
      )
  } 

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
                autoStart={shouldAutoStart}
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
