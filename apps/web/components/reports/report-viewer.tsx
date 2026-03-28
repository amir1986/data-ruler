'use client';

import { type Report } from '@/stores/reports-store';
import { safeDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  BarChart3,
  Calendar,
  GitCompare,
  Zap,
  TrendingUp,
  Database,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowUpDown,
} from 'lucide-react';

interface ReportContent {
  generated_at: string;
  template: string;
  summary: string;
  kpis?: { label: string; value: string; sublabel: string }[];
  sections: { title: string; content: string }[];
  metrics: {
    total_files: number;
    total_size: number;
    total_size_formatted: string;
    total_rows: number;
    total_columns: number;
    avg_quality: number | null;
    min_quality: number | null;
    max_quality: number | null;
    ready_count: number;
    error_count: number;
    pending_count: number;
    processing_rate: number;
    categories: string[];
    file_types: string[];
  };
  files: {
    name: string;
    type: string;
    category: string;
    size: number;
    size_formatted: string;
    rows: number | null;
    reported_rows?: number | null;
    columns: number | null;
    actual_columns?: string[];
    quality: number | null;
    status: string;
    ai_summary: string | null;
    created_at: string;
    verified?: boolean;
    sheets?: { name: string; rows: number; columns: number }[];
  }[];
  // Data verification
  data_verification?: {
    verified: boolean;
    verified_at: string;
    files_verified: number;
    files_total: number;
    discrepancies: { file: string; field: string; reported: string | number | null; actual: string | number | null }[];
    all_accurate: boolean;
  };
  // Template-specific
  quality_breakdown?: { name: string; quality: number }[];
  schema_table?: { name: string; type: string; columns: number | null; rows: number | null; size: string; quality: number | null; column_names?: string[]; sheets?: number }[];
  size_distribution?: { name: string; size: number; size_formatted: string }[];
  category_breakdown?: { category: string; count: number; size: string; rows?: number }[];
  activity_stats?: { total_ingested: number; total_processed: number; total_errors: number; total_pending: number };
  comparison_table?: { name: string; type: string; category: string; size: string; size_bytes: number; rows: number | null; columns: number | null; quality: number | null; status: string }[];
  shared_columns?: string[];
  rankings?: { by_size: string[]; by_quality: string[] };
  ai_insights?: { name: string; insight: string }[];
  file_snapshot?: { name: string; type: string; category: string; size: string; rows: number | null; columns: number | null; column_names?: string[]; quality: number | null; status: string } | null;
}

const templateThemes: Record<string, { accent: string; bg: string; border: string; icon: typeof FileText; label: string }> = {
  executive_summary: { accent: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: FileText, label: 'Executive Summary' },
  data_deep_dive: { accent: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: BarChart3, label: 'Data Deep-Dive' },
  monthly_report: { accent: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: Calendar, label: 'Monthly Report' },
  comparison_report: { accent: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: GitCompare, label: 'Comparison Report' },
  quick_brief: { accent: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: Zap, label: 'Quick Brief' },
};

function QualityBar({ value, className }: { value: number; className?: string }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-end">{value}%</span>
    </div>
  );
}

