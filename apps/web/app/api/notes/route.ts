import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const db = getDb();
    const notes = db.prepare(
      `SELECT id, title, content, content_format, file_id, created_at, updated_at
       FROM notes WHERE user_id = ?
       ORDER BY updated_at DESC`
    ).all(user.id);

    return successResponse({ notes });
  } catch (error) {
    console.error('List notes error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await req.json();
    const { title, content, fileId } = body;

    // Verify file ownership if fileId provided
    if (fileId) {
      const db = getDb();
      const file = db.prepare(
        'SELECT id FROM files WHERE id = ? AND user_id = ?'
      ).get(fileId, user.id);
      if (!file) {
        return errorResponse('File not found', 404);
      }
    }

    const db = getDb();
    const id = crypto.randomUUID().replace(/-/g, '');

    db.prepare(
      `INSERT INTO notes (id, user_id, title, content, file_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, user.id, title || 'Untitled Note', content || '', fileId || null);

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);

    return successResponse(note, 201);
  } catch (error) {
    console.error('Create note error:', error);
    return errorResponse('Internal server error', 500);
  }
}
