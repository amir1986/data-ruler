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
      'SELECT id, db_table_name, schema_snapshot, row_count FROM files WHERE id = ? AND user_id = ?'
    ).get(id, user.id) as Record<string, unknown> | undefined;

    if (!file) {
      return errorResponse('File not found', 404);
    }

    const rawTableName = file.db_table_name as string;
    if (!rawTableName) {
      return successResponse({ tables: [] });
    }

    const schemaSnapshot = safeJsonParse(file.schema_snapshot as string | undefined, []) as Array<{
      name: string;
      inferred_type?: string;
      sheet?: string;
      is_primary_key?: boolean;
      null_ratio?: number;
    }>;

    // Check imported_tables for richer metadata
    const importedTables = db.prepare(
      'SELECT table_name, storage_table_name, row_count, schema_snapshot FROM imported_tables WHERE file_id = ?'
    ).all(id) as Array<{
      table_name: string;
      storage_table_name: string;
      row_count: number | null;
      schema_snapshot: string;
    }>;

    // If imported_tables has entries, use those
    if (importedTables.length > 0) {
      const tables = importedTables.map(it => {
        const itSchema = safeJsonParse(it.schema_snapshot, []) as Array<{
          name: string;
          inferred_type?: string;
          is_primary_key?: boolean;
        }>;
        return {
          name: it.table_name,
          tableName: it.storage_table_name,
          rowCount: it.row_count ?? 0,
          columns: itSchema.map(col => ({
            name: col.name,
            type: col.inferred_type || 'text',
            is_primary_key: col.is_primary_key || false,
          })),
        };
      });
      return successResponse({ tables });
    }

    // Fallback: parse from db_table_name field
    let sheetTables: Record<string, string> | null = null;
    if (rawTableName.startsWith('{')) {
      try {
        sheetTables = JSON.parse(rawTableName);
      } catch {
        // plain table name
      }
    }

    if (sheetTables) {
      const tables = Object.entries(sheetTables).map(([sheetName, tableName]) => {
        const cols = schemaSnapshot
          .filter(s => s.sheet === sheetName)
          .map(s => ({
            name: s.name,
            type: s.inferred_type || 'text',
            is_primary_key: false,
          }));

        // Try to get actual row count from user db
        let rowCount = 0;
        try {
          const userDb = getUserDb(user.id);
          const result = userDb.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get() as { c: number };
          rowCount = result?.c ?? 0;
          userDb.close();
        } catch {
          // table may not exist
        }

        return { name: sheetName, tableName, rowCount, columns: cols };
      });
      return successResponse({ tables });
    }

    // Single table
    const cols = schemaSnapshot
      .filter(s => !s.sheet)
      .map(s => ({
        name: s.name,
        type: s.inferred_type || 'text',
        is_primary_key: false,
      }));

    return successResponse({
      tables: [{
        name: 'Data',
        tableName: rawTableName,
        rowCount: (file.row_count as number) ?? 0,
        columns: cols,
      }],
    });
  } catch (error) {
    console.error('Tables route error:', error);
    return errorResponse('Internal server error', 500);
  }
}
