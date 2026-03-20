'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Responsive, WidthProvider } from 'react-grid-layout';
import ReactEChartsCore from 'echarts-for-react';
import { useDashboardStore, type Widget, type Dashboard } from '@/stores/dashboard-store';
import { useFileStore } from '@/stores/file-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Edit3,
  Eye,
  Plus,
  Trash2,
  Download,
  GripVertical,
  BarChart3,
  LineChart,
  PieChart,
  TableIcon,
  Type,
  TrendingUp,
  Save,
} from 'lucide-react';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// --- Chart config builder ---
function buildChartOption(widget: Widget): Record<string, unknown> {
  const chartType = widget.chart_type || 'bar';
  const config = widget.config || {};
  const data = (config.data as unknown[]) || [];
  const labels = (config.labels as string[]) || [];

  const baseOption = {
    backgroundColor: 'transparent',
    textStyle: { color: '#a1a1aa' },
    tooltip: { trigger: 'axis' as const, backgroundColor: '#27272a', borderColor: '#3f3f46' },
    grid: { top: 40, right: 20, bottom: 40, left: 50 },
  };

  switch (chartType) {
    case 'line':
      return {
        ...baseOption,
        xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#3f3f46' } } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#3f3f46' } }, splitLine: { lineStyle: { color: '#27272a' } } },
        series: [{ type: 'line', data, smooth: true, lineStyle: { color: '#3b82f6' }, itemStyle: { color: '#3b82f6' }, areaStyle: { color: 'rgba(59,130,246,0.1)' } }],
      };
    case 'pie':
      return {
        ...baseOption,
        tooltip: { trigger: 'item' as const },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: labels.map((name, i) => ({ name, value: (data as number[])[i] || 0 })),
          label: { color: '#a1a1aa' },
          itemStyle: { borderColor: '#18181b', borderWidth: 2 },
        }],
      };
    case 'scatter':
      return {
        ...baseOption,
        xAxis: { type: 'value', axisLine: { lineStyle: { color: '#3f3f46' } }, splitLine: { lineStyle: { color: '#27272a' } } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#3f3f46' } }, splitLine: { lineStyle: { color: '#27272a' } } },
        series: [{ type: 'scatter', data, itemStyle: { color: '#3b82f6' } }],
      };
    case 'bar':
    default:
      return {
        ...baseOption,
        xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#3f3f46' } }, axisLabel: { color: '#71717a' } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#3f3f46' } }, splitLine: { lineStyle: { color: '#27272a' } } },
        series: [{ type: 'bar', data, itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } }],
      };
  }
}

// Widget types for the add modal
const widgetTypes = [
  { value: 'chart', label: 'Chart', icon: BarChart3, description: 'Bar, line, pie, or scatter chart' },
  { value: 'table', label: 'Table', icon: TableIcon, description: 'Tabular data display' },
  { value: 'kpi', label: 'KPI Card', icon: TrendingUp, description: 'Key performance indicator' },
  { value: 'text', label: 'Text', icon: Type, description: 'Markdown text block' },
] as const;

