import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import { safeJsonParse } from '@/lib/utils';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const db = getDb();

    const countRow = db.prepare(
      'SELECT COUNT(*) as total FROM chat_messages WHERE user_id = ?'
    ).get(user.id) as { total: number };

    const messages = db.prepare(
      `SELECT id, role, content, context_file_id, context_dashboard_id, metadata, created_at
       FROM chat_messages WHERE user_id = ?
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`
    ).all(user.id, limit, offset) as Record<string, unknown>[];

    return successResponse({
      messages: messages.map((m) => ({
        ...m,
        metadata: safeJsonParse(m.metadata as string | undefined, null),
      })),
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limit),
      },
    });
  } catch (error) {
    console.error('Chat history error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const db = getDb();
    const result = db.prepare(
      'DELETE FROM chat_messages WHERE user_id = ?'
    ).run(user.id);

    return successResponse({
      message: 'Chat history cleared',
      deletedCount: result.changes,
    });
  } catch (error) {
    console.error('Clear chat history error:', error);
    return errorResponse('Internal server error', 500);
  }
}
