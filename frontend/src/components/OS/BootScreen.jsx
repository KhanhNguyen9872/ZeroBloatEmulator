import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HealthAPI, CoreAPI } from '../../services/api';
import { AppWindow } from 'lucide-react';

export default function BootScreen({ onBootComplete, autoStartPath, emulatorType, versionId }) {
  const [statusText, setStatusText] = useState('Initializing system...');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let pollInterval;

    const checkHealth = async () => {
      try {
        await HealthAPI.ping(2000);
        return true;
      } catch {
        return false;
      }
    };

    const runBootSequence = async () => {
      // 1. Check if already running
      const isRunning = await checkHealth();

      if (isRunning) {
        if (isMounted) setStatusText('System ready. Welcome...');
        setTimeout(() => {
          if (isMounted) onBootComplete();
        }, 1200);
        return;
      }

      // 2. Not running. Try to start the core
      if (isMounted) setStatusText('Starting virtual environment...');
      
      try {
        // If we have autoStartPath (like the old saved state), we can pass it here.
        // Otherwise, starting with defaults.
        await CoreAPI.start(autoStartPath || '', emulatorType || '', versionId || '');
      } catch (err) {
        console.error("Failed to start core:", err);
        if (isMounted) {
          setStatusText(`Error starting system: ${err.message || 'Unknown error'}`);
          setHasError(true);
        }
        return; // Halt boot sequence
      }

      // 3. Poll for readiness
      pollInterval = setInterval(async () => {
        const ready = await checkHealth();
        if (ready) {
          clearInterval(pollInterval);
          if (isMounted) {
            setStatusText('System ready. Welcome...');
            setTimeout(() => {
               if (isMounted) onBootComplete();
            }, 1200);
          }
        } else {
            if (isMounted) setStatusText('Waiting for system services...');
        }
      }, 3000);
    };

    runBootSequence();

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [onBootComplete, autoStartPath, emulatorType, versionId]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col justify-center items-center z-[9999] text-white select-none">
      
      {/* OS Logo Area */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
        className="mb-16 flex flex-col items-center"
      >
        <div className="flex items-center justify-center space-x-2">
            <AppWindow size={64} className="text-blue-500" />
            <span className="text-4xl font-light tracking-widest text-white/90">WebOS</span>
        </div>
      </motion.div>

      {/* Loading Spinner & Status Text */}
      <div className="flex flex-col items-center space-y-6">
        {!hasError ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="w-8 h-8 rounded-full border-4 border-white/20 border-t-blue-500"
            />
        ) : (
             <div className="w-8 h-8 rounded-full border-4 border-red-500 flex items-center justify-center">
                 <span className="text-red-500 text-xs font-bold">!</span>
             </div>
        )}
        <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`text-sm ${hasError ? 'text-red-400' : 'text-gray-400'}`}
        >
          {statusText}
        </motion.p>
      </div>

    </div>
  );
}
