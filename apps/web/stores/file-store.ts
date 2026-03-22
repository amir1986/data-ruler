'use client';

import { create } from 'zustand';

export interface FileItem {
  id: string;
  original_name: string;
  file_type: string;
  file_category: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string;
  storage_backend: string;
  schema_snapshot: unknown;
  row_count: number | null;
  column_count: number | null;
  processing_status: string;
  processing_error: string | null;
  quality_score: number | null;
  ai_summary: string | null;
  media_metadata: unknown;
  thumbnail_path: string | null;
  parent_file_id: string | null;
  folder_path: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface FileState {
  files: FileItem[];
  selectedFiles: Set<string>;
  currentFolder: string;
  viewMode: 'list' | 'grid';
  loading: boolean;
  uploading: boolean;
  uploadProgress: Record<string, number>;

  setFiles: (files: FileItem[]) => void;
  addFile: (file: FileItem) => void;
  updateFile: (id: string, updates: Partial<FileItem>) => void;
  removeFile: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setCurrentFolder: (folder: string) => void;
  setViewMode: (mode: 'list' | 'grid') => void;
  setLoading: (loading: boolean) => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (fileId: string, progress: number) => void;

  fetchFiles: (params?: Record<string, string>) => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  updateFileMeta: (id: string, updates: { original_name?: string; tags?: string[]; folder_path?: string }) => Promise<void>;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  selectedFiles: new Set(),
  currentFolder: '/',
  viewMode: 'list',
  loading: false,
  uploading: false,
  uploadProgress: {},

  setFiles: (files) => set({ files }),
  addFile: (file) => set((s) => ({ files: [file, ...s.files] })),
  updateFile: (id, updates) =>
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    })),
  removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedFiles);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedFiles: next };
    }),
  clearSelection: () => set({ selectedFiles: new Set() }),
  setCurrentFolder: (folder) => set({ currentFolder: folder }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setLoading: (loading) => set({ loading }),
  setUploading: (uploading) => set({ uploading }),
  setUploadProgress: (fileId, progress) =>
    set((s) => ({ uploadProgress: { ...s.uploadProgress, [fileId]: progress } })),

  fetchFiles: async (params) => {
    set({ loading: true });
    try {
      const searchParams = new URLSearchParams(params);
      const folder = get().currentFolder;
      if (folder !== '/') searchParams.set('folder', folder);
      const res = await fetch(`/api/files?${searchParams}`);
      if (res.ok) {
        const data = await res.json();
        set({ files: data.files || [], loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  uploadFiles: async (files) => {
    set({ uploading: true });
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('folder_path', get().currentFolder);

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        data.files.forEach((f: FileItem) => get().addFile(f));
      }
    } finally {
      set({ uploading: false, uploadProgress: {} });
    }
  },

  deleteFile: async (id) => {
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    if (res.ok) get().removeFile(id);
  },

  updateFileMeta: async (id, updates) => {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      get().updateFile(id, data.file);
    }
  },
}));
