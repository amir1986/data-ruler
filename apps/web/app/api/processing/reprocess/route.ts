import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const db = getDb();

    // Get all user files that have been processed (ready or error status)
    const files = db.prepare(
      `SELECT id, original_name, file_category
       FROM files
       WHERE user_id = ? AND processing_status IN ('ready', 'error')`
    ).all(user.id) as Array<{ id: string; original_name: string; file_category: string }>;

    if (files.length === 0) {
      return errorResponse('No files available to reprocess', 400);
    }

    // Reset file statuses to pending
    const resetStmt = db.prepare(
      `UPDATE files SET processing_status = 'pending', processing_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    );

    // Create processing tasks for each file
    const insertTask = db.prepare(
      `INSERT INTO processing_tasks (id, user_id, file_id, task_type, status, priority)
       VALUES (?, ?, ?, ?, 'pending', 5)`
    );

    const reprocessTransaction = db.transaction(() => {
      for (const file of files) {
        resetStmt.run(file.id, user.id);
        const taskId = crypto.randomUUID().replace(/-/g, '');
        insertTask.run(taskId, user.id, file.id, 'reprocess');
      }
    });

    reprocessTransaction();

    return successResponse({
      message: `Queued ${files.length} file(s) for reprocessing`,
      file_count: files.length,
    });
  } catch (error) {
    console.error('Reprocess error:', error);
    return errorResponse('Internal server error', 500);
  }
}