const chartTypes = [
  { value: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { value: 'line', label: 'Line Chart', icon: LineChart },
  { value: 'pie', label: 'Pie Chart', icon: PieChart },
  { value: 'scatter', label: 'Scatter Plot', icon: BarChart3 },
];

export default function DashboardBuilderPage() {
  const params = useParams();
  const dashboardId = params.id as string;

  const {
    activeDashboard,
    editMode,
    setEditMode,
    fetchDashboard,
    updateDashboard,
    addWidget,
    removeWidget,
    updateWidget,
  } = useDashboardStore();
  const { files, fetchFiles } = useFileStore();

  const [titleEditing, setTitleEditing] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [newWidgetType, setNewWidgetType] = useState<Widget['type']>('chart');
  const [newChartType, setNewChartType] = useState('bar');
  const [newWidgetTitle, setNewWidgetTitle] = useState('');
  const [newWidgetFileId, setNewWidgetFileId] = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchDashboard(dashboardId);
    fetchFiles();
  }, [dashboardId, fetchDashboard, fetchFiles]);

  useEffect(() => {
    if (activeDashboard) {
      setTitleValue(activeDashboard.title);
    }
  }, [activeDashboard]);

  // Debounced auto-save for layout changes
  const debouncedSave = useCallback(
    (updates: Partial<Dashboard>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        updateDashboard(dashboardId, updates);
      }, 1000);
    },
    [dashboardId, updateDashboard]
  );

  const handleLayoutChange = useCallback(
    (layout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
      if (!editMode || !activeDashboard) return;
      // Update widget layouts
      layout.forEach((item) => {
        const widget = activeDashboard.widgets.find((w) => w.id === item.i);
        if (widget) {
          const newLayout = { x: item.x, y: item.y, w: item.w, h: item.h };
          if (
            widget.layout.x !== newLayout.x ||
            widget.layout.y !== newLayout.y ||
            widget.layout.w !== newLayout.w ||
            widget.layout.h !== newLayout.h
          ) {
            updateWidget(dashboardId, widget.id, { layout: newLayout });
          }
        }
      });
    },
    [editMode, activeDashboard, dashboardId, updateWidget]
  );

  const handleTitleSave = () => {
    setTitleEditing(false);
    if (titleValue.trim() && titleValue !== activeDashboard?.title) {
      updateDashboard(dashboardId, { title: titleValue.trim() });
    }
  };

  const handleAddWidget = async () => {
    const widgetCount = activeDashboard?.widgets.length || 0;
    const newWidget: Omit<Widget, 'id'> = {
      type: newWidgetType,
      chart_type: newWidgetType === 'chart' ? newChartType : undefined,
      title: newWidgetTitle || `Widget ${widgetCount + 1}`,
      config: {},
      file_id: newWidgetFileId || undefined,
      layout: {
        x: (widgetCount * 4) % 12,
        y: Math.floor((widgetCount * 4) / 12) * 4,
        w: 4,
        h: 3,
      },
    };
    await addWidget(dashboardId, newWidget);
    setShowAddWidget(false);
    setNewWidgetTitle('');
    setNewWidgetFileId('');
    setNewChartType('bar');
    setNewWidgetType('chart');
  };

  const handleExport = () => {
    if (!activeDashboard) return;
    const data = JSON.stringify(activeDashboard, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDashboard.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!activeDashboard) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64 bg-zinc-800" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 bg-zinc-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const gridLayouts = {
    lg: activeDashboard.widgets.map((w) => ({
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
      minW: 2,
      minH: 2,
    })),
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="border-b border-zinc-800 px-6 py-3 flex items-center gap-4">
        {titleEditing ? (
          <Input
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
            className="text-lg font-bold bg-zinc-800 border-zinc-700 text-white max-w-sm"
            autoFocus
          />
        ) : (
          <h1
            className="text-xl font-bold text-white cursor-pointer hover:text-zinc-300 transition-colors"
            onClick={() => editMode && setTitleEditing(true)}
          >
            {activeDashboard.title}
          </h1>
        )}

        {activeDashboard.is_auto_generated && (
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
            Auto-generated
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={editMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditMode(!editMode)}
            className={
              editMode
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'border-zinc-700 text-zinc-300 hover:text-white'
            }
          >
            {editMode ? (
              <>
                <Eye className="h-4 w-4 mr-1.5" />
                Preview
              </>
            ) : (
              <>
                <Edit3 className="h-4 w-4 mr-1.5" />
                Edit
              </>
            )}
          </Button>

          {editMode && (
            <Button
              size="sm"
              onClick={() => setShowAddWidget(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Widget
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="border-zinc-700 text-zinc-300 hover:text-white"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Widget grid */}
      <div className="flex-1 overflow-auto p-6">
        {activeDashboard.widgets.length === 0 ? (
          <div className="text-center py-16">
            <BarChart3 className="h-12 w-12 mx-auto text-zinc-600 mb-3" />
            <p className="text-zinc-400 font-medium">No widgets yet</p>
            <p className="text-zinc-500 text-sm mt-1">
              Switch to edit mode and add widgets to build your dashboard
            </p>
            {!editMode && (
              <Button
                onClick={() => setEditMode(true)}
                className="mt-4 bg-blue-600 hover:bg-blue-500 text-white"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Start Editing
              </Button>
            )}
          </div>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layouts={gridLayouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={80}
            isDraggable={editMode}
            isResizable={editMode}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".drag-handle"
          >
            {activeDashboard.widgets.map((widget) => (
              <div
                key={widget.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
              >
                {/* Widget header */}
                <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
                  {editMode && (
                    <GripVertical className="drag-handle h-4 w-4 text-zinc-600 cursor-grab" />
                  )}
                  <span className="text-sm font-medium text-white flex-1 truncate">
                    {widget.title}
                  </span>
                  {editMode && (
                    <button
                      onClick={() => removeWidget(dashboardId, widget.id)}
                      className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Widget body */}
                <div className="p-2 h-[calc(100%-40px)]">
                  {widget.type === 'chart' && (
                    <ReactEChartsCore
                      option={buildChartOption(widget)}
                      style={{ width: '100%', height: '100%' }}
                      opts={{ renderer: 'canvas' }}
                      theme="dark"
                    />
                  )}
                  {widget.type === 'kpi' && (
                    <div className="flex h-full flex-col items-center justify-center">
                      <p className="text-3xl font-bold text-white">
                        {(widget.config.value as string) || '--'}
                      </p>
                      <p className="text-sm text-zinc-400 mt-1">
                        {(widget.config.subtitle as string) || widget.title}
                      </p>
                      {(widget.config.change as number) !== undefined && (
                        <span
                          className={`text-sm mt-2 ${
                            (widget.config.change as number) >= 0
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}
                        >
                          {(widget.config.change as number) >= 0 ? '+' : ''}
                          {widget.config.change as number}%
                        </span>
                      )}
                    </div>
                  )}
                  {widget.type === 'table' && (
                    <div className="h-full overflow-auto text-sm text-zinc-300">
                      {(widget.config.rows as unknown[][]) ? (
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              {((widget.config.columns as string[]) || []).map((col, i) => (
                                <th
                                  key={i}
                                  className="px-3 py-2 text-left text-xs text-zinc-500 font-medium"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {((widget.config.rows as unknown[][]) || []).map((row, ri) => (
                              <tr key={ri} className="border-b border-zinc-800/50">
                                {(row as unknown[]).map((cell, ci) => (
                                  <td key={ci} className="px-3 py-1.5">
                                    {String(cell)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-zinc-500 text-center mt-8">No data configured</p>
                      )}
                    </div>
                  )}
                  {widget.type === 'text' && (
                    <div className="p-2 text-sm text-zinc-300 prose prose-invert prose-sm max-w-none">
                      {(widget.config.content as string) || 'No content'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>

      {/* Add Widget Modal */}
      <Dialog open={showAddWidget} onOpenChange={setShowAddWidget}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add Widget</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Choose a widget type and configure its data source
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Widget type */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Widget Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {widgetTypes.map((wt) => (
                  <button
                    key={wt.value}
                    onClick={() => setNewWidgetType(wt.value as Widget['type'])}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                      newWidgetType === wt.value
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <wt.icon className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{wt.label}</p>
                      <p className="text-xs text-zinc-500">{wt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chart type (only for charts) */}
            {newWidgetType === 'chart' && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Chart Type
                </label>
                <Select value={newChartType} onValueChange={setNewChartType}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {chartTypes.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>
                        <span className="flex items-center gap-2">
                          <ct.icon className="h-4 w-4" />
                          {ct.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Title
              </label>
              <Input
                value={newWidgetTitle}
                onChange={(e) => setNewWidgetTitle(e.target.value)}
                placeholder="Widget title"
                className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500"
              />
            </div>

            {/* Data source (file) */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Data Source (optional)
              </label>
              <Select value={newWidgetFileId} onValueChange={setNewWidgetFileId}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select a file..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="none">No file</SelectItem>
                  {files.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.original_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddWidget(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddWidget}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              Add Widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
