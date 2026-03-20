import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-utils';

export async function POST(_req: NextRequest) {
  const response = successResponse({ message: 'Logged out' });

  response.cookies.set('auth-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
