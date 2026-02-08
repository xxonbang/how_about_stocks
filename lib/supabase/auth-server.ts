/**
 * Supabase 서버용 Auth 클라이언트
 *
 * Server Component, Route Handler에서 사용
 * cookies()를 통해 세션을 읽고 갱신함
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createAuthServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출 시 쿠키 설정 불가 (읽기 전용)
            // Route Handler / Server Action에서는 정상 동작
          }
        },
      },
    }
  );
}
