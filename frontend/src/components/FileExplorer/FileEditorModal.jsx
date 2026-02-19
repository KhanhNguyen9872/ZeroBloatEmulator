import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X, Save, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { FileExplorerAPI } from '../../services/api'
import ConfirmDialog from '../ConfirmDialog'

import Editor from 'react-simple-code-editor'
import { highlight, languages } from 'prismjs/components/prism-core'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-markup'
import 'prismjs/themes/prism-tomorrow.css'

// ── Language guess from extension ─────────────────────────────────────────────

function guessLang(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', sh: 'shell', bash: 'shell', json: 'json', xml: 'xml',
    html: 'html', css: 'css', yml: 'yaml', yaml: 'yaml', md: 'markdown',
    ini: 'ini', conf: 'config', cfg: 'config', prop: 'properties',
  }
  return map[ext] ?? 'text'
}

function getPrismGrammar(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return languages.javascript
  if (['json'].includes(ext)) return languages.json
  if (['py'].includes(ext)) return languages.python
  if (['sh', 'bash', 'rc'].includes(ext)) return languages.bash
  if (['xml', 'html', 'svg'].includes(ext)) return languages.markup
  if (['conf', 'ini', 'prop'].includes(ext)) return languages.clike
  return languages.clike // Default to clike for basic highlighting if possible, or plain text
}

// ── FileEditorModal ────────────────────────────────────────────────────────────

/**
 * Props:
 *   filePath   (string)  – VM path of the file to edit (frontend-relative)
 *   onClose    (fn)      – called when the modal should close
 *   onDownload (fn)      – called if user wants to Download instead
 */
export default function FileEditorModal({ filePath, onClose, onDownload }) {
  const { t } = useTranslation()
  const filename = filePath?.split('/').pop() ?? 'file'

  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)
  const isDirty = content !== originalContent
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    FileExplorerAPI.getContent(filePath)
      .then(({ data }) => {
        if (cancelled) return
        setContent(data.content ?? '')
        setOriginalContent(data.content ?? '')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.response?.data?.message ?? err.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filePath])

  // ── Ctrl+S / Cmd+S save ───────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (saving || !isDirty) return
    setSaving(true)
    const toastId = toast.loading(`Saving ${filename}…`)
    try {
      await FileExplorerAPI.saveContent(filePath, content)
      setOriginalContent(content)
      toast.success(`${filename} saved`, { id: toastId })
    } catch (err) {
      toast.error(`Save failed: ${err.response?.data?.message ?? err.message}`, { id: toastId })
    } finally {
      setSaving(false)
    }
  }, [saving, isDirty, filePath, content, filename])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 'Escape' && !isDirty) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, isDirty, onClose])

  // ── Close guard ───────────────────────────────────────────────────────────

  // ── Close guard ───────────────────────────────────────────────────────────

  const handleClose = () => {
    if (isDirty) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }

  const confirmClose = () => {
    setShowCloseConfirm(false)
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const lineCount = content.split('\n').length

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="
          flex flex-col overflow-hidden shadow-2xl
          bg-[var(--bg-card)] border-[var(--border)]
          fixed inset-0 w-full h-full rounded-none
          md:relative md:inset-auto md:w-[90vw] md:h-[85vh] md:max-w-7xl md:rounded-xl md:border
        "
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
          <span className="text-base">✏️</span>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{filename}</span>
            <span className="text-[10px] text-[var(--text-muted)] truncate font-mono">{filePath}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {isDirty && (
              <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 select-none">
                ● Unsaved
              </span>
            )}

            {/* Language badge */}
            <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1.5 py-0.5 select-none">
              {guessLang(filename)}
            </span>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Save (Ctrl+S)"
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Save className="w-3.5 h-3.5" />
              }
              Save
            </button>

            <button
              onClick={handleClose}
              className="p-1.5 rounded-md hover:bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Editor body ── */}
        <div className="flex-1 min-h-0 relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]">
              <Loader2 className="w-8 h-8 animate-spin opacity-50" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-red-500 px-8 text-center">
              <AlertTriangle className="w-10 h-10 opacity-60" />
              <p className="text-sm font-medium">Failed to load file</p>
              <p className="text-xs text-[var(--text-muted)] font-mono break-all">{error}</p>
              {onDownload && (
                <button
                  onClick={onDownload}
                  className="mt-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  ⬇️ Download instead
                </button>
              )}
            </div>
          ) : (
            <div className="flex h-full overflow-auto relative">
              {/* Line numbers */}
              <div
                className="sticky left-0 z-10 h-fit min-h-full select-none text-right text-[12px] font-mono leading-[1.6] py-3 px-3 text-zinc-400 dark:text-zinc-600 bg-[var(--bg-secondary)] border-r border-[var(--border)] overflow-hidden shrink-0 w-12"
                aria-hidden="true"
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Textarea */}
              <Editor
                value={content}
                onValueChange={code => setContent(code)}
                highlight={code => highlight(code, getPrismGrammar(filename) || languages.clike)}
                padding={16}
                textareaClassName="focus:outline-none"
                style={{
                  fontFamily: '"Fira Code", "Fira Mono", monospace',
                  fontSize: 14,
                  backgroundColor: '#1e1e1e',
                  minHeight: '100%',
                }}
                className="flex-1 min-h-full font-mono text-sm leading-[1.6]"
              />
            </div>
          )}
        </div>

        {/* ── Status bar ── */}
        {!loading && !error && (
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-[var(--border)] bg-[var(--bg-secondary)] text-[10px] text-[var(--text-muted)] shrink-0">
            <span>{lineCount} lines · {content.length} chars</span>
            <span className="font-mono">UTF-8</span>
          </div>
        )}
      </motion.div>

      <ConfirmDialog
        isOpen={showCloseConfirm}
        title={t('common.unsaved_changes', 'Unsaved Changes')}
        message={t('common.unsaved_changes_msg', 'You have unsaved changes. Are you sure you want to close?')}
        confirmText={t('common.discard', 'Discard Changes')}
        cancelText={t('common.cancel', 'Cancel')}
        onConfirm={confirmClose}
        onCancel={() => setShowCloseConfirm(false)}
        type="warning"
      />
    </div>
  )
}
