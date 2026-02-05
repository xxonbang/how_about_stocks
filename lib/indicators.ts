/**
 * 추가 기술적 지표 계산 함수들
 * Phase 1 & Phase 2 지표 구현
 */

// ===== 유틸리티 함수 =====

/**
 * 부동소수점 비교를 위한 epsilon 기반 동등 비교
 * @param a 첫 번째 숫자
 * @param b 두 번째 숫자
 * @param epsilon 허용 오차 (기본값: 0.01, 가격 비교에 적합)
 */
function floatEquals(a: number, b: number, epsilon: number = 0.01): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * 날짜 문자열을 ISO 8601 형식(YYYY-MM-DD)으로 정규화
 * @param dateStr 원본 날짜 문자열
 * @returns ISO 8601 형식 날짜 또는 빈 문자열 (파싱 실패 시)
 */
function normalizeDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') {
    return '';
  }

  try {
    // 이미 ISO 형식인 경우
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // 다양한 형식 처리
    const cleaned = dateStr.trim();

    // YYYY.MM.DD 또는 YYYY/MM/DD 형식
    const dotMatch = cleaned.match(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})$/);
    if (dotMatch) {
      const [, year, month, day] = dotMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Date 객체로 파싱 시도
    const dateObj = new Date(cleaned);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split('T')[0];
    }

    console.warn('[normalizeDate] Unable to parse date:', dateStr);
    return '';
  } catch (e) {
    console.warn('[normalizeDate] Date parsing error:', dateStr, e);
    return '';
  }
}

// ===== 지표 계산 함수 =====

/**
 * ETF 괴리율 계산
 * 괴리율(%) = ((시장 가격 - NAV) / NAV) × 100
 */
export function calculateETFPremium(
  currentPrice: number,
  nav: number
): {
  premium: number; // 괴리율 (%)
  isPremium: boolean; // 프리미엄 여부
  isDiscount: boolean; // 할인 여부
} {
  if (nav === 0 || isNaN(nav) || nav === null || nav === undefined) {
    return { premium: 0, isPremium: false, isDiscount: false };
  }
  
  const premium = ((currentPrice - nav) / nav) * 100;
  const isPremium = premium > 0;
  const isDiscount = premium < 0;
  
  return {
    premium: Math.round(premium * 100) / 100,
    isPremium,
    isDiscount,
  };
}

/**
 * 볼린저 밴드 계산
 * - 중심선: 20일 이동평균
 * - 상단 밴드: 중심선 + (표준편차 × 2)
 * - 하단 밴드: 중심선 - (표준편차 × 2)
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  multiplier: number = 2,
  currentPrice?: number // 현재가 (별도 전달 시 사용)
): {
  upper: number; // 상단 밴드
  middle: number; // 중심선 (이동평균)
  lower: number; // 하단 밴드
  bandwidth: number; // 밴드폭 (%)
  position: number; // 현재가 위치 (0-1, 0=하단, 1=상단)
} {
  if (prices.length < period) {
    const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : prices[0] || 0;
    const price = currentPrice !== undefined ? currentPrice : (prices.length > 0 ? prices[prices.length - 1] : avg);
    return {
      upper: avg,
      middle: avg,
      lower: avg,
      bandwidth: 0,
      position: 0.5,
    };
  }
  
  // prices 배열은 "과거 → 최신" 순서이므로, 최근 period일은 slice(-period)로 가져옴
  const recentPrices = prices.slice(-period);
  const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  // 표준편차 계산
  const variance = recentPrices.reduce((sum, price) => {
    return sum + Math.pow(price - middle, 2);
  }, 0) / period;
  const stdDev = Math.sqrt(variance);
  
  const upper = middle + (stdDev * multiplier);
  const lower = middle - (stdDev * multiplier);
  const bandwidth = upper - lower > 0 ? ((upper - lower) / middle) * 100 : 0;
  
  // 현재가는 별도 전달받았으면 사용, 없으면 배열의 마지막 값(최신 가격) 사용
  const price = currentPrice !== undefined ? currentPrice : prices[prices.length - 1];
  const position = upper - lower > 0 ? (price - lower) / (upper - lower) : 0.5;
  
  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    bandwidth: Math.round(bandwidth * 100) / 100,
    position: Math.max(0, Math.min(1, Math.round(position * 100) / 100)),
  };
}

/**
 * 변동성 계산 (표준편차 기반)
 * @param prices 종가 배열 (과거 → 최신 순서)
 * @param period 계산 기간 (기본 20일)
 * @param useLogReturns 로그 수익률 사용 여부 (기본 true, 극단적 변동에 더 정확)
 */
