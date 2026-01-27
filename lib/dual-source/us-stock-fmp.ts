/**
 * 미국 주식 데이터 수집기 - Financial Modeling Prep (FMP)
 *
 * FMP 특징:
 * - NASDAQ 공식 라이선스 보유
 * - Rate limit: 250 calls/day (무료), 무제한 ($19/월)
 * - 150+ 엔드포인트
 * - 30년 역사 데이터
 * - 배치 Quote 지원
 *
 * Yahoo Finance 대비 장점:
 * - 공식 라이선스로 안정적인 데이터 제공
 * - IP 차단 위험 없음
 * - 더 상세한 재무 데이터
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
  fetchQuoteFMP,
  fetchCompanyProfileFMP,
  fetchKeyMetricsFMP,
  fetchHistoricalPricesFMP,
} from '../finance-fmp';

// 듀얼소스용 캐시 키
const FMPCacheKey = {
  usStock: (symbol: string) => `fmp:us:${symbol}`,
};

export class USStockFMPCollector implements StockDataCollector {
  async collectBasicInfo(symbol: string): Promise<CollectionResult<StockBasicInfo>> {
    const startTime = Date.now();

    try {
      const profile = await fetchCompanyProfileFMP(symbol);

      if (!profile || !profile.companyName) {
        throw new Error(`종목 정보를 찾을 수 없습니다: ${symbol}`);
      }

      return {
        data: {
          symbol,
          name: profile.companyName || symbol,
          market: profile.exchangeShortName || 'US',
          exchange: profile.exchange || 'US',
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
      const quote = await fetchQuoteFMP(symbol);

      if (!quote || !quote.price) {
        throw new Error(`가격 정보를 찾을 수 없습니다: ${symbol}`);
      }

      return {
        data: {
          currentPrice: quote.price,
          previousClose: quote.previousClose || quote.price,
          change: quote.change || 0,
          changePercent: quote.changePercentage || 0,
          open: quote.open || quote.price,
          high: quote.dayHigh || quote.price,
          low: quote.dayLow || quote.price,
          volume: quote.volume || 0,
          tradingValue: 0, // FMP에서 직접 제공하지 않음
          high52Week: quote.yearHigh || quote.price,
          low52Week: quote.yearLow || quote.price,
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
      const [quote, metrics] = await Promise.all([
        fetchQuoteFMP(symbol),
        fetchKeyMetricsFMP(symbol),
      ]);

      return {
        data: {
          per: quote?.pe || metrics?.peRatio || null,
          pbr: metrics?.pbRatio || null,
          eps: quote?.eps || null,
          bps: metrics?.bookValuePerShare || null,
          roe: metrics?.roe ? metrics.roe * 100 : null, // 백분율 변환
          dividendYield: metrics?.dividendYield ? metrics.dividendYield * 100 : null,
          estimatedPer: null, // FMP에서 별도 제공
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

    try {
      const metrics = await fetchKeyMetricsFMP(symbol);

      return {
        data: {
          revenue: null, // 별도 API 필요 (income-statement)
          operatingIncome: null,
          netIncome: null,
          operatingMargin: null,
          netProfitMargin: null,
          fiscalDate: metrics?.date || null,
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

  async collectSupplyDemandData(symbol: string): Promise<CollectionResult<StockSupplyDemandData>> {
    const startTime = Date.now();

    // FMP에서는 기관/외국인 수급 데이터를 별도 API로 제공
    // 현재는 기본값 반환
    return {
      data: {
        foreignOwnership: null,
        foreignNetBuy: null,
        institutionalNetBuy: null,
        individualNetBuy: null,
      },
      source: 'api',
      timestamp: Date.now(),
      success: true,
      latency: Date.now() - startTime,
    };
  }

  async collectMarketData(symbol: string): Promise<CollectionResult<StockMarketData>> {
    const startTime = Date.now();

    try {
      const [quote, profile] = await Promise.all([
        fetchQuoteFMP(symbol),
        fetchCompanyProfileFMP(symbol),
      ]);

      return {
        data: {
          marketCap: quote?.marketCap || profile?.mktCap || null,
          sharesOutstanding: quote?.sharesOutstanding || null,
          floatShares: null, // FMP에서 별도 제공
          beta: profile?.beta || null,
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
    const cacheKey = FMPCacheKey.usStock(symbol);

    // 캐시 확인
    const cached = cache.get<CollectionResult<ComprehensiveStockData>>(cacheKey);
    if (cached && cached.success) {
      console.log(`[FMP DualSource] Cache HIT for ${symbol}`);
      return {
        ...cached,
        latency: Date.now() - startTime,
      };
    }

    try {
      // 병렬로 모든 데이터 수집 (API 호출 최소화)
      const [quote, profile, metrics] = await Promise.all([
        fetchQuoteFMP(symbol),
        fetchCompanyProfileFMP(symbol),
        fetchKeyMetricsFMP(symbol).catch(() => null),
      ]);

      if (!quote || !quote.price) {
        throw new Error(`가격 정보를 찾을 수 없습니다: ${symbol}`);
      }

      const comprehensiveData: ComprehensiveStockData = {
        basicInfo: {
          symbol,
          name: profile?.companyName || quote.name || symbol,
          market: profile?.exchangeShortName || quote.exchange || 'US',
          exchange: profile?.exchange || quote.exchange || 'US',
        },
        priceData: {
          currentPrice: quote.price,
          previousClose: quote.previousClose || quote.price,
          change: quote.change || 0,
          changePercent: quote.changePercentage || 0,
          open: quote.open || quote.price,
          high: quote.dayHigh || quote.price,
          low: quote.dayLow || quote.price,
          volume: quote.volume || 0,
          tradingValue: 0,
          high52Week: quote.yearHigh || quote.price,
          low52Week: quote.yearLow || quote.price,
        },
        valuationData: {
          per: quote.pe || metrics?.peRatio || null,
          pbr: metrics?.pbRatio || null,
          eps: quote.eps || null,
          bps: metrics?.bookValuePerShare || null,
          roe: metrics?.roe ? metrics.roe * 100 : null,
          dividendYield: metrics?.dividendYield ? metrics.dividendYield * 100 : null,
          estimatedPer: null,
          estimatedEps: null,
        },
        financialData: {
          revenue: null,
          operatingIncome: null,
          netIncome: null,
          operatingMargin: null,
          netProfitMargin: null,
          fiscalDate: metrics?.date || null,
        },
        supplyDemandData: {
          foreignOwnership: null,
          foreignNetBuy: null,
          institutionalNetBuy: null,
          individualNetBuy: null,
        },
        marketData: {
          marketCap: quote.marketCap || profile?.mktCap || null,
          sharesOutstanding: quote.sharesOutstanding || null,
          floatShares: null,
          beta: profile?.beta || null,
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
      console.log(`[FMP DualSource] Fetched and cached ${symbol} (${result.latency}ms)`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[FMP DualSource] ${symbol} 수집 실패:`, errorMessage);

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
export const usStockFMPCollector = new USStockFMPCollector();

/**
 * FMP API 키가 설정되어 있는지 확인
 */
export function isFMPConfigured(): boolean {
  return !!process.env.FMP_API_KEY && process.env.FMP_API_KEY.length > 0;
}
