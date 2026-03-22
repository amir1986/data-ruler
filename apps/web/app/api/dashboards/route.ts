import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import { safeJsonParse } from '@/lib/utils';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const db = getDb();
    const dashboards = db.prepare(
      `SELECT id, title, description, is_auto_generated, created_at, updated_at
       FROM dashboards WHERE user_id = ?
       ORDER BY updated_at DESC`
    ).all(user.id) as Record<string, unknown>[];

    return successResponse({ dashboards });
  } catch (error) {
    console.error('List dashboards error:', error);
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
    const { title, description } = body;

    const db = getDb();
    const id = crypto.randomUUID().replace(/-/g, '');

    db.prepare(
      `INSERT INTO dashboards (id, user_id, title, description)
       VALUES (?, ?, ?, ?)`
    ).run(id, user.id, title || 'Untitled Dashboard', description || null);

    const dashboard = db.prepare(
      'SELECT * FROM dashboards WHERE id = ?'
    ).get(id) as Record<string, unknown>;

    return successResponse({
      ...dashboard,
      layout: safeJsonParse(dashboard.layout as string, []),
      widgets: safeJsonParse(dashboard.widgets as string, []),
    }, 201);
  } catch (error) {
    console.error('Create dashboard error:', error);
    return errorResponse('Internal server error', 500);
  }
}