export function calculateVolatility(
  prices: number[],
  period: number = 20,
  useLogReturns: boolean = true
): {
  volatility: number; // 변동성 (%)
  annualizedVolatility: number; // 연율화 변동성 (%)
  volatilityRank: 'low' | 'medium' | 'high'; // 변동성 등급
} {
  if (prices.length < period || prices.length < 2) {
    return {
      volatility: 0,
      annualizedVolatility: 0,
      volatilityRank: 'low',
    };
  }

  // prices 배열은 "과거 → 최신" 순서이므로, 최근 period일은 slice(-period)로 가져옴
  const recentPrices = prices.slice(-period);
  const returns: number[] = [];

  // 수익률 계산
  // recentPrices는 "과거 → 최신" 순서이므로, i-1이 어제, i가 오늘
  for (let i = 1; i < recentPrices.length; i++) {
    if (recentPrices[i - 1] > 0 && recentPrices[i] > 0) {
      let returnRate: number;
      if (useLogReturns) {
        // 로그 수익률: ln(오늘가격 / 어제가격)
        // 극단적 가격 변동에서 더 정확하고, 수학적으로 시간 가산성을 가짐
        returnRate = Math.log(recentPrices[i] / recentPrices[i - 1]);
      } else {
        // 단순 수익률: (오늘가격 - 어제가격) / 어제가격
        returnRate = (recentPrices[i] - recentPrices[i - 1]) / recentPrices[i - 1];
      }
      returns.push(returnRate);
    }
  }

  if (returns.length === 0) {
    return {
      volatility: 0,
      annualizedVolatility: 0,
      volatilityRank: 'low',
    };
  }

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => {
    return sum + Math.pow(ret - meanReturn, 2);
  }, 0) / returns.length;

  const stdDev = Math.sqrt(variance);
  const volatility = stdDev * 100; // %
  const annualizedVolatility = volatility * Math.sqrt(252); // 연율화 (252 거래일)

  const volatilityRank =
    annualizedVolatility < 15 ? 'low' :
    annualizedVolatility < 30 ? 'medium' :
    'high';

  return {
    volatility: Math.round(volatility * 100) / 100,
    annualizedVolatility: Math.round(annualizedVolatility * 100) / 100,
    volatilityRank,
  };
}

/**
 * 거래량 지표 계산
 * volumes 배열은 "과거 → 최신" 순서로 정렬되어 있음을 가정
 * @param volumes 과거 거래량 배열 (과거 → 최신 순서)
 * @param period 평균 계산 기간 (기본 20일)
 * @param latestVolume 최신 거래량 (quote에서 가져온 값, 선택사항)
 */
export function calculateVolumeIndicators(
  volumes: number[],
  period: number = 20,
  latestVolume?: number // quote에서 가져온 최신 거래량
): {
  currentVolume: number; // 현재 거래량 (최신)
  averageVolume: number; // 평균 거래량 (최근 period일)
  volumeRatio: number; // 현재 거래량 / 평균 거래량
  isHighVolume: boolean; // 고거래량 여부 (1.5배 이상)
  volumeTrend: 'increasing' | 'decreasing' | 'stable'; // 거래량 추세
} {
  if (volumes.length === 0) {
    return {
      currentVolume: latestVolume || 0,
      averageVolume: 0,
      volumeRatio: 1,
      isHighVolume: false,
      volumeTrend: 'stable',
    };
  }

  // latestVolume이 제공되면 우선 사용, 없으면 volumes 배열의 마지막 요소 사용
  // volumes 배열은 "과거 → 최신" 순서이므로, 마지막 요소가 최신 거래량
  const historicalLatestVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
  const currentVolume = latestVolume !== undefined ? latestVolume : historicalLatestVolume;

  // 데이터 일관성 검증: quote와 historical 간 큰 차이가 있으면 경고
  if (latestVolume !== undefined && historicalLatestVolume > 0) {
    const discrepancyRatio = Math.abs(latestVolume - historicalLatestVolume) / historicalLatestVolume;
    if (discrepancyRatio > 0.5) { // 50% 이상 차이나면 경고
      console.warn(`[VolumeIndicators] Data discrepancy detected: quote=${latestVolume}, historical=${historicalLatestVolume}, diff=${(discrepancyRatio * 100).toFixed(1)}%`);
    }
    console.log(`[VolumeIndicators] Using latestVolume from quote: ${latestVolume}, historical latest: ${historicalLatestVolume}`);
  }
  
  if (volumes.length < period) {
    // 데이터가 부족한 경우, 전체 데이터의 평균 사용
    const averageVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeRatio = averageVolume > 0 ? currentVolume / averageVolume : 1;
    console.log(`[VolumeIndicators] Data insufficient (${volumes.length} < ${period}), currentVolume: ${currentVolume}, averageVolume: ${averageVolume}, ratio: ${volumeRatio}`);
    return {
      currentVolume,
      averageVolume: Math.round(averageVolume),
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      isHighVolume: volumeRatio >= 1.5,
      volumeTrend: 'stable',
    };
  }
  
  // 최근 period일의 거래량 (배열의 마지막 period개)
  const recentVolumes = volumes.slice(-period);
  const averageVolume = recentVolumes.reduce((a, b) => a + b, 0) / period;
  const volumeRatio = averageVolume > 0 ? currentVolume / averageVolume : 1;
  
  // 디버깅 로그
  console.log(`[VolumeIndicators] currentVolume: ${currentVolume}, averageVolume: ${averageVolume}, ratio: ${volumeRatio.toFixed(2)}`);
  
  const isHighVolume = volumeRatio >= 1.5;
  
  // 거래량 추세 (최근 5일: 배열의 마지막 5개)
  const recent5 = volumes.slice(-Math.min(5, volumes.length));
  if (recent5.length < 2) {
    return {
      currentVolume,
      averageVolume: Math.round(averageVolume),
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      isHighVolume,
      volumeTrend: 'stable',
    };
  }
  
  // recent5는 "과거 → 최신" 순서이므로, 첫 번째가 5일 전, 마지막이 오늘
  const oldest = recent5[0]; // 5일 전
  const newest = recent5[recent5.length - 1]; // 오늘
  const volumeTrend = 
    newest > oldest * 1.1 ? 'increasing' :
    newest < oldest * 0.9 ? 'decreasing' :
    'stable';
  
  return {
    currentVolume,
    averageVolume: Math.round(averageVolume),
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    isHighVolume,
    volumeTrend,
  };
}

