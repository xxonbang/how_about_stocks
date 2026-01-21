/**
 * Agentic Screenshot 크롤러
 *
 * 진정한 Agentic Web Browsing 방식:
 * 1. Playwright로 브라우저 자동화 및 페이지 렌더링
 * 2. 화면 캡처 (Screenshot)
 * 3. Vision AI (Gemini)로 시각적 정보 추출
 * 4. 구조화된 데이터 반환
 *
 * 장점:
 * - 웹사이트 구조 변경에 자동 적응
 * - CSS 셀렉터 하드코딩 불필요
 * - AI가 시각적으로 데이터 위치 파악
 * - Playwright의 빠른 성능 및 안정적인 자동 대기
 */

import { chromium, type Browser, type Page } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKeys } from '../gemini-client';
import type {
  CollectionResult,
  ComprehensiveStockData,
  StockBasicInfo,
  StockPriceData,
  StockValuationData,
  StockFinancialData,
  StockSupplyDemandData,
  StockMarketData,
} from './types';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 대기 함수
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Vision AI 응답에서 JSON 추출
 */
function extractJsonFromResponse(text: string): Record<string, unknown> {
  // JSON 블록 찾기
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }

  // 순수 JSON 시도
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  // JSON 부분만 추출 시도
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }

  throw new Error('JSON을 추출할 수 없습니다');
}

/**
 * Agentic Screenshot 크롤러 클래스
 */
export class AgenticScreenshotCrawler {
  private browser: Browser | null = null;
  private apiKeys: string[] = [];

  constructor() {
    this.apiKeys = getGeminiApiKeys();
    if (this.apiKeys.length > 0) {
      console.log(`[Agentic] Gemini API 키 ${this.apiKeys.length}개 로드됨 (멀티 키 Fallback 활성화)`);
    } else {
      console.warn('[Agentic] Gemini API 키가 설정되지 않았습니다');
    }
  }

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
      viewport: { width: 1400, height: 900 },
      extraHTTPHeaders: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
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

