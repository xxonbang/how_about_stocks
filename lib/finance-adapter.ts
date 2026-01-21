/**
 * 데이터 소스 어댑터 (DualSource 최우선 Fallback 구조)
 *
 * 아키텍처 (USE_DUAL_SOURCE=true):
 * ┌─────────────────────────────────────────────────────┐
 * │  [미국 주식]                                        │
 * │  DualSource (1차) - Agentic + Yahoo API 교차검증   │
 * │  ↓ 실패 시 (Yahoo 스킵 - 이미 시도했으므로)         │
 * │  Finnhub (2차) → Twelve Data (3차)                 │
 * ├─────────────────────────────────────────────────────┤
 * │  [한국 주식]                                        │
 * │  DualSource (1차) - Agentic + 다음 금융 교차검증   │
 * │  ↓ 실패 시                                          │
 * │  Yahoo (2차) → 공공데이터포털 (3차) → Twelve (4차) │
 * ├─────────────────────────────────────────────────────┤
 * │  [환율/VIX] Yahoo → Finnhub → Twelve Data          │
 * └─────────────────────────────────────────────────────┘
 */

import type { StockData, SupplyDemandData, UnifiedQuoteResult } from './finance';
import {
  fetchStocksDataBatch as fetchYahooBatch,
  fetchExchangeRate as fetchYahooExchangeRate,
  fetchVIX as fetchYahooVIX,
  fetchNews as fetchYahooNews,
  fetchNaverNews,
  fetchUnifiedQuotesBatch,
  fetchHistoricalDataCached,
  calculateRSI,
  calculateMA,
  calculateDisparity,
} from './finance';

// 통합 배치 함수 re-export
export { fetchUnifiedQuotesBatch } from './finance';
export type { UnifiedQuoteResult } from './finance';

import {
  fetchStocksDataBatchFinnhub,
  fetchExchangeRateFinnhub,
  fetchVIXFinnhub,
  fetchNewsFinnhub,
  normalizeKoreaSymbol,
} from './finance-finnhub';

import {
  fetchStocksDataBatchVercel,
} from './finance-vercel';

import {
  isTwelveDataAvailable,
  fetchStocksDataBatchTwelveData,
  fetchTwelveDataExchangeRate,
} from './finance-twelvedata';

import {
  isPublicDataAvailable,
  fetchStocksDataBatchPublicData,
} from './finance-publicdata';

import {
  collectStockDataDualSource,
  detectMarketType,
  type ValidatedStockData,
  type ComprehensiveStockData,
} from './dual-source';

export type DataSource = 'dual-source' | 'finnhub' | 'yahoo' | 'vercel' | 'auto';

const DEFAULT_DATA_SOURCE: DataSource =
  (process.env.DATA_SOURCE as DataSource) || 'auto';

// 듀얼 소스 활성화 여부
const USE_DUAL_SOURCE = process.env.USE_DUAL_SOURCE === 'true';

/**
 * 심볼이 한국 주식인지 판별
 */
function isKoreanStock(symbol: string): boolean {
  return symbol.endsWith('.KS') || symbol.endsWith('.KQ') || /^\d{6}$/.test(symbol);
}

/**
 * 심볼을 미국/한국으로 분류
 */
function categorizeSymbols(symbols: string[]): { us: string[]; kr: string[] } {
  const us: string[] = [];
  const kr: string[] = [];

  for (const symbol of symbols) {
    if (isKoreanStock(symbol)) {
      kr.push(symbol);
    } else {
      us.push(symbol);
    }
  }

  return { us, kr };
}

/**
 * 자동으로 최적의 데이터 소스 선택
 *
 * USE_DUAL_SOURCE=true: DualSource → Yahoo → Finnhub/공공데이터 → Twelve Data
 * USE_DUAL_SOURCE=false: Yahoo → Finnhub/공공데이터 → Twelve Data
 */
function selectDataSource(symbols: string[]): DataSource {
  if (DEFAULT_DATA_SOURCE !== 'auto') {
    console.log(`[DataSource] Using explicit DATA_SOURCE: ${DEFAULT_DATA_SOURCE}`);
    return DEFAULT_DATA_SOURCE;
  }

  // DualSource 활성화 여부와 관계없이 fallback 체인 사용
  // (fallback 체인 내부에서 USE_DUAL_SOURCE 확인)
  if (USE_DUAL_SOURCE) {
    console.log('[DataSource] DualSource 최우선 + Fallback 체인 사용');
  } else {
    console.log('[DataSource] Yahoo Finance 최우선 + Fallback 체인 사용');
  }

  return 'auto';
}

