/**
 * 종목 검색 및 자동완성 API
 * 
 * Yahoo Finance Autocomplete API와 Finnhub Symbol Search API를 활용
 * 한국 주식은 로컬 캐시를 활용한 검색도 지원
 */

export interface StockSuggestion {
  symbol: string; // 티커 심볼 (예: "AAPL", "005930.KS")
  name: string; // 회사명 (예: "Apple Inc.", "삼성전자")
  exchange?: string; // 거래소 (예: "NAS", "KRX")
  type?: string; // 종목 타입 (예: "S", "Common Stock")
}

/**
 * Yahoo Finance Autocomplete API로 종목 검색
 */
export async function searchStocksYahoo(
  query: string,
  options?: { region?: string; lang?: string }
): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 1) {
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    // 한국어 입력인 경우 한국 지역으로 검색
    const region = options?.region || '1'; // 기본값: US (1), 한국: KR
    const lang = options?.lang || 'en'; // 기본값: 영어, 한국: ko-KR
    const url = `https://autoc.finance.yahoo.com/autoc?query=${encodedQuery}&region=${region}&lang=${lang}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`Yahoo Finance autocomplete failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (!data?.ResultSet?.Result) {
      return [];
    }

    const results: StockSuggestion[] = data.ResultSet.Result
      .filter((item: { symbol?: string; name?: string }) => item.symbol && item.name)
      .slice(0, 10) // 최대 10개
      .map((item: { symbol: string; name: string; exch?: string; type?: string }) => ({
        symbol: item.symbol,
        name: item.name,
        exchange: item.exch,
        type: item.type,
      }));

    return results;
  } catch (error) {
    console.error('Error searching stocks with Yahoo Finance:', error);
    return [];
  }
}

/**
 * Finnhub Symbol Search API로 종목 검색
 */
export async function searchStocksFinnhub(query: string): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 1) {
    return [];
  }

  const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY || '';
  
  if (!FINNHUB_API_KEY) {
    console.warn('FINNHUB_API_KEY not available, skipping Finnhub search');
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `https://finnhub.io/api/v1/search?q=${encodedQuery}&token=${FINNHUB_API_KEY}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`Finnhub search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (!data?.result || !Array.isArray(data.result)) {
      return [];
    }

    const results: StockSuggestion[] = data.result
      .filter((item: { symbol?: string; description?: string }) => item.symbol && item.description)
      .slice(0, 10) // 최대 10개
      .map((item: { symbol: string; description: string; type?: string }) => ({
        symbol: item.symbol,
        name: item.description,
        type: item.type,
      }));

    return results;
  } catch (error) {
    console.error('Error searching stocks with Finnhub:', error);
    return [];
  }
}

/**
 * 한국 주식 검색 (API route를 통해 처리)
 * 
 * 클라이언트에서는 API route를 통해 서버 사이드에서 검색합니다.
 * 서버 사이드에서는 하드코딩 매핑 + 동적 매핑(Python)을 활용합니다.
 */
