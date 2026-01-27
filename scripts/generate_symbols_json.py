#!/usr/bin/env python3.11
"""
종목 검색용 정적 symbols.json 파일 생성
한국 주식(KRX) + 미국 주식(US) 전체 종목 리스트를 JSON으로 저장

이 스크립트는 주기적으로 실행하여 최신 종목 리스트를 유지합니다.
생성된 JSON 파일은 public/data/symbols.json에 저장됩니다.

[2026-01-27 개선사항]
- ETF 별도 수집 로직 추가 (네이버 금융 ETF API)
- pykrx ALL 옵션으로 KONEX 포함
- FMP Company Symbols List 활용 (미국 주식 보완)
- GitHub US-Stock-Symbols 활용 (무료 백업 소스)
- 상세 로깅 강화
"""

import sys
import json
import os
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

try:
    import FinanceDataReader as fdr
    import pandas as pd
    import requests
    from bs4 import BeautifulSoup
except ImportError as e:
    print(json.dumps({"error": f"Required packages not installed: {e}"}), file=sys.stderr)
    sys.exit(1)

def load_env_file(env_path: Path):
    """.env.local 또는 .env 파일에서 환경 변수 로드"""
    if not env_path.exists():
        return
    
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                # 주석 무시
                if line.startswith('#') or not line:
                    continue
                # KEY=VALUE 형식 파싱
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    # 따옴표 제거
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    # 환경 변수에 설정 (이미 설정되어 있지 않은 경우만)
                    if key and value and key not in os.environ:
                        os.environ[key] = value
    except Exception as e:
        print(f"환경 변수 파일 로드 실패 (무시): {str(e)}", file=sys.stderr)

# .env.local 또는 .env 파일 로드
script_dir = Path(__file__).parent.parent
env_local = script_dir / '.env.local'
env_file = script_dir / '.env'

if env_local.exists():
    load_env_file(env_local)
elif env_file.exists():
    load_env_file(env_file)

def get_stock_listing_from_naver_all_stocks():
    """네이버 금융에서 코스피/코스닥 전종목 리스트 가져오기 (실시간 시장 데이터 기반)

    이 함수는 행정 서류 제출 여부와 상관없이 '거래 중인 모든 종목'을 가져옵니다.
    FinanceDataReader의 행정 마스터 파일 지연 문제를 해결합니다.

    [2026-01-19 수정] sise_market_sum.naver 페이지네이션 크롤링으로 변경
    - 기존 sise_low_item.naver는 결과를 반환하지 않음
    - sise_market_sum.naver는 시가총액 기준 전체 종목 리스트 제공
    """
    all_stocks = []
    existing_codes = set()

    def fetch_market_stocks(sosok: int, market_name: str) -> list:
        """특정 시장의 전체 종목 가져오기 (페이지네이션)"""
        stocks = []
        page = 1
        max_pages = 50  # 안전장치

        while page <= max_pages:
            try:
                url = f'https://finance.naver.com/sise/sise_market_sum.naver?sosok={sosok}&page={page}'
                response = requests.get(url, timeout=15, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://finance.naver.com/'
                })
                response.encoding = 'euc-kr'

                soup = BeautifulSoup(response.text, 'html.parser')
                table = soup.find('table', {'class': 'type_2'})

                if not table:
                    break

                rows = table.find_all('tr')
                found_stocks = 0

                for row in rows:
                    # 종목명 링크에서 코드 추출
                    name_cell = row.find('a', {'class': 'tltle'})
                    if not name_cell:
                        continue

                    href = name_cell.get('href', '')
                    name = name_cell.get_text(strip=True)

                    # href에서 종목코드 추출: /item/main.naver?code=XXXXXX
                    if 'code=' in href:
                        code = href.split('code=')[-1].split('&')[0]
                        if code and code.isdigit() and len(code) == 6:
                            if code not in existing_codes:
                                stocks.append({
                                    'code': code,
                                    'name': name,
                                    'market': market_name,
                                    'country': 'KR'
                                })
                                existing_codes.add(code)
                                found_stocks += 1

                # 더 이상 종목이 없으면 종료
                if found_stocks == 0:
                    break

                # 페이지 번호 확인 (마지막 페이지인지)
                paging = soup.find('td', {'class': 'pgRR'})
                if not paging:
                    break

                page += 1

            except Exception as e:
                print(f"[{market_name}] 페이지 {page} 크롤링 실패: {str(e)}", file=sys.stderr)
                break

        return stocks

    try:
        # 코스피 전종목 (sosok=0)
        print("네이버 금융 코스피 전종목 가져오는 중 (페이지네이션)...", file=sys.stderr)
        kospi_stocks = fetch_market_stocks(0, 'KOSPI')
        all_stocks.extend(kospi_stocks)
        print(f"네이버 금융 코스피에서 {len(kospi_stocks)}개 종목 가져옴", file=sys.stderr)

        # 코스닥 전종목 (sosok=1)
        print("네이버 금융 코스닥 전종목 가져오는 중 (페이지네이션)...", file=sys.stderr)
        kosdaq_stocks = fetch_market_stocks(1, 'KOSDAQ')
        all_stocks.extend(kosdaq_stocks)
        print(f"네이버 금융 코스닥에서 {len(kosdaq_stocks)}개 종목 가져옴", file=sys.stderr)

        print(f"네이버 금융 전종목 총 {len(all_stocks)}개 종목 가져옴", file=sys.stderr)

    except Exception as e:
        print(f"네이버 금융 전종목 크롤링 실패: {str(e)}", file=sys.stderr)

    return all_stocks

