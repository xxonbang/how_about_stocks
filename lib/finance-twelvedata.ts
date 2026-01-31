/**
 * Twelve Data API 통합 모듈
 *
 * Yahoo Finance 대안으로 사용되는 Twelve Data API
 *
 * 특징:
 * - 무료 티어: 800 req/일, 8 req/분
 * - 한국 주식 지원 (KRX)
 * - 50+ 기술적 지표 내장
 * - 글로벌 시장 커버리지
 *
 * API 문서: https://twelvedata.com/docs
 */

import type { StockData } from './finance';
import { cache, CacheKey, CACHE_TTL } from './cache';
import { normalizeSymbolForTwelveData, denormalizeSymbol } from './constants';

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || '';
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

// Rate limit 관리
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 150; // 8 req/분 = 7.5초에 1회, 여유를 두고 150ms

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
  return fetch(url);
}

/**
 * Twelve Data API 사용 가능 여부 확인
 */
export function isTwelveDataAvailable(): boolean {
  return !!TWELVE_DATA_API_KEY;
}

interface TwelveDataQuote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  previous_close: string;
  change: string;
  percent_change: string;
  fifty_two_week?: {
    low: string;
    high: string;
  };
}

interface TwelveDataTimeSeries {
  meta: {
    symbol: string;
    interval: string;
    currency: string;
    exchange: string;
    type: string;
  };
  values: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  status: string;
}

/**
 * 주식 시세 조회 (단일)
 */
export async function fetchTwelveDataQuote(
  symbol: string
): Promise<TwelveDataQuote | null> {
  if (!isTwelveDataAvailable()) {
    console.warn('[TwelveData] API key not configured');
    return null;
  }

  const normalizedSymbol = normalizeSymbolForTwelveData(symbol);

  try {
    const url = `${TWELVE_DATA_BASE_URL}/quote?symbol=${normalizedSymbol}&apikey=${TWELVE_DATA_API_KEY}`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.code && data.message) {
      // API 에러 응답
      throw new Error(`TwelveData API Error: ${data.message}`);
    }

    console.log(`[TwelveData] Quote fetched for ${symbol}`);
    return data as TwelveDataQuote;
  } catch (error) {
    console.error(`[TwelveData] Failed to fetch quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * 히스토리컬 데이터 조회
 */
export async function fetchTwelveDataTimeSeries(
  symbol: string,
  outputsize: number = 180
): Promise<TwelveDataTimeSeries | null> {
  if (!isTwelveDataAvailable()) {
    console.warn('[TwelveData] API key not configured');
    return null;
  }

  const normalizedSymbol = normalizeSymbolForTwelveData(symbol);
  const cacheKey = `twelvedata:historical:${symbol}:${outputsize}`;

  // 캐시 확인
  const cached = cache.get<TwelveDataTimeSeries>(cacheKey);
  if (cached) {
    console.log(`[TwelveData] Cache HIT for historical ${symbol}`);
    return cached;
  }

  try {
    const url = `${TWELVE_DATA_BASE_URL}/time_series?symbol=${normalizedSymbol}&interval=1day&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.code && data.message) {
      throw new Error(`TwelveData API Error: ${data.message}`);
    }

    // 캐시에 저장 (1시간)
    cache.set(cacheKey, data, CACHE_TTL.HISTORICAL);
    console.log(`[TwelveData] Historical data fetched for ${symbol}: ${data.values?.length || 0} days`);

    return data as TwelveDataTimeSeries;
  } catch (error) {
    console.error(`[TwelveData] Failed to fetch historical for ${symbol}:`, error);
    return null;
  }
}

/**
 * 환율 조회 (USD/KRW)
 */
export async function fetchTwelveDataExchangeRate(): Promise<number | null> {
  if (!isTwelveDataAvailable()) {
    return null;
  }

  const cacheKey = 'twelvedata:exchangeRate:USD_KRW';
  const cached = cache.get<number>(cacheKey);
  if (cached !== null) {
    console.log('[TwelveData] Cache HIT for exchange rate');
    return cached;
  }

  try {
    const url = `${TWELVE_DATA_BASE_URL}/exchange_rate?symbol=USD/KRW&apikey=${TWELVE_DATA_API_KEY}`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.code && data.message) {
      throw new Error(`TwelveData API Error: ${data.message}`);
    }

    const rate = parseFloat(data.rate);
    if (!isNaN(rate)) {
      cache.set(cacheKey, rate, CACHE_TTL.EXCHANGE_RATE);
      console.log(`[TwelveData] Exchange rate fetched: ${rate}`);
      return rate;
    }

    return null;
  } catch (error) {
    console.error('[TwelveData] Failed to fetch exchange rate:', error);
    return null;
  }
}

/**
 * 주식 데이터 수집 (StockData 형식으로 변환)
 */
export async function fetchStockDataTwelveData(
  symbol: string
): Promise<StockData | null> {
  const [quote, timeSeries] = await Promise.all([
    fetchTwelveDataQuote(symbol),
    fetchTwelveDataTimeSeries(symbol, 180),
  ]);

  if (!quote) {
    return null;
  }

  const currentPrice = parseFloat(quote.close);
  const change = parseFloat(quote.change);
  const changePercent = parseFloat(quote.percent_change);
  const volume = parseInt(quote.volume, 10);

  // 히스토리컬 데이터 변환
  const historicalData = timeSeries?.values?.map((v) => ({
    date: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseInt(v.volume, 10),
  })) || [];

  // RSI, MA 계산
  const closes = historicalData.map((d) => d.close);
  const { calculateRSI, calculateMA, calculateDisparity } = await import('./finance');

  const rsi = closes.length >= 15 ? calculateRSI(closes, 14) : 50;
  const ma5 = calculateMA(closes, 5) || currentPrice;
  const ma20 = calculateMA(closes, 20) || currentPrice;
  const ma60 = calculateMA(closes, 60) || currentPrice;
  const ma120 = calculateMA(closes, 120) || currentPrice;
  const disparity = calculateDisparity(currentPrice, ma20);

  return {
    symbol: denormalizeSymbol(quote.symbol),
    price: currentPrice,
    change,
    changePercent,
    volume,
    marketCap: undefined, // Twelve Data 무료 티어에서 미제공
    rsi,
    movingAverages: {
      ma5,
      ma20,
      ma60,
      ma120,
    },
    disparity,
    historicalData,
  };
}

/**
 * 배치 주식 데이터 수집
 */
export async function fetchStocksDataBatchTwelveData(
  symbols: string[]
): Promise<Map<string, StockData>> {
  const results = new Map<string, StockData>();

  console.log(`[TwelveData] Fetching batch data for ${symbols.length} symbols`);

  for (const symbol of symbols) {
    try {
      const stockData = await fetchStockDataTwelveData(symbol);
      if (stockData) {
        results.set(symbol, stockData);
      }
    } catch (error) {
      console.error(`[TwelveData] Failed to fetch ${symbol}:`, error);
    }
  }

  console.log(`[TwelveData] Batch complete: ${results.size}/${symbols.length} symbols`);
  return results;
}
