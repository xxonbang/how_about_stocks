/**
 * Fear & Greed Index Client
 * CNN Fear & Greed API 연동 및 자체 계산 로직
 */

import { cache, CACHE_TTL } from './cache';

export interface FearGreedData {
  value: number;                    // 0-100 지수
  interpretation: FearGreedLevel;   // 해석
  source: 'cnn' | 'calculated';     // 데이터 출처
  components?: {                    // 자체 계산 시 구성요소
    vix?: number;
    sp500Rsi?: number;
    momentum?: number;
  };
  timestamp: number;
}

export type FearGreedLevel =
  | 'extreme_fear'    // 0-25: 극단적 공포
  | 'fear'            // 25-45: 공포
  | 'neutral'         // 45-55: 중립
  | 'greed'           // 55-75: 탐욕
  | 'extreme_greed';  // 75-100: 극단적 탐욕

const CACHE_KEY = 'fear-greed-index';

/**
 * Fear & Greed 지수 해석
 */
function interpretFearGreed(value: number): FearGreedLevel {
  if (value <= 25) return 'extreme_fear';
  if (value <= 45) return 'fear';
  if (value <= 55) return 'neutral';
  if (value <= 75) return 'greed';
  return 'extreme_greed';
}

/**
 * Fear & Greed 해석을 한국어로 변환
 */
export function getFearGreedLabel(level: FearGreedLevel): string {
  const labels: Record<FearGreedLevel, string> = {
    extreme_fear: '극단적 공포',
    fear: '공포',
    neutral: '중립',
    greed: '탐욕',
    extreme_greed: '극단적 탐욕',
  };
  return labels[level];
}

/**
 * CNN Fear & Greed API 호출
 * @returns Fear & Greed 데이터 또는 null (실패 시)
 */
