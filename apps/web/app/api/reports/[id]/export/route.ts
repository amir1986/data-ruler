import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, errorResponse } from '@/lib/api-utils';
import { getDb, getUserDb } from '@/lib/db';
import { safeJsonParse } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
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

    const content = safeJsonParse(report.content as string, {}) as Record<string, unknown>;
    const fileIds = safeJsonParse(report.file_ids as string, []) as string[];

    const wb = XLSX.utils.book_new();

    // ── 1. Report Summary sheet ──────────────────────────────────
    const summaryRows: (string | number | null)[][] = [
      ['Report Title', report.title as string],
      ['Template', String(content.template || '')],
      ['Generated', String(content.generated_at || '')],
      ['Status', report.status as string],
      [''],
      ['Summary'],
      [String(content.summary || '')],
    ];

    if (content.kpis && Array.isArray(content.kpis)) {
      summaryRows.push([''], ['KPIs'], ['Metric', 'Value', 'Detail']);
      (content.kpis as { label: string; value: string; sublabel?: string }[]).forEach((kpi) => {
        summaryRows.push([kpi.label, kpi.value, kpi.sublabel || '']);
      });
    }

    const metrics = content.metrics as Record<string, unknown> | undefined;
    if (metrics) {
      summaryRows.push([''], ['Key Metrics']);
      Object.entries(metrics).forEach(([key, val]) => {
        if (!Array.isArray(val)) {
          summaryRows.push([key.replace(/_/g, ' '), val as string | number]);
        }
      });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Report Summary');

    // ── 2. Report Sections sheet ─────────────────────────────────
    if (content.sections && Array.isArray(content.sections)) {
      const sectionRows: string[][] = [['Section', 'Content']];
      (content.sections as { title: string; content: string }[]).forEach((s) => {
        sectionRows.push([s.title, s.content]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sectionRows), 'Report Sections');
    }

    // ── 3. Data Verification sheet ───────────────────────────────
    const dv = content.data_verification as {
      verified: boolean; files_verified: number; files_total: number;
      discrepancies: { file: string; field: string; reported: unknown; actual: unknown }[];
    } | undefined;
    if (dv) {
      const dvRows: (string | number | null)[][] = [
        ['Data Verification Report'],
        ['Verified', dv.verified ? 'Yes' : 'No'],
        ['Files Verified', `${dv.files_verified} / ${dv.files_total}`],
        ['Discrepancies', dv.discrepancies.length],
      ];
      if (dv.discrepancies.length > 0) {
        dvRows.push([''], ['File', 'Field', 'Reported', 'Actual']);
        dv.discrepancies.forEach((d) => {
          dvRows.push([d.file, d.field, d.reported as string | number | null, d.actual as string | number | null]);
        });
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dvRows), 'Data Verification');
    }

    // ── 4. Template-specific sheets ──────────────────────────────
    const qb = content.quality_breakdown as { name: string; quality: number }[] | undefined;
    if (qb && qb.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qb), 'Quality Breakdown');
    }

    const st = content.schema_table as Record<string, unknown>[] | undefined;
    if (st && st.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(st), 'Schema Analysis');
    }

    const cb = content.category_breakdown as Record<string, unknown>[] | undefined;
    if (cb && cb.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cb), 'Categories');
    }

    const ct = content.comparison_table as Record<string, unknown>[] | undefined;
    if (ct && ct.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ct), 'Comparison');
    }

    // ── 5. ACTUAL SOURCE DATA — the main addition ────────────────
    // For each file in the report, query the real data from user_data.db
    let files: { id: string; original_name: string; db_table_name: string | null }[] = [];
    if (fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(',');
      files = db.prepare(
        `SELECT id, original_name, db_table_name FROM files WHERE id IN (${placeholders}) AND user_id = ?`
      ).all(...fileIds, user.id) as typeof files;
    } else {
      files = db.prepare(
        `SELECT id, original_name, db_table_name FROM files WHERE user_id = ? AND processing_status = 'ready' ORDER BY created_at DESC LIMIT 20`
      ).all(user.id) as typeof files;
    }

    if (files.length > 0) {
      const userDb = getUserDb(user.id);
      try {
        for (const file of files) {
          if (!file.db_table_name) continue;

          // Parse multi-sheet mapping
          let tables: Record<string, string> = {};
          if (file.db_table_name.startsWith('{')) {
            try { tables = JSON.parse(file.db_table_name); } catch { /* */ }
          }
          if (Object.keys(tables).length === 0) {
            tables = { 'Data': file.db_table_name };
          }

          for (const [sheetName, tableName] of Object.entries(tables)) {
            try {
              const rows = userDb.prepare(
                `SELECT * FROM "${tableName}" LIMIT 10000`
              ).all() as Record<string, unknown>[];

              if (rows.length === 0) continue;

              // Build sheet name: "filename - sheetname" (max 31 chars for Excel)
              const baseName = file.original_name.replace(/\.[^.]+$/, '');
              let wsName = Object.keys(tables).length > 1
                ? `${baseName} - ${sheetName}`
                : baseName;
              // Excel sheet names max 31 chars, no special chars
              wsName = wsName
                .replace(/[\\/*?[\]:]/g, '')
                .slice(0, 31);
              // Avoid duplicate sheet names
              let finalName = wsName;
              let counter = 1;
              while (wb.SheetNames.includes(finalName)) {
                finalName = `${wsName.slice(0, 28)}_${counter}`;
                counter++;
              }

              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(rows),
                finalName
              );
            } catch {
              // table might not exist
            }
          }
        }
      } finally {
        userDb.close();
      }
    }

    // ── Generate buffer and return ───────────────────────────────
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `${(report.title as string).replace(/\s+/g, '_').toLowerCase()}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('Report export error:', error);
    return errorResponse('Internal server error', 500);
  }
}
