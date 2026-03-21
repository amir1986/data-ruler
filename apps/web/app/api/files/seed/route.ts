import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await req.json();
    const {
      original_name,
      file_type,
      file_category,
      size_bytes,
      row_count,
      column_count,
      processing_status,
      quality_score,
      ai_summary,
    } = body;

    const db = getDb();
    const id = crypto.randomUUID().replace(/-/g, '');

    db.prepare(
      `INSERT INTO files (id, user_id, original_name, stored_path, file_type, file_category, mime_type, size_bytes, content_hash, storage_backend, row_count, column_count, processing_status, quality_score, ai_summary, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      original_name || 'untitled',
      `/data/${user.id}/${id}`,
      file_type || 'unknown',
      file_category || 'other',
      'application/octet-stream',
      size_bytes || 0,
      crypto.randomUUID(),
      'local',
      row_count ?? null,
      column_count ?? null,
      processing_status || 'ready',
      quality_score ?? null,
      ai_summary ?? null,
      '[]',
    );

    return successResponse({ id }, 201);
  } catch (error) {
    console.error('Seed file error:', error);
    return errorResponse('Internal server error', 500);
  }
}
