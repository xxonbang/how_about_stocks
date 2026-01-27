/**
 * Financial Modeling Prep (FMP) API를 사용한 주식 데이터 수집
 *
 * 장점:
 * - Rate limit: 250 calls/day (무료), 무제한 ($19/월)
 * - NASDAQ 공식 라이선스 보유
 * - 150+ 엔드포인트
 * - 30년 역사 데이터
 * - WebSocket 실시간 지원 (유료)
 *
 * API 문서: https://site.financialmodelingprep.com/developer/docs
 * API 키 발급: https://financialmodelingprep.com/developer/docs/
 */

import axios from 'axios';
import type { StockData } from './finance';
import { calculateRSI, calculateMA, calculateDisparity } from './finance';

const FMP_API_KEY = process.env.FMP_API_KEY || '';
// 2025년 8월 31일부로 레거시 /api/v3 엔드포인트 지원 종료됨
// 새로운 /stable/ 엔드포인트 사용
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

// FMP Quote 응답 타입 (새 /stable API 기준)
interface FMPQuote {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number; // 새 API: changePercentage (단수)
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  priceAvg50: number;
  priceAvg200: number;
  exchange: string;
  volume: number;
  avgVolume?: number; // 새 API에서는 없을 수 있음
  open: number;
  previousClose: number;
  eps?: number; // 새 API에서는 없을 수 있음
  pe?: number; // 새 API에서는 없을 수 있음
  earningsAnnouncement?: string | null;
  sharesOutstanding?: number;
  timestamp: number;
}

// FMP 히스토리컬 가격 응답 타입
interface FMPHistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  unadjustedVolume: number;
  change: number;
  changePercent: number;
  vwap: number;
  label: string;
  changeOverTime: number;
}

interface FMPHistoricalResponse {
  symbol: string;
  historical: FMPHistoricalPrice[];
}

// FMP 회사 프로필 응답 타입
interface FMPCompanyProfile {
  symbol: string;
  price: number;
  beta: number;
  volAvg: number;
  mktCap: number;
  lastDiv: number;
  range: string;
  changes: number;
  companyName: string;
  currency: string;
  cik: string;
  isin: string;
  cusip: string;
  exchange: string;
  exchangeShortName: string;
  industry: string;
  website: string;
  description: string;
  ceo: string;
  sector: string;
  country: string;
  fullTimeEmployees: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  dcfDiff: number;
  dcf: number;
  image: string;
  ipoDate: string;
  defaultImage: boolean;
  isEtf: boolean;
  isActivelyTrading: boolean;
  isAdr: boolean;
  isFund: boolean;
}

// FMP 재무 비율 응답 타입
interface FMPKeyMetrics {
  symbol: string;
  date: string;
  period: string;
  revenuePerShare: number;
  netIncomePerShare: number;
  operatingCashFlowPerShare: number;
  freeCashFlowPerShare: number;
  cashPerShare: number;
  bookValuePerShare: number;
  tangibleBookValuePerShare: number;
  shareholdersEquityPerShare: number;
  interestDebtPerShare: number;
  marketCap: number;
  enterpriseValue: number;
  peRatio: number;
  priceToSalesRatio: number;
  pbRatio: number;
  priceToFreeCashFlowsRatio: number;
  priceToOperatingCashFlowsRatio: number;
  debtToEquity: number;
  debtToAssets: number;
  netDebtToEBITDA: number;
  currentRatio: number;
  dividendYield: number;
  roe: number;
  roic: number;
}

/**
 * FMP API 호출 헬퍼 (에러 처리 및 재시도 포함)
 */
async function fmpRequest<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  if (!FMP_API_KEY) {
    throw new Error('FMP_API_KEY가 설정되지 않았습니다. .env.local에 FMP_API_KEY를 추가해주세요.');
  }

  const url = `${FMP_BASE_URL}${endpoint}`;
  const queryParams = new URLSearchParams({
    ...params,
    apikey: FMP_API_KEY,
  });

  try {
    const response = await axios.get<T>(`${url}?${queryParams.toString()}`, {
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error('FMP API rate limit 초과. 내일 다시 시도하거나 유료 플랜으로 업그레이드해주세요.');
      }
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('FMP API 키가 유효하지 않습니다.');
      }
      if (error.response?.status === 404) {
        throw new Error(`종목을 찾을 수 없습니다: ${endpoint}`);
      }
      throw new Error(`FMP API 오류: ${error.message}`);
    }
    throw error;
  }
}

/**
 * FMP를 사용하여 주식 Quote 데이터 수집
 * 새 API: /stable/quote?symbol={symbol}
 */
export async function fetchQuoteFMP(symbol: string): Promise<FMPQuote | null> {
  try {
    const data = await fmpRequest<FMPQuote[]>(`/quote`, { symbol });
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error(`[FMP] Quote 조회 실패 (${symbol}):`, error);
    return null;
  }
}

