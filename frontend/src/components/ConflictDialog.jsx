import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, FileWarning, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ConflictDialog({ isOpen, filename, onOverwrite, onRename, onCancel }) {
  const { t } = useTranslation();
  const [renameValue, setRenameValue] = useState(filename);

  useEffect(() => {
    if (isOpen) {
        // Auto-generate a new name suggestion: filename (1).ext
        const parts = filename.split('.');
        if (parts.length > 1) {
            const ext = parts.pop();
            const name = parts.join('.');
            setRenameValue(`${name} (1).${ext}`);
        } else {
            setRenameValue(`${filename} (1)`);
        }
    }
  }, [isOpen, filename]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        >
          <div className="p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                <FileWarning className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {t('conflicts.title', 'File Conflict')}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {t('conflicts.message', 'A file named "{{filename}}" already exists in this location.', { filename })}
                </p>
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-500/10 px-3 py-2 rounded border border-amber-500/20">
                    {t('conflicts.warning', 'Overwriting will replace the existing file and try to preserve its permissions.')}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-4">
               {/* Rename Option */}
               <div className="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border)]">
                   <div className="flex flex-col gap-2">
                       <label className="text-xs font-semibold text-[var(--text-muted)] uppercase">
                           {t('conflicts.rename_option', 'Rename to keeping both')}
                       </label>
                       <div className="flex gap-2">
                           <input 
                               value={renameValue}
                               onChange={(e) => setRenameValue(e.target.value)}
                               className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                           />
                           <button 
                               onClick={() => onRename(renameValue)}
                               disabled={!renameValue || renameValue === filename}
                               className="px-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] hover:bg-[var(--bg-card)] text-sm font-medium transition-colors disabled:opacity-50"
                           >
                               {t('conflicts.rename_btn', 'Rename')}
                           </button>
                       </div>
                   </div>
               </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                    {t('common.cancel', 'Cancel')}
                </button>
                <button
                    onClick={onOverwrite}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20 transition-all"
                >
                    {t('conflicts.overwrite_btn', 'Overwrite')}
                </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
