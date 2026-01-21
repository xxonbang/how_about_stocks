/**
 * 듀얼 소스 통합 수집기
 *
 * 한국/미국 주식에 대해 두 개의 독립적인 소스에서
 * 데이터를 병렬로 수집하고 검증하여 최종 결과를 반환합니다.
 *
 * ======== Agentic Screenshot 방식 (Source A) ========
 * - Puppeteer로 브라우저 자동화 및 페이지 렌더링
 * - 화면 캡처 (Screenshot)
 * - Gemini Vision AI로 시각적 정보 추출
 * - 웹사이트 구조 변경에 자동 적응
 *
 * ======== 전통적 API 방식 (Source B) ========
 * - 한국: 다음 금융 REST API
 * - 미국: Yahoo Finance API (yahoo-finance2 라이브러리)
 *
 * 두 방식의 결과를 교차 검증하여 신뢰도 향상
 */

import type {
  ComprehensiveStockData,
  CollectionResult,
  ValidatedStockData,
  DualSourceResult,
} from './types';
import { KoreaStockCrawler, koreaStockCrawler } from './korea-stock-crawler';
import { KoreaStockDaumCollector, koreaStockDaumCollector } from './korea-stock-daum';
import { USStockYahooCollector, usStockYahooCollector } from './us-stock-yahoo';
import { USStockFinnhubCollector, usStockFinnhubCollector } from './us-stock-finnhub';
import { validateAndMerge, logValidationSummary } from './validation-engine';

// Agentic Screenshot 크롤러 동적 import (서버리스 환경에서는 사용 불가)
let agenticCrawler: {
  collectKoreaStock: (symbol: string) => Promise<CollectionResult<ComprehensiveStockData>>;
  collectUSStock: (symbol: string) => Promise<CollectionResult<ComprehensiveStockData>>;
  closeBrowser: () => Promise<void>;
} | null = null;
let agenticInitialized = false;

async function initAgenticCrawler() {
  if (agenticInitialized) return agenticCrawler;
  agenticInitialized = true;

  // Vercel/서버리스 환경 감지
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (!isServerless) {
    try {
      const { agenticCrawler: crawler } = await import('./agentic-crawler');
      agenticCrawler = crawler;
      console.log('[DualSource] Agentic Screenshot 크롤러 초기화 성공');
    } catch (error) {
      console.warn('[DualSource] Agentic 크롤러 초기화 실패, 전통적 방식으로 전환:', error);
    }
  } else {
    console.log('[DualSource] 서버리스 환경 감지, API 모드 사용');
  }

  return agenticCrawler;
}

export type MarketType = 'KR' | 'US';

interface CollectionOptions {
  timeout?: number;       // 수집 타임아웃 (ms)
  logResults?: boolean;   // 결과 로깅 여부
  skipValidation?: boolean; // 검증 건너뛰기 (단일 소스 사용)
}

const DEFAULT_OPTIONS: CollectionOptions = {
  timeout: 30000,
  logResults: false,
  skipValidation: false,
};

/**
 * 심볼로 시장 유형 판별
 */
export function detectMarketType(symbol: string): MarketType {
  // .KS, .KQ로 끝나면 한국 주식
  if (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) {
    return 'KR';
  }

  // 6자리 숫자면 한국 주식 코드
  const cleanSymbol = symbol.replace(/\.(KS|KQ)$/, '');
  if (/^\d{6}$/.test(cleanSymbol)) {
    return 'KR';
  }

  // 그 외는 미국 주식으로 간주
  return 'US';
}

/**
 * 한국 주식 심볼 정규화 (서픽스 제거)
 */
function normalizeKoreaSymbol(symbol: string): string {
  return symbol.replace(/\.(KS|KQ)$/, '');
}

// 소스 설명 상수
const SOURCE_DESCRIPTIONS = {
  KR: {
    A_AGENTIC: '네이버금융 Screenshot + Gemini Vision AI',
    A_CRAWLING: '네이버금융 HTML 크롤링',
    B: '다음금융 REST API',
  },
  US: {
    A_AGENTIC: 'Yahoo Finance Screenshot + Gemini Vision AI',
    A_FINNHUB: 'Finnhub REST API',
    B: 'Yahoo Finance API (yahoo-finance2)',
  },
};

