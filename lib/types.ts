/**
 * 분석 기간 타입
 */
export type AnalysisPeriod = '1d' | '1w' | '1m' | '3m' | '6m' | '1y';

/**
 * 분석 요청 타입
 */
export interface AnalyzeRequest {
  stocks: string[];
  period: AnalysisPeriod; // 종목별 향후 전망 분석 기간
  historicalPeriod: AnalysisPeriod; // 종목별 과거 이력 분석 기간
  analysisDate: string; // 분석 기준일 (YYYY-MM-DD 형식)
  indicators: {
    rsi: boolean;
    movingAverages: boolean;
    disparity: boolean;
    supplyDemand: boolean;
    fearGreed: boolean;
    exchangeRate: boolean;
    // Phase 1 지표
    etfPremium?: boolean; // ETF 괴리율
    bollingerBands?: boolean; // 볼린저 밴드
    volatility?: boolean; // 변동성
    volumeIndicators?: boolean; // 거래량 지표
    // Phase 2 지표
    supportLevel?: boolean; // 눌림목 여부
    supportResistance?: boolean; // 저항선/지지선
    // Phase 3 지표
    macd?: boolean; // MACD
    stochastic?: boolean; // 스토캐스틱
  };
}

/**
 * 분석 결과 타입
 */
export interface AnalyzeResult {
  symbol: string;
  name?: string; // 종목명 (표시용)
  period?: string; // 향후 전망 분석 기간 (한국어)
  historicalPeriod?: string; // 과거 이력 분석 기간 (한국어)
  selectedIndicators?: AnalyzeRequest['indicators']; // 선택된 지표 정보 (일반 종목에서 ETF 괴리율 선택 시 메시지 표시용)
  marketData: {
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    marketCap?: number;
    rsi?: number;
    movingAverages?: {
      ma5: number;
      ma20: number;
      ma60: number;
      ma120: number;
    };
    disparity?: number;
    supplyDemand?: {
      institutional: number;
      foreign: number;
      individual: number;
    };
    fearGreedIndex?: number;
    vix?: number;
    exchangeRate?: number;
    news?: Array<{
      title: string;
      link: string;
      date: string;
    }>;
    // Phase 1 지표
    etfPremium?: {
      premium: number;
      isPremium: boolean;
      isDiscount: boolean;
    };
    bollingerBands?: {
      upper: number;
      middle: number;
      lower: number;
      bandwidth: number;
      position: number;
    };
    volatility?: {
      volatility: number;
      annualizedVolatility: number;
      volatilityRank: 'low' | 'medium' | 'high';
    };
    volumeIndicators?: {
      currentVolume: number; // 현재 거래량 (최신)
      averageVolume: number; // 평균 거래량 (최근 20일)
      volumeRatio: number; // 현재 거래량 / 평균 거래량
      isHighVolume: boolean; // 고거래량 여부 (1.5배 이상)
      volumeTrend: 'increasing' | 'decreasing' | 'stable'; // 거래량 추세
    };
    // Phase 2 지표
    supportLevel?: {
      isNearSupport: boolean;
      supportLevel: number;
      distanceFromSupport: number;
    };
    supportResistance?: {
      resistanceLevels: number[];
      supportLevels: number[];
      resistanceDates: string[];
      supportDates: string[];
      currentPosition: 'near_resistance' | 'near_support' | 'middle';
    };
    // Phase 3 지표
    macd?: {
      macd: number; // MACD Line (현재값)
      signal: number; // Signal Line (현재값)
      histogram: number; // Histogram (현재값)
      trend: 'bullish' | 'bearish' | 'neutral'; // 추세 판단
      crossover: 'golden' | 'death' | 'none'; // 크로스오버 신호
    };
    stochastic?: {
      k: number; // %K (현재값)
      d: number; // %D (현재값)
      zone: 'overbought' | 'oversold' | 'neutral'; // 과매수/과매도 영역
      signal: 'buy' | 'sell' | 'none'; // 매매 신호
    };
  };
  historicalData?: Array<{
    date: string;
    close: number;
    volume: number;
    high?: number;
    low?: number;
    open?: number;
  }>;
  aiReport: string;
}

export interface AnalyzeResponse {
  results: AnalyzeResult[];
  error?: string;
  invalidStocks?: string[];
  _metadata?: {
    dataCollection: number;
    indicatorCalculation: number;
    aiAnalysis: number;
    reportGeneration: number;
    total: number;
    stockCount: number;
    // Saveticker 정보
    savetickerIncluded?: boolean;
    savetickerReport?: {
      title: string;
      date: string;
    } | null;
    // 토큰 사용량 (admin 전용)
    tokenUsage?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    } | null;
  };
}