def get_korea_etf_from_naver():
    """네이버 금융 ETF 목록 가져오기

    네이버 금융 ETF 페이지에서 전체 ETF 목록을 크롤링합니다.
    주식 목록과 별개로 ETF를 수집하여 누락을 방지합니다.
    """
    etf_stocks = []
    existing_codes = set()

    try:
        # 네이버 ETF 시세 페이지 (국내 ETF)
        print("[ETF] 네이버 금융 ETF 목록 가져오는 중...", file=sys.stderr)

        page = 1
        max_pages = 20

        while page <= max_pages:
            try:
                url = f'https://finance.naver.com/sise/etf.naver?page={page}'
                response = requests.get(url, timeout=15, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://finance.naver.com/'
                })
                response.encoding = 'euc-kr'

                soup = BeautifulSoup(response.text, 'html.parser')
                table = soup.find('table', {'class': 'type_1'}) or soup.find('table', {'class': 'type_2'})

                if not table:
                    # ETF 전용 테이블 구조가 다를 수 있음
                    rows = soup.find_all('tr')
                else:
                    rows = table.find_all('tr')

                found_etfs = 0

                for row in rows:
                    # ETF 링크 찾기
                    links = row.find_all('a')
                    for link in links:
                        href = link.get('href', '')
                        if 'code=' in href and '/item/' in href:
                            code = href.split('code=')[-1].split('&')[0]
                            name = link.get_text(strip=True)

                            if code and code.isdigit() and len(code) == 6 and name:
                                if code not in existing_codes:
                                    etf_stocks.append({
                                        'code': code,
                                        'name': name,
                                        'market': 'ETF',
                                        'country': 'KR'
                                    })
                                    existing_codes.add(code)
                                    found_etfs += 1

                if found_etfs == 0:
                    break

                page += 1

            except Exception as e:
                print(f"[ETF] 페이지 {page} 크롤링 실패: {str(e)}", file=sys.stderr)
                break

        print(f"[ETF] 네이버 금융에서 {len(etf_stocks)}개 ETF 가져옴", file=sys.stderr)

    except Exception as e:
        print(f"[ETF] 네이버 금융 ETF 크롤링 실패: {str(e)}", file=sys.stderr)

    # 추가: KRX ETF 목록도 시도 (FinanceDataReader)
    try:
        etf_list = fdr.StockListing('ETF/KR')
        if etf_list is not None and not etf_list.empty:
            added_count = 0
            for _, row in etf_list.iterrows():
                symbol = str(row.get('Symbol', '')).strip()
                name = str(row.get('Name', '')).strip()

                if symbol and name and len(symbol) == 6 and symbol.isdigit():
                    if symbol not in existing_codes:
                        etf_stocks.append({
                            'code': symbol,
                            'name': name,
                            'market': 'ETF',
                            'country': 'KR'
                        })
                        existing_codes.add(symbol)
                        added_count += 1

            print(f"[ETF] FinanceDataReader에서 {added_count}개 ETF 추가", file=sys.stderr)
    except Exception as e:
        print(f"[ETF] FinanceDataReader ETF 실패 (무시): {str(e)}", file=sys.stderr)

    return etf_stocks


