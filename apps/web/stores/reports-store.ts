'use client';

import { create } from 'zustand';

export interface Report {
  id: string;
  title: string;
  description: string | null;
  template: string;
  status: 'draft' | 'generating' | 'ready' | 'error';
  file_ids: string[];
  content: Record<string, unknown>;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ReportsState {
  reports: Report[];
  activeReport: Report | null;
  loading: boolean;

  setActiveReport: (report: Report | null) => void;
  fetchReports: () => Promise<void>;
  fetchReport: (id: string) => Promise<void>;
  createReport: (template: string, title?: string, fileIds?: string[]) => Promise<Report | null>;
  updateReport: (id: string, updates: Partial<Report>) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  reports: [],
  activeReport: null,
  loading: false,

  setActiveReport: (activeReport) => set({ activeReport }),

  fetchReports: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        set({ reports: data.reports || [], loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  fetchReport: async (id) => {
    const res = await fetch(`/api/reports/${id}`);
    if (res.ok) {
      const data = await res.json();
      set({ activeReport: data.report });
    }
  },

  createReport: async (template, title, fileIds) => {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, title, file_ids: fileIds }),
    });
    if (res.ok) {
      const data = await res.json();
      set((s) => ({ reports: [data.report, ...s.reports] }));
      return data.report;
    }
    return null;
  },

  updateReport: async (id, updates) => {
    const res = await fetch(`/api/reports/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      set((s) => ({
        reports: s.reports.map((r) => (r.id === id ? data.report : r)),
        activeReport: s.activeReport?.id === id ? data.report : s.activeReport,
      }));
    }
  },

  deleteReport: async (id) => {
    const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    if (res.ok) {
      set((s) => ({
        reports: s.reports.filter((r) => r.id !== id),
        activeReport: s.activeReport?.id === id ? null : s.activeReport,
      }));
    }
  },
}));
