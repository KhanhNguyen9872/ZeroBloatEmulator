import React, { useCallback, useEffect, useState } from 'react';
import osToast from '../osToast';
const toast = osToast;
import { useTranslation } from 'react-i18next';
import { useBackend } from '../../../context/BackendContext';
import AppList from '../../AppList';
import AddAppModal from '../../AddAppModal';
import ConfirmDialog from '../../ConfirmDialog';
import FolderBrowserModal from '../../FolderBrowserModal';
import ActionPanel from '../../ActionPanel';
import { CoreAPI, AppsAPI, AppsExportAPI } from '../../../services/api';
import apiClient from '../../../services/api';
import { useWindowManager } from '../../../store/useWindowManager';

export default function AppManagerApp({ windowData }) {
  const { t } = useTranslation();
  const { isConnected } = useBackend();
  const openWindow = useWindowManager(state => state.openWindow);

  const [coreStatus, setCoreStatus] = useState('unknown');
  const [isAndroidMounted, setIsAndroidMounted] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [apps, setApps] = useState({});
  const [categoryRoots, setCategoryRoots] = useState({});
  const [scanningType, setScanningType] = useState(null); // 'fast' | 'deep' | null
  const [selected, setSelected] = useState(new Set());
  const [packagesLoaded, setPackagesLoaded] = useState(false);
  
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeepScan, setConfirmDeepScan] = useState(false);
  const [showAddApp, setShowAddApp] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);

  const [profiles, setProfiles] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // ── Polling Core Status ───────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await CoreAPI.getStatus();
      setCoreStatus(data.status);
      setIsAndroidMounted(data.is_android_mounted ?? false);
    } catch {
      setCoreStatus('stopped');
      setIsAndroidMounted(false);
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/profiles');
      setProfiles(data.profiles ?? []);
    } catch (err) {
      console.error("Failed to fetch profiles", err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchProfiles();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchProfiles]);

  // ── Scanning ──────────────────────────────────────────────────────────────

  const handleScanApps = useCallback(async (isDeep = false) => {
    if (coreStatus !== 'running') {
      toast.error('Core must be running to scan apps.');
      return;
    }

    setScanningType(isDeep ? 'deep' : 'fast');
    try {
      const skip = isDeep ? 'false' : 'true';
      const { data } = await apiClient.get(`/api/apps?skip_packages=${skip}`, { timeout: 350000 });
      setApps(data.apps ?? {});
      setCategoryRoots(data.category_roots ?? {});
      setPackagesLoaded(isDeep);
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastRefresh(time);
      const total = Object.values(data.apps ?? {}).reduce((s, a) => s + a.length, 0);
      toast.success(`${isDeep ? 'Deep' : 'Fast'} scan complete. Found ${total} apps`);
    } catch (err) {
      toast.error(`Scan failed: ${err.response?.data?.message ?? err.message}`);
    } finally {
      setScanningType(null);
    }
  }, [coreStatus]);

  // ── Selection & Profiles ──────────────────────────────────────────────────

  const toggleSelected = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleProfileSelect = async (profile) => {
    if (!profile.id) return;
    setLoadingProfile(profile.id);
    try {
      const { data } = await apiClient.get(`/api/profiles/${profile.id}`);
      const packages = data.packages || [];
      
      setSelected(prev => {
        const next = new Set(prev);
        const pathLookup = new Map();
        const packageLookup = new Map();

        Object.values(apps).flat().forEach(app => {
            const normPath = app.path.startsWith('/') ? app.path.substring(1) : app.path;
            pathLookup.set(normPath.toLowerCase(), normPath);
            if (app.package) packageLookup.set(app.package.toLowerCase(), normPath);
            pathLookup.set(app.name.toLowerCase(), normPath);
        });

        let count = 0;
        packages.forEach(pkgPath => {
           const normPkgPath = pkgPath.startsWith('/') ? pkgPath.substring(1) : pkgPath;
           const pkgName = pkgPath.split('/').pop().toLowerCase();
           
           let id = pathLookup.get(normPkgPath.toLowerCase());
           if (!id) id = packageLookup.get(pkgPath.toLowerCase());
           if (!id) id = pathLookup.get(pkgName);
           
           if (id) {
             next.add(id);
             count++;
           }
        });

        if (count === 0) {
          toast.info(t('dashboard.profile_no_match', 'No apps from this profile were found on the device.'));
          return prev;
        }
        
        toast.success(t('dashboard.profile_selected', { count, profile: profile.name }));
        return next;
      });
    } catch (err) {
      toast.error("Failed to load profile");
    } finally {
      setLoadingProfile(null);
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleAppAdded = useCallback((newApp, category) => {
    setApps(prev => {
      const next = { ...prev };
      if (!next[category]) next[category] = [];
      if (!next[category].find(a => a.path === newApp.path)) {
        next[category] = [...next[category], newApp].sort((a, b) => a.name.localeCompare(b.name));
      }
      return next;
    });
  }, []);

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setConfirmDelete(false);
    const paths = Array.from(selected).map((id) => `/mnt/android/${id}`);
    setActionLoading(true);
    try {
      const { data } = await apiClient.post('/api/delete', { paths });
      toast.success(`Deleted ${Object.keys(data.deleted ?? {}).length} app(s)`);
      if (data.errors) {
        for (const [p, e] of Object.entries(data.errors)) {
          toast.error(`Error deleting ${p.split('/').pop()}: ${e}`);
        }
      }
      handleScanApps(packagesLoaded);
      setSelected(new Set());
    } catch (err) {
      toast.error(`Delete failed: ${err.response?.data?.message ?? err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveTo = () => {
    if (selected.size === 0) return;
    setShowMovePicker(true);
  };

  const handleMoveConfirm = async (targetPath) => {
    setShowMovePicker(false);
    setActionLoading(true);
    const sources = Array.from(selected).map(id => `/mnt/android/${id}`);
    
    try {
      const { data } = await AppsAPI.moveBatch(sources, targetPath);
      toast.success(`Moved ${data.moved?.length || 0} items successfully`);
      if (data.errors && data.errors.length > 0) {
         toast.error(`Failed to move ${data.errors.length} items`);
      }
      handleScanApps(packagesLoaded);
      setSelected(new Set());
    } catch (err) {
      toast.error(`Batch move failed: ${err.response?.data?.message ?? err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportAll = async () => {
    if (selected.size === 0) return;
    const files = [];
    
    for (const catList of Object.values(apps)) {
      for (const app of catList) {
        let id = app.path;
        if (id.startsWith('/')) id = id.substring(1);
        if (selected.has(id)) files.push({ path: app.path, name: app.name });
      }
    }

    if (files.length === 0) return;

    setActionLoading(true);
    const toastId = toast.loading(`Exporting ${files.length} apps...`);
    
    try {
      await AppsExportAPI.exportBatch(files);
      toast.success("Export complete!", { id: toastId });
      setSelected(new Set());
    } catch (err) {
      toast.error(`Batch export failed: ${err.message}`, { id: toastId });
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isRunning = coreStatus === 'running';
  const isOperational = isRunning && isAndroidMounted;
  const busy = actionLoading || !!scanningType;

  return (
    <div className="flex flex-col w-full h-full bg-[var(--bg-primary)] text-[var(--text-primary)] relative">
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        
        {/* Left Action Panel Overlay / Sidebar */}
        <div className="w-full md:w-64 border-r border-[var(--border)] overflow-y-auto bg-[var(--bg-secondary)] shrink-0">
           <ActionPanel 
              coreStatus={coreStatus}
              isAndroidMounted={isAndroidMounted}
              isConnected={isConnected}
              busy={busy}
              loading={actionLoading}
              restartRequired={false}
              onStart={() => {}} // Disabled in sub-app, Core lifecycle managed centrally
              onStop={() => {}} 
              onRestart={() => {}} 
              onScan={() => handleScanApps(false)}
              onDeepScan={() => setConfirmDeepScan(true)}
              onAddApp={() => setShowAddApp(true)}
              onOpenFileExplorer={() => {
                openWindow({
                  id: 'guest-fs',
                  label: 'Guest File Explorer',
                  icon: 'Folder',
                  component: 'FileExplorer',
                  initialPath: '/mnt/android'
                });
              }}
              selectedCount={selected.size}
              onDelete={() => setConfirmDelete(true)}
              onMove={handleMoveTo}
              onExport={handleExportAll}
              scanningType={scanningType}
              packagesLoaded={packagesLoaded}
              // Hide lifecycle buttons in App manager window
              hideLifecycle={true}
           />
        </div>

        {/* Right Main Content */}
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-primary)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
               <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('dashboard.installed_apps')}</h2>
               {lastRefresh && (
                 <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-1 rounded-md border border-[var(--border)]">
                   {t('dashboard.last_refresh', 'Last refresh')}: {lastRefresh}
                 </span>
               )}
            </div>

            <div className="flex-1 flex flex-col xl:flex-row gap-0 min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                   {isOperational ? (
                       <AppList 
                         apps={apps} 
                         selected={selected} 
                         onToggle={toggleSelected} 
                         loading={!!scanningType} 
                         onRefresh={() => handleScanApps(packagesLoaded)}
                         categoryRoots={categoryRoots}
                       />
                   ) : (
                       <div className="flex items-center justify-center h-full text-center p-8">
                           <div>
                               <div className="text-4xl mb-4">⚠️</div>
                               <h3 className="text-lg font-bold mb-2">Core Offline or Not Mounted</h3>
                               <p className="text-sm text-[var(--text-muted)] max-w-sm">
                                   Please start the emulator core from the desktop to manage applications.
                               </p>
                           </div>
                       </div>
                   )}
                </div>

                {isOperational && profiles.length > 0 && (
                   <div className="w-full xl:w-64 border-t xl:border-t-0 xl:border-l border-[var(--border)] bg-[var(--bg-secondary)] p-4 overflow-y-auto custom-scrollbar shrink-0">
                     <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">
                       {t('dashboard.profiles', 'Debloat Profiles')}
                     </h2>
                     <div className="flex flex-col gap-3">
                       {profiles.map(profile => (
                         <div 
                           key={profile.id}
                           onClick={() => !loadingProfile && handleProfileSelect(profile)}
                           className={`
                             border border-[var(--border)] bg-[var(--bg-primary)] rounded-lg p-3 cursor-pointer
                             hover:border-blue-500 hover:shadow-sm transition-all group
                             ${loadingProfile === profile.id ? 'opacity-70 cursor-wait' : ''}
                           `}
                         >
                           <div className="flex items-center justify-between mb-1.5">
                             <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-blue-500 transition-colors">{profile.name}</h3>
                             {loadingProfile === profile.id && <svg className="animate-spin w-3 h-3 text-blue-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                           </div>
                           <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                             {profile.description}
                           </p>
                         </div>
                       ))}
                     </div>
                   </div>
                )}
            </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <ConfirmDialog
        isOpen={confirmDelete}
        title={t('dashboard.confirm_delete_title')}
        message={t('dashboard.confirm_delete_msg', { count: selected.size })}
        confirmText={t('dashboard.delete')}
        cancelText={t('dashboard.cancel')}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        type="danger"
      />

      <ConfirmDialog
        isOpen={confirmDeepScan}
        title={t('dashboard.confirm_slow_scan_title')}
        message={t('dashboard.confirm_slow_scan_msg')}
        confirmText={t('dashboard.slow_scan')}
        cancelText={t('dashboard.cancel')}
        onConfirm={() => {
            setConfirmDeepScan(false);
            handleScanApps(true);
        }}
        onCancel={() => setConfirmDeepScan(false)}
        type="warning"
      />

      <AddAppModal 
        isOpen={showAddApp} 
        onClose={() => setShowAddApp(false)} 
        onRefresh={handleAppAdded}
        categoryRoots={categoryRoots}
      />

      {showMovePicker && (
        <FolderBrowserModal 
           onConfirm={handleMoveConfirm}
           onClose={() => setShowMovePicker(false)}
        />
      )}
    </div>
  );
}