/**
 * 듀얼 소스에서 historicalData 수집을 위한 Yahoo Finance 호출 (캐시 적용)
 */
async function fetchHistoricalDataYahoo(
  symbol: string
): Promise<Array<{ date: string; close: number; volume: number; high?: number; low?: number; open?: number }>> {
  try {
    const historicalData = await fetchHistoricalDataCached(symbol, 180);
    return historicalData.map((d) => ({
      date: d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date),
      close: d.close,
      volume: d.volume,
      high: d.high,
      low: d.low,
      open: d.open,
    }));
  } catch (error) {
    console.warn(`[DualSource] Historical data fetch failed for ${symbol}:`, error);
    return [];
  }
}

/**
 * ComprehensiveStockData를 StockData로 변환
 */
function convertToStockData(
  validated: ValidatedStockData,
  historicalData: Array<{ date: string; close: number; volume: number; high?: number; low?: number; open?: number }>
): StockData {
  const { data, confidence } = validated;
  const closes = historicalData.map((d) => d.close);

  const rsi = closes.length >= 15 ? calculateRSI(closes, 14) : 50;
  const ma5 = calculateMA(closes, 5) || data.priceData.currentPrice;
  const ma20 = calculateMA(closes, 20) || data.priceData.currentPrice;
  const ma60 = calculateMA(closes, 60) || data.priceData.currentPrice;
  const ma120 = calculateMA(closes, 120) || data.priceData.currentPrice;
  const disparity = calculateDisparity(data.priceData.currentPrice, ma20);

  console.log(
    `[DualSource] Converted ${data.basicInfo.symbol}: confidence=${(confidence * 100).toFixed(1)}%, ` +
      `status=${validated.validation.status}`
  );

  return {
    symbol: data.basicInfo.symbol,
    price: data.priceData.currentPrice,
    change: data.priceData.change,
    changePercent: data.priceData.changePercent,
    volume: data.priceData.volume,
    marketCap: data.marketData.marketCap || undefined,
    rsi,
    movingAverages: { ma5, ma20, ma60, ma120 },
    disparity,
    historicalData,
    _dualSource: {
      confidence,
      status: validated.validation.status,
      sources: validated.sources,
    },
  } as StockData & { _dualSource: unknown };
}

/**
 * 듀얼 소스 방식으로 주식 데이터 배치 수집
 */
async function fetchStocksDataDualSource(
  symbols: string[]
): Promise<Map<string, StockData>> {
  const results = new Map<string, StockData>();

  console.log(`[DualSource] Starting batch collection for ${symbols.length} symbols`);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    try {
      const validated = await collectStockDataDualSource(symbol, {
        timeout: 60000,
        logResults: false,
      });
      const historicalData = await fetchHistoricalDataYahoo(symbol);
      const stockData = convertToStockData(validated, historicalData);
      results.set(symbol, stockData);
    } catch (error) {
      console.error(`[DualSource] Failed to collect ${symbol}:`, error);
    }
  }

  console.log(`[DualSource] Completed: ${results.size}/${symbols.length} symbols`);
  return results;
}

/**
 * 미국 주식 Fallback 체인
 *
 * USE_DUAL_SOURCE=true:  DualSource → Finnhub → Twelve Data
 *                        (Yahoo는 DualSource 내부에서 이미 시도하므로 스킵)
 * USE_DUAL_SOURCE=false: Yahoo → Finnhub → Twelve Data
 */
