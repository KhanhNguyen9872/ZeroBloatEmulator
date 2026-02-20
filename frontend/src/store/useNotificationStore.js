import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useNotificationStore = create(
  persist(
    (set) => ({
      // Active toasts shown as popups (not persisted across refresh)
      activeToasts: [],
      // Full history persisted in sessionStorage
      history: [],
      // Count of notifications received since last panel open
      unreadCount: 0,

      addNotification: (notification) => {
        const id = notification.id
          || (typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}`);
        
        const timeoutDuration = notification.timeout !== undefined ? notification.timeout : 4000;
        const entry = { ...notification, id, timestamp: Date.now() };

        set((state) => {
          const isUpdate = state.history.some((h) => h.id === id);

          if (isUpdate) {
            // Update mode: replace existing toast with same ID
            return {
              activeToasts: state.activeToasts.map((t) => (t.id === id ? entry : t)),
              history: state.history.map((h) => (h.id === id ? entry : h)),
              // Don't increment unreadCount for updates
            };
          }

          // Addition mode: send to front
          return {
            activeToasts: [...state.activeToasts, entry],
            history: [entry, ...state.history].slice(0, 100),
            unreadCount: state.unreadCount + 1,
          };
        });



        // Auto-remove from active toasts only
        if (timeoutDuration > 0) {
          setTimeout(() => {
            set((state) => ({
              activeToasts: state.activeToasts.filter((n) => n.id !== id),
            }));
          }, timeoutDuration);
        }

        return id;
      },

      // Remove a single active toast (e.g., user clicked X)
      removeActiveToast: (id) =>
        set((state) => ({
          activeToasts: state.activeToasts.filter((n) => n.id !== id),
        })),

      // Legacy compat: removeNotification maps to removeActiveToast
      removeNotification: (id) =>
        set((state) => ({
          activeToasts: state.activeToasts.filter((n) => n.id !== id),
        })),

      // Clear the history list shown in the Calendar panel
      clearHistory: () => set({ history: [] }),

      // Mark all notifications as read (resets badge)
      markAllAsRead: () => set({ unreadCount: 0 }),

      // Legacy compat — kept so existing osToast.dismiss works
      clearNotifications: () => set({ activeToasts: [], history: [], unreadCount: 0 }),

      // Legacy compat — old code reads `notifications`; map to activeToasts dynamically
      get notifications() {
        return this.activeToasts ?? [];
      },
    }),
    {
      name: 'zbe-notifications',        // sessionStorage key
      storage: {
        getItem: (key) => {
          const raw = sessionStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        },
        setItem: (key, value) => sessionStorage.setItem(key, JSON.stringify(value)),
        removeItem: (key) => sessionStorage.removeItem(key),
      },
      // Only persist history and unreadCount across page reloads
      partialize: (state) => ({
        history: state.history,
        unreadCount: state.unreadCount,
      }),
      // Deduplicate history on load (cleans up stale duplicate IDs from sessionStorage)
      onRehydrateStorage: () => (state) => {
        if (state && state.history) {
          const seen = new Set();
          state.history = state.history.filter((n) => {
            if (seen.has(n.id)) return false;
            seen.add(n.id);
            return true;
          });
        }
      },
    }
  )
);

export default useNotificationStore;
