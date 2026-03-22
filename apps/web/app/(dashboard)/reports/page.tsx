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
import { useLanguageStore } from '@/stores/language-store';
import { format } from 'date-fns';
import { safeFormatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import ReportViewer from '@/components/reports/report-viewer';

function getStatusStyle(status: string) {
  const styles: Record<string, string> = {
    draft: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    generating: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    ready: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    error: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  return styles[status] || styles.draft;
}

export default function ReportsPage() {
  const { t } = useLanguageStore();

  const reportTemplates = [
    {
      id: 'executive_summary',
      title: t.reports.executiveSummary,
      description: t.reports.executiveSummaryDesc,
      icon: FileText,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
    },
    {
      id: 'data_deep_dive',
      title: t.reports.dataDeepDive,
      description: t.reports.dataDeepDiveDesc,
      icon: BarChart3,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
    },
    {
      id: 'monthly_report',
      title: t.reports.monthlyReport,
      description: t.reports.monthlyReportDesc,
      icon: Calendar,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
    },
    {
      id: 'comparison_report',
      title: t.reports.comparisonReport,
      description: t.reports.comparisonReportDesc,
      icon: GitCompare,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/30',
    },
    {
      id: 'quick_brief',
      title: t.reports.quickBrief,
      description: t.reports.quickBriefDesc,
      icon: Zap,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
    },
  ];

  function getTemplateInfo(templateId: string) {
    return reportTemplates.find((tmpl) => tmpl.id === templateId) || reportTemplates[0];
  }

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
    await updateReport(report.id, {
      status: 'generating',
    } as Partial<Report>);

    try {
      const res = await fetch(`/api/reports/${report.id}/generate`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        await fetchReports();
        if (activeReport?.id === report.id) {
          setActiveReport(data.report);
        }
      } else {
        await updateReport(report.id, { status: 'error' } as Partial<Report>);
      }
    } catch {
      await updateReport(report.id, { status: 'error' } as Partial<Report>);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm(t.reports.deleteReport)) {
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
      <div className="px-6 pt-5 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{t.reports.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.reports.subtitle}
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2"
        >
          <Plus className="h-4 w-4" />
          {t.reports.newReport}
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.reports.searchReports}
              className="ps-9 bg-card border-border text-white placeholder-muted-foreground"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] bg-card border-border text-zinc-300">
              <SelectValue placeholder={t.reports.statusLabel} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">{t.reports.allStatuses}</SelectItem>
              <SelectItem value="draft">{t.reports.draft}</SelectItem>
              <SelectItem value="generating">{t.reports.generating}</SelectItem>
              <SelectItem value="ready">{t.reports.ready}</SelectItem>
              <SelectItem value="error">{t.reports.error}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Report Templates (quick create) */}
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t.reports.quickCreate}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {reportTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  setSelectedTemplate(template.id);
                  setShowCreate(true);
                }}
                className="group rounded-xl border border-border bg-card p-4 text-start hover:border-muted-foreground/30 transition-all hover:shadow-lg"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${template.bgColor} mb-3`}
                >
                  <template.icon className={`h-4 w-4 ${template.color}`} />
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">
                  {template.title}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {template.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Reports List */}
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t.reports.yourReports} ({filteredReports.length})
          </h3>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 bg-card rounded-xl" />
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-16 rounded-xl border border-border bg-card">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">
                {search || filterStatus !== 'all'
                  ? t.reports.noMatchingReports
                  : t.reports.noReportsYet}
              </p>
              <p className="text-muted-foreground/60 text-sm mt-1">
                {search || filterStatus !== 'all'
                  ? t.reports.tryDifferentCriteria
                  : t.reports.createFromTemplate}
              </p>
              {!search && filterStatus === 'all' && (
                <Button
                  onClick={() => setShowCreate(true)}
                  className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t.reports.createFirstReport}
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
                    className="group relative rounded-xl border border-border bg-card p-5 hover:border-muted-foreground/30 transition-colors"
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
                        className={`${getStatusStyle(report.status)} border text-[10px] font-semibold uppercase tracking-wider`}
                      >
                        {report.status === 'generating' && (
                          <RefreshCw className="h-3 w-3 me-1 animate-spin" />
                        )}
                        {report.status}
                      </Badge>
                    </div>

                    <h3 className="text-base font-semibold text-white mb-1 truncate">
                      {report.title}
                    </h3>
                    {report.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {report.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-auto pt-3 border-t border-border">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {template.title}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {safeFormatDate(report.updated_at, 'MMM d, yyyy')}
                      </span>
                    </div>

                    {/* Action buttons on hover */}
                    <div className="absolute top-3 end-12 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {report.status === 'draft' && (
                        <button
                          onClick={() => handleGenerate(report)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                          title={t.reports.generateReport}
                        >
                          <Zap className="h-4 w-4" />
                        </button>
                      )}
                      {report.status === 'ready' && (
                        <button
                          onClick={() => fetchReport(report.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-secondary transition-colors"
                          title={t.reports.viewReport}
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
                      className="absolute top-3 end-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 hover:bg-secondary transition-all"
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
        <DialogContent className="bg-card border-border text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{t.reports.createNewReport}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t.reports.chooseTemplate}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Template selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                {t.reports.template}
              </label>
              <div className="grid grid-cols-1 gap-2">
                {reportTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-start transition-colors ${
                      selectedTemplate === template.id
                        ? `${template.borderColor} ${template.bgColor}`
                        : 'border-border hover:border-muted-foreground/30'
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
                      <p className="text-xs text-muted-foreground truncate">
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
                {t.reports.titleOptional}
              </label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={
                  selectedTemplate
                    ? `${getTemplateInfo(selectedTemplate).title} - ${format(new Date(), 'MMM d, yyyy')}`
                    : t.reports.reportTitlePlaceholder
                }
                className="bg-secondary border-border text-white placeholder-muted-foreground"
              />
            </div>

            {/* File selection */}
            {readyFiles.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">
                  {t.reports.dataSources} ({selectedFileIds.length} {t.reports.dataSourcesSelected})
                </label>
                <div className="max-h-40 overflow-auto rounded-lg border border-border divide-y divide-border">
                  {readyFiles.map((file) => (
                    <label
                      key={file.id}
                      className="flex items-center gap-3 p-2.5 hover:bg-secondary/50 cursor-pointer"
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
                        className="rounded border-border bg-secondary"
                      />
                      <span className="text-sm text-zinc-300 truncate">
                        {file.original_name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="bg-secondary text-muted-foreground text-[10px] ms-auto shrink-0"
                      >
                        {file.file_type}
                      </Badge>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/60">
                  {t.reports.dataSourcesHint}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleCreate}
                disabled={!selectedTemplate}
                className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 gap-2"
              >
                <Plus className="h-4 w-4" />
                {t.reports.createReport}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowCreate(false)}
                className="text-muted-foreground"
              >
                {t.cancel}
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
        <DialogContent className="bg-card border-border text-white max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">
              {activeReport?.title}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {activeReport &&
                `${getTemplateInfo(activeReport.template).title} - ${t.reports.generated} ${safeFormatDate(activeReport.updated_at, 'MMM d, yyyy h:mm a')}`}
            </DialogDescription>
          </DialogHeader>
          {activeReport && activeReport.content && (
            <div className="space-y-4">
              <ReportViewer report={activeReport} />

              {/* Metadata */}
              <div className="border-t border-border pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">
                      {t.reports.template}
                    </p>
                    <p className="text-zinc-200 mt-1">
                      {getTemplateInfo(activeReport.template).title}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">
                      {t.reports.statusLabel}
                    </p>
                    <Badge
                      className={`${getStatusStyle(activeReport.status)} border mt-1 text-[10px] font-semibold uppercase tracking-wider`}
                    >
                      {activeReport.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">
                      {t.reports.dataSources}
                    </p>
                    <p className="text-zinc-200 mt-1">
                      {activeReport.file_ids.length || t.reports.all} {t.reports.files}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">
                      {t.files.created}
                    </p>
                    <p className="text-zinc-200 mt-1">
                      {format(
                        new Date(activeReport.created_at),
                        'MMM d, yyyy h:mm a'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    const content = activeReport.content as Record<string, unknown>;
                    const wb = XLSX.utils.book_new();

                    // Summary sheet
                    const summaryRows = [
                      ['Title', activeReport.title],
                      ['Template', String(content.template || '')],
                      ['Generated', String(content.generated_at || '')],
                      ['Summary', String(content.summary || '')],
                    ];
                    if (content.kpis && Array.isArray(content.kpis)) {
                      summaryRows.push([]);
                      summaryRows.push(['KPI', 'Value', 'Detail']);
                      (content.kpis as { label: string; value: string; sublabel?: string }[]).forEach((kpi) => {
                        summaryRows.push([kpi.label, kpi.value, kpi.sublabel || '']);
                      });
                    }
                    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
                    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

                    // Sections sheet
                    if (content.sections && Array.isArray(content.sections)) {
                      const sectionRows: string[][] = [['Section', 'Content']];
                      (content.sections as { title: string; content: string }[]).forEach((s) => {
                        sectionRows.push([s.title, s.content]);
                      });
                      const sectionsWs = XLSX.utils.aoa_to_sheet(sectionRows);
                      XLSX.utils.book_append_sheet(wb, sectionsWs, 'Sections');
                    }

                    // Files sheet
                    if (content.files && Array.isArray(content.files) && (content.files as unknown[]).length > 0) {
                      const filesWs = XLSX.utils.json_to_sheet(content.files as Record<string, unknown>[]);
                      XLSX.utils.book_append_sheet(wb, filesWs, 'Files');
                    }

                    XLSX.writeFile(wb, `${activeReport.title.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
                  }}
                  variant="outline"
                  className="border-border text-zinc-300"
                >
                  <Download className="h-4 w-4 me-2" />
                  {t.reports.exportJson}
                </Button>
                <Button
                  onClick={() => handleGenerate(activeReport)}
                  variant="outline"
                  className="border-border text-zinc-300"
                >
                  <RefreshCw className="h-4 w-4 me-2" />
                  {t.reports.regenerate}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDelete(activeReport.id);
                    setActiveReport(null);
                  }}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  {t.delete}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
