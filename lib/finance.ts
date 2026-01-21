import yahooFinance from 'yahoo-finance2';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { cache, CacheKey, CACHE_TTL, withCache } from './cache';

export interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  rsi: number;
  movingAverages: {
    ma5: number;
    ma20: number;
    ma60: number;
    ma120: number;
  };
  disparity: number;
  historicalData: Array<{
    date: string;
    close: number;
    volume: number;
    high?: number;
    low?: number;
    open?: number;
  }>;
}

export interface SupplyDemandData {
  institutional: number;
  foreign: number;
  individual: number;
}

export interface MarketSentiment {
  fearGreedIndex?: number;
  vix?: number;
}

/**
 * RSI(Relative Strength Index) 계산
 * @param prices 종가 배열 (오래된 순서: 과거 -> 최신)
 * @param period 기간 (기본값: 14)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) {
    return 50; // 데이터 부족 시 중립값 반환
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // 초기 평균 (Simple Moving Average)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Wilder's Smoothing (Exponential Moving Average 성격)
  // 초기 평균 이후의 데이터들을 순차적으로 반영
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.round(rsi * 100) / 100;
}

/**
 * 이동평균선 계산
 * @param prices 종가 배열 (오래된 순서: 과거 -> 최신)
 * @param period 기간
 */
export function calculateMA(prices: number[], period: number): number | null {
  if (prices.length < period) {
    return null;
  }
  // 가장 최근 period개의 데이터를 가져옴
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return Math.round((sum / period) * 100) / 100;
}

/**
 * 이격도 계산: (현재가 / 이동평균) * 100
 */
export function calculateDisparity(currentPrice: number, movingAverage: number): number {
  if (movingAverage === 0) return 100;
  return Math.round((currentPrice / movingAverage) * 100 * 100) / 100;
}

/**
 * 재시도 로직이 포함된 API 호출 헬퍼
 */
