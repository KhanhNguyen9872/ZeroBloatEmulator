import { create } from 'zustand';

// Initial default desktop shortcuts
const initialShortcuts = [
  {
    id: 'this_pc',
    label: 'This PC',
    icon: 'HardDrive',
    component: 'ThisPC',
  },
  {
    id: 'guest_fs',
    label: 'Guest FS',
    icon: 'Folder',
    component: 'FileExplorer',
    initialPath: '/mnt/android'
  },
  {
    id: 'app_manager',
    label: 'App Manager',
    icon: 'AppWindow',
    component: 'AppManagerApp',
  },
  {
    id: 'zerobloat_launcher',
    label: 'ZeroBloat',
    icon: 'Cpu',
    component: 'ZeroBloatApp',
  },
];


export const useWindowManager = create((set) => ({
  windows: [],
  desktopShortcuts: initialShortcuts,

  // --- Window Actions ---

  openWindow: (appData) =>
    set((state) => {
      const existingWindow = state.windows.find((w) => w.id === appData.id);

      // If already open, just bring it to front
      if (existingWindow) {
        return {
          windows: state.windows.map((w) => {
            if (w.id === appData.id) {
              return { ...w, isMinimized: false, zIndex: Date.now() };
            }
            return w;
          }),
        };
      }

      // Otherwise, open a new window
      const newWindow = {
        id: appData.id,
        title: appData.title || appData.label,
        component: appData.component,
        icon: appData.icon,
        isMinimized: false,
        isMaximized: false,
        zIndex: Date.now(),
        // Default position & size, can be overridden by appData
        position: appData.position || { x: 100, y: 100 },
        size: appData.size || { width: 800, height: 600 },
        ...appData,
      };

      return { windows: [...state.windows, newWindow] };
    }),

  closeWindow: (id) =>
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
    })),

  minimizeWindow: (id) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, isMinimized: true } : w
      ),
    })),

  maximizeWindow: (id) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, isMaximized: !w.isMaximized, zIndex: Date.now() } : w
      ),
    })),

  focusWindow: (id) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, isMinimized: false, zIndex: Date.now() } : w
      ),
    })),

  updateWindowPosition: (id, position) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, position } : w
      ),
    })),

  updateWindowSize: (id, size, position) =>
      set((state) => ({
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, size, position: position || w.position } : w
        ),
      })),

  // --- Desktop Actions ---

  addShortcut: (shortcut) =>
    set((state) => ({
      desktopShortcuts: [...state.desktopShortcuts, shortcut],
    })),

  removeShortcut: (id) =>
    set((state) => ({
      desktopShortcuts: state.desktopShortcuts.filter((s) => s.id !== id),
    })),

  minimizeAllWindows: () =>
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, isMinimized: true })),
    })),
}));

