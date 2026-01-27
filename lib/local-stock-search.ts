/**
 * 로컬 종목 검색 (정적 symbols.json 활용)
 *
 * 안정성과 성능을 위해 정적 JSON 파일을 사용한 로컬 검색을 제공합니다.
 * 실시간 API 호출 없이 클라이언트에서 즉시 검색이 가능합니다.
 *
 * 환경 감지:
 * - 브라우저: fetch('/data/symbols.json') 사용
 * - Node.js/CLI: fs.readFile 사용 (로컬 테스트 지원)
 */

import Fuse from 'fuse.js';
import type { StockSuggestion } from './stock-search';

// 환경 감지: 브라우저인지 Node.js인지
const isBrowser = typeof window !== 'undefined' && typeof window.fetch === 'function';

interface SymbolData {
  code: string;
  name: string;
  market: string;
  country: 'KR' | 'US';
  type?: string;
}

interface SymbolsJSON {
  version: string;
  generated_at: string;
  korea: {
    count: number;
    stocks: SymbolData[];
  };
  us: {
    count: number;
    stocks: SymbolData[];
  };
  total: number;
}

// symbols.json 캐시
let cachedSymbols: SymbolsJSON | null = null;
let fuseKorea: Fuse<SymbolData> | null = null;
let fuseUS: Fuse<SymbolData> | null = null;
let loadPromise: Promise<SymbolsJSON> | null = null;

/**
 * Node.js 환경에서 파일 시스템으로 symbols.json 로드
 */
async function loadSymbolsFromFileSystem(): Promise<SymbolsJSON> {
  // Node.js fs 모듈 동적 import (브라우저에서는 실행되지 않음)
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');

  const symbolsPath = join(process.cwd(), 'public', 'data', 'symbols.json');
  const fileContent = await readFile(symbolsPath, 'utf-8');
  return JSON.parse(fileContent);
}

/**
 * 브라우저 환경에서 fetch로 symbols.json 로드
 */
