import React from 'react'
import { motion } from 'framer-motion'

export default function DetectionScreen() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-10">
      {/* Radar rings */}
      <div className="relative w-40 h-40 flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-indigo-500/40"
            initial={{ width: 40, height: 40, opacity: 0.8 }}
            animate={{ width: 160, height: 160, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.65,
              ease: 'easeOut',
            }}
          />
        ))}

        {/* Centre spinner */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
          className="w-14 h-14 rounded-full border-4 border-indigo-500/20 border-t-indigo-500"
        />

        {/* Centre dot */}
        <div className="absolute w-4 h-4 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/60" />
      </div>

      {/* Text */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-2 text-center"
      >
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          Analyzing Emulator Structure…
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Scanning for known emulator signatures and Android images
        </p>
      </motion.div>

      {/* Animated dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-indigo-500"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  )
}
