import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useWindowManager } from '../../store/useWindowManager';


import Desktop from './Desktop';
import Taskbar from './Taskbar';
import WindowContext from './WindowContext';
import StartMenu from './StartMenu';

export default function WebOS({ onPowerOff }) {
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const windows = useWindowManager((state) => state.windows);

  // Set the theme dynamically based on our requirements
  useEffect(() => {
    document.documentElement.classList.add('dark'); // Assuming Windows dark mode looks best
  }, []);

  return (
    <div 
      className="h-screen w-screen overflow-hidden flex flex-col text-white"
      style={{
        backgroundImage: 'url("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Desktop Area — absolute boundary for all windows */}
      <main className="flex-1 min-h-0 relative z-0 overflow-hidden">
        <Desktop />

        {/* Render Open Windows */}
        <AnimatePresence>
          {windows.map((win) => (
            <WindowContext key={win.id} windowData={win} />
          ))}
        </AnimatePresence>

        {/* Start Menu */}
        <StartMenu 
          isOpen={isStartMenuOpen} 
          onClose={() => setIsStartMenuOpen(false)}
          onPowerOff={onPowerOff}
        />
      </main>

      {/* Taskbar Area */}
      <footer className="shrink-0 z-50">
        <Taskbar 
          onToggleStartMenu={() => setIsStartMenuOpen(!isStartMenuOpen)} 
        />
      </footer>
    </div>
  );
}