async function loadSymbolsFromFetch(): Promise<SymbolsJSON> {
  const response = await fetch('/data/symbols.json', {
    cache: 'force-cache', // 브라우저 캐시 활용
  });

  if (!response.ok) {
    throw new Error(`Failed to load symbols.json: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * symbols.json 파일 로드 (캐싱, 환경 감지)
 */
async function loadSymbols(): Promise<SymbolsJSON> {
  // 이미 로드된 경우 캐시 반환
  if (cachedSymbols) {
    return cachedSymbols;
  }

  // 로딩 중인 경우 기존 Promise 반환
  if (loadPromise) {
    return loadPromise;
  }

  // 새로 로드
  loadPromise = (async () => {
    try {
      // 환경에 따라 적절한 로드 방식 선택
      let data: SymbolsJSON;
      if (isBrowser) {
        console.log('[Local Stock Search] 브라우저 환경 - fetch 사용');
        data = await loadSymbolsFromFetch();
      } else {
        console.log('[Local Stock Search] Node.js/CLI 환경 - 파일시스템 사용');
        data = await loadSymbolsFromFileSystem();
      }

      // 데이터 유효성 검사
      if (!data.korea || !data.us || !Array.isArray(data.korea.stocks) || !Array.isArray(data.us.stocks)) {
        throw new Error('Invalid symbols.json format');
      }

      cachedSymbols = data;

      // Fuse.js 인덱스 생성
      const fuseOptions = {
        keys: [
          { name: 'name', weight: 0.8 }, // 종목명 우선
          { name: 'code', weight: 0.2 }, // 종목코드 보조
        ],
        threshold: 0.2, // 유사도 임계값 (낮을수록 정확한 매칭, 0.2로 하향하여 정확도 향상)
        includeScore: true,
        minMatchCharLength: 2, // 최소 2자 이상 매칭 (1자 매칭 방지)
        ignoreLocation: true, // 문자열 위치 무시 (어디에 있든 매칭)
        ignoreFieldNorm: false, // 필드 정규화 활성화 (정확한 매칭 우선)
        findAllMatches: false, // 첫 번째 매칭만 찾기 (성능 향상)
      };

      fuseKorea = new Fuse(data.korea.stocks, fuseOptions);
      fuseUS = new Fuse(data.us.stocks, fuseOptions);

      console.log(`[Local Stock Search] Loaded ${data.total} stocks (Korea: ${data.korea.count}, US: ${data.us.count})`);
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Local Stock Search] Failed to load symbols.json:', errorMessage);
      console.error('[Local Stock Search] Please ensure /public/data/symbols.json exists and is valid JSON');
      loadPromise = null; // 실패 시 재시도 가능하도록
      throw error;
    }
  })();

  return loadPromise;
}

/**
 * 로컬 종목 검색 (한국 주식)
 */
export async function searchKoreaStocksLocal(query: string): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 1) {
    return [];
  }

  try {
    const symbols = await loadSymbols();
    
    if (!fuseKorea) {
      return [];
    }

    const trimmedQuery = query.trim();
    const lowerQuery = trimmedQuery.toLowerCase();
    
    // 정확한 매칭 우선 (종목코드)
    if (/^\d{6}$/.test(trimmedQuery)) {
      const exactMatch = symbols.korea.stocks.find(s => s.code === trimmedQuery);
      if (exactMatch) {
        return [{
          symbol: `${exactMatch.code}.KS`,
          name: exactMatch.name,
          exchange: 'KRX',
        }];
      }
    }

    // 직접 문자열 매칭 (Fuse.js보다 먼저, 짧은 검색어도 매칭)
    const directMatches: Array<{ item: SymbolData; priority: number }> = [];
    for (const stock of symbols.korea.stocks) {
      const stockNameLower = stock.name.toLowerCase();
      const stockCode = stock.code;
      
      // 정확한 매칭 (최우선)
      if (stockNameLower === lowerQuery || stock.name === trimmedQuery) {
        directMatches.push({ item: stock, priority: 1 });
        continue;
      }
      
      // 검색어로 시작하는 종목 (높은 우선순위)
      if (stockNameLower.startsWith(lowerQuery) || stock.name.startsWith(trimmedQuery)) {
        directMatches.push({ item: stock, priority: 2 });
        continue;
      }
      
      // 검색어가 포함된 종목 (중간 우선순위)
      if (stockNameLower.includes(lowerQuery) || stock.name.includes(trimmedQuery)) {
        directMatches.push({ item: stock, priority: 3 });
        continue;
      }
      
      // 종목코드에 포함 (낮은 우선순위)
      if (stockCode.includes(trimmedQuery)) {
        directMatches.push({ item: stock, priority: 4 });
        continue;
      }
    }
    
    // 직접 매칭 결과가 있으면 우선 반환
    if (directMatches.length > 0) {
      directMatches.sort((a, b) => a.priority - b.priority);
      return directMatches.slice(0, 10).map(({ item }) => ({
        symbol: `${item.code}.KS`,
        name: item.name,
        exchange: item.market === 'ETF' ? 'ETF' : 'KRX',
      }));
    }

    // Fuse.js로 퍼지 검색 (직접 매칭이 없을 때만)
    const results = fuseKorea.search(trimmedQuery, {
      limit: 10,
    });

    return results.map(result => ({
      symbol: `${result.item.code}.KS`,
      name: result.item.name,
      exchange: result.item.market === 'ETF' ? 'ETF' : 'KRX',
      score: result.score, // 유사도 점수 (낮을수록 정확)
    })).sort((a, b) => {
      // 정확한 매칭 우선
      const aExact = a.name.replace(/\s+/g, '') === trimmedQuery.replace(/\s+/g, '');
      const bExact = b.name.replace(/\s+/g, '') === trimmedQuery.replace(/\s+/g, '');
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // 검색어로 시작하는 종목 우선
      const aStartsWith = a.name.toLowerCase().startsWith(trimmedQuery.toLowerCase());
      const bStartsWith = b.name.toLowerCase().startsWith(trimmedQuery.toLowerCase());
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      // 유사도 점수로 정렬
      const aScore = (a as any).score || 1;
      const bScore = (b as any).score || 1;
      return aScore - bScore;
    });
  } catch (error) {
    console.warn('[Local Stock Search] Korea search failed:', error);
    return [];
  }
}

/**
 * 로컬 종목 검색 (미국 주식)
 */
export async function searchUSStocksLocal(query: string): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 1) {
    return [];
  }

  try {
    const symbols = await loadSymbols();
    
    if (!fuseUS) {
      return [];
    }

    const trimmedQuery = query.trim().toUpperCase();
    
    // 정확한 매칭 우선 (티커)
    const exactMatch = symbols.us.stocks.find(s => 
      s.code.toUpperCase() === trimmedQuery || 
      s.name.toLowerCase() === query.toLowerCase()
    );
    if (exactMatch) {
      return [{
        symbol: exactMatch.code,
        name: exactMatch.name,
        exchange: 'US',
        type: exactMatch.type,
      }];
    }

    // Fuse.js로 퍼지 검색
    const results = fuseUS.search(query, {
      limit: 10,
    });

    return results.map(result => ({
      symbol: result.item.code,
      name: result.item.name,
      exchange: 'US',
      type: result.item.type,
      score: result.score,
    })).sort((a, b) => {
      // 정확한 매칭 우선
      const aExact = a.name.toLowerCase() === query.toLowerCase() || 
                     a.symbol.toUpperCase() === trimmedQuery;
      const bExact = b.name.toLowerCase() === query.toLowerCase() || 
                     b.symbol.toUpperCase() === trimmedQuery;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // 검색어로 시작하는 종목 우선
      const aStartsWith = a.name.toLowerCase().startsWith(query.toLowerCase()) ||
                          a.symbol.toUpperCase().startsWith(trimmedQuery);
      const bStartsWith = b.name.toLowerCase().startsWith(query.toLowerCase()) ||
                          b.symbol.toUpperCase().startsWith(trimmedQuery);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      // 유사도 점수로 정렬
      const aScore = (a as any).score || 1;
      const bScore = (b as any).score || 1;
      return aScore - bScore;
    });
  } catch (error) {
    console.warn('[Local Stock Search] US search failed:', error);
    return [];
  }
}

/**
 * 로컬 종목 검색 (통합 - 한국 + 미국)
 */
export async function searchStocksLocal(query: string): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 1) {
    return [];
  }

  const trimmedQuery = query.trim();
  const upperQuery = trimmedQuery.toUpperCase();
  const isKorean = /[가-힣]/.test(trimmedQuery);
  
  // 한국 티커 패턴 (6자리 숫자)
  const isKoreaTicker = /^\d{6}$/.test(trimmedQuery);

  const results: StockSuggestion[] = [];

  // [수정된 로직] 한국 주식 검색
  // 1. 한글이 포함되어 있거나
  // 2. 한국 종목 코드 형식이거나
  // 3. 영문/숫자 2글자 이상이면 무조건 한국 시장 검색 실행 (LG, SK 대응)
  // !isUSTicker 조건 제거: 영문 2글자도 한국 기업일 수 있으므로 항상 검색
  if (isKorean || isKoreaTicker || trimmedQuery.length >= 2) {
    const koreaResults = await searchKoreaStocksLocal(trimmedQuery);
    results.push(...koreaResults);
  }

  // 미국 주식 검색 (한국 숫자 티커가 아닐 때만 실행하여 노이즈 감소)
  if (!isKoreaTicker) {
    const usResults = await searchUSStocksLocal(trimmedQuery);
    results.push(...usResults);
  }

  // 중복 제거 (시장 구분자를 포함한 전체 심볼을 키로 사용)
  // split('.')[0] 방식은 위험: 한국 종목코드와 미국 티커가 충돌할 수 있음
  const seenSymbols = new Set<string>();
  const uniqueResults: StockSuggestion[] = [];

  for (const item of results) {
    // 전체 심볼을 키로 사용 (예: "005930.KS", "LG")
    if (!seenSymbols.has(item.symbol)) {
      seenSymbols.add(item.symbol);
      uniqueResults.push(item);
    }
  }

  // 정렬 로직: 검색어와 정확히 일치하는 이름을 가진 종목을 최상단으로
  return uniqueResults.sort((a, b) => {
    const aName = a.name.toLowerCase().replace(/\s+/g, '');
    const bName = b.name.toLowerCase().replace(/\s+/g, '');
    const q = trimmedQuery.toLowerCase().replace(/\s+/g, '');

    // 1. 정확한 매칭 최우선
    if (aName === q && bName !== q) return -1;
    if (aName !== q && bName === q) return 1;
    
    // 2. 검색어로 시작하는 종목 우선
    const aStartsWith = aName.startsWith(q);
    const bStartsWith = bName.startsWith(q);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    // 3. 한국 주식 우선 (한글 입력 시)
    if (isKorean) {
      const aIsKR = a.symbol.includes('.KS') || a.symbol.includes('.KQ');
      const bIsKR = b.symbol.includes('.KS') || b.symbol.includes('.KQ');
      if (aIsKR && !bIsKR) return -1;
      if (!aIsKR && bIsKR) return 1;
    }
    
    // 4. 검색어가 포함된 종목 우선
    const aContains = aName.includes(q);
    const bContains = bName.includes(q);
    if (aContains && !bContains) return -1;
    if (!aContains && bContains) return 1;

    return 0;
  }).slice(0, 10); // 최대 10개
}

/**
 * 종목명으로 종목코드 찾기 (로컬 검색 우선)
 */
export async function findTickerByName(name: string): Promise<string | null> {
  if (!name || name.trim().length < 1) {
    return null;
  }

  try {
    const results = await searchStocksLocal(name);
    
    if (results.length > 0) {
      // 첫 번째 결과의 심볼 반환
      const symbol = results[0].symbol;
      
      // 한국 주식인 경우 .KS 제거하여 종목코드만 반환
      if (symbol.includes('.KS') || symbol.includes('.KQ')) {
        return symbol.replace(/\.(KS|KQ)$/, '');
      }
      
      // 미국 주식인 경우 그대로 반환
      return symbol;
    }
    
    return null;
  } catch (error) {
    console.warn('[Local Stock Search] Failed to find ticker:', error);
    return null;
  }
}
