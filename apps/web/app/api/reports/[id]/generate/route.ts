import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const templateConfigs: Record<string, { sections: string[]; focus: string }> = {
  executive_summary: {
    focus: 'high-level overview for stakeholders',
    sections: ['Overview', 'Key Metrics', 'Data Quality Summary', 'Recommendations'],
  },
  data_deep_dive: {
    focus: 'comprehensive technical analysis',
    sections: ['Dataset Overview', 'Schema Analysis', 'Distribution Analysis', 'Anomaly Detection', 'Correlation Analysis'],
  },
  monthly_report: {
    focus: 'periodic activity and trend summary',
    sections: ['Monthly Summary', 'Ingestion Activity', 'Quality Trends', 'Processing Activity', 'Month-over-Month Changes'],
  },
  comparison_report: {
    focus: 'comparative analysis across datasets',
    sections: ['Comparison Overview', 'Schema Comparison', 'Statistical Differences', 'Quality Comparison', 'Correlation Analysis'],
  },
  quick_brief: {
    focus: 'concise single-dataset summary',
    sections: ['Quick Summary', 'Key Statistics', 'AI Insights'],
  },
};

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

    // Set status to generating
    db.prepare(
      `UPDATE reports SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);

    const template = (report.template as string) || 'executive_summary';
    const fileIds = JSON.parse((report.file_ids as string) || '[]') as string[];

    // Gather real data about the user's files
    let files: Record<string, unknown>[];
    if (fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(',');
      files = db.prepare(
        `SELECT id, original_name, file_type, file_category, size_bytes, row_count, column_count,
                processing_status, quality_score, ai_summary, created_at
         FROM files WHERE id IN (${placeholders}) AND user_id = ?`
      ).all(...fileIds, user.id) as Record<string, unknown>[];
    } else {
      files = db.prepare(
        `SELECT id, original_name, file_type, file_category, size_bytes, row_count, column_count,
                processing_status, quality_score, ai_summary, created_at
         FROM files WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
      ).all(user.id) as Record<string, unknown>[];
    }

    // Compute real metrics from file data
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, f) => sum + ((f.size_bytes as number) || 0), 0);
    const totalRows = files.reduce((sum, f) => sum + ((f.row_count as number) || 0), 0);
    const qualityScores = files.filter((f) => f.quality_score !== null).map((f) => f.quality_score as number);
    const avgQuality = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
      : null;
    const readyCount = files.filter((f) => f.processing_status === 'ready').length;
    const errorCount = files.filter((f) => f.processing_status === 'error').length;
    const categories = [...new Set(files.map((f) => f.file_category as string))];
    const fileTypes = [...new Set(files.map((f) => f.file_type as string))];

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    // Build template-specific content with real data
    const config = templateConfigs[template] || templateConfigs.executive_summary;

    const sectionContentMap: Record<string, string> = {
      'Overview': `This report analyzes ${totalFiles} data source(s) comprising ${formatBytes(totalSize)} of data across ${categories.length} category type(s): ${categories.join(', ') || 'N/A'}. File formats include: ${fileTypes.join(', ') || 'N/A'}.${totalRows > 0 ? ` Total rows across all tabular datasets: ${totalRows.toLocaleString()}.` : ''}`,
      'Dataset Overview': `Analyzed ${totalFiles} dataset(s) totaling ${formatBytes(totalSize)}. Categories represented: ${categories.join(', ') || 'N/A'}. Format types: ${fileTypes.join(', ') || 'N/A'}.${totalRows > 0 ? ` Combined row count: ${totalRows.toLocaleString()}.` : ''}`,
      'Key Metrics': `Total Files: ${totalFiles} | Total Size: ${formatBytes(totalSize)}${totalRows > 0 ? ` | Total Rows: ${totalRows.toLocaleString()}` : ''} | Successfully Processed: ${readyCount}/${totalFiles}${avgQuality !== null ? ` | Average Quality Score: ${avgQuality}%` : ''}${errorCount > 0 ? ` | Files with Errors: ${errorCount}` : ''}`,
      'Quick Summary': `Quick analysis of ${totalFiles} file(s): ${formatBytes(totalSize)} total, ${readyCount} processed successfully.${avgQuality !== null ? ` Average quality: ${avgQuality}%.` : ''}${totalRows > 0 ? ` ${totalRows.toLocaleString()} total rows.` : ''}`,
      'Key Statistics': `Files: ${totalFiles} | Size: ${formatBytes(totalSize)} | Categories: ${categories.join(', ') || 'N/A'}${avgQuality !== null ? ` | Quality: ${avgQuality}%` : ''}${totalRows > 0 ? ` | Rows: ${totalRows.toLocaleString()}` : ''}`,
      'Data Quality Summary': avgQuality !== null
        ? `Average data quality score across ${qualityScores.length} scored file(s): ${avgQuality}%. ${avgQuality >= 80 ? 'Quality is good overall.' : avgQuality >= 60 ? 'Quality is moderate; some datasets may benefit from cleaning.' : 'Quality is below average; data cleaning is recommended.'} ${errorCount > 0 ? `${errorCount} file(s) encountered processing errors and should be reviewed.` : 'All files processed without errors.'}`
        : `No quality scores are available yet. Ensure files have been fully processed to generate quality metrics.`,
      'Quality Trends': avgQuality !== null
        ? `Current average quality: ${avgQuality}%. ${qualityScores.length} file(s) have been scored. Score range: ${Math.min(...qualityScores)}% - ${Math.max(...qualityScores)}%.`
        : 'Quality scoring data is not yet available.',
      'Recommendations': generateRecommendations(totalFiles, avgQuality, errorCount, readyCount),
      'AI Insights': files.filter((f) => f.ai_summary).map((f) => `${f.original_name}: ${f.ai_summary}`).join('\n\n') || 'No AI summaries available. Process files to generate AI-powered insights.',
      'Monthly Summary': `This period: ${totalFiles} file(s) ingested, ${readyCount} processed, ${formatBytes(totalSize)} total data.`,
      'Ingestion Activity': `${totalFiles} file(s) uploaded across ${categories.length} categories. File types: ${fileTypes.join(', ') || 'N/A'}.`,
      'Processing Activity': `${readyCount} of ${totalFiles} files processed successfully.${errorCount > 0 ? ` ${errorCount} file(s) encountered errors.` : ''} Processing success rate: ${totalFiles > 0 ? Math.round((readyCount / totalFiles) * 100) : 0}%.`,
      'Month-over-Month Changes': `Current dataset count: ${totalFiles}. Total storage: ${formatBytes(totalSize)}.`,
      'Comparison Overview': `Comparing ${totalFiles} dataset(s). Categories: ${categories.join(', ') || 'N/A'}.`,
      'Schema Comparison': files.map((f) => `${f.original_name} (${f.file_type}): ${f.column_count || 'N/A'} columns, ${f.row_count?.toLocaleString() || 'N/A'} rows`).join('\n') || 'No schema data available.',
      'Schema Analysis': files.map((f) => `${f.original_name}: ${f.file_type}, ${f.column_count || '?'} columns, ${f.row_count?.toLocaleString() || '?'} rows`).join('\n') || 'No schema data available.',
      'Statistical Differences': `Size range: ${files.length > 0 ? formatBytes(Math.min(...files.map((f) => (f.size_bytes as number) || 0))) : '0 B'} - ${files.length > 0 ? formatBytes(Math.max(...files.map((f) => (f.size_bytes as number) || 0))) : '0 B'}.${qualityScores.length > 1 ? ` Quality score range: ${Math.min(...qualityScores)}% - ${Math.max(...qualityScores)}%.` : ''}`,
      'Quality Comparison': qualityScores.length > 0
        ? files.filter((f) => f.quality_score !== null).map((f) => `${f.original_name}: ${f.quality_score}%`).join('\n')
        : 'Quality scores not available for comparison.',
      'Distribution Analysis': `${totalFiles} datasets analyzed. ${categories.length} data categories present.${totalRows > 0 ? ` Total row count: ${totalRows.toLocaleString()}.` : ''}`,
      'Anomaly Detection': errorCount > 0
        ? `${errorCount} file(s) had processing errors that may indicate data anomalies. Review these files for potential issues.`
        : 'No processing anomalies detected across the analyzed datasets.',
      'Correlation Analysis': files.length >= 2
        ? `${files.length} datasets available for correlation analysis. Shared categories: ${categories.join(', ')}.`
        : 'At least 2 datasets are needed for correlation analysis.',
    };

    const sections = config.sections.map((sectionTitle) => ({
      title: sectionTitle,
      content: sectionContentMap[sectionTitle] || `Analysis for "${sectionTitle}" based on ${totalFiles} data source(s).`,
    }));

    const summaryText = `This ${template.replace(/_/g, ' ')} analyzes ${totalFiles} data source(s) (${formatBytes(totalSize)}).${avgQuality !== null ? ` Average quality score: ${avgQuality}%.` : ''} ${readyCount} of ${totalFiles} files are fully processed.`;

    const content = {
      generated_at: new Date().toISOString(),
      template,
      summary: summaryText,
      sections,
      metrics: {
        total_files: totalFiles,
        total_size: totalSize,
        total_rows: totalRows,
        avg_quality: avgQuality,
        ready_count: readyCount,
        error_count: errorCount,
        categories,
        file_types: fileTypes,
      },
      files: files.map((f) => ({
        name: f.original_name,
        type: f.file_type,
        category: f.file_category,
        size: f.size_bytes,
        rows: f.row_count,
        columns: f.column_count,
        quality: f.quality_score,
        status: f.processing_status,
      })),
    };

    // Update report with generated content
    db.prepare(
      `UPDATE reports SET status = 'ready', content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(JSON.stringify(content), id);

    const updated = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Record<string, unknown>;

    return successResponse({
      report: {
        ...updated,
        file_ids: JSON.parse((updated.file_ids as string) || '[]'),
        content: JSON.parse((updated.content as string) || '{}'),
        config: JSON.parse((updated.config as string) || '{}'),
      },
    });
  } catch (error) {
    console.error('Generate report error:', error);

    // Try to set error status
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

function generateRecommendations(totalFiles: number, avgQuality: number | null, errorCount: number, readyCount: number): string {
  const recs: string[] = [];

  if (totalFiles === 0) {
    return 'Upload data files to begin generating insights and recommendations.';
  }

  if (errorCount > 0) {
    recs.push(`Review and fix ${errorCount} file(s) that encountered processing errors.`);
  }

  if (avgQuality !== null && avgQuality < 70) {
    recs.push('Consider data cleaning to improve quality scores below 70%.');
  }

  if (avgQuality !== null && avgQuality >= 90) {
    recs.push('Data quality is excellent. Consider setting up automated monitoring to maintain standards.');
  }

  if (readyCount < totalFiles) {
    recs.push(`${totalFiles - readyCount} file(s) are still pending processing. Wait for completion or trigger reprocessing.`);
  }

  if (totalFiles === 1) {
    recs.push('Upload additional datasets to enable cross-dataset analysis and comparisons.');
  }

  if (recs.length === 0) {
    recs.push('All datasets are in good shape. Continue monitoring quality metrics regularly.');
  }

  return recs.map((r, i) => `${i + 1}. ${r}`).join('\n');
}