  /**
   * Vision AI로 스크린샷에서 데이터 추출 (멀티 키 Fallback 적용)
   */
  private async extractDataWithVision(
    screenshot: string,
    prompt: string
  ): Promise<Record<string, unknown>> {
    if (this.apiKeys.length === 0) {
      throw new Error('Gemini API 키가 설정되지 않았습니다');
    }

    let lastError: Error | null = null;

    // 모든 API 키를 순차적으로 시도
    for (let i = 0; i < this.apiKeys.length; i++) {
      const apiKey = this.apiKeys[i];
      const keyLabel = i === 0 ? 'Primary' : `Fallback ${i}`;

      try {
        console.log(`[Agentic Vision] ${keyLabel} API 키로 시도 중...`);

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: 'image/png',
              data: screenshot,
            },
          },
          prompt,
        ]);

        const responseText = result.response.text();
        console.log(`[Agentic Vision] ${keyLabel} API 키로 성공`);
        return extractJsonFromResponse(responseText);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        // Rate Limit 오류인지 확인
        const isRateLimitError = errorMessage.includes('429') ||
                                  errorMessage.includes('Too Many Requests') ||
                                  errorMessage.includes('quota');

        if (isRateLimitError && i < this.apiKeys.length - 1) {
          console.warn(`[Agentic Vision] ${keyLabel} API 키 Rate Limit 초과, 다음 키로 전환...`);
          continue;
        }

        // 마지막 키이거나 Rate Limit 외 오류면 로그 출력
        if (i === this.apiKeys.length - 1) {
          console.error(`[Agentic Vision] 모든 API 키 실패: ${errorMessage.substring(0, 100)}...`);
        } else if (!isRateLimitError) {
          console.error(`[Agentic Vision] ${keyLabel} API 키 오류 (Rate Limit 아님): ${errorMessage.substring(0, 100)}...`);
        }
      }
    }

    throw lastError || new Error('Vision AI 호출 실패');
  }

  /**
   * 한국 주식 데이터 수집 (네이버 금융)
   */
  async collectKoreaStock(symbol: string): Promise<CollectionResult<ComprehensiveStockData>> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      console.log(`[Agentic] 한국 주식 수집 시작: ${symbol}`);
      page = await this.createPage();

      // 네이버 금융 페이지 접속
      await page.goto(`https://finance.naver.com/item/main.naver?code=${symbol}`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      await delay(2000); // 페이지 완전 로딩 대기

      // 스크린샷 캡처 (Playwright는 Buffer 반환)
      console.log('[Agentic] 스크린샷 캡처 중...');
      const screenshotBuffer = await page.screenshot({
        fullPage: false,
        clip: { x: 0, y: 0, width: 1400, height: 900 },
      });
      const screenshot = screenshotBuffer.toString('base64');

      // Vision AI로 데이터 추출
      console.log('[Agentic] Vision AI로 데이터 추출 중...');
      const prompt = `이 한국 주식 페이지(네이버 금융) 스크린샷을 분석하여 다음 정보를 JSON 형식으로 추출해주세요.
숫자는 콤마 없이 순수 숫자로, 찾을 수 없는 항목은 null로 표시하세요.

{
  "basicInfo": {
    "name": "종목명 (예: 삼성전자)",
    "market": "시장구분 (KOSPI 또는 KOSDAQ)"
  },
  "priceData": {
    "currentPrice": 현재가 (숫자),
    "previousClose": 전일종가 (숫자),
    "change": 전일대비 변동금액 (하락 시 음수),
    "changePercent": 등락률 (%, 하락 시 음수),
    "open": 시가,
    "high": 고가,
    "low": 저가,
    "volume": 거래량,
    "high52Week": 52주 최고가,
    "low52Week": 52주 최저가
  },
  "valuationData": {
    "per": PER (배),
    "pbr": PBR (배),
    "eps": EPS (원),
    "bps": BPS (원),
    "dividendYield": 배당수익률 (%)
  },
  "marketData": {
    "marketCap": 시가총액 (원 단위, 조/억 변환하여 숫자로),
    "sharesOutstanding": 상장주식수
  },
  "supplyDemandData": {
    "foreignOwnership": 외국인 보유율 (%)
  }
}

JSON만 출력하세요.`;

      const extractedData = await this.extractDataWithVision(screenshot, prompt);
      console.log('[Agentic] 데이터 추출 완료');

      // 추출된 데이터를 ComprehensiveStockData 형식으로 변환
      const basicInfo = extractedData.basicInfo as Record<string, unknown> || {};
      const priceData = extractedData.priceData as Record<string, unknown> || {};
      const valuationData = extractedData.valuationData as Record<string, unknown> || {};
      const marketData = extractedData.marketData as Record<string, unknown> || {};
      const supplyDemandData = extractedData.supplyDemandData as Record<string, unknown> || {};

      const comprehensiveData: ComprehensiveStockData = {
        basicInfo: {
          symbol,
          name: String(basicInfo.name || symbol),
          market: String(basicInfo.market || 'KOSPI'),
          exchange: 'KRX',
        },
        priceData: {
          currentPrice: Number(priceData.currentPrice) || 0,
          previousClose: Number(priceData.previousClose) || 0,
          change: Number(priceData.change) || 0,
          changePercent: Number(priceData.changePercent) || 0,
          open: Number(priceData.open) || 0,
          high: Number(priceData.high) || 0,
          low: Number(priceData.low) || 0,
          volume: Number(priceData.volume) || 0,
          tradingValue: 0,
          high52Week: Number(priceData.high52Week) || 0,
          low52Week: Number(priceData.low52Week) || 0,
        },
        valuationData: {
          per: valuationData.per !== null ? Number(valuationData.per) : null,
          pbr: valuationData.pbr !== null ? Number(valuationData.pbr) : null,
          eps: valuationData.eps !== null ? Number(valuationData.eps) : null,
          bps: valuationData.bps !== null ? Number(valuationData.bps) : null,
          roe: null,
          dividendYield: valuationData.dividendYield !== null ? Number(valuationData.dividendYield) : null,
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
          foreignOwnership: supplyDemandData.foreignOwnership !== null ? Number(supplyDemandData.foreignOwnership) : null,
          foreignNetBuy: null,
          institutionalNetBuy: null,
          individualNetBuy: null,
        },
        marketData: {
          marketCap: marketData.marketCap !== null ? Number(marketData.marketCap) : null,
          sharesOutstanding: marketData.sharesOutstanding !== null ? Number(marketData.sharesOutstanding) : null,
          floatShares: null,
          beta: null,
        },
        timestamp: Date.now(),
        source: 'agentic',
      };

      return {
        data: comprehensiveData,
        source: 'agentic',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[Agentic] 한국 주식 수집 실패:', error);
      return {
        data: null,
        source: 'agentic',
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    } finally {
      if (page) await page.close();
    }
  }

  /**
   * 미국 주식 데이터 수집 (Yahoo Finance)
   */
  async collectUSStock(symbol: string): Promise<CollectionResult<ComprehensiveStockData>> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      console.log(`[Agentic] 미국 주식 수집 시작: ${symbol}`);
      page = await this.createPage();

      // Yahoo Finance 페이지 접속
      await page.goto(`https://finance.yahoo.com/quote/${symbol}`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      await delay(3000); // 페이지 완전 로딩 대기

      // 쿠키 동의 팝업 처리
      try {
        const consentButton = page.locator('button[name="agree"]');
        if (await consentButton.count() > 0) {
          await consentButton.click();
          await delay(1000);
        }
      } catch {
        // 팝업 없음
      }

      // 스크린샷 캡처 (Playwright는 Buffer 반환)
      console.log('[Agentic] 스크린샷 캡처 중...');
      const screenshotBuffer = await page.screenshot({
        fullPage: false,
        clip: { x: 0, y: 0, width: 1400, height: 900 },
      });
      const screenshot = screenshotBuffer.toString('base64');

      // Vision AI로 데이터 추출
      console.log('[Agentic] Vision AI로 데이터 추출 중...');
      const prompt = `이 미국 주식 페이지(Yahoo Finance) 스크린샷을 분석하여 다음 정보를 JSON 형식으로 추출해주세요.
숫자는 콤마 없이 순수 숫자로, 찾을 수 없는 항목은 null로 표시하세요.
시가총액(Market Cap)은 T(trillion), B(billion), M(million) 단위를 원래 숫자로 변환하세요.
예: 2.5T = 2500000000000, 150B = 150000000000

{
  "basicInfo": {
    "name": "회사명 (예: Apple Inc.)",
    "exchange": "거래소 (NASDAQ 또는 NYSE)"
  },
  "priceData": {
    "currentPrice": 현재가 (달러),
    "previousClose": 전일종가,
    "change": 변동금액 (하락 시 음수),
    "changePercent": 등락률 (%, 하락 시 음수),
    "open": 시가,
    "high": 고가 (Day's Range의 높은 값),
    "low": 저가 (Day's Range의 낮은 값),
    "volume": 거래량,
    "high52Week": 52주 최고가 (52 Week Range의 높은 값),
    "low52Week": 52주 최저가 (52 Week Range의 낮은 값)
  },
  "valuationData": {
    "per": PE Ratio,
    "eps": EPS,
    "dividendYield": 배당수익률 (%)
  },
  "marketData": {
    "marketCap": 시가총액 (숫자로 변환),
    "beta": Beta 값
  }
}

JSON만 출력하세요.`;

      const extractedData = await this.extractDataWithVision(screenshot, prompt);
      console.log('[Agentic] 데이터 추출 완료');

      // 추출된 데이터를 ComprehensiveStockData 형식으로 변환
      const basicInfo = extractedData.basicInfo as Record<string, unknown> || {};
      const priceData = extractedData.priceData as Record<string, unknown> || {};
      const valuationData = extractedData.valuationData as Record<string, unknown> || {};
      const marketData = extractedData.marketData as Record<string, unknown> || {};

      const exchange = String(basicInfo.exchange || 'US');

      const comprehensiveData: ComprehensiveStockData = {
        basicInfo: {
          symbol,
          name: String(basicInfo.name || symbol),
          market: exchange,
          exchange: exchange,
        },
        priceData: {
          currentPrice: Number(priceData.currentPrice) || 0,
          previousClose: Number(priceData.previousClose) || 0,
          change: Number(priceData.change) || 0,
          changePercent: Number(priceData.changePercent) || 0,
          open: Number(priceData.open) || 0,
          high: Number(priceData.high) || 0,
          low: Number(priceData.low) || 0,
          volume: Number(priceData.volume) || 0,
          tradingValue: 0,
          high52Week: Number(priceData.high52Week) || 0,
          low52Week: Number(priceData.low52Week) || 0,
        },
        valuationData: {
          per: valuationData.per !== null ? Number(valuationData.per) : null,
          pbr: null,
          eps: valuationData.eps !== null ? Number(valuationData.eps) : null,
          bps: null,
          roe: null,
          dividendYield: valuationData.dividendYield !== null ? Number(valuationData.dividendYield) : null,
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
          marketCap: marketData.marketCap !== null ? Number(marketData.marketCap) : null,
          sharesOutstanding: null,
          floatShares: null,
          beta: marketData.beta !== null ? Number(marketData.beta) : null,
        },
        timestamp: Date.now(),
        source: 'agentic',
      };

      return {
        data: comprehensiveData,
        source: 'agentic',
        timestamp: Date.now(),
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[Agentic] 미국 주식 수집 실패:', error);
      return {
        data: null,
        source: 'agentic',
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
export const agenticCrawler = new AgenticScreenshotCrawler();
