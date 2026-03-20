import { NextRequest } from 'next/server';
import { hashPassword, generateToken, getUserByEmail, createUser } from '@/lib/auth';
import { errorResponse, successResponse } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, displayName } = body;

    if (!email || !password) {
      return errorResponse('Email and password are required', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email format', 400);
    }

    if (password.length < 8) {
      return errorResponse('Password must be at least 8 characters', 400);
    }

    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return errorResponse('Email already registered', 409);
    }

    const passwordHash = await hashPassword(password);
    const userId = createUser(email, passwordHash, displayName);
    const token = generateToken(userId);

    const response = successResponse(
      { id: userId, email, displayName: displayName || null },
      201
    );

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse('Internal server error', 500);
  }
}
