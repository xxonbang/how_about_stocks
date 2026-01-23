import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json(
      {
        authenticated: true,
        username: payload.username,
        role: payload.role,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Auth status error:', error);
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}
