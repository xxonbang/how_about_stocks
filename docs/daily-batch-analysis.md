# 일배치 데이터 수집 효과 분석

## 1. 현황 분석

### 대상 종목 수
| 시장 | 종목 수 |
|------|---------|
| 한국 (KOSPI/KOSDAQ) | 4,286 |
| 미국 (NYSE/NASDAQ) | 29,816 |
| **총계** | **34,102** |

### 종목당 수집 데이터
| 데이터 | 크기 | 설명 |
|--------|------|------|
| 실시간 시세 | ~2KB | 현재가, 등락률, 거래량, 시가총액 |
| 180일 히스토리 | ~20KB | OHLCV 일봉 데이터 |
| 기술적 지표 | ~1KB | RSI, MA, 이격도, 볼린저밴드, MACD 등 |
| 수급 데이터 | ~1KB | 기관/외국인/개인 (한국만) |
| 밸류에이션 | ~1KB | PER, PBR, EPS (한국만) |
| **종목당 총계** | **~25KB** | 뉴스 제외 |

---

## 2. 일배치 실행 시 예상 수치

### 저장 용량
```
일일 데이터: 34,102 종목 × 25KB = 약 850MB/일
월간 데이터: 850MB × 22일(영업일) = 약 18.7GB/월
연간 데이터: 18.7GB × 12개월 = 약 224GB/년
```

### API 호출 횟수 (일일)
| API | 한국 | 미국 | 총계 | 제한 |
|-----|------|------|------|------|
| Yahoo Finance | - | 29,816 | 29,816 | 무제한 (Rate limit 주의) |
| KIS API | 4,286 | - | 4,286 | 10,000/일 ✅ |
| KRX API | 4,286 | - | 4,286 | 10,000/일 ✅ |
| 공공데이터포털 | 4,286 | - | 4,286 | 무제한 ✅ |

### 예상 소요 시간
```
한국: 4,286 종목 ÷ 5 종목/batch × 2초 = 약 29분
미국: 29,816 종목 ÷ 5 종목/batch × 2초 = 약 3.3시간
총계: 약 4시간 (병렬 처리 시 2시간 내 가능)
```

---

## 3. 기대 효과 (장점)

### 3.1 응답 속도 개선
| 항목 | 현재 (On-demand) | 배치 적용 후 |
|------|------------------|--------------|
| 첫 조회 | 3-5초 | **< 100ms** (DB 조회) |
| 히스토리 데이터 | 2-3초 | **< 50ms** |
| 기술적 지표 | 계산 필요 | **사전 계산됨** |

### 3.2 API 의존도 감소
- **장애 대응**: 외부 API 장애 시에도 최근 데이터 제공 가능
- **Rate Limit 회피**: 피크 타임 API 제한 우회
- **비용 절감**: 유료 API 호출 횟수 감소

### 3.3 데이터 분석 확장
```
가능해지는 분석:
├── 전 종목 스크리닝 (RSI < 30인 종목 필터링)
├── 섹터별 수급 동향 분석
├── 시장 전체 거래량 추이
├── 이상 징후 탐지 (급등/급락 종목)
└── 백테스팅 (과거 데이터 기반 전략 검증)
```

### 3.4 사용자 경험 향상
- **자동 완성 강화**: 모든 종목 정보 즉시 표시
- **비교 분석**: 여러 종목 동시 비교 가능
- **알림 서비스**: 조건 충족 시 푸시 알림

---

## 4. 예상 문제점 (단점)

### 4.1 데이터 신선도 (Freshness)
```
문제: 배치 실행 후 최대 24시간 지연
해결:
  - 사용자 요청 시 실시간 데이터 보완
  - 장중 주요 종목만 실시간 업데이트
  - 데이터 타임스탬프 명시
```

### 4.2 저장 비용
| 서비스 | 무료 | 예상 월 비용 |
|--------|------|--------------|
| Supabase | 500MB | $25/월 (8GB Pro) |
| AWS RDS | - | $50-100/월 |
| PlanetScale | 5GB | $39/월 (Scaler) |

### 4.3 배치 실패 시 복구
```
위험: 4시간 배치 중간에 실패 시 데이터 불완전
해결:
  - 종목 단위 트랜잭션 (부분 성공 허용)
  - 실패 종목 재시도 로직
  - 이전 데이터 유지 (덮어쓰기 X)
```