/**
 * 눌림목 여부 판단
 * - 최근 N일간의 저점들을 찾아 지지선 형성 여부 확인
 * - 현재가가 지지선 근처에 있는지 확인
 */
export function detectSupportLevel(
  historicalData: Array<{ date: string; close: number; low?: number }>,
  currentPrice: number,
  period: number = 20
): {
  isNearSupport: boolean;
  supportLevel: number;
  distanceFromSupport: number; // %
} {
  if (historicalData.length < period) {
    return {
      isNearSupport: false,
      supportLevel: currentPrice,
      distanceFromSupport: 0,
    };
  }
  
  // historicalData는 "과거 → 최신" 순서이므로, 최근 period일은 slice(-period)로 가져옴
  // 최근 N일간의 저점들 추출
  const recentData = historicalData.slice(-period);
  const lows = recentData
    .map(d => d.low || d.close)
    .filter(l => l > 0);
  
  if (lows.length === 0) {
    return {
      isNearSupport: false,
      supportLevel: currentPrice,
      distanceFromSupport: 0,
    };
  }
  
  const minLow = Math.min(...lows);
  const supportLevel = minLow;
  const distanceFromSupport = ((currentPrice - supportLevel) / supportLevel) * 100;
  
  // 지지선 근처 (5% 이내)에 있으면 눌림목으로 판단
  const isNearSupport = distanceFromSupport >= -5 && distanceFromSupport <= 5;
  
  return {
    isNearSupport,
    supportLevel: Math.round(supportLevel * 100) / 100,
    distanceFromSupport: Math.round(distanceFromSupport * 100) / 100,
  };
}

/**
 * 저항선/지지선 계산
 * - 저항선: 최근 N일간의 고점들
 * - 지지선: 최근 N일간의 저점들
 */
