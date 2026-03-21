import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseReport(report: Record<string, unknown>) {
  return {
    ...report,
    file_ids: JSON.parse((report.file_ids as string) || '[]'),
    content: JSON.parse((report.content as string) || '{}'),
    config: JSON.parse((report.config as string) || '{}'),
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await context.params;
    const db = getDb();

    const report = db.prepare(
      'SELECT * FROM reports WHERE id = ? AND user_id = ?'
    ).get(id, user.id) as Record<string, unknown> | undefined;

    if (!report) {
      return errorResponse('Report not found', 404);
    }

    return successResponse({ report: parseReport(report) });
  } catch (error) {
    console.error('Get report error:', error);
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
    const { title, description, status, content, config, file_ids } = body;

    const db = getDb();

    const existing = db.prepare(
      'SELECT id FROM reports WHERE id = ? AND user_id = ?'
    ).get(id, user.id);

    if (!existing) {
      return errorResponse('Report not found', 404);
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
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (content !== undefined) {
      updates.push('content = ?');
      params.push(JSON.stringify(content));
    }
    if (config !== undefined) {
      updates.push('config = ?');
      params.push(JSON.stringify(config));
    }
    if (file_ids !== undefined) {
      updates.push('file_ids = ?');
      params.push(JSON.stringify(file_ids));
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, user.id);

    db.prepare(
      `UPDATE reports SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    ).run(...params);

    const updated = db.prepare(
      'SELECT * FROM reports WHERE id = ?'
    ).get(id) as Record<string, unknown>;

    return successResponse({ report: parseReport(updated) });
  } catch (error) {
    console.error('Update report error:', error);
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
      'SELECT id FROM reports WHERE id = ? AND user_id = ?'
    ).get(id, user.id);

    if (!existing) {
      return errorResponse('Report not found', 404);
    }

    db.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').run(id, user.id);

    return successResponse({ message: 'Report deleted' });
  } catch (error) {
    console.error('Delete report error:', error);
    return errorResponse('Internal server error', 500);
  }
}
