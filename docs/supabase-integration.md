# Supabase 연동 명세서

## 개요

인메모리 데이터를 PostgreSQL(Supabase)로 영속화하여 서버 재시작 시에도 데이터 유지

---

## 연동된 기능

| 기능 | 파일 | 테이블 | 트리거 시점 |
|------|------|--------|-------------|
| 데이터 품질 메트릭 | `lib/data-metrics.ts` | `metrics` | 데이터 수집 성공/실패 시 |
| 알림 시스템 | `lib/alert-system.ts` | `alerts` | 알림 생성/해결 시 |
| 분석 히스토리 | `app/api/analyze/route.ts` | `analysis_history` | AI 분석 완료 시 |

---

## 테이블별 저장 데이터

### 1. metrics (데이터 품질 메트릭)

```
저장 시점: 주식 데이터 수집 시 자동 기록
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `timestamp` | TIMESTAMPTZ | 기록 시간 |
| `symbol` | VARCHAR(20) | 종목 코드 (예: AAPL, 005930.KS) |
| `data_source` | VARCHAR(100) | 데이터 소스 (예: yahoo-finance, kis-api) |
| `metric_type` | VARCHAR(50) | success / error / warning / validation_failure / consistency_check |
| `message` | TEXT | 상세 메시지 |
| `metadata` | JSONB | 추가 정보 (응답 시간 등) |

### 2. alerts (알림)

```
저장 시점: 알림 생성 또는 해결 시
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `type` | VARCHAR(50) | consistency_failure / error_rate_threshold / validation_failure / data_source_down / api_key_invalid |
| `severity` | VARCHAR(20) | low / medium / high / critical |
| `title` | VARCHAR(255) | 알림 제목 |
| `message` | TEXT | 알림 내용 |
| `data_source` | VARCHAR(100) | 관련 데이터 소스 |
| `symbol` | VARCHAR(20) | 관련 종목 (선택) |
| `timestamp` | TIMESTAMPTZ | 생성 시간 |
| `resolved` | BOOLEAN | 해결 여부 |
| `resolved_at` | TIMESTAMPTZ | 해결 시간 |
| `metadata` | JSONB | 추가 정보 |

### 3. analysis_history (분석 히스토리)

```
저장 시점: /api/analyze API 호출 완료 시
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `request_id` | VARCHAR(100) | 요청 고유 ID (UNIQUE) |
| `stocks` | TEXT[] | 분석 종목 배열 |
| `period` | VARCHAR(10) | 향후 전망 기간 (1d, 1w, 1m 등) |
| `historical_period` | VARCHAR(10) | 과거 분석 기간 |
| `analysis_date` | DATE | 분석 기준일 |
| `indicators` | JSONB | 선택된 지표 (RSI, MA 등) |
| `results` | JSONB | 분석 결과 전체 |
| `data_source` | JSONB | 사용된 데이터 소스 정보 |
| `metadata` | JSONB | 소요 시간, 토큰 사용량 등 |
| `created_at` | TIMESTAMPTZ | 생성 시간 |

---

## 저장 방식

```
┌─────────────────┐     ┌─────────────────┐
│   인메모리      │     │    Supabase     │
│   (기존 유지)   │     │   (비동기 저장)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │    병렬 운영           │
         │◄─────────────────────►│
         │                       │
    즉시 응답              백그라운드 저장
```

- **병렬 운영**: 기존 인메모리 로직 유지 + Supabase 저장
- **비블로킹**: 저장 실패해도 API 응답에 영향 없음
- **Fallback**: Supabase 미설정 시 인메모리만 사용

---

## 환경변수

```env
SUPABASE_URL=https://[PROJECT].supabase.co
SUPABASE_ANON_KEY=[ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_KEY]
DATABASE_URL=postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

---

## 데이터 확인 방법

### Supabase Dashboard
```
Table Editor → metrics / alerts / analysis_history 선택
```

### SQL 쿼리 예시
```sql
-- 최근 분석 히스토리 10건
SELECT request_id, stocks, period, created_at
FROM analysis_history
ORDER BY created_at DESC
LIMIT 10;

-- 오늘 발생한 에러 메트릭
SELECT symbol, data_source, message, timestamp
FROM metrics
WHERE metric_type = 'error'
AND timestamp >= CURRENT_DATE;

-- 미해결 알림
SELECT type, severity, title, timestamp
FROM alerts
WHERE resolved = false
ORDER BY timestamp DESC;
```
