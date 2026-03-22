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

    if (category === 'tabular') {
      const tableName = file.db_table_name as string;
      if (!tableName) {
        return successResponse({
          type: 'tabular',
          status: 'not_ready',
          message: 'File has not been processed yet',
        });
      }

      const userDb = getUserDb(user.id);
      try {
        const rows = userDb.prepare(
          `SELECT * FROM "${tableName}" LIMIT 100`
        ).all();

        const columns = rows.length > 0
          ? Object.keys(rows[0] as Record<string, unknown>)
          : [];

        return successResponse({
          type: 'tabular',
          columns,
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
