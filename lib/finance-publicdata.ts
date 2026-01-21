/**
 * 공공데이터포털 API 통합 모듈
 *
 * 금융위원회에서 제공하는 한국 주식 데이터 API
 *
 * 데이터 출처:
 * - 주식시세정보: https://www.data.go.kr/data/15094808/openapi.do
 * - KRX상장종목정보: https://www.data.go.kr/data/15094775/openapi.do
 * - 지수시세정보: https://www.data.go.kr/data/15094807/openapi.do
 *
 * 특징:
 * - 완전 무료
 * - 관대한 Rate Limit
 * - 2020년 1월 이후 데이터 제공
 * - 종가 데이터만 제공 (실시간 불가)
 */

import type { StockData } from './finance';
import { cache, CACHE_TTL } from './cache';

const PUBLIC_DATA_API_KEY = process.env.PUBLIC_DATA_API_KEY || '';
const PUBLIC_DATA_BASE_URL = 'https://apis.data.go.kr/1160100/service';

/**
 * 공공데이터포털 API 사용 가능 여부 확인
 */
export function isPublicDataAvailable(): boolean {
  return !!PUBLIC_DATA_API_KEY;
}

/**
 * 심볼에서 종목코드 추출 (005930.KS → 005930)
 */
function extractStockCode(symbol: string): string {
  return symbol.replace(/\.(KS|KQ)$/, '');
}

interface PublicDataStockPrice {
  basDt: string; // 기준일자
  srtnCd: string; // 단축코드
  isinCd: string; // ISIN코드
  itmsNm: string; // 종목명
  mrktCtg: string; // 시장구분
  clpr: string; // 종가
  vs: string; // 대비
  fltRt: string; // 등락률
  mkp: string; // 시가
  hipr: string; // 고가
  lopr: string; // 저가
  trqu: string; // 거래량
  trPrc: string; // 거래대금
  lstgStCnt: string; // 상장주식수
  mrktTotAmt: string; // 시가총액
}

interface PublicDataResponse<T> {
  response: {
    header: {
      resultCode: string;
      resultMsg: string;
    };
    body: {
      numOfRows: number;
      pageNo: number;
      totalCount: number;
      items: {
        item: T | T[];
      };
    };
  };
}

/**
 * 날짜 포맷 변환 (YYYY-MM-DD → YYYYMMDD)
 */
function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 최근 영업일 계산 (주말 제외)
 */
function getRecentBusinessDay(date: Date = new Date()): Date {
  const result = new Date(date);
  const day = result.getDay();

  // 일요일이면 금요일로
  if (day === 0) {
    result.setDate(result.getDate() - 2);
  }
  // 토요일이면 금요일로
  else if (day === 6) {
    result.setDate(result.getDate() - 1);
  }

  return result;
}

/**
 * 주식 시세 조회 (단일 종목, 특정 일자)
 */
async function fetchStockPriceByDate(
  stockCode: string,
  date: string
): Promise<PublicDataStockPrice | null> {
  if (!isPublicDataAvailable()) {
    console.warn('[PublicData] API key not configured');
    return null;
  }

  try {
    const url = new URL(`${PUBLIC_DATA_BASE_URL}/GetStockSecuritiesInfoService/getStockPriceInfo`);
    url.searchParams.append('serviceKey', PUBLIC_DATA_API_KEY);
    url.searchParams.append('numOfRows', '1');
    url.searchParams.append('pageNo', '1');
    url.searchParams.append('resultType', 'json');
    url.searchParams.append('basDt', date);
    url.searchParams.append('likeSrtnCd', stockCode);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: PublicDataResponse<PublicDataStockPrice> = await response.json();

    if (data.response.header.resultCode !== '00') {
      throw new Error(`API Error: ${data.response.header.resultMsg}`);
    }

    const items = data.response.body.items.item;
    if (!items) {
      return null;
    }

    // 단일 항목 또는 배열 처리
    const item = Array.isArray(items) ? items[0] : items;
    return item || null;
  } catch (error) {
    console.error(`[PublicData] Failed to fetch stock price for ${stockCode}:`, error);
    return null;
  }
}

/**
 * 주식 히스토리컬 데이터 조회
 */
async function fetchStockHistorical(
  stockCode: string,
  days: number = 180
): Promise<PublicDataStockPrice[]> {
  if (!isPublicDataAvailable()) {
    return [];
  }

  const cacheKey = `publicdata:historical:${stockCode}:${days}`;
  const cached = cache.get<PublicDataStockPrice[]>(cacheKey);
  if (cached) {
    console.log(`[PublicData] Cache HIT for historical ${stockCode}`);
    return cached;
  }

  try {
    const endDate = getRecentBusinessDay();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const url = new URL(`${PUBLIC_DATA_BASE_URL}/GetStockSecuritiesInfoService/getStockPriceInfo`);
    url.searchParams.append('serviceKey', PUBLIC_DATA_API_KEY);
    url.searchParams.append('numOfRows', String(days));
    url.searchParams.append('pageNo', '1');
    url.searchParams.append('resultType', 'json');
    url.searchParams.append('beginBasDt', formatDateForApi(startDate));
    url.searchParams.append('endBasDt', formatDateForApi(endDate));
    url.searchParams.append('likeSrtnCd', stockCode);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: PublicDataResponse<PublicDataStockPrice> = await response.json();

    if (data.response.header.resultCode !== '00') {
      throw new Error(`API Error: ${data.response.header.resultMsg}`);
    }

    const items = data.response.body.items.item;
    if (!items) {
      return [];
    }

    const result = Array.isArray(items) ? items : [items];

    // 캐시에 저장 (1시간)
    cache.set(cacheKey, result, CACHE_TTL.HISTORICAL);
    console.log(`[PublicData] Historical data fetched for ${stockCode}: ${result.length} days`);

    return result;
  } catch (error) {
    console.error(`[PublicData] Failed to fetch historical for ${stockCode}:`, error);
    return [];
  }
}

