import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb, getUserDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await req.json();
    const { query, fileId } = body;

    if (!query || typeof query !== 'string') {
      return errorResponse('Query is required', 400);
    }

    // Only allow read-only queries
    const trimmed = query.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH') && !trimmed.startsWith('PRAGMA')) {
      return errorResponse('Only read-only SELECT queries are allowed', 400);
    }

    const disallowed = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'ATTACH', 'DETACH'];
    for (const keyword of disallowed) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(query)) {
        return errorResponse(`Query contains disallowed keyword: ${keyword}`, 400);
      }
    }

    // If fileId is provided, verify user owns that file
    if (fileId) {
      const db = getDb();
      const file = db.prepare(
        'SELECT id FROM files WHERE id = ? AND user_id = ?'
      ).get(fileId, user.id);

      if (!file) {
        return errorResponse('File not found', 404);
      }
    }

    const userDb = getUserDb(user.id);
    try {
      const stmt = userDb.prepare(query);
      const rows = stmt.all() as Record<string, unknown>[];

      const columns = rows.length > 0
        ? Object.keys(rows[0]).map((name) => ({
            name,
            type: typeof rows[0][name],
          }))
        : [];

      return successResponse({
        columns,
        rows,
        rowCount: rows.length,
      });
    } finally {
      userDb.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query execution failed';
    console.error('Query error:', error);
    return errorResponse(`Query error: ${message}`, 400);
  }
}