async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 3000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Too Many Requests') && i < maxRetries - 1) {
        // Rate limit에 걸린 경우 대기 후 재시도 (지수 백오프)
        const waitTime = delayMs * Math.pow(2, i);
        console.log(`Rate limit hit, waiting ${waitTime}ms before retry ${i + 1}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Yahoo Finance Chart API를 사용한 quote 데이터 조회 (crumb 불필요!)
 *
 * quote() API는 crumb 토큰이 필요하여 Rate Limit에 취약하지만,
 * chart() API는 crumb 없이 동작하므로 안정적입니다.
 *
 * @param symbol 주식/환율/지수 심볼 (예: "AAPL", "KRW=X", "^VIX")
 */
export interface ChartQuoteData {
  symbol: string;
  regularMarketPrice: number;
  chartPreviousClose: number;
  regularMarketVolume: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  longName?: string;
  shortName?: string;
  currency?: string;
}

async function fetchChartQuote(symbol: string): Promise<ChartQuoteData | null> {
  try {
    // ^ 문자를 URL 인코딩 (VIX 등 지수용)
    const encodedSymbol = symbol.replace('^', '%5E');
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=1d`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const result = response.data?.chart?.result?.[0];
    if (!result?.meta) {
      return null;
    }

    const meta = result.meta;
    return {
      symbol: meta.symbol,
      regularMarketPrice: meta.regularMarketPrice,
      chartPreviousClose: meta.chartPreviousClose,
      regularMarketVolume: meta.regularMarketVolume || 0,
      regularMarketDayHigh: meta.regularMarketDayHigh,
      regularMarketDayLow: meta.regularMarketDayLow,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      longName: meta.longName,
      shortName: meta.shortName,
      currency: meta.currency,
    };
  } catch (error) {
    console.error(`[Chart API] Error fetching ${symbol}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 여러 심볼의 Chart quote를 배치로 조회 (crumb 불필요!)
 * @param symbols 심볼 배열
 */
export async function fetchChartQuotesBatch(symbols: string[]): Promise<Map<string, ChartQuoteData>> {
  const results = new Map<string, ChartQuoteData>();

  // 병렬로 조회 (최대 5개씩)
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(symbol => fetchChartQuote(symbol));
    const batchResults = await Promise.all(promises);

    batchResults.forEach((data, idx) => {
      if (data) {
        results.set(batch[idx], data);
      }
    });
  }

  console.log(`[Chart API] Batch fetched ${results.size}/${symbols.length} symbols (crumb-free)`);
  return results;
}

/**
 * 여러 종목의 quote 데이터를 배치로 수집
 * @param symbols 주식 티커 심볼 배열
 */
export async function fetchQuotesBatch(symbols: string[]): Promise<Map<string, unknown>> {
  try {
    // 모든 종목의 quote를 한 번에 요청 (배치 처리)
    // quote()는 배열을 받으면 QuoteResponseArray를 반환
    const quotes = await retryWithDelay(
      () => yahooFinance.quote(symbols, { return: 'array' }),
      3,
      3000
    );

    // 결과를 심볼별로 매핑
    const quoteMap = new Map<string, unknown>();

    if (Array.isArray(quotes)) {
      // 배열 형태로 반환된 경우
      quotes.forEach((quote) => {
        if (quote && quote.symbol) {
          quoteMap.set(quote.symbol, quote);
        }
      });
    } else if (quotes && typeof quotes === 'object') {
      // 객체 형태로 반환된 경우 (심볼이 키)
      Object.entries(quotes).forEach(([symbol, quote]) => {
        if (quote) {
          quoteMap.set(symbol, quote);
        }
      });
    }

    return quoteMap;
  } catch (error) {
    console.error('Error fetching quotes batch:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Too Many Requests')) {
      throw new Error('Yahoo Finance API 요청 한도 초과. 잠시 후 다시 시도해주세요.');
    }
    throw error;
  }
}

/**
 * 통합 배치 Quote 조회 (주식 + 환율 + VIX를 1회 API 호출로 처리)
 *
 * 최적화: 기존 3회 호출 → 1회 호출
 * - quote(symbol)
 * - quote('KRW=X') → 환율
 * - quote('^VIX') → VIX
 *
 * @param symbols 주식 심볼 배열
 * @param options 추가 옵션 (환율, VIX 포함 여부)
 */
export interface UnifiedQuoteResult {
  stockQuotes: Map<string, unknown>;
  exchangeRate: number | null;
  vix: number | null;
}

export async function fetchUnifiedQuotesBatch(
  symbols: string[],
  options: { includeExchangeRate?: boolean; includeVIX?: boolean } = {}
): Promise<UnifiedQuoteResult> {
  const { includeExchangeRate = true, includeVIX = true } = options;

  // 캐시 키
  const exchangeRateCacheKey = CacheKey.exchangeRate();
  const vixCacheKey = CacheKey.vix();

  // 캐시에서 환율과 VIX 확인
  const cachedExchangeRate = includeExchangeRate ? cache.get<number>(exchangeRateCacheKey) : null;
  const cachedVIX = includeVIX ? cache.get<number>(vixCacheKey) : null;

  // 배치 요청할 심볼 목록 구성
  const batchSymbols = [...symbols];

  // 캐시 미스인 경우만 배치에 추가
  if (includeExchangeRate && cachedExchangeRate === null) {
    batchSymbols.push('KRW=X');
  }
  if (includeVIX && cachedVIX === null) {
    batchSymbols.push('^VIX');
  }

  console.log(`[Yahoo Finance] Unified batch quote: ${batchSymbols.length} symbols (${symbols.length} stocks${cachedExchangeRate === null && includeExchangeRate ? ' + KRW=X' : ''}${cachedVIX === null && includeVIX ? ' + ^VIX' : ''})`);

  // 배치 요청
  const quoteMap = await fetchQuotesBatch(batchSymbols);

  // 결과 분리
  const stockQuotes = new Map<string, unknown>();
  let exchangeRate: number | null = cachedExchangeRate;
  let vix: number | null = cachedVIX;

  for (const [symbol, quote] of quoteMap.entries()) {
    if (symbol === 'KRW=X') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rate = (quote as any)?.regularMarketPrice;
      if (rate) {
        exchangeRate = rate;
        cache.set(exchangeRateCacheKey, rate, CACHE_TTL.EXCHANGE_RATE);
        console.log(`[Yahoo Finance] Exchange rate cached: ${rate}`);
      }
    } else if (symbol === '^VIX') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vixValue = (quote as any)?.regularMarketPrice;
      if (vixValue) {
        vix = vixValue;
        cache.set(vixCacheKey, vixValue, CACHE_TTL.VIX);
        console.log(`[Yahoo Finance] VIX cached: ${vixValue}`);
      }
    } else {
      stockQuotes.set(symbol, quote);
    }
  }

  return {
    stockQuotes,
    exchangeRate,
    vix,
  };
}

/**
 * Historical 데이터 조회 (캐시 적용 - 1시간 TTL)
 * 과거 데이터는 변하지 않으므로 긴 TTL 적용
 */
export async function fetchHistoricalDataCached(
  symbol: string,
  days: number = 180
): Promise<Array<{ date: Date; close: number; volume: number; high: number; low: number; open: number }>> {
  const cacheKey = CacheKey.historical(symbol, days);

  return withCache(cacheKey, CACHE_TTL.HISTORICAL, async () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const historical = await retryWithDelay(
      () =>
        yahooFinance.historical(symbol, {
          period1: Math.floor(startDate.getTime() / 1000),
          period2: Math.floor(endDate.getTime() / 1000),
          interval: '1d',
        }),
      3,
      2000
    );

    console.log(`[Yahoo Finance] Historical data fetched for ${symbol}: ${historical?.length || 0} days`);
    return historical || [];
  });
}

/**
 * yahoo-finance2를 사용하여 주식 데이터 수집 - 캐시 적용 (5분 TTL)
 * @param symbol 주식 티커 심볼 (예: "AAPL", "005930.KS")
 * @param quoteData 이미 가져온 quote 데이터 (선택사항, 배치 요청 시 사용)
 * @param skipCache 캐시 건너뛰기 (강제 새로고침용)
 */
export async function fetchStockData(
  symbol: string,
  quoteData?: unknown,
  skipCache: boolean = false
): Promise<StockData> {
  const startTime = Date.now();
  const { metrics } = await import('./data-metrics');

  // 캐시 확인 (quoteData가 제공되지 않고 skipCache가 false인 경우만)
  if (!quoteData && !skipCache) {
    const cacheKey = CacheKey.stockData(symbol);
    const cached = cache.get<StockData>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // quote 데이터가 제공되지 않은 경우에만 개별 요청
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let quote = quoteData as any;
    if (!quote) {
      quote = await retryWithDelay(() => yahooFinance.quote(symbol), 3, 3000);
      console.log(`[Yahoo Finance] Quote fetched for ${symbol}`);
    }

    if (!quote || !quote.regularMarketPrice) {
      throw new Error(`Invalid symbol or no data available: ${symbol}`);
    }

    // 데이터 유효성 검증
    const currentPrice = quote.regularMarketPrice;
    if (currentPrice === null || currentPrice === undefined || isNaN(currentPrice) || currentPrice <= 0) {
      throw new Error(`Invalid price for ${symbol}: ${currentPrice}`);
    }

    const change = quote.regularMarketChange || 0;
    const changePercent = quote.regularMarketChangePercent || 0;
    const volume = Math.max(0, quote.regularMarketVolume || 0);
    const marketCap = quote.marketCap && quote.marketCap > 0 ? quote.marketCap : undefined;

    // 요청 간 딜레이 추가 (rate limiting 방지)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Historical 데이터 조회 (캐시 적용됨)
    const historical = await fetchHistoricalDataCached(symbol, 180);

    if (!historical || historical.length === 0) {
      throw new Error(`No historical data available for ${symbol}`);
    }

    // historical 데이터를 날짜 기준 정렬 (과거 → 최신 순서 보장)
    const sortedHistorical = [...historical].sort((a, b) =>
      a.date.getTime() - b.date.getTime()
    );

    // 종가 배열 추출 (과거 → 최신 순서) 및 검증
    const closes = sortedHistorical
      .map((h) => {
        const close = h.close;
        if (close === null || close === undefined || isNaN(close) || close <= 0) {
          console.warn(`Invalid close price in historical data: ${close}`);
          return null;
        }
        return close;
      })
      .filter((close): close is number => close !== null);

    if (closes.length === 0) {
      throw new Error(`No valid close prices in historical data for ${symbol}`);
    }

    const historicalData = sortedHistorical
      .filter((h) => h.close !== null && h.close !== undefined && !isNaN(h.close) && h.close > 0)
      .map((h) => ({
        date: h.date.toISOString().split('T')[0],
        close: h.close,
        volume: h.volume || 0,
        high: h.high || h.close,
        low: h.low || h.close,
        open: h.open || h.close,
      }));

    // 기술적 지표 계산
    const rsi = calculateRSI(closes, 14);
    const ma5 = calculateMA(closes, 5);
    const ma20 = calculateMA(closes, 20);
    const ma60 = calculateMA(closes, 60);
    const ma120 = calculateMA(closes, 120);
    const disparity = ma20 !== null ? calculateDisparity(currentPrice, ma20) : 0;

    const responseTime = Date.now() - startTime;
    metrics.success(symbol, 'Yahoo Finance', responseTime, {
      historicalDataPoints: historicalData.length,
    });

    const result: StockData = {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      volume,
      marketCap,
      rsi,
      movingAverages: {
        ma5: ma5 ?? 0,
        ma20: ma20 ?? 0,
        ma60: ma60 ?? 0,
        ma120: ma120 ?? 0,
      },
      disparity,
      historicalData,
    };

    // 결과 캐싱 (quoteData가 제공되지 않은 경우만 - 배치 요청이 아닐 때)
    if (!quoteData) {
      cache.set(CacheKey.stockData(symbol), result, CACHE_TTL.STOCK_DATA);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    metrics.error(symbol, 'Yahoo Finance', errorMessage);
    console.error(`Error fetching data for ${symbol}:`, error);
    if (errorMessage.includes('Too Many Requests')) {
      throw new Error(
        `Yahoo Finance API 요청 한도 초과. ${symbol} 데이터를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.`
      );
    }
    throw new Error(
      `Failed to fetch stock data for ${symbol}: ${errorMessage}`
    );
  }
}

/**
 * 여러 종목의 데이터를 배치로 수집 (quote는 배치, historical는 순차)
 * @param symbols 주식 티커 심볼 배열
 */
export async function fetchStocksDataBatch(symbols: string[]): Promise<Map<string, StockData>> {
  const results = new Map<string, StockData>();
  
  try {
    // 1. 모든 종목의 quote를 한 번에 배치 요청
    console.log(`Fetching quotes for ${symbols.length} symbols in batch...`);
    const quoteMap = await fetchQuotesBatch(symbols);
    
    // 2. 각 종목의 historical 데이터를 순차적으로 수집 (rate limiting 방지)
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const quote = quoteMap.get(symbol);
      
      if (!quote) {
        console.warn(`Quote data not found for ${symbol}, skipping...`);
        continue;
      }
      
      // 요청 간 딜레이 (첫 번째 제외)
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      
      try {
        const stockData = await fetchStockData(symbol, quote);
        results.set(symbol, stockData);
      } catch (error) {
        console.error(`Failed to fetch historical data for ${symbol}:`, error);
        // historical 실패해도 quote 데이터는 있으므로 계속 진행
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error in fetchStocksDataBatch:', error);
    throw error;
  }
}

/**
 * 환율 데이터 조회 (USD/KRW) - 캐시 적용 (10분 TTL)
 * Chart API 사용 (crumb 불필요로 Rate Limit 회피)
 */
export async function fetchExchangeRate(): Promise<number> {
  const cacheKey = CacheKey.exchangeRate();

  return withCache(cacheKey, CACHE_TTL.EXCHANGE_RATE, async () => {
    try {
      // Chart API 사용 (crumb 불필요!)
      const chartData = await fetchChartQuote('KRW=X');
      if (chartData?.regularMarketPrice) {
        console.log(`[Yahoo Chart API] Exchange rate fetched: ${chartData.regularMarketPrice} (crumb-free)`);
        return chartData.regularMarketPrice;
      }

      // Fallback: 기존 quote API (crumb 필요)
      console.log('[Yahoo Finance] Chart API failed, trying quote API...');
      const quote = await retryWithDelay(() => yahooFinance.quote('KRW=X'), 3, 2000);
      if (!quote || !quote.regularMarketPrice) {
        throw new Error('Failed to fetch exchange rate');
      }
      console.log(`[Yahoo Finance] Exchange rate fetched: ${quote.regularMarketPrice}`);
      return quote.regularMarketPrice;
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Too Many Requests')) {
        throw new Error('Yahoo Finance API 요청 한도 초과. 잠시 후 다시 시도해주세요.');
      }
      throw new Error('Failed to fetch USD/KRW exchange rate');
    }
  });
}

/**
 * VIX 지수 조회 (공포/탐욕 지표 대용) - 캐시 적용 (10분 TTL)
 * Chart API 사용 (crumb 불필요로 Rate Limit 회피)
 */
export async function fetchVIX(): Promise<number | null> {
  const cacheKey = CacheKey.vix();

  try {
    return await withCache(cacheKey, CACHE_TTL.VIX, async () => {
      // Chart API 사용 (crumb 불필요!)
      const chartData = await fetchChartQuote('^VIX');
      if (chartData?.regularMarketPrice) {
        console.log(`[Yahoo Chart API] VIX fetched: ${chartData.regularMarketPrice} (crumb-free)`);
        return chartData.regularMarketPrice;
      }

      // Fallback: 기존 quote API (crumb 필요)
      console.log('[Yahoo Finance] Chart API failed, trying quote API...');
      const quote = await retryWithDelay(() => yahooFinance.quote('^VIX'), 3, 2000);
      const vix = quote?.regularMarketPrice || null;
      console.log(`[Yahoo Finance] VIX fetched: ${vix}`);
      return vix;
    });
  } catch (error) {
    console.error('Error fetching VIX:', error);
    return null;
  }
}

/**
 * 한국 주식의 수급 데이터 수집 (KRX API 우선, 실패 시 네이버 크롤링)
 * @param symbol 한국 주식 티커 (예: "005930")
 */
export async function fetchKoreaSupplyDemand(symbol: string): Promise<SupplyDemandData | null> {
  // KRX Open API 우선 시도
  let krxFailed = false;
  let krxFailureReason: string | undefined;
  
  try {
    const { fetchKoreaSupplyDemandKRX } = await import('./krx-api');
    const krxData = await fetchKoreaSupplyDemandKRX(symbol);
    if (krxData) {
      console.log(`[Supply/Demand] Using KRX API for ${symbol}`);
      return krxData;
    }
    // null 반환된 경우 (API 키 없음, 데이터 없음 등)
    krxFailed = true;
    krxFailureReason = 'KRX API returned no data';
  } catch (error) {
    // 오류 발생한 경우 (401, 네트워크 오류 등)
    krxFailed = true;
    const errorMessage = error instanceof Error ? error.message : String(error);
    krxFailureReason = errorMessage;
    
    // 401 오류는 이미 알림이 생성되었으므로 별도 로깅만
    if (errorMessage.includes('401') || errorMessage.includes('유효하지 않습니다')) {
      console.warn(`[Supply/Demand] KRX API key invalid for ${symbol}, falling back to Naver (alert already created)`);
    } else {
      console.warn(`[Supply/Demand] KRX API failed for ${symbol}, falling back to Naver:`, errorMessage);
    }
  }

  // KRX API 실패 시 네이버 금융 크롤링 사용 (Fallback)
  if (krxFailed) {
    console.log(`[Supply/Demand] Using Naver Finance (crawling) as fallback for ${symbol}${krxFailureReason ? ` (reason: ${krxFailureReason})` : ''}`);
  }
  
  return await fetchKoreaSupplyDemandNaver(symbol);
}

/**
 * 네이버 금융에서 한국 주식의 수급 데이터 크롤링 (Fallback)
 * @param symbol 한국 주식 티커 (예: "005930")
 *
 * 네이버 금융 페이지 구조 (2026년 기준):
 * - 테이블 class: type2
 * - 컬럼: 날짜 | 종가 | 전일비 | 등락률 | 거래량 | 기관순매매 | 외국인순매매 | 보유주수 | 보유율
 * - 인덱스: 0     1      2       3       4         5           6          7        8
 */
async function fetchKoreaSupplyDemandNaver(symbol: string): Promise<SupplyDemandData | null> {
  const startTime = Date.now();
  const { metrics } = await import('./data-metrics');

  try {
    // 네이버 금융 투자자별 매매동향 페이지 URL
    const url = `https://finance.naver.com/item/frgn.naver?code=${symbol}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 10000,
      responseType: 'arraybuffer', // 한글 인코딩 처리를 위해
    });

    // EUC-KR → UTF-8 변환
    const html = new TextDecoder('euc-kr').decode(response.data);
    const $ = cheerio.load(html);

    let institutional = 0;
    let foreign = 0;
    let individual = 0;

    // 외국인 기관 순매매 거래량 테이블 (type2 class)
    // 첫 번째 데이터 행 찾기 (헤더 행 제외)
    $('table.type2 tr').each((index, element) => {
      const cells = $(element).find('td');

      // 최소 7개의 td가 있고, 첫 번째 데이터 행인 경우
      if (cells.length >= 7) {
        // 기관 순매매량 (index 5)
        const institutionalText = $(cells[5]).text().trim().replace(/,/g, '').replace(/\+/g, '');
        // 외국인 순매매량 (index 6)
        const foreignText = $(cells[6]).text().trim().replace(/,/g, '').replace(/\+/g, '');

        const institutionalParsed = parseInt(institutionalText.replace(/[^-\d]/g, ''), 10);
        const foreignParsed = parseInt(foreignText.replace(/[^-\d]/g, ''), 10);

        if (!isNaN(institutionalParsed) && !isNaN(foreignParsed)) {
          institutional = institutionalParsed;
          foreign = foreignParsed;
          // 개인은 기관+외국인의 반대값으로 추정 (수급 합계 = 0)
          individual = -(institutional + foreign);
          console.log(`[Naver Supply/Demand] Parsed for ${symbol}: institutional=${institutional}, foreign=${foreign}, individual=${individual}`);
          return false; // 첫 번째 유효한 행만 사용
        }
      }
    });

    // 데이터 검증: 실제로 0인 경우와 파싱 실패를 구분하기 어려우므로
    // 최소한 하나라도 0이 아니면 유효한 데이터로 간주
    // 단, 모든 값이 0이고 파싱이 실패했을 가능성도 있으므로 로깅
    if (institutional === 0 && foreign === 0 && individual === 0) {
      console.warn(`All supply/demand values are zero for ${symbol} (may indicate parsing failure)`);
      return null;
    }

    // 합리성 검증: 세 값의 합이 비정상적으로 크거나 작지 않은지 확인
    const total = Math.abs(institutional) + Math.abs(foreign) + Math.abs(individual);
    if (total > 1e12) { // 1조 이상은 비정상적
      console.warn(`Suspiciously large supply/demand values for ${symbol}: total=${total}`);
    }

    const responseTime = Date.now() - startTime;
    const result = {
      institutional,
      foreign,
      individual,
    };
    metrics.success(symbol, 'Naver Finance (Crawling)', responseTime);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    metrics.error(symbol, 'Naver Finance (Crawling)', errorMessage);
    console.error(`Error fetching supply/demand for ${symbol}:`, error);
    return null;
  }
}

