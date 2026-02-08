import { createAuthServerClient } from '@/lib/supabase/auth-server';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export async function getSession(): Promise<AuthUser | null> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? '',
    username: (user.user_metadata?.username as string) ?? user.email ?? '',
    role: (user.user_metadata?.role as string) ?? 'user',
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}