function KpiCards({ kpis, accentColor }: { kpis: { label: string; value: string; sublabel: string }[]; accentColor: string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map((kpi, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{kpi.label}</p>
          <p className={`text-2xl font-bold ${accentColor}`}>{kpi.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{kpi.sublabel}</p>
        </div>
      ))}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number | null)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-start text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-secondary/50">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-foreground/80 whitespace-nowrap">
                  {cell !== null && cell !== undefined ? String(cell) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
    pending: 'bg-muted text-muted-foreground',
    processing: 'bg-blue-500/20 text-blue-400',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending}`}>{status}</span>;
}

function SectionBlock({ title, content, icon }: { title: string; content: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h3>
      </div>
      <div className="bg-card rounded-lg p-4 border border-border">
        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{content}</p>
      </div>
    </div>
  );
}

function ExecutiveSummaryView({ content, theme }: { content: ReportContent; theme: typeof templateThemes.executive_summary }) {
  return (
    <div className="space-y-5">
      {content.kpis && <KpiCards kpis={content.kpis} accentColor={theme.accent} />}

      <div className={`rounded-lg border ${theme.border} ${theme.bg} p-4`}>
        <p className="text-sm text-foreground/90 leading-relaxed">{content.summary}</p>
      </div>

      {content.sections.map((section, idx) => (
        <SectionBlock
          key={idx}
          title={section.title}
          content={section.content}
          icon={
            idx === 0 ? <Layers className={`h-4 w-4 ${theme.accent}`} /> :
            idx === 1 ? <TrendingUp className={`h-4 w-4 ${theme.accent}`} /> :
            idx === 2 ? <CheckCircle2 className={`h-4 w-4 ${theme.accent}`} /> :
            <AlertTriangle className={`h-4 w-4 ${theme.accent}`} />
          }
        />
      ))}

      {content.quality_breakdown && content.quality_breakdown.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Quality by File</h3>
          <div className="space-y-2">
            {content.quality_breakdown.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-48 truncate">{item.name}</span>
                <QualityBar value={item.quality} className="flex-1" />
              </div>
            ))}
          </div>
        </div>
      )}

      {content.files.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Data Sources</h3>
          <DataTable
            headers={['File', 'Type', 'Size', 'Rows', 'Quality', 'Status', 'Verified']}
            rows={content.files.map(f => [f.name, f.type, f.size_formatted, f.rows?.toLocaleString() ?? null, f.quality !== null ? `${f.quality}%` : null, f.status, f.verified ? '✓' : '—'])}
          />
        </div>
      )}
    </div>
  );
}

function DataDeepDiveView({ content, theme }: { content: ReportContent; theme: typeof templateThemes.data_deep_dive }) {
  return (
    <div className="space-y-5">
      {content.kpis && <KpiCards kpis={content.kpis} accentColor={theme.accent} />}

      <div className={`rounded-lg border ${theme.border} ${theme.bg} p-4`}>
        <p className="text-sm text-foreground/90 leading-relaxed">{content.summary}</p>
      </div>

      {content.schema_table && content.schema_table.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Database className={`h-4 w-4 ${theme.accent}`} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Schema Analysis</h3>
          </div>
          <DataTable
            headers={['Dataset', 'Format', 'Columns', 'Rows', 'Size', 'Quality']}
            rows={content.schema_table.map(f => [f.name, f.type, f.columns, f.rows?.toLocaleString() ?? null, f.size, f.quality !== null ? `${f.quality}%` : null])}
          />
        </div>
      )}

      {content.size_distribution && content.size_distribution.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className={`h-4 w-4 ${theme.accent}`} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Size Distribution</h3>
          </div>
          <div className="space-y-2">
            {content.size_distribution.map((item, i) => {
              const sizes = content.size_distribution!.map(s => s.size);
              const maxSize = sizes.length > 0 ? Math.max(...sizes) : 0;
              const pct = maxSize > 0 ? Math.round((item.size / maxSize) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-48 truncate">{item.name}</span>
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-end">{item.size_formatted}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {content.sections.filter(s => s.title !== 'Dataset Overview' && s.title !== 'Schema Analysis').map((section, idx) => (
        <SectionBlock key={idx} title={section.title} content={section.content} />
      ))}
    </div>
  );
}

function MonthlyReportView({ content, theme }: { content: ReportContent; theme: typeof templateThemes.monthly_report }) {
  return (
    <div className="space-y-5">
      {content.kpis && <KpiCards kpis={content.kpis} accentColor={theme.accent} />}

      <div className={`rounded-lg border ${theme.border} ${theme.bg} p-4`}>
        <p className="text-sm text-foreground/90 leading-relaxed">{content.summary}</p>
      </div>

      {content.activity_stats && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className={`h-4 w-4 ${theme.accent}`} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Processing Pipeline</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Ingested', value: content.activity_stats.total_ingested, color: 'text-blue-400' },
              { label: 'Processed', value: content.activity_stats.total_processed, color: 'text-green-400' },
              { label: 'Errors', value: content.activity_stats.total_errors, color: 'text-red-400' },
              { label: 'Pending', value: content.activity_stats.total_pending, color: 'text-yellow-400' },
            ].map((stat, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.category_breakdown && content.category_breakdown.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers className={`h-4 w-4 ${theme.accent}`} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Category Breakdown</h3>
          </div>
          <DataTable
            headers={['Category', 'Files', 'Size']}
            rows={content.category_breakdown.map(c => [c.category, c.count, c.size])}
          />
        </div>
      )}

      {content.sections.filter(s => s.title !== 'Category Breakdown').map((section, idx) => (
        <SectionBlock key={idx} title={section.title} content={section.content} />
      ))}

      {content.files.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Files This Period</h3>
          <DataTable
            headers={['File', 'Type', 'Category', 'Size', 'Status']}
            rows={content.files.map(f => [f.name, f.type, f.category, f.size_formatted, f.status])}
          />
        </div>
      )}
    </div>
  );
}

function ComparisonReportView({ content, theme }: { content: ReportContent; theme: typeof templateThemes.comparison_report }) {
  return (
    <div className="space-y-5">
      {content.kpis && <KpiCards kpis={content.kpis} accentColor={theme.accent} />}

      <div className={`rounded-lg border ${theme.border} ${theme.bg} p-4`}>
        <p className="text-sm text-foreground/90 leading-relaxed">{content.summary}</p>
      </div>

      {content.comparison_table && content.comparison_table.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpDown className={`h-4 w-4 ${theme.accent}`} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Dataset Comparison</h3>
          </div>
          <DataTable
            headers={['Dataset', 'Format', 'Category', 'Size', 'Rows', 'Columns', 'Quality', 'Status']}
            rows={content.comparison_table.map(f => [f.name, f.type, f.category, f.size, f.rows?.toLocaleString() ?? null, f.columns, f.quality !== null ? `${f.quality}%` : null, f.status])}
          />
        </div>
      )}

      {content.comparison_table && content.comparison_table.filter(f => f.quality !== null).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className={`h-4 w-4 ${theme.accent}`} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Quality Comparison</h3>
          </div>
          <div className="space-y-2">
            {content.comparison_table.filter(f => f.quality !== null).map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-48 truncate">{item.name}</span>
                <QualityBar value={item.quality!} className="flex-1" />
              </div>
            ))}
          </div>
        </div>
      )}

      {content.rankings && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {content.rankings.by_size.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ranked by Size</h4>
              <ol className="space-y-1">
                {content.rankings.by_size.map((name, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold ${i === 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-secondary text-muted-foreground'}`}>{i + 1}</span>
                    <span className="text-foreground/80 truncate">{name}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {content.rankings.by_quality.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ranked by Quality</h4>
              <ol className="space-y-1">
                {content.rankings.by_quality.map((name, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold ${i === 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-secondary text-muted-foreground'}`}>{i + 1}</span>
                    <span className="text-foreground/80 truncate">{name}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {content.sections.filter(s => s.title !== 'Schema Comparison' && s.title !== 'Quality Comparison').map((section, idx) => (
        <SectionBlock key={idx} title={section.title} content={section.content} />
      ))}
    </div>
  );
}

function QuickBriefView({ content, theme }: { content: ReportContent; theme: typeof templateThemes.quick_brief }) {
  return (
    <div className="space-y-5">
      {content.kpis && <KpiCards kpis={content.kpis} accentColor={theme.accent} />}

      <div className={`rounded-lg border ${theme.border} ${theme.bg} p-4`}>
        <p className="text-sm text-foreground/90 leading-relaxed">{content.summary}</p>
      </div>

      {content.file_snapshot && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className={`h-4 w-4 ${theme.accent}`} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Primary File</h3>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm text-foreground font-medium truncate">{content.file_snapshot.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Format</p>
                <p className="text-sm text-foreground">{content.file_snapshot.type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Size</p>
                <p className="text-sm text-foreground">{content.file_snapshot.size}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <StatusBadge status={content.file_snapshot.status} />
              </div>
              {content.file_snapshot.rows !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">Rows</p>
                  <p className="text-sm text-foreground">{content.file_snapshot.rows.toLocaleString()}</p>
                </div>
              )}
              {content.file_snapshot.columns !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">Columns</p>
                  <p className="text-sm text-foreground">{content.file_snapshot.columns}</p>
                </div>
              )}
              {content.file_snapshot.quality !== null && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Quality</p>
                  <QualityBar value={content.file_snapshot.quality} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {content.ai_insights && content.ai_insights.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className={`h-4 w-4 ${theme.accent}`} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">AI Insights</h3>
          </div>
          <div className="space-y-2">
            {content.ai_insights.map((insight, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs font-medium text-yellow-400 mb-1">{insight.name}</p>
                <p className="text-sm text-foreground/80">{insight.insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.sections.filter(s => s.title !== 'AI Insights').map((section, idx) => (
        <SectionBlock key={idx} title={section.title} content={section.content} />
      ))}

      {content.files.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">All Files</h3>
          <DataTable
            headers={['File', 'Type', 'Size', 'Quality']}
            rows={content.files.map(f => [f.name, f.type, f.size_formatted, f.quality !== null ? `${f.quality}%` : null])}
          />
        </div>
      )}
    </div>
  );
}

export default function ReportViewer({ report }: { report: Report }) {
  const content = report.content as unknown as ReportContent;
  if (!content || !content.template) return null;

  const theme = templateThemes[content.template] || templateThemes.executive_summary;
  const TemplateIcon = theme.icon;

  return (
    <div className="space-y-5">
      {/* Template header badge */}
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${theme.bg}`}>
          <TemplateIcon className={`h-3.5 w-3.5 ${theme.accent}`} />
        </div>
        <Badge className={`${theme.bg} ${theme.accent} ${theme.border} border text-xs`}>
          {theme.label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Generated {safeDate(content.generated_at)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? '—'}
        </span>
      </div>

      {/* Data Verification Badge */}
      {content.data_verification && (
        <div className={`rounded-lg border p-3 flex items-center gap-3 ${
          content.data_verification.all_accurate
            ? 'border-green-500/30 bg-green-500/10'
            : 'border-yellow-500/30 bg-yellow-500/10'
        }`}>
          {content.data_verification.all_accurate ? (
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${content.data_verification.all_accurate ? 'text-green-300' : 'text-yellow-300'}`}>
              {content.data_verification.all_accurate
                ? `All data verified — ${content.data_verification.files_verified}/${content.data_verification.files_total} files checked against actual data`
                : `${content.data_verification.discrepancies.length} discrepanc${content.data_verification.discrepancies.length === 1 ? 'y' : 'ies'} found in ${content.data_verification.files_verified} verified files`
              }
            </p>
            {content.data_verification.discrepancies.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {content.data_verification.discrepancies.map((d, i) => (
                  <p key={i} className="text-xs text-yellow-400/80">
                    {d.file}: {d.field} — reported {d.reported ?? 'N/A'}, actual {d.actual ?? 'N/A'}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template-specific view */}
      {content.template === 'executive_summary' && <ExecutiveSummaryView content={content} theme={theme} />}
      {content.template === 'data_deep_dive' && <DataDeepDiveView content={content} theme={theme} />}
      {content.template === 'monthly_report' && <MonthlyReportView content={content} theme={theme} />}
      {content.template === 'comparison_report' && <ComparisonReportView content={content} theme={theme} />}
      {content.template === 'quick_brief' && <QuickBriefView content={content} theme={theme} />}
    </div>
  );
}
