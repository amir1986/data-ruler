import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb, getUserDb } from '@/lib/db';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const db = getDb();

    // Get all user files that have been processed (ready or error status)
    const files = db.prepare(
      `SELECT id, original_name, stored_path, db_table_name
       FROM files
       WHERE user_id = ? AND processing_status IN ('ready', 'error')`
    ).all(user.id) as Array<{
      id: string;
      original_name: string;
      stored_path: string;
      db_table_name: string | null;
    }>;

    if (files.length === 0) {
      return errorResponse('No files available to reprocess', 400);
    }

    // Drop existing data tables so they get recreated with new code
    try {
      const userDb = getUserDb(user.id);
      for (const file of files) {
        if (file.db_table_name) {
          // Handle multi-sheet JSON table names
          let tableNames: string[] = [];
          if (file.db_table_name.startsWith('{')) {
            try {
              const mapping = JSON.parse(file.db_table_name);
              tableNames = Object.values(mapping);
            } catch {
              tableNames = [file.db_table_name];
            }
          } else {
            tableNames = [file.db_table_name];
          }
          for (const tbl of tableNames) {
            try {
              userDb.prepare(`DROP TABLE IF EXISTS "${tbl}"`).run();
            } catch {
              // ignore
            }
          }
        }
      }
      userDb.close();
    } catch {
      // user db might not exist yet
    }

    // Reset file statuses and clear old metadata
    const resetStmt = db.prepare(
      `UPDATE files SET
        processing_status = 'pending',
        processing_error = NULL,
        db_table_name = NULL,
        schema_snapshot = NULL,
        row_count = NULL,
        column_count = NULL,
        quality_score = NULL,
        quality_profile = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    );

    for (const file of files) {
      resetStmt.run(file.id, user.id);
    }

    // Trigger AI service processing for each file.
    // Send file bytes so it works with separate storage.
    let triggered = 0;
    for (const file of files) {
      try {
        const filePath = file.stored_path;
        const fs = await import('fs');
        if (filePath && fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
          const formData = new FormData();
          formData.append('file', new Blob([fileBuffer]), file.original_name);
          formData.append('file_id', file.id);
          formData.append('user_id', user.id);
          formData.append('original_name', file.original_name);
          await fetch(`${AI_SERVICE_URL}/api/files/upload-and-process`, {
            method: 'POST',
            body: formData,
          });
        } else {
          // File not on disk — try path-based processing (local dev)
          await fetch(`${AI_SERVICE_URL}/api/files/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_id: file.id,
              user_id: user.id,
              file_path: file.stored_path,
              original_name: file.original_name,
            }),
          });
        }
        triggered++;
      } catch (err) {
        console.error(`Failed to trigger reprocess for ${file.id}:`, err);
      }
    }

    return successResponse({
      message: `Reprocessing ${triggered} of ${files.length} file(s)`,
      file_count: triggered,
    });
  } catch (error) {
    console.error('Reprocess error:', error);
    return errorResponse('Internal server error', 500);
  }
}
