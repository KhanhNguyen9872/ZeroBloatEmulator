import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import apiClient from '../services/api'
import Select from 'react-select'
import { useTranslation } from 'react-i18next'

export default function AddAppModal({ isOpen, onClose, onRefresh, categoryRoots = {} }) {
  const { t } = useTranslation()
  const [file, setFile] = useState(null)
  const [targets, setTargets] = useState([])
  const [selectedTarget, setSelectedTarget] = useState('/system/app')
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  
  const fileInputRef = useRef(null)

  // Labels for display
  const LABELS = {
    'app': 'app (default)',
    'priv-app': 'priv-app',
    'vendor-app': 'vendor/app',
    'vendor-priv-app': 'vendor/priv-app',
    'product-app': 'product/app',
    'product-priv-app': 'product/priv-app'
  }

  useEffect(() => {
    if (isOpen) {
      // Always include 'app' and 'priv-app' even if not detected in scan
      const keys = new Set(['app', 'priv-app'])
      Object.keys(categoryRoots).forEach(k => keys.add(k))

      const targetOptions = Array.from(keys).map(key => ({
        value: categoryRoots[key] || (key === 'priv-app' ? '/system/priv-app' : '/system/app'),
        label: LABELS[key] || key
      }))

      setTargets(targetOptions)
      
      // Select the root for 'app' by default if possible
      const appRoot = categoryRoots['app'] || '/system/app'
      setSelectedTarget(appRoot)
    } else {
        setFile(null)
        setUploading(false)
    }
  }, [isOpen, categoryRoots])

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.name.endsWith('.apk')) {
      setFile(droppedFile)
    } else {
      toast.error(t('apk_modal.only_apk'))
    }
  }

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
    }
  }

  const handleUpload = async () => {
    if (!file || !selectedTarget) return
    
    setUploading(true)
    const formData = new FormData()
    formData.append('apk', file)
    formData.append('target_path', selectedTarget)

    try {
      const { data } = await apiClient.post('/api/apps/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success(t('apk_modal.success'))
      
      // Mark as user-installed in localStorage
      if (data.app?.package) {
        const stored = localStorage.getItem('userInstalledApps')
        const installed = stored ? JSON.parse(stored) : []
        if (!installed.includes(data.app.package)) {
            installed.push(data.app.package)
            localStorage.setItem('userInstalledApps', JSON.stringify(installed))
        }
      }

      onRefresh(data.app, data.category)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || t('apk_modal.fail'))
    } finally {
      setUploading(false)
    }
  }

  // React Select Custom Styles
  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: 'var(--bg-secondary)',
      borderColor: state.isFocused ? 'var(--accent)' : 'var(--border)',
      borderRadius: '0.75rem',
      padding: '2px',
      boxShadow: state.isFocused ? '0 0 0 2px var(--accent-alpha)' : 'none',
      '&:hover': {
        borderColor: 'var(--accent)'
      },
      color: 'var(--text-primary)'
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '0.75rem',
      overflow: 'hidden',
      zIndex: 100
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected 
        ? 'var(--accent)' 
        : state.isFocused ? 'var(--bg-secondary)' : 'transparent',
      color: state.isSelected ? 'white' : 'var(--text-primary)',
      cursor: 'pointer',
      fontSize: '0.875rem',
      '&:active': {
        backgroundColor: 'var(--accent)'
      }
    }),
    singleValue: (base) => ({
      ...base,
      color: 'var(--text-primary)',
      fontSize: '0.875rem'
    }),
    placeholder: (base) => ({
      ...base,
      color: 'var(--text-muted)',
      fontSize: '0.875rem'
    })
  }

  const placeholderText = t('apk_modal.select_placeholder')

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-[var(--text-primary)]">{t('apk_modal.title')}</h3>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drag & Drop Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer
                  ${isDragging ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] hover:border-[var(--accent)]/50'}
                  ${file ? 'bg-emerald-500/5 border-emerald-500/30' : ''}
                `}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".apk"
                  className="hidden"
                />
                
                {file ? (
                  <>
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)] text-center break-all px-4">{file.name}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.refresh')}</p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{t('apk_modal.drag_drop')}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{t('apk_modal.max_size')}</p>
                  </>
                )}
              </div>

              {/* Target Selector */}
              <div className="mt-6">
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  {t('apk_modal.target_path')}
                </label>
                <Select
                  options={targets}
                  value={targets.find(t => t.value === selectedTarget)}
                  onChange={(opt) => setSelectedTarget(opt.value)}
                  styles={selectStyles}
                  isSearchable={false}
                  placeholder={placeholderText}
                />
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-[var(--border)] text-sm font-medium hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {t('dashboard.cancel')}
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className={`
                    flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all shadow-lg
                    ${!file || uploading 
                      ? 'bg-zinc-400 cursor-not-allowed' 
                      : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] shadow-blue-500/20'}
                  `}
                >
                  {uploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('apk_modal.installing')}
                    </span>
                  ) : t('apk_modal.install_btn')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