// 새 API 히스토리컬 응답 타입 (배열 형태로 직접 반환)
interface FMPHistoricalPriceNew {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  vwap: number;
}

/**
 * FMP를 사용하여 히스토리컬 가격 데이터 수집
 * 새 API: /stable/historical-price-eod/full?symbol={symbol}
 */
export async function fetchHistoricalPricesFMP(
  symbol: string,
  days: number = 180
): Promise<FMPHistoricalPrice[]> {
  try {
    // 새 API는 배열 형태로 직접 반환
    const data = await fmpRequest<FMPHistoricalPriceNew[]>(
      `/historical-price-eod/full`,
      { symbol }
    );

    if (!data || !Array.isArray(data) || data.length === 0) {
      return [];
    }

    // 새 API 응답을 기존 형태로 변환 (최신→과거 순으로 반환됨)
    const converted: FMPHistoricalPrice[] = data.slice(0, days).map(item => ({
      date: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      adjClose: item.close, // 새 API에는 adjClose가 없음
      volume: item.volume,
      unadjustedVolume: item.volume,
      change: item.change,
      changePercent: item.changePercent,
      vwap: item.vwap,
      label: item.date,
      changeOverTime: 0,
    }));

    // 과거→최신 순으로 변환
    return converted.reverse();
  } catch (error) {
    console.error(`[FMP] 히스토리컬 데이터 조회 실패 (${symbol}):`, error);
    return [];
  }
}

/**
 * FMP를 사용하여 회사 프로필 조회
 * 새 API: /stable/profile?symbol={symbol}
 */
export async function fetchCompanyProfileFMP(
  symbol: string
): Promise<FMPCompanyProfile | null> {
  try {
    const data = await fmpRequest<FMPCompanyProfile[]>(`/profile`, { symbol });
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error(`[FMP] 회사 프로필 조회 실패 (${symbol}):`, error);
    return null;
  }
}

/**
 * FMP를 사용하여 재무 지표 조회
 * 새 API: /stable/key-metrics-ttm?symbol={symbol}
 */
export async function fetchKeyMetricsFMP(
  symbol: string
): Promise<FMPKeyMetrics | null> {
  try {
    const data = await fmpRequest<FMPKeyMetrics[]>(
      `/key-metrics-ttm`,
      { symbol }
    );
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error(`[FMP] 재무 지표 조회 실패 (${symbol}):`, error);
    return null;
  }
}

/**
 * FMP를 사용하여 주식 데이터 수집 (메인 함수)
 * @param symbol 주식 티커 (예: "AAPL", "TSLA", "MSFT")
 */
export async function fetchStockDataFMP(symbol: string): Promise<StockData> {
  const startTime = Date.now();

  try {
    // 1. Quote 데이터 조회 (필수)
    const quote = await fetchQuoteFMP(symbol);

    if (!quote || quote.price === 0) {
      throw new Error(`FMP에서 종목 정보를 찾을 수 없습니다: ${symbol}`);
    }

    // 데이터 유효성 검증
    const currentPrice = quote.price;
    if (
      currentPrice === null ||
      currentPrice === undefined ||
      isNaN(currentPrice) ||
      currentPrice <= 0
    ) {
      throw new Error(`유효하지 않은 가격: ${symbol} - ${currentPrice}`);
    }

    const change = quote.change || 0;
    const changePercent = quote.changePercentage || 0;

    // 2. 히스토리컬 데이터 조회 (기술적 지표 계산용)
    const historicalPrices = await fetchHistoricalPricesFMP(symbol, 180);

    let closes: number[] = [];
    let volumes: number[] = [];
    let historicalData: Array<{
      date: string;
      close: number;
      volume: number;
      high?: number;
      low?: number;
      open?: number;
    }> = [];

    if (historicalPrices.length > 0) {
      // 과거 → 최신 순서로 정렬되어 있음
      historicalData = historicalPrices.map((h) => ({
        date: h.date,
        close: h.close,
        volume: h.volume,
        high: h.high,
        low: h.low,
        open: h.open,
      }));

      closes = historicalData.map((d) => d.close);
      volumes = historicalData.map((d) => d.volume);
    }

    // 3. 기술적 지표 계산
    const rsi = closes.length >= 14 ? calculateRSI(closes, 14) : null;
    const ma5 = closes.length >= 5 ? calculateMA(closes, 5) : null;
    const ma20 = closes.length >= 20 ? calculateMA(closes, 20) : null;
    const ma60 = closes.length >= 60 ? calculateMA(closes, 60) : null;
    const ma120 = closes.length >= 120 ? calculateMA(closes, 120) : null;
    const disparity = ma20 !== null ? calculateDisparity(currentPrice, ma20) : null;

    // 4. 메트릭 수집
    const responseTime = Date.now() - startTime;
    console.log(
      `[FMP] ${symbol} 데이터 수집 완료 (${responseTime}ms, 히스토리컬: ${historicalData.length}일)`
    );

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      volume: quote.volume || 0,
      marketCap: quote.marketCap || undefined,
      rsi: rsi ?? 0,
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
    console.error(`[FMP] ${symbol} 데이터 수집 실패:`, errorMessage);
    throw new Error(`FMP 데이터 수집 실패 (${symbol}): ${errorMessage}`);
  }
}