async function fetchFromCNN(): Promise<FearGreedData | null> {
  try {
    // CNN Fear & Greed API 엔드포인트
    const url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10초 타임아웃
    });

    if (!response.ok) {
      console.warn(`[FearGreed] CNN API 응답 오류: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // CNN API 응답 구조 파싱
    // { fear_and_greed: { score: number, rating: string, ... } }
    const score = data?.fear_and_greed?.score;

    if (typeof score !== 'number' || isNaN(score)) {
      console.warn('[FearGreed] CNN API 응답에서 score를 찾을 수 없음');
      return null;
    }

    return {
      value: Math.round(score),
      interpretation: interpretFearGreed(score),
      source: 'cnn',
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn('[FearGreed] CNN API 호출 실패:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 대체 CNN 엔드포인트 시도
 */
async function fetchFromCNNAlternative(): Promise<FearGreedData | null> {
  try {
    // 대체 엔드포인트
    const url = 'https://production.dataviz.cnn.io/index/fearandgreed/current';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const score = data?.score ?? data?.value ?? data?.fear_and_greed?.score;

    if (typeof score !== 'number' || isNaN(score)) {
      return null;
    }

    return {
      value: Math.round(score),
      interpretation: interpretFearGreed(score),
      source: 'cnn',
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * VIX 기반 Fear & Greed 자체 계산
 * VIX가 높을수록 공포, 낮을수록 탐욕
 *
 * VIX 범위 기준:
 * - VIX < 12: Extreme Greed (90-100)
 * - VIX 12-15: Greed (65-89)
 * - VIX 15-20: Neutral (45-64)
 * - VIX 20-30: Fear (20-44)
 * - VIX > 30: Extreme Fear (0-19)
 */
function calculateFromVIX(vix: number): number {
  if (vix < 12) {
    // VIX 8-12 → Fear&Greed 90-100
    return Math.min(100, 90 + (12 - vix) * 2.5);
  } else if (vix < 15) {
    // VIX 12-15 → Fear&Greed 65-89
    return 89 - ((vix - 12) / 3) * 24;
  } else if (vix < 20) {
    // VIX 15-20 → Fear&Greed 45-64
    return 64 - ((vix - 15) / 5) * 19;
  } else if (vix < 30) {
    // VIX 20-30 → Fear&Greed 20-44
    return 44 - ((vix - 20) / 10) * 24;
  } else {
    // VIX 30+ → Fear&Greed 0-19
    return Math.max(0, 19 - (vix - 30) * 0.5);
  }
}

/**
 * S&P 500 RSI 기반 계산 (RSI 14일 기준)
 * RSI가 높을수록 탐욕, 낮을수록 공포
 */
function calculateFromRSI(rsi: number): number {
  // RSI 0-100을 Fear&Greed 0-100으로 변환
  // RSI 30 이하: Fear (RSI 30 → F&G 30)
  // RSI 70 이상: Greed (RSI 70 → F&G 70)
  return Math.min(100, Math.max(0, rsi));
}

/**
 * 자체 계산 방식으로 Fear & Greed Index 산출
 * - VIX 가중치: 50%
 * - S&P500 RSI 가중치: 50%
 */
async function calculateFearGreed(vix?: number, sp500Rsi?: number): Promise<FearGreedData | null> {
  const components: FearGreedData['components'] = {};
  let totalWeight = 0;
  let weightedSum = 0;

  // VIX 기반 계산 (가중치 50%)
  if (typeof vix === 'number' && !isNaN(vix) && vix > 0) {
    const vixScore = calculateFromVIX(vix);
    components.vix = vixScore;
    weightedSum += vixScore * 0.5;
    totalWeight += 0.5;
  }

  // RSI 기반 계산 (가중치 50%)
  if (typeof sp500Rsi === 'number' && !isNaN(sp500Rsi)) {
    const rsiScore = calculateFromRSI(sp500Rsi);
    components.sp500Rsi = rsiScore;
    weightedSum += rsiScore * 0.5;
    totalWeight += 0.5;
  }

  // 최소한 하나의 데이터가 있어야 계산 가능
  if (totalWeight === 0) {
    console.warn('[FearGreed] 자체 계산을 위한 데이터 부족');
    return null;
  }

  // 가중 평균 계산 (가용 데이터 기준으로 정규화)
  const value = Math.round(weightedSum / totalWeight);

  return {
    value,
    interpretation: interpretFearGreed(value),
    source: 'calculated',
    components,
    timestamp: Date.now(),
  };
}

/**
 * Fear & Greed Index 조회 (메인 함수)
 * 1순위: CNN API
 * 2순위: 자체 계산 (VIX + RSI 기반)
 *
 * @param vix VIX 지수 (자체 계산용)
 * @param sp500Rsi S&P500 RSI (자체 계산용)
 */
export async function fetchFearGreedIndex(
  vix?: number,
  sp500Rsi?: number
): Promise<FearGreedData | null> {
  // 캐시 확인
  const cached = cache.get<FearGreedData>(CACHE_KEY);
  if (cached) {
    console.log('[FearGreed] 캐시에서 반환');
    return cached;
  }

  // 1순위: CNN API 시도
  let result = await fetchFromCNN();

  // 1순위 실패 시 대체 엔드포인트 시도
  if (!result) {
    result = await fetchFromCNNAlternative();
  }

  // CNN 실패 시 자체 계산
  if (!result) {
    console.log('[FearGreed] CNN API 실패, 자체 계산 시도');
    result = await calculateFearGreed(vix, sp500Rsi);
  }

  // 성공 시 캐시 저장 (30분)
  if (result) {
    cache.set(CACHE_KEY, result, 30 * 60 * 1000);
    console.log(`[FearGreed] ${result.source === 'cnn' ? 'CNN API' : '자체 계산'} 성공: ${result.value} (${result.interpretation})`);
  }

  return result;
}

/**
 * Fear & Greed 지수만 숫자로 반환 (기존 인터페이스 호환용)
 */
export async function getFearGreedValue(vix?: number, sp500Rsi?: number): Promise<number | null> {
  const data = await fetchFearGreedIndex(vix, sp500Rsi);
  return data?.value ?? null;
}