async function fetchUSStocksWithFallback(
  symbols: string[]
): Promise<Map<string, StockData>> {
  if (symbols.length === 0) return new Map();

  console.log(`[US Stocks] Fetching ${symbols.length} symbols with fallback chain`);

  let dualSourceAttempted = false;

  // 1차: DualSource (Agentic Screenshot + Yahoo API 교차검증)
  if (USE_DUAL_SOURCE) {
    dualSourceAttempted = true;
    try {
      console.log('[US Stocks] 1차 시도: DualSource (Agentic + Yahoo API 교차검증)');
      const dualSourceResult = await fetchStocksDataDualSource(symbols);
      if (dualSourceResult.size > 0) {
        console.log(`[US Stocks] DualSource 성공: ${dualSourceResult.size}/${symbols.length} symbols`);
        return dualSourceResult;
      }
    } catch (dualSourceError) {
      console.warn('[US Stocks] DualSource 실패:', dualSourceError instanceof Error ? dualSourceError.message : dualSourceError);
    }
  }

  // 2차: Yahoo Finance (DualSource 미시도 시에만)
  // DualSource 내부에서 Yahoo API를 이미 시도했으므로, 중복 호출 방지
  if (!dualSourceAttempted) {
    try {
      console.log('[US Stocks] 2차 시도: Yahoo Finance');
      const yahooResult = await fetchYahooBatch(symbols);
      if (yahooResult.size > 0) {
        console.log(`[US Stocks] Yahoo Finance 성공: ${yahooResult.size}/${symbols.length} symbols`);
        return yahooResult;
      }
    } catch (yahooError) {
      console.warn('[US Stocks] Yahoo Finance 실패:', yahooError instanceof Error ? yahooError.message : yahooError);
    }
  } else {
    console.log('[US Stocks] Yahoo Finance 스킵 (DualSource 내부에서 이미 시도함)');
  }

  // 3차: Finnhub
  if (process.env.FINNHUB_API_KEY) {
    try {
      console.log(`[US Stocks] ${dualSourceAttempted ? '2' : '3'}차 시도: Finnhub`);
      const finnhubResult = await fetchStocksDataBatchFinnhub(symbols);
      if (finnhubResult.size > 0) {
        console.log(`[US Stocks] Finnhub 성공: ${finnhubResult.size}/${symbols.length} symbols`);
        return finnhubResult;
      }
    } catch (finnhubError) {
      console.warn('[US Stocks] Finnhub 실패:', finnhubError instanceof Error ? finnhubError.message : finnhubError);
    }
  }

  // 4차: Twelve Data
  if (isTwelveDataAvailable()) {
    try {
      console.log(`[US Stocks] ${dualSourceAttempted ? '3' : '4'}차 시도: Twelve Data`);
      const twelveDataResult = await fetchStocksDataBatchTwelveData(symbols);
      if (twelveDataResult.size > 0) {
        console.log(`[US Stocks] Twelve Data 성공: ${twelveDataResult.size}/${symbols.length} symbols`);
        return twelveDataResult;
      }
    } catch (twelveDataError) {
      console.warn('[US Stocks] Twelve Data 실패:', twelveDataError instanceof Error ? twelveDataError.message : twelveDataError);
    }
  }

  console.error(`[US Stocks] 모든 데이터 소스 실패: ${symbols.join(', ')}`);
  return new Map();
}

/**
 * 한국 주식 Fallback 체인
 * DualSource → Yahoo → 공공데이터포털 → Twelve Data
 */
async function fetchKRStocksWithFallback(
  symbols: string[]
): Promise<Map<string, StockData>> {
  if (symbols.length === 0) return new Map();

  console.log(`[KR Stocks] Fetching ${symbols.length} symbols with fallback chain`);

  // 1차: DualSource (Agentic Screenshot + 다음 금융 교차검증)
  if (USE_DUAL_SOURCE) {
    try {
      console.log('[KR Stocks] 1차 시도: DualSource (Agentic + 다음 금융 교차검증)');
      const dualSourceResult = await fetchStocksDataDualSource(symbols);
      if (dualSourceResult.size > 0) {
        console.log(`[KR Stocks] DualSource 성공: ${dualSourceResult.size}/${symbols.length} symbols`);
        return dualSourceResult;
      }
    } catch (dualSourceError) {
      console.warn('[KR Stocks] DualSource 실패:', dualSourceError instanceof Error ? dualSourceError.message : dualSourceError);
    }
  }

  // 2차: Yahoo Finance
  try {
    console.log('[KR Stocks] 2차 시도: Yahoo Finance');
    const yahooResult = await fetchYahooBatch(symbols);
    if (yahooResult.size > 0) {
      console.log(`[KR Stocks] Yahoo Finance 성공: ${yahooResult.size}/${symbols.length} symbols`);
      return yahooResult;
    }
  } catch (yahooError) {
    console.warn('[KR Stocks] Yahoo Finance 실패:', yahooError instanceof Error ? yahooError.message : yahooError);
  }

  // 3차: 공공데이터포털
  if (isPublicDataAvailable()) {
    try {
      console.log('[KR Stocks] 3차 시도: 공공데이터포털');
      const publicDataResult = await fetchStocksDataBatchPublicData(symbols);
      if (publicDataResult.size > 0) {
        console.log(`[KR Stocks] 공공데이터포털 성공: ${publicDataResult.size}/${symbols.length} symbols`);
        return publicDataResult;
      }
    } catch (publicDataError) {
      console.warn('[KR Stocks] 공공데이터포털 실패:', publicDataError instanceof Error ? publicDataError.message : publicDataError);
    }
  }

  // 4차: Twelve Data (한국 주식도 지원)
  if (isTwelveDataAvailable()) {
    try {
      console.log('[KR Stocks] 4차 시도: Twelve Data');
      const twelveDataResult = await fetchStocksDataBatchTwelveData(symbols);
      if (twelveDataResult.size > 0) {
        console.log(`[KR Stocks] Twelve Data 성공: ${twelveDataResult.size}/${symbols.length} symbols`);
        return twelveDataResult;
      }
    } catch (twelveDataError) {
      console.warn('[KR Stocks] Twelve Data 실패:', twelveDataError instanceof Error ? twelveDataError.message : twelveDataError);
    }
  }

  console.error(`[KR Stocks] 모든 데이터 소스 실패: ${symbols.join(', ')}`);
  return new Map();
}

