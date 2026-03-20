import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';

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

    const note = db.prepare(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?'
    ).get(id, user.id);

    if (!note) {
      return errorResponse('Note not found', 404);
    }

    return successResponse(note);
  } catch (error) {
    console.error('Get note error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await context.params;
    const body = await req.json();
    const { title, content } = body;

    const db = getDb();

    const existing = db.prepare(
      'SELECT id FROM notes WHERE id = ? AND user_id = ?'
    ).get(id, user.id);

    if (!existing) {
      return errorResponse('Note not found', 404);
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, user.id);

    db.prepare(
      `UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    ).run(...params);

    const updated = db.prepare(
      'SELECT * FROM notes WHERE id = ?'
    ).get(id);

    return successResponse(updated);
  } catch (error) {
    console.error('Update note error:', error);
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

    const existing = db.prepare(
      'SELECT id FROM notes WHERE id = ? AND user_id = ?'
    ).get(id, user.id);

    if (!existing) {
      return errorResponse('Note not found', 404);
    }

    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, user.id);

    return successResponse({ message: 'Note deleted' });
  } catch (error) {
    console.error('Delete note error:', error);
    return errorResponse('Internal server error', 500);
  }
}
