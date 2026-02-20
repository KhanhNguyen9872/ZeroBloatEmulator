import { DANGEROUS_PACKAGES } from '../config/dangerous'
import { useTranslation } from 'react-i18next'
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AppsAPI, AppsExportAPI } from '../services/api'
import osToast from './OS/osToast';
const toast = osToast;
import ConfirmDialog from './ConfirmDialog'

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return null
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export default function AppList({ apps, selected, onToggle, loading, onRefresh, categoryRoots }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showDangerousModal, setShowDangerousModal] = useState(false)
  const [pendingId, setPendingId] = useState(null)
  const [ignoreWarnings, setIgnoreWarnings] = useState(() => {
    return localStorage.getItem('ignoreDangerousWarnings') === 'true'
  })
  
  // Per-app actions
  const [activeMenu, setActiveMenu] = useState(null)
  const [renameItem, setRenameItem] = useState(null) // { id, name, rawPath }
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [sortKey, setSortKey] = useState('name') // 'name' | 'size' | 'time'
  const [exportingPkg, setExportingPkg] = useState(null)
  
  const [moveItem, setMoveItem] = useState(null) // app object
  const [moving, setMoving] = useState(false)

  // Single-delete confirmation
  const [deleteConfirmApp, setDeleteConfirmApp] = useState(null)  // app object pending delete
  const [deletingApp, setDeletingApp] = useState(false)
  const [userInstalled, setUserInstalled] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('userInstalledApps') || '[]')
    } catch { return [] }
  })

  // Poll for user-installed changes (simple way since localStorage is updated in another component)
  useEffect(() => {
    const check = () => {
      try {
        const list = JSON.parse(localStorage.getItem('userInstalledApps') || '[]')
        setUserInstalled(list)
      } catch {}
    }
    const timer = setInterval(check, 1000)
    return () => clearInterval(timer)
  }, [])

  // Flatten { app: [...], "priv-app": [...] } into labelled entries
  const allApps = useMemo(() => {
    const entries = []
    for (const [category, items] of Object.entries(apps)) {
      for (const item of items) {
        let id = item.path
        if (id.startsWith('/')) id = id.substring(1)
        entries.push({
          id: id,
          name: item.name,
          package: item.package,
          category: category,
          rawPath: item.path,
          apkFilename: item.apkFilename,
          size: item.size ?? null,
          time: item.time ?? null,
        })
      }
    }
    return entries
  }, [apps])

  const categories = useMemo(() => {
    const cats = new Set(allApps.map(a => a.category))
    return ['all', ...Array.from(cats).sort()]
  }, [allApps])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let result = allApps

    if (q) {
        result = result.filter(
            (a) => a.name.toLowerCase().includes(q) || 
                   (a.package && a.package.toLowerCase().includes(q)) ||
                   a.category.toLowerCase().includes(q)
        )
    }

    if (categoryFilter !== 'all') {
        result = result.filter(a => a.category === categoryFilter)
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortKey === 'size') {
        return (b.size ?? 0) - (a.size ?? 0)  // largest first
      } else if (sortKey === 'time') {
        // newest first
        return (b.time ?? '').localeCompare(a.time ?? '')
      }
      // default: name A-Z
      return a.name.localeCompare(b.name)
    })

    return result
  }, [allApps, search, categoryFilter, sortKey])

  const handleToggle = (e, app) => {
    // If the click came from a button inside the row, don't toggle
    if (e && e.target.closest('button')) return

    const isDangerous = app.package && DANGEROUS_PACKAGES.includes(app.package)
    const isSelecting = !selected.has(app.id)

    if (isSelecting && isDangerous && !ignoreWarnings) {
      setPendingId(app.id)
      setShowDangerousModal(true)
      return
    }

    onToggle(app.id)
  }

  const confirmDangerous = () => {
    if (pendingId) {
      onToggle(pendingId)
      setPendingId(null)
    }
    setShowDangerousModal(false)
  }

  const handleIgnoreChange = (e) => {
    const checked = e.target.checked
    setIgnoreWarnings(checked)
    localStorage.setItem('ignoreDangerousWarnings', checked ? 'true' : 'false')
  }

  const selectedCount = selected.size

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
    setActiveMenu(null)
  }

  const handleSingleDelete = (app) => {
    setActiveMenu(null)
    // Route through confirmation dialog regardless of dangerous status
    setDeleteConfirmApp(app)
  }

  const executeSingleDelete = async () => {
    if (!deleteConfirmApp) return
    const app = deleteConfirmApp
    setDeletingApp(true)
    // Also check dangerous warning AFTER confirmation
    try {
      const fullPath = `/mnt/android/${app.id}`
      await AppsAPI.delete([fullPath])
      toast.success(`Deleted ${app.name}`)
      setDeleteConfirmApp(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      toast.error(`Delete failed: ${err.response?.data?.message ?? err.message}`)
    } finally {
      setDeletingApp(false)
    }
  }

  const handleRenameClick = (app) => {
    setActiveMenu(null)
    setRenameItem(app)
    setNewName(app.name)
  }

  const handleRenameSubmit = async () => {
    if (!newName || newName === renameItem.name) {
      setRenameItem(null)
      return
    }
    setRenaming(true)
    try {
      // rawPath is e.g. /system/app/YouTube
      await AppsAPI.rename(renameItem.rawPath, newName)
      toast.success('Renamed successfully')
      setRenameItem(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      toast.error(`Rename failed: ${err.response?.data?.message ?? err.message}`)
    } finally {
      setRenaming(false)
    }
  }

  const handleMoveSubmit = async (targetCategory) => {
    if (!moveItem || !targetCategory) return
    const root = categoryRoots?.[targetCategory]
    if (!root) {
        toast.error(`Category root for ${targetCategory} not found.`)
        return
    }

    setMoving(true)
    try {
      await AppsAPI.move(moveItem.rawPath, root)
      toast.success(t('dashboard.moved_success', 'Moved successfully.'))
      setMoveItem(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.message || err.message)
    } finally {
      setMoving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-muted)]">
        <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    )
  }

  if (allApps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--text-muted)]">
        <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-sm">{t('dashboard.no_apps')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Search + stats bar */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('dashboard.search_apps')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              w-full pl-9 pr-4 py-2.5 rounded-lg text-sm
              bg-[var(--bg-secondary)] border border-[var(--border)]
              text-[var(--text-primary)] placeholder-[var(--text-muted)]
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
              transition-all shadow-sm
            "
          />
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 invisible-scrollbar no-scrollbar">
            {categories.map(cat => (
                <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`
                        whitespace-nowrap px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight transition-all border
                        ${categoryFilter === cat
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:border-blue-500/50 hover:text-[var(--text-primary)]'
                        }
                    `}
                >
                    {cat === 'all' ? t('dashboard.all_folders', 'All Folders') : (cat.includes('app') ? cat : `/system/${cat}`)}
                </button>
            ))}
        </div>
        
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">
            {selectedCount > 0 
              ? <span className="text-blue-600 dark:text-blue-400">{selectedCount} {t('dashboard.delete')}</span>
              : `${allApps.length} ${t('dashboard.installed_apps')}`
            }
          </span>
          
          <div className="flex gap-2 items-center text-xs">
            {/* Sort dropdown */}
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md px-2 py-1 text-[var(--text-muted)] focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="name">{t('dashboard.sort_name')}</option>
              <option value="size">{t('dashboard.sort_size')}</option>
              <option value="time">{t('dashboard.sort_time')}</option>
            </select>
            <span className="text-[var(--border)]">|</span>
            <button
              onClick={() => {
                filtered.forEach((a) => {
                  if (selected.has(a.id)) return
                  const isDangerous = a.package && DANGEROUS_PACKAGES.includes(a.package)
                  if (isDangerous && !ignoreWarnings) return
                  onToggle(a.id)
                })
              }}
              className="text-[var(--text-primary)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
            >
              {t('dashboard.select_all')}
            </button>
            <span className="text-[var(--border)]">|</span>
            <button
              onClick={() => filtered.forEach((a) => selected.has(a.id) && onToggle(a.id))}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {t('dashboard.deselect_all')}
            </button>
          </div>
        </div>
      </div>

      {/* App list */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 -mr-1">
        <div className="flex flex-col gap-1.5 pb-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-lg m-1">
              <svg className="w-8 h-8 opacity-40 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">{t('dashboard.no_match')} "{search}"</p>
            </div>
          ) : (
            filtered.map((app) => {
              const isSelected = selected.has(app.id)
              return (
                <div
                  key={app.id}
                  onClick={(e) => handleToggle(e, app)}
                  className={`
                    relative flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer
                    border transition-all duration-200 group
                    ${isSelected
                      ? 'bg-blue-500/5 border-blue-500/30 shadow-sm'
                      : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-blue-500/30 hover:shadow-sm'
                    }
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0
                    ${isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-[var(--bg-secondary)] border-[var(--border)] group-hover:border-blue-500/50'
                    }
                  `}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleToggle(e, app)}
                    className="hidden" // hidden input, custom checkbox above
                  />
                  
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate transition-colors ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-primary)]'}`}>
                          {app.name}
                        </p>
                        {app.package && DANGEROUS_PACKAGES.includes(app.package) && (
                          <span className="shrink-0 flex items-center bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter border border-red-500/20">
                            {t('dashboard.critical')}
                          </span>
                        )}
                        {app.package && userInstalled.includes(app.package) && (
                          <span className="shrink-0 flex items-center bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter border border-emerald-500/20">
                            {t('dashboard.installed_by_user')}
                          </span>
                        )}
                      </div>
                        <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 truncate">
                          {app.package && (
                              <span className="font-mono text-[10px] bg-[var(--bg-secondary)] px-1 rounded text-[var(--text-primary)]/70 min-w-0 truncate" title={app.package}>{app.package}</span>
                          )}
                          {app.apkFilename && (
                              <span className="font-mono text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-[var(--text-muted)] border border-[var(--border)] min-w-0 truncate hidden sm:inline-block" title={app.apkFilename}>
                                {app.apkFilename}
                              </span>
                          )}
                          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                          {app.category}
                        </p>
                    </div>

                    {/* Metadata: size + time */ }
                    <div className="relative shrink-0 flex items-center gap-4">
                      <div className="text-right hidden sm:flex flex-col items-end gap-0.5">
                        {app.size != null && (
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 tabular-nums">
                              {formatBytes(app.size)}
                            </span>
                        )}
                        {app.time && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                              {app.time}
                            </span>
                        )}
                      </div>
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setActiveMenu(activeMenu === app.id ? null : app.id)
                        }}
                        className={`
                          p-1.5 rounded-md transition-colors
                          ${activeMenu === app.id ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600' : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}
                        `}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                        </svg>
                      </button>

                      {/* Dropdown Menu */}
                      <AnimatePresence>
                        {activeMenu === app.id && (
                          <>
                            <div className="fixed inset-0 z-[60]" onClick={() => setActiveMenu(null)} />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl z-[70] py-1.5 overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                               <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border)] mb-1">
                                 {t('file_explorer.actions', 'Actions')}
                               </div>
                               
                               <button onClick={() => copyToClipboard(app.name, 'Name')} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2">
                                 {t('dashboard.copy_name')}
                               </button>

                               {app.package && (
                                 <button onClick={() => copyToClipboard(app.package, 'Package')} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2">
                                   {t('dashboard.copy_package')}
                                 </button>
                               )}

                               <button onClick={() => copyToClipboard(app.rawPath, 'Path')} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2">
                                 {t('dashboard.copy_path')}
                               </button>

                               <div className="border-t border-[var(--border)] my-1" />

                               <button 
                                 onClick={() => {
                                   setMoveItem(app)
                                   setActiveMenu(null)
                                 }} 
                                 className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2 text-blue-600 dark:text-blue-400"
                               >
                                 {t('dashboard.move_app')}
                               </button>

                               {app.package && (
                                 <>
                                   <div className="border-t border-[var(--border)] my-1" />
                                     <button
                                       disabled={exportingPkg === app.package}
                                       onClick={async () => {
                                         setActiveMenu(null)
                                         setExportingPkg(app.package)
                                         const toastId = toast.loading(`Exporting ${app.name}…`)
                                         try {
                                           // APK is at rawPath (backend now returns full file path)
                                           await AppsExportAPI.export(app.rawPath, app.package)
                                           toast.success(`Exported ${app.name}`, { id: toastId })
                                         } catch (err) {
                                           toast.error(`Export failed: ${err.response?.data?.message ?? err.message}`, { id: toastId })
                                         } finally {
                                           setExportingPkg(null)
                                         }
                                       }}
                                       className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] text-emerald-600 dark:text-emerald-400 flex items-center gap-2 disabled:opacity-50"
                                     >
                                       {exportingPkg === app.package ? t('dashboard.exporting') : t('dashboard.export_apk')}
                                     </button>
                                 </>
                               )}

                               <div className="border-t border-[var(--border)] my-1" />

                               <button onClick={() => handleRenameClick(app)} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] text-blue-600 dark:text-blue-400 flex items-center gap-2">
                                 {t('file_explorer.rename')}
                               </button>

                               <button onClick={() => handleSingleDelete(app)} className="w-full text-left px-3 py-2 text-xs hover:bg-red-500/10 text-red-600 flex items-center gap-2">
                                 {t('dashboard.uninstall_app')}
                               </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Dangerous App Warning Modal */}
      <AnimatePresence>
        {showDangerousModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[var(--bg-card)] border border-red-500/30 rounded-xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold">{t('dashboard.confirm_delete_title')}</h3>
              </div>

              <p className="text-sm text-[var(--text-primary)] mb-2 font-semibold">
                {t('dashboard.confirm_delete_msg', { count: 1 }).split('.')[0]}.
              </p>
              <p className="text-sm text-[var(--text-muted)] mb-6 leading-relaxed">
                {t('dashboard.delete_warning_details')}
              </p>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <input
                    id="ignoreDangerous"
                    type="checkbox"
                    checked={ignoreWarnings}
                    onChange={handleIgnoreChange}
                    className="w-4 h-4 rounded border-[var(--border)] text-red-600 focus:ring-red-500 bg-[var(--bg-secondary)]"
                  />
                  <label htmlFor="ignoreDangerous" className="text-xs text-[var(--text-muted)] cursor-pointer select-none">
                    {t('dashboard.do_not_ask_again')}
                  </label>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowDangerousModal(false); setPendingId(null); }}
                    className="flex-1 py-2.5 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {t('dashboard.cancel')}
                  </button>
                  <button
                    onClick={confirmDangerous}
                    className="flex-1 py-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-lg shadow-red-600/20"
                  >
                    {t('dashboard.i_understand')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {renameItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Rename App</h3>
              <p className="text-xs text-[var(--text-muted)] mb-4 truncate">From: {renameItem.name}</p>

              <div className="mb-6">
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase mb-2">New Folder Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                  className="w-full px-4 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setRenameItem(null)}
                  disabled={renaming}
                  className="flex-1 py-2.5 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {t('dashboard.cancel')}
                </button>
                <button
                  onClick={handleRenameSubmit}
                  disabled={renaming || !newName || newName === renameItem.name}
                  className="flex-1 py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {renaming ? '...' : 'Rename'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Move App Modal */}
      <AnimatePresence>
        {moveItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Move App</h3>
              <p className="text-xs text-[var(--text-muted)] mb-4 truncate">Move: {moveItem.name}</p>
              <p className="text-[10px] text-[var(--text-muted)] mb-4 bg-[var(--bg-secondary)] p-2 rounded border border-[var(--border)] font-mono break-all line-clamp-2">
                Current: {moveItem.rawPath}
              </p>

              <div className="mb-6">
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase mb-3 text-center tracking-widest">Select Destination</label>
                <div className="grid grid-cols-1 gap-2">
                  {['app', 'priv-app', 'vendor-app', 'vendor-priv-app', 'product-app', 'product-priv-app'].map(cat => {
                    const root = categoryRoots?.[cat]
                    if (!root) return null
                    // Don't show current category
                    if (moveItem.category === cat) return null

                    return (
                      <button
                        key={cat}
                        onClick={() => handleMoveSubmit(cat)}
                        disabled={moving}
                        className="w-full py-2.5 px-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 text-sm font-medium transition-all text-left flex items-center justify-between group"
                      >
                        <span>{cat}</span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[var(--accent)] font-bold uppercase tracking-tight">Move here →</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setMoveItem(null)}
                  disabled={moving}
                  className="w-full py-2.5 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {t('dashboard.cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Single-delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirmApp}
        title="Uninstall App"
        message={
          deleteConfirmApp
            ? `Are you sure you want to uninstall "${deleteConfirmApp.name}"? This action cannot be undone.`
            : ''
        }
        confirmText={deletingApp ? 'Deleting…' : 'Uninstall'}
        cancelText={t('dashboard.cancel')}
        onConfirm={executeSingleDelete}
        onCancel={() => !deletingApp && setDeleteConfirmApp(null)}
        type="danger"
      />
    </div>
  )
}
