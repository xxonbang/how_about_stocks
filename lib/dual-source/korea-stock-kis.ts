/**
 * 한국 주식 데이터 수집기 - 한국투자증권 Open API (KIS)
 *
 * KIS 특징:
 * - 국내 최초 증권사 공식 Open API (2022년 출시)
 * - REST API + WebSocket 지원
 * - 실시간 시세 데이터 제공
 * - OCX 없이 서버사이드에서 사용 가능
 * - Claude/ChatGPT AI 연동 공식 지원
 *
 * 네이버 금융 크롤링 대비 장점:
 * - 공식 API로 안정적인 데이터 제공
 * - 웹사이트 구조 변경 영향 없음
 * - 실시간 데이터 지원
 */

import type {
  StockDataCollector,
  CollectionResult,
  StockBasicInfo,
  StockPriceData,
  StockValuationData,
  StockFinancialData,
  StockSupplyDemandData,
  StockMarketData,
  ComprehensiveStockData,
} from './types';
import { cache, CACHE_TTL } from '../cache';
import {
  fetchQuoteKIS,
  fetchDailyPricesKIS,
  isKISConfigured,
} from '../finance-kis';

// 듀얼소스용 캐시 키
const KISCacheKey = {
  koreaStock: (symbol: string) => `kis:kr:${symbol}`,
};