/**
 * 뉴스 헤드라인 수집 - 캐시 적용 (30분 TTL)
 * @param symbol 주식 티커
 * @param count 수집할 뉴스 개수 (기본값: 5)
 */
export async function fetchNews(symbol: string, count: number = 5): Promise<Array<{ title: string; link: string; date: string }>> {
  const cacheKey = CacheKey.news(symbol);

  // 한국 주식 심볼 변환 (6자리 코드 -> Yahoo Finance 형식)
  let searchSymbol = symbol;
  if (/^\d{6}$/.test(symbol)) {
    searchSymbol = `${symbol}.KS`;
    console.log(`[Yahoo Finance News] 한국 주식 심볼 변환: ${symbol} -> ${searchSymbol}`);
  }

  try {
    return await withCache(cacheKey, CACHE_TTL.NEWS, async () => {
      const news = await yahooFinance.search(searchSymbol, {
        newsCount: count,
      });

      if (!news || !news.news) {
        return [];
      }

      const result = news.news.slice(0, count).map((item) => {
        let dateStr = '';
        if (item.providerPublishTime) {
          const timestamp = typeof item.providerPublishTime === 'number'
            ? item.providerPublishTime
            : parseInt(String(item.providerPublishTime), 10);
          if (!isNaN(timestamp)) {
            dateStr = new Date(timestamp * 1000).toISOString();
          }
        }
        return {
          title: item.title || '',
          link: item.link || '',
          date: dateStr,
        };
      });

      console.log(`[Yahoo Finance] News fetched for ${symbol}: ${result.length} items`);
      return result;
    });
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error);
    return [];
  }
}

