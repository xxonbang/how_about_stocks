import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
);

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

export const AUTH_COOKIE_NAME = 'auth-token';
const TOKEN_EXPIRY = '24h';

export interface JWTPayload {
  username: string;
  role: 'admin';
  iat: number;
  exp: number;
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  if (username !== ADMIN_USERNAME) {
    return false;
  }

  if (!ADMIN_PASSWORD_HASH) {
    console.error('ADMIN_PASSWORD_HASH 환경변수가 설정되지 않았습니다.');
    return false;
  }

  return bcrypt.compare(password, ADMIN_PASSWORD_HASH);
}

export async function createToken(username: string): Promise<string> {
  const token = await new SignJWT({ username, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return token;
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}
