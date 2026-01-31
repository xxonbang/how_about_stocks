/**
 * 한글-영문 종목명 매핑
 *
 * 미국 주식과 한국 주식 검색에서 공통으로 사용되는
 * 한글-영문 종목명 변환 로직을 통합합니다.
 */

// ============================================================================
// 미국 주식 한글-영문 매핑
// ============================================================================

/** 미국 주식 한글-영문 종목명 매핑 */
export const US_STOCK_KOREAN_MAP: Record<string, string[]> = {
  // 기술주
  '애플': ['apple', 'aapl'],
  '알파벳': ['alphabet', 'google', 'googl', 'goog'],
  '구글': ['google', 'alphabet', 'googl', 'goog'],
  '마이크로소프트': ['microsoft', 'msft'],
  '아마존': ['amazon', 'amzn'],
  '테슬라': ['tesla', 'tsla'],
  '메타': ['meta', 'facebook', 'fb'],
  '페이스북': ['facebook', 'meta', 'fb'],
  '엔비디아': ['nvidia', 'nvda'],
  '인텔': ['intel', 'intc'],
  'amd': ['amd', 'advanced micro devices'],
  '넷플릭스': ['netflix', 'nflx'],
  '페이팔': ['paypal', 'pypl'],
  '비자': ['visa', 'v'],
  '마스터카드': ['mastercard', 'ma'],

  // 금융주
  '뱅크오브아메리카': ['bank of america', 'bac'],
  '모건스탠리': ['morgan stanley', 'ms'],
  '골드만삭스': ['goldman sachs', 'gs'],
  'jp모건': ['jpmorgan', 'jpm', 'jp morgan'],

  // 지수/ETF
  '나스닥': ['nasdaq', 'ndaq'],
  '나스닥100': ['nasdaq 100', 'qqq'],
  's&p500': ['s&p 500', 'spy', 'sp500'],
  '다우존스': ['dow jones', 'dji', 'dow'],
  '다우': ['dow', 'dow jones', 'dji'],

  // 기타 주요 종목
  '코카콜라': ['coca cola', 'ko'],
  '펩시': ['pepsi', 'pep'],
  '월마트': ['walmart', 'wmt'],
  '존슨앤존슨': ['johnson & johnson', 'jnj'],
  '프록터앤갬블': ['procter & gamble', 'pg'],
  '버크셔해서웨이': ['berkshire hathaway', 'brk'],
};

// ============================================================================
// 한국 주식 한글-영문 매핑 (ETF 등)
// ============================================================================

/** 한국 주식/ETF 한글-영문 매핑 */
export const KR_STOCK_KOREAN_MAP: Record<string, string[]> = {
  '나스닥': ['nasdaq', 'ndaq'],
  '나스닥100': ['nasdaq 100', 'nasdaq100', 'nasdaq-100'],
};

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 한글 검색어를 영문 검색어로 변환 (미국 주식용)
 * @param query 한글 검색어
 * @returns 영문 검색어 배열
 */
export function translateKoreanToEnglishUS(query: string): string[] {
  const lowerQuery = query.toLowerCase().trim();
  const translations = US_STOCK_KOREAN_MAP[lowerQuery];

  if (translations) {
    return translations;
  }

  // 부분 매칭 시도
  for (const [korean, english] of Object.entries(US_STOCK_KOREAN_MAP)) {
    if (korean.includes(lowerQuery) || lowerQuery.includes(korean)) {
      return english;
    }
  }

  return [];
}

/**
 * 한글 검색어를 영문 검색어로 변환 (한국 주식용)
 * @param query 한글 검색어
 * @returns 영문 검색어 배열
 */
export function translateKoreanToEnglishKR(query: string): string[] {
  const lowerQuery = query.toLowerCase().trim();
  const translations = KR_STOCK_KOREAN_MAP[lowerQuery];

  if (translations) {
    return translations;
  }

  return [];
}

/**
 * 한글 포함 여부 체크
 * @param text 확인할 문자열
 */
export function containsKorean(text: string): boolean {
  return /[가-힣]/.test(text);
}

/**
 * 검색어 정규화
 * @param query 검색어
 * @returns 정규화된 검색어
 */
export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/엘지/g, 'lg')
    .replace(/엘/g, 'lg');
}
