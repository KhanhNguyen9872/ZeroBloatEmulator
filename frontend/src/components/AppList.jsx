import React, { useMemo, useState } from 'react'

export default function AppList({ apps, selected, onToggle, loading }) {
  const [search, setSearch] = useState('')

  // Flatten { app: [...], "priv-app": [...] } into labelled entries
  const allApps = useMemo(() => {
    const entries = []
    for (const [category, names] of Object.entries(apps)) {
      for (const name of names) {
        entries.push({ id: `${category}/${name}`, name, category })
      }
    }
    return entries
  }, [apps])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return allApps
    return allApps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
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
    <div className="flex flex-col gap-3">
      {/* Search + stats bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search apps…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              w-full pl-9 pr-4 py-2 rounded-lg text-sm
              bg-[var(--bg-secondary)] border border-[var(--border)]
              text-[var(--text-primary)] placeholder-[var(--text-muted)]
              focus:outline-none focus:border-indigo-500 transition-colors
            "
          />
        </div>
        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
          {selectedCount > 0
            ? `${selectedCount} selected`
            : `${allApps.length} apps`}
        </span>
      </div>

      {/* Select all / deselect all */}
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => filtered.forEach((a) => !selected.has(a.id) && onToggle(a.id))}
          className="text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Select all visible
        </button>
        <span className="text-[var(--border)]">·</span>
        <button
          onClick={() => filtered.forEach((a) => selected.has(a.id) && onToggle(a.id))}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          Deselect all
        </button>
      </div>

      {/* App list */}
      <div className="flex flex-col gap-1 max-h-80 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-6">
            No results for "{search}"
          </p>
        ) : (
          filtered.map((app) => {
            const isSelected = selected.has(app.id)
            return (
              <label
                key={app.id}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                  transition-colors duration-100 group
                  ${isSelected
                    ? 'bg-red-500/10 border border-red-500/30'
                    : 'hover:bg-[var(--bg-secondary)] border border-transparent'
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(app.id)}
                  className="w-4 h-4 rounded accent-red-500 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-red-300' : 'text-[var(--text-primary)]'}`}>
                    {app.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{app.category}</p>
                </div>
                {isSelected && (
                  <span className="text-xs text-red-400 shrink-0">marked for deletion</span>
                )}
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}
