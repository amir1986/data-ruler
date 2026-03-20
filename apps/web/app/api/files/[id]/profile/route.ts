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

    const file = db.prepare(
      `SELECT id, original_name, quality_profile, quality_score, processing_status
       FROM files WHERE id = ? AND user_id = ?`
    ).get(id, user.id) as Record<string, unknown> | undefined;

    if (!file) {
      return errorResponse('File not found', 404);
    }

    if (file.processing_status === 'pending' || file.processing_status === 'processing') {
      return successResponse({
        fileId: file.id,
        fileName: file.original_name,
        status: file.processing_status,
        profile: null,
        message: 'Quality profile is not yet available. File is still being processed.',
      });
    }

    return successResponse({
      fileId: file.id,
      fileName: file.original_name,
      status: file.processing_status,
      qualityScore: file.quality_score,
      profile: file.quality_profile ? JSON.parse(file.quality_profile as string) : null,
    });
  } catch (error) {
    console.error('File profile error:', error);
    return errorResponse('Internal server error', 500);
  }
}
