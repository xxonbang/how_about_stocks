/**
 * Finnhub API를 사용한 주식 데이터 수집
 * 
 * 장점:
 * - Rate limit: 60 calls/min (Yahoo보다 훨씬 여유)
 * - 한국/미국 주식 모두 지원
 * - 뉴스 데이터 포함
 * - 안정적인 API
 * 
 * API 키 발급: https://finnhub.io/
 */

import axios from 'axios';
import type { StockData, SupplyDemandData } from './finance';
import { calculateRSI, calculateMA, calculateDisparity } from './finance';
import yahooFinance from 'yahoo-finance2';
import { validateFinnhubYahooConsistency } from './data-consistency-checker';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

interface FinnhubQuote {
  c: number; // current price
  d: number; // change
  dp: number; // percent change
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // previous close
  t: number; // timestamp
}

interface FinnhubCandle {
  c: number[]; // close prices
  h: number[]; // high prices
  l: number[]; // low prices
  o: number[]; // open prices
  s: string; // status
  t: number[]; // timestamps
  v: number[]; // volumes
}

/**
 * Finnhub API 호출 헬퍼 (에러 처리 및 재시도 포함)
 */
async function finnhubRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY가 설정되지 않았습니다.');
  }

  const url = `${FINNHUB_BASE_URL}${endpoint}`;
  const queryParams = new URLSearchParams({
    ...params,
    token: FINNHUB_API_KEY,
  });

  try {
    const response = await axios.get<T>(`${url}?${queryParams.toString()}`, {
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error('Finnhub API rate limit 초과. 잠시 후 다시 시도해주세요.');
      }
      if (error.response?.status === 401) {
        import('./alert-system').then(({ alertSystem }) => {
          alertSystem.alertApiKeyInvalid('Finnhub', `HTTP 401`, { endpoint });
        }).catch(() => {});
        throw new Error('Finnhub API 키가 유효하지 않습니다.');
      }
      throw new Error(`Finnhub API 오류: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Finnhub를 사용하여 주식 데이터 수집
 * @param symbol 주식 티커 (예: "AAPL", "TSLA", "005930" for Samsung)
 */
export async function fetchStockDataFinnhub(symbol: string): Promise<StockData> {
  const startTime = Date.now();
  const { metrics } = await import('./data-metrics');

  try {
    // 1. 현재 시세 조회
    const quote = await finnhubRequest<FinnhubQuote>('/quote', { symbol });

    if (!quote || quote.c === 0) {
      throw new Error(`Invalid symbol or no data available: ${symbol}`);
    }

    // 데이터 유효성 검증
    const currentPrice = quote.c;
    if (currentPrice === null || currentPrice === undefined || isNaN(currentPrice) || currentPrice <= 0) {
      throw new Error(`Invalid price for ${symbol}: ${currentPrice}`);
    }

    const change = quote.d || 0;
    const changePercent = quote.dp || 0;

    // 2. 과거 120일치 데이터 조회
    // Finnhub 무료 플랜에서는 /stock/candle API가 제한되므로
    // Yahoo Finance를 fallback으로 사용
    let closes: number[] = [];
    let volumes: number[] = [];
    let timestamps: number[] = [];
    let historicalData: Array<{
      date: string;
      close: number;
      volume: number;
      high?: number;
      low?: number;
      open?: number;
    }> = [];

    try {
      // 먼저 Finnhub candle API 시도 (유료 플랜용)
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - 180 * 24 * 60 * 60; // 180일 전 (지표 계산용)

      const candles = await finnhubRequest<FinnhubCandle>('/stock/candle', {
        symbol,
        resolution: 'D',
        from: startDate.toString(),
        to: endDate.toString(),
      });

      if (candles && candles.c && candles.c.length > 0) {
        closes = candles.c;
        volumes = candles.v;
        timestamps = candles.t;
        
        // Finnhub candle 데이터 사용 시 historicalData 구성
        const highs = candles.h;
        const lows = candles.l;
        const opens = candles.o;
        
        // 날짜 기준 정렬 (과거 → 최신 순서 보장)
        const historicalDataUnsorted = closes.map((close, index) => ({
          date: new Date(timestamps[index] * 1000).toISOString().split('T')[0],
          close,
          volume: volumes[index] || 0,
          high: highs[index] || close,
          low: lows[index] || close,
          open: opens[index] || close,
        }));
        
        historicalData = historicalDataUnsorted.sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
      } else {
        throw new Error('No candle data from Finnhub');
      }
    } catch (error) {
      // Finnhub candle API 실패 시 Yahoo Finance 사용
      console.log(`Finnhub candle API not available, using Yahoo Finance for historical data: ${symbol}`);
      
      // 재시도 로직 포함
      let historical = null;
      let retries = 3;
      
      while (retries > 0 && !historical) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 3000)); // 3초 대기
          
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 180);

          // chart() API 사용 (historical()의 대체)
          const chart = await yahooFinance.chart(symbol, {
            period1: Math.floor(startDate.getTime() / 1000),
            period2: Math.floor(endDate.getTime() / 1000),
            interval: '1d',
          });

          if (chart && chart.quotes && chart.quotes.length > 0) {
            historical = chart.quotes;
          }
        } catch (yahooError) {
          retries--;
          if (retries === 0) {
            console.error(`Failed to fetch historical data from Yahoo Finance after retries: ${symbol}`);
            throw new Error(`No historical data available for ${symbol} from both Finnhub and Yahoo Finance`);
          }
          console.log(`Yahoo Finance request failed, retrying... (${retries} attempts left)`);
        }
      }

      if (!historical || historical.length === 0) {
        throw new Error(`No historical data available for ${symbol}`);
      }

      // 유효한 데이터만 필터링
      const validHistorical = historical.filter(
        (h) => h.close !== null && h.close !== undefined && !isNaN(h.close) && h.close > 0
      );

      if (validHistorical.length === 0) {
        throw new Error(`No valid historical data for ${symbol}`);
      }

      // 데이터 소스 정합성 검증 (Finnhub quote + Yahoo Finance historical)
      // 타입 안전성을 위해 매핑
      const historicalForValidation = validHistorical.map((h) => ({
        date: h.date,
        close: h.close! as number, // 필터링으로 null이 아님을 보장
      }));

      const consistencyCheck = await validateFinnhubYahooConsistency(
        { c: currentPrice, t: quote.t },
        historicalForValidation,
        symbol
      );

      // 메트릭 수집
      const { metrics } = await import('./data-metrics');
      metrics.consistencyCheck(
        symbol,
        'Finnhub+Yahoo',
        consistencyCheck.warnings,
        consistencyCheck.errors,
        {
          quotePrice: currentPrice,
          quoteTimestamp: quote.t,
          historicalCount: validHistorical.length,
        }
      );

      if (!consistencyCheck.isValid) {
        console.error(
          `[Data Consistency] ${symbol}: Data consistency check failed. Errors:`,
          consistencyCheck.errors
        );
        // 오류가 있어도 계속 진행 (경고만 표시)
      }

      if (consistencyCheck.warnings.length > 0) {
        console.warn(
          `[Data Consistency] ${symbol}: ${consistencyCheck.warnings.length} warning(s) detected`
        );
      }

      closes = validHistorical.map((h) => h.close || 0);
      volumes = validHistorical.map((h) => h.volume || 0);
      timestamps = validHistorical.map((h) => Math.floor((h.date?.getTime() || Date.now()) / 1000));
      
      // high, low, open도 함께 추출
      const highs = validHistorical.map((h) => h.high || h.close || 0);
      const lows = validHistorical.map((h) => h.low || h.close || 0);
      const opens = validHistorical.map((h) => h.open || h.close || 0);
      
      // Historical 데이터 구성 (Yahoo Finance fallback)
      // 날짜 기준 정렬 (과거 → 최신 순서 보장)
      const historicalDataUnsorted = closes.map((close, index) => ({
        date: new Date(timestamps[index] * 1000).toISOString().split('T')[0],
        close,
        volume: volumes[index] || 0,
        high: highs[index] || close,
        low: lows[index] || close,
        open: opens[index] || close,
      }));
      
      // 날짜 기준 정렬 (과거 → 최신)
      historicalData = historicalDataUnsorted.sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    }

    // closes 배열이 날짜 순서와 일치하도록 정렬
    // historicalData는 이미 정렬되어 있으므로, closes도 같은 순서로 재구성
    if (historicalData.length > 0) {
      closes = historicalData.map(d => d.close);
      volumes = historicalData.map(d => d.volume);
    }
    
    // 기술적 지표 계산 (closes는 "과거 → 최신" 순서)
    const rsi = calculateRSI(closes, 14);
    const ma5 = calculateMA(closes, 5);
    const ma20 = calculateMA(closes, 20);
    const ma60 = calculateMA(closes, 60);
    const ma120 = calculateMA(closes, 120);
    const disparity = ma20 !== null ? calculateDisparity(currentPrice, ma20) : null;

    // Market cap은 별도 API 호출 필요 (선택사항)
    // const companyProfile = await finnhubRequest('/stock/profile2', { symbol });

    const responseTime = Date.now() - startTime;
    metrics.success(symbol, 'Finnhub', responseTime, {
      historicalDataPoints: historicalData.length,
    });

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      volume: volumes[0] || 0, // 최신 거래량
      // marketCap: companyProfile?.marketCapitalization,
      rsi,
      movingAverages: {
        ma5: ma5 ?? 0,
        ma20: ma20 ?? 0,
        ma60: ma60 ?? 0,
        ma120: ma120 ?? 0,
      },
      disparity: disparity ?? 0,
      historicalData,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    metrics.error(symbol, 'Finnhub', errorMessage);
    console.error(`Error fetching Finnhub data for ${symbol}:`, error);
    throw new Error(`Failed to fetch stock data for ${symbol}: ${errorMessage}`);
  }
}

/**
 * 여러 종목의 quote를 배치로 수집
 */
export async function fetchQuotesBatchFinnhub(symbols: string[]): Promise<Map<string, FinnhubQuote>> {
  const quoteMap = new Map<string, FinnhubQuote>();

  // Finnhub는 quote API가 개별 호출이지만, rate limit이 충분하므로 병렬 처리
  const promises = symbols.map(async (symbol) => {
    try {
      const quote = await finnhubRequest<FinnhubQuote>('/quote', { symbol });
      return { symbol, quote };
    } catch (error) {
      console.error(`Failed to fetch quote for ${symbol}:`, error);
      return null;
    }
  });

  const results = await Promise.all(promises);
  results.forEach((result) => {
    if (result && result.quote) {
      quoteMap.set(result.symbol, result.quote);
    }
  });

  return quoteMap;
}

/**
 * 여러 종목의 데이터를 배치로 수집
 */
export async function fetchStocksDataBatchFinnhub(
  symbols: string[]
): Promise<Map<string, StockData>> {
  const results = new Map<string, StockData>();

  // Finnhub는 rate limit이 충분하므로 병렬 처리 가능
  // 하지만 안정성을 위해 약간의 딜레이 추가
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];

    // 요청 간 딜레이 (첫 번째 제외)
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 딜레이
    }

    try {
      const stockData = await fetchStockDataFinnhub(symbol);
      results.set(symbol, stockData);
    } catch (error) {
      console.error(`Failed to fetch data for ${symbol}:`, error);
      // 실패해도 계속 진행
    }
  }

  return results;
}

/**
 * 환율 데이터 조회 (USD/KRW)
 * 
 * ⚠️ 현재 미구현 상태입니다.
 * Finnhub Forex API는 다른 구조를 사용하므로
 * finance-adapter.ts에서 자동으로 Yahoo Finance로 fallback됩니다.
 */
export async function fetchExchangeRateFinnhub(): Promise<number | null> {
  // Finnhub Forex API는 다른 구조를 사용하므로
  // 현재는 Yahoo Finance를 사용하도록 명시적으로 null 반환
  // finance-adapter.ts에서 자동으로 Yahoo Finance로 fallback됨
  console.warn('[Finnhub] Exchange rate API not implemented, falling back to Yahoo Finance');
  return null;
}

/**
 * VIX 지수 조회
 */
export async function fetchVIXFinnhub(): Promise<number | null> {
  try {
    const quote = await finnhubRequest<FinnhubQuote>('/quote', { symbol: '^VIX' });
    return quote?.c || null;
  } catch (error) {
    console.error('Error fetching VIX from Finnhub:', error);
    return null;
  }
}

/**
 * 뉴스 헤드라인 수집
 */
export async function fetchNewsFinnhub(
  symbol: string,
  count: number = 5
): Promise<Array<{ title: string; link: string; date: string }>> {
  try {
    const news = await finnhubRequest<
      Array<{
        category: string;
        datetime: number;
        headline: string;
        id: number;
        image: string;
        related: string;
        source: string;
        summary: string;
        url: string;
      }>
    >('/company-news', {
      symbol,
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7일 전
      to: new Date().toISOString().split('T')[0],
    });

    return (news || [])
      .slice(0, count)
      .map((item) => ({
        title: item.headline,
        link: item.url,
        date: new Date(item.datetime * 1000).toISOString(),
      }));
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error);
    return [];
  }
}

/**
 * 한국 주식 심볼 변환 (005930 -> 005930.KS)
 * Finnhub는 한국 주식을 다르게 처리할 수 있음
 */
export function normalizeKoreaSymbol(symbol: string): string {
  // 이미 .KS가 있으면 그대로 반환
  if (symbol.includes('.')) {
    return symbol;
  }

  // 6자리 숫자면 한국 주식으로 간주
  if (/^\d{6}$/.test(symbol)) {
    // Finnhub는 한국 주식을 어떻게 처리하는지 확인 필요
    // 일단 원래 심볼 반환 (실제 테스트 후 조정)
    return symbol;
  }

  return symbol;
}
