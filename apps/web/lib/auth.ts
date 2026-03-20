import { getDb } from './db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'default-secret-change-me';
const TOKEN_EXPIRY = '7d';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  settings: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const db = getDb();
  const user = db.prepare(
    'SELECT id, email, display_name, created_at, settings FROM users WHERE id = ?'
  ).get(payload.userId) as User | undefined;

  return user || null;
}

export function createUser(email: string, passwordHash: string, displayName?: string) {
  const db = getDb();
  const id = crypto.randomUUID().replace(/-/g, '');
  db.prepare(
    'INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)'
  ).run(id, email, passwordHash, displayName || null);
  return id;
}

export function getUserByEmail(email: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as (User & { password_hash: string }) | undefined;
}
