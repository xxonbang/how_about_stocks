import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const AUTH_COOKIE_NAME = 'auth-token';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
);

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

const PUBLIC_FILE_EXTENSIONS = [
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.gif',
  '.webp',
  '.css',
  '.js',
  '.woff',
  '.woff2',
  '.ttf',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return true;
  }

  if (pathname.startsWith('/_next/')) {
    return true;
  }

  if (PUBLIC_FILE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return true;
  }

  return false;
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isValid = await verifyToken(token);

  if (!isValid) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
