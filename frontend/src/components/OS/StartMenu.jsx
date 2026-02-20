import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Power, Search, User } from 'lucide-react';
import { useWindowManager } from '../../store/useWindowManager';
import { useTranslation } from 'react-i18next';
import { WinIconMap, AppWindowIcon } from './Icons';
import osToast from './osToast';
import { CoreAPI } from '../../services/api';

export default function StartMenu({ isOpen, onClose, onPowerOff }) {
  const { t } = useTranslation();
  const desktopShortcuts = useWindowManager((state) => state.desktopShortcuts);
  const openWindow = useWindowManager((state) => state.openWindow);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredApps = desktopShortcuts.filter(app => 
    t(app.label, app.label).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAppClick = (app) => {
    openWindow({
      ...app,
      title: t(app.label, app.label)
    });
    onClose();
  };

  const handleShutdown = async () => {
    const toastId = osToast.loading('Shutting down...');
    try {
      await CoreAPI.stop();
      osToast.success('Core stopped.', { id: toastId });
      onClose();
      // Return to Power Off screen
      if (onPowerOff) onPowerOff();
    } catch (err) {
      osToast.error('Failed to shutdown core.', { id: toastId });
    }
  };



  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Invisible backdrop to catch clicks outside the start menu */}
          <div className="fixed inset-0 z-[55] mb-12" onClick={onClose} />
          
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-14 left-1/2 -translate-x-1/2 w-[600px] h-[650px] bg-[#1c1c1c]/90 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-[60] flex flex-col overflow-hidden text-white"
          >
            {/* Search Bar Area */}
            <div className="p-8 pb-4">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Type here to search" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 pl-11 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Pinned Apps Header */}
            <div className="px-8 flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-gray-100">Pinned</h3>
              <button className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded shadow-sm transition-colors text-white font-medium">All apps &gt;</button>
            </div>

            {/* Apps Grid */}
            <div className="flex-1 px-8 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-6 gap-x-2 gap-y-6">
                {filteredApps.map((app) => (
                  <div 
                    key={app.id} 
                    onClick={() => handleAppClick(app)}
                    className="flex flex-col items-center justify-start p-2 rounded-md cursor-pointer hover:bg-white/10 transition-colors group"
                  >
                    <div className="w-10 h-10 mb-2 drop-shadow-md group-hover:scale-105 transition-transform">
                      {WinIconMap[app.icon] ? React.createElement(WinIconMap[app.icon]) : <AppWindowIcon />}
                    </div>
                    <span className="text-xs text-center text-gray-200 line-clamp-2 w-16 leading-tight">
                      {t(app.label, app.label)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Footer Area (User Profile & Power Options) */}
            <div className="h-16 bg-black/30 border-t border-white/10 flex items-center justify-between px-8 shrink-0 mt-4 backdrop-blur-md">
                <div className="flex items-center gap-3 hover:bg-white/10 p-2 rounded-md cursor-pointer transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <User size={16} className="text-white" />
                  </div>
                  <span className="text-sm font-medium">Local Admin</span>
                </div>
                
                <button 
                  className="p-2 rounded-md hover:bg-white/10 transition-colors group"
                  onClick={handleShutdown}
                  title="Disconnect & Stop Core"
                >
                  <Power size={18} className="text-white group-hover:text-red-400 transition-colors" />
                </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
