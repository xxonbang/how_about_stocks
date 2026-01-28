# Supabase 도입 진단 보고서

> 작성일: 2026-01-28
> 프로젝트: Stock Analysis Web Platform
> 목적: Supabase 도입의 실질적 효용성 분석 및 ROI 평가

---

## 목차

1. [현재 프로젝트 아키텍처 분석](#1-현재-프로젝트-아키텍처-분석)
2. [Supabase 개요](#2-supabase-개요)
3. [영역별 개선 가능성 분석](#3-영역별-개선-가능성-분석)
4. [도입 ROI 분석](#4-도입-roi-분석)
5. [권장 도입 전략](#5-권장-도입-전략)
6. [기술적 마이그레이션 가이드](#6-기술적-마이그레이션-가이드)
7. [결론 및 의사결정 체크리스트](#7-결론-및-의사결정-체크리스트)

---

## 1. 현재 프로젝트 아키텍처 분석

### 1.1 기술 스택 현황

| 계층 | 기술 | 버전 |
|------|------|------|
| Frontend | Next.js (App Router) | 14.2.x |
| UI | React + Tailwind CSS | 18.3.x |
| Language | TypeScript | Strict Mode |
| State | React Context + localStorage | - |
| Charts | Recharts | 3.6.x |
| Validation | Zod | 3.23.x |

### 1.2 데이터 레이어 현황

#### 데이터 저장 방식

```
┌─────────────────────────────────────────────────────────────────┐
│                     현재 데이터 아키텍처                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   API 응답   │───▶│  인메모리    │───▶│   클라이언트  │      │
│  │  (외부 API)  │    │    캐시      │    │    렌더링    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                             │                                   │
│                             ▼                                   │
│                      ┌──────────────┐                          │
│                      │  서버 재시작  │                          │
│                      │   = 손실     │                          │
│                      └──────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 캐시 정책 (lib/cache.ts)

| 데이터 유형 | TTL | 설명 |
|------------|-----|------|
| QUOTE | 5분 | 주식 현재가 (실시간성 요구) |
| HISTORICAL | 1시간 | 과거 데이터 (변경 없음) |
| EXCHANGE_RATE | 10분 | 환율 정보 |
| VIX | 10분 | 변동성 지수 |
| NEWS | 30분 | 뉴스 피드 |
| STOCK_DATA | 5분 | 통합 주식 데이터 |

#### 한계점

1. **영속성 부재**: 서버 재시작 시 모든 캐시 데이터 손실
2. **분산 불가**: Vercel 서버리스 환경에서 인스턴스 간 캐시 공유 불가
3. **히스토리 없음**: 과거 분석 결과 조회 불가능
4. **메트릭 손실**: 최대 1,000개 메트릭만 메모리 보관, 재시작 시 초기화

### 1.3 인증 시스템 현황

#### 현재 구조

```typescript
// lib/auth.ts
const validUsername = process.env.ADMIN_USERNAME;      // 단일 관리자
const validPasswordHash = process.env.ADMIN_PASSWORD_HASH;  // bcrypt 해시

// JWT 토큰 생성
const token = await new SignJWT({ username })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('24h')
  .sign(secretKey);
```

#### 인증 플로우

```
1. POST /api/auth/login
   └─ 사용자명/비밀번호 검증 (bcryptjs)
   └─ JWT 토큰 생성 (24시간 만료)
   └─ HTTP-Only 쿠키 저장

2. middleware.ts
   └─ 모든 요청에서 토큰 검증
   └─ 공개 경로 예외 처리

3. AuthContext
   └─ 10분 비활성 시 자동 로그아웃
   └─ 사용자 활동 감지 (mousedown, keypress 등)
```

#### 한계점

1. **단일 사용자**: 환경변수 기반 단일 관리자만 지원
2. **소셜 로그인 불가**: Google, GitHub 등 OAuth 미지원
3. **2FA 없음**: 추가 인증 계층 부재
4. **세션 관리 제한**: 다중 디바이스 세션 관리 불가

### 1.4 실시간 기능 현황

#### 현재 구현

```typescript
// lib/alert-system.ts
startAlertMonitoring(30000);  // 30초 간격 폴링

// 모니터링 항목
- 오류율 임계값 (>= 10%)
- 데이터 소스 다운 (연속 5회 실패)
- 듀얼 소스 불일치
- 데이터 타입/범위 이상
```

#### 한계점

1. **지연**: 최대 30초 알림 지연
2. **리소스 낭비**: 변경 없어도 반복 요청
3. **양방향 불가**: 서버→클라이언트 푸시 불가능
4. **탭 간 동기화 불가**: 다중 탭 상태 동기화 어려움

### 1.5 파일 저장소 현황

**현재 상태**: 파일 저장 기능 없음

- Saveticker PDF는 로컬 다운로드 후 분석
- 분석 리포트 저장/공유 불가
- 차트 스크린샷 보관 불가

---

## 2. Supabase 개요

### 2.1 Supabase란?

Supabase는 Firebase의 오픈소스 대안으로, PostgreSQL 기반의 Backend-as-a-Service(BaaS) 플랫폼입니다.

### 2.2 핵심 기능

| 기능 | 설명 | Firebase 대비 장점 |
|------|------|-------------------|
| **Database** | PostgreSQL 완전 관리형 | SQL 지원, 관계형 데이터 |
| **Auth** | 다중 인증 제공자 | Row Level Security 통합 |
| **Realtime** | WebSocket 기반 실시간 | PostgreSQL 변경 감지 |
| **Storage** | S3 호환 객체 저장소 | 정책 기반 접근 제어 |
| **Edge Functions** | Deno 기반 서버리스 | TypeScript 네이티브 |

### 2.3 가격 정책 (2026년 기준)

| 플랜 | 가격 | Database | Auth | Storage | 적합 대상 |
|------|------|----------|------|---------|----------|
| Free | $0/월 | 500MB | 50,000 MAU | 1GB | 개인/사이드 프로젝트 |
| Pro | $25/월 | 8GB | 100,000 MAU | 100GB | 프로덕션 |
| Team | $599/월 | 무제한 | 무제한 | 무제한 | 대규모 팀 |

### 2.4 Free Tier 상세 제한사항 (2026년 1월 기준)

> 출처: [Supabase 공식 가격 페이지](https://supabase.com/pricing), 2026-01-28 조사

#### 핵심 제한 요약

| 서비스 | Free Tier 한도 | Pro ($25/월) |
|--------|---------------|--------------|
| **프로젝트 수** | 최대 2개 | 무제한 |
| **Database** | 500MB | 8GB |
| **Auth (MAU)** | 50,000명/월 | 100,000명/월 |
| **Storage** | 1GB | 100GB |
| **Realtime 동시접속** | 200 | 500 |
| **Edge Functions** | 500,000 호출/월 | 2,000,000 호출/월 |
| **Egress (데이터 전송)** | 5GB | 250GB |

#### Database (PostgreSQL) 상세

| 항목 | Free Tier | Pro |
|------|-----------|-----|
| 데이터베이스 크기 | 500MB | 8GB |
| API 요청 | 무제한 | 무제한 |
| 자동 백업 | **미지원** | 일일 백업 |
| Point-in-Time 복구 | **미지원** | 7일 |
| 로그 보관 | 1일 | 7일 |
| Branching (개발 환경) | **미지원** | 지원 |
| 고급 디스크 설정 | **미지원** | 지원 |

#### Auth (인증) 상세

| 항목 | Free Tier | Pro |
|------|-----------|-----|
| 월간 활성 사용자 (MAU) | 50,000명 | 100,000명 |
| 총 사용자 수 | 무제한 | 무제한 |
| 소셜 OAuth 로그인 | 지원 | 지원 |
| 익명 로그인 | 지원 | 지원 |
| 커스텀 SMTP | 지원 | 지원 |
| 이메일 브랜딩 제거 | **미지원** | 지원 |
| 전화 기반 MFA | **미지원** | 지원 |
| SSO/SAML 2.0 | **미지원** | Team 이상 |
| 유출 비밀번호 보호 | **미지원** | 지원 |
| 감사 로그 보관 | 1시간 | 7일 |

#### Storage (파일 저장소) 상세

| 항목 | Free Tier | Pro |
|------|-----------|-----|
| 저장소 용량 | 1GB | 100GB |
| 캐시된 Egress | 5GB | 250GB |
| 최대 파일 업로드 크기 | 50MB | 50GB |
| CDN | 기본 CDN | Smart CDN |
| 이미지 변환 (리사이징) | **미지원** | 지원 |

#### Realtime (실시간) 상세

| 항목 | Free Tier | Pro |
|------|-----------|-----|
| 동시 연결 | 200 | 500 |
| 월간 메시지 | 200만 | 500만 |
| 최대 메시지 크기 | 256KB | 3MB |

#### Edge Functions 상세

| 항목 | Free Tier | Pro |
|------|-----------|-----|
| 월간 호출 | 500,000 | 2,000,000 |

#### 가장 중요한 제약사항

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  프로덕션 환경에서 가장 치명적인 제약                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 7일 비활성 시 자동 일시정지 (Pause)                          │
│     - 7일 동안 활동이 없으면 프로젝트가 자동으로 일시정지됨         │
│     - 일시정지된 프로젝트는 API 요청에 응답하지 않음               │
│     - 대시보드에서 수동으로 재활성화 필요                         │
│     - 프로덕션 환경에서는 Free Tier 부적합                       │
│                                                                 │
│  2. 프로젝트 수 제한 (최대 2개)                                  │
│     - 모든 Organization에서 Owner/Admin 역할인 프로젝트 합산      │
│     - 2개 초과 시 새 프로젝트 생성 불가                          │
│                                                                 │
│  3. 백업 및 복구 미지원                                          │
│     - 자동 백업 없음                                             │
│     - Point-in-Time 복구 없음                                   │
│     - 데이터 손실 시 복구 불가능                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 초과 시 요금 (Pro 플랜 기준)

| 항목 | 초과 요금 |
|------|----------|
| Database 용량 | $0.125/GB |
| MAU (100K 초과) | $0.00325/MAU |
| Storage | $0.021/GB |
| Egress | $0.09/GB |
| Edge Function 호출 | $2/백만 호출 |
| Realtime 메시지 | $2.50/백만 메시지 |
| Realtime 동시접속 | $10/100 연결 |

#### 업그레이드 권장 시점

| 조건 | 권장 액션 |
|------|----------|
| MAU 40,000명 이상 | Pro 플랜 전환 검토 |
| Database 400MB 이상 | Pro 플랜 전환 검토 |
| 일일 백업 필요 | Pro 플랜 필수 |
| 이메일 지원 필요 | Pro 플랜 필수 |
| 24/7 무중단 운영 | Pro 플랜 필수 (7일 일시정지 회피) |

#### 현재 프로젝트 적합성 판단

| 항목 | 예상 사용량 | Free Tier 한도 | 적합 여부 |
|------|------------|---------------|----------|
| Database | ~100MB (1년) | 500MB | ✅ 충분 |
| MAU | 1-10명 | 50,000명 | ✅ 충분 |
| Storage | 미사용 또는 ~500MB | 1GB | ✅ 충분 |
| Realtime 연결 | 1-5명 | 200 | ✅ 충분 |
| Edge Functions | 미사용 예정 | 500K | ✅ 충분 |
| **7일 비활성 정책** | - | - | ⚠️ **주의 필요** |

#### Free Tier 유지 전략

7일 비활성으로 인한 자동 일시정지를 방지하려면:

```typescript
// 예시: 주기적 활성화 API 호출 (GitHub Actions 또는 cron job)
// .github/workflows/keep-alive.yml

name: Keep Supabase Alive
on:
  schedule:
    - cron: '0 0 */3 * *'  # 3일마다 실행

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase
        run: |
          curl -X GET "${{ secrets.SUPABASE_URL }}/rest/v1/health" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```

---

## 3. 영역별 개선 가능성 분석

### 3.1 데이터 영속성 (PostgreSQL)

#### 현재 문제

```typescript
// lib/cache.ts - 휘발성 캐시
const cache = new Map<string, CacheItem>();

// lib/data-metrics.ts - 메모리 저장
const metrics: DataMetric[] = [];  // 최대 1,000개, 재시작 시 손실
```

#### Supabase 적용 시

```typescript
// 메트릭 영속 저장
const { data, error } = await supabase
  .from('metrics')
  .insert({
    source: 'yahoo-finance',
    success: true,
    latency_ms: 245,
    timestamp: new Date().toISOString()
  });

// 히스토리 조회
const { data: history } = await supabase
  .from('metrics')
  .select('*')
  .gte('timestamp', '2026-01-01')
  .order('timestamp', { ascending: false });
```

#### 개선 효과

| 항목 | 현재 | Supabase 적용 후 |
|------|------|-----------------|
| 메트릭 보존 | 서버 재시작 시 손실 | 영구 저장 |
| 저장 용량 | 1,000개 제한 | 무제한 (500MB Free) |
| 히스토리 분석 | 불가능 | 시계열 쿼리 가능 |
| 분석 결과 | 휘발성 | 백테스팅 가능 |
| 캐시 일관성 | 인스턴스별 분리 | 중앙 집중식 |

#### 제안 스키마

```sql
-- 메트릭 테이블
CREATE TABLE metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,
  endpoint VARCHAR(100),
  success BOOLEAN NOT NULL,
  latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 분석 히스토리 테이블
CREATE TABLE analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL,  -- 'US' | 'KR'
  analysis_result JSONB NOT NULL,
  confidence_score DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 알림 히스토리 테이블
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,  -- 'info' | 'warning' | 'critical'
  message TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 캐시 테이블 (선택적)
CREATE TABLE cache (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 만료된 캐시 자동 삭제 (pg_cron)
SELECT cron.schedule('cleanup-cache', '*/5 * * * *',
  $$DELETE FROM cache WHERE expires_at < NOW()$$
);
```

### 3.2 인증 시스템 (Supabase Auth)

#### 현재 vs Supabase Auth 비교

| 기능 | 현재 구현 | Supabase Auth |
|------|----------|---------------|
| 사용자 수 | 1명 (환경변수) | 무제한 |
| 비밀번호 저장 | bcrypt 해시 | bcrypt + 자동 솔팅 |
| 소셜 로그인 | 미지원 | Google, GitHub, 카카오 등 |
| 이메일 인증 | 미지원 | 자동 발송 |
| 2FA | 미지원 | TOTP, SMS |
| 세션 관리 | 단일 JWT | 다중 세션 + 자동 갱신 |
| 비밀번호 재설정 | 수동 | 이메일 링크 자동화 |
| Row Level Security | 미지원 | 데이터베이스 레벨 권한 |

#### 적용 시 코드 변화

```typescript
// 현재 구현
const response = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password })
});

// Supabase Auth 적용 후
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
});

// 소셜 로그인 추가
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google'
});
```

#### Row Level Security 예시

```sql
-- 사용자별 데이터 접근 제어
CREATE POLICY "Users can view own analysis" ON analysis_history
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analysis" ON analysis_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

