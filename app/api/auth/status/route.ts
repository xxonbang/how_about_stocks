import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json(
      {
        authenticated: true,
        username:
          (user.user_metadata?.username as string) ?? user.email ?? '',
        role: (user.user_metadata?.role as string) ?? 'user',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Auth status error:', error);
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}
