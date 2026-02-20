import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2, AlertTriangle } from 'lucide-react';
import osToast from '../osToast';
const toast = osToast;
import { FileExplorerAPI } from '../../../services/api';
import ConfirmDialog from '../../ConfirmDialog';

import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism-tomorrow.css';

// ── Language guess from extension ─────────────────────────────────────────────

function guessLang(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', sh: 'shell', bash: 'shell', json: 'json', xml: 'xml',
    html: 'html', css: 'css', yml: 'yaml', yaml: 'yaml', md: 'markdown',
    ini: 'ini', conf: 'config', cfg: 'config', prop: 'properties',
  };
  return map[ext] ?? 'text';
}

function getPrismGrammar(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return languages.javascript;
  if (['json'].includes(ext)) return languages.json;
  if (['py'].includes(ext)) return languages.python;
  if (['sh', 'bash', 'rc'].includes(ext)) return languages.bash;
  if (['xml', 'html', 'svg'].includes(ext)) return languages.markup;
  if (['conf', 'ini', 'prop'].includes(ext)) return languages.clike;
  return languages.clike; // Default to clike for basic highlighting if possible, or plain text
}

// ── NotepadApp ────────────────────────────────────────────────────────────

export default function NotepadApp({ windowData }) {
  const { filePath } = windowData; // Injected by WindowContext/useWindowManager
  const { t } = useTranslation();
  const filename = filePath?.split('/').pop() ?? 'Untitled';

  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  const isDirty = content !== originalContent;

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    if (!filePath) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    FileExplorerAPI.getContent(filePath)
      .then(({ data }) => {
        if (cancelled) return;
        setContent(data.content ?? '');
        setOriginalContent(data.content ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.message ?? err.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
      
    return () => { cancelled = true; };
  }, [filePath]);

  // ── Save Logic ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (saving || !isDirty || !filePath) return;
    setSaving(true);
    const toastId = toast.loading(`Saving ${filename}…`);
    try {
      await FileExplorerAPI.saveContent(filePath, content);
      setOriginalContent(content);
      toast.success(`${filename} saved`, { id: toastId });
    } catch (err) {
      toast.error(`Save failed: ${err.response?.data?.message ?? err.message}`, { id: toastId });
    } finally {
      setSaving(false);
    }
  }, [saving, isDirty, filePath, content, filename]);

  // Keyboard shortcut for saving within this window's context
  const handleKeyDownCapture = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const lineCount = content.split('\n').length;
  const langDisplay = guessLang(filename);

  return (
    <div 
      className="flex flex-col h-full bg-[#1e1e1e] text-gray-200"
      onKeyDownCapture={handleKeyDownCapture}
      tabIndex={-1} // Allow capturing keydown events
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#2b2b2b] border-b border-white/10 shrink-0">
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Save (Ctrl+S)"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>

        <div className="ml-auto flex items-center gap-2">
          {isDirty && (
            <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 select-none animate-pulse">
              ● Unsaved
            </span>
          )}
          <span className="text-[10px] font-mono text-gray-400 bg-black/20 border border-white/10 rounded px-1.5 py-0.5 select-none">
            {langDisplay}
          </span>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        {loading ? (
             <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
               <Loader2 className="w-8 h-8 animate-spin opacity-50" />
               <span className="text-sm">Loading…</span>
             </div>
          ) : error ? (
             <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400 px-8 text-center">
               <AlertTriangle className="w-10 h-10 opacity-60" />
               <p className="text-sm font-medium">Failed to load file</p>
               <p className="text-xs text-gray-500 font-mono break-all">{error}</p>
             </div>
          ) : (
            <div className="flex-1 overflow-auto flex relative">
              <div
                className="sticky left-0 z-10 min-h-full select-none text-right text-[12px] text-zinc-500 bg-[#1e1e1e] border-r border-white/10 shrink-0 w-12"
                style={{
                    fontFamily: '"Fira Code", "Fira Mono", monospace',
                    lineHeight: '21px', // Match Editor
                    paddingTop: '16px', // Match Editor
                    paddingBottom: '16px' // Match Editor
                }}
                aria-hidden="true"
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className="px-3">{i + 1}</div>
                ))}
              </div>

              <div className="flex-1 min-w-0 bg-[#1e1e1e]">
                <Editor
                  value={content}
                  onValueChange={code => setContent(code)}
                  highlight={code => highlight(code, getPrismGrammar(filename) || languages.clike)}
                  padding={16}
                  textareaClassName="code-editor-textarea focus:outline-none"
                  preClassName="code-editor-highlight"
                  style={{
                    fontFamily: '"Fira Code", "Fira Mono", monospace',
                    fontSize: 12,
                    lineHeight: '21px',
                    backgroundColor: '#1e1e1e',
                    minHeight: '100%',
                  }}
                  className="font-mono"
                />
              </div>
            </div>
        )}
      </div>
      
      {/* Status Bar */}
      {!loading && !error && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-white/10 bg-[#2b2b2b] text-[10px] text-gray-400 shrink-0">
          <span>{lineCount} lines · {content.length} chars</span>
          <span className="font-mono flex gap-2">
            <span>UTF-8</span>
            <span>{filePath}</span>
          </span>
        </div>
      )}
    </div>
  );
}