/**
 * 한국 주식 듀얼 소스 수집
 *
 * Source A: Agentic Screenshot (네이버 금융) - Vision AI 기반
 * Source B: 다음 금융 REST API - 전통적 API 방식
 *
 * Agentic 방식 실패 시 전통적 크롤링으로 폴백
 */
async function collectKoreaStockDualSource(
  symbol: string,
  options: CollectionOptions
): Promise<DualSourceResult<ComprehensiveStockData>> {
  const normalizedSymbol = normalizeKoreaSymbol(symbol);

  // Agentic 크롤러 초기화
  const agentic = await initAgenticCrawler();

  // 타임아웃 설정 (Agentic은 더 긴 타임아웃 필요)
  const agenticTimeout = agentic ? Math.max(options.timeout || 30000, 60000) : (options.timeout || 30000);
  const timeoutPromise = new Promise<CollectionResult<ComprehensiveStockData>>((_, reject) => {
    setTimeout(() => reject(new Error('수집 타임아웃')), agenticTimeout);
  });

  // Source A: Agentic Screenshot (Vision AI) 또는 전통적 크롤링 (폴백)
  let sourceAPromise: Promise<CollectionResult<ComprehensiveStockData>>;
  let sourceADescription: string;

  if (agentic) {
    sourceADescription = SOURCE_DESCRIPTIONS.KR.A_AGENTIC;
    console.log(`[DualSource KR] Source A 시작: ${sourceADescription}`);
    sourceAPromise = agentic
      .collectKoreaStock(normalizedSymbol)
      .catch((error): CollectionResult<ComprehensiveStockData> => ({
        data: null,
        source: 'agentic',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: 0,
      }));
  } else {
    // Agentic 사용 불가 시 전통적 크롤링으로 폴백
    sourceADescription = SOURCE_DESCRIPTIONS.KR.A_CRAWLING;
    console.log(`[DualSource KR] Source A 시작: ${sourceADescription} (Agentic 불가)`);
    sourceAPromise = koreaStockCrawler
      .collectAll(normalizedSymbol)
      .catch((error): CollectionResult<ComprehensiveStockData> => ({
        data: null,
        source: 'crawling',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: 0,
      }));
  }

  // Source B: 다음 금융 REST API
  const sourceBDescription = SOURCE_DESCRIPTIONS.KR.B;
  console.log(`[DualSource KR] Source B 시작: ${sourceBDescription}`);
  const sourceBPromise = koreaStockDaumCollector
    .collectAll(normalizedSymbol)
    .catch((error): CollectionResult<ComprehensiveStockData> => ({
      data: null,
      source: 'api',
      timestamp: Date.now(),
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latency: 0,
    }));

  // 병렬 수집 실행
  const [sourceA, sourceB] = await Promise.all([
    Promise.race([sourceAPromise, timeoutPromise]),
    Promise.race([sourceBPromise, timeoutPromise]),
  ]);

  // 결과에 소스 설명 추가
  (sourceA as CollectionResult<ComprehensiveStockData> & { description?: string }).description = sourceADescription;
  (sourceB as CollectionResult<ComprehensiveStockData> & { description?: string }).description = sourceBDescription;

  return { sourceA, sourceB };
}

/**
 * 미국 주식 듀얼 소스 수집
 *
 * Source A: Agentic Screenshot (Yahoo Finance) - Vision AI 기반
 * Source B: Yahoo Finance API (yahoo-finance2 라이브러리) - 전통적 API 방식
 *
 * Agentic 방식 실패 시 Finnhub API로 폴백 (서버리스 환경)
 */
