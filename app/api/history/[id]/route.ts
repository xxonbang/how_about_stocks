/**
 * 분석 히스토리 상세 조회/삭제 API
 *
 * GET /api/history/[id] - 상세 조회
 * DELETE /api/history/[id] - 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

interface Params {
  params: Promise<{ id: string }>;
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
