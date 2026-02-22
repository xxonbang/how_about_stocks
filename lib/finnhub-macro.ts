/**
 * Finnhub 거시 환경 데이터 수집
 *
 * Finnhub Market News(무료) → AI 프롬프트용 텍스트 생성
 * - circuit breaker + AbortSignal.timeout 패턴 (finnhub-symbols.ts 참조)
 * - 30분 인메모리 캐시
 *
 * NOTE: Economic Calendar는 Finnhub 유료 플랜 전용(403)이므로 사용하지 않음.
 * Gemini Google Search Grounding이 경제 일정 부분을 보완.
 */

export interface MarketNewsItem {
  category: string;
  datetime: number;
  headline: string;
  source: string;
  summary: string;
  url: string;
}

export interface MacroData {
  news: MarketNewsItem[];
  fetchedAt: number;
}

const FINNHUB_API_KEY =
  process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY || '';

// 30분 캐시
const CACHE_TTL = 30 * 60 * 1000;
let cachedMacro: MacroData | null = null;

/**
 * Finnhub Market News (일반 카테고리) 최신 15건
 */
async function fetchMarketNews(): Promise<MarketNewsItem[]> {
  if (!FINNHUB_API_KEY) return [];

  const { getCircuitBreaker } = await import('./circuit-breaker');
  const breaker = getCircuitBreaker('finnhub-news', {
    failureThreshold: 3,
    resetTimeout: 30000,
  });

  return breaker.execute(async () => {
    const url = `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Finnhub news API failed: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return (data as MarketNewsItem[]).slice(0, 15);
  });
}

/**
 * 거시 환경 데이터 수집 (30분 캐시)
 */
export async function fetchMacroData(): Promise<MacroData | null> {
  if (!FINNHUB_API_KEY) {
    console.log('[FinnhubMacro] FINNHUB_API_KEY 미설정, 건너뜀');
    return null;
  }

  // 캐시 확인
  if (cachedMacro && Date.now() - cachedMacro.fetchedAt < CACHE_TTL) {
    console.log(
      `[FinnhubMacro] 캐시 사용 (${Math.round((Date.now() - cachedMacro.fetchedAt) / 1000)}초 전)`
    );
    return cachedMacro;
  }

  try {
    const news = await fetchMarketNews();

    if (news.length === 0) {
      console.log('[FinnhubMacro] 수집된 뉴스 없음');
      return null;
    }

    cachedMacro = { news, fetchedAt: Date.now() };
    console.log(`[FinnhubMacro] 수집 완료: 뉴스 ${news.length}건`);
    return cachedMacro;
  } catch (error) {
    console.error('[FinnhubMacro] 데이터 수집 실패:', error);
    return null;
  }
}

/**
 * AI 프롬프트용 거시 환경 마크다운 섹션 생성
 */
export function generateMacroPromptSection(macroData: MacroData): string {
  const today = new Date().toISOString().split('T')[0];

  let section = `\n## 거시 환경 데이터 (${today})\n\n`;

  if (macroData.news.length > 0) {
    section += `### 주요 시장 뉴스\n`;
    for (const n of macroData.news) {
      const date = new Date(n.datetime * 1000).toLocaleDateString('ko-KR');
      section += `- **${n.headline}** (${n.source}, ${date})\n`;
      if (n.summary) {
        section += `  ${n.summary.slice(0, 200)}\n`;
      }
    }
    section += '\n';
  }

  section += `**거시 환경 분석 지침**:\n`;
  section += `- 위 글로벌 뉴스를 참고하여 분석 대상 종목과의 관련성을 평가하세요.\n`;
  section += `- 시장 전반의 분위기와 투자 심리를 파악하여 종목 분석에 활용하세요.\n`;
  section += `- 관련 뉴스가 있다면 반드시 언급하세요.\n`;
  section += `- 주요 경제 일정은 Google 검색으로 추가 확인하세요.\n`;
  section += `\n---\n`;

  return section;
}
