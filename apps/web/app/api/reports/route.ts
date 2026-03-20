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
    const reports = db.prepare(
      `SELECT id, title, description, template, status, file_ids, created_at, updated_at
       FROM reports WHERE user_id = ?
       ORDER BY updated_at DESC`
    ).all(user.id) as Record<string, unknown>[];

    const parsed = reports.map((r) => ({
      ...r,
      file_ids: JSON.parse((r.file_ids as string) || '[]'),
    }));

    return successResponse({ reports: parsed });
  } catch (error) {
    console.error('List reports error:', error);
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
    const { title, description, template, file_ids } = body;

    const db = getDb();
    const id = crypto.randomUUID().replace(/-/g, '');

    db.prepare(
      `INSERT INTO reports (id, user_id, title, description, template, file_ids)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      title || 'Untitled Report',
      description || null,
      template || 'executive_summary',
      JSON.stringify(file_ids || [])
    );

    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Record<string, unknown>;

    return successResponse({
      report: {
        ...report,
        file_ids: JSON.parse((report.file_ids as string) || '[]'),
        content: JSON.parse((report.content as string) || '{}'),
        config: JSON.parse((report.config as string) || '{}'),
      },
    }, 201);
  } catch (error) {
    console.error('Create report error:', error);
    return errorResponse('Internal server error', 500);
  }
}
