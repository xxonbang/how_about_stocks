/**
 * 한국투자증권 Open API를 사용한 한국 주식 데이터 수집
 *
 * 특징:
 * - 국내 최초 증권사 공식 Open API (2022년 출시)
 * - REST API + WebSocket 지원
 * - 실시간 시세 데이터 제공
 * - OCX 없이 서버사이드에서 사용 가능
 *
 * API 문서: https://apiportal.koreainvestment.com
 * GitHub: https://github.com/koreainvestment/open-trading-api
 *
 * 키 관리 우선순위:
 * 1. Supabase api_credentials 테이블 (여러 프로젝트에서 공유)
 * 2. 환경변수 (KIS_APP_KEY, KIS_APP_SECRET) - Fallback
 *
 * Supabase 키가 유효하지 않으면 환경변수로 대체 후 Supabase 업데이트
 */

import axios from 'axios';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { cleanKoreanSymbol } from './constants';

// 환경변수 (Fallback용)
const ENV_KIS_APP_KEY = process.env.KIS_APP_KEY || '';
const ENV_KIS_APP_SECRET = process.env.KIS_APP_SECRET || '';
const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443'; // 실전 투자

// ========== KIS 키 관리 (Supabase 우선) ==========

interface KISCredentials {
  appKey: string;
  appSecret: string;
  source: 'supabase' | 'env';
}

// 메모리 캐시 (키 조회 최소화)
let cachedCredentials: KISCredentials | null = null;
let credentialsValidated = false;

/**
 * Supabase에서 KIS 키 조회
 */
