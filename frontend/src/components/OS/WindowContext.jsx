import React, { lazy, Suspense } from 'react';
import { Rnd } from 'react-rnd';
import { motion } from 'framer-motion';
import { useWindowManager } from '../../store/useWindowManager';

import { WinIconMap, AppWindowIcon } from './Icons';

// Lazy load components dynamically
const ComponentRegistry = {
  FileExplorer: lazy(() => import('./Apps/GuestFileExplorerApp')),
  ThisPC: lazy(() => import('./Apps/ThisPC')),
  NotepadApp: lazy(() => import('./Apps/NotepadApp')),
  AppManagerApp: lazy(() => import('./Apps/AppManagerApp')),
  ZeroBloatApp: lazy(() => import('./Apps/ZeroBloatApp')),
};

// Windows 11 style SVG icons for title bar controls
const MinimizeIcon = () => (
  <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="10" height="1" fill="currentColor" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
  </svg>
);

const RestoreIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Back window */}
    <path d="M3 0H11V8H9" stroke="currentColor" strokeWidth="1" fill="none" />
    {/* Front window */}
    <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
  </svg>
);

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export default function WindowContext({ windowData }) {
  const { id, title, component, isMinimized, isMaximized, zIndex, position, size, icon } = windowData;
  const { focusWindow, closeWindow, minimizeWindow, maximizeWindow, updateWindowPosition, updateWindowSize } = useWindowManager();



  const AppContent = ComponentRegistry[component];
  const TitleIcon = WinIconMap[icon] || AppWindowIcon;

  const handleDragStop = (e, d) => {
    updateWindowPosition(id, { x: d.x, y: d.y });
  };

  const handleResizeStop = (e, direction, ref, delta, position) => {
    updateWindowSize(
      id,
      { width: ref.style.width, height: ref.style.height },
      position
    );
  };

  // We use AnimatePresence in the parent (WebOS.jsx) to handle mounting/unmounting.
  // This component handles the internal states like minimizing.
  
  return (
    <Rnd
      size={isMaximized ? { width: '100%', height: '100%' } : size}
      position={isMaximized ? { x: 0, y: 0 } : position}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      disableDragging={isMaximized}
      enableResizing={!isMaximized}
      minWidth={400}
      minHeight={300}
      bounds="parent"
      className="absolute flex flex-col"
      style={{ 
        zIndex, 
        pointerEvents: isMinimized ? 'none' : 'auto'
      }}
      onMouseDown={() => focusWindow(id)}
      dragHandleClassName="window-drag-handle"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ 
          opacity: isMinimized ? 0 : 1, 
          scale: (isMinimized ? 0.8 : 1), 
          y: (isMinimized ? 40 : 0)
        }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className={`flex flex-col h-full w-full overflow-hidden bg-[#1c1c1c]/95 backdrop-blur-xl border border-white/10 shadow-2xl transition-[border-radius] duration-200 ${
           isMaximized ? 'rounded-none' : 'rounded-xl'
        }`}
      >


        {/* Title Bar */}
        <div 
          className="window-drag-handle flex items-center justify-between pl-3 h-10 bg-[#2a2a2a] border-b border-white/10 select-none cursor-move shrink-0"
          onDoubleClick={() => maximizeWindow(id)}
        >
          {/* App Icon + Title */}
          <div className="flex items-center space-x-2 text-white min-w-0">
            <div className="w-4 h-4 shrink-0">
              <TitleIcon />
            </div>
            <span className="text-sm font-medium tracking-wide truncate text-gray-200">{title}</span>
          </div>

          {/* Window Controls — Windows 11 Style */}
          <div className="flex h-full shrink-0">
            {/* Minimize */}
            <button
              onClick={(e) => { e.stopPropagation(); minimizeWindow(id); }}
              className="w-11 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Minimize"
            >
              <MinimizeIcon />
            </button>

            {/* Maximize / Restore */}
            <button
              onClick={(e) => { e.stopPropagation(); maximizeWindow(id); }}
              className="w-11 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>

            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); closeWindow(id); }}
              className="w-11 flex items-center justify-center text-gray-300 hover:text-white hover:bg-red-500 transition-colors rounded-tr-xl"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* App Content Area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#1c1c1c]">
          <Suspense fallback={<div className="flex items-center justify-center h-full text-white text-sm opacity-60">Loading...</div>}>
            {AppContent 
              ? <AppContent windowData={windowData} /> 
              : <div className="p-4 text-red-400">Component not found: {component}</div>
            }
          </Suspense>
        </div>
      </motion.div>
    </Rnd>
  );
}


