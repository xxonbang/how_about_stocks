/**
 * 인메모리 캐시 시스템
 *
 * Yahoo Finance API Rate Limit 문제를 해결하기 위한 서버사이드 캐싱
 *
 * ====================================
 * 캐시 TTL 정책 (중앙 관리)
 * ====================================
 * - 주식 현재가 (QUOTE): 5분 (실시간성 유지)
 * - 통합 주식 데이터 (STOCK_DATA): 5분 (현재가와 동기화)
 * - 히스토리컬 데이터 (HISTORICAL): 1시간 (과거 데이터는 변하지 않음)
 * - 환율 (EXCHANGE_RATE): 10분 (변동 주기 고려)
 * - VIX (VIX): 10분 (변동 주기 고려)
 * - 뉴스 (NEWS): 30분 (뉴스 갱신 주기)
 *
 * ====================================
 * 로컬 TTL 정책 (각 모듈에서 관리)
 * ====================================
 * - FRED 매크로 데이터 (lib/fred-client.ts): 24시간 (일별 업데이트)
 * - 종목 리스트 (lib/finance-publicdata.ts): 24시간 (일별 갱신)
 * - RSS 뉴스 피드 (lib/rss-client.ts): 30분 (NEWS TTL과 동일)
 *
 * ====================================
 * 데이터 일관성 정책
 * ====================================
 * 동일 분석 요청 내에서 데이터 소스 일관성 보장:
 * - ETF 괴리율: KRX 데이터 (가격 + NAV) 단일 소스 사용
 * - 수급 데이터: 동일 API 응답에서 기관/외국인/개인 데이터 추출
 * - 기술적 지표: 히스토리컬 데이터 단일 소스 기반 계산
 *
 * 주의: 서로 다른 소스의 데이터 혼합 금지
 * (예: Naver 현재가 + KRX NAV → 잘못된 괴리율)
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: string;
}

// TTL 상수 (밀리초)
export const CACHE_TTL = {
  // 실시간 데이터 (5분)
  QUOTE: 5 * 60 * 1000,           // 5분 - 현재가
  STOCK_DATA: 5 * 60 * 1000,      // 5분 - 통합 주식 데이터 (QUOTE와 동기화)

  // 준실시간 데이터 (10분)
  EXCHANGE_RATE: 10 * 60 * 1000,  // 10분 - 환율
  VIX: 10 * 60 * 1000,            // 10분 - 변동성 지수

  // 저빈도 데이터 (30분~1시간)
  NEWS: 30 * 60 * 1000,           // 30분 - 뉴스
  HISTORICAL: 60 * 60 * 1000,     // 1시간 - 과거 데이터

  // 일별 데이터 (24시간)
  MACRO: 24 * 60 * 60 * 1000,     // 24시간 - FRED 매크로 경제 지표
  STOCK_LISTING: 24 * 60 * 60 * 1000, // 24시간 - 종목 리스트
} as const;

class InMemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private stats = { hits: 0, misses: 0 };
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // 5분마다 만료된 캐시 정리
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  /**
   * 캐시에서 데이터 조회
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // TTL 체크
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      console.log(`[Cache] MISS (expired): ${key}`);
      return null;
    }

    this.stats.hits++;
    const remainingTtl = Math.round((entry.ttl - (now - entry.timestamp)) / 1000);
    console.log(`[Cache] HIT: ${key} (TTL: ${remainingTtl}s remaining)`);
    return entry.data;
  }

  /**
   * 캐시에 데이터 저장
   */
  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
    console.log(`[Cache] SET: ${key} (TTL: ${Math.round(ttl / 1000)}s)`);
  }

  /**
   * 캐시에서 데이터 삭제
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 특정 패턴의 캐시 삭제 (예: 특정 종목의 모든 캐시)
   */
  deletePattern(pattern: string): number {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * 전체 캐시 초기화
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
    console.log('[Cache] Cleared all cache');
  }

  /**
   * 만료된 캐시 정리
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Cache] Cleanup: removed ${cleaned} expired entries`);
    }

    return cleaned;
  }

  /**
   * 캐시 통계
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(1)}%` : '0%',
    };
  }

  /**
   * 캐시 키 생성 헬퍼
   */
  static key(type: string, ...parts: string[]): string {
    return `${type}:${parts.join(':')}`;
  }

  /**
   * 인터벌 정리 (테스트용)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// 싱글톤 인스턴스
export const cache = new InMemoryCache();

// 캐시 키 타입
export const CacheKey = {
  quote: (symbol: string) => InMemoryCache.key('quote', symbol),
  historical: (symbol: string, days: number) => InMemoryCache.key('historical', symbol, String(days)),
  stockData: (symbol: string) => InMemoryCache.key('stockData', symbol),
  exchangeRate: () => InMemoryCache.key('exchangeRate', 'USD_KRW'),
  vix: () => InMemoryCache.key('vix', 'VIX'),
  news: (symbol: string) => InMemoryCache.key('news', symbol),
} as const;

/**
 * 캐시된 함수 호출 래퍼
 *
 * @example
 * const data = await withCache(
 *   CacheKey.quote('AAPL'),
 *   CACHE_TTL.QUOTE,
 *   () => fetchQuoteFromYahoo('AAPL')
 * );
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // 캐시 확인
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // 캐시 미스 시 데이터 fetch
  const data = await fetchFn();

  // 캐시에 저장
  cache.set(key, data, ttl);

  return data;
}

/**
 * 여러 키에 대한 배치 캐시 조회
 * 캐시에 없는 키만 반환
 */
export function getCachedAndMissing<T>(
  keys: string[]
): { cached: Map<string, T>; missing: string[] } {
  const cached = new Map<string, T>();
  const missing: string[] = [];

  for (const key of keys) {
    const data = cache.get<T>(key);
    if (data !== null) {
      cached.set(key, data);
    } else {
      missing.push(key);
    }
  }

  return { cached, missing };
}
