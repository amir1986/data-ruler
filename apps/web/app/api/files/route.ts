import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

    const allowedSorts = ['created_at', 'updated_at', 'original_name', 'size_bytes', 'file_category'];
    const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at';

    const conditions: string[] = ['user_id = ?'];
    const params: (string | number)[] = [user.id];

    if (category) {
      conditions.push('file_category = ?');
      params.push(category);
    }

    if (status) {
      conditions.push('processing_status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('original_name LIKE ?');
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');
    const offset = (page - 1) * limit;

    const db = getDb();

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM files WHERE ${whereClause}`
    ).get(...params) as { total: number };

    const files = db.prepare(
      `SELECT id, original_name, file_type, file_category, mime_type, size_bytes,
              content_hash, processing_status, quality_score, ai_summary,
              folder_path, tags, created_at, updated_at
       FROM files WHERE ${whereClause}
       ORDER BY ${sortColumn} ${order}
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return successResponse({
      files: (files as Record<string, unknown>[]).map((f) => ({
        ...f,
        tags: JSON.parse((f.tags as string) || '[]'),
      })),
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limit),
      },
    });
  } catch (error) {
    console.error('List files error:', error);
    return errorResponse('Internal server error', 500);
  }
}
