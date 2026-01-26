# 데이터 획득 소스 및 방식 정리

> 이 문서는 Stock Insight 프로젝트에서 사용하는 모든 데이터 소스와 획득 방식을 정리한 것입니다.

---

## 목차

1. [외부 API](#1-외부-api)
2. [웹 크롤링/스크래핑](#2-웹-크롤링스크래핑)
3. [Agentic Screenshot 캡처](#3-agentic-screenshot-캡처)
4. [Python 스크립트](#4-python-스크립트)
5. [환경변수 설정](#5-환경변수-설정)
6. [데이터 흐름 다이어그램](#6-데이터-흐름-다이어그램)

---

## 1. 외부 API

### 1.1 Yahoo Finance API

| 항목 | 내용 |
|------|------|
| **파일** | `lib/finance.ts` |
| **URL** | `https://query1.finance.yahoo.com/v8/finance/chart/` |
| **라이브러리** | `yahoo-finance2` |
| **Rate Limit** | ~100 calls/min (비공식) |
| **대상** | 미국 주식 |

**획득 데이터:**
- 현재가, 변동, 변동률
- 거래량, 시가총액
- 일일 OHLCV (시가/고가/저가/종가/거래량)
- 52주 최고/최저가

---

### 1.2 Financial Modeling Prep (FMP) API ⭐ NEW

| 항목 | 내용 |
|------|------|
| **파일** | `lib/finance-fmp.ts`, `lib/dual-source/us-stock-fmp.ts` |
| **URL** | `https://financialmodelingprep.com/api/v3` |
| **환경변수** | `FMP_API_KEY` |
| **Rate Limit** | 250 calls/day (무료), 무제한 ($19/월) |
| **대상** | 미국 주식 (Primary) |

**특징:**
- NASDAQ 공식 라이선스 보유
- 150+ 엔드포인트
- 30년 역사 데이터
- WebSocket 실시간 지원 (유료)
- 배치 Quote 지원

**획득 데이터:**
- 현재가, 변동, 변동률
- 거래량, 시가총액
- 52주 최고/최저가
- PER, EPS
- 히스토리컬 OHLCV
- 회사 프로필
- 재무 지표 (ROE, PBR 등)

**API 키 발급:** https://financialmodelingprep.com/developer/docs/

---

### 1.3 Finnhub API

| 항목 | 내용 |
|------|------|
| **파일** | `lib/finance-finnhub.ts`, `lib/dual-source/us-stock-finnhub.ts` |
| **URL** | `https://finnhub.io/api/v1` |
| **환경변수** | `FINNHUB_API_KEY` |
| **Rate Limit** | 60 calls/min |
| **대상** | 미국/한국 주식 |

**획득 데이터:**
- 주식 시세 (Quote)
- 기업 프로필 (Profile)
- 기술적 지표
- 뉴스

---

### 1.4 한국투자증권 Open API (KIS) ⭐ NEW

| 항목 | 내용 |
|------|------|
| **파일** | `lib/finance-kis.ts`, `lib/dual-source/korea-stock-kis.ts` |
| **URL** | `https://openapi.koreainvestment.com:9443` |
| **환경변수** | `KIS_APP_KEY`, `KIS_APP_SECRET` |
| **Rate Limit** | 초당 20회 (추정) |
| **대상** | 한국 주식 (Primary) |

**특징:**
- 국내 최초 증권사 공식 Open API (2022년 출시)
- REST API + WebSocket 지원
- 실시간 시세 데이터 제공
- OCX 없이 서버사이드에서 사용 가능
- Claude/ChatGPT AI 연동 공식 지원

**획득 데이터:**
- 현재가, 전일대비, 등락률
- 시가, 고가, 저가
- 거래량, 거래대금
- 52주 최고/최저가
- PER, PBR, EPS, BPS
- 외국인 보유율, 순매수량
- 시가총액, 상장주식수

**API 키 발급:**
1. 한국투자증권 계좌 개설
2. https://apiportal.koreainvestment.com 접속
3. Open API 서비스 신청
4. App Key, App Secret 발급

---

### 1.5 Twelve Data API

| 항목 | 내용 |
|------|------|
| **파일** | `lib/finance-twelvedata.ts` |
| **URL** | `https://api.twelvedata.com` |
| **환경변수** | `TWELVE_DATA_API_KEY` |
| **Rate Limit** | 800 req/day, 8 req/min (무료) |
| **대상** | 한국 주식 (KRX) |

**획득 데이터:**
- 주식 가격
- 50+ 기술적 지표
- 글로벌 시장 데이터

**심볼 포맷:** `005930:KRX` (삼성전자)

---

### 1.4 공공데이터포털 API (금융위원회)

| 항목 | 내용 |
|------|------|
| **파일** | `lib/finance-publicdata.ts` |
| **URL** | `https://apis.data.go.kr/1160100/service` |
| **환경변수** | `PUBLIC_DATA_API_KEY` |
| **Rate Limit** | 관대함 |
| **대상** | 한국 주식 |

**지원 API:**
- 주식시세정보: `GetStockPriceInfo`
- KRX상장종목정보: `GetKrxListedInfo`
- 지수시세정보: `GetIndexPriceInfo`

**획득 데이터:**
- 종가, 시가, 고가, 저가
- 거래량, 시가총액
- 전일대비 변동

**제한사항:** 2020년 1월 이후 데이터만, 실시간 불가

---

### 1.5 KRX Open API (한국거래소)

| 항목 | 내용 |
|------|------|
| **파일** | `lib/krx-api.ts` |
| **URL** | `https://data-dbg.krx.co.kr/svc/apis` |
| **환경변수** | `KRX_API_KEY` |
| **Rate Limit** | 10,000 calls/day |
| **대상** | 한국 주식 |

**엔드포인트:**
- `/sto/stk_bydd_trd` - 유가증권 일별매매정보
- `/etp/etf_bydd_trd` - ETF 일별매매정보

**획득 데이터:**
- 종목코드, 종목명
- 종가, 대비, 등락률
- 시가, 고가, 저가
- 거래량, 거래대금, 시가총액

---

### 1.6 Google Gemini API (Vision AI)

| 항목 | 내용 |
|------|------|
| **파일** | `lib/gemini-client.ts`, `lib/dual-source/agentic-crawler.ts` |
| **환경변수** | `GEMINI_API_KEY_01` ~ `GEMINI_API_KEY_10` |
| **모델** | `gemini-1.5-flash`, `gemini-1.5-pro` |

**사용 용도:**
- 스크린샷 분석 (Vision AI)
- 종목 분석 및 투자 의견 생성
- 뉴스 분석 및 요약

**특징:** 멀티 API 키 Fallback 시스템

---

## 2. 웹 크롤링/스크래핑

### 2.1 네이버 금융

| 항목 | 내용 |
|------|------|
| **파일** | `lib/dual-source/korea-stock-crawler.ts`, `lib/finance.ts` |
| **파싱** | Cheerio (HTML), axios (HTTP) |
| **대상** | 한국 주식 |

**크롤링 URL:**
| URL | 데이터 |
|-----|--------|
| `finance.naver.com/item/main.naver?code={code}` | 종목 상세정보 |
| `finance.naver.com/item/frgn.naver?code={code}` | 외국인/기관 수급 |
| `m.stock.naver.com/api/stock/{code}/basic` | 모바일 API (JSON) |
| `m.stock.naver.com/api/news/stock/{symbol}` | 종목 뉴스 |

**획득 데이터:**
- 기본정보 (종목명, 시장, 업종)
- 주가 데이터
- 기관/외국인 수급
- PER, PBR, EPS, BPS
- 52주 최고/최저가

---

### 2.2 다음 금융

| 항목 | 내용 |
|------|------|
| **파일** | `lib/dual-source/korea-stock-daum.ts` |
| **방식** | REST API (JSON) |
| **대상** | 한국 주식 |

**엔드포인트:**
| URL | 데이터 |
|-----|--------|
| `finance.daum.net/api/quotes/{symbol}` | 주가 시세 |
| `finance.daum.net/api/investor_data/{symbol}` | 투자자 수급 |

**획득 데이터:**
- 주가 데이터
- PER, PBR, EPS
- 52주 최고/최저가
- 외국인 비율
- 기업 정보

---

### 2.3 Yahoo Finance 웹 크롤링

| 항목 | 내용 |
|------|------|
| **파일** | `lib/dual-source/us-stock-crawler.ts` |
| **도구** | Playwright |
| **대상** | 미국 주식 |

**크롤링 URL:** `https://finance.yahoo.com/quote/{symbol}`

**특징:**
- 브라우저 자동화로 JavaScript 렌더링 페이지 처리
- 쿠키 동의 팝업 자동 처리
- Data-attribute 기반 안정적 추출

---

## 3. Agentic Screenshot 캡처

### 3.1 Agentic Web Browsing

| 항목 | 내용 |
|------|------|
| **파일** | `lib/dual-source/agentic-crawler.ts` |
| **도구** | Playwright + Gemini Vision AI |

**동작 방식:**
```
1. Playwright로 페이지 접속
2. 전체 화면 스크린샷 캡처
3. Gemini Vision AI로 이미지 분석
4. 구조화된 JSON 데이터 추출
```

**크롤링 대상:**
| 시장 | URL |
|------|-----|
| 한국 | `finance.naver.com/item/main.naver?code={symbol}` |
| 미국 | `finance.yahoo.com/quote/{symbol}` |

**추출 데이터:**
- 기본 정보 (종목명, 시장)
- 가격 데이터 (현재가, 변동, 거래량)
- 평가 정보 (PER, PBR, EPS)
- 재무정보
- 수급 데이터

**장점:**
- 웹사이트 구조 변경에 자동 적응
- CSS 셀렉터 하드코딩 불필요
- AI가 시각적 정보 해석

---

## 4. Python 스크립트

### 4.1 주식 데이터 수집

| 항목 | 내용 |
|------|------|
| **파일** | `scripts/test_python_stock.py` |
| **라이브러리** | yfinance, FinanceDataReader, pandas, numpy |
| **호출 방식** | Node.js `child_process` |

**획득 데이터:**
- 주가 데이터
- 이동평균선 (MA5, MA20, MA60, MA120)
- RSI 계산
- 이격도

---

### 4.2 종목 리스트 수집

| 스크립트 | 데이터 소스 | 출력 |
|----------|-------------|------|
| `generate_symbols_json.py` | 네이버 금융, GitHub CSV | `public/data/symbols.json` |
| `get_us_stock_listing.py` | GitHub US Stock Symbols | 미국 주식 티커 |
| `get_comprehensive_stock_listing.py` | 네이버, GitHub, FinanceDataReader | 한국 전체 종목 |
| `search_stock_by_name.py` | 네이버 금융 검색 | 종목코드 검색 |

---

### 4.3 종목 리스트 크롤링 상세

**네이버 금융:**
```
https://finance.naver.com/sise/sise_market_sum.naver?sosok=0  # KOSPI
https://finance.naver.com/sise/sise_market_sum.naver?sosok=1  # KOSDAQ
```

**GitHub 백업:**
```
https://raw.githubusercontent.com/corazzon/finance-data-analysis/main/krx.csv
https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/all/all_tickers.json
```

---

## 5. 환경변수 설정

```env
# API Keys - 미국 주식
FMP_API_KEY=xxx                  # Financial Modeling Prep (Primary)
FINNHUB_API_KEY=xxx              # Finnhub (Secondary)

# API Keys - 한국 주식
KIS_APP_KEY=xxx                  # 한국투자증권 Open API (Primary)
KIS_APP_SECRET=xxx               # 한국투자증권 Open API Secret
TWELVE_DATA_API_KEY=xxx          # Twelve Data
PUBLIC_DATA_API_KEY=xxx          # 공공데이터포털
KRX_API_KEY=xxx                  # KRX Open API

# Gemini API (멀티 키 지원)
GEMINI_API_KEY_01=xxx
GEMINI_API_KEY_02=xxx
GEMINI_API_KEY_03=xxx

# 설정
USE_DUAL_SOURCE=true             # Dual-Source 검증 활성화
USE_PYTHON_SCRIPT=true           # Python 스크립트 사용
```

---

## 6. 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                        Stock Insight                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  미국 주식   │    │  한국 주식   │    │    공통     │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐         │
│  │ FMP API ⭐   │    │ KIS API ⭐   │    │ Gemini AI   │         │
│  │ (Primary)   │    │ (Primary)   │    │ (분석/요약)  │         │
│  │ Yahoo API   │    │ 네이버 크롤링 │    └─────────────┘         │
│  │ Finnhub API │    │ 다음 API     │                           │
│  │ Playwright  │    │ KRX API      │                           │
│  │ (캡처+AI)   │    │ Playwright   │                           │
│  └─────────────┘    │ (캡처+AI)    │                           │
│                     └─────────────┘                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Dual-Source 검증 시스템                  │   │
│  │  • 2개 독립 소스에서 데이터 수집                          │   │
│  │  • 데이터 교차검증 및 신뢰도 계산                         │   │
│  │  • 불일치 필드 식별 및 리포팅                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     캐싱 시스템                           │   │
│  │  • 메모리 기반 캐싱 (TTL 설정)                           │   │
│  │  • API Rate Limit 방지                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 데이터 소스 우선순위

### 미국 주식
1. **Primary:** FMP API (NASDAQ 공식 라이선스) ⭐ NEW
2. **Secondary:** Yahoo Finance API (`yahoo-finance2`)
3. **Tertiary:** Finnhub API
4. **Fallback:** Agentic Screenshot + Gemini Vision

> FMP_API_KEY가 설정되지 않은 경우 기존 우선순위 (Yahoo → Finnhub → Agentic) 사용

### 한국 주식
1. **Primary:** 한국투자증권 Open API (KIS) ⭐ NEW
2. **Secondary:** 네이버 금융 크롤링 / 다음 금융 API
3. **Tertiary:** KRX API / 공공데이터포털
4. **Fallback:** Agentic Screenshot + Gemini Vision

> KIS_APP_KEY가 설정되지 않은 경우 기존 우선순위 (네이버 크롤링 → 다음 API → Agentic) 사용

---

## 주요 특징

| 기능 | 설명 |
|------|------|
| **Dual-Source 검증** | 2개 독립 소스로 데이터 교차검증 |
| **Agentic Web Browsing** | AI Vision으로 웹 구조 변경 자동 적응 |
| **멀티 API Fallback** | API 실패 시 자동 대체 소스 사용 |
| **멀티키 Gemini** | 여러 API 키로 Rate Limit 분산 |
| **Python 통합** | yfinance, FinanceDataReader 활용 |

---

*최종 업데이트: 2026-01-26*
