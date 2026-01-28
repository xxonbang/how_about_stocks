/**
 * Supabase 클라이언트 인스턴스 (브라우저/클라이언트용)
 *
 * 공개 익명 키를 사용하며, RLS 정책에 따라 접근 제어됨
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase Client] Missing SUPABASE_URL or SUPABASE_ANON_KEY. Supabase features will be disabled.'
  );
}

/**
 * Supabase 클라이언트 인스턴스
 * 환경변수가 없으면 null 반환
 */
export const supabaseClient: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Supabase 클라이언트 사용 가능 여부
 */
export const isSupabaseClientEnabled = (): boolean => {
  return supabaseClient !== null;
};
