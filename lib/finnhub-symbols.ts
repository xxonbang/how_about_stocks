/**
 * Finnhub Stock Symbols API를 활용한 전체 종목 리스트
 * 
 * 한국/미국 거래소의 모든 종목(ETF 포함)을 가져옵니다.
 */

export interface FinnhubStockSymbol {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
  currency?: string;
  exchange?: string;
}

/**
 * Finnhub Stock Symbols API로 특정 거래소의 전체 종목 리스트 가져오기
 */
export async function fetchStockSymbolsFromFinnhub(
  exchange: string,
  securityType?: string
): Promise<FinnhubStockSymbol[]> {
  const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY || '';

  if (!FINNHUB_API_KEY) {
    console.warn('FINNHUB_API_KEY not available, skipping Finnhub symbols fetch');
    return [];
  }

  try {
    const { getCircuitBreaker } = await import('./circuit-breaker');
    const breaker = getCircuitBreaker('finnhub', { failureThreshold: 3, resetTimeout: 30000 });

    return await breaker.execute(async () => {
      let url = `https://finnhub.io/api/v1/stock/symbol?exchange=${exchange}&token=${FINNHUB_API_KEY}`;
      if (securityType) {
        url += `&securityType=${securityType}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Finnhub API failed: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        return [];
      }

      return (data as FinnhubStockSymbol[]).filter((item) => item.symbol && item.description);
    });
  } catch (error) {
    console.error(`Error fetching stock symbols from Finnhub for ${exchange}:`, error);
    return [];
  }
}

/**
 * 한국 거래소 전체 종목 리스트 가져오기 (KOSPI + KOSDAQ)
 */
export async function fetchKoreaStockSymbols(): Promise<FinnhubStockSymbol[]> {
  const promises = [
    fetchStockSymbolsFromFinnhub('KR'), // 한국 전체
    fetchStockSymbolsFromFinnhub('KS'), // KOSPI
    fetchStockSymbolsFromFinnhub('KQ'), // KOSDAQ
  ];

  const results = await Promise.all(promises);
  
  // 중복 제거 (Symbol 기준, description은 가장 긴 것 유지 - 정확한 종목명 보장)
  const symbolMap = new Map<string, FinnhubStockSymbol>();
  for (const resultSet of results) {
    for (const item of resultSet) {
      const symbolKey = item.symbol.toUpperCase();
      if (!symbolMap.has(symbolKey)) {
        symbolMap.set(symbolKey, item);
      } else {
        // 기존 종목보다 이름이 더 긴 경우 업데이트 (정확한 종목명 보장)
        const existing = symbolMap.get(symbolKey);
        if (existing && item.description && existing.description && 
            item.description.length > existing.description.length) {
          symbolMap.set(symbolKey, item);
        }
      }
    }
  }

  return Array.from(symbolMap.values());
}

/**
 * 미국 거래소 전체 종목 리스트 가져오기
 */
export async function fetchUSStockSymbols(): Promise<FinnhubStockSymbol[]> {
  return fetchStockSymbolsFromFinnhub('US');
}

/**
 * ETF 리스트 가져오기 (한국 + 미국)
 */
export async function fetchETFList(): Promise<FinnhubStockSymbol[]> {
  const promises = [
    fetchStockSymbolsFromFinnhub('KR', 'ETF'),
    fetchStockSymbolsFromFinnhub('US', 'ETF'),
  ];

  const results = await Promise.all(promises);
  
  // 중복 제거 (Symbol 기준, description은 가장 긴 것 유지 - 정확한 종목명 보장)
  const symbolMap = new Map<string, FinnhubStockSymbol>();
  for (const resultSet of results) {
    for (const item of resultSet) {
      const symbolKey = item.symbol.toUpperCase();
      if (!symbolMap.has(symbolKey)) {
        symbolMap.set(symbolKey, item);
      } else {
        // 기존 종목보다 이름이 더 긴 경우 업데이트 (정확한 종목명 보장)
        const existing = symbolMap.get(symbolKey);
        if (existing && item.description && existing.description && 
            item.description.length > existing.description.length) {
          symbolMap.set(symbolKey, item);
        }
      }
    }
  }

  return Array.from(symbolMap.values());
}
