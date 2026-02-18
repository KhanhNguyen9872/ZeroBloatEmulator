import React, { useMemo, useState } from 'react'

export default function AppList({ apps, selected, onToggle, loading }) {
  const [search, setSearch] = useState('')

  // Flatten { app: [...], "priv-app": [...] } into labelled entries
  const allApps = useMemo(() => {
    const entries = []
    for (const [category, items] of Object.entries(apps)) {
      // items is now a list of objects: { name, path, package, category }
      for (const item of items) {
        // use path as unique ID (it was effectively the ID before)
        // item: { name: "YouTube", path: "/system/app/YouTube", package: "com.google...", ... }
        // We strip /mnt/android/ prefix if present but usually apps return relative to mount or absolute in system
        // The ID used in 'selected' set should be consistent with what we delete.
        // Previously ID was "app/YouTube". Now we have full path "/system/app/YouTube".
        // Let's use the path relative to /mnt/android as ID, or just the full path provided by backend?
        // Backend 'delete' expects paths like "/mnt/android/system/app/YouTube" or just "/system/app/..." if we prepend mount.
        // Let's look at how delete is handled: handleDelete maps selected ID to `/mnt/android/${id}`.
        // So ID should be relative like "system/app/YouTube".
        
        let id = item.path
        if (id.startsWith('/')) id = id.substring(1) // strip leading slash "system/app/..."
        
        entries.push({
          id: id,
          name: item.name,
          package: item.package,
          category: category,
          rawPath: item.path
        })
      }
    }
    return entries
  }, [apps])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return allApps
    return allApps.filter(
      (a) => a.name.toLowerCase().includes(q) || 
             (a.package && a.package.toLowerCase().includes(q)) ||
             a.category.toLowerCase().includes(q)
    )
  }, [allApps, search])

  const selectedCount = selected.size

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-muted)]">
        <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">Loading app list…</span>
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
        <p className="text-sm">No apps found. Connect to a disk image first.</p>
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
            placeholder="Search apps..."
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
        
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">
            {selectedCount > 0 
              ? <span className="text-blue-600 dark:text-blue-400">{selectedCount} selected</span>
              : `${allApps.length} apps installed`
            }
          </span>
          
          <div className="flex gap-3 text-xs">
            <button
              onClick={() => filtered.forEach((a) => !selected.has(a.id) && onToggle(a.id))}
              className="text-[var(--text-primary)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
            >
              Select All
            </button>
            <span className="text-[var(--border)]">|</span>
            <button
              onClick={() => filtered.forEach((a) => selected.has(a.id) && onToggle(a.id))}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Clear
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
              <p className="text-sm">No apps match "{search}"</p>
            </div>
          ) : (
            filtered.map((app) => {
              const isSelected = selected.has(app.id)
              return (
                <label
                  key={app.id}
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
                    onChange={() => onToggle(app.id)}
                    className="hidden" // hidden input, custom checkbox above
                  />
                  
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <div className="overflow-hidden">
                      <p className={`text-sm font-medium truncate transition-colors ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-primary)]'}`}>
                        {app.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 truncate">
                        {app.package && (
                            <span className="font-mono text-[10px] bg-[var(--bg-secondary)] px-1 rounded text-[var(--text-primary)]/70">{app.package}</span>
                        )}
                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                        {app.category}
                      </p>
                    </div>
                  </div>
                </label>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
