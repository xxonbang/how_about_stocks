/**
 * Supabase 브라우저 클라이언트 (Auth + 일반 용도)
 *
 * @supabase/ssr의 createBrowserClient를 사용하여
 * 쿠키 기반 세션 관리를 자동으로 처리함
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      '[Supabase Client] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  _client = createBrowserClient(url, key);
  return _client;
}

/**
 * 하위 호환용: 기존 코드에서 supabaseClient를 직접 참조하는 경우
 */
export const supabaseClient: SupabaseClient | null = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
})();

export const isSupabaseClientEnabled = (): boolean => {
  return supabaseClient !== null;
};
