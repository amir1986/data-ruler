'use client';

import React from 'react';
import { ChartFactory } from '@/components/charts/chart-factory';
import { BarChart3, Hash, Type, Table2, GripVertical, X, Settings } from 'lucide-react';
import type { Widget } from '@/stores/dashboard-store';

interface WidgetRendererProps {
  widget: Widget;
  editMode?: boolean;
  onRemove?: () => void;
  onConfigure?: () => void;
  onFilter?: (params: unknown) => void;
}

function KPICard({ widget }: { widget: Widget }) {
  const value = widget.config.value as string | number;
  const label = widget.config.label as string;
  const change = widget.config.change as number | undefined;
  const prefix = widget.config.prefix as string | undefined;
  const suffix = widget.config.suffix as string | undefined;

  return (
    <div className="flex flex-col justify-center h-full p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label || widget.title}</p>
      <p className="text-3xl font-bold text-white">
        {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
      </p>
      {change !== undefined && (
        <p className={`text-sm mt-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? '+' : ''}{change}%
        </p>
      )}
    </div>
  );
}

function TextBlock({ widget }: { widget: Widget }) {
  return (
    <div className="p-4 h-full overflow-auto">
      <div className="prose prose-sm prose-invert max-w-none">
        {(widget.config.text as string) || widget.title}
      </div>
    </div>
  );
}

function DataTable({ widget }: { widget: Widget }) {
  const columns = (widget.config.columns as string[]) || [];
  const rows = (widget.config.rows as Record<string, unknown>[]) || [];

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-900">
          <tr>
            {columns.map((col) => (
              <th key={col} className="text-left px-3 py-2 text-xs text-zinc-400 font-medium border-b border-zinc-800">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-zinc-800/30">
              {columns.map((col) => (
                <td key={col} className="px-3 py-1.5 text-zinc-300 border-b border-zinc-800/50">
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WidgetRenderer({ widget, editMode, onRemove, onConfigure, onFilter }: WidgetRendererProps) {
  const renderContent = () => {
    switch (widget.type) {
      case 'chart':
        return (
          <ChartFactory
            type={widget.chart_type || 'bar'}
            data={widget.config.data as Record<string, unknown> || { labels: [], values: [] }}
            title={undefined}
            height={300}
            onFilter={onFilter}
          />
        );
      case 'kpi':
        return <KPICard widget={widget} />;
      case 'text':
        return <TextBlock widget={widget} />;
      case 'table':
        return <DataTable widget={widget} />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-zinc-500">
            <BarChart3 className="w-8 h-8" />
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      {/* Widget Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 flex-shrink-0">
        {editMode && (
          <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab" />
        )}
        <span className="text-xs font-medium text-zinc-300 flex-1 truncate">
          {widget.title}
        </span>
        {editMode && (
          <div className="flex items-center gap-1">
            <button
              onClick={onConfigure}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Widget Content */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}
