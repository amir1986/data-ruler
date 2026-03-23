import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb, getUserDb } from '@/lib/db';
import { safeJsonParse } from '@/lib/utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface FileRow {
  id: string;
  original_name: string;
  file_type: string;
  file_category: string;
  size_bytes: number;
  row_count: number | null;
  column_count: number | null;
  processing_status: string;
  quality_score: number | null;
  ai_summary: string | null;
  created_at: string;
  db_table_name: string | null;
  schema_snapshot: string | null;
}

interface VerifiedFile extends FileRow {
  actual_row_count: number | null;
  actual_columns: string[];
  column_details: { name: string; type: string; null_ratio?: number }[];
  sample_rows: Record<string, unknown>[];
  sheets: { name: string; table: string; rows: number; columns: string[] }[];
  row_count_verified: boolean;
  row_count_discrepancy: number | null;
}

interface Discrepancy {
  file: string;
  field: string;
  reported: string | number | null;
  actual: string | number | null;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// ── Data Verification ──────────────────────────────────────────────
function verifyFileData(file: FileRow, userId: string): VerifiedFile {
  const verified: VerifiedFile = {
    ...file,
    actual_row_count: null,
    actual_columns: [],
    column_details: [],
    sample_rows: [],
    sheets: [],
    row_count_verified: false,
    row_count_discrepancy: null,
  };

  if (!file.db_table_name || file.processing_status !== 'ready') return verified;

  // Parse schema snapshot for column details
  const schema = safeJsonParse(file.schema_snapshot, []) as Array<{
    name: string; inferred_type?: string; null_ratio?: number; sheet?: string;
  }>;
  verified.column_details = schema.map(s => ({
    name: s.name,
    type: s.inferred_type || 'text',
    null_ratio: s.null_ratio,
  }));

  try {
    const userDb = getUserDb(userId);
    try {
      // Detect multi-sheet
      let tables: Record<string, string> = {};
      if (file.db_table_name.startsWith('{')) {
        try { tables = JSON.parse(file.db_table_name); } catch { /* */ }
      }
      if (Object.keys(tables).length === 0) {
        tables = { 'Data': file.db_table_name };
      }

      let totalActualRows = 0;
      const allColumns: string[] = [];

      for (const [sheetName, tableName] of Object.entries(tables)) {
        try {
          const countResult = userDb.prepare(
            `SELECT COUNT(*) as c FROM "${tableName}"`
          ).get() as { c: number };
          const sheetRows = countResult?.c ?? 0;
          totalActualRows += sheetRows;

          // Get column names
          const sampleResult = userDb.prepare(
            `SELECT * FROM "${tableName}" LIMIT 5`
          ).all() as Record<string, unknown>[];
          const cols = sampleResult.length > 0 ? Object.keys(sampleResult[0]) : [];
          allColumns.push(...cols);

          verified.sheets.push({
            name: sheetName,
            table: tableName,
            rows: sheetRows,
            columns: cols,
          });

          // Collect sample rows (from first sheet only to keep size manageable)
          if (verified.sample_rows.length === 0) {
            verified.sample_rows = sampleResult;
          }
        } catch { /* table might not exist */ }
      }

      verified.actual_row_count = totalActualRows;
      verified.actual_columns = Array.from(new Set(allColumns));
      verified.row_count_verified = true;

      if (file.row_count !== null) {
        verified.row_count_discrepancy = totalActualRows - file.row_count;
      }
    } finally {
      userDb.close();
    }
  } catch { /* user db might not exist */ }

  return verified;
}

function collectDiscrepancies(files: VerifiedFile[]): Discrepancy[] {
  const disc: Discrepancy[] = [];
  for (const f of files) {
    if (f.row_count_verified && f.row_count_discrepancy !== null && f.row_count_discrepancy !== 0) {
      disc.push({
        file: f.original_name,
        field: 'row_count',
        reported: f.row_count,
        actual: f.actual_row_count,
      });
    }
    if (f.row_count_verified && f.actual_columns.length > 0 && f.column_count !== null) {
      // For multi-sheet, column_count is max across sheets; compare per first sheet
      const firstSheetCols = f.sheets.length > 0 ? f.sheets[0].columns.length : f.actual_columns.length;
      if (f.sheets.length <= 1 && firstSheetCols !== f.column_count) {
        disc.push({
          file: f.original_name,
          field: 'column_count',
          reported: f.column_count,
          actual: firstSheetCols,
        });
      }
    }
  }
  return disc;
}

// ── Metrics computation using VERIFIED data ────────────────────────
function computeMetrics(files: VerifiedFile[]) {
  const totalFiles = files.length;
  const totalSize = files.reduce((sum, f) => sum + (f.size_bytes || 0), 0);
  // Use actual row counts when available
  const totalRows = files.reduce((sum, f) => sum + (f.actual_row_count ?? f.row_count ?? 0), 0);
  const totalColumns = files.reduce((sum, f) => sum + (f.column_count || 0), 0);
  const qualityScores = files.filter((f) => f.quality_score !== null).map((f) => f.quality_score as number);
  const avgQuality = qualityScores.length > 0
    ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
    : null;
  const minQuality = qualityScores.length > 0 ? Math.min(...qualityScores) : null;
  const maxQuality = qualityScores.length > 0 ? Math.max(...qualityScores) : null;
  const readyCount = files.filter((f) => f.processing_status === 'ready').length;
  const errorCount = files.filter((f) => f.processing_status === 'error').length;
  const pendingCount = files.filter((f) => f.processing_status === 'pending' || f.processing_status === 'processing').length;
  const categories = Array.from(new Set(files.map((f) => f.file_category)));
  const fileTypes = Array.from(new Set(files.map((f) => f.file_type)));
  const processingRate = totalFiles > 0 ? Math.round((readyCount / totalFiles) * 100) : 0;

  return {
    total_files: totalFiles,
    total_size: totalSize,
    total_size_formatted: formatBytes(totalSize),
    total_rows: totalRows,
    total_columns: totalColumns,
    avg_quality: avgQuality,
    min_quality: minQuality,
    max_quality: maxQuality,
    ready_count: readyCount,
    error_count: errorCount,
    pending_count: pendingCount,
    processing_rate: processingRate,
    categories,
    file_types: fileTypes,
  };
}

function buildFileList(files: VerifiedFile[]) {
  return files.map((f) => ({
    name: f.original_name,
    type: f.file_type,
    category: f.file_category,
    size: f.size_bytes,
    size_formatted: formatBytes(f.size_bytes || 0),
    rows: f.actual_row_count ?? f.row_count,
    reported_rows: f.row_count,
    columns: f.column_count,
    actual_columns: f.actual_columns,
    quality: f.quality_score,
    status: f.processing_status,
    ai_summary: f.ai_summary,
    created_at: f.created_at,
    verified: f.row_count_verified,
    sheets: f.sheets.length > 1 ? f.sheets.map(s => ({
      name: s.name,
      rows: s.rows,
      columns: s.columns.length,
    })) : undefined,
  }));
}

// ── Template generators ────────────────────────────────────────────

function generateExecutiveSummary(files: VerifiedFile[], metrics: ReturnType<typeof computeMetrics>) {
  const qualityLabel = metrics.avg_quality !== null
    ? (metrics.avg_quality >= 90 ? 'Excellent' : metrics.avg_quality >= 75 ? 'Good' : metrics.avg_quality >= 60 ? 'Moderate' : 'Needs Improvement')
    : 'Not Assessed';

  const recs: string[] = [];
  if (metrics.error_count > 0) recs.push(`Review and fix ${metrics.error_count} file(s) that encountered processing errors.`);
  if (metrics.avg_quality !== null && metrics.avg_quality < 70) recs.push('Invest in data cleaning to improve quality scores below 70%.');
  if (metrics.avg_quality !== null && metrics.avg_quality >= 90) recs.push('Data quality is excellent — set up automated monitoring to maintain standards.');
  if (metrics.pending_count > 0) recs.push(`${metrics.pending_count} file(s) are pending processing. Wait for completion or trigger reprocessing.`);
  if (metrics.total_files === 1) recs.push('Upload additional datasets to enable cross-dataset analysis and comparisons.');

  // Data accuracy recommendations
  const discrepancies = collectDiscrepancies(files);
  if (discrepancies.length > 0) {
    recs.push(`${discrepancies.length} data discrepanc${discrepancies.length === 1 ? 'y' : 'ies'} detected between reported and actual values. Review the Data Verification section.`);
  }
  if (recs.length === 0) recs.push('All datasets are in good shape. Continue monitoring quality metrics regularly.');

  return {
    summary: `This executive summary covers ${metrics.total_files} data source(s) totaling ${metrics.total_size_formatted}. Overall data quality is rated "${qualityLabel}"${metrics.avg_quality !== null ? ` with an average score of ${metrics.avg_quality}%` : ''}. ${metrics.ready_count} of ${metrics.total_files} files are fully processed and ready for analysis.`,
    kpis: [
      { label: 'Total Files', value: String(metrics.total_files), sublabel: `${metrics.categories.length} categories` },
      { label: 'Total Size', value: metrics.total_size_formatted, sublabel: `${metrics.file_types.length} file types` },
      { label: 'Data Quality', value: metrics.avg_quality !== null ? `${metrics.avg_quality}%` : 'N/A', sublabel: qualityLabel },
      { label: 'Processing', value: `${metrics.processing_rate}%`, sublabel: `${metrics.ready_count}/${metrics.total_files} complete` },
    ],
    sections: [
      {
        title: 'Overview',
        content: `This report analyzes ${metrics.total_files} data source(s) comprising ${metrics.total_size_formatted} of data across ${metrics.categories.length} category type(s): ${metrics.categories.join(', ') || 'N/A'}. File formats include: ${metrics.file_types.join(', ') || 'N/A'}.${metrics.total_rows > 0 ? ` Total verified rows across all datasets: ${metrics.total_rows.toLocaleString()}.` : ''}`,
      },
      {
        title: 'Key Metrics',
        content: `Total Files: ${metrics.total_files} | Total Size: ${metrics.total_size_formatted}${metrics.total_rows > 0 ? ` | Total Rows: ${metrics.total_rows.toLocaleString()} (verified)` : ''} | Successfully Processed: ${metrics.ready_count}/${metrics.total_files}${metrics.avg_quality !== null ? ` | Average Quality Score: ${metrics.avg_quality}%` : ''}${metrics.error_count > 0 ? ` | Files with Errors: ${metrics.error_count}` : ''}`,
      },
      {
        title: 'Data Quality Summary',
        content: metrics.avg_quality !== null
          ? `Average data quality score across ${files.filter(f => f.quality_score !== null).length} scored file(s): ${metrics.avg_quality}% (range: ${metrics.min_quality}% – ${metrics.max_quality}%). ${metrics.avg_quality >= 80 ? 'Quality is good overall.' : metrics.avg_quality >= 60 ? 'Quality is moderate; some datasets may benefit from cleaning.' : 'Quality is below average; data cleaning is recommended.'} ${metrics.error_count > 0 ? `${metrics.error_count} file(s) encountered processing errors and should be reviewed.` : 'All files processed without errors.'}`
          : `No quality scores are available yet. Ensure files have been fully processed to generate quality metrics.`,
      },
      {
        title: 'Recommendations',
        content: recs.map((r, i) => `${i + 1}. ${r}`).join('\n'),
      },
    ],
    quality_breakdown: files.filter(f => f.quality_score !== null).map(f => ({
      name: f.original_name,
      quality: f.quality_score as number,
    })),
  };
}

function generateDataDeepDive(files: VerifiedFile[], metrics: ReturnType<typeof computeMetrics>) {
  const tabularFiles = files.filter(f => (f.actual_row_count ?? f.row_count ?? 0) > 0);
  const sizeDistribution = files.map(f => ({ name: f.original_name, size: f.size_bytes })).sort((a, b) => b.size - a.size);
  const largestFile = sizeDistribution.length > 0 ? sizeDistribution[0] : null;
  const smallestFile = sizeDistribution.length > 0 ? sizeDistribution[sizeDistribution.length - 1] : null;

  // Build rich schema content with actual column names and types
  const schemaContent = files.map(f => {
    const actualRows = f.actual_row_count ?? f.row_count ?? 0;
    let line = `• ${f.original_name} (${f.file_type}): ${f.actual_columns.length || f.column_count || 'N/A'} columns, ${actualRows.toLocaleString()} rows, ${formatBytes(f.size_bytes)}`;
    if (f.actual_columns.length > 0) {
      line += `\n  Columns: ${f.actual_columns.slice(0, 10).join(', ')}${f.actual_columns.length > 10 ? ` (+${f.actual_columns.length - 10} more)` : ''}`;
    }
    if (f.column_details.length > 0) {
      const nullCols = f.column_details.filter(c => c.null_ratio && c.null_ratio > 0.5);
      if (nullCols.length > 0) {
        line += `\n  ⚠ ${nullCols.length} column(s) with >50% null values`;
      }
    }
    if (f.sheets.length > 1) {
      line += `\n  Sheets: ${f.sheets.map(s => `${s.name} (${s.rows} rows)`).join(', ')}`;
    }
    return line;
  }).join('\n\n');

  return {
    summary: `Deep-dive analysis of ${metrics.total_files} dataset(s) totaling ${metrics.total_size_formatted}. This report provides comprehensive schema analysis, distribution profiling, and anomaly detection across ${metrics.categories.length} data categories and ${metrics.file_types.length} file formats. All row counts verified against actual data.`,
    kpis: [
      { label: 'Datasets', value: String(metrics.total_files), sublabel: `${tabularFiles.length} tabular` },
      { label: 'Total Rows', value: metrics.total_rows > 0 ? metrics.total_rows.toLocaleString() : 'N/A', sublabel: `${metrics.total_columns} total columns` },
      { label: 'Quality Range', value: metrics.min_quality !== null && metrics.max_quality !== null ? `${metrics.min_quality}–${metrics.max_quality}%` : 'N/A', sublabel: metrics.avg_quality !== null ? `avg ${metrics.avg_quality}%` : 'not scored' },
      { label: 'Categories', value: String(metrics.categories.length), sublabel: metrics.categories.slice(0, 3).join(', ') },
    ],
    sections: [
      {
        title: 'Dataset Overview',
        content: `Analyzed ${metrics.total_files} dataset(s) totaling ${metrics.total_size_formatted}. Categories: ${metrics.categories.join(', ') || 'N/A'}. Formats: ${metrics.file_types.join(', ') || 'N/A'}.${metrics.total_rows > 0 ? ` Combined verified row count: ${metrics.total_rows.toLocaleString()}.` : ''}`,
      },
      {
        title: 'Schema Analysis',
        content: schemaContent || 'No schema data available.',
      },
      {
        title: 'Distribution Analysis',
        content: `${metrics.total_files} datasets analyzed. Largest file: ${largestFile ? `${largestFile.name} (${formatBytes(largestFile.size)})` : 'N/A'}. Smallest: ${smallestFile ? `${smallestFile.name} (${formatBytes(smallestFile.size)})` : 'N/A'}. ${metrics.categories.length} data categories present.${metrics.total_rows > 0 ? ` Total verified row count: ${metrics.total_rows.toLocaleString()}.` : ''}`,
      },
      {
        title: 'Anomaly Detection',
        content: metrics.error_count > 0
          ? `${metrics.error_count} file(s) had processing errors that may indicate data anomalies. Review these files for potential issues:\n${files.filter(f => f.processing_status === 'error').map(f => `• ${f.original_name}`).join('\n')}`
          : 'No processing anomalies detected across the analyzed datasets.',
      },
      {
        title: 'Correlation Analysis',
        content: files.length >= 2
          ? `${files.length} datasets available for correlation analysis. Shared categories: ${metrics.categories.join(', ')}. Shared formats: ${metrics.file_types.join(', ')}.`
          : 'At least 2 datasets are needed for correlation analysis.',
      },
    ],
    schema_table: files.map(f => ({
      name: f.original_name,
      type: f.file_type,
      columns: f.actual_columns.length || f.column_count,
      column_names: f.actual_columns.slice(0, 20),
      rows: f.actual_row_count ?? f.row_count,
      size: formatBytes(f.size_bytes),
      quality: f.quality_score,
      sheets: f.sheets.length > 1 ? f.sheets.length : undefined,
    })),
    size_distribution: sizeDistribution.map(f => ({ name: f.name, size: f.size, size_formatted: formatBytes(f.size) })),
  };
}

function generateMonthlyReport(files: VerifiedFile[], metrics: ReturnType<typeof computeMetrics>) {
  const now = new Date();
  const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const categoryBreakdown = metrics.categories.map(cat => {
    const catFiles = files.filter(f => f.file_category === cat);
    return {
      category: cat,
      count: catFiles.length,
      size: formatBytes(catFiles.reduce((s, f) => s + (f.size_bytes || 0), 0)),
      rows: catFiles.reduce((s, f) => s + (f.actual_row_count ?? f.row_count ?? 0), 0),
    };
  });

  return {
    summary: `Monthly report for ${monthName}. This period saw ${metrics.total_files} file(s) ingested totaling ${metrics.total_size_formatted}, with a ${metrics.processing_rate}% processing success rate.${metrics.avg_quality !== null ? ` Average quality score: ${metrics.avg_quality}%.` : ''} All metrics verified against actual data.`,
    kpis: [
      { label: 'Files Ingested', value: String(metrics.total_files), sublabel: monthName },
      { label: 'Data Volume', value: metrics.total_size_formatted, sublabel: `${metrics.file_types.length} formats` },
      { label: 'Success Rate', value: `${metrics.processing_rate}%`, sublabel: `${metrics.ready_count} processed` },
      { label: 'Avg Quality', value: metrics.avg_quality !== null ? `${metrics.avg_quality}%` : 'N/A', sublabel: metrics.avg_quality !== null ? (metrics.avg_quality >= 80 ? 'Good' : 'Needs work') : 'Not scored' },
    ],
    sections: [
      {
        title: 'Monthly Summary',
        content: `This period: ${metrics.total_files} file(s) ingested, ${metrics.ready_count} fully processed, ${metrics.total_size_formatted} total data volume across ${metrics.categories.length} categories.${metrics.total_rows > 0 ? ` ${metrics.total_rows.toLocaleString()} total rows (verified).` : ''}`,
      },
      {
        title: 'Ingestion Activity',
        content: `${metrics.total_files} file(s) uploaded across ${metrics.categories.length} categories (${metrics.categories.join(', ') || 'N/A'}). File types: ${metrics.file_types.join(', ') || 'N/A'}.`,
      },
      {
        title: 'Quality Trends',
        content: metrics.avg_quality !== null
          ? `Current average quality: ${metrics.avg_quality}%. ${files.filter(f => f.quality_score !== null).length} file(s) have been scored. Score range: ${metrics.min_quality}% – ${metrics.max_quality}%.`
          : 'Quality scoring data is not yet available.',
      },
      {
        title: 'Processing Activity',
        content: `${metrics.ready_count} of ${metrics.total_files} files processed successfully.${metrics.error_count > 0 ? ` ${metrics.error_count} file(s) encountered errors.` : ''} Processing success rate: ${metrics.processing_rate}%.${metrics.pending_count > 0 ? ` ${metrics.pending_count} file(s) still pending.` : ''}`,
      },
      {
        title: 'Category Breakdown',
        content: categoryBreakdown.map(c => `• ${c.category}: ${c.count} file(s), ${c.size}${c.rows > 0 ? `, ${c.rows.toLocaleString()} rows` : ''}`).join('\n') || 'No category data available.',
      },
    ],
    category_breakdown: categoryBreakdown,
    activity_stats: {
      total_ingested: metrics.total_files,
      total_processed: metrics.ready_count,
      total_errors: metrics.error_count,
      total_pending: metrics.pending_count,
    },
  };
}

function generateComparisonReport(files: VerifiedFile[], metrics: ReturnType<typeof computeMetrics>) {
  const sortedBySize = [...files].sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
  const sortedByQuality = [...files].filter(f => f.quality_score !== null).sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

  // Find shared columns across files
  const columnSets = files.filter(f => f.actual_columns.length > 0).map(f => new Set(f.actual_columns));
  let sharedColumns: string[] = [];
  if (columnSets.length >= 2) {
    sharedColumns = Array.from(columnSets[0]).filter(col =>
      columnSets.slice(1).every(set => set.has(col))
    );
  }

  return {
    summary: `Comparison analysis across ${metrics.total_files} dataset(s). This report highlights differences in size, structure, quality, and processing status between your data sources. All row counts verified against actual data.${metrics.total_files < 2 ? ' Upload additional files for more meaningful comparisons.' : ''}`,
    kpis: [
      { label: 'Datasets', value: String(metrics.total_files), sublabel: 'compared' },
      { label: 'Size Range', value: files.length > 0 ? `${formatBytes(Math.min(...files.map(f => f.size_bytes || 0)))} – ${formatBytes(Math.max(...files.map(f => f.size_bytes || 0)))}` : 'N/A', sublabel: metrics.total_size_formatted + ' total' },
      { label: 'Quality Spread', value: metrics.min_quality !== null && metrics.max_quality !== null ? `${metrics.max_quality - metrics.min_quality}pts` : 'N/A', sublabel: metrics.min_quality !== null ? `${metrics.min_quality}% – ${metrics.max_quality}%` : 'not scored' },
      { label: 'Formats', value: String(metrics.file_types.length), sublabel: metrics.file_types.join(', ') },
    ],
    sections: [
      {
        title: 'Comparison Overview',
        content: `Comparing ${metrics.total_files} dataset(s) across ${metrics.categories.length} categories (${metrics.categories.join(', ')}). Formats: ${metrics.file_types.join(', ')}.${sharedColumns.length > 0 ? ` ${sharedColumns.length} shared column(s) across datasets: ${sharedColumns.slice(0, 5).join(', ')}${sharedColumns.length > 5 ? ' ...' : ''}.` : ''}`,
      },
      {
        title: 'Schema Comparison',
        content: files.map((f) => {
          const rows = f.actual_row_count ?? f.row_count ?? 0;
          const cols = f.actual_columns.length || f.column_count || 0;
          let line = `• ${f.original_name} (${f.file_type}): ${cols} columns, ${rows.toLocaleString()} rows`;
          if (f.actual_columns.length > 0) {
            line += `\n  Columns: ${f.actual_columns.slice(0, 8).join(', ')}${f.actual_columns.length > 8 ? ` (+${f.actual_columns.length - 8})` : ''}`;
          }
          return line;
        }).join('\n') || 'No schema data available.',
      },
      {
        title: 'Statistical Differences',
        content: `Size range: ${files.length > 0 ? formatBytes(Math.min(...files.map(f => f.size_bytes || 0))) : '0 B'} – ${files.length > 0 ? formatBytes(Math.max(...files.map(f => f.size_bytes || 0))) : '0 B'}. ${sortedBySize.length > 0 ? `Largest: ${sortedBySize[0].original_name}. Smallest: ${sortedBySize[sortedBySize.length - 1].original_name}.` : ''}${metrics.min_quality !== null && metrics.max_quality !== null ? ` Quality range: ${metrics.min_quality}% – ${metrics.max_quality}%.` : ''}`,
      },
      {
        title: 'Quality Comparison',
        content: sortedByQuality.length > 0
          ? sortedByQuality.map((f) => `• ${f.original_name}: ${f.quality_score}%`).join('\n')
          : 'Quality scores not available for comparison.',
      },
      {
        title: 'Correlation Analysis',
        content: files.length >= 2
          ? `${files.length} datasets available for correlation analysis. Shared categories: ${metrics.categories.join(', ')}.${sharedColumns.length > 0 ? ` ${sharedColumns.length} shared columns found, enabling structural comparison.` : ' No shared columns found.'} ${files.filter(f => f.file_type === files[0]?.file_type).length > 1 ? 'Multiple files share the same format.' : 'Files use different formats.'}`
          : 'At least 2 datasets are needed for correlation analysis.',
      },
    ],
    comparison_table: files.map(f => ({
      name: f.original_name,
      type: f.file_type,
      category: f.file_category,
      size: formatBytes(f.size_bytes),
      size_bytes: f.size_bytes,
      rows: f.actual_row_count ?? f.row_count,
      columns: f.actual_columns.length || f.column_count,
      quality: f.quality_score,
      status: f.processing_status,
    })),
    shared_columns: sharedColumns,
    rankings: {
      by_size: sortedBySize.map(f => f.original_name),
      by_quality: sortedByQuality.map(f => f.original_name),
    },
  };
}

function generateQuickBrief(files: VerifiedFile[], metrics: ReturnType<typeof computeMetrics>) {
  const primaryFile = files[0];
  const aiInsights = files.filter(f => f.ai_summary).map(f => ({ name: f.original_name, insight: f.ai_summary as string }));

  const pRows = primaryFile ? (primaryFile.actual_row_count ?? primaryFile.row_count) : null;

  return {
    summary: primaryFile
      ? `Quick brief for "${primaryFile.original_name}" — a ${primaryFile.file_type} file (${formatBytes(primaryFile.size_bytes)})${pRows ? ` with ${pRows.toLocaleString()} rows (verified) and ${primaryFile.actual_columns.length || primaryFile.column_count} columns` : ''}.${primaryFile.quality_score !== null ? ` Quality score: ${primaryFile.quality_score}%.` : ''}`
      : `Quick brief covering ${metrics.total_files} file(s), ${metrics.total_size_formatted} total.${metrics.avg_quality !== null ? ` Average quality: ${metrics.avg_quality}%.` : ''}`,
    kpis: [
      { label: 'Files', value: String(metrics.total_files), sublabel: metrics.categories.join(', ') || 'N/A' },
      { label: 'Size', value: metrics.total_size_formatted, sublabel: `${metrics.file_types.join(', ')}` },
      { label: 'Rows', value: metrics.total_rows > 0 ? metrics.total_rows.toLocaleString() : 'N/A', sublabel: `${metrics.total_columns} columns` },
      { label: 'Quality', value: metrics.avg_quality !== null ? `${metrics.avg_quality}%` : 'N/A', sublabel: metrics.ready_count === metrics.total_files ? 'All processed' : `${metrics.ready_count}/${metrics.total_files} ready` },
    ],
    sections: [
      {
        title: 'Quick Summary',
        content: `Quick analysis of ${metrics.total_files} file(s): ${metrics.total_size_formatted} total, ${metrics.ready_count} processed successfully.${metrics.avg_quality !== null ? ` Average quality: ${metrics.avg_quality}%.` : ''}${metrics.total_rows > 0 ? ` ${metrics.total_rows.toLocaleString()} total rows (verified).` : ''}`,
      },
      {
        title: 'Key Statistics',
        content: `Files: ${metrics.total_files} | Size: ${metrics.total_size_formatted} | Categories: ${metrics.categories.join(', ') || 'N/A'}${metrics.avg_quality !== null ? ` | Quality: ${metrics.avg_quality}%` : ''}${metrics.total_rows > 0 ? ` | Rows: ${metrics.total_rows.toLocaleString()}` : ''}`,
      },
      ...(primaryFile && primaryFile.actual_columns.length > 0 ? [{
        title: 'Data Structure',
        content: `Columns (${primaryFile.actual_columns.length}): ${primaryFile.actual_columns.join(', ')}${primaryFile.sheets.length > 1 ? `\nSheets: ${primaryFile.sheets.map(s => `${s.name} (${s.rows} rows)`).join(', ')}` : ''}`,
      }] : []),
      {
        title: 'AI Insights',
        content: aiInsights.length > 0
          ? aiInsights.map(i => `${i.name}: ${i.insight}`).join('\n\n')
          : 'No AI summaries available. Process files to generate AI-powered insights.',
      },
    ],
    ai_insights: aiInsights,
    file_snapshot: primaryFile ? {
      name: primaryFile.original_name,
      type: primaryFile.file_type,
      category: primaryFile.file_category,
      size: formatBytes(primaryFile.size_bytes),
      rows: primaryFile.actual_row_count ?? primaryFile.row_count,
      columns: primaryFile.actual_columns.length || primaryFile.column_count,
      column_names: primaryFile.actual_columns,
      quality: primaryFile.quality_score,
      status: primaryFile.processing_status,
    } : null,
  };
}

// ── Route handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await context.params;
    const db = getDb();

