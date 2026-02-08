import { NextRequest, NextResponse } from 'next/server';
import { createAuthMiddlewareClient } from '@/lib/supabase/auth-middleware';

const PUBLIC_PATHS = ['/login', '/signup', '/auth/callback', '/api/auth/status', '/api/health'];

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createAuthMiddlewareClient(request, response);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