/**
 * 주식 데이터 수집 (StockData 형식으로 변환)
 */
export async function fetchStockDataPublicData(
  symbol: string
): Promise<StockData | null> {
  const stockCode = extractStockCode(symbol);

  // 최근 영업일 시세 조회
  const recentDate = getRecentBusinessDay();
  let priceData = await fetchStockPriceByDate(stockCode, formatDateForApi(recentDate));

  // 데이터가 없으면 하루 전 시도
  if (!priceData) {
    const previousDate = new Date(recentDate);
    previousDate.setDate(previousDate.getDate() - 1);
    priceData = await fetchStockPriceByDate(stockCode, formatDateForApi(getRecentBusinessDay(previousDate)));
  }

  if (!priceData) {
    console.warn(`[PublicData] No price data found for ${symbol}`);
    return null;
  }

  // 히스토리컬 데이터 조회
  const historicalRaw = await fetchStockHistorical(stockCode, 180);

  // 데이터 변환
  const currentPrice = parseInt(priceData.clpr, 10);
  const change = parseInt(priceData.vs, 10);
  const changePercent = parseFloat(priceData.fltRt);
  const volume = parseInt(priceData.trqu, 10);
  const marketCap = parseInt(priceData.mrktTotAmt, 10);

  // 히스토리컬 데이터 변환 (날짜 내림차순 → 오름차순)
  const historicalData = historicalRaw
    .map((item) => ({
      date: `${item.basDt.slice(0, 4)}-${item.basDt.slice(4, 6)}-${item.basDt.slice(6, 8)}`,
      open: parseInt(item.mkp, 10),
      high: parseInt(item.hipr, 10),
      low: parseInt(item.lopr, 10),
      close: parseInt(item.clpr, 10),
      volume: parseInt(item.trqu, 10),
    }))
    .reverse();

  // RSI, MA 계산
  const closes = historicalData.map((d) => d.close);
  const { calculateRSI, calculateMA, calculateDisparity } = await import('./finance');

  const rsi = closes.length >= 15 ? calculateRSI(closes, 14) : 50;
  const ma5 = calculateMA(closes, 5) || currentPrice;
  const ma20 = calculateMA(closes, 20) || currentPrice;
  const ma60 = calculateMA(closes, 60) || currentPrice;
  const ma120 = calculateMA(closes, 120) || currentPrice;
  const disparity = calculateDisparity(currentPrice, ma20);

  console.log(`[PublicData] Stock data fetched for ${symbol}: price=${currentPrice}, volume=${volume}`);

  return {
    symbol,
    price: currentPrice,
    change,
    changePercent,
    volume,
    marketCap: marketCap || undefined,
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
 * 배치 주식 데이터 수집 (한국 주식만)
 */
export async function fetchStocksDataBatchPublicData(
  symbols: string[]
): Promise<Map<string, StockData>> {
  const results = new Map<string, StockData>();

  // 한국 주식만 필터링
  const koreaSymbols = symbols.filter(
    (s) => s.endsWith('.KS') || s.endsWith('.KQ')
  );

  console.log(`[PublicData] Fetching batch data for ${koreaSymbols.length} Korean symbols`);

  for (const symbol of koreaSymbols) {
    try {
      const stockData = await fetchStockDataPublicData(symbol);
      if (stockData) {
        results.set(symbol, stockData);
      }
    } catch (error) {
      console.error(`[PublicData] Failed to fetch ${symbol}:`, error);
    }

    // Rate limit 방지 딜레이
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`[PublicData] Batch complete: ${results.size}/${koreaSymbols.length} symbols`);
  return results;
}

/**
 * KOSPI/KOSDAQ 지수 조회
 */
export async function fetchKoreanIndex(
  indexType: 'KOSPI' | 'KOSDAQ'
): Promise<{ value: number; change: number; changePercent: number } | null> {
  if (!isPublicDataAvailable()) {
    return null;
  }

  const cacheKey = `publicdata:index:${indexType}`;
  const cached = cache.get<{ value: number; change: number; changePercent: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const recentDate = getRecentBusinessDay();
    const url = new URL(`${PUBLIC_DATA_BASE_URL}/GetMarketIndexInfoService/getStockMarketIndex`);
    url.searchParams.append('serviceKey', PUBLIC_DATA_API_KEY);
    url.searchParams.append('numOfRows', '1');
    url.searchParams.append('pageNo', '1');
    url.searchParams.append('resultType', 'json');
    url.searchParams.append('basDt', formatDateForApi(recentDate));
    url.searchParams.append('idxNm', indexType);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.response?.header?.resultCode !== '00') {
      throw new Error(`API Error: ${data.response?.header?.resultMsg}`);
    }

    const items = data.response?.body?.items?.item;
    if (!items) {
      return null;
    }

    const item = Array.isArray(items) ? items[0] : items;
    const result = {
      value: parseFloat(item.clpr),
      change: parseFloat(item.vs),
      changePercent: parseFloat(item.fltRt),
    };

    cache.set(cacheKey, result, CACHE_TTL.QUOTE);
    console.log(`[PublicData] ${indexType} index fetched: ${result.value}`);

    return result;
  } catch (error) {
    console.error(`[PublicData] Failed to fetch ${indexType} index:`, error);
    return null;
  }
}
