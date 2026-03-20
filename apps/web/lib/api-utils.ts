import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, User } from './auth';
import { getDb } from './db';

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}

export async function getAuthenticatedUser(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get('auth-token')?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const db = getDb();
  const user = db.prepare(
    'SELECT id, email, display_name, created_at, settings FROM users WHERE id = ?'
  ).get(payload.userId) as User | undefined;

  return user || null;
}

export function requireAuth(handler: (req: NextRequest, user: User) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }
    return handler(req, user);
  };
}
