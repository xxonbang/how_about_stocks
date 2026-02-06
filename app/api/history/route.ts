/**
 * 분석 히스토리 조회 API
 *
 * GET /api/history?limit=20&offset=0&stocks=삼성전자,AAPL
 */

import { NextRequest, NextResponse } from 'next/server';
import { desc, lt, or, sql } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';

// --- 종목명 조회 ---

interface SymbolData {
  code: string;
  name: string;
  market: string;
  country: 'KR' | 'US';
}

interface SymbolsJSON {
  korea: { stocks: SymbolData[] };
  us: { stocks: SymbolData[] };
}

let cachedSymbolMap: Map<string, string> | null = null;

async function getStockNameMap(): Promise<Map<string, string>> {
  if (cachedSymbolMap) return cachedSymbolMap;

  try {
    const symbolsPath = join(process.cwd(), 'public', 'data', 'symbols.json');
    const fileContent = await readFile(symbolsPath, 'utf-8');
    const data: SymbolsJSON = JSON.parse(fileContent);

    const map = new Map<string, string>();
    for (const stock of data.korea.stocks) {
      map.set(stock.code, stock.name);
    }
    for (const stock of data.us.stocks) {
      map.set(stock.code, stock.name);
    }

    cachedSymbolMap = map;
    return map;
  } catch (error) {
    console.error('[History] Failed to load symbols.json:', error);
    return new Map();
  }
}

function resolveStockNames(
  allStocks: string[],
  nameMap: Map<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const symbol of allStocks) {
    const rawCode = symbol.replace(/\.(KS|KQ)$/, '');
    const name = nameMap.get(rawCode);
    if (name) {
      result[symbol] = name;
    }
  }
  return result;
}

/**
 * 30일 이상 된 히스토리 삭제 (retention policy)
 */
async function cleanupOldHistory(): Promise<number> {
  try {
    const { db, isDrizzleEnabled, analysisHistory } = await import(
      '@/lib/supabase/db'
    );

    if (!isDrizzleEnabled() || !db) {
      return 0;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db
      .delete(analysisHistory)
      .where(lt(analysisHistory.createdAt, thirtyDaysAgo))
      .returning({ id: analysisHistory.id });

    const deletedCount = result.length;
    if (deletedCount > 0) {
      console.log(`[History Cleanup] Deleted ${deletedCount} old records`);
    }

    return deletedCount;
  } catch (error) {
    console.error('[History Cleanup] Error:', error);
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { db, isDrizzleEnabled, analysisHistory } = await import(
      '@/lib/supabase/db'
    );

    if (!isDrizzleEnabled() || !db) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database not configured',
        },
        { status: 503 }
      );
    }

    // 30일 이상 된 데이터 정리 (비동기)
    cleanupOldHistory().catch(() => {});

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const stocksFilter = searchParams.get('stocks');

    // 쿼리 빌드
    let query = db
      .select({
        id: analysisHistory.id,
        requestId: analysisHistory.requestId,
        stocks: analysisHistory.stocks,
        period: analysisHistory.period,
        historicalPeriod: analysisHistory.historicalPeriod,
        analysisDate: analysisHistory.analysisDate,
        indicators: analysisHistory.indicators,
        dataSource: analysisHistory.dataSource,
        metadata: analysisHistory.metadata,
        createdAt: analysisHistory.createdAt,
      })
      .from(analysisHistory)
      .orderBy(desc(analysisHistory.createdAt))
      .limit(limit + 1) // hasMore 확인용으로 1개 더 조회
      .offset(offset);

    // 종목 필터링 (stocks 배열에 포함된 종목이 있는지 확인)
    if (stocksFilter) {
      const stocksList = stocksFilter.split(',').map((s) => s.trim());
      // PostgreSQL의 && 연산자로 배열 교집합 확인
      const conditions = stocksList.map(
        (stock) => sql`${stock} = ANY(${analysisHistory.stocks})`
      );
      if (conditions.length === 1) {
        query = query.where(conditions[0]) as typeof query;
      } else {
        query = query.where(or(...conditions)) as typeof query;
      }
    }

    const results = await query;

    // hasMore 확인
    const hasMore = results.length > limit;
    const history = hasMore ? results.slice(0, -1) : results;

    // 전체 카운트 조회
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(analysisHistory);
    const total = Number(countResult[0]?.count || 0);

    // 종목명 조회: 모든 히스토리의 종목코드를 수집하여 일괄 매핑
    const allStocks = [...new Set(history.flatMap((h) => h.stocks as string[]))];
    const nameMap = await getStockNameMap();
    const stockNames = resolveStockNames(allStocks, nameMap);

    return NextResponse.json({
      success: true,
      data: {
        history: history.map((h) => ({
          ...h,
          createdAt: h.createdAt?.toISOString(),
        })),
        stockNames,
        total,
        hasMore,
      },
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