#### 적용 판단

| 조건 | 권장 |
|------|------|
| 다중 사용자 필요 | Supabase Auth 도입 |
| 팀 기능 필요 | Supabase Auth 도입 |
| 단일 관리자만 사용 | 현재 유지 (오버엔지니어링) |

### 3.3 실시간 기능 (Supabase Realtime)

#### 현재 폴링 vs Realtime 비교

```
현재 (폴링):
┌──────────┐     30초마다      ┌──────────┐
│ 클라이언트 │ ───────────────▶ │   서버   │
│          │ ◀─────────────── │          │
└──────────┘   응답 (변경 없음)  └──────────┘
              리소스 낭비 ❌

Supabase Realtime (WebSocket):
┌──────────┐    변경 시에만     ┌──────────┐
│ 클라이언트 │ ◀═══════════════ │ Supabase │
│          │   실시간 푸시      │          │
└──────────┘                   └──────────┘
              효율적 ✅
```

#### 적용 시 코드

```typescript
// 알림 실시간 구독
const channel = supabase
  .channel('alerts-channel')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'alerts',
      filter: 'severity=eq.critical'
    },
    (payload) => {
      // 즉시 알림 표시
      showNotification({
        title: '긴급 알림',
        message: payload.new.message,
        type: 'critical'
      });
    }
  )
  .subscribe();

// 대시보드 실시간 동기화
const metricsChannel = supabase
  .channel('metrics-channel')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'metrics' },
    (payload) => {
      // 차트 자동 업데이트
      updateDashboard(payload);
    }
  )
  .subscribe();
```

