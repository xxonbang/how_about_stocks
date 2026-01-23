import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json(
    { success: true, message: '로그아웃 성공' },
    { status: 200 }
  );

  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });

  return response;
}
