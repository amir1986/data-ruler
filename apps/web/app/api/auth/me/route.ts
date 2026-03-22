import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { safeJsonParse } from '@/lib/utils';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    return successResponse({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
      settings: safeJsonParse(user.settings, {}),
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return errorResponse('Internal server error', 500);
  }
}
