import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Bluetooth, Moon, Sun, Volume2, Maximize2 } from 'lucide-react';

export default function QuickSettingsPanel({ isOpen, onClose }) {
  const [wifi, setWifi] = useState(true);
  const [bluetooth, setBluetooth] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [volume, setVolume] = useState(70);
  const [brightness, setBrightness] = useState(85);

  // Toggle dark mode by toggling a class on <html>
  const handleDarkMode = () => {
    setDarkMode((v) => {
      document.documentElement.classList.toggle('light', v);
      return !v;
    });
  };

  const Toggle = ({ icon: Icon, label, value, onToggle, activeColor = 'bg-blue-500' }) => (
    <button
      onClick={onToggle}
      className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-all duration-200 ${
        value
          ? `${activeColor} text-white shadow-lg`
          : 'bg-white/10 text-gray-300 hover:bg-white/20'
      }`}
    >
      <Icon size={18} />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="absolute bottom-14 right-4 z-[100] w-80 rounded-2xl border border-white/10 shadow-2xl overflow-hidden p-4"
            style={{ background: 'rgba(28,28,28,0.92)', backdropFilter: 'blur(40px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Toggles Grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Toggle
                icon={wifi ? Wifi : WifiOff}
                label="Wi-Fi"
                value={wifi}
                onToggle={() => setWifi((v) => !v)}
              />
              <Toggle
                icon={Bluetooth}
                label="Bluetooth"
                value={bluetooth}
                onToggle={() => setBluetooth((v) => !v)}
                activeColor="bg-blue-600"
              />
              <Toggle
                icon={darkMode ? Moon : Sun}
                label={darkMode ? 'Dark' : 'Light'}
                value={darkMode}
                onToggle={handleDarkMode}
                activeColor="bg-indigo-600"
              />
              <Toggle
                icon={Maximize2}
                label="Focus"
                value={false}
                onToggle={() => {}}
              />
            </div>

            {/* Divider */}
            <div className="h-px bg-white/10 mb-4" />

            {/* Volume Slider */}
            <div className="mb-3">
              <div className="flex items-center gap-3 mb-1">
                <Volume2 size={15} className="text-gray-300 shrink-0" />
                <span className="text-xs text-gray-300 flex-1 font-medium">Volume</span>
                <span className="text-xs text-gray-400">{volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full h-1.5 rounded-full accent-blue-400 cursor-pointer"
              />
            </div>

            {/* Brightness Slider */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Sun size={15} className="text-gray-300 shrink-0" />
                <span className="text-xs text-gray-300 flex-1 font-medium">Brightness</span>
                <span className="text-xs text-gray-400">{brightness}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full h-1.5 rounded-full accent-yellow-400 cursor-pointer"
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
