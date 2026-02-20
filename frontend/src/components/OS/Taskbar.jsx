import React, { useState, useEffect } from 'react';
import { useWindowManager } from '../../store/useWindowManager';
import { Wifi, Volume2, Battery, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WinIconMap, AppWindowIcon, Windows11Icon } from './Icons';
import QuickSettingsPanel from './QuickSettingsPanel';
import CalendarPanel from './CalendarPanel';
import useNotificationStore from '../../store/useNotificationStore';

export default function Taskbar({ onToggleStartMenu }) {
  const { t } = useTranslation();
  const windows = useWindowManager((state) => state.windows);
  const focusWindow = useWindowManager((state) => state.focusWindow);
  const minimizeAllWindows = useWindowManager((state) => state.minimizeAllWindows);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  const [time, setTime] = useState(new Date());
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Format: 20:51
  const formatTime = (date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  // Format: 20/02/2026
  const formatDate = (date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const toggleQuickSettings = () => {
    setIsCalendarOpen(false);
    setIsQuickSettingsOpen((v) => !v);
  };

  const toggleCalendar = () => {
    setIsQuickSettingsOpen(false);
    setIsCalendarOpen((v) => !v);
  };

  return (
    <div className="relative h-12 bg-gray-900/80 backdrop-blur-xl border-t border-white/10 flex items-center justify-between px-2 z-50">

      {/* Panels — rendered inside Taskbar so `absolute bottom-14` works on the parent */}
      <QuickSettingsPanel
        isOpen={isQuickSettingsOpen}
        onClose={() => setIsQuickSettingsOpen(false)}
      />
      <CalendarPanel
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
      />

      {/* Left side */}
      <div className="w-48 hidden md:block" />

      {/* Center — Start + Search + Open Windows */}
      <div className="flex items-center space-x-1 flex-1 justify-center">
        {/* Start Button */}
        <button
          className="p-2 rounded-md hover:bg-white/10 transition-colors group"
          onClick={onToggleStartMenu}
        >
          <div className="w-5 h-5 flex items-center justify-center transition-transform active:scale-95 group-hover:scale-105">
            <Windows11Icon />
          </div>
        </button>

        {/* Search bar pill */}
        <div
          className="hidden sm:flex items-center hover:bg-white/10 rounded-full px-3 py-1.5 cursor-pointer ml-1 transition-colors"
          onClick={onToggleStartMenu}
        >
          <Search size={16} className="text-gray-300 mr-2" />
          <span className="text-xs text-gray-300 font-medium">Search</span>
        </div>

        <div className="w-px h-6 bg-white/20 mx-2" />

        {/* Open Window icons */}
        {windows.map((win) => {
          const isActive = !win.isMinimized && win.zIndex === Math.max(...windows.map((w) => w.zIndex), 0);
          return (
            <div
              key={win.id}
              onClick={() => focusWindow(win.id)}
              className={`relative flex items-center justify-center w-10 h-10 rounded-md cursor-pointer transition-all duration-200 ${
                isActive ? 'bg-white/15' : 'hover:bg-white/10'
              }`}
              title={win.title}
            >
              <div className="w-5 h-5 flex items-center justify-center">
                {WinIconMap[win.icon]
                  ? React.createElement(WinIconMap[win.icon])
                  : <AppWindowIcon />}
              </div>
              {/* Active indicator */}
              <div
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] rounded-t-full transition-all duration-300 ${
                  isActive ? 'w-4 bg-blue-400' : 'w-1.5 bg-gray-400'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Right — System Tray */}
      <div className="flex items-center gap-0.5 pr-1">
        {/* Quick Settings button (Wifi / Volume / Battery) */}
        <button
          onClick={toggleQuickSettings}
          className={`flex items-center gap-1.5 px-2 h-10 rounded-md transition-colors text-white ${
            isQuickSettingsOpen ? 'bg-white/15' : 'hover:bg-white/10'
          }`}
          title="Quick settings"
        >
          <Wifi size={14} />
          <Volume2 size={14} />
          <Battery size={14} />
        </button>

        {/* Clock / Calendar button — with unread badge */}
        <button
          onClick={toggleCalendar}
          className={`relative flex flex-col items-end justify-center px-2 h-10 rounded-md transition-colors text-white ${
            isCalendarOpen ? 'bg-white/15' : 'hover:bg-white/10'
          }`}
          title="Calendar & notifications"
        >
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 bg-blue-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="text-xs font-medium leading-tight">{formatTime(time)}</span>
          <span className="text-[10px] text-gray-300 leading-tight">{formatDate(time)}</span>
        </button>
      </div>

      {/* Show Desktop — thin strip at far right edge (Windows 11 style) */}
      <button
        onClick={minimizeAllWindows}
        title="Show desktop"
        className="h-full w-1.5 border-l border-white/10 hover:bg-white/20 transition-colors shrink-0"
      />
    </div>
  );
}


