import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import path from 'path';
import fs from 'fs';

const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(process.cwd(), '../../data/uploads');
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), '../../data/databases');

function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let totalSize = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalSize += getDirSize(fullPath);
    } else {
      try {
        totalSize += fs.statSync(fullPath).size;
      } catch {
        // Skip files we can't stat
      }
    }
  }
  return totalSize;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const db = getDb();

    // Get total file size from database
    const fileSizeRow = db.prepare(
      'SELECT COALESCE(SUM(size_bytes), 0) as total FROM files WHERE user_id = ?'
    ).get(user.id) as { total: number };

    // Get file count
    const fileCountRow = db.prepare(
      'SELECT COUNT(*) as count FROM files WHERE user_id = ?'
    ).get(user.id) as { count: number };

    // Get actual disk usage for user uploads
    const userUploadDir = path.join(UPLOAD_PATH, user.id);
    const uploadDiskUsage = getDirSize(userUploadDir);

    // Get user database size
    const userDbDir = path.join(DB_PATH, user.id);
    const dbDiskUsage = getDirSize(userDbDir);

    const totalDiskUsage = uploadDiskUsage + dbDiskUsage;

    return successResponse({
      storage: {
        file_count: fileCountRow.count,
        total_file_size: fileSizeRow.total,
        upload_disk_usage: uploadDiskUsage,
        database_disk_usage: dbDiskUsage,
        total_disk_usage: totalDiskUsage,
      },
    });
  } catch (error) {
    console.error('Storage usage error:', error);
    return errorResponse('Internal server error', 500);
  }
}
