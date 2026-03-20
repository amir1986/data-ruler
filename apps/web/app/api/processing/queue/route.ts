import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const db = getDb();

    const tasks = db.prepare(
      `SELECT
        pt.id,
        pt.file_id,
        pt.task_type,
        pt.status,
        pt.priority,
        pt.agent_name,
        pt.started_at,
        pt.completed_at,
        pt.error_message,
        pt.retry_count,
        pt.created_at,
        f.original_name as file_name,
        f.file_category
       FROM processing_tasks pt
       JOIN files f ON f.id = pt.file_id
       WHERE pt.user_id = ?
       ORDER BY
         CASE pt.status
           WHEN 'processing' THEN 0
           WHEN 'pending' THEN 1
           WHEN 'completed' THEN 2
           WHEN 'failed' THEN 3
         END,
         pt.priority ASC,
         pt.created_at DESC`
    ).all(user.id) as Record<string, unknown>[];

    const summary = db.prepare(
      `SELECT
        status,
        COUNT(*) as count
       FROM processing_tasks
       WHERE user_id = ?
       GROUP BY status`
    ).all(user.id) as { status: string; count: number }[];

    const statusCounts: Record<string, number> = {};
    for (const row of summary) {
      statusCounts[row.status] = row.count;
    }

    return successResponse({
      tasks: tasks.map((t) => ({
        ...t,
        result: undefined,
      })),
      summary: {
        pending: statusCounts['pending'] || 0,
        processing: statusCounts['processing'] || 0,
        completed: statusCounts['completed'] || 0,
        failed: statusCounts['failed'] || 0,
        total: tasks.length,
      },
    });
  } catch (error) {
    console.error('Processing queue error:', error);
    return errorResponse('Internal server error', 500);
  }
}
