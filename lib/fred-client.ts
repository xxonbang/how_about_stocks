/**
 * FRED (Federal Reserve Economic Data) API Client
 * 연방준비제도 경제 데이터 API 클라이언트
 *
 * API 문서: https://fred.stlouisfed.org/docs/api/fred/
 * API 키 발급: https://fred.stlouisfed.org/docs/api/api-key.html
 */

import { cache } from './cache';

const FRED_API_KEY = process.env.FRED_API_KEY;
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

/**
 * FRED 매크로 경제 지표
 */
export interface FredMacroData {
  // 미국 10년물 국채 금리 (무위험 수익률 기준)
  treasuryYield10Y?: {
    value: number;
    date: string;
    trend: 'rising' | 'falling' | 'stable';
  };
  // 수익률 곡선 (10Y-2Y 스프레드) - 경기 침체 신호
  yieldCurve?: {
    value: number;
    date: string;
    isInverted: boolean; // 역전 여부 (음수이면 경기 침체 신호)
  };
  // 하이일드 스프레드 - 신용 위험 지표
  highYieldSpread?: {
    value: number;
    date: string;
    riskLevel: 'low' | 'moderate' | 'high' | 'extreme';
  };
  // 기대 인플레이션 (10년 기대 인플레이션)
  expectedInflation?: {
    value: number;
    date: string;
    level: 'low' | 'moderate' | 'high';
  };
  // 데이터 수집 메타정보
  _meta: {
    source: 'fred';
    timestamp: number;
    apiKeyConfigured: boolean;
  };
}

/**
 * FRED 시리즈 ID 정의
 */
const FRED_SERIES = {
  DGS10: 'DGS10',           // 10-Year Treasury Constant Maturity Rate
  T10Y2Y: 'T10Y2Y',         // 10-Year Treasury Minus 2-Year Treasury
  BAMLH0A0HYM2: 'BAMLH0A0HYM2', // ICE BofA US High Yield Index OAS
  T10YIE: 'T10YIE',         // 10-Year Breakeven Inflation Rate
} as const;

const CACHE_KEY = 'fred-macro-data';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간 (매크로 데이터는 일별 업데이트)

/**
 * FRED API에서 단일 시리즈 데이터 조회
 */