#### 개선 효과

| 지표 | 현재 (폴링) | Supabase Realtime |
|------|------------|-------------------|
| 알림 지연 | 최대 30초 | ~100ms |
| 네트워크 요청 | 2회/분 | 변경 시에만 |
| 배터리 소모 | 높음 | 낮음 |
| 다중 탭 동기화 | 불가 | Broadcast 채널 |
| 서버 부하 | 지속적 | 이벤트 기반 |

### 3.4 파일 스토리지 (Supabase Storage)

#### 활용 시나리오

| 용도 | 설명 | 예상 용량 |
|------|------|----------|
| AI 분석 리포트 | PDF/HTML 형식 저장 | ~100KB/건 |
| 차트 스크린샷 | 분석 시점 캡처 | ~500KB/건 |
| Saveticker 아카이브 | PDF 중앙 저장 | ~2MB/건 |
| 사용자 첨부파일 | 포트폴리오 문서 | 가변적 |

#### 적용 시 코드

```typescript
// 리포트 저장
const { data, error } = await supabase.storage
  .from('reports')
  .upload(`${userId}/${ticker}_${Date.now()}.pdf`, pdfBuffer, {
    contentType: 'application/pdf'
  });

// 공유 URL 생성
const { data: urlData } = await supabase.storage
  .from('reports')
  .createSignedUrl(`${userId}/${fileName}`, 3600);  // 1시간 유효
```