def get_stock_by_ticker(ticker_code):
    """Ticker 기반 역추적: 종목코드로 직접 종목 정보 조회"""
    if not ticker_code or not ticker_code.isdigit() or len(ticker_code) != 6:
        return None
    
    try:
        url = f'https://finance.naver.com/item/main.naver?code={ticker_code}'
        response = requests.get(url, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://finance.naver.com/'
        })
        response.encoding = 'euc-kr'
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        name = None
        name_selectors = ['h2.wrap_company', 'div.wrap_company h2', 'h2.company_name']
        for selector in name_selectors:
            element = soup.select_one(selector)
            if element:
                name = element.get_text(strip=True)
                break
        
        market = 'KRX'
        market_info = soup.find('div', {'class': 'description'})
        if market_info:
            market_text = market_info.get_text()
            if '코스닥' in market_text or 'KOSDAQ' in market_text:
                market = 'KOSDAQ'
            elif '코스피' in market_text or 'KOSPI' in market_text:
                market = 'KOSPI'
        
        if name:
            return {
                'code': ticker_code,
                'name': name,
                'market': market,
                'country': 'KR'
            }
    except Exception as e:
        print(f"Ticker {ticker_code} 조회 실패: {str(e)}", file=sys.stderr)
    
    return None

def get_korea_stocks():
    """한국 주식 리스트 가져오기 (KRX + KOSDAQ + ETF) - 다중 마스터 병합"""
    all_stocks = []
    existing_codes = set()
    
    # 1. 네이버 금융 전종목 (실시간 시장 데이터 기반, 최우선)
    # 행정 마스터 파일 지연 문제를 해결하는 핵심 데이터 소스
    try:
        naver_stocks = get_stock_listing_from_naver_all_stocks()
        for stock in naver_stocks:
            code = stock['code']
            if code not in existing_codes:
                all_stocks.append(stock)
                existing_codes.add(code)
        print(f"네이버 금융 전종목에서 {len(naver_stocks)}개 종목 가져옴", file=sys.stderr)
    except Exception as e:
        print(f"네이버 금융 전종목 크롤링 실패: {str(e)}", file=sys.stderr)
    
    # 2. GitHub CSV (안정적 백업 소스)
    try:
        github_url = "https://raw.githubusercontent.com/corazzon/finance-data-analysis/main/krx.csv"
        df = pd.read_csv(github_url)
        
        column_mapping = {}
        for col in df.columns:
            col_lower = col.lower()
            if 'symbol' in col_lower or 'code' in col_lower or 'ticker' in col_lower:
                column_mapping[col] = 'Symbol'
            elif 'name' in col_lower or '종목명' in col_lower:
                column_mapping[col] = 'Name'
            elif 'market' in col_lower or '시장' in col_lower:
                column_mapping[col] = 'Market'
        
        df = df.rename(columns=column_mapping)
        
        if 'Symbol' in df.columns and 'Name' in df.columns:
            if 'Market' not in df.columns:
                df['Market'] = 'KRX'
            
            added_count = 0
            for _, row in df.iterrows():
                symbol = str(row.get('Symbol', '')).strip()
                name = str(row.get('Name', '')).strip()
                market = str(row.get('Market', 'KRX')).strip()
                
                if symbol and name and len(symbol) == 6 and symbol.isdigit():
                    if symbol not in existing_codes:
                        all_stocks.append({
                            'code': symbol,
                            'name': name,
                            'market': market,
                            'country': 'KR'
                        })
                        existing_codes.add(symbol)
                        added_count += 1
            
            print(f"GitHub CSV에서 {added_count}개 종목 추가 (기존 {len(existing_codes) - added_count}개와 중복 제외)", file=sys.stderr)
    except Exception as e:
        print(f"GitHub CSV 실패: {str(e)}", file=sys.stderr)
    
    # 3. pykrx 시도 (KRX 공식 데이터 기반, 신규 상장주 포함)
    # [개선] ALL 옵션으로 KOSPI, KOSDAQ, KONEX 모두 조회
    try:
        from pykrx import stock
        from datetime import datetime, timedelta

        today = datetime.now().strftime("%Y%m%d")
        # 오늘이 거래일이 아닐 수 있으므로 최근 7일 중 하나 사용
        for days_back in range(7):
            try:
                check_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y%m%d")

                # [개선] ALL 옵션으로 모든 시장 조회 (KOSPI + KOSDAQ + KONEX)
                all_tickers = stock.get_market_ticker_list(check_date, market="ALL")

                if all_tickers:
                    added_count = 0
                    kospi_count = 0
                    kosdaq_count = 0
                    konex_count = 0

                    for ticker in all_tickers:
                        if ticker not in existing_codes:
                            try:
                                name = stock.get_market_ticker_name(ticker)
                                if name:
                                    # 시장 구분 확인
                                    try:
                                        # pykrx에서 개별 종목의 시장 확인
                                        market_info = 'KRX'
                                        # KOSPI 확인
                                        kospi_check = stock.get_market_ticker_list(check_date, market="KOSPI")
                                        kosdaq_check = stock.get_market_ticker_list(check_date, market="KOSDAQ")
                                        konex_check = stock.get_market_ticker_list(check_date, market="KONEX")

                                        if ticker in kospi_check:
                                            market_info = 'KOSPI'
                                            kospi_count += 1
                                        elif ticker in kosdaq_check:
                                            market_info = 'KOSDAQ'
                                            kosdaq_count += 1
                                        elif ticker in konex_check:
                                            market_info = 'KONEX'
                                            konex_count += 1
                                    except Exception:
                                        market_info = 'KRX'

                                    all_stocks.append({
                                        'code': ticker,
                                        'name': name,
                                        'market': market_info,
                                        'country': 'KR'
                                    })
                                    existing_codes.add(ticker)
                                    added_count += 1
                            except Exception:
                                pass

                    print(f"pykrx에서 {added_count}개 종목 추가 (기준일: {check_date})", file=sys.stderr)
                    print(f"  - KOSPI: {kospi_count}, KOSDAQ: {kosdaq_count}, KONEX: {konex_count}", file=sys.stderr)
                    break
            except Exception as e:
                continue
    except ImportError:
        print("pykrx 미설치 (무시): pip install pykrx로 설치 가능", file=sys.stderr)
    except Exception as e:
        print(f"pykrx 실패 (무시): {str(e)}", file=sys.stderr)

    # 4. FinanceDataReader 시도 (보완용)
    try:
        stock_list = fdr.StockListing('KRX')
        if stock_list is not None and not stock_list.empty:
            added_count = 0
            for _, row in stock_list.iterrows():
                symbol = str(row.get('Symbol', '')).strip()
                name = str(row.get('Name', '')).strip()
                market = str(row.get('Market', 'KRX')).strip()

                if symbol and name and len(symbol) == 6 and symbol.isdigit():
                    if symbol not in existing_codes:
                        all_stocks.append({
                            'code': symbol,
                            'name': name,
                            'market': market,
                            'country': 'KR'
                        })
                        existing_codes.add(symbol)
                        added_count += 1

            print(f"FinanceDataReader에서 {added_count}개 종목 추가", file=sys.stderr)
    except Exception as e:
        print(f"FinanceDataReader 실패 (무시): {str(e)}", file=sys.stderr)

    # 5. ETF 별도 수집 [신규 추가]
    # 주식 목록과 별개로 ETF를 수집하여 누락 방지
    try:
        etf_stocks = get_korea_etf_from_naver()
        etf_added = 0
        for etf in etf_stocks:
            code = etf['code']
            if code not in existing_codes:
                all_stocks.append(etf)
                existing_codes.add(code)
                etf_added += 1
        print(f"ETF 수집에서 {etf_added}개 종목 추가 (기존 중복 제외)", file=sys.stderr)
    except Exception as e:
        print(f"ETF 수집 실패 (무시): {str(e)}", file=sys.stderr)

    # 6. 주요 누락 종목 수동 보강 (Manual Overlay)
    # FinanceDataReader에서 누락되는 주요 종목들을 Ticker 기반 역추적으로 추가
    manual_tickers = ['064400']  # LG씨엔에스 등

    for ticker in manual_tickers:
        if ticker not in existing_codes:
            ticker_info = get_stock_by_ticker(ticker)
            if ticker_info:
                all_stocks.append(ticker_info)
                existing_codes.add(ticker)
                print(f"수동 보강 (Ticker 역추적): {ticker_info['name']} ({ticker}) 추가", file=sys.stderr)

    # 최종 통계 출력
    market_stats = {}
    for stock in all_stocks:
        market = stock.get('market', 'OTHER')
        market_stats[market] = market_stats.get(market, 0) + 1
    print(f"[한국 주식 최종] 총 {len(all_stocks)}개 종목 수집", file=sys.stderr)
    for market, count in sorted(market_stats.items()):
        print(f"  - {market}: {count}개", file=sys.stderr)

    return all_stocks

