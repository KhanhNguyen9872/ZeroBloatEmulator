import React, { useState, useEffect } from 'react';
import { HostAPI, CoreAPI } from '../../../services/api';
import { useWindowManager } from '../../../store/useWindowManager';
import osToast from '../osToast';
const toast = osToast;
import { HardDrive, Folder, File, ChevronRight, ChevronLeft, ArrowUp } from 'lucide-react';

export default function ThisPC() {
  const [drives, setDrives] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  
  const addShortcut = useWindowManager((state) => state.addShortcut);

  // Initial load of drives
  useEffect(() => {
    loadDrives();
  }, []);

  const loadDrives = async () => {
    try {
      const resp = await HostAPI.getDrives();
      setDrives(resp.data.drives || []);
      // Auto-open first drive if none selected
      if (!currentPath && resp.data.drives && resp.data.drives.length > 0) {
        navigateTo(resp.data.drives[0]);
      }
    } catch (err) {
      toast.error('Failed to load host drives');
    }
  };

  const loadFiles = async (path) => {
    setLoading(true);
    try {
      const resp = await HostAPI.getFiles(path);
      setFiles(resp.data.files || []);
      setCurrentPath(path);
    } catch (err) {
      toast.error(`Access denied or folder not found: ${path}`);
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (path) => {
    if (currentPath) {
      setHistory(prev => [...prev, currentPath]);
    }
    loadFiles(path);
  };

  const goBack = () => {
    if (history.length > 0) {
      const newHistory = [...history];
      const prevPath = newHistory.pop();
      setHistory(newHistory);
      loadFiles(prevPath);
    }
  };

  const goUp = () => {
    // Basic "up" logic
    let separator = currentPath.includes('\\') ? '\\' : '/';
    let parts = currentPath.split(separator).filter(Boolean);
    
    // If it's just a drive letter (e.g. C:), do nothing
    if (parts.length <= 1) return;
    
    parts.pop();
    let newPath = parts.join(separator);
    
    // Ensure trailing slash for root drives on Windows (C:\) or Linux (/)
    if (parts.length === 1 && newPath.includes(':')) {
       newPath += separator;
    } else if (newPath === '') {
       newPath = '/';
    }
    
    navigateTo(newPath);
  };

  const handleMountClick = async (file) => {
    const filePath = currentPath.endsWith('\\') || currentPath.endsWith('/') 
      ? `${currentPath}${file.name}` 
      : `${currentPath}\\${file.name}`;

    const toastId = toast.loading(`Mounting ${file.name}...`);
    try {
      const resp = await CoreAPI.mount(filePath);
      toast.success(resp.data.message || `Mounted ${file.name} successfully`, { id: toastId });

      // Add one desktop shortcut per successfully-mounted partition
      const mounts = resp.data.mounts || [];
      const successfulMounts = mounts.filter(m => m.mounted);
      const isMultiPartition = successfulMounts.length > 1;

      successfulMounts.forEach((m) => {
        // Parse partition device name (e.g. /dev/sdb1 → sdb1)
        const partName = m.partition.split('/').pop();
        // Label: just filename for single partition, or "filename (sdb1)" for multi
        const shortcutLabel = isMultiPartition
          ? `${file.name} (${partName})`
          : file.name;

        addShortcut({
          id: `guest-drive-${resp.data.id}-${partName}`,
          label: shortcutLabel,
          icon: 'HardDrive',
          component: 'FileExplorer',
          driveId: resp.data.id,
          partition: m.partition,
          initialPath: m.mount_path,
        });
      });

    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || `Failed to mount ${file.name}`, { id: toastId });
    }
  };


  const formatSize = (bytes) => {
    if (bytes === 0) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Support typical virtual disk extensions
  const isDiskImage = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    return ['vmdk', 'vdi', 'qcow2', 'vhd', 'img', 'iso'].includes(ext);
  };

  return (
    <div className="flex flex-col h-full bg-[#202020] text-gray-200 text-sm">
      {/* Toolbar / Address Bar */}
      <div className="flex items-center px-4 py-2 border-b border-white/10 bg-[#2b2b2b]">
        <div className="flex space-x-2 mr-4">
          <button onClick={goBack} disabled={history.length === 0} className="p-1.5 hover:bg-white/10 rounded disabled:opacity-50">
            <ChevronLeft size={16} />
          </button>
          <button onClick={goUp} className="p-1.5 hover:bg-white/10 rounded">
            <ArrowUp size={16} />
          </button>
        </div>
        
        <div className="flex-1 flex items-center bg-[#1c1c1c] border border-white/10 rounded px-3 py-1.5">
          <span className="text-gray-400 mr-2"><Folder size={14} /></span>
          <span className="truncate">{currentPath}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 border-r border-white/10 p-2 overflow-y-auto bg-[#1c1c1c]/50">
          <div className="text-xs font-semibold text-gray-400 mb-2 px-2 uppercase tracking-wider">This PC</div>
          {drives.map((drive) => (
            <div 
              key={drive}
              onClick={() => navigateTo(drive)}
              className={`flex items-center px-2 py-1.5 cursor-pointer rounded transition-colors
                ${currentPath && currentPath.startsWith(drive) ? 'bg-white/10' : 'hover:bg-white/5'}
              `}
            >
              <HardDrive size={16} className="text-gray-300 mr-2" />
              <span>{drive}</span>
            </div>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto bg-[#202020] p-4">
          {loading ? (
             <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
              {files.map((f, idx) => {
                const isDir = f.type === 'directory';
                const isImage = !isDir && isDiskImage(f.name);
                
                return (
                  <div 
                    key={idx}
                    onDoubleClick={() => isDir && navigateTo(
                       (currentPath.endsWith('\\') || currentPath.endsWith('/')) ? `${currentPath}${f.name}` : `${currentPath}\\${f.name}`
                    )}
                    className="group relative flex items-center p-2 rounded hover:bg-white/10 cursor-pointer transition-colors user-select-none"
                  >
                    <div className="mr-3">
                      {isDir ? <Folder className="text-yellow-400" size={24} /> : 
                       isImage ? <HardDrive className="text-blue-400" size={24} /> :
                       <File className="text-gray-400" size={24} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{f.name}</div>
                      {!isDir && <div className="text-xs text-gray-500">{formatSize(f.size)}</div>}
                    </div>

                    {/* Quick Mount Button for Disks */}
                    {isImage && (
                       <button
                         onClick={(e) => { e.stopPropagation(); handleMountClick(f); }}
                         className="absolute right-2 opacity-0 group-hover:opacity-100 bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-1 rounded transition-all shadow-lg"
                       >
                         Mount to OS
                       </button>
                    )}
                  </div>
                );
              })}
              {files.length === 0 && !loading && (
                <div className="col-span-full text-center text-gray-400 mt-10">This folder is empty.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