#### 적용 판단

| 조건 | 권장 |
|------|------|
| 리포트 아카이빙 필요 | Storage 도입 |
| 파일 공유 기능 필요 | Storage 도입 |
| 현재 기능만으로 충분 | 불필요 |

---

## 4. 도입 ROI 분석

### 4.1 가치 매트릭스

```
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase 도입 가치 매트릭스                   │
├─────────────────┬──────────────┬──────────────┬─────────────────┤
│      영역       │  비즈니스    │  구현        │    종합         │
│                 │  가치        │  난이도      │    우선순위     │
├─────────────────┼──────────────┼──────────────┼─────────────────┤
│ 메트릭 영속성   │     ★★★★★   │     ★☆☆☆☆   │   ★★★★★       │
│ 분석 히스토리   │     ★★★★★   │     ★☆☆☆☆   │   ★★★★★       │
│ 알림 히스토리   │     ★★★★☆   │     ★☆☆☆☆   │   ★★★★☆       │
│ 캐시 중앙화     │     ★★★☆☆   │     ★★☆☆☆   │   ★★★☆☆       │
│ 실시간 알림     │     ★★★☆☆   │     ★★★☆☆   │   ★★★☆☆       │
│ 다중 사용자     │     ★★☆☆☆   │     ★★★☆☆   │   ★★☆☆☆       │
│ 파일 저장       │     ★★☆☆☆   │     ★☆☆☆☆   │   ★★☆☆☆       │
└─────────────────┴──────────────┴──────────────┴─────────────────┘

★ = 1점, 높을수록 좋음
비즈니스 가치: 문제 해결의 중요도
구현 난이도: 낮을수록 쉬움 (★☆☆☆☆ = 매우 쉬움)
```