async function searchKoreaStocksViaAPI(query: string): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 1) {
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `/api/search-korea-stocks?q=${encodedQuery}`;
    console.log(`[Stock Search] Calling Korea stocks API: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.warn(`[Stock Search] Korea stocks API failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text().catch(() => '');
      console.warn(`[Stock Search] Error details: ${errorText.substring(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const resultCount = data.results?.length || 0;
    console.log(`[Stock Search] Korea stocks API returned ${resultCount} results for "${query}"`);
    
    if (resultCount > 0) {
      console.log(`[Stock Search] Results:`, data.results.map((r: StockSuggestion) => `${r.name} (${r.symbol})`));
    }
    
    return data.results || [];
  } catch (error) {
    console.error('Error searching Korea stocks via API:', error);
    return [];
  }
}

/**
 * 미국 주식 검색 (API route를 통해 처리)
 */
async function searchUSStocksViaAPI(query: string): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 1) {
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `/api/search-us-stocks?q=${encodedQuery}`;
    console.log(`[Stock Search] Calling US stocks API: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.warn(`[Stock Search] US stocks API failed: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const resultCount = data.results?.length || 0;
    console.log(`[Stock Search] US stocks API returned ${resultCount} results for "${query}"`);
    
    if (resultCount > 0) {
      console.log(`[Stock Search] Results:`, data.results.map((r: StockSuggestion) => `${r.name} (${r.symbol})`));
    }
    
    return data.results || [];
  } catch (error) {
    console.error('Error searching US stocks via API:', error);
    return [];
  }
}

/**
 * 네이버 증권 자동완성 API로 한국 주식 검색
 * 
 * 실시간 데이터 기반으로 신규 상장 종목도 즉시 검색 가능합니다.
 * FinanceDataReader의 행정 마스터 파일 지연 문제를 해결합니다.
 */
async function searchStocksNaver(query: string): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 1) {
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `/api/search-naver-stocks?q=${encodedQuery}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[Stock Search] Naver Finance API failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results = data.results || [];
    
    if (results.length > 0) {
      console.log(`[Stock Search] Naver Finance API found ${results.length} results for "${query}"`);
    }
    
    return results;
  } catch (error) {
    console.error('[Stock Search] Error searching with Naver Finance API:', error);
    return [];
  }
}

/**
 * 검색어와 종목명의 유사도를 계산
 * 높을수록 더 유사함 (1.0 = 완전 일치)
 */
function calculateSimilarity(query: string, name: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[㈜(주)주식회사]/g, '');
  const q = normalize(query);
  const n = normalize(name);

  // 완전 일치
  if (q === n) return 1.0;
  // 시작 매칭
  if (n.startsWith(q) || q.startsWith(n)) return 0.9;
  // 포함
  if (n.includes(q)) return 0.8;
  if (q.includes(n)) return 0.7;

  // 공통 문자 비율 (Jaccard 유사도)
  const qChars = new Set(q);
  const nChars = new Set(n);
  const intersection = [...qChars].filter(c => nChars.has(c)).length;
  const union = new Set([...qChars, ...nChars]).size;
  return intersection / union * 0.6; // 최대 0.6
}

/**
 * 6자리 종목코드로 네이버에서 직접 종목 정보 조회
 * symbols.json에 없는 신규 상장 종목도 검색 가능
 */
async function fetchStockByCodeDirect(code: string): Promise<StockSuggestion | null> {
  try {
    const response = await fetch(`/api/search-naver-stocks?q=${code}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 통합 종목 검색 (하이브리드 방식 - 강화된 버전)
 *
 * 1단계: 로컬 symbols.json 검색 (빠르고 안정적)
 * 2단계: 한국 주식인 경우 항상 네이버 증권 API도 병렬로 호출
 * 3단계: 유사도 기반으로 최적의 결과 선택
 * 4단계: 결과가 없고 6자리 코드면 직접 종목 검증 (fallback)
 *
 * 이 방식으로 신규 상장 종목(두산로보틱스, 지투지바이오 등)도 즉시 검색 가능합니다.
 */
export async function searchStocks(query: string): Promise<StockSuggestion[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const trimmedQuery = query.trim();
  const isKorean = /[가-힣]/.test(trimmedQuery);
  const isKoreaTicker = /^\d{6}$/.test(trimmedQuery);
  const normalizedQuery = trimmedQuery.replace(/\s+/g, '').replace('㈜', '').replace('(주)', '').toLowerCase();

  try {
    // 1단계: 로컬 검색 시작
    const { searchStocksLocal } = await import('./local-stock-search');
    const localResultsPromise = searchStocksLocal(trimmedQuery);

    // 2단계: 한국 주식이면 네이버 API도 병렬로 호출 (신규 상장주 대응)
    let naverResultsPromise: Promise<StockSuggestion[]> | null = null;
    if (isKorean || isKoreaTicker) {
      naverResultsPromise = searchStocksNaver(trimmedQuery).catch(err => {
        console.warn('[Stock Search] Naver API failed:', err);
        return [];
      });
    }

    // 병렬 결과 수집
    const [localResults, naverResults] = await Promise.all([
      localResultsPromise,
      naverResultsPromise || Promise.resolve([])
    ]);

    // 로컬 검색 결과에서 정확한 매칭 확인
    const localExactMatch = localResults.find(r => {
      const normalizedName = r.name.replace(/\s+/g, '').replace('㈜', '').replace('(주)', '').toLowerCase();
      return normalizedName === normalizedQuery;
    });

    // 네이버 결과에서 정확한 매칭 확인
    const naverExactMatch = naverResults.find(r => {
      const normalizedName = r.name.replace(/\s+/g, '').replace('㈜', '').replace('(주)', '').toLowerCase();
      return normalizedName === normalizedQuery;
    });

    // 케이스 1: 로컬에서 정확한 매칭 발견
    if (localExactMatch) {
      console.log(`[Stock Search] Local exact match: "${localExactMatch.name}" (${localExactMatch.symbol})`);
      return localResults;
    }

    // 케이스 2: 네이버에서 정확한 매칭 발견 (신규 상장주 가능성)
    if (naverExactMatch) {
      console.log(`[Stock Search] Naver exact match (possibly new listing): "${naverExactMatch.name}" (${naverExactMatch.symbol})`);
      // 네이버 결과를 우선하되, 로컬 결과도 중복 제거 후 추가
      const localWithoutDuplicates = localResults.filter(r => {
        const code = r.symbol.replace(/\.(KS|KQ)$/, '');
        return !naverResults.some(nr => nr.symbol.replace(/\.(KS|KQ)$/, '') === code);
      });
      return [naverExactMatch, ...naverResults.filter(r => r !== naverExactMatch), ...localWithoutDuplicates].slice(0, 10);
    }

    // 케이스 3: 정확한 매칭 없음 - 유사도 기반 최적 결과 선택
    const allResults: Array<StockSuggestion & { similarity: number; source: 'local' | 'naver' }> = [];

    // 로컬 결과 유사도 계산
    for (const r of localResults) {
      const similarity = calculateSimilarity(trimmedQuery, r.name);
      allResults.push({ ...r, similarity, source: 'local' });
    }

    // 네이버 결과 유사도 계산 (중복 제거)
    for (const r of naverResults) {
      const code = r.symbol.replace(/\.(KS|KQ)$/, '');
      const isDuplicate = localResults.some(lr => lr.symbol.replace(/\.(KS|KQ)$/, '') === code);
      if (!isDuplicate) {
        const similarity = calculateSimilarity(trimmedQuery, r.name);
        // 네이버 결과는 실시간 데이터이므로 약간의 가산점
        allResults.push({ ...r, similarity: similarity + 0.05, source: 'naver' });
      }
    }

    // 유사도 높은 순으로 정렬
    allResults.sort((a, b) => b.similarity - a.similarity);

    // 최상위 결과의 유사도가 너무 낮으면 경고
    if (allResults.length > 0 && allResults[0].similarity < 0.5) {
      console.warn(`[Stock Search] Best match for "${trimmedQuery}" has low similarity (${allResults[0].similarity.toFixed(2)}): "${allResults[0].name}"`);
    }

    let finalResults = allResults.slice(0, 10).map(({ similarity, source, ...rest }) => rest);

    // 케이스 4: 결과가 없고 6자리 종목코드면 직접 검증 (ultimate fallback)
    if (finalResults.length === 0 && isKoreaTicker) {
      console.log(`[Stock Search] No results for ticker ${trimmedQuery}, trying direct lookup...`);
      const directResult = await fetchStockByCodeDirect(trimmedQuery);
      if (directResult) {
        console.log(`[Stock Search] Direct lookup found: "${directResult.name}" (${directResult.symbol})`);
        finalResults = [directResult];
      }
    }

    if (finalResults.length > 0) {
      console.log(`[Stock Search] Found ${finalResults.length} results for "${trimmedQuery}" (best: "${finalResults[0].name}")`);
    } else {
      console.log(`[Stock Search] No results found for "${trimmedQuery}"`);
    }

    return finalResults;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Stock Search] Search error:', errorMessage);

    // 에러 발생 시 네이버 API만으로 재시도 (한국 주식인 경우)
    if (isKorean || isKoreaTicker) {
      try {
        console.log('[Stock Search] Retrying with Naver API only...');
        const naverResults = await searchStocksNaver(trimmedQuery);
        if (naverResults.length > 0) {
          return naverResults;
        }

        // 6자리 코드면 직접 조회 시도
        if (isKoreaTicker) {
          const directResult = await fetchStockByCodeDirect(trimmedQuery);
          if (directResult) {
            return [directResult];
          }
        }
      } catch (naverError) {
        console.error('[Stock Search] Naver API retry also failed:', naverError);
      }
    }

    return [];
  }
}
