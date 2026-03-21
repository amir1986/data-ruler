'use client';

import { useEffect, useState } from 'react';
import { useReportsStore, type Report } from '@/stores/reports-store';
import { useFileStore } from '@/stores/file-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  BarChart3,
  Calendar,
  GitCompare,
  Zap,
  Clock,
  Plus,
  Trash2,
  Eye,
  Search,
  Download,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import ReportViewer from '@/components/reports/report-viewer';

const reportTemplates = [
  {
    id: 'executive_summary',
    title: 'Executive Summary',
    description:
      'High-level overview of data quality metrics, key insights, and actionable recommendations for stakeholders.',
    icon: FileText,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  {
    id: 'data_deep_dive',
    title: 'Data Deep-Dive',
    description:
      'Comprehensive analysis of dataset structure, distributions, anomalies, and detailed profiling results.',
    icon: BarChart3,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  {
    id: 'monthly_report',
    title: 'Monthly Report',
    description:
      'Periodic summary of data ingestion, quality trends, processing activity, and month-over-month changes.',
    icon: Calendar,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  {
    id: 'comparison_report',
    title: 'Comparison Report',
    description:
      'Side-by-side comparison of multiple datasets or time periods, highlighting differences and correlations.',
    icon: GitCompare,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  {
    id: 'quick_brief',
    title: 'Quick Brief',
    description:
      'Auto-generated one-page summary of a single dataset with key statistics and AI-powered insights.',
    icon: Zap,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
  },
];

function getTemplateInfo(templateId: string) {
  return reportTemplates.find((t) => t.id === templateId) || reportTemplates[0];
}

function getStatusStyle(status: string) {
  const styles: Record<string, string> = {
    draft: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    generating: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    ready: 'bg-green-500/20 text-green-400 border-green-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return styles[status] || styles.draft;
}

export default function ReportsPage() {
  const {
    reports,
    activeReport,
    loading,
    fetchReports,
    createReport,
    updateReport,
    deleteReport,
    setActiveReport,
    fetchReport,
  } = useReportsStore();
  const { files, fetchFiles } = useFileStore();

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchReports();
    fetchFiles();
  }, [fetchReports, fetchFiles]);

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    const template = getTemplateInfo(selectedTemplate);
    const title = newTitle || `${template.title} - ${format(new Date(), 'MMM d, yyyy')}`;
    const report = await createReport(selectedTemplate, title, selectedFileIds);
    if (report) {
      setActiveReport(report);
      setShowCreate(false);
      setSelectedTemplate(null);
      setNewTitle('');
      setSelectedFileIds([]);
    }
  };

  const handleGenerate = async (report: Report) => {
    // Optimistically set status to generating
    await updateReport(report.id, {
      status: 'generating',
    } as Partial<Report>);

    try {
      const res = await fetch(`/api/reports/${report.id}/generate`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        // Refresh the reports list to get updated content
        await fetchReports();
        // If viewing this report, update the active view
        if (activeReport?.id === report.id) {
          setActiveReport(data.report);
        }
      } else {
        // API returned error, set error status
        await updateReport(report.id, { status: 'error' } as Partial<Report>);
      }
    } catch {
      await updateReport(report.id, { status: 'error' } as Partial<Report>);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this report?')) {
      await deleteReport(id);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.title.toLowerCase().includes(q) &&
        !(r.description || '').toLowerCase().includes(q)
      )
        return false;
    }
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    return true;
  });

  const readyFiles = files.filter((f) => f.processing_status === 'ready');

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Generate professional reports from your data analysis
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Report
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports..."
              className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-300">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="generating">Generating</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Report Templates (quick create) */}
        <div>
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Quick Create from Template
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {reportTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  setSelectedTemplate(template.id);
                  setShowCreate(true);
                }}
                className={`group rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-zinc-700 transition-all hover:shadow-lg`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${template.bgColor} mb-3`}
                >
                  <template.icon className={`h-4 w-4 ${template.color}`} />
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">
                  {template.title}
                </h4>
                <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                  {template.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Reports List */}
        <div>
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Your Reports ({filteredReports.length})
          </h3>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 bg-zinc-800 rounded-xl" />
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-16 rounded-xl border border-zinc-800 bg-zinc-900">
              <FileText className="h-12 w-12 mx-auto text-zinc-600 mb-3" />
              <p className="text-zinc-400 font-medium">
                {search || filterStatus !== 'all'
                  ? 'No matching reports'
                  : 'No reports yet'}
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {search || filterStatus !== 'all'
                  ? 'Try different search or filter criteria'
                  : 'Create a report using one of the templates above'}
              </p>
              {!search && filterStatus === 'all' && (
                <Button
                  onClick={() => setShowCreate(true)}
                  className="mt-4 bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Report
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReports.map((report) => {
                const template = getTemplateInfo(report.template);
                const TemplateIcon = template.icon;
                return (
                  <div
                    key={report.id}
                    className="group relative rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${template.bgColor}`}
                      >
                        <TemplateIcon
                          className={`h-5 w-5 ${template.color}`}
                        />
                      </div>
                      <Badge
                        className={`${getStatusStyle(report.status)} border`}
                      >
                        {report.status === 'generating' && (
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        )}
                        {report.status}
                      </Badge>
                    </div>

                    <h3 className="text-base font-semibold text-white mb-1 truncate">
                      {report.title}
                    </h3>
                    {report.description && (
                      <p className="text-sm text-zinc-400 line-clamp-2 mb-3">
                        {report.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-zinc-500 mt-auto pt-3 border-t border-zinc-800">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {template.title}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(report.updated_at), 'MMM d, yyyy')}
                      </span>
                    </div>

                    {/* Action buttons on hover */}
                    <div className="absolute top-3 right-12 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {report.status === 'draft' && (
                        <button
                          onClick={() => handleGenerate(report)}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-colors"
                          title="Generate report"
                        >
                          <Zap className="h-4 w-4" />
                        </button>
                      )}
                      {report.status === 'ready' && (
                        <button
                          onClick={() => fetchReport(report.id)}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-green-400 hover:bg-zinc-800 transition-colors"
                          title="View report"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(report.id);
                      }}
                      className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    {/* Click to view/generate */}
                    <button
                      className="absolute inset-0 rounded-xl"
                      onClick={() => {
                        if (report.status === 'ready') {
                          fetchReport(report.id);
                        } else if (report.status === 'draft') {
                          handleGenerate(report);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Report Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Report</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Choose a template and data sources for your report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Template selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                Template
              </label>
              <div className="grid grid-cols-1 gap-2">
                {reportTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selectedTemplate === template.id
                        ? `${template.borderColor} ${template.bgColor}`
                        : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${template.bgColor}`}
                    >
                      <template.icon
                        className={`h-4 w-4 ${template.color}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {template.title}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {template.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                Title (optional)
              </label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={
                  selectedTemplate
                    ? `${getTemplateInfo(selectedTemplate).title} - ${format(new Date(), 'MMM d, yyyy')}`
                    : 'Report title...'
                }
                className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500"
              />
            </div>

            {/* File selection */}
            {readyFiles.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">
                  Data Sources ({selectedFileIds.length} selected)
                </label>
                <div className="max-h-40 overflow-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                  {readyFiles.map((file) => (
                    <label
                      key={file.id}
                      className="flex items-center gap-3 p-2.5 hover:bg-zinc-800/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFileIds.includes(file.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFileIds([...selectedFileIds, file.id]);
                          } else {
                            setSelectedFileIds(
                              selectedFileIds.filter((id) => id !== file.id)
                            );
                          }
                        }}
                        className="rounded border-zinc-600 bg-zinc-800"
                      />
                      <span className="text-sm text-zinc-300 truncate">
                        {file.original_name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="bg-zinc-800 text-zinc-400 text-[10px] ml-auto shrink-0"
                      >
                        {file.file_type}
                      </Badge>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-zinc-600">
                  Select files to include in the analysis. Leave empty to use
                  all available data.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleCreate}
                disabled={!selectedTemplate}
                className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Report
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowCreate(false)}
                className="text-zinc-400"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Report Dialog */}
      <Dialog
        open={!!activeReport}
        onOpenChange={(open) => !open && setActiveReport(null)}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">
              {activeReport?.title}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {activeReport &&
                `Generated ${format(new Date(activeReport.updated_at), 'MMM d, yyyy h:mm a')} · ${activeReport.file_ids.length || 'All'} data source(s)`}
            </DialogDescription>
          </DialogHeader>
          {activeReport && activeReport.content && (
            <div className="space-y-4">
              <ReportViewer report={activeReport} />

              <div className="flex gap-2 pt-3 border-t border-zinc-800">
                <Button
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(activeReport.content, null, 2)],
                      { type: 'application/json' }
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${activeReport.title.replace(/\s+/g, '_').toLowerCase()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export JSON
                </Button>
                <Button
                  onClick={() => handleGenerate(activeReport)}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDelete(activeReport.id);
                    setActiveReport(null);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
