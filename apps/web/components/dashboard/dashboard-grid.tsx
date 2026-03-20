'use client';

import React, { useState, useCallback } from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import { WidgetRenderer } from './widget-renderer';
import { useDashboardStore, type Widget } from '@/stores/dashboard-store';
import { Plus, Edit3, Save, Download } from 'lucide-react';
import 'react-grid-layout/css/styles.css';

interface DashboardGridProps {
  dashboardId: string;
  widgets: Widget[];
  editMode: boolean;
}

export function DashboardGrid({ dashboardId, widgets, editMode }: DashboardGridProps) {
  const { updateDashboard, addWidget, removeWidget, setEditMode } = useDashboardStore();
  const [showAddModal, setShowAddModal] = useState(false);

  const layout: Layout[] = widgets.map((w) => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    minW: 2,
    minH: 2,
    isDraggable: editMode,
    isResizable: editMode,
  }));

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      if (!editMode) return;
      const updatedWidgets = widgets.map((w) => {
        const layoutItem = newLayout.find((l) => l.i === w.id);
        if (layoutItem) {
          return {
            ...w,
            layout: { x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h },
          };
        }
        return w;
      });
      updateDashboard(dashboardId, { widgets: updatedWidgets });
    },
    [editMode, widgets, dashboardId, updateDashboard]
  );

  const handleAddWidget = async (type: string) => {
    const widgetCount = widgets.length;
    const defaults: Record<string, Partial<Widget>> = {
      chart: {
        type: 'chart',
        chart_type: 'bar',
        title: `Chart ${widgetCount + 1}`,
        config: { labels: ['A', 'B', 'C', 'D'], data: [40, 55, 30, 70] },
      },
      kpi: {
        type: 'kpi',
        title: `KPI ${widgetCount + 1}`,
        config: { label: 'Metric', value: 0, suffix: '' },
      },
      table: {
        type: 'table',
        title: `Table ${widgetCount + 1}`,
        config: { columns: ['Column 1', 'Column 2'], rows: [] },
      },
      text: {
        type: 'text',
        title: `Text ${widgetCount + 1}`,
        config: { content: 'Enter your text here...' },
      },
    };

    const preset = defaults[type] || defaults.text;
    await addWidget(dashboardId, {
      ...preset,
      type: preset.type as Widget['type'],
      title: preset.title || `Widget ${widgetCount + 1}`,
      config: preset.config || {},
      layout: {
        x: (widgetCount * 4) % 12,
        y: Math.floor((widgetCount * 4) / 12) * 4,
        w: type === 'kpi' ? 3 : 4,
        h: type === 'kpi' ? 2 : 3,
      },
    } as Omit<Widget, 'id'>);
    setShowAddModal(false);
  };

  const handleExport = () => {
    const data = JSON.stringify({ dashboardId, widgets }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_${dashboardId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
              editMode
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {editMode ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            {editMode ? 'Save Layout' : 'Edit'}
          </button>
          {editMode && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
            >
              <Plus className="w-4 h-4" /> Add Widget
            </button>
          )}
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Grid */}
      {widgets.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-500 text-sm">No widgets yet</p>
          <button
            onClick={() => {
              setEditMode(true);
              setShowAddModal(true);
            }}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition"
          >
            Add your first widget
          </button>
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={80}
          width={1200}
          onLayoutChange={handleLayoutChange}
          isDraggable={editMode}
          isResizable={editMode}
          compactType="vertical"
          margin={[12, 12]}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetRenderer
                widget={widget}
                editMode={editMode}
                onRemove={() => removeWidget(dashboardId, widget.id)}
              />
            </div>
          ))}
        </GridLayout>
      )}

      {/* Add Widget Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">Add Widget</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { type: 'chart', label: 'Chart', desc: 'Bar, line, pie, scatter...' },
                { type: 'kpi', label: 'KPI Card', desc: 'Key metric with trend' },
                { type: 'table', label: 'Data Table', desc: 'Sortable data table' },
                { type: 'text', label: 'Text Block', desc: 'Rich text content' },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleAddWidget(item.type)}
                  className="text-left p-4 rounded-lg border border-zinc-700 hover:border-blue-500 hover:bg-blue-500/5 transition"
                >
                  <p className="text-sm font-medium text-zinc-200">{item.label}</p>
                  <p className="text-xs text-zinc-500 mt-1">{item.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