async function collectUSStockDualSource(
  symbol: string,
  options: CollectionOptions
): Promise<DualSourceResult<ComprehensiveStockData>> {
  // Agentic 크롤러 초기화
  const agentic = await initAgenticCrawler();

  // 타임아웃 설정 (Agentic은 더 긴 타임아웃 필요)
  const agenticTimeout = agentic ? Math.max(options.timeout || 30000, 60000) : (options.timeout || 30000);
  const timeoutPromise = new Promise<CollectionResult<ComprehensiveStockData>>((_, reject) => {
    setTimeout(() => reject(new Error('수집 타임아웃')), agenticTimeout);
  });

  // Source A: Agentic Screenshot (Vision AI) 또는 Finnhub API (폴백)
  let sourceAPromise: Promise<CollectionResult<ComprehensiveStockData>>;
  let sourceADescription: string;

  if (agentic) {
    sourceADescription = SOURCE_DESCRIPTIONS.US.A_AGENTIC;
    console.log(`[DualSource US] Source A 시작: ${sourceADescription}`);
    sourceAPromise = agentic
      .collectUSStock(symbol)
      .catch((error): CollectionResult<ComprehensiveStockData> => ({
        data: null,
        source: 'agentic',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: 0,
      }));
  } else {
    // Agentic 사용 불가 시 Finnhub API로 폴백
    sourceADescription = SOURCE_DESCRIPTIONS.US.A_FINNHUB;
    console.log(`[DualSource US] Source A 시작: ${sourceADescription} (Agentic 불가)`);
    sourceAPromise = usStockFinnhubCollector
      .collectAll(symbol)
      .catch((error): CollectionResult<ComprehensiveStockData> => ({
        data: null,
        source: 'api',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: 0,
      }));
  }

  // Source B: Yahoo Finance API (라이브러리)
  const sourceBDescription = SOURCE_DESCRIPTIONS.US.B;
  console.log(`[DualSource US] Source B 시작: ${sourceBDescription}`);
  const sourceBPromise = usStockYahooCollector
    .collectAll(symbol)
    .catch((error): CollectionResult<ComprehensiveStockData> => ({
      data: null,
      source: 'api',
      timestamp: Date.now(),
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latency: 0,
    }));

  // 병렬 수집 실행
  const [sourceA, sourceB] = await Promise.all([
    Promise.race([sourceAPromise, timeoutPromise]),
    Promise.race([sourceBPromise, timeoutPromise]),
  ]);

  // 결과에 소스 설명 추가
  (sourceA as CollectionResult<ComprehensiveStockData> & { description?: string }).description = sourceADescription;
  (sourceB as CollectionResult<ComprehensiveStockData> & { description?: string }).description = sourceBDescription;

  return { sourceA, sourceB };
}

/**
 * 듀얼 소스 주식 데이터 수집 (메인 함수)
 */
export async function collectStockDataDualSource(
  symbol: string,
  options: Partial<CollectionOptions> = {}
): Promise<ValidatedStockData> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const marketType = detectMarketType(symbol);

  console.log(`[DualSource] 수집 시작: ${symbol} (${marketType === 'KR' ? '한국' : '미국'})`);

  let dualSourceResult: DualSourceResult<ComprehensiveStockData>;

  if (marketType === 'KR') {
    dualSourceResult = await collectKoreaStockDualSource(symbol, opts);
  } else {
    dualSourceResult = await collectUSStockDualSource(symbol, opts);
  }

  // 소스 설명 추출
  const sourceADesc = (dualSourceResult.sourceA as CollectionResult<ComprehensiveStockData> & { description?: string }).description || 'Source A';
  const sourceBDesc = (dualSourceResult.sourceB as CollectionResult<ComprehensiveStockData> & { description?: string }).description || 'Source B';

  // 수집 결과 로깅 (상세)
  const aStatus = dualSourceResult.sourceA.success ? '✓ 성공' : '✗ 실패';
  const bStatus = dualSourceResult.sourceB.success ? '✓ 성공' : '✗ 실패';
  const aError = dualSourceResult.sourceA.error ? ` (${dualSourceResult.sourceA.error.substring(0, 50)}...)` : '';
  const bError = dualSourceResult.sourceB.error ? ` (${dualSourceResult.sourceB.error.substring(0, 50)}...)` : '';

  console.log(`[DualSource] Source A [${sourceADesc}]: ${aStatus} (${dualSourceResult.sourceA.latency}ms)${aError}`);
  console.log(`[DualSource] Source B [${sourceBDesc}]: ${bStatus} (${dualSourceResult.sourceB.latency}ms)${bError}`);

  // 둘 다 실패한 경우
  if (!dualSourceResult.sourceA.success && !dualSourceResult.sourceB.success) {
    const errorA = dualSourceResult.sourceA.error || '알 수 없는 오류';
    const errorB = dualSourceResult.sourceB.error || '알 수 없는 오류';
    throw new Error(`듀얼 소스 수집 실패: Source A(${sourceADesc}): ${errorA}, Source B(${sourceBDesc}): ${errorB}`);
  }

  // 검증 및 병합
  const validatedResult = validateAndMerge(dualSourceResult.sourceA, dualSourceResult.sourceB);

  // 최종 결과 요약 로깅
  const successCount = (dualSourceResult.sourceA.success ? 1 : 0) + (dualSourceResult.sourceB.success ? 1 : 0);
  const resultType = successCount === 2 ? '교차검증 완료' : '단일소스 사용';
  const successSource = successCount === 1
    ? (dualSourceResult.sourceA.success ? sourceADesc : sourceBDesc)
    : '양쪽 모두';

  console.log(`[DualSource] 결과: ${resultType} | 성공소스: ${successSource} | 신뢰도: ${(validatedResult.confidence * 100).toFixed(0)}% | 상태: ${validatedResult.validation.status}`);

  // 결과 로깅 (옵션)
  if (opts.logResults) {
    logValidationSummary(validatedResult);
  }

  return validatedResult;
}

