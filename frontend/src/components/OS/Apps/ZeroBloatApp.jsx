import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Settings, Monitor, Cpu, ChevronRight } from 'lucide-react';
import { useWindowManager } from '../../../store/useWindowManager';
import osToast from '../osToast';

// Mock/Static emulator profiles for selection
const EMULATOR_PROFILES = [
  { id: 'ldplayer-5-32', name: 'LDPlayer 5.1 (32-bit)', type: 'ldplayer', arch: 'x86' },
  { id: 'ldplayer-9-64', name: 'LDPlayer 9 (64-bit)', type: 'ldplayer', arch: 'x86_64' },
  { id: 'bluestacks-5-64', name: 'BlueStacks 5 (64-bit)', type: 'bluestacks', arch: 'x86_64' },
  { id: 'memu-9', name: 'Memu 9', type: 'memu', arch: 'x86_64' },
  { id: 'nox-7', name: 'NoxPlayer 7', type: 'nox', arch: 'x86' },
  { id: 'generic-x86', name: 'Generic Android (x86)', type: 'generic', arch: 'x86' },
];

export default function ZeroBloatApp({ windowData, windowId }) {
  const { t } = useTranslation();
  
  // Access global window state to find mounted drives
  const shortcuts = useWindowManager((state) => state.desktopShortcuts);
  const openWindow = useWindowManager((state) => state.openWindow);
  
  // Mounted drives are shortcuts that represent a guest disk (identified by driveId or component)
  const mountedDrives = useMemo(() => {
    return shortcuts.filter(s => s.driveId || (s.component === 'FileExplorer' && s.initialPath?.includes('/mnt')));
  }, [shortcuts]);

  const [selectedDrive, setSelectedDrive] = useState(mountedDrives.length === 1 ? mountedDrives[0].id : '');
  const [selectedProfile, setSelectedProfile] = useState('');
  
  // Empty State: No Drives Mounted
  if (mountedDrives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[var(--bg-primary)] p-8 text-center">
        <div className="w-24 h-24 rounded-full bg-blue-500/10 flex items-center justify-center mb-6">
          <HardDrive className="w-12 h-12 text-blue-500" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">No Emulator Drives Mounted</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-sm mb-8 leading-relaxed">
          ZeroBloat needs access to an emulator's virtual disk to perform optimizations. Please navigate to 'This PC' and mount a virtual drive file (.vmdk, .vdi, etc).
        </p>
        <button
          onClick={() => {
            osToast.info('Opening This PC...');
            openWindow({
              id: 'thispc',
              label: 'This PC',
              icon: 'Monitor',
              component: 'ThisPC',
            });
          }}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
        >
          <Monitor className="w-4 h-4" /> Open This PC
        </button>
      </div>
    );
  }

  const handleStart = () => {
    if (!selectedDrive) {
        osToast.warning('Please select a target drive.');
        return;
    }
    if (!selectedProfile) {
        osToast.warning('Please select an emulator profile.');
        return;
    }
    
    // Find the actual drive info
    const driveObj = mountedDrives.find(d => d.id === selectedDrive);
    
    osToast.success('Initializing ZeroBloat Engine...');
    
    // Dispatch opening the Main Dashboard, replacing this window or opening a new one
    // In this implementation, we open the AppManagerApp but pass the specific context
    // Alternatively, open the original Dashboard 
    openWindow({
        id: 'zerobloat-dashboard',
        label: `ZeroBloat (${driveObj.label})`,
        icon: 'Cpu',
        component: 'AppManagerApp', // MainDashboard was removed, using AppManagerApp
        windowData: {
            drivePath: driveObj.initialPath,
            profile: selectedProfile
        }
    });
  };

  return (
    <div className="flex w-full h-full bg-[var(--bg-card)] text-[var(--text-primary)] flex-col md:flex-row overflow-hidden relative">
      
      {/* Sidebar Overview */}
      <div className="w-full md:w-64 bg-[var(--bg-secondary)] border-b md:border-b-0 md:border-r border-[var(--border)] p-6 shrink-0 flex flex-col items-center justify-center">
         <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Cpu className="w-10 h-10 text-white" />
         </div>
      </div>


      {/* Main Wizard Area */}
      <div className="flex-1 flex flex-col p-8 overflow-y-auto">
         <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
           <Settings className="w-5 h-5 text-blue-500" /> Optimization Setup
         </h2>

         <div className="space-y-8 flex-1">
            {/* Step 1: Select Drive */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                1. Select Target Drive
              </label>
              <div className="grid grid-cols-1 gap-3">
                {mountedDrives.map((drive) => (
                  <label 
                    key={drive.id}
                    className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${
                      selectedDrive === drive.id 
                        ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/50' 
                        : 'border-[var(--border)] hover:border-zinc-400 dark:hover:border-zinc-500 bg-[var(--bg-primary)]'
                    }`}
                  >
                    <input 
                      type="radio" 
                      name="driveSelect" 
                      value={drive.id}
                      checked={selectedDrive === drive.id}
                      onChange={(e) => setSelectedDrive(e.target.value)}
                      className="hidden"
                    />
                    <HardDrive className={`w-6 h-6 mr-4 ${selectedDrive === drive.id ? 'text-blue-500' : 'text-zinc-400'}`} />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{drive.label}</div>
                      <div className="text-xs text-[var(--text-muted)] truncate">{drive.initialPath}</div>
                    </div>
                    {selectedDrive === drive.id && <div className="w-3 h-3 rounded-full bg-blue-500 ml-2 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>}
                  </label>
                ))}
              </div>
            </div>

            {/* Step 2: Select Profile */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                2. Select Emulator Profile
              </label>
              <select 
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow transition-colors"
                style={{ appearance: 'none' }} // Remove default browser arrow styling
              >
                <option value="" disabled>-- Choose Profile --</option>
                {EMULATOR_PROFILES.map(prof => (
                  <option key={prof.id} value={prof.id}>{prof.name}</option>
                ))}
              </select>
            </div>
         </div>

         {/* Bottom Action Area */}
         <div className="mt-8 pt-6 border-t border-[var(--border)] flex justify-end shrink-0">
           <button
             onClick={handleStart}
             disabled={!selectedDrive || !selectedProfile}
             className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all flex items-center gap-2"
           >
             Start Optimization <ChevronRight className="w-4 h-4" />
           </button>
         </div>
      </div>
    </div>
  );
}
