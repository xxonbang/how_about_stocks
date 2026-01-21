/**
 * 미국 주식 데이터 크롤러 (Yahoo Finance)
 * Source A: Playwright 기반 웹 크롤링
 *
 * 참고자료:
 * - https://www.nstbrowser.io/en/blog/yahoo-finance-scraping
 * - https://dev.to/code_jedi/scrape-the-latest-stock-prices-with-node-js-and-puppeteer-4p2g
 */

import { chromium, type Browser, type Page } from 'playwright';

// 대기 함수
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
import type {
  StockDataCollector,
  CollectionResult,
  StockBasicInfo,
  StockPriceData,
  StockValuationData,
  StockFinancialData,
  StockSupplyDemandData,
  StockMarketData,
  ComprehensiveStockData,
} from './types';

const YAHOO_FINANCE_BASE_URL = 'https://finance.yahoo.com';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Yahoo Finance 데이터 필드 셀렉터 (data-attribute 기반)
const getDataSelector = (symbol: string, field: string) =>
  `[data-symbol="${symbol}"][data-field="${field}"]`;

// Fallback 셀렉터 패턴
const FALLBACK_SELECTORS = {
  price: [
    'fin-streamer[data-field="regularMarketPrice"]',
    '[data-testid="qsp-price"]',
    '.livePrice span',
  ],
  change: [
    'fin-streamer[data-field="regularMarketChange"]',
    '[data-testid="qsp-price-change"]',
  ],
  changePercent: [
    'fin-streamer[data-field="regularMarketChangePercent"]',
    '[data-testid="qsp-price-change-percent"]',
  ],
};

/**
 * 텍스트에서 숫자 추출
 */
function extractNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,$%()]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * 큰 숫자 파싱 (T=Trillion, B=Billion, M=Million, K=Thousand)
 */
function parseAbbreviatedNumber(text: string | null | undefined): number | null {
  if (!text) return null;

  const cleaned = text.replace(/[,$]/g, '').trim().toUpperCase();

  const multipliers: Record<string, number> = {
    T: 1e12,
    B: 1e9,
    M: 1e6,
    K: 1e3,
  };

  for (const [suffix, multiplier] of Object.entries(multipliers)) {
    if (cleaned.endsWith(suffix)) {
      const num = parseFloat(cleaned.slice(0, -1));
      return isNaN(num) ? null : num * multiplier;
    }
  }

  return extractNumber(cleaned);
}

/**
 * 쿠키 동의 팝업 처리
 */
async function handleConsentPopup(page: Page): Promise<void> {
  try {
    // Yahoo Finance 쿠키 동의 버튼 셀렉터들
    const consentSelectors = [
      '#consent-page button[value="agree"]',
      'button[name="agree"]',
      '.consent-overlay button.accept-all',
      '#scroll-down-btn',
      'button:has-text("Accept all")',
      'button:has-text("동의")',
    ];

    for (const selector of consentSelectors) {
      try {
        const button = page.locator(selector);
        if (await button.count() > 0) {
          await button.first().click();
          await delay(1000);
          console.log('[USCrawler] Consent popup handled');
          return;
        }
      } catch {
        // 다음 셀렉터 시도
      }
    }
  } catch (error) {
    console.log('[USCrawler] No consent popup found or already accepted');
  }
}

/**
 * 페이지에서 요소의 텍스트 추출
 */
async function getElementText(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        const text = await element.first().textContent();
        if (text && text.trim()) {
          return text.trim();
        }
      }
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return null;
}

/**
 * Summary 테이블에서 값 추출 (다양한 구조 지원)
 */