### 4.2 비용 분석

#### 현재 비용 (숨겨진 비용 포함)

| 항목 | 비용 |
|------|------|
| 데이터 손실 리스크 | 서버 재시작 시 모든 메트릭 손실 |
| 디버깅 시간 | 히스토리 없어 문제 추적 어려움 |
| 확장 제약 | 다중 인스턴스 배포 시 캐시 불일치 |

#### Supabase Free Tier

| 리소스 | 제공량 | 예상 사용량 | 충분 여부 |
|--------|--------|------------|----------|
| Database | 500MB | ~100MB (1년) | ✅ 충분 |
| Auth | 50,000 MAU | 1-10명 | ✅ 충분 |
| Storage | 1GB | ~500MB | ✅ 충분 |
| Realtime | 200 동시접속 | 1-5명 | ✅ 충분 |
| Edge Functions | 500K 호출/월 | ~10K | ✅ 충분 |

**결론**: Free Tier로 충분히 운영 가능

### 4.3 기대 효과

#### 정량적 효과

| 지표 | 현재 | 도입 후 | 개선율 |
|------|------|--------|--------|
| 데이터 보존율 | 0% (재시작 시) | 100% | ∞ |
| 알림 지연 | 30초 | 0.1초 | 300x |
| 히스토리 조회 | 불가 | 무제한 | - |
| 캐시 일관성 | 인스턴스별 | 전역 | - |

