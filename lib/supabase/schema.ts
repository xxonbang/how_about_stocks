/**
 * Drizzle ORM 스키마 정의
 *
 * PostgreSQL(Supabase) 테이블 스키마
 */

import { pgTable, uuid, timestamp, varchar, text, boolean, jsonb, unique, index } from 'drizzle-orm/pg-core';

/**
 * metrics 테이블
 * 데이터 품질 메트릭 저장
 */
export const metrics = pgTable('metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  dataSource: varchar('data_source', { length: 100 }).notNull(),
  metricType: varchar('metric_type', { length: 50 }).notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').default({}),
});

/**
 * alerts 테이블
 * 알림 저장
 */
export const alerts = pgTable('alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: varchar('type', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  dataSource: varchar('data_source', { length: 100 }).notNull(),
  symbol: varchar('symbol', { length: 20 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  resolved: boolean('resolved').default(false),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
});

/**
 * analysis_history 테이블
 * 분석 히스토리 저장
 */
export const analysisHistory = pgTable('analysis_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: varchar('request_id', { length: 100 }).notNull().unique(),
  stocks: text('stocks').array().notNull(),
  period: varchar('period', { length: 10 }).notNull(),
  historicalPeriod: varchar('historical_period', { length: 10 }).notNull(),
  analysisDate: varchar('analysis_date', { length: 10 }).notNull(),
  indicators: jsonb('indicators').notNull(),
  results: jsonb('results').notNull(),
  dataSource: jsonb('data_source'),
  metadata: jsonb('metadata').default({}),
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * api_credentials 테이블
 * 여러 프로젝트에서 공유하는 API 키 저장
 */
export const apiCredentials = pgTable('api_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  serviceName: varchar('service_name', { length: 50 }).notNull(),
  credentialType: varchar('credential_type', { length: 50 }).notNull(),
  credentialValue: text('credential_value').notNull(),
  environment: varchar('environment', { length: 20 }).default('production'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
});

// 타입 추론
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

export type AnalysisHistory = typeof analysisHistory.$inferSelect;
export type NewAnalysisHistory = typeof analysisHistory.$inferInsert;

export type ApiCredential = typeof apiCredentials.$inferSelect;
export type NewApiCredential = typeof apiCredentials.$inferInsert;

/**
 * invite_codes 테이블
 * 회원가입 초대코드 관리
 */
export const inviteCodes = pgTable('invite_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;

/**
 * user_history 테이블
 * 사용자별 마지막 접속 시각 (시스템당 1행, upsert)
 */
export const userHistory = pgTable('user_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  email: text('email').notNull().default(''),
  systemName: varchar('system_name', { length: 50 }).notNull(),
  accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('user_history_user_system_unique').on(t.userId, t.systemName),
]);

export type UserHistory = typeof userHistory.$inferSelect;
export type NewUserHistory = typeof userHistory.$inferInsert;

/**
 * user_activity_log 테이블
 * 상세 활동 로그 (append-only)
 */
export const userActivityLog = pgTable('user_activity_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  email: text('email').notNull().default(''),
  systemName: varchar('system_name', { length: 50 }).notNull(),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  actionDetail: jsonb('action_detail').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_activity_log_user_system').on(t.userId, t.systemName),
  index('idx_activity_log_created_at').on(t.createdAt),
]);

export type UserActivityLog = typeof userActivityLog.$inferSelect;
export type NewUserActivityLog = typeof userActivityLog.$inferInsert;
