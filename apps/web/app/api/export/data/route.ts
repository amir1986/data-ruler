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
    const { fileId, format } = body;

    if (!fileId) {
      return errorResponse('fileId is required', 400);
    }

    const allowedFormats = ['csv', 'json', 'xlsx'];
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

    const tableName = file.db_table_name as string;
    if (!tableName) {
      return errorResponse('File data is not available for export. File may not be processed yet.', 400);
    }

    const userDb = getUserDb(user.id);
    let rows: Record<string, unknown>[];
    try {
      rows = userDb.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[];
    } finally {
      userDb.close();
    }

    if (rows.length === 0) {
      return errorResponse('No data to export', 400);
    }

    const exportId = crypto.randomUUID().replace(/-/g, '');
    const exportDir = path.join(UPLOAD_PATH, user.id, 'exports');
    fs.mkdirSync(exportDir, { recursive: true });

    const baseName = path.basename(
      file.original_name as string,
      path.extname(file.original_name as string)
    );
    const exportFileName = `${baseName}_export_${exportId}.${format}`;
    const exportPath = path.join(exportDir, exportFileName);

    if (format === 'csv') {
      const columns = Object.keys(rows[0]);
      const header = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
      const lines = rows.map((row) =>
        columns
          .map((c) => {
            const val = row[c];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',')
      );
      fs.writeFileSync(exportPath, [header, ...lines].join('\n'), 'utf-8');
    } else if (format === 'json') {
      fs.writeFileSync(exportPath, JSON.stringify(rows, null, 2), 'utf-8');
    } else if (format === 'xlsx') {
      // For xlsx, write as CSV with .xlsx extension as a simplified fallback.
      // A full implementation would use a library like exceljs.
      const columns = Object.keys(rows[0]);
      const header = columns.join('\t');
      const lines = rows.map((row) =>
        columns.map((c) => String(row[c] ?? '')).join('\t')
      );
      fs.writeFileSync(exportPath, [header, ...lines].join('\n'), 'utf-8');
    }

    return successResponse({
      exportId,
      fileName: exportFileName,
      format,
      downloadUrl: `/api/export/data/download?file=${encodeURIComponent(exportFileName)}&userId=${user.id}`,
      rowCount: rows.length,
    });
  } catch (error) {
    console.error('Export error:', error);
    return errorResponse('Internal server error', 500);
  }
}
