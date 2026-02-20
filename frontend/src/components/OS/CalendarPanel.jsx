import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, X } from 'lucide-react';
import useNotificationStore from '../../store/useNotificationStore';

// Format relative timestamp
function relativeTime(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Build a simple calendar for the current month
function MiniCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayDate = today.getDate();

  const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">
          {MONTH_NAMES[month]} {year}
        </span>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] text-gray-500 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-center h-7 w-7 mx-auto text-xs rounded-full transition-colors
              ${!day ? '' : day === todayDate
                ? 'bg-blue-500 text-white font-bold'
                : 'text-gray-300 hover:bg-white/10 cursor-pointer'}
            `}
          >
            {day || ''}
          </div>
        ))}
      </div>
    </div>
  );
}

const typeColor = {
  success: 'text-green-400',
  error:   'text-red-400',
  warning: 'text-yellow-400',
  info:    'text-blue-400',
  loading: 'text-purple-400',
};
const typeSymbol = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
  loading: '…',
};

export default function CalendarPanel({ isOpen, onClose }) {
  const history = useNotificationStore((s) => s.history);
  const clearHistory = useNotificationStore((s) => s.clearHistory);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);

  // Mark notifications as read when panel opens
  useEffect(() => {
    if (isOpen) markAllAsRead();
  }, [isOpen, markAllAsRead]);

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
            className="absolute bottom-14 right-4 z-[100] w-80 rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
            style={{ background: 'rgba(28,28,28,0.92)', backdropFilter: 'blur(40px)', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Notifications Section */}
            <div className="p-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-gray-300" />
                  <span className="text-sm font-semibold text-white">Notifications</span>
                </div>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="flex flex-col items-center py-4 text-gray-500">
                  <BellOff size={24} className="mb-2 opacity-40" />
                  <span className="text-xs">No notifications</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                  {history.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <span className={`mt-0.5 text-sm leading-none ${typeColor[n.type] || 'text-gray-400'}`}>
                        {typeSymbol[n.type] || '●'}
                      </span>
                      <div className="flex-1 min-w-0">
                        {n.title && (
                          <p className="text-xs font-semibold text-gray-200 truncate">{n.title}</p>
                        )}
                        <p className="text-xs text-gray-400 leading-tight break-words line-clamp-2">{n.message}</p>
                      </div>
                      {n.timestamp && (
                        <span className="text-[10px] text-gray-600 shrink-0 mt-0.5">
                          {relativeTime(n.timestamp)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Calendar Section */}
            <div className="p-4 overflow-y-auto">
              <MiniCalendar />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
