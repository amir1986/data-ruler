'use client';

import React, { useState, useCallback } from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import { WidgetRenderer } from './widget-renderer';
import { useDashboardStore, type Widget } from '@/stores/dashboard-store';
import { useLanguageStore } from '@/stores/language-store';
import { Plus, Edit3, Save, Download } from 'lucide-react';
import 'react-grid-layout/css/styles.css';

interface DashboardGridProps {
  dashboardId: string;
  widgets: Widget[];
  editMode: boolean;
}

export function DashboardGrid({ dashboardId, widgets, editMode }: DashboardGridProps) {
  const { updateDashboard, removeWidget, setEditMode } = useDashboardStore();
  const { t } = useLanguageStore();
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
            {editMode ? t.dashboards.saveLayout : t.dashboards.edit}
          </button>
          {editMode && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
            >
              <Plus className="w-4 h-4" /> {t.dashboards.addWidget}
            </button>
          )}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition">
          <Download className="w-4 h-4" /> {t.dashboards.export}
        </button>
      </div>

      {/* Grid */}
      {widgets.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-500 text-sm">{t.dashboards.noWidgets}</p>
          <button
            onClick={() => {
              setEditMode(true);
              setShowAddModal(true);
            }}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition"
          >
            {t.dashboards.addFirstWidget}
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
            <h3 className="text-lg font-semibold text-white mb-4">{t.dashboards.addWidget}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { type: 'chart', label: t.dashboards.chart, desc: t.dashboards.chartDesc },
                { type: 'kpi', label: t.dashboards.kpiCard, desc: t.dashboards.kpiCardDesc },
                { type: 'table', label: t.dashboards.table, desc: t.dashboards.tableDesc },
                { type: 'text', label: t.dashboards.text, desc: t.dashboards.textDesc },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => {
                    // TODO: Open widget configuration
                    setShowAddModal(false);
                  }}
                  className="text-start p-4 rounded-lg border border-zinc-700 hover:border-blue-500 hover:bg-blue-500/5 transition"
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
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