async function fetchFredSeries(seriesId: string): Promise<{ value: number; date: string } | null> {
  if (!FRED_API_KEY) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: FRED_API_KEY,
      file_type: 'json',
      sort_order: 'desc',
      limit: '5', // 최근 5개 (결측값 대비)
    });

    const response = await fetch(`${FRED_BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(15000), // 15초 타임아웃
    });

    if (!response.ok) {
      console.warn(`[FRED] API 응답 오류 (${seriesId}): ${response.status}`);
      return null;
    }

    const data = await response.json();
    const observations = data?.observations;

    if (!Array.isArray(observations) || observations.length === 0) {
      console.warn(`[FRED] ${seriesId}: 데이터 없음`);
      return null;
    }

    // 유효한 값을 가진 최신 관측치 찾기 ('.' 은 FRED의 결측값 표시)
    for (const obs of observations) {
      if (obs.value && obs.value !== '.') {
        const value = parseFloat(obs.value);
        if (!isNaN(value)) {
          return {
            value,
            date: obs.date,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.warn(`[FRED] ${seriesId} 조회 실패:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 하이일드 스프레드 위험 수준 판단
 * - < 3%: Low
 * - 3-5%: Moderate
 * - 5-7%: High
 * - > 7%: Extreme
 */
function assessHighYieldRisk(spread: number): 'low' | 'moderate' | 'high' | 'extreme' {
  if (spread < 3) return 'low';
  if (spread < 5) return 'moderate';
  if (spread < 7) return 'high';
  return 'extreme';
}

/**
 * 기대 인플레이션 수준 판단
 * - < 2%: Low
 * - 2-3%: Moderate
 * - > 3%: High
 */
function assessInflationLevel(rate: number): 'low' | 'moderate' | 'high' {
  if (rate < 2) return 'low';
  if (rate <= 3) return 'moderate';
  return 'high';
}

/**
 * 금리 추세 판단 (최근 값 기준)
 */
function assessTrend(current: number, previous?: number): 'rising' | 'falling' | 'stable' {
  if (previous === undefined) return 'stable';
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return 'stable';
  return diff > 0 ? 'rising' : 'falling';
}

/**
 * FRED 매크로 경제 지표 전체 조회
 */
export async function fetchFredMacroData(): Promise<FredMacroData> {
  // 캐시 확인
  const cached = cache.get<FredMacroData>(CACHE_KEY);
  if (cached) {
    console.log('[FRED] 캐시에서 반환');
    return cached;
  }

  const result: FredMacroData = {
    _meta: {
      source: 'fred',
      timestamp: Date.now(),
      apiKeyConfigured: !!FRED_API_KEY,
    },
  };

  if (!FRED_API_KEY) {
    console.warn('[FRED] API 키가 설정되지 않음 (FRED_API_KEY)');
    return result;
  }

  console.log('[FRED] 매크로 경제 지표 수집 시작');

  // 병렬로 모든 시리즈 조회
  const [dgs10, t10y2y, highYield, inflation] = await Promise.all([
    fetchFredSeries(FRED_SERIES.DGS10),
    fetchFredSeries(FRED_SERIES.T10Y2Y),
    fetchFredSeries(FRED_SERIES.BAMLH0A0HYM2),
    fetchFredSeries(FRED_SERIES.T10YIE),
  ]);

  // 10년물 국채 금리
  if (dgs10) {
    result.treasuryYield10Y = {
      value: dgs10.value,
      date: dgs10.date,
      trend: 'stable', // 단일 값으로는 추세 판단 어려움
    };
    console.log(`[FRED] DGS10 (10년물 국채 금리): ${dgs10.value}%`);
  }

  // 수익률 곡선 (10Y-2Y)
  if (t10y2y) {
    result.yieldCurve = {
      value: t10y2y.value,
      date: t10y2y.date,
      isInverted: t10y2y.value < 0,
    };
    console.log(`[FRED] T10Y2Y (수익률 곡선): ${t10y2y.value}% ${t10y2y.value < 0 ? '(역전!)' : ''}`);
  }

  // 하이일드 스프레드
  if (highYield) {
    result.highYieldSpread = {
      value: highYield.value,
      date: highYield.date,
      riskLevel: assessHighYieldRisk(highYield.value),
    };
    console.log(`[FRED] 하이일드 스프레드: ${highYield.value}% (${result.highYieldSpread.riskLevel})`);
  }

  // 기대 인플레이션
  if (inflation) {
    result.expectedInflation = {
      value: inflation.value,
      date: inflation.date,
      level: assessInflationLevel(inflation.value),
    };
    console.log(`[FRED] 기대 인플레이션: ${inflation.value}% (${result.expectedInflation.level})`);
  }

  // 캐시 저장
  cache.set(CACHE_KEY, result, CACHE_TTL);

  return result;
}

/**
 * 매크로 경제 지표 요약 (AI 분석용 텍스트)
 */
export function summarizeFredData(data: FredMacroData): string {
  const parts: string[] = [];

  if (data.treasuryYield10Y) {
    parts.push(`10년물 국채 금리: ${data.treasuryYield10Y.value}%`);
  }

  if (data.yieldCurve) {
    const inversionNote = data.yieldCurve.isInverted
      ? ' (역전 - 경기 침체 신호)'
      : '';
    parts.push(`수익률 곡선(10Y-2Y): ${data.yieldCurve.value}%${inversionNote}`);
  }

  if (data.highYieldSpread) {
    const riskLabels = {
      low: '낮음',
      moderate: '보통',
      high: '높음',
      extreme: '매우 높음',
    };
    parts.push(`하이일드 스프레드: ${data.highYieldSpread.value}% (신용위험 ${riskLabels[data.highYieldSpread.riskLevel]})`);
  }

  if (data.expectedInflation) {
    const levelLabels = {
      low: '낮음',
      moderate: '적정',
      high: '높음',
    };
    parts.push(`기대 인플레이션: ${data.expectedInflation.value}% (${levelLabels[data.expectedInflation.level]})`);
  }

  if (parts.length === 0) {
    return '매크로 경제 지표 데이터 없음';
  }

  return parts.join(' | ');
}

/**
 * 투자 인사이트 생성
 */
export function generateMacroInsights(data: FredMacroData): string[] {
  const insights: string[] = [];

  // 수익률 곡선 역전 경고
  if (data.yieldCurve?.isInverted) {
    insights.push('수익률 곡선이 역전되어 있습니다. 과거 사례에서 이는 경기 침체의 선행 지표로 작용했습니다.');
  }

  // 하이일드 스프레드 경고
  if (data.highYieldSpread) {
    if (data.highYieldSpread.riskLevel === 'extreme') {
      insights.push('하이일드 스프레드가 7%를 초과하여 신용 시장에 심각한 스트레스가 있음을 나타냅니다.');
    } else if (data.highYieldSpread.riskLevel === 'high') {
      insights.push('하이일드 스프레드가 상승하여 신용 위험이 증가하고 있습니다.');
    }
  }

  // 인플레이션 경고
  if (data.expectedInflation) {
    if (data.expectedInflation.level === 'high') {
      insights.push('기대 인플레이션이 3%를 초과하여 금리 인상 압력이 존재합니다.');
    }
  }

  // 금리 환경
  if (data.treasuryYield10Y) {
    if (data.treasuryYield10Y.value > 4.5) {
      insights.push('10년물 국채 금리가 높아 주식 대비 채권의 상대적 매력이 증가했습니다.');
    }
  }

  return insights;
}