async function getSummaryValue(page: Page, label: string): Promise<string | null> {
  try {
    const value = await page.evaluate((labelText) => {
      // 방법 1: 테이블 행에서 찾기
      const rows = Array.from(document.querySelectorAll('tr'));
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const labelCell = cells[0];
          if (labelCell && labelCell.textContent?.toLowerCase().includes(labelText.toLowerCase())) {
            const valueCell = cells[cells.length - 1];
            return valueCell?.textContent?.trim() || null;
          }
        }
      }

      // 방법 2: li 요소에서 찾기 (새로운 Yahoo Finance 구조)
      const listItems = Array.from(document.querySelectorAll('li'));
      for (let i = 0; i < listItems.length; i++) {
        const li = listItems[i];
        const labelEl = li.querySelector('span:first-child, label');
        const valueEl = li.querySelector('span:last-child, fin-streamer');
        if (labelEl && valueEl && labelEl.textContent?.toLowerCase().includes(labelText.toLowerCase())) {
          // valueEl 텍스트를 반환하되, fin-streamer의 value 속성 우선
          if (valueEl.tagName === 'FIN-STREAMER') {
            const valAttr = valueEl.getAttribute('value');
            if (valAttr) return valAttr;
          }
          return valueEl.textContent?.trim() || null;
        }
      }

      // 방법 3: data-test 속성으로 찾기
      const dataTestSelectors: Record<string, string> = {
        'previous close': '[data-test="PREV_CLOSE-value"]',
        'open': '[data-test="OPEN-value"]',
        'volume': '[data-test="TD_VOLUME-value"]',
        'market cap': '[data-test="MARKET_CAP-value"]',
        'pe ratio': '[data-test="PE_RATIO-value"]',
        'eps': '[data-test="EPS_RATIO-value"]',
        'beta': '[data-test="BETA_5Y-value"]',
        "day's range": '[data-test="DAYS_RANGE-value"]',
        '52 week range': '[data-test="FIFTY_TWO_WK_RANGE-value"]',
      };

      const normalizedLabel = labelText.toLowerCase();
      for (const [key, selector] of Object.entries(dataTestSelectors)) {
        if (key.includes(normalizedLabel) || normalizedLabel.includes(key)) {
          const el = document.querySelector(selector);
          if (el) return el.textContent?.trim() || null;
        }
      }

      return null;
    }, label);
    return value;
  } catch {
    return null;
  }
}