/**
 * 통합 주식 데이터 수집 (DualSource 최우선 Fallback 구조)
 *
 * DualSource(Agentic + API 교차검증)를 1차로 시도하고, 실패 시 대안 소스로 전환
 */
export async function fetchStocksData(
  symbols: string[]
): Promise<Map<string, StockData>> {
  const dataSource = selectDataSource(symbols);

  console.log(`[DataAdapter] Processing ${symbols.length} symbols (mode: ${dataSource})`);

  // DATA_SOURCE=vercel 명시적 설정 시 Vercel 함수 사용 (실패 시 Fallback)
  if (dataSource === 'vercel') {
    try {
      const result = await fetchStocksDataBatchVercel(symbols);
      if (result.size > 0) {
        return result;
      }
    } catch (error) {
      console.warn('[DataAdapter] Vercel failed, using fallback chain');
    }
  }

  // DATA_SOURCE=dual-source 명시적 설정 시 DualSource 우선 시도 (실패 시 Fallback)
  if (dataSource === 'dual-source') {
    console.log('[DataAdapter] 명시적 dual-source 모드');
    try {
      const result = await fetchStocksDataDualSource(symbols);
      if (result.size > 0) {
        return result;
      }
    } catch (error) {
      console.warn('[DataAdapter] DualSource failed, using fallback chain:', error instanceof Error ? error.message : error);
    }
    // DualSource 실패 시 Fallback 체인으로 계속 진행
  }

  // 기본 모드: Fallback 체인 사용
  // USE_DUAL_SOURCE=true:  DualSource → Finnhub/공공데이터 → Twelve Data (US는 Yahoo 스킵)
  // USE_DUAL_SOURCE=false: Yahoo → Finnhub/공공데이터 → Twelve Data

  // 심볼을 미국/한국으로 분류
  const { us, kr } = categorizeSymbols(symbols);
  console.log(`[DataAdapter] Categorized: ${us.length} US, ${kr.length} KR stocks`);

  // 병렬로 수집 (각각 Fallback 체인 적용)
  const [usResults, krResults] = await Promise.all([
    fetchUSStocksWithFallback(us),
    fetchKRStocksWithFallback(kr),
  ]);

  // 결과 병합
  const results = new Map<string, StockData>();
  usResults.forEach((data, symbol) => results.set(symbol, data));
  krResults.forEach((data, symbol) => results.set(symbol, data));

  console.log(`[DataAdapter] Total results: ${results.size}/${symbols.length} symbols`);
  return results;
}

/**
 * 통합 환율 조회 (Fallback 체인)
 * Yahoo → Finnhub → Twelve Data
 */
export async function fetchExchangeRate(): Promise<number | null> {
  console.log('[ExchangeRate] Fetching with fallback chain');

  // 1차: Yahoo Finance
  try {
    const yahooRate = await fetchYahooExchangeRate();
    if (yahooRate !== null) {
      console.log(`[ExchangeRate] Yahoo Finance 성공: ${yahooRate}`);
      return yahooRate;
    }
  } catch (yahooError) {
    console.warn('[ExchangeRate] Yahoo Finance 실패:', yahooError instanceof Error ? yahooError.message : yahooError);
  }

  // 2차: Finnhub
  if (process.env.FINNHUB_API_KEY) {
    try {
      const finnhubRate = await fetchExchangeRateFinnhub();
      if (finnhubRate !== null) {
        console.log(`[ExchangeRate] Finnhub 성공: ${finnhubRate}`);
        return finnhubRate;
      }
    } catch (finnhubError) {
      console.warn('[ExchangeRate] Finnhub 실패:', finnhubError instanceof Error ? finnhubError.message : finnhubError);
    }
  }

  // 3차: Twelve Data
  if (isTwelveDataAvailable()) {
    try {
      const twelveDataRate = await fetchTwelveDataExchangeRate();
      if (twelveDataRate !== null) {
        console.log(`[ExchangeRate] Twelve Data 성공: ${twelveDataRate}`);
        return twelveDataRate;
      }
    } catch (twelveDataError) {
      console.warn('[ExchangeRate] Twelve Data 실패:', twelveDataError instanceof Error ? twelveDataError.message : twelveDataError);
    }
  }

  console.error('[ExchangeRate] 모든 데이터 소스 실패');
  return null;
}

