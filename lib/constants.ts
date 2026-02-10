/**
 * 프로젝트 전역 상수 정의
 *
 * 여러 파일에서 반복적으로 사용되는 상수들을 중앙화하여 관리합니다.
 */

// ============================================================================
// 시간 관련 상수 (밀리초 단위)
// ============================================================================

/** 1분 (밀리초) */
export const ONE_MINUTE_MS = 60 * 1000;

/** 1시간 (밀리초) */
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/** 1일 (밀리초) */
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** 캐시 TTL: 24시간 */
export const CACHE_TTL_MS = ONE_DAY_MS;

// ============================================================================
// 시간 관련 상수 (초 단위)
// ============================================================================

/** 1일 (초) */
export const ONE_DAY_SECONDS = 24 * 60 * 60;

/** 7일 (초) */
export const ONE_WEEK_SECONDS = 7 * ONE_DAY_SECONDS;

/** 180일 (초) - 지표 계산용 */
export const HISTORICAL_PERIOD_SECONDS = 180 * ONE_DAY_SECONDS;

// ============================================================================
// 정규표현식 패턴
// ============================================================================

/** 한국 주식 티커 패턴 (6자리 숫자) */
export const KOREA_TICKER_PATTERN = /^\d{6}$/;

/** 한글 포함 여부 체크 패턴 */
export const KOREAN_CHAR_PATTERN = /[가-힣]/;

/** 코스피 심볼 패턴 */
export const KOSPI_SYMBOL_PATTERN = /\.KS$/;

/** 코스닥 심볼 패턴 */
export const KOSDAQ_SYMBOL_PATTERN = /\.KQ$/;

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 한국 주식 6자리 티커인지 확인
 * @param symbol 심볼 문자열
 */
export function isKoreaTicker(symbol: string): boolean {
  return KOREA_TICKER_PATTERN.test(symbol);
}

/**
 * 한글이 포함된 문자열인지 확인
 * @param text 확인할 문자열
 */
export function containsKorean(text: string): boolean {
  return KOREAN_CHAR_PATTERN.test(text);
}

/**
 * 한국 시장 심볼인지 확인 (.KS 또는 .KQ)
 * @param symbol 심볼 문자열
 */
export function isKoreaMarketSymbol(symbol: string): boolean {
  return KOSPI_SYMBOL_PATTERN.test(symbol) || KOSDAQ_SYMBOL_PATTERN.test(symbol);
}

// ============================================================================
// API 관련 상수
// ============================================================================

/** API 요청 기본 타임아웃 (밀리초) */
export const API_TIMEOUT_MS = 10000;

/** API 재시도 횟수 */
export const API_RETRY_COUNT = 3;

/** API 재시도 지연 (밀리초) */
export const API_RETRY_DELAY_MS = 1000;

// ============================================================================
// 기술적 지표 관련 상수
// ============================================================================

/** RSI 기본 기간 */
export const RSI_DEFAULT_PERIOD = 14;

/** 이동평균선 기간들 */
export const MA_PERIODS = {
  SHORT: 5,
  MEDIUM: 20,
  LONG: 60,
  VERY_LONG: 120,
} as const;

/** 볼린저 밴드 기본 설정 */
export const BOLLINGER_DEFAULTS = {
  PERIOD: 20,
  STD_DEV: 2,
} as const;

/** 거래량 분석 기간 */
export const VOLUME_ANALYSIS_PERIOD = 20;

// ============================================================================
// 검색 관련 상수
// ============================================================================

/** 검색 디바운스 지연 (밀리초) */
export const SEARCH_DEBOUNCE_MS = 300;

/** 검색 결과 최대 개수 */
export const SEARCH_MAX_RESULTS = 10;

/** 유사도 임계값 */
export const SIMILARITY_THRESHOLD = 0.6;

// ============================================================================
// 심볼 정규화 함수
// ============================================================================

/**
 * 한국 주식 심볼 정규화
 * @description .KS, .KQ 접미사를 제거하고 6자리 숫자로 패딩
 * @param symbol 심볼 문자열
 * @returns 정규화된 6자리 심볼
 * @example cleanKoreanSymbol("005930.KS") → "005930"
 * @example cleanKoreanSymbol("123") → "000123"
 */
export function cleanKoreanSymbol(symbol: string): string {
  return symbol.replace(/\.(KS|KQ)$/i, '').padStart(6, '0');
}

/**
 * Twelve Data 형식으로 심볼 정규화
 * @description .KS/.KQ → :KRX 변환
 * @param symbol 심볼 문자열
 * @returns Twelve Data 형식 심볼
 * @example normalizeSymbolForTwelveData("005930.KS") → "005930:KRX"
 */
export function normalizeSymbolForTwelveData(symbol: string): string {
  if (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) {
    return symbol.replace(/\.(KS|KQ)$/, ':KRX');
  }
  return symbol;
}

/**
 * Twelve Data 심볼을 원래 형식으로 복원
 * @param symbol Twelve Data 형식 심볼
 * @returns 원래 형식 심볼
 * @example denormalizeSymbol("005930:KRX") → "005930.KS"
 */
export function denormalizeSymbol(symbol: string): string {
  if (symbol.includes(':KRX')) {
    return symbol.replace(':KRX', '.KS');
  }
  return symbol;
}
