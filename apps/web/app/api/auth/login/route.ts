import { NextRequest } from 'next/server';
import { verifyPassword, generateToken, getUserByEmail } from '@/lib/auth';
import { errorResponse, successResponse } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse('Email and password are required', 400);
    }

    const user = getUserByEmail(email);
    if (!user) {
      return errorResponse('Invalid email or password', 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return errorResponse('Invalid email or password', 401);
    }

    const token = generateToken(user.id);

    const response = successResponse({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Internal server error', 500);
  }
}
