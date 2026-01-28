/**
 * Drizzle DB 연결
 *
 * PostgreSQL(Supabase) 데이터베이스 연결
 * 서버 사이드에서만 사용 (동적 임포트로 사용)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('[Drizzle DB] Missing DATABASE_URL. Drizzle ORM features will be disabled.');
}

/**
 * PostgreSQL 클라이언트 인스턴스
 */
const client = databaseUrl
  ? postgres(databaseUrl, {
      max: 10, // 최대 커넥션 풀
      idle_timeout: 20, // 유휴 타임아웃 (초)
      connect_timeout: 10, // 연결 타임아웃 (초)
    })
  : null;

/**
 * Drizzle ORM 인스턴스
 */
export const db = client ? drizzle(client, { schema }) : null;

/**
 * Drizzle DB 사용 가능 여부
 */
export const isDrizzleEnabled = (): boolean => {
  return db !== null;
};

/**
 * DB 연결 종료 (테스트 또는 종료 시 사용)
 */
export const closeDb = async (): Promise<void> => {
  if (client) {
    await client.end();
  }
};

// 스키마 re-export
export * from './schema';
