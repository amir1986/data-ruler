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

    const dashboard = db.prepare(
      'SELECT * FROM dashboards WHERE id = ? AND user_id = ?'
    ).get(id, user.id) as Record<string, unknown> | undefined;

    if (!dashboard) {
      return errorResponse('Dashboard not found', 404);
    }

    return successResponse({
      ...dashboard,
      layout: JSON.parse((dashboard.layout as string) || '[]'),
      widgets: JSON.parse((dashboard.widgets as string) || '[]'),
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
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
    const { title, description, layout, widgets } = body;

    const db = getDb();

    const existing = db.prepare(
      'SELECT id FROM dashboards WHERE id = ? AND user_id = ?'
    ).get(id, user.id);

    if (!existing) {
      return errorResponse('Dashboard not found', 404);
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (layout !== undefined) {
      updates.push('layout = ?');
      params.push(JSON.stringify(layout));
    }

    if (widgets !== undefined) {
      updates.push('widgets = ?');
      params.push(JSON.stringify(widgets));
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, user.id);

    db.prepare(
      `UPDATE dashboards SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    ).run(...params);

    const updated = db.prepare(
      'SELECT * FROM dashboards WHERE id = ?'
    ).get(id) as Record<string, unknown>;

    return successResponse({
      ...updated,
      layout: JSON.parse((updated.layout as string) || '[]'),
      widgets: JSON.parse((updated.widgets as string) || '[]'),
    });
  } catch (error) {
    console.error('Update dashboard error:', error);
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
      'SELECT id FROM dashboards WHERE id = ? AND user_id = ?'
    ).get(id, user.id);

    if (!existing) {
      return errorResponse('Dashboard not found', 404);
    }

    db.prepare('DELETE FROM dashboards WHERE id = ? AND user_id = ?').run(id, user.id);

    return successResponse({ message: 'Dashboard deleted' });
  } catch (error) {
    console.error('Delete dashboard error:', error);
    return errorResponse('Internal server error', 500);
  }
}