export class USStockCrawler implements StockDataCollector {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
    }
    return this.browser;
  }

  private async createPage(): Promise<Page> {
    const browser = await this.getBrowser();
    const page = await browser.newPage({
      userAgent: USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    return page;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async collectBasicInfo(symbol: string): Promise<CollectionResult<StockBasicInfo>> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      page = await this.createPage();
      await page.goto(`${YAHOO_FINANCE_BASE_URL}/quote/${symbol}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await handleConsentPopup(page);
      await delay(2000);

      // 회사명 추출 - 다양한 셀렉터 시도
      const name = await page.evaluate(() => {
        const selectors = [
          'section[data-testid="quote-hdr"] h1',
          '[data-testid="qsp-hdr"] h1',
          '#quote-header-info h1',
          'h1[class*="yf-"]',
        ];
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent) {
            const text = el.textContent.trim();
            if (text && text !== 'Yahoo Finance') return text;
          }
        }
        const title = document.title;
        if (title) {
          const match = title.match(/^(.+?)\s*\(/);
          if (match) return match[1].trim();
        }
        return null;
      });

      // 거래소 정보 추출 - 개선된 로직
      const exchangeInfo = await page.evaluate((sym) => {
        const nasdaqSymbols = ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'NVDA', 'TSLA', 'NFLX', 'INTC', 'AMD'];
        const bodyText = document.body.innerText.toUpperCase();
        if (bodyText.includes('NASDAQ') || bodyText.includes('NMS -') || nasdaqSymbols.includes(sym.toUpperCase())) {
          return 'NASDAQ';
        }
        if (bodyText.includes('NYSE -') || bodyText.includes('NYQ -')) {
          return 'NYSE';
        }
        return 'US';
      }, symbol);

      if (!name) {
        throw new Error(`종목 정보를 찾을 수 없습니다: ${symbol}`);
      }

      return {
        data: {
          symbol,
          name: name.split('(')[0].trim(),
          market: exchangeInfo,
          exchange: exchangeInfo,
        },
        source: 'crawling',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'crawling',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    } finally {
      if (page) await page.close();
    }
  }

  async collectPriceData(symbol: string): Promise<CollectionResult<StockPriceData>> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      page = await this.createPage();
      await page.goto(`${YAHOO_FINANCE_BASE_URL}/quote/${symbol}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await handleConsentPopup(page);
      await page.locator('fin-streamer[data-field="regularMarketPrice"]').waitFor({ timeout: 15000 });

      // 현재가
      const priceText = await getElementText(page, [
        getDataSelector(symbol, 'regularMarketPrice'),
        ...FALLBACK_SELECTORS.price,
      ]);
      const currentPrice = extractNumber(priceText);

      // 등락
      const changeText = await getElementText(page, [
        getDataSelector(symbol, 'regularMarketChange'),
        ...FALLBACK_SELECTORS.change,
      ]);
      const change = extractNumber(changeText);

      // 등락률
      const changePercentText = await getElementText(page, [
        getDataSelector(symbol, 'regularMarketChangePercent'),
        ...FALLBACK_SELECTORS.changePercent,
      ]);
      const changePercent = extractNumber(changePercentText);

      // Summary 테이블에서 데이터 추출
      const prevCloseText = await getSummaryValue(page, 'Previous Close');
      const previousClose = extractNumber(prevCloseText);

      const openText = await getSummaryValue(page, 'Open');
      const open = extractNumber(openText);

      const dayRangeText = await getSummaryValue(page, "Day's Range");
      let low = currentPrice;
      let high = currentPrice;
      if (dayRangeText) {
        const parts = dayRangeText.split('-').map((s) => extractNumber(s.trim()));
        if (parts[0]) low = parts[0];
        if (parts[1]) high = parts[1];
      }

      const week52RangeText = await getSummaryValue(page, '52 Week Range');
      let low52Week = currentPrice;
      let high52Week = currentPrice;
      if (week52RangeText) {
        const parts = week52RangeText.split('-').map((s) => extractNumber(s.trim()));
        if (parts[0]) low52Week = parts[0];
        if (parts[1]) high52Week = parts[1];
      }

      const volumeText = await getSummaryValue(page, 'Volume');
      const volume = parseAbbreviatedNumber(volumeText);

      if (!currentPrice) {
        throw new Error('현재가를 추출할 수 없습니다');
      }

      return {
        data: {
          currentPrice: currentPrice!,
          previousClose: previousClose || currentPrice!,
          change: change || 0,
          changePercent: changePercent || 0,
          open: open || currentPrice!,
          high: high || currentPrice!,
          low: low || currentPrice!,
          volume: volume || 0,
          tradingValue: 0,
          high52Week: high52Week || currentPrice!,
          low52Week: low52Week || currentPrice!,
        },
        source: 'crawling',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'crawling',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    } finally {
      if (page) await page.close();
    }
  }

  async collectValuationData(symbol: string): Promise<CollectionResult<StockValuationData>> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      page = await this.createPage();
      await page.goto(`${YAHOO_FINANCE_BASE_URL}/quote/${symbol}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await handleConsentPopup(page);
      await delay(2000);

      // Summary 테이블에서 밸류에이션 데이터 추출
      const peText = await getSummaryValue(page, 'PE Ratio');
      const per = extractNumber(peText);

      const epsText = await getSummaryValue(page, 'EPS');
      const eps = extractNumber(epsText);

      // Forward PE/EPS는 Statistics 페이지에서 가져와야 함
      // 여기서는 기본 페이지에서 가능한 것만 추출

      return {
        data: {
          per,
          pbr: null, // Statistics 페이지 필요
          eps,
          bps: null,
          roe: null,
          dividendYield: null,
          estimatedPer: null,
          estimatedEps: null,
        },
        source: 'crawling',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'crawling',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    } finally {
      if (page) await page.close();
    }
  }

  async collectFinancialData(symbol: string): Promise<CollectionResult<StockFinancialData>> {
    const startTime = Date.now();

    // 재무 데이터는 별도 페이지 (financials) 에서 수집 필요
    // 현재는 기본 데이터만 반환
    return {
      data: {
        revenue: null,
        operatingIncome: null,
        netIncome: null,
        operatingMargin: null,
        netProfitMargin: null,
        fiscalDate: null,
      },
      source: 'crawling',
      timestamp: Date.now(),
      success: true,
      latency: Date.now() - startTime,
    };
  }

  async collectSupplyDemandData(symbol: string): Promise<CollectionResult<StockSupplyDemandData>> {
    const startTime = Date.now();

    // 미국 주식은 수급 데이터 구조가 다름
    return {
      data: {
        foreignOwnership: null,
        foreignNetBuy: null,
        institutionalNetBuy: null,
        individualNetBuy: null,
      },
      source: 'crawling',
      timestamp: Date.now(),
      success: true,
      latency: Date.now() - startTime,
    };
  }

  async collectMarketData(symbol: string): Promise<CollectionResult<StockMarketData>> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      page = await this.createPage();
      await page.goto(`${YAHOO_FINANCE_BASE_URL}/quote/${symbol}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await handleConsentPopup(page);
      await delay(2000);

      // Market Cap
      const marketCapText = await getSummaryValue(page, 'Market Cap');
      const marketCap = parseAbbreviatedNumber(marketCapText);

      // Beta
      const betaText = await getSummaryValue(page, 'Beta');
      const beta = extractNumber(betaText);

      return {
        data: {
          marketCap,
          sharesOutstanding: null,
          floatShares: null,
          beta,
        },
        source: 'crawling',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'crawling',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    } finally {
      if (page) await page.close();
    }
  }

  async collectAll(symbol: string): Promise<CollectionResult<ComprehensiveStockData>> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      page = await this.createPage();
      await page.goto(`${YAHOO_FINANCE_BASE_URL}/quote/${symbol}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await handleConsentPopup(page);
      await page.locator('fin-streamer[data-field="regularMarketPrice"]').waitFor({ timeout: 15000 });

      // 회사명 - 다양한 셀렉터 시도
      const name = await page.evaluate(() => {
        // 회사명 셀렉터 후보들
        const selectors = [
          'section[data-testid="quote-hdr"] h1',
          '[data-testid="qsp-hdr"] h1',
          '#quote-header-info h1',
          'div[class*="quote-header"] h1',
          'h1[class*="yf-"]',
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent) {
            const text = el.textContent.trim();
            // "Yahoo Finance" 또는 빈 텍스트가 아닌 경우만 반환
            if (text && text !== 'Yahoo Finance' && text.length > 0) {
              return text;
            }
          }
        }

        // Fallback: 페이지 제목에서 추출
        const title = document.title;
        if (title) {
          const match = title.match(/^(.+?)\s*\(/);
          if (match) return match[1].trim();
        }

        return null;
      });

      // 거래소 정보 - 다양한 셀렉터 및 방법 시도
      const exchangeInfo = await page.evaluate((sym) => {
        const selectors = [
          '[data-testid="qsp-exchange"]',
          'span[class*="exchange"]',
          '#quote-header-info span:nth-child(2)',
          'div[class*="quote-header"] span',
          '.quote-header-section span',
        ];

        // 셀렉터로 시도
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent) {
            const text = el.textContent.trim().toUpperCase();
            if (text.includes('NASDAQ') || text.includes('NMS') || text.includes('NASD')) {
              return 'NASDAQ';
            }
            if (text.includes('NYSE') || text.includes('NYQ')) {
              return 'NYSE';
            }
          }
        }

        // 페이지 내 텍스트에서 찾기
        const bodyText = document.body.innerText.toUpperCase();
        if (bodyText.includes('NASDAQ') || bodyText.includes('NMS -')) {
          return 'NASDAQ';
        }
        if (bodyText.includes('NYSE -') || bodyText.includes('NYQ -')) {
          return 'NYSE';
        }

        // URL 또는 심볼 기반 추측 (일부 유명 NASDAQ 종목)
        const nasdaqSymbols = ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'NVDA', 'TSLA', 'NFLX', 'INTC', 'AMD', 'ADBE', 'CSCO', 'PYPL', 'QCOM'];
        if (nasdaqSymbols.includes(sym.toUpperCase())) {
          return 'NASDAQ';
        }

        return 'US';
      }, symbol);

      // 현재가
      const priceText = await getElementText(page, [
        getDataSelector(symbol, 'regularMarketPrice'),
        ...FALLBACK_SELECTORS.price,
      ]);
      const currentPrice = extractNumber(priceText);

      if (!currentPrice || !name) {
        throw new Error(`데이터를 추출할 수 없습니다: ${symbol}`);
      }

      // 등락
      const changeText = await getElementText(page, [
        getDataSelector(symbol, 'regularMarketChange'),
        ...FALLBACK_SELECTORS.change,
      ]);
      const change = extractNumber(changeText) || 0;

      // 등락률
      const changePercentText = await getElementText(page, [
        getDataSelector(symbol, 'regularMarketChangePercent'),
        ...FALLBACK_SELECTORS.changePercent,
      ]);
      const changePercent = extractNumber(changePercentText) || 0;

      // Summary 테이블 데이터
      const prevCloseText = await getSummaryValue(page, 'Previous Close');
      const previousClose = extractNumber(prevCloseText) || currentPrice;

      const openText = await getSummaryValue(page, 'Open');
      const open = extractNumber(openText) || currentPrice;

      const dayRangeText = await getSummaryValue(page, "Day's Range");
      let low = currentPrice;
      let high = currentPrice;
      if (dayRangeText) {
        const parts = dayRangeText.split('-').map((s) => extractNumber(s.trim()));
        if (parts[0]) low = parts[0];
        if (parts[1]) high = parts[1];
      }

      const week52RangeText = await getSummaryValue(page, '52 Week Range');
      let low52Week = currentPrice;
      let high52Week = currentPrice;
      if (week52RangeText) {
        const parts = week52RangeText.split('-').map((s) => extractNumber(s.trim()));
        if (parts[0]) low52Week = parts[0];
        if (parts[1]) high52Week = parts[1];
      }

      const volumeText = await getSummaryValue(page, 'Volume');
      const volume = parseAbbreviatedNumber(volumeText) || 0;

      const marketCapText = await getSummaryValue(page, 'Market Cap');
      const marketCap = parseAbbreviatedNumber(marketCapText);

      const peText = await getSummaryValue(page, 'PE Ratio');
      const per = extractNumber(peText);

      const epsText = await getSummaryValue(page, 'EPS');
      const eps = extractNumber(epsText);

      const betaText = await getSummaryValue(page, 'Beta');
      const beta = extractNumber(betaText);

      const comprehensiveData: ComprehensiveStockData = {
        basicInfo: {
          symbol,
          name: name.split('(')[0].trim(),
          market: exchangeInfo,
          exchange: exchangeInfo,
        },
        priceData: {
          currentPrice,
          previousClose,
          change,
          changePercent,
          open,
          high,
          low,
          volume,
          tradingValue: 0,
          high52Week,
          low52Week,
        },
        valuationData: {
          per,
          pbr: null,
          eps,
          bps: null,
          roe: null,
          dividendYield: null,
          estimatedPer: null,
          estimatedEps: null,
        },
        financialData: {
          revenue: null,
          operatingIncome: null,
          netIncome: null,
          operatingMargin: null,
          netProfitMargin: null,
          fiscalDate: null,
        },
        supplyDemandData: {
          foreignOwnership: null,
          foreignNetBuy: null,
          institutionalNetBuy: null,
          individualNetBuy: null,
        },
        marketData: {
          marketCap,
          sharesOutstanding: null,
          floatShares: null,
          beta,
        },
        timestamp: Date.now(),
        source: 'crawling',
      };

      return {
        data: comprehensiveData,
        source: 'crawling',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: null,
        source: 'crawling',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    } finally {
      if (page) await page.close();
    }
  }
}

// 싱글톤 인스턴스
export const usStockCrawler = new USStockCrawler();