def get_us_stocks():
    """미국 주식 리스트 가져오기 (다중 소스)

    [2026-01-27 개선]
    1. Finnhub API (기존)
    2. FMP Company Symbols List (신규 추가)
    3. GitHub US-Stock-Symbols (무료 백업 소스)
    """
    all_stocks = []
    existing_symbols = set()

    # 1. Finnhub API (기존 소스)
    finnhub_key = os.environ.get('FINNHUB_API_KEY') or os.environ.get('NEXT_PUBLIC_FINNHUB_API_KEY')

    if finnhub_key:
        print(f"[US] Finnhub API 키 확인됨 (길이: {len(finnhub_key)})", file=sys.stderr)
        try:
            url = f'https://finnhub.io/api/v1/stock/symbol?exchange=US&token={finnhub_key}'
            response = requests.get(url, timeout=30)

            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    for item in data:
                        symbol = item.get('symbol', '').strip()
                        name = item.get('description', '').strip()
                        stock_type = item.get('type', '').strip()

                        if symbol and name and symbol not in existing_symbols:
                            all_stocks.append({
                                'code': symbol,
                                'name': name,
                                'market': 'US',
                                'country': 'US',
                                'type': stock_type
                            })
                            existing_symbols.add(symbol)

                    print(f"[US] Finnhub에서 {len(all_stocks)}개 종목 가져옴", file=sys.stderr)
            else:
                print(f"[US] Finnhub API 오류: {response.status_code}", file=sys.stderr)
        except Exception as e:
            print(f"[US] Finnhub API 실패: {str(e)}", file=sys.stderr)
    else:
        print("[US] FINNHUB_API_KEY 미설정, Finnhub 스킵", file=sys.stderr)

    # 2. FMP Company Symbols List (신규 추가)
    fmp_key = os.environ.get('FMP_API_KEY')

    if fmp_key:
        print(f"[US] FMP API 키 확인됨 (길이: {len(fmp_key)})", file=sys.stderr)
        try:
            # FMP stable API 사용
            url = f'https://financialmodelingprep.com/stable/stock-list?apikey={fmp_key}'
            response = requests.get(url, timeout=60)

            if response.status_code == 200:
                data = response.json()
                added_count = 0
                if isinstance(data, list):
                    for item in data:
                        symbol = item.get('symbol', '').strip()
                        name = item.get('name', '').strip()
                        exchange = item.get('exchange', '').strip()
                        stock_type = item.get('type', '').strip()

                        # 미국 거래소만 필터링
                        us_exchanges = ['NYSE', 'NASDAQ', 'AMEX', 'NYSE ARCA', 'NYSE MKT', 'BATS', 'OTC']
                        if symbol and name and symbol not in existing_symbols:
                            if exchange in us_exchanges or any(ex in exchange for ex in us_exchanges):
                                all_stocks.append({
                                    'code': symbol,
                                    'name': name,
                                    'market': exchange or 'US',
                                    'country': 'US',
                                    'type': stock_type
                                })
                                existing_symbols.add(symbol)
                                added_count += 1

                    print(f"[US] FMP에서 {added_count}개 종목 추가 (기존 중복 제외)", file=sys.stderr)
            else:
                print(f"[US] FMP API 오류: {response.status_code}", file=sys.stderr)
        except Exception as e:
            print(f"[US] FMP API 실패 (무시): {str(e)}", file=sys.stderr)
    else:
        print("[US] FMP_API_KEY 미설정, FMP 스킵", file=sys.stderr)

    # 3. GitHub US-Stock-Symbols (무료 백업 소스)
    github_sources = [
        ('NASDAQ', 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_tickers.txt'),
        ('NYSE', 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_tickers.txt'),
        ('AMEX', 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_tickers.txt'),
    ]

    for exchange_name, url in github_sources:
        try:
            response = requests.get(url, timeout=15)
            if response.status_code == 200:
                tickers = response.text.strip().split('\n')
                added_count = 0
                for ticker in tickers:
                    ticker = ticker.strip()
                    if ticker and ticker not in existing_symbols:
                        # GitHub 소스는 이름이 없으므로 심볼만 추가
                        all_stocks.append({
                            'code': ticker,
                            'name': ticker,  # 이름 없음, 심볼로 대체
                            'market': exchange_name,
                            'country': 'US',
                            'type': 'Common Stock'
                        })
                        existing_symbols.add(ticker)
                        added_count += 1
                print(f"[US] GitHub {exchange_name}에서 {added_count}개 종목 추가", file=sys.stderr)
        except Exception as e:
            print(f"[US] GitHub {exchange_name} 실패 (무시): {str(e)}", file=sys.stderr)

    # 최종 통계
    market_stats = {}
    for stock in all_stocks:
        market = stock.get('market', 'OTHER')
        market_stats[market] = market_stats.get(market, 0) + 1
    print(f"[미국 주식 최종] 총 {len(all_stocks)}개 종목 수집", file=sys.stderr)
    for market, count in sorted(market_stats.items(), key=lambda x: -x[1])[:10]:
        print(f"  - {market}: {count}개", file=sys.stderr)

    return all_stocks

def main():
    """메인 함수: symbols.json 생성"""
    from datetime import datetime

    print("=" * 60, file=sys.stderr)
    print("종목 리스트 생성 시작", file=sys.stderr)
    print(f"실행 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    # 한국 주식 가져오기
    print("\n[1/2] 한국 주식 수집 중...", file=sys.stderr)
    korea_stocks = get_korea_stocks()

    # 미국 주식 가져오기
    print("\n[2/2] 미국 주식 수집 중...", file=sys.stderr)
    us_stocks = get_us_stocks()

    # 통합
    all_symbols = {
        'version': '2.0',  # 버전 업데이트 (ETF, FMP, GitHub 추가)
        'generated_at': pd.Timestamp.now().isoformat(),
        'korea': {
            'count': len(korea_stocks),
            'stocks': korea_stocks
        },
        'us': {
            'count': len(us_stocks),
            'stocks': us_stocks
        },
        'total': len(korea_stocks) + len(us_stocks)
    }
    
    # public/data/symbols.json에 저장
    output_dir = Path(__file__).parent.parent / 'public' / 'data'
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / 'symbols.json'
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_symbols, f, ensure_ascii=False, indent=2)
    
    print(f"symbols.json 생성 완료: {output_file}", file=sys.stderr)
    print(f"총 {all_symbols['total']}개 종목 저장됨", file=sys.stderr)
    
    # 성공 응답
    print(json.dumps({
        'success': True,
        'korea_count': len(korea_stocks),
        'us_count': len(us_stocks),
        'total_count': all_symbols['total'],
        'output_file': str(output_file)
    }, ensure_ascii=False))

if __name__ == '__main__':
    main()