/**
 * 통합 VIX 조회 (Fallback 체인)
 * Yahoo → Finnhub
 */
export async function fetchVIX(): Promise<number | null> {
  console.log('[VIX] Fetching with fallback chain');

  // 1차: Yahoo Finance
  try {
    const yahooVIX = await fetchYahooVIX();
    if (yahooVIX !== null) {
      console.log(`[VIX] Yahoo Finance 성공: ${yahooVIX}`);
      return yahooVIX;
    }
  } catch (yahooError) {
    console.warn('[VIX] Yahoo Finance 실패:', yahooError instanceof Error ? yahooError.message : yahooError);
  }

  // 2차: Finnhub
  if (process.env.FINNHUB_API_KEY) {
    try {
      const finnhubVIX = await fetchVIXFinnhub();
      if (finnhubVIX !== null) {
        console.log(`[VIX] Finnhub 성공: ${finnhubVIX}`);
        return finnhubVIX;
      }
    } catch (finnhubError) {
      console.warn('[VIX] Finnhub 실패:', finnhubError instanceof Error ? finnhubError.message : finnhubError);
    }
  }

  console.error('[VIX] 모든 데이터 소스 실패');
  return null;
}

/**
 * 통합 뉴스 조회 (Fallback 체인)
 * 한국 주식: 네이버 금융 → Yahoo Finance
 * 미국 주식: Yahoo Finance → Finnhub
 */
export async function fetchNews(
  symbol: string,
  count: number = 5
): Promise<Array<{ title: string; link: string; date: string }>> {
  console.log(`[News] Fetching news for ${symbol}`);

  // 한국 주식인 경우: 네이버 → Yahoo 순으로 시도
  if (isKoreanStock(symbol)) {
    // 6자리 코드 추출 (064350.KS → 064350)
    const koreanSymbol = symbol.replace(/\.(KS|KQ)$/, '');

    // 1차: 네이버 금융 (한국 주식 뉴스 전문)
    try {
      const naverNews = await fetchNaverNews(koreanSymbol, count);
      if (naverNews.length > 0) {
        console.log(`[News] 네이버 금융 성공: ${naverNews.length} articles`);
        return naverNews;
      }
    } catch (naverError) {
      console.warn('[News] 네이버 금융 실패:', naverError instanceof Error ? naverError.message : naverError);
    }

    // 2차: Yahoo Finance (Fallback)
    try {
      const yahooNews = await fetchYahooNews(symbol, count);
      if (yahooNews.length > 0) {
        console.log(`[News] Yahoo Finance 성공 (한국주식 Fallback): ${yahooNews.length} articles`);
        return yahooNews;
      }
    } catch (yahooError) {
      console.warn('[News] Yahoo Finance 실패 (한국주식):', yahooError instanceof Error ? yahooError.message : yahooError);
    }

    console.warn(`[News] 한국 주식 뉴스 소스 모두 실패: ${symbol}`);
    return [];
  }

  // 미국/기타 주식인 경우: Yahoo → Finnhub 순으로 시도
  // 1차: Yahoo Finance
  try {
    const yahooNews = await fetchYahooNews(symbol, count);
    if (yahooNews.length > 0) {
      console.log(`[News] Yahoo Finance 성공: ${yahooNews.length} articles`);
      return yahooNews;
    }
  } catch (yahooError) {
    console.warn('[News] Yahoo Finance 실패:', yahooError instanceof Error ? yahooError.message : yahooError);
  }

  // 2차: Finnhub
  if (process.env.FINNHUB_API_KEY) {
    try {
      const finnhubNews = await fetchNewsFinnhub(symbol, count);
      if (finnhubNews.length > 0) {
        console.log(`[News] Finnhub 성공: ${finnhubNews.length} articles`);
        return finnhubNews;
      }
    } catch (finnhubError) {
      console.warn('[News] Finnhub 실패:', finnhubError instanceof Error ? finnhubError.message : finnhubError);
    }
  }

  console.warn(`[News] 모든 뉴스 소스 실패: ${symbol}`);
  return [];
}