/**
 * 네이버 금융에서 한국 주식 뉴스 수집 (모바일 API 사용)
 * @param symbol 한국 주식 코드 (6자리)
 * @param count 수집할 뉴스 개수 (기본값: 5)
 */
export async function fetchNaverNews(symbol: string, count: number = 5): Promise<Array<{ title: string; link: string; date: string }>> {
  const cacheKey = `naver:news:${symbol}`;

  try {
    return await withCache(cacheKey, CACHE_TTL.NEWS, async () => {
      // 네이버 주식 모바일 API 사용 (더 안정적)
      const url = `https://m.stock.naver.com/api/news/stock/${symbol}?page=1&size=${count}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
          'Accept': 'application/json',
          'Referer': 'https://m.stock.naver.com/',
        },
        timeout: 10000,
      });

      interface NaverNewsItem {
        officeId: string;
        articleId: string;
        title: string;
        titleFull?: string;
        datetime: string; // 형식: "202601211710" (YYYYMMDDHHMM)
      }

      interface NaverNewsGroup {
        total: number;
        items: NaverNewsItem[];
      }

      const newsGroups: NaverNewsGroup[] = response.data;
      const news: Array<{ title: string; link: string; date: string }> = [];

      // API 응답은 그룹화된 형태로 반환됨
      for (const group of newsGroups) {
        if (news.length >= count) break;

        for (const item of group.items) {
          if (news.length >= count) break;

          const title = item.titleFull || item.title;
          // 네이버 뉴스 링크 생성
          const link = `https://n.news.naver.com/mnews/article/${item.officeId}/${item.articleId}`;

          // 날짜 파싱 (YYYYMMDDHHMM → ISO 8601)
          let date = '';
          if (item.datetime && item.datetime.length >= 8) {
            const year = item.datetime.substring(0, 4);
            const month = item.datetime.substring(4, 6);
            const day = item.datetime.substring(6, 8);
            const hour = item.datetime.length >= 10 ? item.datetime.substring(8, 10) : '00';
            const minute = item.datetime.length >= 12 ? item.datetime.substring(10, 12) : '00';
            date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`).toISOString();
          }

          news.push({ title, link, date });
        }
      }

      console.log(`[Naver Finance API] News fetched for ${symbol}: ${news.length} items`);
      return news;
    });
  } catch (error) {
    console.error(`Error fetching Naver news for ${symbol}:`, error instanceof Error ? error.message : error);
    return [];
  }
}
