import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb, getUserDb } from '@/lib/db';
import { safeJsonParse } from '@/lib/utils';

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

    const file = db.prepare(
      `SELECT * FROM files WHERE id = ? AND user_id = ?`
    ).get(id, user.id) as Record<string, unknown> | undefined;

    if (!file) {
      return errorResponse('File not found', 404);
    }

    const category = file.file_category as string;

    if (category === 'tabular' || category === 'structured_data') {
      const rawTableName = file.db_table_name as string;
      if (!rawTableName) {
        return successResponse({
          type: 'tabular',
          status: 'not_ready',
          message: 'File has not been processed yet',
        });
      }

      // Optional sheet filter
      const requestedSheet = req.nextUrl.searchParams.get('sheet');

      // Multi-sheet Excel: db_table_name is JSON mapping sheet→table
      let sheetTables: Record<string, string> | null = null;
      if (rawTableName.startsWith('{')) {
        try {
          sheetTables = JSON.parse(rawTableName);
        } catch {
          // not JSON — treat as plain table name
        }
      }

      // Parse schema for column type info
      const schemaSnapshot = safeJsonParse(file.schema_snapshot as string | undefined, []) as Array<{ name: string; inferred_type?: string; sheet?: string }>;

      const userDb = getUserDb(user.id);
      try {
        // If specific sheet requested from a multi-sheet file
        if (requestedSheet && sheetTables && sheetTables[requestedSheet]) {
          const tableName = sheetTables[requestedSheet];
          const rows = userDb.prepare(
            `SELECT * FROM "${tableName}" LIMIT 200`
          ).all();
          const cols = rows.length > 0
            ? Object.keys(rows[0] as Record<string, unknown>)
            : [];
          const total = userDb.prepare(
            `SELECT COUNT(*) as c FROM "${tableName}"`
          ).get() as { c: number };

          const colTypes = Object.fromEntries(
            schemaSnapshot
              .filter(s => s.sheet === requestedSheet || !s.sheet)
              .map(s => [s.name, s.inferred_type || 'text'])
          );

          return successResponse({
            type: 'tabular',
            sheetName: requestedSheet,
            columns: cols,
            columnTypes: colTypes,
            rows,
            totalRows: total?.c ?? rows.length,
            previewRows: rows.length,
            sheetNames: Object.keys(sheetTables),
          });
        }

        if (sheetTables && Object.keys(sheetTables).length > 1) {
          // Multi-sheet: return data from all sheets
          const sheets: Record<string, { columns: string[]; rows: unknown[]; rowCount: number }> = {};
          for (const [sheetName, tableName] of Object.entries(sheetTables)) {
            try {
              const sheetRows = userDb.prepare(
                `SELECT * FROM "${tableName}" LIMIT 200`
              ).all();
              const cols = sheetRows.length > 0
                ? Object.keys(sheetRows[0] as Record<string, unknown>)
                : [];
              const total = userDb.prepare(
                `SELECT COUNT(*) as c FROM "${tableName}"`
              ).get() as { c: number };
              sheets[sheetName] = {
                columns: cols,
                rows: sheetRows,
                rowCount: total?.c ?? sheetRows.length,
              };
            } catch {
              // sheet table missing — skip
            }
          }

          return successResponse({
            type: 'tabular',
            multiSheet: true,
            sheets,
            sheetNames: Object.keys(sheetTables),
            totalRows: file.row_count,
          });
        }

        // Single sheet (plain table name or single-entry JSON)
        const tableName = sheetTables
          ? Object.values(sheetTables)[0]
          : rawTableName;

        const rows = userDb.prepare(
          `SELECT * FROM "${tableName}" LIMIT 200`
        ).all();

        const columns = rows.length > 0
          ? Object.keys(rows[0] as Record<string, unknown>)
          : [];

        const colTypes = Object.fromEntries(
          schemaSnapshot
            .filter(s => !s.sheet)
            .map(s => [s.name, s.inferred_type || 'text'])
        );

        return successResponse({
          type: 'tabular',
          columns,
          columnTypes: colTypes,
          rows,
          totalRows: file.row_count,
          previewRows: rows.length,
        });
      } finally {
        userDb.close();
      }
    }

    if (category === 'document') {
      return successResponse({
        type: 'document',
        summary: file.ai_summary || null,
        schema: safeJsonParse(file.schema_snapshot as string | undefined, null),
        processingStatus: file.processing_status,
      });
    }

    if (category === 'image' || category === 'video' || category === 'audio') {
      return successResponse({
        type: category,
        metadata: safeJsonParse(file.media_metadata as string | undefined, null),
        thumbnailPath: file.thumbnail_path || null,
        transcriptionPath: file.transcription_path || null,
        processingStatus: file.processing_status,
      });
    }

    return successResponse({
      type: category,
      processingStatus: file.processing_status,
      message: 'Preview not available for this file type',
    });
  } catch (error) {
    console.error('File preview error:', error);
    return errorResponse('Internal server error', 500);
  }
}
