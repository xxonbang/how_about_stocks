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
 * 필요 환경변수:
 * - KIS_APP_KEY: 앱 키
 * - KIS_APP_SECRET: 앱 시크릿
 * - KIS_ACCOUNT_NO: 계좌번호 (선택, 매매 기능 사용 시 필요)
 */

import axios from 'axios';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// 환경변수
const KIS_APP_KEY = process.env.KIS_APP_KEY || '';
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || '';
const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443'; // 실전 투자

// 토큰 캐시 파일 경로 (서버 재시작 시에도 유지)
const TOKEN_CACHE_DIR = join(process.cwd(), '.cache');
const TOKEN_CACHE_FILE = join(TOKEN_CACHE_DIR, 'kis-token.json');

// 메모리 캐시 (파일 읽기 최소화)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * 파일에서 토큰 로드 (서버 재시작 시 복원)
 */
function loadTokenFromFile(): { token: string; expiresAt: number } | null {
  try {
    if (existsSync(TOKEN_CACHE_FILE)) {
      const data = JSON.parse(readFileSync(TOKEN_CACHE_FILE, 'utf-8'));
      // 만료 여부 확인 (10분 여유)
      if (data.expiresAt > Date.now() + 10 * 60 * 1000) {
        console.log('[KIS] 파일에서 토큰 복원 성공 (만료까지 ' +
          Math.round((data.expiresAt - Date.now()) / 1000 / 60) + '분)');
        return data;
      } else {
        console.log('[KIS] 저장된 토큰이 만료됨');
      }
    }
  } catch (error) {
    console.warn('[KIS] 토큰 파일 로드 실패:', error instanceof Error ? error.message : error);
  }
  return null;
}

/**
 * 토큰을 파일에 저장 (서버 재시작 대비)
 */
function saveTokenToFile(token: string, expiresAt: number): void {
  try {
    // 캐시 디렉토리 생성
    if (!existsSync(TOKEN_CACHE_DIR)) {
      mkdirSync(TOKEN_CACHE_DIR, { recursive: true });
    }
    writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({ token, expiresAt }), 'utf-8');
    console.log('[KIS] 토큰 파일 저장 완료');
  } catch (error) {
    console.warn('[KIS] 토큰 파일 저장 실패:', error instanceof Error ? error.message : error);
  }
}

/**
 * 토큰 캐시 무효화 (401 에러 발생 시)
 */
function invalidateTokenCache(): void {
  cachedToken = null;
  try {
    if (existsSync(TOKEN_CACHE_FILE)) {
      const { unlinkSync } = require('fs');
      unlinkSync(TOKEN_CACHE_FILE);
      console.log('[KIS] 만료된 토큰 파일 삭제');
    }
  } catch (error) {
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

/**
 * OAuth 접근 토큰 발급
 *
 * 캐시 우선순위:
 * 1. 메모리 캐시 (가장 빠름)
 * 2. 파일 캐시 (서버 재시작 후 복원)
 * 3. API 호출 (마지막 수단, 1일 1회 권장)
 */
async function getAccessToken(): Promise<string> {
  // 1. 메모리 캐시 확인 (만료 10분 전까지 사용)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 10 * 60 * 1000) {
    return cachedToken.token;
  }

  // 2. 파일 캐시에서 복원 시도 (서버 재시작 후)
  const fileToken = loadTokenFromFile();
  if (fileToken) {
    cachedToken = fileToken;
    return fileToken.token;
  }

  // 3. 새 토큰 발급 (캐시에 없는 경우에만)
  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    throw new Error('KIS_APP_KEY와 KIS_APP_SECRET이 설정되지 않았습니다.');
  }

  console.log('[KIS] 캐시된 토큰 없음, 새 토큰 발급 요청...');

  try {
    const response = await axios.post<KISTokenResponse>(
      `${KIS_BASE_URL}/oauth2/tokenP`,
      {
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const { access_token, expires_in } = response.data;
    const expiresAt = Date.now() + expires_in * 1000;

    // 메모리 캐시 저장
    cachedToken = {
      token: access_token,
      expiresAt,
    };

    // 파일 캐시 저장 (서버 재시작 대비)
    saveTokenToFile(access_token, expiresAt);

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
 * KIS API 호출 헬퍼
 */
async function kisRequest<T>(
  endpoint: string,
  trId: string,
  params: Record<string, string>
): Promise<T> {
  const token = await getAccessToken();

  try {
    const response = await axios.get<T>(`${KIS_BASE_URL}${endpoint}`, {
      params,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
        tr_id: trId,
      },
      timeout: 15000,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        // 토큰 만료 시 캐시 무효화 후 재발급 시도
        console.log('[KIS] 401 오류 - 토큰 만료, 재발급 시도');
        invalidateTokenCache();
        const newToken = await getAccessToken();
        const retryResponse = await axios.get<T>(`${KIS_BASE_URL}${endpoint}`, {
          params,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            authorization: `Bearer ${newToken}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: trId,
          },
          timeout: 15000,
        });
        return retryResponse.data;
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
    const cleanSymbol = symbol.replace(/\.(KS|KQ)$/, '').padStart(6, '0');

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
    const cleanSymbol = symbol.replace(/\.(KS|KQ)$/, '').padStart(6, '0');

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
 * API 키 설정 여부 확인
 */
export function isKISConfigured(): boolean {
  return !!KIS_APP_KEY && !!KIS_APP_SECRET && KIS_APP_KEY.length > 0 && KIS_APP_SECRET.length > 0;
}

/**
 * API 키 유효성 확인 (실제 API 호출)
 */
export async function validateKISApiKey(): Promise<boolean> {
  if (!isKISConfigured()) {
    return false;
  }

  try {
    // 삼성전자 시세 조회로 테스트
    const quote = await fetchQuoteKIS('005930');
    return quote !== null;
  } catch {
    return false;
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
