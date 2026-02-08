/**
 * 분석 히스토리 상세 조회/삭제 API
 *
 * GET /api/history/[id] - 상세 조회
 * DELETE /api/history/[id] - 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface Params {
  params: Promise<{ id: string }>;
}

// --- 종목명 조회 (history/route.ts와 동일 로직) ---

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
    console.error('[History Detail] Failed to load symbols.json:', error);
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

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

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

    const result = await db
      .select()
      .from(analysisHistory)
      .where(eq(analysisHistory.id, id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'History not found',
        },
        { status: 404 }
      );
    }

    const history = result[0];

    // 종목명 조회
    const nameMap = await getStockNameMap();
    const stockNames = resolveStockNames(history.stocks, nameMap);

    return NextResponse.json({
      success: true,
      data: {
        id: history.id,
        requestId: history.requestId,
        stocks: history.stocks,
        period: history.period,
        historicalPeriod: history.historicalPeriod,
        analysisDate: history.analysisDate,
        indicators: history.indicators,
        results: history.results,
        dataSource: history.dataSource,
        metadata: history.metadata,
        createdAt: history.createdAt?.toISOString(),
        stockNames,
      },
    });
  } catch (error) {
    console.error('Error fetching history detail:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

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

    const result = await db
      .delete(analysisHistory)
      .where(eq(analysisHistory.id, id))
      .returning({ id: analysisHistory.id });

    if (result.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'History not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'History deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting history:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
