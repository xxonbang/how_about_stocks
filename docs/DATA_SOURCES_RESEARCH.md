# 데이터 소스 연구 보고서

> 조사 일자: 2026-01-26
> 목적: 현재 사용 중인 데이터 소스 외에 공신력 있고 안정적이며 정확한 데이터 획득 방법 조사

---

## 목차

1. [현재 데이터 소스 평가](#1-현재-데이터-소스-평가)
2. [신규 추천 데이터 소스](#2-신규-추천-데이터-소스)
3. [기존 소스 개선 방안](#3-기존-소스-개선-방안)
4. [요금제 및 Rate Limit 비교표](#4-요금제-및-rate-limit-비교표)
5. [구현 우선순위 및 권장 사항](#5-구현-우선순위-및-권장-사항)
6. [참고 문헌](#6-참고-문헌)

---

## 1. 현재 데이터 소스 평가

### 1.1 미국 주식 데이터

| 소스 | 현황 | 평가 | 개선 필요성 |
|------|------|------|-------------|
| **Yahoo Finance (yahoo-finance2)** | Primary | ⚠️ 비공식 API, Rate Limiting 이슈, IP 차단 위험 | 높음 |
| **Finnhub API** | Secondary | ✅ 공식 API, 안정적 | 낮음 |
| **Agentic Screenshot** | Fallback | ✅ 혁신적, 웹 구조 변경 적응 | 유지 |

**문제점:**
- `yahoo-finance2`는 비공식 스크래핑 기반으로 **언제든 중단될 수 있음**
- Yahoo Finance의 Rate Limiting으로 대량 요청 시 IP 차단 위험
- IEX Cloud가 2024년 8월 서비스 종료되어 대안 필요

### 1.2 한국 주식 데이터

| 소스 | 현황 | 평가 | 개선 필요성 |
|------|------|------|-------------|
| **네이버 금융 크롤링** | Primary | ⚠️ 크롤링 기반, 구조 변경에 취약 | 중간 |
| **다음 금융 API** | Secondary | ✅ JSON API, 상대적 안정 | 낮음 |
| **KRX API** | Tertiary | ✅ 공식 API | 낮음 |
| **공공데이터포털** | Fallback | ✅ 공식, 무료 | 낮음 |
| **Twelve Data** | Fallback | ✅ 공식 API | 낮음 |

**문제점:**
- 네이버 금융 크롤링은 **웹 구조 변경 시 즉시 대응 필요**
- 공공데이터포털은 **T+1 데이터**로 실시간 불가
- KRX API는 **일별 10,000건 제한**

---

## 2. 신규 추천 데이터 소스

### 2.1 미국 주식 - 신규 추천

#### ⭐ Financial Modeling Prep (FMP) - 최우선 추천

| 항목 | 내용 |
|------|------|
| **URL** | https://financialmodelingprep.com |
| **무료 티어** | 250 requests/day |
| **유료 티어** | $19/month (무제한 실시간) |
| **특징** | 150+ 엔드포인트, WebSocket 지원, 30년 역사 데이터 |

**장점:**
- NASDAQ 라이선스 보유 (공식 데이터)
- REST + WebSocket 모두 지원
- 투명한 가격 정책 ($19/월 무제한)
- 재무제표, 내부자 거래 데이터 포함

**추천 이유:**
> "FMP offers one of the most transparent pricing models in the space. A flat $19/month for unlimited real-time usage across both REST and WebSocket."

---

#### Alpha Vantage

| 항목 | 내용 |
|------|------|
| **URL** | https://www.alphavantage.co |
| **무료 티어** | 25 requests/day, 5 req/min |
| **유료 티어** | $49.99/month (75 req/min) |
| **특징** | 50+ 기술적 지표 내장, MCP 서버 지원 |

**장점:**
- NASDAQ 공식 라이선스 보유
- 50+ 기술적 지표 API 제공 (RSI, MACD, Bollinger Bands 등)
- Claude/ChatGPT MCP 서버 제공으로 AI 통합 용이
- 학술/연구 목적 할인 제공

**단점:**
- 무료 티어가 25 req/day로 매우 제한적

---

#### Tiingo

| 항목 | 내용 |
|------|------|
| **URL** | https://www.tiingo.com |
| **무료 티어** | 50 symbols/hour |
| **특징** | CRSP-compliant adjusted prices, 30년+ 역사 데이터 |

**장점:**
- CRSP(Center for Research in Security Prices) 표준 준수
- 배당/분할 조정 가격 제공
- 미국 + 중국 주식, ETF, 뮤추얼펀드 지원 (82,468 종목)
- 학술 연구용 무료 제공

**단점:**
- 한국 주식(KRX) 지원 불확실

---

#### Polygon.io

| 항목 | 내용 |
|------|------|
| **URL** | https://polygon.io |
| **무료 티어** | 제한적 |
| **유료 티어** | $199/month |
| **특징** | 초저지연 실시간 데이터, 틱 단위 데이터 |

**장점:**
- 고빈도 트레이딩(HFT)급 저지연
- 틱 단위 상세 데이터
- WebSocket 실시간 스트리밍

**단점:**
- 가격이 높음 ($199/월)
- 일반 투자 분석에는 과도한 스펙

---

#### EODHD (EOD Historical Data)

| 항목 | 내용 |
|------|------|
| **URL** | https://eodhd.com |
| **무료 티어** | 20 requests/day |
| **유료 티어** | €19.99/month |
| **특징** | 60+ 글로벌 거래소, 벌크 다운로드 지원 |

**장점:**
- 150,000+ 티커 지원
- **한국 거래소(KRX, KOSDAQ) 지원 확인됨** (.KQ 심볼)
- NASDAQ, LSE, Cboe 등 직접 계약
- 벌크 다운로드로 대량 데이터 효율적 수집

**단점:**
- 실시간 데이터는 유료

---

### 2.2 한국 주식 - 신규 추천

#### ⭐ 한국투자증권 Open API (KIS Developers) - 최우선 추천

| 항목 | 내용 |
|------|------|
| **URL** | https://apiportal.koreainvestment.com |
| **가격** | 무료 (계좌 개설 필요) |
| **특징** | 실시간 시세, 자동매매, AI 연동 지원 |

**장점:**
- **국내 최초 증권사 공식 Open API** (2022년 출시)
- 실시간 시세 데이터 제공
- Claude/ChatGPT AI 환경 공식 연동 지원
- REST + WebSocket 모두 지원
- GitHub 공식 레포지토리 제공

**추천 이유:**
> "한국투자 Open API로 나만의 금융 서비스를 만들 수 있으며, ChatGPT, Claude 등 AI 환경과 연동하여 손쉽게 투자·자동매매 기능을 구현할 수 있습니다."

**요구사항:**
- 한국투자증권 계좌 개설 필요
- API 키 발급 신청

---

#### 코스콤 Open API (KOSCOM)

| 항목 | 내용 |
|------|------|
| **URL** | https://developers.koscom.co.kr |
| **가격** | 개발용 무료, 상용 시 라이선스 계약 필요 |
| **특징** | 한국 주식 시장의 공식 데이터 제공사 |

**장점:**
- 한국거래소 공식 데이터 제공사
- 실시간 시세 WebSocket 스트리밍
- 높은 데이터 신뢰도

**단점:**
- 개발용 데이터는 실제 데이터와 상이할 수 있음
- 상용 서비스 시 라이선스 계약 및 비용 발생
- 데이터 가공/축적 시 별도 계약 필요

**문의처:**
- 코스콤 시장데이터영업팀 김경희 차석
- E: kyunghee@koscom.co.kr
- T: 02-767-7318

---

#### 키움증권 Open API+

| 항목 | 내용 |
|------|------|
| **URL** | https://www.kiwoom.com |
| **가격** | 무료 (계좌 개설 필요) |
| **특징** | 오랜 역사의 증권사 API |

**장점:**
- 오랜 역사와 풍부한 커뮤니티
- Windows 환경 최적화

**단점:**
- Windows 전용 (OCX 기반)
- 웹 서비스 통합 어려움

---

#### 한국예탁결제원 주식정보서비스

| 항목 | 내용 |
|------|------|
| **URL** | https://www.data.go.kr/data/15001145/openapi.do |
| **가격** | 무료 |
| **특징** | 공공데이터포털 제공 |

**장점:**
- 공식 기관 데이터
- 무료 사용

---

## 3. 기존 소스 개선 방안

### 3.1 Yahoo Finance 대체 전략

**현재 문제:**
- `yahoo-finance2`는 비공식 스크래핑 기반
- Rate Limiting 및 IP 차단 위험
- 갑작스러운 서비스 중단 가능성

**개선 방안:**

```
현재: Yahoo Finance (Primary) → Finnhub (Secondary)

권장: FMP API (Primary) → Alpha Vantage (Secondary) → Finnhub (Tertiary)
```

1. **FMP를 Primary로 승격** - 공식 라이선스, 안정적
2. **Alpha Vantage를 Secondary로 추가** - 기술적 지표 풍부
3. **Yahoo Finance를 Fallback으로 강등** - 다른 소스 실패 시에만 사용
4. **Agentic Screenshot 유지** - 최후의 Fallback

### 3.2 네이버 금융 크롤링 보완

**현재 문제:**
- 웹 구조 변경에 취약
- 크롤링 차단 가능성

**개선 방안:**

```
현재: 네이버 크롤링 (Primary) → 다음 API (Secondary)

권장: 한국투자증권 API (Primary) → 네이버 크롤링 (Secondary) → KRX API (Tertiary)
```

1. **한국투자증권 API를 Primary로** - 공식 API, 실시간 지원
2. **네이버 크롤링을 Secondary로 강등**
3. **Agentic Screenshot을 크롤링 실패 시 자동 트리거**

### 3.3 Dual-Source 검증 강화

**현재:**
- 2개 소스 교차검증

**개선 방안:**
- 3개 소스 다수결 검증 (2/3 일치 시 확정)
- 데이터 신뢰도 가중치 부여 (공식 API > 크롤링)
- 불일치 발생 시 공식 API 데이터 우선

---

## 4. 요금제 및 Rate Limit 비교표

### 4.1 미국 주식 API 비교

| API | 무료 티어 | 유료 티어 | 공식 라이선스 | 실시간 | 추천도 |
|-----|----------|----------|--------------|--------|--------|
| **FMP** | 250 req/day | $19/mo 무제한 | ✅ NASDAQ | ✅ | ⭐⭐⭐⭐⭐ |
| **Alpha Vantage** | 25 req/day | $49.99/mo | ✅ NASDAQ | ✅ | ⭐⭐⭐⭐ |
| **Tiingo** | 50 sym/hr | 유료플랜 | ✅ CRSP | ✅ | ⭐⭐⭐⭐ |
| **EODHD** | 20 req/day | €19.99/mo | ✅ 거래소 직접 | ❌ EOD | ⭐⭐⭐ |
| **Polygon.io** | 제한적 | $199/mo | ✅ | ✅ 틱단위 | ⭐⭐⭐ |
| **Finnhub** | 60 req/min | 유료플랜 | ✅ | ✅ | ⭐⭐⭐⭐ |
| **Yahoo Finance** | 비공식 | N/A | ❌ | ⚠️ | ⭐⭐ |

### 4.2 한국 주식 API 비교

| API | 무료 티어 | 유료 티어 | 공식 라이선스 | 실시간 | 추천도 |
|-----|----------|----------|--------------|--------|--------|
| **한국투자증권** | 무료 (계좌필요) | N/A | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| **코스콤** | 개발용 무료 | 계약 필요 | ✅ 공식 | ✅ | ⭐⭐⭐⭐ |
| **KRX API** | 10,000 req/day | N/A | ✅ 공식 | ❌ EOD | ⭐⭐⭐⭐ |
| **공공데이터포털** | 무제한 | N/A | ✅ 정부 | ❌ T+1 | ⭐⭐⭐ |
| **Twelve Data** | 800 req/day | 유료플랜 | ✅ | ✅ | ⭐⭐⭐ |
| **네이버 금융** | 크롤링 | N/A | ❌ | ⚠️ | ⭐⭐⭐ |
| **다음 금융** | API | N/A | ❌ | ⚠️ | ⭐⭐⭐ |

---

## 5. 구현 우선순위 및 권장 사항

### 5.1 즉시 구현 권장 (우선순위: 높음)

#### 1. Financial Modeling Prep (FMP) 통합
- **이유:** Yahoo Finance 대체, 공식 라이선스, 저렴한 가격
- **예상 작업:** `lib/finance-fmp.ts` 신규 생성
- **비용:** 무료 시작, 필요 시 $19/월

#### 2. 한국투자증권 Open API 통합
- **이유:** 한국 주식 실시간 공식 데이터
- **예상 작업:** `lib/finance-kis.ts` 신규 생성
- **비용:** 무료 (계좌 개설 필요)

### 5.2 중기 구현 권장 (우선순위: 중간)

#### 3. Alpha Vantage 통합
- **이유:** 기술적 지표 API 풍부, AI MCP 지원
- **예상 작업:** `lib/finance-alphavantage.ts` 신규 생성
- **비용:** 무료 시작

#### 4. EODHD 통합 (한국 주식 백업)
- **이유:** KRX/KOSDAQ 지원, 벌크 다운로드
- **예상 작업:** `lib/finance-eodhd.ts` 신규 생성
- **비용:** 무료 시작

### 5.3 장기 검토 사항

#### 5. 코스콤 API 라이선스 검토
- **이유:** 공식 데이터 제공사
- **검토 사항:** 비용, 계약 조건

#### 6. Polygon.io (필요 시)
- **이유:** 고빈도 트레이딩 필요 시
- **비용:** $199/월 (현재 필요성 낮음)

---

## 5.4 권장 아키텍처 변경

### 미국 주식 데이터 흐름 (권장)

```
┌─────────────────────────────────────────────────────────────┐
│                     미국 주식 데이터                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   [Priority 1: FMP API]                                     │
│          │                                                  │
│          ▼ 실패 시                                          │
│   [Priority 2: Alpha Vantage]                               │
│          │                                                  │
│          ▼ 실패 시                                          │
│   [Priority 3: Finnhub API]                                 │
│          │                                                  │
│          ▼ 실패 시                                          │
│   [Priority 4: Yahoo Finance (yahoo-finance2)]              │
│          │                                                  │
│          ▼ 실패 시                                          │
│   [Fallback: Agentic Screenshot + Gemini Vision]            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 한국 주식 데이터 흐름 (권장)

```
┌─────────────────────────────────────────────────────────────┐
│                     한국 주식 데이터                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   [Priority 1: 한국투자증권 Open API]                        │
│          │                                                  │
│          ▼ 실패 시                                          │
│   [Priority 2: 네이버 금융 크롤링]                            │
│          │                                                  │
│          ▼ 실패 시                                          │
│   [Priority 3: 다음 금융 API]                                │
│          │                                                  │
│          ▼ 실패 시                                          │
│   [Priority 4: KRX API / 공공데이터포털]                      │
│          │                                                  │
│          ▼ 실패 시                                          │
│   [Fallback: Agentic Screenshot + Gemini Vision]            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 참고 문헌

### 미국 주식 API
- [Financial Modeling Prep - Pricing](https://site.financialmodelingprep.com/pricing-plans)
- [Alpha Vantage - Complete Guide 2026](https://alphalog.ai/blog/alphavantage-api-complete-guide)
- [Tiingo - Stock Market Tools](https://www.tiingo.com/about/pricing)
- [EODHD - Pricing](https://eodhd.com/pricing)
- [Polygon.io](https://polygon.io)
- [Best Financial Data APIs in 2026](https://www.nb-data.com/p/best-financial-data-apis-in-2026)

### 한국 주식 API
- [한국투자증권 Open API (KIS Developers)](https://apiportal.koreainvestment.com/intro)
- [코스콤 Open API 플랫폼](https://developers.koscom.co.kr/documentation/marketdata)
- [코스콤 GitBook 문서](https://koscom.gitbook.io/open-api/api/market)
- [금융위원회 주식시세정보 - 공공데이터포털](https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15094808)
- [KRX 정보데이터시스템](https://data.krx.co.kr)
- [키움증권 Open API+](https://www.kiwoom.com/h/customer/download/VOpenApiInfoView)

### 비교 및 분석
- [Marketstack vs Alpha Vantage 비교](https://medium.com/@apilayerblogs/marketstack-vs-alpha-vantage-which-is-best-financial-api-67008544036e)
- [Best Free Finance APIs 비교](https://noteapiconnector.com/best-free-finance-apis)
- [Financial Data APIs 2025 Complete Guide](https://www.ksred.com/the-complete-guide-to-financial-data-apis-building-your-own-stock-market-data-pipeline-in-2025/)

---

## 결론

### 핵심 권장 사항

1. **미국 주식**: Yahoo Finance 의존도를 낮추고 **FMP API를 Primary로 전환**
2. **한국 주식**: **한국투자증권 Open API 통합**으로 실시간 공식 데이터 확보
3. **Dual-Source 강화**: 3개 소스 다수결 검증으로 데이터 신뢰도 향상
4. **Agentic Screenshot 유지**: 최후의 Fallback으로 웹 구조 변경에 대응

### 예상 효과

| 항목 | 현재 | 개선 후 |
|------|------|--------|
| 데이터 안정성 | 중간 (크롤링 의존) | 높음 (공식 API 우선) |
| 실시간 지원 | 제한적 | 완전 지원 |
| 장기 지속성 | 불확실 | 높음 (라이선스 보유) |
| 비용 | 무료 | $19~39/월 (선택적) |

---

*작성일: 2026-01-26*
*작성자: Stock Insight 개발팀*
