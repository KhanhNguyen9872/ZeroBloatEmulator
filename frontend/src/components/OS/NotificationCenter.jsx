import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, Loader2, AlertTriangle } from 'lucide-react';
import useNotificationStore from '../../store/useNotificationStore';

const NotificationIcon = ({ type }) => {
  switch (type) {
    case 'success':  return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'error':    return <AlertCircle className="w-5 h-5 text-red-500" />;
    case 'warning':  return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    case 'info':     return <Info className="w-5 h-5 text-blue-500" />;
    case 'loading':  return <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />;
    default:         return <Info className="w-5 h-5 text-zinc-400" />;
  }
};

export default function NotificationCenter() {
  const activeToasts = useNotificationStore((state) => state.activeToasts);
  const removeActiveToast = useNotificationStore((state) => state.removeActiveToast);

  return (
    // bottom-16 = sits above the 48px taskbar with extra visual gap
    <div className="fixed bottom-16 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence>
        {activeToasts.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="pointer-events-auto relative w-80 p-4 rounded-xl 
                       bg-white/80 dark:bg-[#1c1c1c]/90 backdrop-blur-xl 
                       border border-zinc-200/50 dark:border-zinc-700/50 
                       shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]
                       group overflow-hidden"
          >
            {/* Glossy top highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <NotificationIcon type={notif.type} />
              </div>
              <div className="flex-1 min-w-0">
                {notif.title && (
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {notif.title}
                  </h4>
                )}
                {notif.message && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed break-words">
                    {notif.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeActiveToast(notif.id)}
                className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 
                           hover:bg-zinc-100 dark:hover:bg-zinc-800 
                           text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300
                           transition-all duration-200"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {notif.type === 'loading' && (
              <div className="absolute bottom-0 left-0 h-0.5 bg-blue-500/50 animate-pulse w-full" />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
