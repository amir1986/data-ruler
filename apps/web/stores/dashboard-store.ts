'use client';

import { create } from 'zustand';

export interface Widget {
  id: string;
  type: 'chart' | 'table' | 'kpi' | 'text' | 'filter' | 'map' | 'media';
  chart_type?: string;
  title: string;
  config: Record<string, unknown>;
  data_query?: string;
  file_id?: string;
  layout: { x: number; y: number; w: number; h: number };
  cross_filter?: { column: string; type: string };
}

export interface Dashboard {
  id: string;
  title: string;
  description: string | null;
  layout: unknown[];
  widgets: Widget[];
  is_auto_generated: boolean;
  created_at: string;
  updated_at: string;
}

interface DashboardState {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  editMode: boolean;
  activeFilters: Record<string, unknown>;
  loading: boolean;

  setDashboards: (d: Dashboard[]) => void;
  setActiveDashboard: (d: Dashboard | null) => void;
  setEditMode: (edit: boolean) => void;
  setFilter: (key: string, value: unknown) => void;
  clearFilters: () => void;

  fetchDashboards: () => Promise<void>;
  fetchDashboard: (id: string) => Promise<void>;
  createDashboard: (title: string, description?: string) => Promise<Dashboard | null>;
  updateDashboard: (id: string, updates: Partial<Dashboard>) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
  addWidget: (dashboardId: string, widget: Omit<Widget, 'id'>) => Promise<void>;
  updateWidget: (dashboardId: string, widgetId: string, updates: Partial<Widget>) => Promise<void>;
  removeWidget: (dashboardId: string, widgetId: string) => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [],
  activeDashboard: null,
  editMode: false,
  activeFilters: {},
  loading: false,

  setDashboards: (dashboards) => set({ dashboards }),
  setActiveDashboard: (activeDashboard) => set({ activeDashboard }),
  setEditMode: (editMode) => set({ editMode }),
  setFilter: (key, value) =>
    set((s) => ({ activeFilters: { ...s.activeFilters, [key]: value } })),
  clearFilters: () => set({ activeFilters: {} }),

  fetchDashboards: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/dashboards');
      if (res.ok) {
        const data = await res.json();
        set({ dashboards: data.dashboards, loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  fetchDashboard: async (id) => {
    const res = await fetch(`/api/dashboards/${id}`);
    if (res.ok) {
      const data = await res.json();
      set({ activeDashboard: data.dashboard });
    }
  },

  createDashboard: async (title, description) => {
    const res = await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    if (res.ok) {
      const data = await res.json();
      set((s) => ({ dashboards: [data.dashboard, ...s.dashboards] }));
      return data.dashboard;
    }
    return null;
  },

  updateDashboard: async (id, updates) => {
    const res = await fetch(`/api/dashboards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      set((s) => ({
        dashboards: s.dashboards.map((d) => (d.id === id ? data.dashboard : d)),
        activeDashboard: s.activeDashboard?.id === id ? data.dashboard : s.activeDashboard,
      }));
    }
  },

  deleteDashboard: async (id) => {
    const res = await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
    if (res.ok) {
      set((s) => ({
        dashboards: s.dashboards.filter((d) => d.id !== id),
        activeDashboard: s.activeDashboard?.id === id ? null : s.activeDashboard,
      }));
    }
  },

  addWidget: async (dashboardId, widget) => {
    const res = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(widget),
    });
    if (res.ok) {
      await get().fetchDashboard(dashboardId);
    }
  },

  updateWidget: async (dashboardId, widgetId, updates) => {
    const res = await fetch(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      await get().fetchDashboard(dashboardId);
    }
  },

  removeWidget: async (dashboardId, widgetId) => {
    const res = await fetch(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await get().fetchDashboard(dashboardId);
    }
  },
}));