async function getKISCredentialsFromSupabase(): Promise<KISCredentials | null> {
  try {
    // 동적 import로 순환 참조 방지
    const { getKISCredentials } = await import('./supabase/api-credentials');
    const credentials = await getKISCredentials();

    if (credentials?.appKey && credentials?.appSecret) {
      console.log('[KIS] Supabase에서 키 조회 성공');
      return {
        appKey: credentials.appKey,
        appSecret: credentials.appSecret,
        source: 'supabase',
      };
    }

    console.log('[KIS] Supabase에 키 없음');
    return null;
  } catch (error) {
    console.warn('[KIS] Supabase 키 조회 실패:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 환경변수에서 KIS 키 조회
 */
function getKISCredentialsFromEnv(): KISCredentials | null {
  if (ENV_KIS_APP_KEY && ENV_KIS_APP_SECRET) {
    console.log('[KIS] 환경변수에서 키 조회 성공');
    return {
      appKey: ENV_KIS_APP_KEY,
      appSecret: ENV_KIS_APP_SECRET,
      source: 'env',
    };
  }

  console.warn('[KIS] 환경변수에 키 없음');
  return null;
}

/**
 * Supabase에 KIS 키 저장/업데이트
 */
async function saveKISCredentialsToSupabase(appKey: string, appSecret: string): Promise<boolean> {
  try {
    const { setApiCredential } = await import('./supabase/api-credentials');

    const [keyResult, secretResult] = await Promise.all([
      setApiCredential('kis', 'app_key', appKey, '한국투자증권 앱 키 (자동 갱신)'),
      setApiCredential('kis', 'app_secret', appSecret, '한국투자증권 앱 시크릿 (자동 갱신)'),
    ]);

    if (keyResult && secretResult) {
      console.log('[KIS] Supabase에 키 저장/갱신 완료');
      return true;
    }

    console.warn('[KIS] Supabase 키 저장 부분 실패');
    return false;
  } catch (error) {
    console.error('[KIS] Supabase 키 저장 실패:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * KIS API 키로 토큰 발급 테스트 (키 유효성 검증)
 * 발급받은 토큰을 반환하여 재활용 (토큰 낭비 방지)
 */
async function validateKISCredentialsWithToken(
  appKey: string,
  appSecret: string
): Promise<CachedTokenData | null> {
  try {
    const response = await axios.post<KISTokenResponse>(
      `${KIS_BASE_URL}/oauth2/tokenP`,
      {
        grant_type: 'client_credentials',
        appkey: appKey,
        appsecret: appSecret,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    if (response.data?.access_token) {
      const { access_token, expires_in } = response.data;
      const now = Date.now();
      return {
        token: access_token,
        expiresAt: now + expires_in * 1000,
        issuedAt: now,
      };
    }

    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.warn('[KIS] 키 검증 실패:', error.response?.data?.error_description || error.message);
    }
    return null;
  }
}

/**
 * KIS 키 조회 (Supabase 우선, 환경변수 Fallback, 자동 갱신)
 *
 * 로직:
 * 1. Supabase에서 키 조회
 * 2. Supabase 키로 토큰 발급 테스트
 * 3. 실패 시 환경변수로 Fallback
 * 4. 환경변수 키가 유효하면 Supabase 업데이트
 */
async function getKISCredentials(): Promise<KISCredentials> {
  // 이미 검증된 캐시가 있으면 사용
  if (cachedCredentials && credentialsValidated) {
    return cachedCredentials;
  }

  // 1. Supabase에서 조회
  const supabaseCredentials = await getKISCredentialsFromSupabase();

  if (supabaseCredentials) {
    // 2. Supabase 키 유효성 검증 (발급된 토큰을 캐시에 저장하여 재활용)
    console.log('[KIS] Supabase 키 유효성 검증 중...');
    const tokenResult = await validateKISCredentialsWithToken(
      supabaseCredentials.appKey,
      supabaseCredentials.appSecret
    );

    if (tokenResult) {
      console.log('[KIS] Supabase 키 유효 - 사용 (검증 토큰 캐시 저장)');
      cachedCredentials = supabaseCredentials;
      credentialsValidated = true;

      // 검증 시 발급받은 토큰을 모든 캐시 계층에 저장 (토큰 낭비 방지)
      cachedToken = tokenResult;
      saveTokenToFile(tokenResult);
      saveTokenToSupabase(tokenResult);

      return supabaseCredentials;
    }

    console.warn('[KIS] Supabase 키 유효하지 않음 - 환경변수로 Fallback');
  }

  // 3. 환경변수로 Fallback
  const envCredentials = getKISCredentialsFromEnv();

  if (!envCredentials) {
    throw new Error('KIS API 키가 설정되지 않았습니다. (Supabase 및 환경변수 모두 없음)');
  }

  // 4. 환경변수 키 유효성 검증 (발급된 토큰을 캐시에 저장하여 재활용)
  console.log('[KIS] 환경변수 키 유효성 검증 중...');
  const envTokenResult = await validateKISCredentialsWithToken(
    envCredentials.appKey,
    envCredentials.appSecret
  );

  if (!envTokenResult) {
    throw new Error('KIS API 키가 유효하지 않습니다. (환경변수 키도 무효)');
  }

  console.log('[KIS] 환경변수 키 유효 - 사용 (검증 토큰 캐시 저장)');
  cachedCredentials = envCredentials;
  credentialsValidated = true;

  // 검증 시 발급받은 토큰을 모든 캐시 계층에 저장
  cachedToken = envTokenResult;
  saveTokenToFile(envTokenResult);
  saveTokenToSupabase(envTokenResult);

  // 5. Supabase에 유효한 키 저장/갱신 (비동기, 실패해도 무시)
  if (!supabaseCredentials || supabaseCredentials.appKey !== envCredentials.appKey) {
    console.log('[KIS] Supabase에 유효한 키 동기화 시작...');
    saveKISCredentialsToSupabase(envCredentials.appKey, envCredentials.appSecret).catch(() => {
      // 저장 실패해도 동작에는 영향 없음
    });
  }

  return envCredentials;
}

/**
 * 키 캐시 초기화 (키 변경 시 호출)
 */
export function invalidateKISCredentialsCache(): void {
  cachedCredentials = null;
  credentialsValidated = false;
  console.log('[KIS] 키 캐시 초기화됨');
}

// 토큰 캐시 파일 경로 결정
// - 로컬 개발: .cache 디렉토리 (영구 보존)
// - 프로덕션 (Render/Docker): /tmp 디렉토리 (컨테이너 내 쓰기 가능)
// - 서버리스 (Vercel): /tmp 디렉토리 (유일하게 쓰기 가능한 경로)
function getTokenCachePath(): { dir: string; file: string } {
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL;
  const isRender = !!process.env.RENDER;

  // 프로덕션 또는 클라우드 환경에서는 /tmp 사용
  if (isProduction || isVercel || isRender) {
    const dir = '/tmp/kis-cache';
    return { dir, file: join(dir, 'kis-token.json') };
  }

  // 로컬 개발 환경에서는 .cache 사용 (git에서 제외됨)
  const dir = join(process.cwd(), '.cache');
  return { dir, file: join(dir, 'kis-token.json') };
}

const { dir: TOKEN_CACHE_DIR, file: TOKEN_CACHE_FILE } = getTokenCachePath();

// 토큰 캐시 데이터 구조
interface CachedTokenData {
  token: string;
  expiresAt: number;   // Unix ms — 토큰 만료 시점
  issuedAt: number;    // Unix ms — 토큰 발급 시점 (Rate Limit 체크용)
}

// 메모리 캐시 (파일 읽기 최소화, 가장 빠른 캐시)
let cachedToken: CachedTokenData | null = null;

// 파일 캐시 사용 가능 여부 (한 번 실패하면 비활성화)
let fileCacheEnabled = true;

/**
 * 파일에서 토큰 로드 (서버 재시작 시 복원)
 */
function loadTokenFromFile(): CachedTokenData | null {
  if (!fileCacheEnabled) return null;

  try {
    if (existsSync(TOKEN_CACHE_FILE)) {
      const data = JSON.parse(readFileSync(TOKEN_CACHE_FILE, 'utf-8'));
      // 만료 여부 확인 (10분 여유)
      if (data.expiresAt > Date.now() + 10 * 60 * 1000) {
        const remainingMinutes = Math.round((data.expiresAt - Date.now()) / 1000 / 60);
        console.log(`[KIS] 파일에서 토큰 복원 성공 (만료까지 ${remainingMinutes}분, 경로: ${TOKEN_CACHE_FILE})`);
        return {
          token: data.token,
          expiresAt: data.expiresAt,
          issuedAt: data.issuedAt ?? 0,  // 이전 형식 호환
        };
      } else {
        console.log('[KIS] 저장된 토큰이 만료됨');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT') === false) {
      console.warn(`[KIS] 토큰 파일 로드 실패 (파일 캐시 비활성화): ${message}`);
      fileCacheEnabled = false;
    }
  }
  return null;
}

/**
 * 토큰을 파일에 저장 (서버 재시작 대비)
 */
function saveTokenToFile(tokenData: CachedTokenData): void {
  if (!fileCacheEnabled) {
    console.log('[KIS] 파일 캐시 비활성화 상태 - 메모리 캐시만 사용');
    return;
  }

  try {
    if (!existsSync(TOKEN_CACHE_DIR)) {
      mkdirSync(TOKEN_CACHE_DIR, { recursive: true });
    }
    writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(tokenData), 'utf-8');
    console.log(`[KIS] 토큰 파일 저장 완료 (경로: ${TOKEN_CACHE_FILE})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[KIS] 토큰 파일 저장 실패 (파일 캐시 비활성화): ${message}`);
    fileCacheEnabled = false;
  }
}

// ========== Supabase 토큰 캐시 (서버리스 인스턴스간 공유) ==========

/**
 * Supabase에서 유효 토큰 로드 (DB 레벨 만료 필터링)
 *
 * DB의 expires_at 컬럼으로 만료 토큰을 쿼리 시점에 필터링.
 * 서버리스 환경(Vercel)에서 메모리/파일 캐시가 초기화되어도 토큰 재사용 가능.
 */
async function loadTokenFromSupabase(): Promise<CachedTokenData | null> {
  try {
    const { getValidToken } = await import('./supabase/api-credentials');
    const result = await getValidToken('kis');

    if (!result) return null;

    // 표준화된 JSON 형식: { access_token, expires_at (ISO), issued_at (ISO) }
    const parsed: {
      access_token: string;
      expires_at: string;
      issued_at: string;
    } = JSON.parse(result.credentialValue);

    if (!parsed.access_token) return null;

    const expiresAt = new Date(parsed.expires_at).getTime();
    const issuedAt = new Date(parsed.issued_at).getTime();

    // 추가 안전 체크: 만료 10분 전까지만 사용
    if (expiresAt <= Date.now() + 10 * 60 * 1000) {
      console.log('[KIS] Supabase 토큰 만료 임박 - 재발급 필요');
      return null;
    }

    const remainingMinutes = Math.round((expiresAt - Date.now()) / 1000 / 60);
    console.log(`[KIS] Supabase에서 토큰 복원 성공 (만료까지 ${remainingMinutes}분)`);

    return { token: parsed.access_token, expiresAt, issuedAt };
  } catch (error) {
    console.warn('[KIS] Supabase 토큰 로드 실패:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Supabase에 토큰 저장 (비동기, fire-and-forget)
 *
 * 표준화된 JSON 형식으로 저장:
 * { access_token, expires_at (ISO), issued_at (ISO) }
 *
 * DB expires_at 컬럼에도 만료시간 저장 → DB 레벨 만료 필터링 가능
 */
function saveTokenToSupabase(tokenData: CachedTokenData): void {
  const expiresAtISO = new Date(tokenData.expiresAt).toISOString();
  const issuedAtISO = new Date(tokenData.issuedAt).toISOString();

  import('./supabase/api-credentials')
    .then(({ setApiCredential }) => {
      const credentialValue = JSON.stringify({
        access_token: tokenData.token,
        expires_at: expiresAtISO,
        issued_at: issuedAtISO,
      });

      return setApiCredential('kis', 'access_token', credentialValue, {
        description: 'KIS OAuth Access Token (자동 갱신)',
        expiresAt: expiresAtISO,  // DB expires_at 컬럼에 저장
      });
    })
    .then((saved) => {
      if (saved) {
        console.log('[KIS] Supabase에 토큰 캐시 저장 완료');
      }
    })
    .catch(() => {
      // Supabase 저장 실패해도 동작에 영향 없음
    });
}

/**
 * 토큰 캐시 무효화 (401 에러 발생 시)
 */
function invalidateTokenCache(): void {
  cachedToken = null;

  // Supabase 토큰 캐시 비활성화 (is_active = false)
  import('./supabase/api-credentials')
    .then(({ deactivateApiCredential }) => {
      return deactivateApiCredential('kis', 'access_token');
    })
    .catch(() => {});

  if (!fileCacheEnabled) return;

  try {
    if (existsSync(TOKEN_CACHE_FILE)) {
      const { unlinkSync } = require('fs');
      unlinkSync(TOKEN_CACHE_FILE);
      console.log('[KIS] 만료된 토큰 파일 삭제');
    }
  } catch (error) {
    // 삭제 실패해도 무시 (다음 로드 시 만료 체크됨)
    console.warn('[KIS] 토큰 파일 삭제 실패:', error instanceof Error ? error.message : error);
  }
}

// ========== 타입 정의 ==========

interface KISTokenResponse {
  access_token: string;
  access_token_token_expired: string;
  token_type: string;
  expires_in: number;
}

interface KISQuoteResponse {
  rt_cd: string; // 응답코드 (0: 성공)
  msg_cd: string;
  msg1: string;
  output: {
    iscd_stat_cls_code: string; // 종목상태구분코드
    marg_rate: string; // 증거금율
    rprs_mrkt_kor_name: string; // 대표시장한글명
    new_hgpr_lwpr_cls_code: string; // 신고저가구분코드
    bstp_kor_isnm: string; // 업종한글명
    temp_stop_yn: string; // 임시정지여부
    oprc_rang_cont_yn: string; // 시가범위연장여부
    clpr_rang_cont_yn: string; // 종가범위연장여부
    crdt_able_yn: string; // 신용가능여부
    grmn_rate_cls_code: string; // 보증금율구분코드
    elw_pblc_yn: string; // ELW발행여부
    stck_prpr: string; // 주식현재가
    prdy_vrss: string; // 전일대비
    prdy_vrss_sign: string; // 전일대비부호 (1:상한, 2:상승, 3:보합, 4:하한, 5:하락)
    prdy_ctrt: string; // 전일대비율
    acml_tr_pbmn: string; // 누적거래대금
    acml_vol: string; // 누적거래량
    prdy_vrss_vol_rate: string; // 전일대비거래량비율
    stck_oprc: string; // 주식시가
    stck_hgpr: string; // 주식최고가
    stck_lwpr: string; // 주식최저가
    stck_mxpr: string; // 주식상한가
    stck_llam: string; // 주식하한가
    stck_sdpr: string; // 주식기준가
    wghn_avrg_stck_prc: string; // 가중평균주가
    hts_frgn_ehrt: string; // HTS외국인소진율
    frgn_ntby_qty: string; // 외국인순매수량
    pgtr_ntby_qty: string; // 프로그램순매수량
    pvt_scnd_dmrs_prc: string; // 피봇2차저항가
    pvt_frst_dmrs_prc: string; // 피봇1차저항가
    pvt_pont_val: string; // 피봇포인트값
    pvt_frst_dmsp_prc: string; // 피봇1차지지가
    pvt_scnd_dmsp_prc: string; // 피봇2차지지가
    dmrs_val: string; // 저항값
    dmsp_val: string; // 지지값
    cpfn: string; // 자본금
    rstc_wdth_prc: string; // 제한폭가격
    stck_fcam: string; // 주식액면가
    stck_sspr: string; // 주식대용가
    aspr_unit: string; // 호가단위
    hts_deal_qty_unit_val: string; // HTS매매수량단위값
    lstn_stcn: string; // 상장주수
    hts_avls: string; // HTS시가총액
    per: string; // PER
    pbr: string; // PBR
    stac_month: string; // 결산월
    vol_tnrt: string; // 거래량회전율
    eps: string; // EPS
    bps: string; // BPS
    d250_hgpr: string; // 250일최고가
    d250_hgpr_date: string; // 250일최고가일자
    d250_hgpr_vrss_prpr_rate: string; // 250일최고가대비현재가비율
    d250_lwpr: string; // 250일최저가
    d250_lwpr_date: string; // 250일최저가일자
    d250_lwpr_vrss_prpr_rate: string; // 250일최저가대비현재가비율
    stck_dryy_hgpr: string; // 주식연중최고가
    dryy_hgpr_vrss_prpr_rate: string; // 연중최고가대비현재가비율
    dryy_hgpr_date: string; // 연중최고가일자
    stck_dryy_lwpr: string; // 주식연중최저가
    dryy_lwpr_vrss_prpr_rate: string; // 연중최저가대비현재가비율
    dryy_lwpr_date: string; // 연중최저가일자
    w52_hgpr: string; // 52주최고가
    w52_hgpr_vrss_prpr_ctrt: string; // 52주최고가대비현재가대비
    w52_hgpr_date: string; // 52주최고가일자
    w52_lwpr: string; // 52주최저가
    w52_lwpr_vrss_prpr_ctrt: string; // 52주최저가대비현재가대비
    w52_lwpr_date: string; // 52주최저가일자
    whol_loan_rmnd_rate: string; // 전체융자잔고비율
    ssts_yn: string; // 공매도가능여부
    stck_shrn_iscd: string; // 주식단축종목코드
    fcam_cnnm: string; // 액면가통화명
    cpfn_cnnm: string; // 자본금통화명
    apprch_rate: string; // 접근도
    frgn_hldn_qty: string; // 외국인보유수량
    vi_cls_code: string; // VI적용구분코드
    ovtm_vi_cls_code: string; // 시간외단일가VI적용구분코드
    last_ssts_cntg_qty: string; // 최종공매도체결수량
    invt_caful_yn: string; // 투자유의여부
    mrkt_warn_cls_code: string; // 시장경고코드
    short_over_yn: string; // 단기과열여부
    sltr_yn: string; // 정리매매여부
  };
}

interface KISDailyPriceResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: Array<{
    stck_bsop_date: string; // 주식영업일자
    stck_clpr: string; // 주식종가
    stck_oprc: string; // 주식시가
    stck_hgpr: string; // 주식최고가
    stck_lwpr: string; // 주식최저가
    acml_vol: string; // 누적거래량
    acml_tr_pbmn: string; // 누적거래대금
    flng_cls_code: string; // 락구분코드
    prtt_rate: string; // 분할비율
    mod_yn: string; // 수정주가여부
    prdy_vrss_sign: string; // 전일대비부호
    prdy_vrss: string; // 전일대비
    revl_issu_reas: string; // 재평가사유코드
  }>;
}

// ========== 토큰 관리 ==========

// 토큰 재발급 제한 (23시간 버퍼 — KIS 1일 1회 권장)
const TOKEN_REFRESH_MIN_INTERVAL_MS = 23 * 60 * 60 * 1000;

/**
 * 토큰 재발급 가능 여부 확인 (Rate Limit 보호)
 * KIS API는 토큰 발급을 1일 1회 권장하므로, 23시간 이내 재발급을 차단
 */
function canRefreshToken(): boolean {
  if (!cachedToken || cachedToken.issuedAt === 0) return true;
  return Date.now() - cachedToken.issuedAt >= TOKEN_REFRESH_MIN_INTERVAL_MS;
}

/**
 * OAuth 접근 토큰 발급
 *
 * 캐시 우선순위:
 * 1. 메모리 캐시 (가장 빠름, 프로세스 내 유지)
 * 2. Supabase 캐시 (중앙 집중식 진실의 원천, 인스턴스간 공유)
 * 3. 파일 캐시 (Supabase 장애 시 폴백, /tmp 또는 .cache)
 * 4. getKISCredentials 검증 시 발급된 토큰 (자동 캐시됨)
 * 5. API 호출 (마지막 수단, 1일 1회 권장 — 23시간 Rate Limit 적용)
 *
 * 키 조회 우선순위:
 * 1. Supabase api_credentials 테이블
 * 2. 환경변수 (KIS_APP_KEY, KIS_APP_SECRET)
 */
async function getAccessToken(): Promise<string> {
  // 1. 메모리 캐시 확인 (만료 10분 전까지 사용)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 10 * 60 * 1000) {
    return cachedToken.token;
  }

  // 2. Supabase 토큰 캐시 확인 (중앙 집중식 — 다른 환경에서 발급한 토큰도 재사용)
  const supabaseToken = await loadTokenFromSupabase();
  if (supabaseToken) {
    cachedToken = supabaseToken;
    saveTokenToFile(supabaseToken);
    return supabaseToken.token;
  }

  // 3. 파일 캐시에서 복원 시도 (Supabase 장애 시 폴백)
  const fileToken = loadTokenFromFile();
  if (fileToken) {
    cachedToken = fileToken;
    return fileToken.token;
  }

  // 4. KIS 키 조회 (Supabase 우선, 환경변수 Fallback)
  //    getKISCredentials 내부에서 검증 시 발급된 토큰이 cachedToken에 저장될 수 있음
  const credentials = await getKISCredentials();

  // 4-1. 검증 과정에서 이미 토큰이 캐시되었는지 확인
  if (cachedToken && cachedToken.expiresAt > Date.now() + 10 * 60 * 1000) {
    console.log('[KIS] 키 검증 시 발급된 토큰 재사용');
    return cachedToken.token;
  }

  // 5. Rate Limit 체크 (23시간 이내 재발급 차단)
  if (!canRefreshToken()) {
    const nextRefreshMs = TOKEN_REFRESH_MIN_INTERVAL_MS - (Date.now() - (cachedToken?.issuedAt ?? 0));
    const nextRefreshHours = Math.round(nextRefreshMs / 1000 / 60 / 60 * 10) / 10;
    throw new Error(
      `KIS 토큰 재발급 불가: 1일 1회 제한 (${nextRefreshHours}시간 후 재시도 가능)`
    );
  }

  // 6. 새 토큰 발급 (마지막 수단)
  const env = process.env.NODE_ENV || 'development';
  const cacheMode = fileCacheEnabled ? `파일(${TOKEN_CACHE_FILE})` : '메모리만';
  console.log(`[KIS] 새 토큰 발급 요청... (환경: ${env}, 키 소스: ${credentials.source}, 캐시: ${cacheMode})`);

  try {
    const response = await axios.post<KISTokenResponse>(
      `${KIS_BASE_URL}/oauth2/tokenP`,
      {
        grant_type: 'client_credentials',
        appkey: credentials.appKey,
        appsecret: credentials.appSecret,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const { access_token, expires_in } = response.data;
    const now = Date.now();
    const newToken: CachedTokenData = {
      token: access_token,
      expiresAt: now + expires_in * 1000,
      issuedAt: now,
    };

    // 모든 캐시 계층에 저장
    cachedToken = newToken;
    saveTokenToFile(newToken);
    saveTokenToSupabase(newToken);

    const expiresInHours = Math.round(expires_in / 3600);
    console.log(`[KIS] 새 접근 토큰 발급 완료 (유효기간: ${expiresInHours}시간)`);
    return access_token;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`KIS 토큰 발급 실패: ${error.response?.data?.msg1 || error.message}`);
    }
    throw error;
  }
}

/**
 * KIS API 응답 기본 타입 (토큰 만료 감지용)
 */
interface KISBaseResponse {
  rt_cd: string;
  msg_cd?: string;
  msg1?: string;
}

/**
 * 토큰 만료 응답인지 확인
 * KIS API는 토큰 만료 시에도 HTTP 200을 반환하고, 응답 본문에서 만료를 알림
 * - rt_cd: "1" (실패)
 * - msg1: "기간이 만료된 token 입니다" 또는 유사 메시지
 */
function isTokenExpiredResponse(data: KISBaseResponse): boolean {
  if (data.rt_cd !== '0') {
    const msg = data.msg1?.toLowerCase() || '';
    // 토큰 만료 관련 메시지 패턴
    if (
      msg.includes('만료') ||
      msg.includes('token') ||
      msg.includes('expired') ||
      data.msg_cd === 'EGW00123' // KIS 토큰 만료 에러 코드
    ) {
      return true;
    }
  }
  return false;
}

/**
 * KIS API 호출 헬퍼
 * - HTTP 401과 응답 본문의 토큰 만료 메시지 모두 처리
 * - Supabase/환경변수에서 동적으로 키 조회
 */
async function kisRequest<T extends KISBaseResponse>(
  endpoint: string,
  trId: string,
  params: Record<string, string>,
  isRetry = false
): Promise<T> {
  const token = await getAccessToken();
  const credentials = await getKISCredentials();

  try {
    const response = await axios.get<T>(`${KIS_BASE_URL}${endpoint}`, {
      params,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: credentials.appKey,
        appsecret: credentials.appSecret,
        tr_id: trId,
      },
      timeout: 15000,
    });

    const data = response.data;

    // HTTP 200이지만 토큰 만료 응답인 경우 처리
    if (isTokenExpiredResponse(data)) {
      if (isRetry) {
        // 재시도에서도 실패하면 에러 throw
        throw new Error(`KIS 토큰 재발급 후에도 실패: ${data.msg1}`);
      }

      console.log(`[KIS] 토큰 만료 감지 (rt_cd: ${data.rt_cd}, msg: ${data.msg1}) - 재발급 시도`);
      invalidateTokenCache();

      // 재귀 호출로 재시도 (isRetry=true로 무한 루프 방지)
      return kisRequest<T>(endpoint, trId, params, true);
    }

    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // HTTP 401 에러도 여전히 처리 (다른 인증 문제 대비)
      if (error.response?.status === 401 && !isRetry) {
        console.log('[KIS] HTTP 401 오류 - 토큰 만료, 재발급 시도');
        invalidateTokenCache();
        return kisRequest<T>(endpoint, trId, params, true);
      }
      throw new Error(`KIS API 오류: ${error.response?.data?.msg1 || error.message}`);
    }
    throw error;
  }
}

// ========== 주식 시세 조회 ==========

/**
 * 주식 현재가 시세 조회
 * @param symbol 종목코드 (6자리, 예: 005930)
 */
export async function fetchQuoteKIS(symbol: string): Promise<KISQuoteResponse['output'] | null> {
  try {
    // 종목코드 정규화 (6자리 숫자만 추출)
    const cleanSymbol = cleanKoreanSymbol(symbol);

    const response = await kisRequest<KISQuoteResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      'FHKST01010100',
      {
        FID_COND_MRKT_DIV_CODE: 'J', // J: 주식/ETF/ETN
        FID_INPUT_ISCD: cleanSymbol,
      }
    );

    if (response.rt_cd !== '0') {
      console.error(`[KIS] 시세 조회 실패 (${symbol}): ${response.msg1}`);
      return null;
    }

    return response.output;
  } catch (error) {
    console.error(`[KIS] Quote 조회 실패 (${symbol}):`, error);
    return null;
  }
}

/**
 * 주식 일별 시세 조회 (히스토리컬 데이터)
 * @param symbol 종목코드
 * @param period 조회 기간 (D: 일, W: 주, M: 월, Y: 년)
 */
export async function fetchDailyPricesKIS(
  symbol: string,
  period: 'D' | 'W' | 'M' | 'Y' = 'D'
): Promise<KISDailyPriceResponse['output']> {
  try {
    const cleanSymbol = cleanKoreanSymbol(symbol);

    const response = await kisRequest<KISDailyPriceResponse>(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-price',
      'FHKST01010400',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: cleanSymbol,
        FID_PERIOD_DIV_CODE: period,
        FID_ORG_ADJ_PRC: '0', // 0: 수정주가, 1: 원주가
      }
    );

    if (response.rt_cd !== '0') {
      console.error(`[KIS] 일별 시세 조회 실패 (${symbol}): ${response.msg1}`);
      return [];
    }

    return response.output || [];
  } catch (error) {
    console.error(`[KIS] 일별 시세 조회 실패 (${symbol}):`, error);
    return [];
  }
}

// ========== 통합 데이터 타입 ==========

export interface KISStockData {
  symbol: string;
  name: string;
  market: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  tradingValue: number;
  high52Week: number;
  low52Week: number;
  marketCap: number;
  per: number | null;
  pbr: number | null;
  eps: number | null;
  bps: number | null;
  foreignOwnership: number | null;
  foreignNetBuy: number | null;
}

/**
 * 통합 주식 데이터 조회
 */
export async function fetchStockDataKIS(symbol: string): Promise<KISStockData | null> {
  const startTime = Date.now();

  try {
    const quote = await fetchQuoteKIS(symbol);

    if (!quote) {
      throw new Error(`종목 정보를 찾을 수 없습니다: ${symbol}`);
    }

    const currentPrice = parseFloat(quote.stck_prpr) || 0;
    if (currentPrice <= 0) {
      throw new Error(`유효하지 않은 가격: ${symbol}`);
    }

    const responseTime = Date.now() - startTime;
    console.log(`[KIS] ${symbol} 데이터 수집 완료 (${responseTime}ms)`);

    return {
      symbol: symbol.replace(/\.(KS|KQ)$/, ''),
      name: quote.rprs_mrkt_kor_name || symbol,
      market: quote.rprs_mrkt_kor_name || 'KRX',
      currentPrice,
      previousClose: currentPrice - parseFloat(quote.prdy_vrss || '0'),
      change: parseFloat(quote.prdy_vrss || '0'),
      changePercent: parseFloat(quote.prdy_ctrt || '0'),
      open: parseFloat(quote.stck_oprc || '0'),
      high: parseFloat(quote.stck_hgpr || '0'),
      low: parseFloat(quote.stck_lwpr || '0'),
      volume: parseInt(quote.acml_vol || '0', 10),
      tradingValue: parseInt(quote.acml_tr_pbmn || '0', 10),
      high52Week: parseFloat(quote.w52_hgpr || '0'),
      low52Week: parseFloat(quote.w52_lwpr || '0'),
      marketCap: parseInt(quote.hts_avls || '0', 10) * 100000000, // 억 단위 → 원 단위
      per: quote.per ? parseFloat(quote.per) : null,
      pbr: quote.pbr ? parseFloat(quote.pbr) : null,
      eps: quote.eps ? parseFloat(quote.eps) : null,
      bps: quote.bps ? parseFloat(quote.bps) : null,
      foreignOwnership: quote.hts_frgn_ehrt ? parseFloat(quote.hts_frgn_ehrt) : null,
      foreignNetBuy: quote.frgn_ntby_qty ? parseInt(quote.frgn_ntby_qty, 10) : null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[KIS] ${symbol} 데이터 수집 실패:`, errorMessage);
    throw new Error(`KIS 데이터 수집 실패 (${symbol}): ${errorMessage}`);
  }
}

/**
 * API 키 설정 여부 확인 (환경변수 기준, 동기 호출용)
 * Supabase 조회가 필요한 경우 isKISConfiguredAsync 사용
 */
export function isKISConfigured(): boolean {
  return !!ENV_KIS_APP_KEY && !!ENV_KIS_APP_SECRET && ENV_KIS_APP_KEY.length > 0 && ENV_KIS_APP_SECRET.length > 0;
}

/**
 * API 키 설정 여부 확인 (Supabase + 환경변수, 비동기)
 */
export async function isKISConfiguredAsync(): Promise<boolean> {
  try {
    const credentials = await getKISCredentials();
    return !!credentials.appKey && !!credentials.appSecret;
  } catch {
    return false;
  }
}

/**
 * API 키 유효성 확인 (실제 API 호출)
 * Supabase 키 우선, 환경변수 Fallback
 */
export async function validateKISApiKey(): Promise<boolean> {
  try {
    // getKISCredentials가 키를 조회하고 유효성도 검증함
    const credentials = await getKISCredentials();
    if (!credentials.appKey || !credentials.appSecret) {
      return false;
    }

    // 추가로 실제 시세 조회로 검증
    const quote = await fetchQuoteKIS('005930');
    return quote !== null;
  } catch {
    return false;
  }
}

/**
 * 현재 사용 중인 키 소스 조회
 */
export async function getKISKeySource(): Promise<'supabase' | 'env' | 'none'> {
  try {
    const credentials = await getKISCredentials();
    return credentials.source;
  } catch {
    return 'none';
  }
}

/**
 * KIS API 제한 정보
 */
export const KIS_LIMITS = {
  TOKEN_VALIDITY_HOURS: 24,
  TOKEN_REFRESH_HOURS: 6,
  RATE_LIMIT_PER_SECOND: 20, // 초당 20회 제한 (추정)
} as const;