#### 정성적 효과

1. **신뢰성 향상**: 데이터 손실 걱정 없이 운영
2. **분석력 강화**: 과거 데이터 기반 트렌드 분석
3. **확장성 확보**: 다중 인스턴스, 다중 사용자 대응 준비
4. **개발 생산성**: 인프라 관리 부담 감소

---

## 5. 권장 도입 전략

### 5.1 단계별 도입 계획

```
Phase 1 (즉시 가치) ─────────────────────────────────────────────
│
├─ [Week 1-2] Supabase 프로젝트 설정
│   ├─ 프로젝트 생성 및 환경 설정
│   ├─ Drizzle ORM 연동 (Type-safe)
│   └─ 기존 환경변수 마이그레이션
│
├─ [Week 3-4] 메트릭/알림 영속화
│   ├─ metrics 테이블 생성
│   ├─ alerts 테이블 생성
│   ├─ 기존 인메모리 로직 → Supabase 전환
│   └─ 대시보드 히스토리 조회 기능 추가
│
└─ [Week 5-6] 분석 히스토리
    ├─ analysis_history 테이블 생성
    ├─ AI 분석 결과 저장 로직 추가
    └─ 과거 분석 조회 UI 구현

Phase 2 (확장) ──────────────────────────────────────────────────
│
├─ [Week 7-8] Realtime 알림
│   ├─ WebSocket 구독 설정
│   ├─ 알림 즉시 전달 구현
│   └─ 대시보드 실시간 업데이트
│
└─ [Week 9-10] 캐시 중앙화
    ├─ cache 테이블 생성
    ├─ 인메모리 → PostgreSQL 전환
    └─ TTL 기반 자동 정리 (pg_cron)

Phase 3 (선택) ──────────────────────────────────────────────────
│
├─ 다중 사용자 (필요 시)
│   ├─ Supabase Auth 전환
│   ├─ users 테이블 및 RLS 설정
│   └─ 기존 JWT 로직 제거
│
└─ Storage (필요 시)
    ├─ 리포트 저장 버킷 생성
    └─ 파일 업로드/다운로드 구현
```

### 5.2 기술 스택 변경 사항

#### Before (현재)

```
Next.js 14 ─── API Routes ─── 외부 API
                   │
                   ▼
            인메모리 캐시 (휘발성)
```

#### After (Supabase 도입)

```
Next.js 14 ─── API Routes ─── 외부 API
                   │
                   ▼
            Supabase Client
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
PostgreSQL    Realtime       Storage
(영속 저장)   (실시간 알림)  (파일 저장)
```