export class KoreaStockKISCollector implements StockDataCollector {
  async collectBasicInfo(symbol: string): Promise<CollectionResult<StockBasicInfo>> {
    const startTime = Date.now();

    try {
      const quote = await fetchQuoteKIS(symbol);

      if (!quote) {
        throw new Error(`종목 정보를 찾을 수 없습니다: ${symbol}`);
      }

      // 시장 구분 (KOSPI/KOSDAQ)
      const market = quote.rprs_mrkt_kor_name || 'KRX';

      return {
        data: {
          symbol: symbol.replace(/\.(KS|KQ)$/, ''),
          name: quote.bstp_kor_isnm || symbol, // 업종한글명을 종목명으로 사용 (실제로는 별도 API 필요)
          market,
          exchange: 'KRX',
        },
        source: 'api',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'api',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    }
  }

  async collectPriceData(symbol: string): Promise<CollectionResult<StockPriceData>> {
    const startTime = Date.now();

    try {
      const quote = await fetchQuoteKIS(symbol);

      if (!quote || !quote.stck_prpr) {
        throw new Error(`가격 정보를 찾을 수 없습니다: ${symbol}`);
      }

      const currentPrice = parseFloat(quote.stck_prpr);
      const change = parseFloat(quote.prdy_vrss || '0');

      return {
        data: {
          currentPrice,
          previousClose: currentPrice - change,
          change,
          changePercent: parseFloat(quote.prdy_ctrt || '0'),
          open: parseFloat(quote.stck_oprc || '0'),
          high: parseFloat(quote.stck_hgpr || '0'),
          low: parseFloat(quote.stck_lwpr || '0'),
          volume: parseInt(quote.acml_vol || '0', 10),
          tradingValue: parseInt(quote.acml_tr_pbmn || '0', 10),
          high52Week: parseFloat(quote.w52_hgpr || '0'),
          low52Week: parseFloat(quote.w52_lwpr || '0'),
        },
        source: 'api',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'api',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    }
  }

  async collectValuationData(symbol: string): Promise<CollectionResult<StockValuationData>> {
    const startTime = Date.now();

    try {
      const quote = await fetchQuoteKIS(symbol);

      if (!quote) {
        throw new Error(`평가 정보를 찾을 수 없습니다: ${symbol}`);
      }

      return {
        data: {
          per: quote.per ? parseFloat(quote.per) : null,
          pbr: quote.pbr ? parseFloat(quote.pbr) : null,
          eps: quote.eps ? parseFloat(quote.eps) : null,
          bps: quote.bps ? parseFloat(quote.bps) : null,
          roe: null, // 별도 API 필요
          dividendYield: null, // 별도 API 필요
          estimatedPer: null,
          estimatedEps: null,
        },
        source: 'api',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'api',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    }
  }

  async collectFinancialData(symbol: string): Promise<CollectionResult<StockFinancialData>> {
    const startTime = Date.now();

    // KIS 기본 API에서는 재무 데이터를 직접 제공하지 않음
    // 별도의 재무제표 API 필요
    return {
      data: {
        revenue: null,
        operatingIncome: null,
        netIncome: null,
        operatingMargin: null,
        netProfitMargin: null,
        fiscalDate: null,
      },
      source: 'api',
      timestamp: Date.now(),
      success: true,
      latency: Date.now() - startTime,
    };
  }

  async collectSupplyDemandData(symbol: string): Promise<CollectionResult<StockSupplyDemandData>> {
    const startTime = Date.now();

    try {
      const quote = await fetchQuoteKIS(symbol);

      if (!quote) {
        throw new Error(`수급 정보를 찾을 수 없습니다: ${symbol}`);
      }

      return {
        data: {
          foreignOwnership: quote.hts_frgn_ehrt ? parseFloat(quote.hts_frgn_ehrt) : null,
          foreignNetBuy: quote.frgn_ntby_qty ? parseInt(quote.frgn_ntby_qty, 10) : null,
          institutionalNetBuy: null, // 별도 API 필요
          individualNetBuy: null, // 별도 API 필요
        },
        source: 'api',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'api',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    }
  }

  async collectMarketData(symbol: string): Promise<CollectionResult<StockMarketData>> {
    const startTime = Date.now();

    try {
      const quote = await fetchQuoteKIS(symbol);

      if (!quote) {
        throw new Error(`시장 정보를 찾을 수 없습니다: ${symbol}`);
      }

      return {
        data: {
          marketCap: quote.hts_avls ? parseInt(quote.hts_avls, 10) * 100000000 : null, // 억 → 원
          sharesOutstanding: quote.lstn_stcn ? parseInt(quote.lstn_stcn, 10) : null,
          floatShares: null, // 별도 계산 필요
          beta: null, // KIS에서 제공하지 않음
        },
        source: 'api',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'api',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    }
  }

  async collectAll(symbol: string): Promise<CollectionResult<ComprehensiveStockData>> {
    const startTime = Date.now();
    const cleanSymbol = symbol.replace(/\.(KS|KQ)$/, '');
    const cacheKey = KISCacheKey.koreaStock(cleanSymbol);

    // 캐시 확인
    const cached = cache.get<CollectionResult<ComprehensiveStockData>>(cacheKey);
    if (cached && cached.success) {
      console.log(`[KIS DualSource] Cache HIT for ${cleanSymbol}`);
      return {
        ...cached,
        latency: Date.now() - startTime,
      };
    }

    try {
      // Quote 데이터 조회
      const quote = await fetchQuoteKIS(cleanSymbol);

      if (!quote || !quote.stck_prpr) {
        throw new Error(`가격 정보를 찾을 수 없습니다: ${cleanSymbol}`);
      }

      const currentPrice = parseFloat(quote.stck_prpr);
      const change = parseFloat(quote.prdy_vrss || '0');

      // 시장 구분
      const market = quote.rprs_mrkt_kor_name || 'KRX';

      const comprehensiveData: ComprehensiveStockData = {
        basicInfo: {
          symbol: cleanSymbol,
          name: quote.bstp_kor_isnm || cleanSymbol, // 실제로는 종목명 별도 조회 필요
          market,
          exchange: 'KRX',
        },
        priceData: {
          currentPrice,
          previousClose: currentPrice - change,
          change,
          changePercent: parseFloat(quote.prdy_ctrt || '0'),
          open: parseFloat(quote.stck_oprc || '0'),
          high: parseFloat(quote.stck_hgpr || '0'),
          low: parseFloat(quote.stck_lwpr || '0'),
          volume: parseInt(quote.acml_vol || '0', 10),
          tradingValue: parseInt(quote.acml_tr_pbmn || '0', 10),
          high52Week: parseFloat(quote.w52_hgpr || '0'),
          low52Week: parseFloat(quote.w52_lwpr || '0'),
        },
        valuationData: {
          per: quote.per ? parseFloat(quote.per) : null,
          pbr: quote.pbr ? parseFloat(quote.pbr) : null,
          eps: quote.eps ? parseFloat(quote.eps) : null,
          bps: quote.bps ? parseFloat(quote.bps) : null,
          roe: null,
          dividendYield: null,
          estimatedPer: null,
          estimatedEps: null,
        },
        financialData: {
          revenue: null,
          operatingIncome: null,
          netIncome: null,
          operatingMargin: null,
          netProfitMargin: null,
          fiscalDate: null,
        },
        supplyDemandData: {
          foreignOwnership: quote.hts_frgn_ehrt ? parseFloat(quote.hts_frgn_ehrt) : null,
          foreignNetBuy: quote.frgn_ntby_qty ? parseInt(quote.frgn_ntby_qty, 10) : null,
          institutionalNetBuy: null,
          individualNetBuy: null,
        },
        marketData: {
          marketCap: quote.hts_avls ? parseInt(quote.hts_avls, 10) * 100000000 : null,
          sharesOutstanding: quote.lstn_stcn ? parseInt(quote.lstn_stcn, 10) : null,
          floatShares: null,
          beta: null,
        },
        timestamp: Date.now(),
        source: 'api',
      };

      const result: CollectionResult<ComprehensiveStockData> = {
        data: comprehensiveData,
        source: 'api',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };

      // 캐시에 저장 (5분 TTL)
      cache.set(cacheKey, result, CACHE_TTL.STOCK_DATA);
      console.log(`[KIS DualSource] Fetched and cached ${cleanSymbol} (${result.latency}ms)`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[KIS DualSource] ${cleanSymbol} 수집 실패:`, errorMessage);

      return {
        data: null,
        source: 'api',
        timestamp: Date.now(),
        success: false,
        error: errorMessage,
        latency: Date.now() - startTime,
      };
    }
  }
}

// 싱글톤 인스턴스
export const koreaStockKISCollector = new KoreaStockKISCollector();

// Re-export for convenience
export { isKISConfigured };