### 4.4 API 부하 집중
```
문제: 특정 시간대 API 집중 호출 → 차단 위험
해결:
  - 분산 실행 (새벽 2시~6시)
  - 종목별 랜덤 딜레이
  - 멀티 API 키 로테이션
```

---

## 5. 대안 전략 비교

### Option A: 전체 종목 일배치 (Full Batch)
```
대상: 34,102 종목 전체
장점: 완전한 데이터
단점: 비용 高, 시간 長
추천: ❌ (비효율적)
```

### Option B: 티어별 차등 수집 (Tiered Batch) ⭐ 추천
```
Tier 1 (실시간): 시총 상위 100종목 → 5분 간격
Tier 2 (준실시간): 시총 상위 1,000종목 → 1시간 간격
Tier 3 (일배치): 나머지 33,000종목 → 1일 1회

장점: 비용 효율, 핵심 종목 실시간
단점: 구현 복잡도
추천: ✅ (최적 균형)
```

### Option C: On-demand + 캐시 강화 (현재)
```
대상: 사용자 요청 종목만
장점: 비용 最低
단점: 첫 조회 느림, 스크리닝 불가
추천: ⚠️ (소규모 서비스에 적합)
```

### Option D: 사용자 관심 종목만 (Watchlist Based)
```
대상: 사용자가 등록한 관심 종목
장점: 필요한 데이터만 수집
단점: 신규 종목 발굴 어려움
추천: ⚠️ (개인화 서비스에 적합)
```

---

## 6. 권장 구현 방안

### Phase 1: 핵심 종목 배치 (즉시 적용 가능)
```
대상: 시총 상위 500종목 (한국 200 + 미국 300)
주기: 매일 새벽 3시 (한국), 새벽 6시 (미국 장마감 후)
저장: analysis_history 테이블 활용
비용: Supabase 무료 티어 내 가능
```

### Phase 2: 확장 (트래픽 증가 시)
```
대상: 시총 상위 2,000종목
주기:
  - 상위 500: 1시간 간격
  - 501-2000: 일 1회
인프라: Supabase Pro 또는 별도 DB
```

### Phase 3: 전체 커버리지 (대규모 서비스)
```
대상: 전체 34,102종목
인프라:
  - TimescaleDB (시계열 최적화)
  - Redis (실시간 캐시)
  - 분산 배치 시스템 (Bull Queue)
```

---

## 7. 구현 시 필요한 테이블 스키마

```sql
-- 일별 종목 스냅샷
CREATE TABLE daily_stock_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL,  -- KOSPI, KOSDAQ, NYSE, NASDAQ
  snapshot_date DATE NOT NULL,

  -- 시세 정보
  open_price DECIMAL(15,2),
  high_price DECIMAL(15,2),
  low_price DECIMAL(15,2),
  close_price DECIMAL(15,2),
  volume BIGINT,
  market_cap BIGINT,

  -- 기술적 지표 (사전 계산)
  rsi_14 DECIMAL(5,2),
  ma_5 DECIMAL(15,2),
  ma_20 DECIMAL(15,2),
  ma_60 DECIMAL(15,2),
  ma_120 DECIMAL(15,2),
  disparity_20 DECIMAL(5,2),

  -- 수급 (한국만)
  institutional_net BIGINT,
  foreign_net BIGINT,
  individual_net BIGINT,

  -- 메타데이터
  data_source VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, snapshot_date)
);

-- 인덱스
CREATE INDEX idx_snapshot_date ON daily_stock_snapshots(snapshot_date DESC);
CREATE INDEX idx_snapshot_symbol ON daily_stock_snapshots(symbol);
CREATE INDEX idx_snapshot_market ON daily_stock_snapshots(market);
CREATE INDEX idx_snapshot_rsi ON daily_stock_snapshots(rsi_14);
```

---

## 8. 결론

### 전체 종목 일배치는 비효율적
- 34,000종목 중 실제 거래 활발한 종목은 10% 미만
- 저장 비용 대비 활용도 낮음
- API 호출 집중으로 차단 위험

### 티어별 차등 수집 권장
- **상위 500종목**: 매시간 업데이트 (핵심 유동성)
- **상위 2,000종목**: 일 1회 배치 (분석 커버리지)
- **나머지**: On-demand (비용 효율)

### 즉시 실행 가능한 액션
1. `daily_stock_snapshots` 테이블 생성
2. 상위 500종목 목록 관리 테이블 추가
3. 새벽 배치 스크립트 구현 (Node.js + Cron)
4. Supabase Edge Function 또는 Vercel Cron 활용
