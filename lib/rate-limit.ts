import type { AuthUser } from '@/lib/auth';

const DAILY_ANALYSIS_LIMIT = 2;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export function isAdminUser(user: AuthUser): boolean {
  return user.role === 'admin' || user.username === 'xxonbang';
}

export async function checkAnalysisRateLimit(
  user: AuthUser
): Promise<RateLimitResult> {
  if (isAdminUser(user)) {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }

  try {
    const { db, isDrizzleEnabled, analysisHistory } = await import(
      '@/lib/supabase/db'
    );

    if (!isDrizzleEnabled() || !db) {
      // DB 미사용 시 fail-open (허용)
      return { allowed: true, remaining: DAILY_ANALYSIS_LIMIT, limit: DAILY_ANALYSIS_LIMIT };
    }

    const { count, eq, gte, sql } = await import('drizzle-orm');

    // 오늘 한국시간(KST, UTC+9) 00:00:00 기준
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    kstDate.setUTCHours(0, 0, 0, 0);
    const todayStart = new Date(kstDate.getTime() - kstOffset);

    const result = await db
      .select({ count: count() })
      .from(analysisHistory)
      .where(
        sql`${analysisHistory.userId} = ${user.id} AND ${analysisHistory.createdAt} >= ${todayStart.toISOString()}`
      );

    const usedCount = result[0]?.count ?? 0;
    const remaining = Math.max(0, DAILY_ANALYSIS_LIMIT - usedCount);

    return {
      allowed: usedCount < DAILY_ANALYSIS_LIMIT,
      remaining,
      limit: DAILY_ANALYSIS_LIMIT,
    };
  } catch (error) {
    console.error('[RateLimit] Error checking rate limit:', error);
    // 에러 시 fail-open (허용)
    return { allowed: true, remaining: DAILY_ANALYSIS_LIMIT, limit: DAILY_ANALYSIS_LIMIT };
  }
}
