'use client';

import { create } from 'zustand';

export interface Note {
  id: string;
  file_id: string | null;
  title: string;
  content: string;
  content_format: string;
  created_at: string;
  updated_at: string;
}

interface NotesState {
  notes: Note[];
  activeNote: Note | null;
  loading: boolean;
  saving: boolean;

  setActiveNote: (note: Note | null) => void;
  fetchNotes: () => Promise<void>;
  createNote: (title?: string, fileId?: string) => Promise<Note | null>;
  updateNote: (id: string, updates: { title?: string; content?: string }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  activeNote: null,
  loading: false,
  saving: false,

  setActiveNote: (activeNote) => set({ activeNote }),

  fetchNotes: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/notes');
      if (res.ok) {
        const data = await res.json();
        set({ notes: data.notes || [], loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  createNote: async (title, fileId) => {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Untitled Note', fileId }),
    });
    if (res.ok) {
      const data = await res.json();
      set((s) => ({ notes: [data.note, ...s.notes] }));
      return data.note;
    }
    return null;
  },

  updateNote: async (id, updates) => {
    // Debounced auto-save
    if (saveTimeout) clearTimeout(saveTimeout);

    // Optimistic update
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
      activeNote: s.activeNote?.id === id ? { ...s.activeNote, ...updates } : s.activeNote,
    }));

    saveTimeout = setTimeout(async () => {
      set({ saving: true });
      try {
        await fetch(`/api/notes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
      } finally {
        set({ saving: false });
      }
    }, 500);
  },

  deleteNote: async (id) => {
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      set((s) => ({
        notes: s.notes.filter((n) => n.id !== id),
        activeNote: s.activeNote?.id === id ? null : s.activeNote,
      }));
    }
  },
}));
