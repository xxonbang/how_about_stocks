/**
 * Supabase 서버 인스턴스 (서버 사이드 전용)
 *
 * Service Role 키를 사용하여 RLS를 우회하고 모든 테이블에 접근 가능
 * 반드시 서버 사이드에서만 사용해야 함 (동적 임포트로 사용)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    '[Supabase Server] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Supabase features will be disabled.'
  );
}

/**
 * Supabase 서버 클라이언트 인스턴스 (Service Role)
 * 환경변수가 없으면 null 반환
 */
export const supabaseServer: SupabaseClient | null = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Supabase 서버 사용 가능 여부
 */
export const isSupabaseServerEnabled = (): boolean => {
  return supabaseServer !== null;
};
