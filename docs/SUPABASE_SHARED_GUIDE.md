# Supabase 공유 가이드

## 프로젝트 정보

| 항목 | 값 |
|------|-----|
| **Project ID** | `fyklcplybyfrfryopzvx` |
| **Region** | `ap-south-1` (Mumbai) |
| **Dashboard URL** | https://supabase.com/dashboard/project/fyklcplybyfrfryopzvx |

---

## 환경변수 설정

타 프로젝트에서 사용 시 아래 환경변수를 `.env.local`에 추가:

```env
# Supabase 연결 정보
SUPABASE_URL=https://fyklcplybyfrfryopzvx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a2xjcGx5YnlmcmZyeW9wenZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDIxMzIsImV4cCI6MjA4NTE3ODEzMn0.tih-g2tQRgL1e8Dtm0OWZU7Jdd5T0mC05TXD-C_CYGE
SUPABASE_SERVICE_ROLE_KEY=***SUPABASE_SERVICE_ROLE_KEY_REMOVED***

# PostgreSQL 직접 연결 (Drizzle ORM 사용 시)
DATABASE_URL=postgresql://postgres.fyklcplybyfrfryopzvx:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

> **참고**: `DATABASE_URL`의 `[PASSWORD]`는 Supabase Dashboard > Settings > Database에서 확인

---

## 기존 테이블 구조

### 1. `metrics` - 데이터 품질 메트릭

```sql
CREATE TABLE metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol VARCHAR(20) NOT NULL,
  data_source VARCHAR(100) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,  -- success, error, warning
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'
);
```

### 2. `alerts` - 알림 시스템

```sql
CREATE TABLE alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,  -- low, medium, high, critical
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data_source VARCHAR(100) NOT NULL,
  symbol VARCHAR(20),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);
```

### 3. `analysis_history` - AI 분석 히스토리

```sql
CREATE TABLE analysis_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL UNIQUE,
  stocks TEXT[] NOT NULL,
  period VARCHAR(10) NOT NULL,
  historical_period VARCHAR(10) NOT NULL,
  analysis_date DATE NOT NULL,
  indicators JSONB NOT NULL,
  results JSONB NOT NULL,
  data_source JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API 키 공유 테이블 (신규)

### 4. `api_credentials` - API 키 저장소

여러 프로젝트에서 공유할 API 키를 저장하는 테이블:

```sql
-- API 키 저장 테이블
CREATE TABLE IF NOT EXISTS api_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name VARCHAR(50) NOT NULL,        -- kis, finnhub, fmp, twelvedata, gemini
  credential_type VARCHAR(50) NOT NULL,     -- app_key, app_secret, api_key, account_no
  credential_value TEXT NOT NULL,           -- 암호화된 값 또는 평문
  environment VARCHAR(20) DEFAULT 'production', -- production, development, test
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                   -- API 키 만료일 (선택)
  metadata JSONB DEFAULT '{}',

  UNIQUE(service_name, credential_type, environment)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_api_credentials_service ON api_credentials(service_name);
CREATE INDEX IF NOT EXISTS idx_api_credentials_active ON api_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_api_credentials_env ON api_credentials(environment);

-- RLS 정책
ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;

-- Service Role만 접근 가능 (보안)
CREATE POLICY "Service role only on api_credentials"
  ON api_credentials FOR ALL
  USING (auth.role() = 'service_role');

-- 업데이트 시 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_api_credentials_updated_at
  BEFORE UPDATE ON api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### KIS API 키 저장 예시

```sql
-- KIS API 키 저장
INSERT INTO api_credentials (service_name, credential_type, credential_value, description)
VALUES
  ('kis', 'app_key', 'YOUR_KIS_APP_KEY', '한국투자증권 앱 키'),
  ('kis', 'app_secret', 'YOUR_KIS_APP_SECRET', '한국투자증권 앱 시크릿'),
  ('kis', 'account_no', 'YOUR_ACCOUNT_NO', '한국투자증권 계좌번호 (선택)');

-- 다른 API 키 저장
INSERT INTO api_credentials (service_name, credential_type, credential_value, description)
VALUES
  ('finnhub', 'api_key', 'YOUR_FINNHUB_KEY', 'Finnhub API 키'),
  ('twelvedata', 'api_key', 'YOUR_TWELVEDATA_KEY', 'Twelve Data API 키'),
  ('gemini', 'api_key', 'YOUR_GEMINI_KEY_1', 'Google Gemini API 키 1');