/**
 * 여러 종목의 Quote를 배치로 수집
 * 새 API: /stable/batch-quote?symbols={symbol1},{symbol2}
 */
export async function fetchQuotesBatchFMP(
  symbols: string[]
): Promise<Map<string, FMPQuote>> {
  const quoteMap = new Map<string, FMPQuote>();

  if (symbols.length === 0) return quoteMap;

  try {
    // 새 API: batch-quote 엔드포인트 사용
    const symbolList = symbols.join(',');
    const data = await fmpRequest<FMPQuote[]>(`/batch-quote`, { symbols: symbolList });

    if (data && Array.isArray(data)) {
      data.forEach((quote) => {
        if (quote && quote.symbol) {
          quoteMap.set(quote.symbol, quote);
        }
      });
    }
  } catch (error) {
    console.error('[FMP] 배치 Quote 조회 실패:', error);
    // 배치 실패 시 개별 요청으로 폴백
    for (const symbol of symbols) {
      try {
        const quote = await fetchQuoteFMP(symbol);
        if (quote) {
          quoteMap.set(symbol, quote);
        }
      } catch {
        // 개별 실패는 무시
      }
    }
  }

  return quoteMap;
}

/**
 * VIX 지수 조회
 * 새 API: /stable/quote?symbol=^VIX
 */
export async function fetchVIXFMP(): Promise<number | null> {
  try {
    // VIX 심볼은 ^VIX 형태로 그대로 사용
    const data = await fmpRequest<FMPQuote[]>(`/quote`, { symbol: '^VIX' });
    return data && data.length > 0 ? data[0].price : null;
  } catch (error) {
    console.error('[FMP] VIX 조회 실패:', error);
    return null;
  }
}

/**
 * 환율 조회 (USD/KRW)
 * 참고: 새 API에서 USDKRW는 프리미엄 엔드포인트로 변경됨
 * 무료 플랜에서는 사용 불가
 */
export async function fetchExchangeRateFMP(): Promise<number | null> {
  try {
    // 새 API: forex 엔드포인트 시도 (프리미엄 기능)
    const data = await fmpRequest<Array<{ symbol: string; price: number; bid: number; ask: number }>>(
      '/forex',
      { symbol: 'USDKRW' }
    );
    if (data && data.length > 0) {
      const rate = data[0];
      if (rate.bid && rate.ask) {
        return (rate.bid + rate.ask) / 2;
      }
      return rate.price || null;
    }
    return null;
  } catch (error) {
    // 프리미엄 엔드포인트 에러는 조용히 처리 (무료 플랜에서는 사용 불가)
    console.log('[FMP] 환율 조회 스킵 (프리미엄 기능)');
    return null;
  }
}

/**
 * 최신 뉴스 조회
 * 새 API: /stable/stock-news?symbols={symbol}&limit={limit}
 * 참고: 일부 뉴스 엔드포인트는 프리미엄 기능일 수 있음
 */
export async function fetchNewsFMP(
  symbol: string,
  limit: number = 5
): Promise<Array<{ title: string; link: string; date: string; source: string }>> {
  try {
    const data = await fmpRequest<
      Array<{
        symbol: string;
        publishedDate: string;
        title: string;
        image: string;
        site: string;
        text: string;
        url: string;
      }>
    >(`/stock-news`, {
      symbols: symbol,
      limit: limit.toString(),
    });

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.map((item) => ({
      title: item.title,
      link: item.url,
      date: item.publishedDate,
      source: item.site,
    }));
  } catch (error) {
    // 뉴스 조회 실패는 조용히 처리 (프리미엄 기능일 수 있음)
    console.log(`[FMP] 뉴스 조회 스킵 (${symbol})`);
    return [];
  }
}

/**
 * API 키 유효성 확인
 */
export async function validateFMPApiKey(): Promise<boolean> {
  if (!FMP_API_KEY) {
    return false;
  }

  try {
    // 간단한 테스트 요청
    const quote = await fetchQuoteFMP('AAPL');
    return quote !== null;
  } catch {
    return false;
  }
}

/**
 * FMP API 사용량 정보 (무료 플랜 기준)
 */
export const FMP_LIMITS = {
  FREE_DAILY_LIMIT: 250,
  PAID_MONTHLY_PRICE: 19, // USD
  PAID_DAILY_LIMIT: 'unlimited',
} as const;