export function calculateSupportResistance(
  historicalData: Array<{ date: string; close: number; high?: number; low?: number }>,
  period: number = 60
): {
  resistanceLevels: number[]; // 저항선 레벨들
  supportLevels: number[]; // 지지선 레벨들
  resistanceDates: string[]; // 저항선 날짜들
  supportDates: string[]; // 지지선 날짜들
  currentPosition: 'near_resistance' | 'near_support' | 'middle'; // 현재 위치
} {
  if (historicalData.length < period) {
    // 데이터가 부족하면 전체 데이터 사용
    const currentPrice = historicalData.length > 0 
      ? historicalData[historicalData.length - 1].close 
      : 0;
    const currentDate = historicalData.length > 0 
      ? historicalData[historicalData.length - 1].date 
      : '';
    return {
      resistanceLevels: [currentPrice],
      supportLevels: [currentPrice],
      resistanceDates: [currentDate],
      supportDates: [currentDate],
      currentPosition: 'middle',
    };
  }
  
  // historicalData는 "과거 → 최신" 순서이므로, 최근 period일은 slice(-period)로 가져옴
  const recentData = historicalData.slice(-period);
  
  // 디버깅: historicalData 구조 확인
  if (recentData.length > 0) {
    console.log('[calculateSupportResistance] Sample historicalData:', {
      first: recentData[0],
      last: recentData[recentData.length - 1],
      hasHigh: recentData[0].high !== undefined,
      hasLow: recentData[0].low !== undefined,
      dateFormat: recentData[0].date
    });
  }
  
  // 고점/저점 추출 (날짜 정보 포함)
  // 같은 가격이 여러 날짜에 있을 경우를 대비하여, 각 가격에 대해 가장 최근 날짜를 매핑
  const highDataMap = new Map<number, { value: number; date: string }>();
  const lowDataMap = new Map<number, { value: number; date: string }>();
  
  for (const d of recentData) {
    const highValue = d.high !== undefined && d.high !== null ? d.high : d.close;
    const lowValue = d.low !== undefined && d.low !== null ? d.low : d.close;
    const date = d.date || '';
    
    if (highValue > 0 && date) {
      const roundedHigh = Math.round(highValue * 100) / 100;
      const existing = highDataMap.get(roundedHigh);
      if (!existing || new Date(date).getTime() > new Date(existing.date).getTime()) {
        // 같은 가격이 없거나, 더 최근 날짜면 업데이트
        highDataMap.set(roundedHigh, { value: roundedHigh, date });
      }
    }
    
    if (lowValue > 0 && date) {
      const roundedLow = Math.round(lowValue * 100) / 100;
      const existing = lowDataMap.get(roundedLow);
      if (!existing || new Date(date).getTime() > new Date(existing.date).getTime()) {
        // 같은 가격이 없거나, 더 최근 날짜면 업데이트
        lowDataMap.set(roundedLow, { value: roundedLow, date });
      }
    }
  }
  
  const highData = Array.from(highDataMap.values());
  const lowData = Array.from(lowDataMap.values());
  
  // 디버깅: 추출된 데이터 확인
  console.log('[calculateSupportResistance] Extracted data:', {
    highDataCount: highData.length,
    lowDataCount: lowData.length,
    highDataSample: highData.slice(0, 3),
    lowDataSample: lowData.slice(0, 3)
  });
  
  if (highData.length === 0 || lowData.length === 0) {
    const currentPrice = recentData.length > 0 
      ? recentData[recentData.length - 1].close 
      : 0;
    const currentDate = recentData.length > 0 
      ? recentData[recentData.length - 1].date 
      : '';
    return {
      resistanceLevels: [currentPrice],
      supportLevels: [currentPrice],
      resistanceDates: [currentDate],
      supportDates: [currentDate],
      currentPosition: 'middle',
    };
  }
  
  // 저항선: 고점들 중 상위 3개 (날짜 정보 포함)
  // 같은 가격이 여러 날짜에 있을 경우, 가장 최근 날짜를 우선 선택
  const sortedHighs = [...highData].sort((a, b) => {
    // epsilon 기반 부동소수점 비교
    if (!floatEquals(b.value, a.value)) {
      return b.value - a.value; // 가격 내림차순
    }
    // 가격이 같으면 날짜 내림차순 (최신 날짜 우선)
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // 중복 가격 제거 (같은 가격 중 가장 최근 날짜만 유지)
  // epsilon 기반 비교로 비슷한 가격도 중복으로 처리
  const uniqueHighs: Array<{ value: number; date: string }> = [];
  for (const high of sortedHighs) {
    const isDuplicate = uniqueHighs.some(existing =>
      floatEquals(existing.value, high.value)
    );
    if (!isDuplicate) {
      uniqueHighs.push(high);
    }
  }
  
  const top3Highs = uniqueHighs.slice(0, 3);
  const resistanceLevels = top3Highs.map(h => Math.round(h.value * 100) / 100);
  
  // 각 저항선 레벨에 대해 recentData에서 해당 가격과 일치하는 모든 날짜를 찾아 가장 최근 날짜 선택
  const resistanceDates = top3Highs.map((h, idx) => {
    // recentData에서 해당 가격과 일치하는 모든 날짜 찾기 (epsilon 기반 비교)
    const matchingDates = recentData
      .map(d => ({
        date: d.date,
        highValue: d.high !== undefined && d.high !== null ? d.high : d.close,
      }))
      .filter(d => floatEquals(d.highValue, h.value))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // 최신 날짜 우선

    // 가장 최근 날짜 선택
    const mostRecentDate = matchingDates.length > 0 ? matchingDates[0].date : h.date;

    // 디버깅: 날짜 선택 과정 확인
    if (matchingDates.length > 1) {
      console.log(`[calculateSupportResistance] Resistance level ${idx + 1} (${h.value}): Found ${matchingDates.length} matching dates, using most recent: ${mostRecentDate} (was: ${h.date})`);
    }

    const dateStr = mostRecentDate || '';
    // 날짜 형식 정규화
    if (!dateStr) {
      console.error(`[calculateSupportResistance] Empty date for resistance level ${idx + 1}:`, h);
      // 날짜가 없으면 recentData에서 해당 가격과 일치하는 모든 날짜 찾기
      const matchingDataList = recentData
        .map(d => ({
          date: d.date,
          highValue: d.high !== undefined && d.high !== null ? d.high : d.close,
        }))
        .filter(d => floatEquals(d.highValue, h.value))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (matchingDataList.length > 0 && matchingDataList[0].date) {
        console.log(`[calculateSupportResistance] Found matching date from recentData (${matchingDataList.length} matches):`, matchingDataList[0].date);
        return normalizeDate(matchingDataList[0].date);
      }
      return '';
    }
    // normalizeDate 함수를 사용하여 ISO 형식으로 정규화
    return normalizeDate(dateStr);
  });
  
  // 지지선: 저점들 중 하위 3개 (날짜 정보 포함)
  // 같은 가격이 여러 날짜에 있을 경우, 가장 최근 날짜를 우선 선택
  const sortedLows = [...lowData].sort((a, b) => {
    if (!floatEquals(a.value, b.value)) {
      return a.value - b.value; // 가격 오름차순
    }
    // 가격이 같으면 날짜 내림차순 (최신 날짜 우선)
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // 중복 가격 제거 (같은 가격 중 가장 최근 날짜만 유지)
  // Set 대신 floatEquals를 사용한 중복 검사
  const uniqueLows: Array<{ value: number; date: string }> = [];
  for (const low of sortedLows) {
    const isDuplicate = uniqueLows.some(existing => floatEquals(existing.value, low.value));
    if (!isDuplicate) {
      uniqueLows.push(low);
    }
  }
  
  const bottom3Lows = uniqueLows.slice(0, 3);
  const supportLevels = bottom3Lows.map(l => Math.round(l.value * 100) / 100);
  
  // 각 지지선 레벨에 대해 recentData에서 해당 가격과 일치하는 모든 날짜를 찾아 가장 최초 발생일 선택
  // 지지선은 가격 오름차순(1차=가장 낮은 가격)이므로, 날짜도 오름차순(1차=가장 오래된 날짜)으로 정렬하여 일관성 유지
  const supportDates = bottom3Lows.map((l, idx) => {
    // recentData에서 해당 가격과 일치하는 모든 날짜 찾기
    const matchingDates = recentData
      .map(d => ({
        date: d.date,
        lowValue: d.low !== undefined && d.low !== null ? d.low : d.close,
      }))
      .filter(d => floatEquals(d.lowValue, l.value))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // 최초 발생일 우선 (오름차순)
    
    // 가장 최초 발생일 선택
    const firstOccurrenceDate = matchingDates.length > 0 ? matchingDates[0].date : l.date;
    
    // 디버깅: 날짜 선택 과정 확인
    if (matchingDates.length > 1) {
      console.log(`[calculateSupportResistance] Support level ${idx + 1} (${l.value}): Found ${matchingDates.length} matching dates, using first occurrence: ${firstOccurrenceDate} (was: ${l.date})`);
    }
    
    const dateStr = firstOccurrenceDate || '';
    // 날짜 형식 확인 및 정규화
    if (!dateStr) {
      console.error(`[calculateSupportResistance] Empty date for support level ${idx + 1}:`, l);
      return '';
    }
    // normalizeDate 함수를 사용하여 ISO 형식으로 정규화
    return normalizeDate(dateStr);
  });
  
  // 최종 결과 로깅
  console.log('[calculateSupportResistance] Final result:', {
    resistanceLevels,
    resistanceDates,
    supportLevels,
    supportDates
  });
  
  // 현재가는 최신 데이터의 종가 (배열의 마지막 요소)
  const currentPrice = recentData[recentData.length - 1].close;
  const nearestResistance = Math.min(...resistanceLevels);
  const nearestSupport = Math.max(...supportLevels);
  
  const distanceToResistance = ((nearestResistance - currentPrice) / currentPrice) * 100;
  const distanceToSupport = ((currentPrice - nearestSupport) / currentPrice) * 100;
  
  const currentPosition = 
    distanceToResistance <= 3 ? 'near_resistance' :
    distanceToSupport <= 3 ? 'near_support' :
    'middle';
  
  return {
    resistanceLevels,
    supportLevels,
    resistanceDates,
    supportDates,
    currentPosition,
  };
}

/**
 * EMA (지수이동평균) 계산
 * @param prices 종가 배열 (과거 → 최신 순서)
 * @param period EMA 기간
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  if (prices.length < period) {
    // 데이터 부족 시 SMA로 대체
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return prices.map(() => avg);
  }

  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // 첫 EMA는 SMA로 시작
  const firstSMA = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      // period 이전에는 SMA 사용
      const slice = prices.slice(0, i + 1);
      ema.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    } else if (i === period - 1) {
      ema.push(firstSMA);
    } else {
      // EMA = (현재가 - 이전 EMA) × multiplier + 이전 EMA
      const prevEMA = ema[i - 1];
      const currentEMA = (prices[i] - prevEMA) * multiplier + prevEMA;
      ema.push(currentEMA);
    }
  }

  return ema;
}

/**
 * MACD (Moving Average Convergence Divergence) 계산
 * MACD Line = 12일 EMA - 26일 EMA
 * Signal Line = MACD Line의 9일 EMA
 * Histogram = MACD Line - Signal Line
 *
 * @param prices 종가 배열 (과거 → 최신 순서)
 * @param fastPeriod 단기 EMA 기간 (기본 12일)
 * @param slowPeriod 장기 EMA 기간 (기본 26일)
 * @param signalPeriod 시그널 EMA 기간 (기본 9일)
 */
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): {
  macd: number; // MACD Line (현재값)
  signal: number; // Signal Line (현재값)
  histogram: number; // Histogram (현재값)
  macdLine: number[]; // MACD Line 전체 배열
  signalLine: number[]; // Signal Line 전체 배열
  histogramLine: number[]; // Histogram 전체 배열
  trend: 'bullish' | 'bearish' | 'neutral'; // 추세 판단
  crossover: 'golden' | 'death' | 'none'; // 크로스오버 신호
} {
  const defaultResult = {
    macd: 0,
    signal: 0,
    histogram: 0,
    macdLine: [],
    signalLine: [],
    histogramLine: [],
    trend: 'neutral' as const,
    crossover: 'none' as const,
  };

  if (prices.length < slowPeriod + signalPeriod) {
    return defaultResult;
  }

  // EMA 계산
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  // MACD Line = Fast EMA - Slow EMA
  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i]);
  }

  // Signal Line = MACD Line의 EMA
  const signalLine = calculateEMA(macdLine, signalPeriod);

  // Histogram = MACD Line - Signal Line
  const histogramLine: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    histogramLine.push(macdLine[i] - signalLine[i]);
  }

  // 현재값 (배열의 마지막 요소)
  const currentMACD = macdLine[macdLine.length - 1];
  const currentSignal = signalLine[signalLine.length - 1];
  const currentHistogram = histogramLine[histogramLine.length - 1];

  // 추세 판단
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (currentMACD > 0 && currentHistogram > 0) {
    trend = 'bullish';
  } else if (currentMACD < 0 && currentHistogram < 0) {
    trend = 'bearish';
  }

  // 크로스오버 감지 (최근 2일 비교)
  let crossover: 'golden' | 'death' | 'none' = 'none';
  if (macdLine.length >= 2 && signalLine.length >= 2) {
    const prevMACD = macdLine[macdLine.length - 2];
    const prevSignal = signalLine[signalLine.length - 2];

    // 골든 크로스: MACD가 시그널을 아래에서 위로 돌파
    if (prevMACD <= prevSignal && currentMACD > currentSignal) {
      crossover = 'golden';
    }
    // 데드 크로스: MACD가 시그널을 위에서 아래로 돌파
    else if (prevMACD >= prevSignal && currentMACD < currentSignal) {
      crossover = 'death';
    }
  }

  return {
    macd: Math.round(currentMACD * 100) / 100,
    signal: Math.round(currentSignal * 100) / 100,
    histogram: Math.round(currentHistogram * 100) / 100,
    macdLine: macdLine.map(v => Math.round(v * 100) / 100),
    signalLine: signalLine.map(v => Math.round(v * 100) / 100),
    histogramLine: histogramLine.map(v => Math.round(v * 100) / 100),
    trend,
    crossover,
  };
}