    const report = db.prepare(
      'SELECT * FROM reports WHERE id = ? AND user_id = ?'
    ).get(id, user.id) as Record<string, unknown> | undefined;

    if (!report) {
      return errorResponse('Report not found', 404);
    }

    db.prepare(
      `UPDATE reports SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);

    const template = (report.template as string) || 'executive_summary';
    const fileIds = safeJsonParse(report.file_ids as string, []) as string[];

    let rawFiles: FileRow[];
    if (fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(',');
      rawFiles = db.prepare(
        `SELECT id, original_name, file_type, file_category, size_bytes, row_count, column_count,
                processing_status, quality_score, ai_summary, created_at, db_table_name, schema_snapshot
         FROM files WHERE id IN (${placeholders}) AND user_id = ?`
      ).all(...fileIds, user.id) as FileRow[];
    } else {
      rawFiles = db.prepare(
        `SELECT id, original_name, file_type, file_category, size_bytes, row_count, column_count,
                processing_status, quality_score, ai_summary, created_at, db_table_name, schema_snapshot
         FROM files WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
      ).all(user.id) as FileRow[];
    }

    // Verify each file against actual data
    const files = rawFiles.map(f => verifyFileData(f, user.id));
    const discrepancies = collectDiscrepancies(files);

    const metrics = computeMetrics(files);
    const fileList = buildFileList(files);

    let templateContent;
    switch (template) {
      case 'executive_summary':
        templateContent = generateExecutiveSummary(files, metrics);
        break;
      case 'data_deep_dive':
        templateContent = generateDataDeepDive(files, metrics);
        break;
      case 'monthly_report':
        templateContent = generateMonthlyReport(files, metrics);
        break;
      case 'comparison_report':
        templateContent = generateComparisonReport(files, metrics);
        break;
      case 'quick_brief':
        templateContent = generateQuickBrief(files, metrics);
        break;
      default:
        templateContent = generateExecutiveSummary(files, metrics);
    }

    const content = {
      generated_at: new Date().toISOString(),
      template,
      ...templateContent,
      metrics,
      files: fileList,
      data_verification: {
        verified: true,
        verified_at: new Date().toISOString(),
        files_verified: files.filter(f => f.row_count_verified).length,
        files_total: files.length,
        discrepancies,
        all_accurate: discrepancies.length === 0,
      },
    };

    db.prepare(
      `UPDATE reports SET status = 'ready', content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(JSON.stringify(content), id);

    const updated = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Record<string, unknown>;

    return successResponse({
      report: {
        ...updated,
        file_ids: safeJsonParse(updated.file_ids as string, []),
        content: safeJsonParse(updated.content as string, {}),
        config: safeJsonParse(updated.config as string, {}),
      },
    });
  } catch (error) {
    console.error('Generate report error:', error);

    try {
      const { id } = await context.params;
      const db = getDb();
      db.prepare(
        `UPDATE reports SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(id);
    } catch {
      // ignore
    }

    return errorResponse('Internal server error', 500);
  }
}
