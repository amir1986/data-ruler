import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

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

    return successResponse({
      ...file,
      tags: JSON.parse((file.tags as string) || '[]'),
      quality_profile: file.quality_profile ? JSON.parse(file.quality_profile as string) : null,
      schema_snapshot: file.schema_snapshot ? JSON.parse(file.schema_snapshot as string) : null,
      processing_log: file.processing_log ? JSON.parse(file.processing_log as string) : null,
      media_metadata: file.media_metadata ? JSON.parse(file.media_metadata as string) : null,
    });
  } catch (error) {
    console.error('Get file error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await context.params;
    const body = await req.json();
    const { name, tags, folder_path } = body;

    const db = getDb();

    const file = db.prepare(
      `SELECT id FROM files WHERE id = ? AND user_id = ?`
    ).get(id, user.id);

    if (!file) {
      return errorResponse('File not found', 404);
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (name !== undefined) {
      updates.push('original_name = ?');
      params.push(name);
    }

    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(tags));
    }

    if (folder_path !== undefined) {
      updates.push('folder_path = ?');
      params.push(folder_path);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, user.id);

    db.prepare(
      `UPDATE files SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    ).run(...params);

    const updated = db.prepare(
      `SELECT * FROM files WHERE id = ? AND user_id = ?`
    ).get(id, user.id) as Record<string, unknown>;

    return successResponse({
      ...updated,
      tags: JSON.parse((updated.tags as string) || '[]'),
    });
  } catch (error) {
    console.error('Update file error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await context.params;
    const db = getDb();

    const file = db.prepare(
      `SELECT id, stored_path FROM files WHERE id = ? AND user_id = ?`
    ).get(id, user.id) as { id: string; stored_path: string } | undefined;

    if (!file) {
      return errorResponse('File not found', 404);
    }

    // Delete physical file and its directory
    try {
      const dir = path.dirname(file.stored_path);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('Failed to delete physical file:', err);
    }

    // Delete from database (cascades to related records)
    db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(id, user.id);

    return successResponse({ message: 'File deleted' });
  } catch (error) {
    console.error('Delete file error:', error);
    return errorResponse('Internal server error', 500);
  }
}
