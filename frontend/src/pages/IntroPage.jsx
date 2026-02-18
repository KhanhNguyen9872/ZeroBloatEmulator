// pages/IntroPage.jsx – moved from components/IntroScreen.jsx
import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useBackend } from '../context/BackendContext'

function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

export default function IntroPage({ onSelectFolder }) {
  const { t } = useTranslation()
  const { isAdmin } = useBackend()
  const tags = t('intro.tags', { returnObjects: true })

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center px-4 py-16 sm:px-8 sm:py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-col items-center gap-6 sm:gap-8 text-center w-full max-w-sm sm:max-w-md"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.4, type: 'spring', stiffness: 220 }}
        >
          <img
            src="/assets/logo.png"
            alt="App Logo"
            className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 object-contain drop-shadow-2xl"
          />
        </motion.div>

        {/* Title + subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4 }}
          className="flex flex-col items-center gap-2"
        >
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('intro.title')}
          </h1>
          <p className="text-xs sm:text-sm md:text-base text-[var(--text-muted)]">
            {t('intro.subtitle')} · {t('intro.created_by')}{' '}
            <span className="text-[var(--accent)] font-medium">KhanhNguyen9872</span>
          </p>

        </motion.div>

        {/* Feature tags */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="flex flex-wrap justify-center gap-2"
        >
          {(Array.isArray(tags) ? tags : []).map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-md text-xs font-medium
                text-[var(--text-muted)] border border-[var(--border)] bg-transparent"
            >
              {tag}
            </span>
          ))}
        </motion.div>

        {/* CTA button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.38, duration: 0.35 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectFolder}
          className="
            w-full sm:w-auto sm:min-w-[280px] md:min-w-[300px]
            px-6 py-3 rounded-md font-semibold text-sm text-white
            bg-[var(--accent)] hover:bg-[var(--accent-hover)]
            focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2
            focus:ring-offset-[var(--bg-primary)]
            transition-colors duration-150 touch-manipulation
          "
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            {t('intro.select_btn')}
          </span>
        </motion.button>

        <p className="text-xs text-[var(--text-muted)] opacity-60 px-4">
          {t('intro.hint')}
        </p>
      </motion.div>
    </div>
  )
}
