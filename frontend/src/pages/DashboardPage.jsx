// pages/DashboardPage.jsx – moved from components/MainDashboard.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import osToast from '../components/OS/osToast';
const toast = osToast;
import { useTranslation } from 'react-i18next'
import { useBackend } from '../context/BackendContext'
import AppList from '../components/AppList'
import ConsoleLog from '../components/ConsoleLog'
import AddAppModal from '../components/AddAppModal'
import ConfirmDialog from '../components/ConfirmDialog'
import FileExplorerModal from '../components/FileExplorer/FileExplorerModal'
import { CoreAPI, LogsAPI, AppsAPI, AppsExportAPI } from '../services/api'
import apiClient from '../services/api'
import ActionPanel from '../components/ActionPanel'
import FolderBrowserModal from '../components/FolderBrowserModal'



// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage({ basePath, emulatorType, versionId, autoStart, onDisconnect }) {
  const { t } = useTranslation()
  const { isConnected, isAdmin } = useBackend()
  const [coreStatus, setCoreStatus] = useState('stopped')
  const [isAndroidMounted, setIsAndroidMounted] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [apps, setApps] = useState(() => {
    try {
      const saved = sessionStorage.getItem('cachedApps')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [scanningType, setScanningType] = useState(null) // 'fast' | 'deep' | null
  const [selected, setSelected] = useState(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [logLines, setLogLines] = useState([])
  
  // Track the actual path the VM was started with to detect prompt changes
  const [runningPath, setRunningPath] = useState(null)
  const [packagesLoaded, setPackagesLoaded] = useState(false)
  const [confirmDeepScan, setConfirmDeepScan] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [showFileExplorer, setShowFileExplorer] = useState(false)
  const [showMovePicker, setShowMovePicker] = useState(false)
  const [categoryRoots, setCategoryRoots] = useState(() => {
    try {
      const saved = sessionStorage.getItem('cachedCategoryRoots')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  
  const [profiles, setProfiles] = useState([])
  const [loadingProfile, setLoadingProfile] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(() => sessionStorage.getItem('lastRefreshTime') || null)
  
  const pollRef = useRef(null)
  const hasAutoScanned = useRef(false)
  const prevCoreStatus = useRef(null)

  // Sync to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('cachedApps', JSON.stringify(apps))
  }, [apps])

  useEffect(() => {
    sessionStorage.setItem('cachedCategoryRoots', JSON.stringify(categoryRoots))
  }, [categoryRoots])

  useEffect(() => {
    if (lastRefresh) sessionStorage.setItem('lastRefreshTime', lastRefresh)
    else sessionStorage.removeItem('lastRefreshTime')
  }, [lastRefresh])

  // ── Polling ───────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await CoreAPI.getStatus()
      setCoreStatus(data.status)
      setIsAndroidMounted(data.is_android_mounted ?? true)
      // If we recover a running session, we might not know the original path.
      // But usually we start from stopped.
      if (data.status === 'stopped') {
          setRunningPath(null)
          setIsAndroidMounted(true)
      }
      return data
    } catch { 
      setCoreStatus('stopped')
      return { status: 'stopped' }
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      const { data } = await LogsAPI.getTail()
      setLogLines(data.logs ?? [])
    } catch { /* silent */ }
  }, [])

  // ── SSH connection feedback toast ─────────────────────────────────────
  useEffect(() => {
    if (prevCoreStatus.current === 'starting' && coreStatus === 'running') {
      toast.success('Core Started!')
    }
    prevCoreStatus.current = coreStatus
  }, [coreStatus])
  
  const fetchProfiles = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/profiles')
      setProfiles(data.profiles ?? [])
    } catch (err) {
      console.error("Failed to fetch profiles", err)
    }
  }, [])

  // Detect path mismatch
  const restartRequired = isConnected && coreStatus === 'running' && runningPath && runningPath !== basePath

  const handleScanApps = useCallback(async (isDeep = false) => {
    if (restartRequired) {
        toast.error(t('dashboard.restart_required'))
        return
    }
    if (coreStatus !== 'running') return

    setScanningType(isDeep ? 'deep' : 'fast')
    try {
      // Core is already running/connected, so just fetch apps with long timeout
      // isDeep=true means we DON'T skip (skip_packages=false)
      // isDeep=false means we DO skip (skip_packages=true)
      const skip = isDeep === true ? 'false' : 'true'
      const { data } = await apiClient.get(`/api/apps?skip_packages=${skip}`, { timeout: 350000 })
      setApps(data.apps ?? {})
      setCategoryRoots(data.category_roots ?? {})
      setPackagesLoaded(isDeep)
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setLastRefresh(time)
      const total = Object.values(data.apps ?? {}).reduce((s, a) => s + a.length, 0)
      toast.success(`${isDeep ? 'Deep' : 'Fast'} scan complete. Found ${total} apps`)
    } catch (err) {
      toast.error(`Scan failed: ${err.response?.data?.message ?? err.message}`)
    } finally { setScanningType(null) }
  }, [coreStatus, isAndroidMounted, restartRequired, t])

  // Initial fetch
  useEffect(() => { fetchStatus(); fetchLogs() }, [fetchStatus, fetchLogs])

  // Smart polling & Profiles
  useEffect(() => {
    if (coreStatus === 'starting') {
      pollRef.current = setInterval(async () => {
        const data = await fetchStatus()
        if (data.status === 'running' && data.is_android_mounted !== false) {
            clearInterval(pollRef.current)
            
            // Log to frontend console
            const timestamp = new Date().toLocaleTimeString('en-GB')
            setLogLines(prev => [...prev, `[${timestamp}] [INFO] Core connected`])
            
            // Refresh real backend logs one last time
            fetchLogs()
            
            // Fetch profiles
            fetchProfiles()

            // Auto-scan once connected (only once)
            if (!hasAutoScanned.current) {
                hasAutoScanned.current = true
                handleScanApps()
            }
        }
      }, 2000)
    } else if (coreStatus === 'running' && isAndroidMounted) {
        // Just in case we mounted while already running
        fetchProfiles()
        
        // Auto-scan if empty and haven't tried yet
        const total = Object.values(apps).reduce((s, a) => s + a.length, 0)
        if (total === 0 && !scanningType && !hasAutoScanned.current) {
            hasAutoScanned.current = true
            handleScanApps()
        }
    }
    return () => clearInterval(pollRef.current)
  }, [coreStatus, isAndroidMounted, fetchStatus, fetchLogs, fetchProfiles, handleScanApps, apps, scanningType])

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleSelected = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])
  
  const handleProfileSelect = async (profile) => {
    if (!profile.id) return
    setLoadingProfile(profile.id)
    try {
      const { data } = await apiClient.get(`/api/profiles/${profile.id}`)
      const packages = data.packages || []
      
      setSelected(prev => {
        const next = new Set(prev)
        const pathLookup = new Map()
        const packageLookup = new Map()

        Object.values(apps).flat().forEach(app => {
            // app.path is like "system/app/YouTube", or provided with lead slash
            // Normalize to no leading slash for consistency in ID
            const normPath = app.path.startsWith('/') ? app.path.substring(1) : app.path
            pathLookup.set(normPath.toLowerCase(), normPath)
            
            if (app.package) {
                packageLookup.set(app.package.toLowerCase(), normPath)
            }
            pathLookup.set(app.name.toLowerCase(), normPath)
        })

        let count = 0
        packages.forEach(pkgPath => {
           const normPkgPath = pkgPath.startsWith('/') ? pkgPath.substring(1) : pkgPath
           const pkgName = pkgPath.split('/').pop().toLowerCase()
           
           let id = pathLookup.get(normPkgPath.toLowerCase())
           if (!id) id = packageLookup.get(pkgPath.toLowerCase())
           if (!id) id = pathLookup.get(pkgName)
           
           if (id) {
             next.add(id)
             count++
           }
        })

        if (count === 0) {
          toast.info(t('dashboard.profile_no_match', 'No apps from this profile were found on the device.'))
          return prev // do not mutate selection
        }
        
        toast.success(t('dashboard.profile_selected', { count, profile: profile.name }))
        return next
      })
    } catch (err) {
      toast.error("Failed to load profile")
    } finally {
      setLoadingProfile(null)
    }
  }

  const handleStart = useCallback(async () => {
    if (!isConnected) return
    setActionLoading(true)
    try {
      const { data } = await CoreAPI.start(basePath, emulatorType, versionId)
      toast.success(`Core started (PID ${data.pid})`)
      setCoreStatus('starting')
      setRunningPath(basePath) // Track active path
    } catch (err) {
      const msg = err.response?.data?.message ?? err.message ?? ''
      if (msg.includes(`${cfg?.SSH_PORT ?? 10022}`) || msg.toLowerCase().includes('port')) {
        toast.error(`Port ${cfg?.SSH_PORT ?? 10022} is blocked! Please close other app or emulator apps.`)
      } else {
        toast.error(`Failed to start core: ${msg}`)
      }
    } finally { setActionLoading(false) }
  }, [isConnected, basePath, emulatorType, versionId])

  // ── Auto-start on mount ───────────────────────────────────────────────────
  const hasAutoStarted = useRef(false)
  useEffect(() => {
    if (isConnected && autoStart && !hasAutoStarted.current && basePath && versionId) {
      hasAutoStarted.current = true
      handleStart()
    }
  }, [isConnected, autoStart, basePath, versionId, handleStart])

  const handleStop = async () => {
    setActionLoading(true)
    try {
      await CoreAPI.stop()
      toast.success('Core stopped.')
      setCoreStatus('stopped'); setApps({}); setSelected(new Set()); setLastRefresh(null)
      setRunningPath(null)
      setPackagesLoaded(false)
      hasAutoScanned.current = false
      // Clear user-installed tracking on stop/disconnect
      localStorage.removeItem('userInstalledApps')
      sessionStorage.removeItem('cachedApps')
      sessionStorage.removeItem('cachedCategoryRoots')
      sessionStorage.removeItem('lastRefreshTime')
    } catch (err) {
      toast.error(`Failed to stop core: ${err.response?.data?.message ?? err.message}`)
    } finally { setActionLoading(false) }
  }

  const handleRestart = async () => {
    setActionLoading(true)
    try {
      // 1. Kill PID (stop)
      await CoreAPI.stop()
      setCoreStatus('stopped'); setApps({}); setSelected(new Set()); setLastRefresh(null)
      setRunningPath(null)
      setPackagesLoaded(false)
      hasAutoScanned.current = false
      localStorage.removeItem('userInstalledApps')
      sessionStorage.removeItem('cachedApps')
      sessionStorage.removeItem('cachedCategoryRoots')
      sessionStorage.removeItem('lastRefreshTime')
      
      // small delay to ensure cleanup
      await new Promise(r => setTimeout(r, 1000))

      // 2. Automatic start again
      const { data } = await CoreAPI.start(basePath, emulatorType, versionId)
      toast.success(`Core restarted (PID ${data.pid})`)
      setCoreStatus('starting')
      setRunningPath(basePath)
    } catch (err) {
      toast.error(`Failed to restart core: ${err.response?.data?.message ?? err.message}`)
    } finally { setActionLoading(false) }
  }


  const handleAppAdded = useCallback((newApp, category) => {
    setApps(prev => {
      const next = { ...prev }
      if (!next[category]) next[category] = []
      // Avoid duplicates
      if (!next[category].find(a => a.path === newApp.path)) {
        next[category] = [...next[category], newApp].sort((a, b) => a.name.localeCompare(b.name))
      }
      return next
    })
  }, [])

  const handleDelete = async () => {
    if (selected.size === 0) return
    setConfirmDelete(false)
    const paths = Array.from(selected).map((id) => `/mnt/android/${id}`)
    setActionLoading(true)
    try {
      const { data } = await apiClient.post('/api/delete', { paths })
      toast.success(`Deleted ${Object.keys(data.deleted ?? {}).length} app(s)`)
      if (data.errors) {
        for (const [p, e] of Object.entries(data.errors)) {
          toast.error(`Error deleting ${p.split('/').pop()}: ${e}`)
        }
      }
      const { data: appsData } = await apiClient.get('/api/apps')
      setApps(appsData.apps ?? {}); setSelected(new Set())
    } catch (err) {
      toast.error(`Delete failed: ${err.response?.data?.message ?? err.message}`)
    } finally { setActionLoading(false) }
  }

  // ── Batch Actions ────────────────────────────────────────────────────────
  const handleMoveTo = () => {
    if (selected.size === 0) return
    setShowMovePicker(true)
  }

  const handleMoveConfirm = async (targetPath) => {
    setShowMovePicker(false)
    setActionLoading(true)
    const sources = Array.from(selected).map(id => `/mnt/android/${id}`)
    
    try {
      const { data } = await AppsAPI.moveBatch(sources, targetPath)
      toast.success(`Moved ${data.moved?.length || 0} items successfully`)
      if (data.errors && data.errors.length > 0) {
         toast.error(`Failed to move ${data.errors.length} items`)
      }
      // Refresh
      handleScanApps(false)
      setSelected(new Set())
    } catch (err) {
      toast.error(`Batch move failed: ${err.response?.data?.message ?? err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleExportAll = async () => {
    if (selected.size === 0) return
    const files = []
    
    // Build file list from selected IDs
    for (const catList of Object.values(apps)) {
      for (const app of catList) {
        // app.id was constructed in AppList as path without leading slash
        let id = app.path
        if (id.startsWith('/')) id = id.substring(1)
        
        if (selected.has(id)) {
            files.push({
                path: app.path, 
                name: app.name
            })
        }
      }
    }

    if (files.length === 0) return

    setActionLoading(true)
    const toastId = toast.loading(`Exporting ${files.length} apps...`)
    
    try {
      await AppsExportAPI.exportBatch(files)
      toast.success("Export complete!", { id: toastId })
      setSelected(new Set())
    } catch (err) {
      toast.error(`Batch export failed: ${err.message}`, { id: toastId })
    } finally {
      setActionLoading(false)
    }
  }

  const isRunning = coreStatus === 'running'
  const isOperational = isRunning && isAndroidMounted
  const busy = actionLoading || !!scanningType
  const totalApps = Object.values(apps).reduce((s, a) => s + a.length, 0)

  return (
    <div className="min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] bg-[var(--bg-primary)] flex flex-col lg:overflow-hidden">
      {/* ── Header ── */}
      {/* Removed duplicate header */}

      {/* ── Body: responsive grid ── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6 lg:overflow-hidden overflow-visible">

        {/* ── Control panel (left on desktop, top on mobile) ── */}
        <ActionPanel 
          coreStatus={coreStatus}
          isAndroidMounted={isAndroidMounted}
          isConnected={isConnected}
          busy={busy}
          loading={actionLoading}
          restartRequired={restartRequired}
          onStart={handleStart}
          onStop={handleStop}
          onRestart={handleRestart}
          onScan={() => handleScanApps(false)}
          onDeepScan={() => setConfirmDeepScan(true)}
          onAddApp={() => setShowAddApp(true)}
          onOpenFileExplorer={() => setShowFileExplorer(true)}
          selectedCount={selected.size}
          onDelete={() => setConfirmDelete(true)}
          onMove={handleMoveTo}
          onExport={handleExportAll}
          scanningType={scanningType}
          packagesLoaded={packagesLoaded}
        />

        {/* ── Right panel (app list + log) ── */}
        <div className="lg:col-span-9 flex flex-col min-h-0 lg:overflow-hidden overflow-visible">
          {/* App list area */}
          <div className="flex-1 flex flex-col p-4 sm:p-6 min-h-0 lg:overflow-hidden">
            {/* App List Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('dashboard.installed_apps')}</h2>
              {isRunning && (
                <div className="flex items-center gap-4">
                  {lastRefresh && (
                    <span className="text-[10px] text-[var(--text-muted)] font-medium bg-[var(--bg-secondary)] px-2 py-1 rounded-md border border-[var(--border)]">
                      {t('dashboard.last_refresh', 'Last refresh')}: {lastRefresh}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col xl:flex-row gap-4 min-h-0 lg:overflow-hidden">
                {/* App List - Independent Scroll */}
                <div className="flex-1 lg:overflow-y-auto pr-1 custom-scrollbar">
                    <AppList 
                      apps={apps} 
                      selected={selected} 
                      onToggle={toggleSelected} 
                      loading={!!scanningType} 
                      onRefresh={() => handleScanApps(false)}
                      categoryRoots={categoryRoots}
                    />
                </div>
                
                {/* Profiles Sidebar - Independent Scroll */}
                {isOperational && profiles.length > 0 && (
                  <div className="w-full xl:w-64 border-t xl:border-t-0 xl:border-l border-[var(--border)] pt-4 xl:pt-0 xl:pl-4 lg:overflow-y-auto custom-scrollbar shrink-0">
                     <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3 sticky top-0 bg-[var(--bg-primary)] py-1">
                       {t('dashboard.profiles', 'Debloat Profiles')}
                     </h2>
                     <div className="flex flex-col gap-3">
                       {profiles.map(profile => (
                         <div 
                           key={profile.id}
                           onClick={() => !loadingProfile && handleProfileSelect(profile)}
                           className={`
                             border border-[var(--border)] rounded-lg p-3 cursor-pointer
                             hover:bg-[var(--bg-card)] hover:border-[var(--accent)] hover:shadow-sm transition-all
                             ${loadingProfile === profile.id ? 'opacity-70 cursor-wait' : ''}
                           `}
                         >
                           <div className="flex items-center justify-between mb-1">
                             <h3 className="text-sm font-semibold text-[var(--text-primary)]">{profile.name}</h3>
                             {loadingProfile === profile.id && <svg className="animate-spin w-3 h-3 text-[var(--accent)]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                           </div>
                           <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                             {profile.description}
                           </p>
                         </div>
                       ))}
                     </div>
                  </div>
                )}
            </div>
          </div>
          
          {/* Log console – fixed height, responsive */}
          <div className="p-3 sm:p-4 border-t border-[var(--border)] shrink-0 h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80">
            <ConsoleLog logs={logLines} onClear={() => setLogLines([])} />
          </div>
        </div>
      </main>

      {/* ── Confirm Delete Dialog ── */}
      <ConfirmDialog
        isOpen={confirmDelete}
        title={t('dashboard.confirm_delete_title')}
        message={t('dashboard.confirm_delete_msg', { count: selected.size })}
        confirmText={t('dashboard.delete')}
        cancelText={t('dashboard.cancel')}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        type="danger"
      />

      {/* ── Confirm Deep Scan Dialog ── */}
      <ConfirmDialog
        isOpen={confirmDeepScan}
        title={t('dashboard.confirm_slow_scan_title')}
        message={t('dashboard.confirm_slow_scan_msg')}
        confirmText={t('dashboard.slow_scan')}
        cancelText={t('dashboard.cancel')}
        onConfirm={() => {
            setConfirmDeepScan(false)
            handleScanApps(true)
        }}
        onCancel={() => setConfirmDeepScan(false)}
        type="warning"
      />
      {/* ── Add App Modal ── */}
      <AddAppModal 
        isOpen={showAddApp} 
        onClose={() => setShowAddApp(false)} 
        onRefresh={handleAppAdded}
        categoryRoots={categoryRoots}
      />

      {/* ── File Explorer Modal ── */}
      {showFileExplorer && (
        <FileExplorerModal onClose={() => setShowFileExplorer(false)} />
      )}

      {/* ── Folder Browser Modal ── */}
      {showMovePicker && (
        <FolderBrowserModal 
           onConfirm={handleMoveConfirm}
           onClose={() => setShowMovePicker(false)}
        />
      )}


    </div>
  )
}
