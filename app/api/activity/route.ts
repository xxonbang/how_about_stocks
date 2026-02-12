/**
 * 사용자 활동 로그 API
 *
 * POST /api/activity
 * - 인증된 사용자의 활동을 user_activity_log에 기록
 * - user_history에 마지막 접속 시각 upsert
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';
import { sql } from 'drizzle-orm';

const SYSTEM_NAME = 'how_about_stock';

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // Request body 파싱
    const body = (await request.json()) as {
      actionType?: string;
      actionDetail?: Record<string, string>;
    };

    const { actionType, actionDetail } = body;
    if (!actionType || typeof actionType !== 'string') {
      return NextResponse.json(
        { success: false, error: 'actionType is required' },
        { status: 400 },
      );
    }

    // DB import (기존 패턴: dynamic import)
    const { db, isDrizzleEnabled, userActivityLog, userHistory } =
      await import('@/lib/supabase/db');

    if (!isDrizzleEnabled() || !db) {
      return NextResponse.json(
        { success: false, error: 'Database not configured' },
        { status: 503 },
      );
    }

    const userId = user.id;
    const email = user.email ?? '';

    // user_activity_log에 insert
    await db.insert(userActivityLog).values({
      userId,
      email,
      systemName: SYSTEM_NAME,
      actionType,
      actionDetail: actionDetail ?? {},
    });

    // user_history에 upsert (accessed_at 갱신)
    await db
      .insert(userHistory)
      .values({
        userId,
        email,
        systemName: SYSTEM_NAME,
      })
      .onConflictDoUpdate({
        target: [userHistory.userId, userHistory.systemName],
        set: {
          email,
          accessedAt: sql`now()`,
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Activity API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