/**
 * 스토캐스틱 (Stochastic Oscillator) 계산
 * %K = (현재가 - N일 최저가) / (N일 최고가 - N일 최저가) × 100
 * %D = %K의 M일 이동평균
 *
 * @param highs 고가 배열 (과거 → 최신 순서)
 * @param lows 저가 배열 (과거 → 최신 순서)
 * @param closes 종가 배열 (과거 → 최신 순서)
 * @param kPeriod %K 기간 (기본 14일)
 * @param dPeriod %D 기간 (기본 3일)
 * @param smoothK %K 스무딩 기간 (기본 3, Slow Stochastic)
 */
export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  smoothK: number = 3
): {
  k: number; // %K (현재값)
  d: number; // %D (현재값)
  kLine: number[]; // %K 전체 배열
  dLine: number[]; // %D 전체 배열
  zone: 'overbought' | 'oversold' | 'neutral'; // 과매수/과매도 영역
  signal: 'buy' | 'sell' | 'none'; // 매매 신호
} {
  const defaultResult = {
    k: 50,
    d: 50,
    kLine: [],
    dLine: [],
    zone: 'neutral' as const,
    signal: 'none' as const,
  };

  if (
    highs.length < kPeriod ||
    lows.length < kPeriod ||
    closes.length < kPeriod
  ) {
    return defaultResult;
  }

  // Fast %K 계산
  const fastK: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);

    if (highestHigh === lowestLow) {
      fastK.push(50); // 변동 없으면 중립값
    } else {
      const k = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
      fastK.push(k);
    }
  }

  // Slow %K (Fast %K의 smoothK일 SMA) = 일반적인 %K
  const kLine: number[] = [];
  for (let i = 0; i < fastK.length; i++) {
    if (i < smoothK - 1) {
      kLine.push(fastK[i]);
    } else {
      const slice = fastK.slice(i - smoothK + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / smoothK;
      kLine.push(avg);
    }
  }

  // %D (Slow %K의 dPeriod일 SMA)
  const dLine: number[] = [];
  for (let i = 0; i < kLine.length; i++) {
    if (i < dPeriod - 1) {
      dLine.push(kLine[i]);
    } else {
      const slice = kLine.slice(i - dPeriod + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / dPeriod;
      dLine.push(avg);
    }
  }

  // 현재값
  const currentK = kLine[kLine.length - 1];
  const currentD = dLine[dLine.length - 1];

  // 과매수/과매도 영역 판단
  let zone: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  if (currentK >= 80) {
    zone = 'overbought';
  } else if (currentK <= 20) {
    zone = 'oversold';
  }

  // 매매 신호 (크로스오버 기반)
  // 표준 스토캐스틱 신호 기준: 20/80 (zone 정의와 일치)
  let signal: 'buy' | 'sell' | 'none' = 'none';
  if (kLine.length >= 2 && dLine.length >= 2) {
    const prevK = kLine[kLine.length - 2];
    const prevD = dLine[dLine.length - 2];

    // 과매도 영역(≤20)에서 %K가 %D를 상향 돌파 = 매수 신호
    // 또는 과매도 영역 진입 후 상승 반전 시 (prevK < 20, currentK > prevK)
    if (prevK <= prevD && currentK > currentD && currentK <= 25) {
      signal = 'buy';
    }
    // 과매수 영역(≥80)에서 %K가 %D를 하향 돌파 = 매도 신호
    // 또는 과매수 영역 진입 후 하락 반전 시 (prevK > 80, currentK < prevK)
    else if (prevK >= prevD && currentK < currentD && currentK >= 75) {
      signal = 'sell';
    }
  }

  return {
    k: Math.round(currentK * 100) / 100,
    d: Math.round(currentD * 100) / 100,
    kLine: kLine.map(v => Math.round(v * 100) / 100),
    dLine: dLine.map(v => Math.round(v * 100) / 100),
    zone,
    signal,
  };
}

/**
 * 재무 지표 계산
 */
export interface FinancialMetrics {
  per: number | null; // Price to Earnings Ratio (주가수익비율)
  pbr: number | null; // Price to Book Ratio (주가순자산비율)
  roe: number | null; // Return on Equity (자기자본이익률, %)
  roa: number | null; // Return on Assets (총자산이익률, %)
  eps: number | null; // Earnings Per Share (주당순이익)
  bps: number | null; // Book Value Per Share (주당순자산)
  dividendYield: number | null; // 배당수익률 (%)
  debtRatio: number | null; // 부채비율 (%)
  currentRatio: number | null; // 유동비율 (%)
  operatingMargin: number | null; // 영업이익률 (%)
  netProfitMargin: number | null; // 순이익률 (%)
}

/**
 * 재무 지표 계산 함수
 *
 * @param currentPrice 현재 주가
 * @param financialData 재무 데이터 객체
 */
export function calculateFinancialMetrics(
  currentPrice: number,
  financialData: {
    netIncome?: number; // 순이익
    totalEquity?: number; // 자기자본
    totalAssets?: number; // 총자산
    totalLiabilities?: number; // 총부채
    currentAssets?: number; // 유동자산
    currentLiabilities?: number; // 유동부채
    sharesOutstanding?: number; // 발행주식수
    dividendPerShare?: number; // 주당배당금
    revenue?: number; // 매출액
    operatingIncome?: number; // 영업이익
  }
): FinancialMetrics {
  const {
    netIncome,
    totalEquity,
    totalAssets,
    totalLiabilities,
    currentAssets,
    currentLiabilities,
    sharesOutstanding,
    dividendPerShare,
    revenue,
    operatingIncome,
  } = financialData;

  // EPS (주당순이익) = 순이익 / 발행주식수
  const eps =
    netIncome !== undefined && sharesOutstanding && sharesOutstanding > 0
      ? Math.round((netIncome / sharesOutstanding) * 100) / 100
      : null;

  // BPS (주당순자산) = 자기자본 / 발행주식수
  const bps =
    totalEquity !== undefined && sharesOutstanding && sharesOutstanding > 0
      ? Math.round((totalEquity / sharesOutstanding) * 100) / 100
      : null;

  // PER (주가수익비율) = 현재주가 / EPS
  const per =
    eps !== null && eps > 0
      ? Math.round((currentPrice / eps) * 100) / 100
      : null;

  // PBR (주가순자산비율) = 현재주가 / BPS
  const pbr =
    bps !== null && bps > 0
      ? Math.round((currentPrice / bps) * 100) / 100
      : null;

  // ROE (자기자본이익률) = (순이익 / 자기자본) × 100
  const roe =
    netIncome !== undefined && totalEquity && totalEquity > 0
      ? Math.round((netIncome / totalEquity) * 100 * 100) / 100
      : null;

  // ROA (총자산이익률) = (순이익 / 총자산) × 100
  const roa =
    netIncome !== undefined && totalAssets && totalAssets > 0
      ? Math.round((netIncome / totalAssets) * 100 * 100) / 100
      : null;

  // 배당수익률 = (주당배당금 / 현재주가) × 100
  const dividendYield =
    dividendPerShare !== undefined && currentPrice > 0
      ? Math.round((dividendPerShare / currentPrice) * 100 * 100) / 100
      : null;

  // 부채비율 = (총부채 / 자기자본) × 100
  const debtRatio =
    totalLiabilities !== undefined && totalEquity && totalEquity > 0
      ? Math.round((totalLiabilities / totalEquity) * 100 * 100) / 100
      : null;

  // 유동비율 = (유동자산 / 유동부채) × 100
  const currentRatio =
    currentAssets !== undefined &&
    currentLiabilities &&
    currentLiabilities > 0
      ? Math.round((currentAssets / currentLiabilities) * 100 * 100) / 100
      : null;

  // 영업이익률 = (영업이익 / 매출액) × 100
  const operatingMargin =
    operatingIncome !== undefined && revenue && revenue > 0
      ? Math.round((operatingIncome / revenue) * 100 * 100) / 100
      : null;

  // 순이익률 = (순이익 / 매출액) × 100
  const netProfitMargin =
    netIncome !== undefined && revenue && revenue > 0
      ? Math.round((netIncome / revenue) * 100 * 100) / 100
      : null;

  return {
    per,
    pbr,
    roe,
    roa,
    eps,
    bps,
    dividendYield,
    debtRatio,
    currentRatio,
    operatingMargin,
    netProfitMargin,
  };
}

/**
 * 재무 건전성 등급 판단
 */
export function evaluateFinancialHealth(
  metrics: FinancialMetrics
): {
  grade: 'A' | 'B' | 'C' | 'D' | 'F'; // 종합 등급
  strengths: string[]; // 강점
  weaknesses: string[]; // 약점
  summary: string; // 요약
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  let score = 0;
  let totalFactors = 0;

  // PER 평가 (낮을수록 좋음, 단 음수/0은 제외)
  if (metrics.per !== null && metrics.per > 0) {
    totalFactors++;
    if (metrics.per < 10) {
      score += 2;
      strengths.push('저PER (저평가 가능성)');
    } else if (metrics.per < 20) {
      score += 1;
    } else if (metrics.per > 30) {
      weaknesses.push('고PER (고평가 가능성)');
    }
  }

  // ROE 평가 (높을수록 좋음)
  if (metrics.roe !== null) {
    totalFactors++;
    if (metrics.roe > 15) {
      score += 2;
      strengths.push('높은 ROE (효율적 자본 활용)');
    } else if (metrics.roe > 8) {
      score += 1;
    } else if (metrics.roe < 5) {
      weaknesses.push('낮은 ROE (자본 효율성 낮음)');
    }
  }

  // 부채비율 평가 (낮을수록 좋음)
  if (metrics.debtRatio !== null) {
    totalFactors++;
    if (metrics.debtRatio < 100) {
      score += 2;
      strengths.push('낮은 부채비율 (재무 안정성)');
    } else if (metrics.debtRatio < 200) {
      score += 1;
    } else if (metrics.debtRatio > 300) {
      weaknesses.push('높은 부채비율 (재무 위험)');
    }
  }

  // 유동비율 평가 (높을수록 좋음)
  if (metrics.currentRatio !== null) {
    totalFactors++;
    if (metrics.currentRatio > 200) {
      score += 2;
      strengths.push('높은 유동비율 (단기 지불능력 우수)');
    } else if (metrics.currentRatio > 100) {
      score += 1;
    } else {
      weaknesses.push('낮은 유동비율 (단기 지불능력 우려)');
    }
  }

  // 영업이익률 평가
  if (metrics.operatingMargin !== null) {
    totalFactors++;
    if (metrics.operatingMargin > 15) {
      score += 2;
      strengths.push('높은 영업이익률 (수익성 우수)');
    } else if (metrics.operatingMargin > 5) {
      score += 1;
    } else if (metrics.operatingMargin < 0) {
      weaknesses.push('영업 손실');
    }
  }

  // 배당수익률 평가
  if (metrics.dividendYield !== null && metrics.dividendYield > 0) {
    totalFactors++;
    if (metrics.dividendYield > 4) {
      score += 2;
      strengths.push('높은 배당수익률');
    } else if (metrics.dividendYield > 2) {
      score += 1;
    }
  }

  // 등급 산정
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  const avgScore = totalFactors > 0 ? score / totalFactors : 0;

  if (avgScore >= 1.5) {
    grade = 'A';
  } else if (avgScore >= 1.0) {
    grade = 'B';
  } else if (avgScore >= 0.5) {
    grade = 'C';
  } else if (avgScore > 0) {
    grade = 'D';
  } else {
    grade = 'F';
  }

  // 요약 생성
  let summary: string;
  if (grade === 'A') {
    summary = '우수한 재무 건전성을 보유하고 있습니다.';
  } else if (grade === 'B') {
    summary = '양호한 재무 상태입니다.';
  } else if (grade === 'C') {
    summary = '보통 수준의 재무 상태입니다.';
  } else if (grade === 'D') {
    summary = '재무 개선이 필요합니다.';
  } else {
    summary = '재무 상태에 주의가 필요합니다.';
  }

  return {
    grade,
    strengths,
    weaknesses,
    summary,
  };
}
