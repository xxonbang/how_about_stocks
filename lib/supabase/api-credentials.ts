/**
 * Supabase API Credentials 관리
 *
 * 여러 프로젝트에서 공유하는 API 키를 Supabase에서 조회
 * 서버 사이드 전용 (Service Role Key 사용)
 */

import { supabaseServer, isSupabaseServerEnabled } from './server';

export type ServiceName = 'kis' | 'finnhub' | 'twelvedata' | 'fmp' | 'gemini' | 'publicdata';
export type CredentialType = 'app_key' | 'app_secret' | 'api_key' | 'account_no' | 'api_key_1' | 'api_key_2' | 'api_key_3' | 'access_token';
export type Environment = 'production' | 'development' | 'test';

interface ApiCredential {
  id: string;
  service_name: ServiceName;
  credential_type: CredentialType;
  credential_value: string;
  environment: Environment;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

/**
 * 단일 API 키 조회
 *
 * @param serviceName - 서비스 이름 (kis, finnhub, etc.)
 * @param credentialType - 인증 타입 (app_key, api_key, etc.)
 * @param environment - 환경 (production, development, test)
 * @returns 인증 값 또는 null
 *
 * @example
 * const kisAppKey = await getApiCredential('kis', 'app_key');
 * const kisAppSecret = await getApiCredential('kis', 'app_secret');
 */
export async function getApiCredential(
  serviceName: ServiceName,
  credentialType: CredentialType,
  environment: Environment = 'production'
): Promise<string | null> {
  if (!isSupabaseServerEnabled() || !supabaseServer) {
    console.warn('[ApiCredentials] Supabase not configured, returning null');
    return null;
  }

  try {
    const { data, error } = await supabaseServer
      .from('api_credentials')
      .select('credential_value')
      .eq('service_name', serviceName)
      .eq('credential_type', credentialType)
      .eq('environment', environment)
      .eq('is_active', true)
      .single();

    if (error) {
      // PGRST116: 결과 없음 (정상 케이스)
      if (error.code === 'PGRST116') {
        console.log(`[ApiCredentials] No credential found: ${serviceName}/${credentialType}`);
        return null;
      }
      console.error(`[ApiCredentials] Query error:`, error);
      return null;
    }

    return data?.credential_value ?? null;
  } catch (error) {
    console.error(`[ApiCredentials] Failed to get ${serviceName}/${credentialType}:`, error);
    return null;
  }
}

/**
 * 서비스의 모든 API 키 조회
 *
 * @param serviceName - 서비스 이름
 * @param environment - 환경
 * @returns 인증 정보 맵 (type -> value)
 *
 * @example
 * const kisCredentials = await getServiceCredentials('kis');
 * // { app_key: '...', app_secret: '...', account_no: '...' }
 */
export async function getServiceCredentials(
  serviceName: ServiceName,
  environment: Environment = 'production'
): Promise<Record<string, string>> {
  if (!isSupabaseServerEnabled() || !supabaseServer) {
    console.warn('[ApiCredentials] Supabase not configured');
    return {};
  }

  try {
    const { data, error } = await supabaseServer
      .from('api_credentials')
      .select('credential_type, credential_value')
      .eq('service_name', serviceName)
      .eq('environment', environment)
      .eq('is_active', true);

    if (error) {
      console.error(`[ApiCredentials] Query error:`, error);
      return {};
    }

    const result: Record<string, string> = {};
    for (const row of data || []) {
      result[row.credential_type] = row.credential_value;
    }

    return result;
  } catch (error) {
    console.error(`[ApiCredentials] Failed to get ${serviceName} credentials:`, error);
    return {};
  }
}

/**
 * KIS API 키 조회 (편의 함수)
 *
 * @returns KIS API 인증 정보 또는 null
 *
 * @example
 * const kis = await getKISCredentials();
 * if (kis) {
 *   const { appKey, appSecret, accountNo } = kis;
 * }
 */
export async function getKISCredentials(): Promise<{
  appKey: string;
  appSecret: string;
  accountNo?: string;
} | null> {
  // 개별 키만 조회 (access_token 등 불필요한 데이터 로드 방지)
  const [appKey, appSecret, accountNo] = await Promise.all([
    getApiCredential('kis', 'app_key'),
    getApiCredential('kis', 'app_secret'),
    getApiCredential('kis', 'account_no'),
  ]);

  if (!appKey || !appSecret) {
    return null;
  }

  return {
    appKey,
    appSecret,
    accountNo: accountNo ?? undefined,
  };
}

/**
 * API 키 저장/업데이트
 *
 * @param serviceName - 서비스 이름
 * @param credentialType - 인증 타입
 * @param credentialValue - 인증 값
 * @param options - 추가 옵션 (description, environment, expiresAt)
 * @returns 성공 여부
 */
export async function setApiCredential(
  serviceName: ServiceName,
  credentialType: CredentialType,
  credentialValue: string,
  descriptionOrOptions?: string | {
    description?: string;
    environment?: Environment;
    expiresAt?: string;  // ISO 8601 — DB expires_at 컬럼에 저장
  },
  environment: Environment = 'production'
): Promise<boolean> {
  // 기존 호환: 4번째 인자가 string이면 description으로 처리
  const opts = typeof descriptionOrOptions === 'string'
    ? { description: descriptionOrOptions, environment, expiresAt: undefined }
    : { environment, ...descriptionOrOptions };

  if (!isSupabaseServerEnabled() || !supabaseServer) {
    console.warn('[ApiCredentials] Supabase not configured');
    return false;
  }

  try {
    const upsertData: Record<string, unknown> = {
      service_name: serviceName,
      credential_type: credentialType,
      credential_value: credentialValue,
      environment: opts.environment ?? environment,
      description: opts.description || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // expires_at이 제공되면 DB 컬럼에 저장 (DB 레벨 만료 필터링 활용)
    if (opts.expiresAt) {
      upsertData.expires_at = opts.expiresAt;
    }

    const { error } = await supabaseServer
      .from('api_credentials')
      .upsert(upsertData, {
        onConflict: 'service_name,credential_type,environment',
      });

    if (error) {
      console.error(`[ApiCredentials] Upsert error:`, error);
      return false;
    }

    console.log(`[ApiCredentials] Saved ${serviceName}/${credentialType}`);
    return true;
  } catch (error) {
    console.error(`[ApiCredentials] Failed to set ${serviceName}/${credentialType}:`, error);
    return false;
  }
}

/**
 * 유효한 토큰 조회 (DB 레벨 만료 필터링)
 *
 * expires_at 컬럼을 사용하여 DB 쿼리 레벨에서 만료된 토큰을 필터링.
 * JSON 파싱 없이 유효한 토큰만 반환.
 */
export async function getValidToken(
  serviceName: ServiceName,
  environment: Environment = 'production'
): Promise<{ credentialValue: string; expiresAt: string } | null> {
  if (!isSupabaseServerEnabled() || !supabaseServer) {
    return null;
  }

  try {
    const { data, error } = await supabaseServer
      .from('api_credentials')
      .select('credential_value, expires_at')
      .eq('service_name', serviceName)
      .eq('credential_type', 'access_token')
      .eq('environment', environment)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // 결과 없음
      console.error(`[ApiCredentials] getValidToken error:`, error);
      return null;
    }

    if (!data?.credential_value || !data?.expires_at) return null;

    return {
      credentialValue: data.credential_value,
      expiresAt: data.expires_at,
    };
  } catch (error) {
    console.error(`[ApiCredentials] getValidToken failed:`, error);
    return null;
  }
}

/**
 * API 키 비활성화
 */
export async function deactivateApiCredential(
  serviceName: ServiceName,
  credentialType: CredentialType,
  environment: Environment = 'production'
): Promise<boolean> {
  if (!isSupabaseServerEnabled() || !supabaseServer) {
    return false;
  }

  try {
    const { error } = await supabaseServer
      .from('api_credentials')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('service_name', serviceName)
      .eq('credential_type', credentialType)
      .eq('environment', environment);

    if (error) {
      console.error(`[ApiCredentials] Deactivate error:`, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[ApiCredentials] Failed to deactivate:`, error);
    return false;
  }
}

/**
 * 모든 활성 API 키 목록 조회 (민감 정보 제외)
 */
export async function listApiCredentials(
  environment: Environment = 'production'
): Promise<Array<{
  serviceName: string;
  credentialType: string;
  description: string | null;
  isActive: boolean;
  updatedAt: string;
}>> {
  if (!isSupabaseServerEnabled() || !supabaseServer) {
    return [];
  }

  try {
    const { data, error } = await supabaseServer
      .from('api_credentials')
      .select('service_name, credential_type, description, is_active, updated_at')
      .eq('environment', environment)
      .order('service_name')
      .order('credential_type');

    if (error) {
      console.error(`[ApiCredentials] List error:`, error);
      return [];
    }

    return (data || []).map((row) => ({
      serviceName: row.service_name,
      credentialType: row.credential_type,
      description: row.description,
      isActive: row.is_active,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error(`[ApiCredentials] Failed to list:`, error);
    return [];
  }
}
