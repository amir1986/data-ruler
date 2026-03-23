import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb, getUserDb } from '@/lib/db';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(process.cwd(), '../../data/uploads');

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await req.json();
    const { fileId, format, sheetName } = body;

    if (!fileId) {
      return errorResponse('fileId is required', 400);
    }

    const allowedFormats = ['csv', 'json'];
    if (!format || !allowedFormats.includes(format)) {
      return errorResponse(`Format must be one of: ${allowedFormats.join(', ')}`, 400);
    }

    const db = getDb();
    const file = db.prepare(
      'SELECT * FROM files WHERE id = ? AND user_id = ?'
    ).get(fileId, user.id) as Record<string, unknown> | undefined;

    if (!file) {
      return errorResponse('File not found', 404);
    }

    const rawTableName = file.db_table_name as string;
    if (!rawTableName) {
      return errorResponse('File data is not available for export. File may not be processed yet.', 400);
    }

    // Detect multi-sheet
    let sheetTables: Record<string, string> | null = null;
    if (rawTableName.startsWith('{')) {
      try {
        sheetTables = JSON.parse(rawTableName);
      } catch {
        // not JSON — treat as plain table name
      }
    }

    const userDb = getUserDb(user.id);
    try {
      const exportId = crypto.randomUUID().replace(/-/g, '');
      const exportDir = path.join(UPLOAD_PATH, user.id, 'exports');
      fs.mkdirSync(exportDir, { recursive: true });

      const baseName = path.basename(
        file.original_name as string,
        path.extname(file.original_name as string)
      );

      // Single sheet export (either non-multi-sheet file or specific sheet requested)
      if (!sheetTables || sheetName) {
        const tableName = sheetName && sheetTables
          ? sheetTables[sheetName] || rawTableName
          : sheetTables
            ? Object.values(sheetTables)[0]
            : rawTableName;

        const rows = userDb.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[];
        if (rows.length === 0) {
          return errorResponse('No data to export', 400);
        }

        const exportFileName = `${baseName}${sheetName ? `_${sheetName}` : ''}_export_${exportId}.${format}`;
        const exportPath = path.join(exportDir, exportFileName);

        writeExportFile(exportPath, format, Object.keys(rows[0]), rows);

        return successResponse({
          exportId,
          fileName: exportFileName,
          format,
          downloadUrl: `/api/export/data/download?file=${encodeURIComponent(exportFileName)}&userId=${user.id}`,
          rowCount: rows.length,
        });
      }

      // Multi-sheet export (all sheets)
      const exportFileName = `${baseName}_export_${exportId}.${format}`;
      const exportPath = path.join(exportDir, exportFileName);
      let totalRows = 0;
      const sheetNames: string[] = [];

      if (format === 'json') {
        const allData: Record<string, unknown[]> = {};
        for (const [sName, tName] of Object.entries(sheetTables)) {
          try {
            const rows = userDb.prepare(`SELECT * FROM "${tName}"`).all() as Record<string, unknown>[];
            allData[sName] = rows;
            totalRows += rows.length;
            sheetNames.push(sName);
          } catch {
            // skip missing tables
          }
        }
        fs.writeFileSync(exportPath, JSON.stringify(allData, null, 2), 'utf-8');
      } else {
        // CSV: concatenate sheets with headers
        let csvContent = '';
        for (const [sName, tName] of Object.entries(sheetTables)) {
          try {
            const rows = userDb.prepare(`SELECT * FROM "${tName}"`).all() as Record<string, unknown>[];
            if (rows.length === 0) continue;
            const cols = Object.keys(rows[0]);
            csvContent += `# --- Sheet: ${sName} ---\n`;
            csvContent += cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',') + '\n';
            for (const row of rows) {
              csvContent += cols.map(c => {
                const val = row[c];
                if (val === null || val === undefined) return '';
                return `"${String(val).replace(/"/g, '""')}"`;
              }).join(',') + '\n';
            }
            csvContent += '\n';
            totalRows += rows.length;
            sheetNames.push(sName);
          } catch {
            // skip missing tables
          }
        }
        fs.writeFileSync(exportPath, csvContent, 'utf-8');
      }

      return successResponse({
        exportId,
        fileName: exportFileName,
        format,
        downloadUrl: `/api/export/data/download?file=${encodeURIComponent(exportFileName)}&userId=${user.id}`,
        rowCount: totalRows,
        sheets: sheetNames,
      });
    } finally {
      userDb.close();
    }
  } catch (error) {
    console.error('Export error:', error);
    return errorResponse('Internal server error', 500);
  }
}

function writeExportFile(
  exportPath: string,
  format: string,
  columns: string[],
  rows: Record<string, unknown>[]
) {
  if (format === 'csv') {
    const header = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const lines = rows.map(row =>
      columns.map(c => {
        const val = row[c];
        if (val === null || val === undefined) return '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    fs.writeFileSync(exportPath, [header, ...lines].join('\n'), 'utf-8');
  } else if (format === 'json') {
    fs.writeFileSync(exportPath, JSON.stringify(rows, null, 2), 'utf-8');
  }
}