```

---

## 타 프로젝트에서 사용 방법

### 방법 1: Supabase JS Client (권장)

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // 서버 사이드용

export const supabase = createClient(supabaseUrl, supabaseKey);

// API 키 조회 함수
export async function getApiCredential(
  serviceName: string,
  credentialType: string,
  environment: string = 'production'
): Promise<string | null> {
  const { data, error } = await supabase
    .from('api_credentials')
    .select('credential_value')
    .eq('service_name', serviceName)
    .eq('credential_type', credentialType)
    .eq('environment', environment)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error(`[Supabase] Failed to get ${serviceName}/${credentialType}:`, error);
    return null;
  }

  return data.credential_value;
}

// 사용 예시
const kisAppKey = await getApiCredential('kis', 'app_key');
const kisAppSecret = await getApiCredential('kis', 'app_secret');
```

### 방법 2: Drizzle ORM

```typescript
// lib/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { eq, and } from 'drizzle-orm';

// 스키마 정의
export const apiCredentials = pgTable('api_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  serviceName: varchar('service_name', { length: 50 }).notNull(),
  credentialType: varchar('credential_type', { length: 50 }).notNull(),
  credentialValue: text('credential_value').notNull(),
  environment: varchar('environment', { length: 20 }).default('production'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  metadata: jsonb('metadata').default({}),
});

// DB 연결
const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);

// API 키 조회
export async function getApiCredential(
  serviceName: string,
  credentialType: string
): Promise<string | null> {
  const result = await db
    .select({ value: apiCredentials.credentialValue })
    .from(apiCredentials)
    .where(
      and(
        eq(apiCredentials.serviceName, serviceName),
        eq(apiCredentials.credentialType, credentialType),
        eq(apiCredentials.isActive, true)
      )
    )
    .limit(1);

  return result[0]?.value ?? null;
}
```

### 방법 3: REST API 직접 호출

```typescript
// curl 또는 fetch 사용
const response = await fetch(
  `${process.env.SUPABASE_URL}/rest/v1/api_credentials?service_name=eq.kis&credential_type=eq.app_key&is_active=eq.true&select=credential_value`,
  {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }
);

const data = await response.json();
const kisAppKey = data[0]?.credential_value;
```

---

## 필요 패키지

```bash
# Supabase JS Client
npm install @supabase/supabase-js

# Drizzle ORM 사용 시 (선택)
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

---

## 보안 주의사항

1. **`SUPABASE_SERVICE_ROLE_KEY`는 서버 사이드에서만 사용**
   - 클라이언트에 노출 금지
   - 환경변수로만 관리

2. **`SUPABASE_ANON_KEY`는 읽기 전용 작업에만 사용**
   - RLS 정책에 의해 제한됨

3. **API 키 암호화 권장**
   - 민감한 키는 Supabase Vault 또는 별도 암호화 적용 고려

4. **IP 화이트리스트**
   - Supabase Dashboard > Settings > Database > Network restrictions

---

## SQL 쿼리 예시

```sql
-- 모든 KIS API 키 조회
SELECT service_name, credential_type, credential_value, is_active
FROM api_credentials
WHERE service_name = 'kis';

-- 활성화된 모든 API 키 조회
SELECT service_name, credential_type, description, is_active, updated_at
FROM api_credentials
WHERE is_active = true
ORDER BY service_name, credential_type;

-- API 키 업데이트
UPDATE api_credentials
SET credential_value = 'NEW_VALUE', updated_at = NOW()
WHERE service_name = 'kis' AND credential_type = 'app_key';

-- API 키 비활성화
UPDATE api_credentials
SET is_active = false, updated_at = NOW()
WHERE service_name = 'kis' AND credential_type = 'app_key';
```

---

## 현재 사용 중인 프로젝트

| 프로젝트 | 사용 테이블 | 용도 |
|----------|-------------|------|
| `stock_analysys_web_private_02` | metrics, alerts, analysis_history | 주식 분석 웹앱 |

---

## 참고 링크

- [Supabase Dashboard](https://supabase.com/dashboard/project/fyklcplybyfrfryopzvx)
- [Supabase JS Client Docs](https://supabase.com/docs/reference/javascript/introduction)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
