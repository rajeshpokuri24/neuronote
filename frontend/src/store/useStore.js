import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) => {
        localStorage.setItem('neuronote_token', token);
        localStorage.setItem('neuronote_user', JSON.stringify(user));
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem('neuronote_token');
        localStorage.removeItem('neuronote_user');
        set({ user: null, token: null, isAuthenticated: false });
      },

      updateUser: (updates) =>
        set((state) => ({ user: { ...state.user, ...updates } })),

      // Notes
      notes: [],
      currentNote: null,

      setNotes: (notes) => set({ notes }),
      setCurrentNote: (note) => set({ currentNote: note }),

      addNote: (note) =>
        set((state) => ({ notes: [note, ...state.notes] })),

      updateNote: (id, updates) =>
        set((state) => ({
          notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
          currentNote:
            state.currentNote?.id === id
              ? { ...state.currentNote, ...updates }
              : state.currentNote,
        })),

      removeNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
          currentNote: state.currentNote?.id === id ? null : state.currentNote,
        })),

      // Review
      dueItems: [],
      reviewStats: null,

      setDueItems: (items) => set({ dueItems: items }),
      setReviewStats: (stats) => set({ reviewStats: stats }),

      removeReviewedItem: (id) =>
        set((state) => ({
          dueItems: state.dueItems.filter((item) => item.id !== id),
        })),

      // UI State
      sidebarOpen: true,
      activeView: 'dashboard',

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: 'neuronote-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);

export default useStore;
