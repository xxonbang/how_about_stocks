import { NextRequest, NextResponse } from 'next/server';
import type { StockSuggestion } from '@/lib/stock-search';
import { translateKoreanToEnglishKR, normalizeSearchQuery, containsKorean } from '@/lib/stock-name-mapper';

// 동적 라우트로 설정 (searchParams 사용)
export const dynamic = 'force-dynamic';

/**
 * 한국 주식 검색 API Route
 * 서버 사이드에서만 실행되므로 child_process 사용 가능
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    console.log(`[API] search-korea-stocks called with query: "${query}"`);

    if (!query || query.trim().length < 1) {
      console.log('[API] Empty query, returning empty results');
      return NextResponse.json({ results: [] });
    }

    const results: StockSuggestion[] = [];
    const trimmedQuery = query.trim();

    // 검색어 정규화
    const normalizedQuery = normalizeSearchQuery(trimmedQuery);

    // 한글 검색어는 원본도 유지 (부분 매칭을 위해)
    const koreanQuery = containsKorean(trimmedQuery) ? trimmedQuery.replace(/\s+/g, '') : null;
    
    // 0. Ticker 기반 역추적 (검색어가 6자리 숫자인 경우)
    // 우회 상장, 합병 등으로 인한 사명 불일치 문제를 해결
    const isTickerCode = /^\d{6}$/.test(trimmedQuery);
    if (isTickerCode) {
      try {
        console.log(`[API] Ticker code detected, trying direct lookup: ${trimmedQuery}`);
        const { findPythonCommand } = await import('@/lib/python-utils');
        const { spawn } = await import('child_process');
        const { join } = await import('path');
        
        const pythonCmd = await findPythonCommand();
        const scriptPath = join(process.cwd(), 'scripts', 'get_comprehensive_stock_listing.py');
        
        // Python 스크립트에서 get_stock_by_ticker 함수를 직접 호출할 수 있도록
        // 별도 스크립트를 만들거나, 기존 스크립트를 수정해야 함
        // 일단 네이버 금융 페이지를 직접 크롤링하는 방식으로 구현
        const tickerLookupUrl = `https://finance.naver.com/item/main.naver?code=${trimmedQuery}`;
        
        // Python 스크립트를 통해 Ticker 기반 역추적
        // get_comprehensive_stock_listing.py의 get_stock_by_ticker 함수 사용
        const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          // Python 스크립트를 직접 실행하여 Ticker 조회
          // 간단한 Python 스크립트로 Ticker 조회
          const pythonScript = `
import sys
import requests
from bs4 import BeautifulSoup

ticker = sys.argv[1]
url = f'https://finance.naver.com/item/main.naver?code={ticker}'
response = requests.get(url, timeout=10, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://finance.naver.com/'
})
response.encoding = 'euc-kr'
soup = BeautifulSoup(response.text, 'html.parser')

name = None
for selector in ['h2.wrap_company', 'div.wrap_company h2', 'h2.company_name']:
    element = soup.select_one(selector)
    if element:
        name = element.get_text(strip=True)
        break

market = 'KRX'
market_info = soup.find('div', {'class': 'description'})
if market_info:
    market_text = market_info.get_text()
    if '코스닥' in market_text or 'KOSDAQ' in market_text:
        market = 'KOSDAQ'
    elif '코스피' in market_text or 'KOSPI' in market_text:
        market = 'KOSPI'

if name:
    import json
    print(json.dumps({'success': True, 'name': name, 'market': market}))
else:
    import json
    print(json.dumps({'success': False}))
`;
          
          const proc = spawn(pythonCmd.command, ['-c', pythonScript, trimmedQuery], {
            cwd: process.cwd(),
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
          });
          
          let stdout = '';
          let stderr = '';
          
          proc.stdout?.on('data', (data) => {
            stdout += data.toString();
          });
          
          proc.stderr?.on('data', (data) => {
            stderr += data.toString();
          });
          
          proc.on('close', (code) => {
            if (code === 0) {
              resolve({ stdout, stderr });
            } else {
              reject(new Error(`Python script exited with code ${code}: ${stderr}`));
            }
          });
          
          proc.on('error', (error) => {
            reject(error);
          });
        });
        
        try {
          const { stdout } = await execPromise;
          const tickerResult = JSON.parse(stdout);
          
          if (tickerResult.success && tickerResult.name) {
            const isKosdaq = tickerResult.market === 'KOSDAQ';
            const suffix = isKosdaq ? '.KQ' : '.KS';
            
            results.push({
              symbol: `${trimmedQuery}${suffix}`,
              name: tickerResult.name,
              exchange: 'KRX',
            });
            
            console.log(`[API] Ticker lookup successful: ${tickerResult.name} (${trimmedQuery}${suffix})`);
            
            // Ticker로 찾았으면 바로 반환
            return NextResponse.json({ results });
          }
        } catch (tickerError) {
          console.warn(`[API] Ticker lookup failed for ${trimmedQuery}:`, tickerError);
        }
      } catch (error) {
        console.warn('[API] Ticker lookup error:', error);
      }
    }

    // 1. 하드코딩된 매핑 먼저 확인 (빠르고 확실함)
    try {
      const { convertKoreaStockNameToTicker, KOREA_STOCK_MAP } = await import('@/lib/korea-stock-mapper');
      
      // 정확한 매칭 확인
      const exactTicker = convertKoreaStockNameToTicker(trimmedQuery);
      if (exactTicker) {
        const symbol = exactTicker.replace('.KS', '');
        const stockName = Object.keys(KOREA_STOCK_MAP).find(
          key => KOREA_STOCK_MAP[key] === symbol
        ) || trimmedQuery;
        
        results.push({
          symbol: exactTicker,
          name: stockName,
          exchange: 'KRX',
        });
        console.log(`[API] Found exact match in hardcoded map: ${trimmedQuery} -> ${exactTicker}`);
      }

      // 부분 매칭 (하드코딩된 매핑에서)
      // '나스닥' 검색 시 'KODEX 미국나스닥100' 등이 반드시 포함되도록 처리
      const hardcodedMatches: Array<{ symbol: string; name: string; priority: number }> = [];
      
      for (const [name, ticker] of Object.entries(KOREA_STOCK_MAP)) {
        const symbol = `${ticker}.KS`;
        if (results.find(r => r.symbol === symbol)) continue;
        
        const nameNoSpace = name.replace(/\s+/g, '');
        let priority = 0;
        let isMatch = false;
        
        if (koreanQuery) {
          // 검색어가 종목명에 포함되는 경우 (가장 중요)
          // 예: '나스닥' → 'KODEX 미국나스닥100'
          if (nameNoSpace.includes(koreanQuery)) {
            isMatch = true;
            // 검색어로 시작하는 경우 우선순위 높음
            if (nameNoSpace.startsWith(koreanQuery)) {
              priority = 1;
            } else {
              priority = 2;
            }
          }
        }
        
        if (!isMatch) {
          const nameNormalized = name.toLowerCase().replace(/\s+/g, '');
          if (nameNormalized.includes(normalizedQuery) || 
              nameNormalized.startsWith(normalizedQuery) ||
              nameNoSpace.includes(trimmedQuery) ||
              nameNoSpace.startsWith(trimmedQuery)) {
            isMatch = true;
            priority = 3;
          }
        }
        
        if (isMatch) {
          hardcodedMatches.push({ symbol, name, priority });
          console.log(`[API] Hardcoded match found: "${name}" (priority: ${priority})`);
        }
      }
      
      // 우선순위 순으로 정렬하여 추가
      hardcodedMatches.sort((a, b) => a.priority - b.priority);
      for (const match of hardcodedMatches) {
        if (results.length >= 10) break;
        if (results.find(r => r.symbol === match.symbol)) continue;
        
        results.push({
          symbol: match.symbol,
          name: match.name,
          exchange: 'KRX',
        });
      }
    } catch (error) {
      console.warn('[API] Failed to check hardcoded map:', error);
    }

    // 2. 동적 매핑으로 추가 검색 (하드코딩과 상관없이 항상 실행)
    try {
      const koreaStockMapper = await import('@/lib/korea-stock-mapper-dynamic');
      const stockList = await koreaStockMapper.getStockListing();

      console.log(`[API] FinanceDataReader stock list loaded: ${stockList?.length || 0} items`);

      // 2-1. Finnhub API를 활용한 한국 ETF 검색 (FinanceDataReader에 없는 ETF 포함)
      let finnhubStocks: Array<{ Name: string; Symbol: string }> = [];
      try {
        const { fetchStockSymbolsFromFinnhub } = await import('@/lib/finnhub-symbols');
        const [finnhubETFList, finnhubStockList] = await Promise.all([
          fetchStockSymbolsFromFinnhub('KR', 'ETF'),
          fetchStockSymbolsFromFinnhub('KR'),
        ]);
        
        // Finnhub 결과를 StockListingItem 형식으로 변환
        finnhubStocks = [...finnhubETFList, ...finnhubStockList]
          .filter((item: { symbol?: string; description?: string }) => item.symbol && item.description)
          .map((item: { symbol: string; description: string }) => ({
            Name: item.description,
            Symbol: item.symbol.replace(/\.(KS|KQ)$/, ''), // .KS, .KQ 제거
          }));
        
        console.log(`[API] Finnhub stock list loaded: ${finnhubStocks.length} items (${finnhubETFList.length} ETFs + ${finnhubStockList.length} stocks)`);
        
        // 디버깅: '나스닥' 관련 종목 확인
        if (koreanQuery && (koreanQuery.includes('나스닥') || trimmedQuery.toLowerCase().includes('nasdaq'))) {
          const nasdaqStocks = finnhubStocks.filter(s => 
            s.Name.includes('나스닥') || 
            s.Name.toLowerCase().includes('nasdaq') ||
            s.Symbol.includes('379810') // KODEX 미국나스닥100 종목코드
          );
          console.log(`[API] Found ${nasdaqStocks.length} NASDAQ-related stocks in Finnhub:`, nasdaqStocks.slice(0, 10).map(s => `${s.Name} (${s.Symbol})`));
          
          // FinanceDataReader에서도 확인
          const nasdaqInFDR = stockList.filter(s => 
            s.Name.includes('나스닥') || 
            s.Name.toLowerCase().includes('nasdaq') ||
            s.Symbol === '379810'
          );
          console.log(`[API] Found ${nasdaqInFDR.length} NASDAQ-related stocks in FinanceDataReader:`, nasdaqInFDR.slice(0, 10).map(s => `${s.Name} (${s.Symbol})`));
        }
      } catch (finnhubError) {
        console.warn('[API] Failed to fetch Finnhub stock list:', finnhubError);
      }
      
      // FinanceDataReader 결과와 Finnhub 결과 통합
      const allStockList: Array<{ Name: string; Symbol: string }> = [...stockList, ...finnhubStocks];
      
      // 중복 제거 (Symbol 기준, Name은 가장 긴 것 유지 - 정확한 종목명 보장)
      // 예: '나스닥100'과 'KODEX 미국나스닥100'이 같은 Symbol이면 'KODEX 미국나스닥100' 유지
      const uniqueStocks = new Map<string, { Name: string; Symbol: string }>();
      for (const stock of allStockList) {
        if (stock.Symbol && stock.Name) {
          const symbolKey = stock.Symbol.trim();
          const name = stock.Name.trim();
          
          if (!uniqueStocks.has(symbolKey)) {
            uniqueStocks.set(symbolKey, stock);
          } else {
            // 기존 종목보다 이름이 더 긴 경우 업데이트 (정확한 종목명 보장)
            const existing = uniqueStocks.get(symbolKey);
            if (existing && name.length > existing.Name.length) {
              uniqueStocks.set(symbolKey, stock);
              console.log(`[API] Updated stock name for ${symbolKey}: "${existing.Name}" -> "${name}"`);
            }
          }
        }
      }
      const combinedStockList = Array.from(uniqueStocks.values());
      
      console.log(`[API] Combined stock list: ${combinedStockList.length} items (${stockList.length} from FinanceDataReader + ${finnhubStocks.length} from Finnhub)`);

      // 종목을 찾지 못한 경우 실시간 네이버 금융 검색 시도
      // 기존 리스트에서 정확한 매칭을 찾지 못한 경우에만 실행
      const hasExactMatch = results.some(r => {
        if (!koreanQuery) return false;
        const nameNoSpace = r.name.replace(/\s+/g, '');
        return nameNoSpace === koreanQuery || nameNoSpace.includes(koreanQuery);
      });
      
      if (!hasExactMatch && koreanQuery && koreanQuery.length >= 2) {
        try {
          console.log(`[API] Stock not found in cache, trying real-time Naver Finance search for: "${koreanQuery}"`);
          const { findPythonCommand } = await import('@/lib/python-utils');
          const { spawn } = await import('child_process');
          const { join } = await import('path');
          
          const pythonCmd = await findPythonCommand();
          const scriptPath = join(process.cwd(), 'scripts', 'search_stock_by_name.py');
          
          const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            const proc = spawn(pythonCmd.command, [scriptPath, koreanQuery], {
              cwd: process.cwd(),
              env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });
            
            let stdout = '';
            let stderr = '';
            
            proc.stdout?.on('data', (data) => {
              stdout += data.toString();
            });
            
            proc.stderr?.on('data', (data) => {
              stderr += data.toString();
            });
            
            proc.on('close', (code) => {
              if (code === 0) {
                resolve({ stdout, stderr });
              } else {
                reject(new Error(`Python script exited with code ${code}: ${stderr}`));
              }
            });
            
            proc.on('error', (error) => {
              reject(error);
            });
          });
          
          const { stdout } = await execPromise;
          const searchResult = JSON.parse(stdout);
          
          if (searchResult.success && searchResult.data && searchResult.data.length > 0) {
            console.log(`[API] Naver Finance search found ${searchResult.data.length} stocks`);
            
            // 검색어와 정확히 일치하는 종목 우선 찾기
            const normalizedQuery = koreanQuery.replace(/\s+/g, '').replace('㈜', '').replace('(주)', '');
            const exactMatches: Array<{ Symbol: string; Name: string; Market: string }> = [];
            const partialMatches: Array<{ Symbol: string; Name: string; Market: string }> = [];
            
            for (const stock of searchResult.data) {
              if (stock.Symbol && stock.Name) {
                const symbolKey = stock.Symbol.trim();
                const normalizedName = stock.Name.trim().replace(/\s+/g, '').replace('㈜', '').replace('(주)', '');
                
                // 정확한 매칭 우선
                if (normalizedName === normalizedQuery) {
                  exactMatches.push({
                    Symbol: symbolKey,
                    Name: stock.Name.trim(),
                    Market: stock.Market || 'KRX'
                  });
                } else if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
                  partialMatches.push({
                    Symbol: symbolKey,
                    Name: stock.Name.trim(),
                    Market: stock.Market || 'KRX'
                  });
                }
              }
            }
            
            // 정확한 매칭을 먼저 추가
            for (const stock of [...exactMatches, ...partialMatches]) {
              const existing = combinedStockList.find(s => s.Symbol === stock.Symbol);
              if (!existing) {
                combinedStockList.push(stock);
              }
            }
            
            console.log(`[API] Updated combined stock list: ${combinedStockList.length} items (${exactMatches.length} exact, ${partialMatches.length} partial)`);
          }
        } catch (searchError) {
          console.warn('[API] Real-time Naver Finance search failed:', searchError);
        }
      }

      if (combinedStockList && combinedStockList.length > 0) {
        const existingSymbols = new Set(results.map(r => r.symbol.replace(/\.(KS|KQ)$/, '')));

        // 부분 매칭 검색 (단순하고 확실한 로직)
        const matchingStocks = combinedStockList.filter((stock) => {
          if (!stock.Name || !stock.Symbol) return false;
          
          const symbolKey = stock.Symbol.trim();
          if (existingSymbols.has(symbolKey)) return false; // 이미 추가됨
          
          const stockName = stock.Name.trim();
          const stockNameNoSpace = stockName.replace(/\s+/g, '');
          const stockNameLower = stockName.toLowerCase().replace(/\s+/g, '');
          
          // 한글 검색어인 경우
          if (koreanQuery) {
            // 1. 정확한 매칭 (가장 우선)
            if (stockNameNoSpace === koreanQuery) {
              return true;
            }
            
            // 2. 종목명이 검색어로 시작하는 경우 (정확한 매칭에 가까움)
            if (stockNameNoSpace.startsWith(koreanQuery)) {
              return true;
            }
            
            // 3. 종목명에 검색어가 포함되는 경우 (부분 매칭)
            // 예: '나스닥' → 'KODEX 미국나스닥100', 'TIGER 나스닥100'
            if (stockNameNoSpace.includes(koreanQuery)) {
              console.log(`[API] Match found: "${stockName}" contains "${koreanQuery}"`);
              return true;
            }
            
            // 4. 한글-영문 매핑 확인 (특수 케이스만)
            const englishNames = translateKoreanToEnglishKR(koreanQuery);
            if (englishNames.length > 0) {
              for (const engName of englishNames) {
                if (stockNameLower.includes(engName)) {
                  return true;
                }
              }
            }
            
            // 역방향 매칭 제거: 검색어의 일부가 종목명에 포함되는 경우는 매칭하지 않음
            // (예: '지투지바이오' 검색 시 '지투알'이 매칭되는 문제 방지)
          }
          
          // 영문/혼합 검색어인 경우
          const nameNormalized = stockName
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/엘지/g, 'lg')
            .replace(/엘/g, 'lg');
          
          if (nameNormalized.includes(normalizedQuery) ||
              nameNormalized.startsWith(normalizedQuery) ||
              stockNameNoSpace.includes(trimmedQuery) ||
              stockNameNoSpace.startsWith(trimmedQuery)) {
            return true;
          }
          
          // 티커로 검색
          if (symbolKey.includes(trimmedQuery) || symbolKey.toLowerCase().includes(normalizedQuery)) {
            return true;
          }
          
          return false;
        });

        // 매칭된 종목을 결과에 추가
        let addedCount = 0;
        for (const stock of matchingStocks) {
          if (results.length >= 10) break;
          
          const symbolKey = stock.Symbol.trim();
          if (existingSymbols.has(symbolKey)) continue;
          
          // 심볼에 .KS 또는 .KQ가 없으면 추가
          const finalSymbol = symbolKey.includes('.') ? symbolKey : `${symbolKey}.KS`;
          
          results.push({
            symbol: finalSymbol,
            name: stock.Name.trim(),
            exchange: 'KRX',
          });
          
          existingSymbols.add(symbolKey);
          addedCount++;
        }

        console.log(`[API] Found ${matchingStocks.length} matching stocks, added ${addedCount} new results`);
        
        // 디버깅: '나스닥' 검색 시 최종 결과 확인
        if (koreanQuery && koreanQuery.includes('나스닥')) {
          const nasdaqResults = results.filter(r => 
            r.name.includes('나스닥') || r.name.toLowerCase().includes('nasdaq')
          );
          console.log(`[API] Final results with '나스닥': ${nasdaqResults.length} items`, nasdaqResults.map(r => `${r.name} (${r.symbol})`));
        }
      } else {
        console.warn('[API] Combined stock list is empty');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[API] Failed to fetch dynamic stock listing:', errorMessage);
    }

    // 검색 결과 정렬: 정확한 매칭 우선, 그 다음 부분 매칭
    const sortedResults = results.sort((a, b) => {
      const aName = a.name.replace(/\s+/g, '');
      const bName = b.name.replace(/\s+/g, '');
      const query = koreanQuery || normalizedQuery;
      
      // 1. 정확한 매칭 우선 (가장 중요)
      const aExact = koreanQuery ? aName === koreanQuery : aName.toLowerCase() === normalizedQuery;
      const bExact = koreanQuery ? bName === koreanQuery : bName.toLowerCase() === normalizedQuery;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // 2. 검색어로 시작하는 종목 우선
      const aStartsWith = koreanQuery ? aName.startsWith(koreanQuery) : aName.toLowerCase().startsWith(normalizedQuery);
      const bStartsWith = koreanQuery ? bName.startsWith(koreanQuery) : bName.toLowerCase().startsWith(normalizedQuery);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      // 3. 검색어가 포함된 종목 우선
      const aContains = koreanQuery ? aName.includes(koreanQuery) : aName.toLowerCase().includes(normalizedQuery);
      const bContains = koreanQuery ? bName.includes(koreanQuery) : bName.toLowerCase().includes(normalizedQuery);
      if (aContains && !bContains) return -1;
      if (!aContains && bContains) return 1;
      
      // 4. 검색어와 길이가 비슷한 종목 우선 (더 정확한 매칭)
      const aLengthDiff = Math.abs(aName.length - query.length);
      const bLengthDiff = Math.abs(bName.length - query.length);
      if (aLengthDiff !== bLengthDiff) {
        return aLengthDiff - bLengthDiff;
      }
      
      // 5. 이름 길이 짧은 것 우선 (더 정확한 매칭)
      if (aName.length !== bName.length) {
        return aName.length - bName.length;
      }
      
      return 0;
    });

    const finalResults = sortedResults.slice(0, 10);
    console.log(`[API] Returning ${finalResults.length} results for query: "${query}"`, finalResults.map(r => `${r.name} (${r.symbol})`));

    return NextResponse.json({ results: finalResults });
  } catch (error) {
    console.error('Error in search-korea-stocks API:', error);
    return NextResponse.json(
      { results: [], error: 'Failed to search Korea stocks' },
      { status: 500 }
    );
  }
}