/**
 * 여러 종목의 듀얼 소스 수집 (배치)
 */
export async function collectStocksDataBatchDualSource(
  symbols: string[],
  options: Partial<CollectionOptions> = {}
): Promise<Map<string, ValidatedStockData>> {
  const results = new Map<string, ValidatedStockData>();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 순차 처리 (API Rate limit 고려)
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];

    // 첫 번째 이후 딜레이
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    try {
      const result = await collectStockDataDualSource(symbol, opts);
      results.set(symbol, result);
    } catch (error) {
      console.error(`[DualSource] ${symbol} 수집 실패:`, error);
      // 실패해도 계속 진행
    }
  }

  return results;
}

/**
 * 단일 소스 수집 (검증 없이 빠른 수집)
 */
export async function collectStockDataSingleSource(
  symbol: string,
  preferredSource: 'A' | 'B' = 'A'
): Promise<CollectionResult<ComprehensiveStockData>> {
  const marketType = detectMarketType(symbol);
  const normalizedSymbol = marketType === 'KR' ? normalizeKoreaSymbol(symbol) : symbol;

  // Agentic 크롤러 초기화 시도
  const agentic = await initAgenticCrawler();

  if (preferredSource === 'A') {
    // Source A: Agentic Screenshot (Vision AI) 또는 폴백
    if (agentic) {
      return marketType === 'KR'
        ? agentic.collectKoreaStock(normalizedSymbol)
        : agentic.collectUSStock(symbol);
    } else {
      // Agentic 사용 불가 시 폴백
      return marketType === 'KR'
        ? koreaStockCrawler.collectAll(normalizedSymbol)
        : usStockFinnhubCollector.collectAll(symbol);
    }
  } else {
    // Source B: 전통적 API 방식
    return marketType === 'KR'
      ? koreaStockDaumCollector.collectAll(normalizedSymbol)
      : usStockYahooCollector.collectAll(symbol);
  }
}

/**
 * 브라우저 정리 (프로세스 종료 시 호출)
 */
export async function closeBrowsers(): Promise<void> {
  if (agenticCrawler) {
    await agenticCrawler.closeBrowser();
  }
}

// 타입 및 클래스 내보내기
export {
  KoreaStockCrawler,
  KoreaStockDaumCollector,
  USStockYahooCollector,
  USStockFinnhubCollector,
  koreaStockCrawler,
  koreaStockDaumCollector,
  usStockYahooCollector,
  usStockFinnhubCollector,
};

export * from './types';
export * from './validation-engine';
