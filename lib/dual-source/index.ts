/**
 * 듀얼 소스 데이터 수집 시스템
 *
 * 이 모듈은 두 개의 독립적인 소스에서 주식 데이터를 수집하고
 * 상호 검증하여 신뢰성 높은 데이터를 제공합니다.
 *
 * @example
 * ```typescript
 * import { collectStockDataDualSource } from '@/lib/dual-source';
 *
 * // 한국 주식
 * const samsungData = await collectStockDataDualSource('005930');
 *
 * // 미국 주식
 * const appleData = await collectStockDataDualSource('AAPL');
 *
 * console.log(`신뢰도: ${appleData.confidence * 100}%`);
 * console.log(`일치 필드: ${appleData.validation.matchedFields.length}개`);
 * ```
 */

// 메인 수집 함수들
export {
  collectStockDataDualSource,
  collectStocksDataBatchDualSource,
  collectStockDataSingleSource,
  closeBrowsers,
  detectMarketType,
  type MarketType,
} from './dual-source-collector';

// 개별 수집기들 - 한국 주식
export {
  KoreaStockCrawler,
  koreaStockCrawler,
} from './korea-stock-crawler';

export {
  KoreaStockDaumCollector,
  koreaStockDaumCollector,
} from './korea-stock-daum';

export {
  KoreaStockKISCollector,
  koreaStockKISCollector,
  isKISConfigured,
} from './korea-stock-kis';

// 개별 수집기들 - 미국 주식
export {
  USStockYahooCollector,
  usStockYahooCollector,
} from './us-stock-yahoo';

export {
  USStockFinnhubCollector,
  usStockFinnhubCollector,
} from './us-stock-finnhub';

export {
  USStockFMPCollector,
  usStockFMPCollector,
  isFMPConfigured,
} from './us-stock-fmp';

// Puppeteer 크롤러는 동적 import로만 사용 (서버리스 호환성)
// import { usStockCrawler } from './us-stock-crawler'로 직접 사용 가능

// 검증 엔진
export {
  validateAndMerge,
  logValidationSummary,
} from './validation-engine';

// 타입 정의
export type {
  StockBasicInfo,
  StockPriceData,
  StockValuationData,
  StockFinancialData,
  StockSupplyDemandData,
  StockMarketData,
  ComprehensiveStockData,
  CollectionResult,
  ValidationStatus,
  ValidationResult,
  DualSourceResult,
  ValidatedStockData,
  FieldValidationConfig,
  ValidationConfig,
  StockDataCollector,
} from './types';
