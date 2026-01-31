import { NextRequest, NextResponse } from 'next/server';
import type { StockSuggestion } from '@/lib/stock-search';
import type { FinnhubStockSymbol } from '@/lib/finnhub-symbols';
import { findPythonCommand } from '@/lib/python-utils';
import { translateKoreanToEnglishUS, containsKorean } from '@/lib/stock-name-mapper';

// 동적 라우트로 설정 (searchParams 사용)
export const dynamic = 'force-dynamic';

/**
 * 미국 주식 검색 API Route
 * Finnhub Stock Symbols API를 활용한 동적 검색
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    console.log(`[API] search-us-stocks called with query: "${query}"`);

    if (!query || query.trim().length < 1) {
      console.log('[API] Empty query, returning empty results');
      return NextResponse.json({ results: [] });
    }

    const results: StockSuggestion[] = [];
    const trimmedQuery = query.trim();
    const isKorean = containsKorean(trimmedQuery);

    // 검색어 정규화
    const normalizedQuery = trimmedQuery.toLowerCase().replace(/\s+/g, '');

    // 한글 검색어인 경우 영문 변환
    const englishQueries: string[] = [];
    if (isKorean) {
      const translations = translateKoreanToEnglishUS(trimmedQuery);
      englishQueries.push(...translations);
    }
    englishQueries.push(normalizedQuery); // 원본도 포함

    try {
      // 다중 데이터 소스로 미국 전체 종목 리스트 가져오기
      const { fetchUSStockSymbols, fetchETFList } = await import('@/lib/finnhub-symbols');
      
      const [usStocks, etfs] = await Promise.all([
        fetchUSStockSymbols(),
        fetchETFList(),
      ]);

      // Python 스크립트를 통한 추가 데이터 소스 (GitHub 리소스 등)
      let pythonStocks: Array<{ symbol: string; description: string }> = [];
      try {
        const { spawn } = await import('child_process');
        const { join } = await import('path');
        const { command: pythonCommand } = await findPythonCommand();
        const scriptPath = join(process.cwd(), 'scripts', 'get_us_stock_listing.py');
        
        const pythonProcess = spawn(pythonCommand, [scriptPath]);
        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        await new Promise<void>((resolve, reject) => {
          pythonProcess.on('close', (code) => {
            if (code === 0) {
              try {
                const jsonStart = output.indexOf('{');
                const jsonEnd = output.lastIndexOf('}') + 1;
                if (jsonStart !== -1 && jsonEnd > jsonStart) {
                  const jsonText = output.substring(jsonStart, jsonEnd);
                  const result = JSON.parse(jsonText);
                  if (result.success && result.data) {
                    pythonStocks = result.data.map((item: any) => ({
                      symbol: item.Symbol || item.symbol,
                      description: item.Name || item.name || item.description,
                    }));
                    console.log(`[API] Python script loaded ${pythonStocks.length} US stocks`);
                  }
                }
                resolve();
              } catch (e) {
                console.warn('[API] Failed to parse Python output for US stocks:', e);
                resolve(); // 실패해도 계속 진행
              }
            } else {
              console.warn('[API] Python script failed for US stocks:', errorOutput.substring(0, 200));
              resolve(); // 실패해도 계속 진행
            }
          });
        });
      } catch (error) {
        console.warn('[API] Failed to fetch US stocks from Python script:', error);
      }

      // 모든 데이터 소스 통합
      const allStocks: FinnhubStockSymbol[] = [...usStocks, ...etfs];
      
      // Python 스크립트 결과 추가
      for (const stock of pythonStocks) {
        if (stock.symbol && stock.description) {
          allStocks.push({
            symbol: stock.symbol,
            description: stock.description,
            displaySymbol: stock.symbol,
            type: 'Common Stock',
          });
        }
      }

      // 중복 제거 (Symbol 기준, description은 가장 긴 것 유지 - 정확한 종목명 보장)
      const uniqueStocks = new Map<string, FinnhubStockSymbol>();
      for (const stock of allStocks) {
        if (!stock.symbol || !stock.description) continue;
        
        const symbolKey = stock.symbol.toUpperCase();
        if (!uniqueStocks.has(symbolKey)) {
          uniqueStocks.set(symbolKey, stock);
        } else {
          // 기존 종목보다 이름이 더 긴 경우 업데이트 (정확한 종목명 보장)
          const existing = uniqueStocks.get(symbolKey);
          if (existing && stock.description.length > existing.description.length) {
            uniqueStocks.set(symbolKey, stock);
          }
        }
      }

      const finalStocks = Array.from(uniqueStocks.values());
      console.log(`[API] US stock list loaded: ${finalStocks.length} items (${usStocks.length} from Finnhub + ${etfs.length} ETFs + ${pythonStocks.length} from Python)`);

      if (finalStocks.length > 0) {
        const seenSymbols = new Set<string>();

        // 모든 검색어로 검색
        const searchQueries = [...new Set(englishQueries)];
        
        for (const searchQuery of searchQueries) {
          if (results.length >= 10) break;

          // 정확한 매칭
          const exactMatch = finalStocks.find((stock) => {
            if (!stock.symbol || !stock.description) return false;
            if (seenSymbols.has(stock.symbol.toUpperCase())) return false;
            
            const symbolLower = stock.symbol.toLowerCase();
            const descLower = stock.description.toLowerCase().replace(/\s+/g, '');
            
            return symbolLower === searchQuery ||
                   descLower === searchQuery ||
                   symbolLower.includes(searchQuery) ||
                   descLower.includes(searchQuery);
          });

          if (exactMatch) {
            results.push({
              symbol: exactMatch.symbol,
              name: exactMatch.description,
              exchange: exactMatch.exchange || 'US',
              type: exactMatch.type,
            });
            seenSymbols.add(exactMatch.symbol.toUpperCase());
          }

          // 부분 매칭
          const partialMatches = finalStocks
            .filter((stock) => {
              if (!stock.symbol || !stock.description) return false;
              if (seenSymbols.has(stock.symbol.toUpperCase())) return false;
              
              const symbolLower = stock.symbol.toLowerCase();
              const descLower = stock.description.toLowerCase().replace(/\s+/g, '');
              
              // 심볼 또는 설명에 검색어가 포함되는 경우
              // 검색어로 시작하는 경우 우선순위 높음
              if (symbolLower.startsWith(searchQuery) || descLower.startsWith(searchQuery)) {
                return true;
              }
              
              // 포함되는 경우
              if (symbolLower.includes(searchQuery) || descLower.includes(searchQuery)) {
                return true;
              }
              
              return false;
            })
            .sort((a, b) => {
              // 검색어로 시작하는 것 우선
              const aSymbol = a.symbol.toLowerCase();
              const bSymbol = b.symbol.toLowerCase();
              const aDesc = a.description.toLowerCase().replace(/\s+/g, '');
              const bDesc = b.description.toLowerCase().replace(/\s+/g, '');
              
              const aStartsWith = aSymbol.startsWith(searchQuery) || aDesc.startsWith(searchQuery);
              const bStartsWith = bSymbol.startsWith(searchQuery) || bDesc.startsWith(searchQuery);
              
              if (aStartsWith && !bStartsWith) return -1;
              if (!aStartsWith && bStartsWith) return 1;
              
              // 이름 길이 짧은 것 우선
              if (aDesc.length !== bDesc.length) {
                return aDesc.length - bDesc.length;
              }
              
              return 0;
            })
            .slice(0, 10 - results.length)
            .map((stock) => ({
              symbol: stock.symbol,
              name: stock.description,
              exchange: stock.exchange || 'US',
              type: stock.type,
            }));

          for (const match of partialMatches) {
            const symbolKey = match.symbol.toUpperCase();
            if (!seenSymbols.has(symbolKey)) {
              results.push(match);
              seenSymbols.add(symbolKey);
            }
          }
        }

        // 검색 결과 정렬: 정확한 매칭 우선
        results.sort((a, b) => {
          const aName = a.name.toLowerCase().replace(/\s+/g, '');
          const bName = b.name.toLowerCase().replace(/\s+/g, '');
          
          // 검색어로 시작하는 종목 우선
          const aStartsWith = aName.startsWith(normalizedQuery) || a.symbol.toLowerCase().startsWith(normalizedQuery);
          const bStartsWith = bName.startsWith(normalizedQuery) || b.symbol.toLowerCase().startsWith(normalizedQuery);
          
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          
          // 이름 길이 짧은 것 우선
          if (aName.length !== bName.length) {
            return aName.length - bName.length;
          }
          
          return 0;
        });
      } else {
        console.warn('[API] US stock list is empty or failed to load');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[API] Failed to fetch US stock listing:', errorMessage);
    }

    const finalResults = results.slice(0, 10);
    console.log(`[API] Returning ${finalResults.length} results for query: "${query}"`, finalResults.map(r => `${r.name} (${r.symbol})`));

    return NextResponse.json({ results: finalResults });
  } catch (error) {
    console.error('Error in search-us-stocks API:', error);
    return NextResponse.json(
      { results: [], error: 'Failed to search US stocks' },
      { status: 500 }
    );
  }
}
