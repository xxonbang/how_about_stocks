/**
 * API 키 오류 알림 조회 (admin 전용)
 *
 * GET /api/api-key-alerts
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { alertSystem } from '@/lib/alert-system';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.role === 'admin' || session.username === 'xxonbang';
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allActive = alertSystem.getActiveAlerts();
    const apiKeyAlerts = allActive.filter((a) => a.type === 'api_key_invalid');

    return NextResponse.json({ alerts: apiKeyAlerts });
  } catch (error) {
    console.error('[api-key-alerts] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
