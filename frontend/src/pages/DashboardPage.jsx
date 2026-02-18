// pages/DashboardPage.jsx – moved from components/MainDashboard.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useBackend } from '../context/BackendContext'
import AppList from '../components/AppList'
import ConsoleLog from '../components/ConsoleLog'
import AddAppModal from '../components/AddAppModal'
import ConfirmDialog from '../components/ConfirmDialog'
import { CoreAPI, LogsAPI } from '../services/api'
import apiClient from '../services/api'

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { t } = useTranslation()
  const CONFIG = {
    stopped:  { dot: 'bg-zinc-400',                    cls: 'text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700' },
    starting: { dot: 'bg-amber-400 animate-pulse',     cls: 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700' },
    running:  { dot: 'bg-emerald-400 animate-pulse',   cls: 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' },
  }
  const cfg = CONFIG[status] ?? CONFIG.stopped
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {t(`status.${status}`, status)}
    </span>
  )
}

// ── Shield icon ───────────────────────────────────────────────────────────────
function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

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
  const [appsLoading, setAppsLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [logLines, setLogLines] = useState([])
  
  // Track the actual path the VM was started with to detect prompt changes
  const [runningPath, setRunningPath] = useState(null)
  const [packagesLoaded, setPackagesLoaded] = useState(false)
  const [confirmDeepScan, setConfirmDeepScan] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
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
    if (!isAndroidMounted) {
        toast.error(t('dashboard.invalid_mount_msg'))
        return
    }
    setAppsLoading(true)
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
    } finally { setAppsLoading(false) }
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
            toast.success('Core connected!')
            
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
        if (total === 0 && !appsLoading && !hasAutoScanned.current) {
            hasAutoScanned.current = true
            handleScanApps()
        }
    }
    return () => clearInterval(pollRef.current)
  }, [coreStatus, isAndroidMounted, fetchStatus, fetchLogs, fetchProfiles, handleScanApps, apps, appsLoading])

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
      toast.error(`Failed to start core: ${err.response?.data?.message ?? err.message}`)
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

  const isRunning = coreStatus === 'running'
  const isOperational = isRunning && isAndroidMounted
  const busy = actionLoading || appsLoading
  const totalApps = Object.values(apps).reduce((s, a) => s + a.length, 0)

  return (
    <div className="min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] bg-[var(--bg-primary)] flex flex-col lg:overflow-hidden">
      {/* ── Header ── */}
      {/* Removed duplicate header */}

      {/* ── Body: responsive grid ── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6 lg:overflow-hidden overflow-visible">

        {/* ── Control panel (left on desktop, top on mobile) ── */}
        <aside className="
          lg:col-span-3
          border-b lg:border-b-0 lg:border-r border-[var(--border)]
          bg-[var(--bg-secondary)]
          flex flex-col gap-4
          p-4 sm:p-5
          lg:overflow-y-auto
          h-auto lg:h-full
        ">
          {/* Core control */}
          <section>
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Micro-VM Core
            </h2>
            <div className={`rounded-lg border ${restartRequired ? 'border-amber-500/50 bg-amber-500/10' : 'border-[var(--border)] bg-[var(--bg-card)]'} p-4 flex flex-col gap-3 transition-colors`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">{t('dashboard.core_status')}</span>
                <StatusBadge status={restartRequired ? 'changing' : coreStatus} />
              </div>

              {restartRequired && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
                      {t('dashboard.restart_required_msg', 'Target changed. Restart core to apply.')}
                  </div>
              )}

              {coreStatus === 'running' && !isAndroidMounted && (
                  <div className="text-xs text-red-600 dark:text-red-400 font-bold mb-1 p-2 bg-red-500/10 rounded border border-red-500/20">
                      ⚠️ {t('dashboard.invalid_mount_msg', 'Android files not found. Please check your path and restart core.')}
                  </div>
              )}

              <AnimatePresence mode="wait">
                {coreStatus === 'stopped' ? (
                  <motion.button
                    key="start"
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    onClick={handleStart}
                    disabled={busy || !isConnected}
                    className="w-full py-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation"
                  >
                    {actionLoading ? t('dashboard.starting') : `▶ ${t('dashboard.start_core')}`}
                  </motion.button>
                ) : (
                  <motion.button
                    key="stop"
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    onClick={(restartRequired || !isAndroidMounted) ? handleRestart : handleStop}
                    disabled={busy}
                    className={`w-full py-3 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation ${
                        (restartRequired || !isAndroidMounted) 
                        ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse' 
                        : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100'
                    }`}
                  >
                    {actionLoading ? ((restartRequired || !isAndroidMounted) ? t('dashboard.restarting', 'Restarting...') : t('dashboard.stopping')) : ( (restartRequired || !isAndroidMounted) ? `↻ ${t('dashboard.restart_core', 'Restart Core')}` : `■ ${t('dashboard.stop_core')}`)}
                  </motion.button>
                )}
              </AnimatePresence>

              {coreStatus === 'starting' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  {t('dashboard.waiting_boot')}
                </p>
              )}
            </div>
          </section>

          {/* Scan */}
          <section>
            {/* Fast Scan Button (Default) */}
            <button
              onClick={() => handleScanApps(false)}
              disabled={!isOperational || busy}
              className={`
                w-full py-3 rounded-md text-sm font-semibold transition-all touch-manipulation mb-2
                ${isOperational && !busy
                  ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm'
                  : 'bg-[var(--bg-card)]/40 border border-[var(--border)]/40 text-[var(--text-muted)] cursor-not-allowed'
                }
              `}
            >
              {appsLoading && !packagesLoaded ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('dashboard.scanning')}
                </span>
              ) : `⚡ ${t('dashboard.fast_scan')}`}
            </button>

            {/* Slow Scan Button (Deep) */}
            <button
              onClick={() => setConfirmDeepScan(true)}
              disabled={!isOperational || busy}
              className={`
                w-full py-2.5 rounded-md text-xs font-semibold transition-all touch-manipulation
                ${isOperational && !busy
                  ? 'bg-[var(--bg-card)] border border-amber-500/50 hover:border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'bg-[var(--bg-card)]/40 border border-[var(--border)]/40 text-[var(--text-muted)] cursor-not-allowed'
                }
              `}
            >
              {appsLoading && packagesLoaded ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('dashboard.scanning')}
                </span>
              ) : `🔍 ${t('dashboard.slow_scan')}`}
            </button>
            
            <button
              onClick={() => setShowAddApp(true)}
              disabled={!isOperational || busy}
              className={`
                w-full py-3 rounded-md text-sm font-semibold transition-all touch-manipulation mt-2
                ${isOperational && !busy
                  ? 'bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-[var(--bg-card)]/40 border border-[var(--border)]/40 text-[var(--text-muted)] cursor-not-allowed'
                }
              `}
            >
              ➕ {t('dashboard.add_app', 'Add a app')}
            </button>
          </section>

          {/* Actions */}
          <section>
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Actions</h2>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => selected.size > 0 && setConfirmDelete(true)}
                disabled={!isOperational || busy || selected.size === 0}
                className={`
                  w-full flex items-center justify-center gap-2 py-3 rounded-md text-sm font-semibold transition-all touch-manipulation
                  ${isOperational && selected.size > 0 && !busy
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-red-500/10 text-red-400/50 cursor-not-allowed border border-red-500/20'
                  }
                `}
              >
                🗑 {t('dashboard.delete_selected')}
                {selected.size > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/30 text-xs">{selected.size}</span>
                )}
              </button>
            </div>
          </section>
        </aside>

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
                      loading={appsLoading} 
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
    </div>
  )
}
