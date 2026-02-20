import React, { useState } from 'react';
import { useWindowManager } from '../../store/useWindowManager';
import { useTranslation } from 'react-i18next';
import { Terminal, Folder, Settings, AppWindow, Play, Boxes, HardDrive } from 'lucide-react';
import { CoreAPI } from '../../services/api';
import osToast from './osToast';

import { WinIconMap, AppWindowIcon } from './Icons';

export default function Desktop() {
  const { t } = useTranslation();
  const desktopShortcuts = useWindowManager((state) => state.desktopShortcuts);
  const openWindow = useWindowManager((state) => state.openWindow);

  // Simple state to track selected icon for visual feedback
  const [selectedId, setSelectedId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const removeShortcut = useWindowManager((state) => state.removeShortcut);

  const handleDoubleClick = (appData) => {
    openWindow({
      ...appData,
      title: t(appData.label, appData.label)
    });
    setSelectedId(null);
  };

  const handleContextMenu = (e, shortcut) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(shortcut.id);
    
    if (shortcut.driveId) {
      setContextMenu({
        x: e.pageX,
        y: e.pageY,
        shortcut
      });
    } else {
      setContextMenu(null);
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleEject = async () => {
    if (!contextMenu?.shortcut) return;
    const { shortcut } = contextMenu;
    const toastId = osToast.loading(`Ejecting ${shortcut.label}...`);
    try {
      await CoreAPI.eject(shortcut.driveId);
      removeShortcut(shortcut.id);
      osToast.success(`${shortcut.label} ejected safely.`, { id: toastId });
    } catch (err) {
      osToast.error(`Failed to eject: ${err.message}`, { id: toastId });
    } finally {
      closeContextMenu();
    }
  };


  return (
    <div 
      className="absolute inset-0 z-0 p-4 pt-8"
      onClick={() => { setSelectedId(null); closeContextMenu(); }}
      onContextMenu={closeContextMenu}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] grid-rows-[repeat(auto-fill,minmax(100px,1fr))] gap-2 h-full w-full content-start">
        {desktopShortcuts.map((shortcut) => {
          const isSelected = selectedId === shortcut.id;
          return (
            <div
              key={shortcut.id}
              className={`flex flex-col items-center justify-start p-2 rounded-md cursor-pointer transition-colors ${
                isSelected ? 'bg-white/20 border border-white/30' : 'hover:bg-white/10'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(shortcut.id);
                closeContextMenu();
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClick(shortcut);
                closeContextMenu();
              }}
              onContextMenu={(e) => handleContextMenu(e, shortcut)}
            >
              <div className="mb-1 drop-shadow-md w-10 h-10">
                {WinIconMap[shortcut.icon] ? 
                  React.createElement(WinIconMap[shortcut.icon]) : 
                  <AppWindowIcon />}
              </div>
              <span className="text-white text-xs text-center font-medium drop-shadow-md line-clamp-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                {t(shortcut.label, shortcut.label)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Desktop Context Menu */}
      {contextMenu && (
        <div 
          className="absolute z-50 w-48 bg-[#2b2b2b] border border-white/10 rounded-md shadow-2xl py-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={handleEject}
            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 flex items-center"
          >
            <HardDrive size={16} className="mr-2 text-gray-400" />
            Eject {contextMenu.shortcut.label}
          </button>
        </div>
      )}
    </div>
  );
}
