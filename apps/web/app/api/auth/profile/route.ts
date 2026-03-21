import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await req.json();
    const { display_name } = body;

    const db = getDb();

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (display_name !== undefined) {
      updates.push('display_name = ?');
      params.push(display_name);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(user.id);

    db.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).run(...params);

    const updated = db.prepare(
      'SELECT id, email, display_name, created_at, settings FROM users WHERE id = ?'
    ).get(user.id) as Record<string, unknown>;

    return successResponse({
      user: {
        id: updated.id,
        email: updated.email,
        display_name: updated.display_name,
        created_at: updated.created_at,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse('Internal server error', 500);
  }
}