### 5.3 의존성 추가

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "drizzle-orm": "^0.34.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.26.0"
  }
}
```

---

## 6. 기술적 마이그레이션 가이드

### 6.1 Supabase 클라이언트 설정

```typescript
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// lib/supabase/server.ts (서버 컴포넌트용)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}
```

### 6.2 Drizzle ORM 스키마

```typescript
// lib/supabase/schema.ts
import { pgTable, uuid, varchar, boolean, integer,
         text, timestamp, jsonb, decimal } from 'drizzle-orm/pg-core';

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: varchar('source', { length: 50 }).notNull(),
  endpoint: varchar('endpoint', { length: 100 }),
  success: boolean('success').notNull(),
  latencyMs: integer('latency_ms'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const analysisHistory = pgTable('analysis_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  market: varchar('market', { length: 10 }).notNull(),
  analysisResult: jsonb('analysis_result').notNull(),
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  message: text('message').notNull(),
  resolved: boolean('resolved').default(false),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 6.3 메트릭 저장 로직 전환

```typescript
// lib/data-metrics.ts (변경 후)
import { supabase } from '@/lib/supabase/client';

export async function recordMetric(metric: {
  source: string;
  endpoint?: string;
  success: boolean;
  latencyMs?: number;
  errorMessage?: string;
}) {
  const { error } = await supabase
    .from('metrics')
    .insert(metric);

  if (error) {
    console.error('Failed to record metric:', error);
  }
}

export async function getMetrics(options: {
  source?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  let query = supabase
    .from('metrics')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.source) {
    query = query.eq('source', options.source);
  }
  if (options.startDate) {
    query = query.gte('created_at', options.startDate.toISOString());
  }
  if (options.endDate) {
    query = query.lte('created_at', options.endDate.toISOString());
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}
```

### 6.4 Realtime 알림 구독

```typescript
// hooks/useRealtimeAlerts.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Alert } from '@/types';

export function useRealtimeAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    // 초기 알림 로드
    supabase
      .from('alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setAlerts(data);
      });

    // 실시간 구독
    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        (payload) => {
          setAlerts((prev) => [payload.new as Alert, ...prev]);

          // 브라우저 알림
          if (Notification.permission === 'granted') {
            new Notification('새 알림', {
              body: payload.new.message,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts' },
        (payload) => {
          setAlerts((prev) =>
            prev.map((alert) =>
              alert.id === payload.new.id ? (payload.new as Alert) : alert
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return alerts;
}
```

### 6.5 환경 변수 추가

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # 서버 전용
```

---

## 7. 결론 및 의사결정 체크리스트

### 7.1 최종 권장 사항

#### 확실히 도입해야 하는 영역

| 영역 | 이유 | 예상 효과 |
|------|------|----------|
| **메트릭 영속성** | 서버 재시작 시 데이터 손실 방지 | 장기 트렌드 분석 가능 |
| **분석 히스토리** | 과거 AI 판단 추적 | 백테스팅, 성과 검증 |
| **알림 히스토리** | 감사 로그 및 문제 추적 | 운영 안정성 향상 |

#### 선택적 도입 영역

| 영역 | 조건 | 권장 |
|------|------|------|
| Realtime | 즉시 알림이 중요하면 | 도입 |
| Auth | 다중 사용자 필요하면 | 도입 |
| Storage | 파일 저장 필요하면 | 도입 |

#### 불필요한 영역

| 영역 | 이유 |
|------|------|
| Edge Functions | API Routes로 충분 |
| Vector (pgvector) | 현재 AI 검색 요구사항 없음 |

### 7.2 의사결정 체크리스트

아래 질문에 "예"가 많을수록 Supabase 도입 가치가 높습니다.

```
□ 서버 재시작 후에도 메트릭 데이터를 보존해야 합니까?
  → 예: PostgreSQL 필수

□ 과거 AI 분석 결과를 조회하고 비교해야 합니까?
  → 예: analysis_history 테이블 필요

□ 다중 인스턴스(Vercel 서버리스)에서 캐시 일관성이 필요합니까?
  → 예: 중앙 캐시 또는 PostgreSQL 캐시 필요

□ 알림이 30초보다 빠르게 도착해야 합니까?
  → 예: Supabase Realtime 권장

□ 다중 사용자 또는 팀 기능이 필요합니까?
  → 예: Supabase Auth 전환
  → 아니오: 기존 JWT 유지

□ 분석 리포트나 차트를 저장/공유해야 합니까?
  → 예: Supabase Storage 도입
  → 아니오: 불필요
```

### 7.3 예상 일정

| 단계 | 작업 | 예상 기간 |
|------|------|----------|
| Phase 1 | 메트릭/알림/히스토리 영속화 | 2-3주 |
| Phase 2 | Realtime + 캐시 중앙화 | 2주 |
| Phase 3 | Auth/Storage (선택) | 필요 시 |

### 7.4 리스크 및 대응

| 리스크 | 영향 | 대응 방안 |
|--------|------|----------|
| Supabase 서비스 장애 | 데이터 접근 불가 | Fallback 로직 구현, 로컬 캐시 유지 |
| Free Tier 한도 초과 | 서비스 중단 | 사용량 모니터링, Pro 플랜 전환 준비 |
| 마이그레이션 중 버그 | 데이터 불일치 | 점진적 마이그레이션, 병렬 운영 기간 |

---

## 부록: 참고 자료

- [Supabase 공식 문서](https://supabase.com/docs)
- [Drizzle ORM + Supabase 가이드](https://orm.drizzle.team/docs/get-started-postgresql#supabase)
- [Next.js + Supabase 통합](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase Realtime 가이드](https://supabase.com/docs/guides/realtime)

---

*이 문서는 프로젝트의 현재 상태를 기반으로 작성되었으며, 비즈니스 요구사항 변경에 따라 권장 사항이 달라질 수 있습니다.*
