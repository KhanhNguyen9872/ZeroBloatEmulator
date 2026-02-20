import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Power, Loader2 } from 'lucide-react';
import { HealthAPI, CoreAPI } from '../../services/api';

/**
 * PowerOnScreen — shown when QEMU core is powered off.
 * Single power button, no user input required.
 * Backend automatically uses worker.qcow2 from config.
 *
 * Props:
 *   onBooting()  — switch parent to BOOTING state immediately
 *   onRunning()  — switch parent to RUNNING once SSH is ready
 */
export default function PowerOnScreen({ onBooting, onRunning }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handlePower = async () => {
    if (starting) return;
    setError('');
    setStarting(true);

    try {
      // No body needed — server resolves worker.qcow2 from config
      await CoreAPI.start();
    } catch (err) {
      setStarting(false);
      setError(err?.response?.data?.message || err.message || 'Failed to start core.');
      return;
    }

    // Immediately transition to boot animation
    onBooting();

    // Poll until SSH is confirmed ready, then transition to RUNNING
    pollRef.current = setInterval(async () => {
      try {
        const resp = await HealthAPI.check(3000);
        if (resp.data?.ssh_connected) {
          clearInterval(pollRef.current);
          onRunning();
        }
      } catch {
        // Backend not yet responsive — keep polling
      }
    }, 3000);
  };

  return (
    <div className="fixed inset-0 bg-[#080808] flex flex-col items-center justify-center z-[9998] select-none">

      {/* Subtle ambient glow behind button */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: starting
            ? 'radial-gradient(circle at 50% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)'
            : 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)',
          transition: 'background 0.8s ease',
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key="power-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-10"
        >
          {/* Logo wordmark */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="flex flex-col items-center gap-1"
          >
            <span className="text-3xl font-extralight tracking-[0.35em] text-white/60">
              ZeroBloat
            </span>
            <span className="text-[10px] tracking-[0.4em] text-white/20 uppercase">
              Emulator
            </span>
          </motion.div>

          {/* Power Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <button
              onClick={handlePower}
              disabled={starting}
              className={`
                relative w-24 h-24 rounded-full
                flex items-center justify-center
                border-2 transition-all duration-500 group
                ${starting
                  ? 'border-blue-500/40 bg-blue-500/5 cursor-not-allowed'
                  : 'border-zinc-700 bg-zinc-900 hover:border-blue-500 hover:shadow-[0_0_40px_rgba(59,130,246,0.4)] hover:bg-zinc-800 cursor-pointer'
                }
              `}
            >
              {/* Breathing ring when idle */}
              {!starting && (
                <span className="absolute inset-0 rounded-full border border-white/5 animate-ping opacity-20" />
              )}

              {starting
                ? <Loader2 size={36} className="text-blue-400 animate-spin" />
                : <Power size={36} className="text-zinc-500 group-hover:text-blue-400 group-hover:scale-110 transition-all duration-300" />
              }
            </button>
          </motion.div>

          {/* Status / error text */}
          <AnimatePresence mode="wait">
            {error ? (
              <motion.p
                key="error"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-red-400 tracking-wide max-w-xs text-center"
              >
                {error}
              </motion.p>
            ) : (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[11px] text-white/15 tracking-widest uppercase"
              >
                {starting ? 'Starting…' : 'Press to power on'}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
