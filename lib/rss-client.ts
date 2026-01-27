/**
 * RSS News Client
 * 글로벌 금융 뉴스 RSS 피드 수집 및 스마트 필터링
 */

import { cache } from './cache';

export interface RssNewsItem {
  title: string;
  link: string;
  date: string;
  source: string;
  relevanceScore?: number; // 관련성 점수
}

/**
 * RSS 피드 소스 정의
 */
const RSS_FEEDS: Array<{ name: string; url: string; priority: number }> = [
  // 주요 금융 뉴스 (우선순위 높음)
  {
    name: 'Bloomberg Markets',
    url: 'https://feeds.bloomberg.com/markets/news.rss',
    priority: 1,
  },
  {
    name: 'CNBC',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', // Top News
    priority: 1,
  },
  {
    name: 'Reuters Business',
    url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
    priority: 1,
  },
  // 보조 소스 (우선순위 중간)
  {
    name: 'MarketWatch',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    priority: 2,
  },
  {
    name: 'Investing.com',
    url: 'https://www.investing.com/rss/news.rss',
    priority: 2,
  },
  // Google News Finance (우선순위 낮음, 집계 소스)
  {
    name: 'Google Finance News',
    url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpmTjNRU0FtdHZHZ0pMVWlnQVAB',
    priority: 3,
  },
];

/**
 * 시장 관련 키워드 (필터링용)
 */
const MARKET_KEYWORDS = [
  // 통화 정책
  'fed', 'federal reserve', 'fomc', 'interest rate', 'rate cut', 'rate hike',
  '금리', '연준', '통화정책',
  // 경제 지표
  'gdp', 'inflation', 'cpi', 'employment', 'jobs', 'unemployment',
  '인플레이션', '고용', '실업률',
  // 시장
  'stock', 'market', 'dow', 's&p', 'nasdaq', 'bull', 'bear',
  'rally', 'crash', 'correction', 'volatility',
  '주식', '증시', '코스피', '코스닥',
  // 섹터
  'tech', 'ai', 'semiconductor', 'chip', 'nvidia', 'apple', 'microsoft',
  'bank', 'oil', 'energy', 'healthcare',
  '반도체', '인공지능', '테크',
  // 이벤트
  'earnings', 'ipo', 'merger', 'acquisition',
  '실적', '분기', '매출',
];

const CACHE_KEY_PREFIX = 'rss-news';
const CACHE_TTL = 30 * 60 * 1000; // 30분

/**
 * XML 문자열에서 RSS 아이템 파싱 (의존성 없이 구현)
 */
function parseRssXml(xml: string, sourceName: string): RssNewsItem[] {
  const items: RssNewsItem[] = [];

  try {
    // <item> 태그 추출
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

    for (const itemXml of itemMatches.slice(0, 20)) { // 최대 20개
      // 제목 추출
      const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const title = titleMatch
        ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
        : '';

      // 링크 추출
      const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      const link = linkMatch
        ? linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
        : '';

      // 날짜 추출
      const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const dateStr = dateMatch ? dateMatch[1].trim() : '';
      const date = dateStr ? formatDate(dateStr) : new Date().toISOString().split('T')[0];

      if (title && link) {
        items.push({
          title: decodeHtmlEntities(title),
          link,
          date,
          source: sourceName,
        });
      }
    }
  } catch (error) {
    console.warn(`[RSS] XML 파싱 실패 (${sourceName}):`, error);
  }

  return items;
}

/**
 * Atom 피드 파싱 (일부 소스용)
 */
function parseAtomXml(xml: string, sourceName: string): RssNewsItem[] {
  const items: RssNewsItem[] = [];

  try {
    // <entry> 태그 추출
    const entryMatches = xml.match(/<entry>([\s\S]*?)<\/entry>/gi) || [];

    for (const entryXml of entryMatches.slice(0, 20)) {
      const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch
        ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
        : '';

      const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      const link = linkMatch ? linkMatch[1] : '';

      const dateMatch = entryXml.match(/<(?:published|updated)>([\s\S]*?)<\/(?:published|updated)>/i);
      const dateStr = dateMatch ? dateMatch[1].trim() : '';
      const date = dateStr ? formatDate(dateStr) : new Date().toISOString().split('T')[0];

      if (title && link) {
        items.push({
          title: decodeHtmlEntities(title),
          link,
          date,
          source: sourceName,
        });
      }
    }
  } catch (error) {
    console.warn(`[RSS] Atom 파싱 실패 (${sourceName}):`, error);
  }

  return items;
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // 숫자 엔티티 처리
  decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
    String.fromCharCode(parseInt(num, 10))
  );

  return decoded;
}

/**
 * 날짜 문자열 정규화
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * 단일 RSS 피드 조회
 */
async function fetchSingleFeed(
  feedConfig: typeof RSS_FEEDS[0]
): Promise<RssNewsItem[]> {
  try {
    const response = await fetch(feedConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(10000), // 10초 타임아웃
    });

    if (!response.ok) {
      console.warn(`[RSS] ${feedConfig.name} 응답 오류: ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // RSS 또는 Atom 형식 감지 및 파싱
    if (xml.includes('<entry>')) {
      return parseAtomXml(xml, feedConfig.name);
    } else {
      return parseRssXml(xml, feedConfig.name);
    }
  } catch (error) {
    console.warn(`[RSS] ${feedConfig.name} 조회 실패:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 관련성 점수 계산
 * @param title 뉴스 제목
 * @param symbols 관심 종목 심볼 (예: ['AAPL', 'NVDA', '삼성전자'])
 * @param keywords 추가 키워드
 */
function calculateRelevanceScore(
  title: string,
  symbols: string[] = [],
  keywords: string[] = []
): number {
  const lowerTitle = title.toLowerCase();
  let score = 0;

  // 종목명 매칭 (+5점)
  for (const symbol of symbols) {
    const symbolLower = symbol.toLowerCase().replace(/\.(ks|kq)$/i, '');
    if (lowerTitle.includes(symbolLower)) {
      score += 5;
    }
  }

  // 사용자 지정 키워드 매칭 (+3점)
  for (const keyword of keywords) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      score += 3;
    }
  }

  // 시장 키워드 매칭 (+1점)
  for (const keyword of MARKET_KEYWORDS) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }

  return score;
}

/**
 * 뉴스 중복 제거 (제목 유사도 기반)
 */
function deduplicateNews(items: RssNewsItem[]): RssNewsItem[] {
  const seen = new Set<string>();
  const result: RssNewsItem[] = [];

  for (const item of items) {
    // 제목 정규화 (소문자, 공백 제거)
    const normalizedTitle = item.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 50);

    if (!seen.has(normalizedTitle)) {
      seen.add(normalizedTitle);
      result.push(item);
    }
  }

  return result;
}

/**
 * 글로벌 RSS 뉴스 수집 (메인 함수)
 *
 * @param options 수집 옵션
 * @returns 필터링 및 정렬된 뉴스 목록
 */
export async function fetchGlobalRssNews(options: {
  symbols?: string[];          // 관심 종목
  keywords?: string[];         // 추가 키워드
  minRelevanceScore?: number;  // 최소 관련성 점수 (기본: 0)
  maxItems?: number;           // 최대 반환 개수 (기본: 10)
  includeSources?: string[];   // 특정 소스만 포함
  excludeSources?: string[];   // 특정 소스 제외
} = {}): Promise<RssNewsItem[]> {
  const {
    symbols = [],
    keywords = [],
    minRelevanceScore = 0,
    maxItems = 10,
    includeSources,
    excludeSources,
  } = options;

  // 캐시 확인 (심볼/키워드에 관계없이 원본 데이터 캐시)
  const cacheKey = `${CACHE_KEY_PREFIX}-all`;
  let allItems = cache.get<RssNewsItem[]>(cacheKey);

  if (!allItems) {
    console.log('[RSS] 글로벌 뉴스 수집 시작');

    // 피드 필터링
    let feedsToFetch = RSS_FEEDS;
    if (includeSources) {
      feedsToFetch = feedsToFetch.filter(f =>
        includeSources.some(s => f.name.toLowerCase().includes(s.toLowerCase()))
      );
    }
    if (excludeSources) {
      feedsToFetch = feedsToFetch.filter(f =>
        !excludeSources.some(s => f.name.toLowerCase().includes(s.toLowerCase()))
      );
    }

    // 우선순위 순으로 정렬
    feedsToFetch.sort((a, b) => a.priority - b.priority);

    // 병렬로 모든 피드 수집
    const feedResults = await Promise.all(
      feedsToFetch.map(feed => fetchSingleFeed(feed))
    );

    // 결과 병합
    allItems = feedResults.flat();

    // 중복 제거
    allItems = deduplicateNews(allItems);

    // 캐시 저장
    cache.set(cacheKey, allItems, CACHE_TTL);

    console.log(`[RSS] 총 ${allItems.length}개 뉴스 수집 완료`);
  } else {
    console.log('[RSS] 캐시에서 반환');
  }

  // 관련성 점수 계산
  const scoredItems = allItems.map(item => ({
    ...item,
    relevanceScore: calculateRelevanceScore(item.title, symbols, keywords),
  }));

  // 필터링 (최소 관련성 점수)
  let filteredItems = scoredItems;
  if (minRelevanceScore > 0) {
    filteredItems = scoredItems.filter(
      item => (item.relevanceScore ?? 0) >= minRelevanceScore
    );
  }

  // 정렬 (관련성 점수 내림차순, 같으면 날짜 내림차순)
  filteredItems.sort((a, b) => {
    const scoreDiff = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // 최대 개수 제한
  return filteredItems.slice(0, maxItems);
}

/**
 * 특정 종목 관련 뉴스 조회 (기존 fetchNews 함수와 호환)
 */
export async function fetchRssNewsForSymbol(
  symbol: string,
  count: number = 5
): Promise<Array<{ title: string; link: string; date: string }>> {
  const news = await fetchGlobalRssNews({
    symbols: [symbol],
    minRelevanceScore: 2, // 최소 2점 이상 (시장 키워드 2개 또는 종목명 포함)
    maxItems: count,
  });

  return news.map(({ title, link, date }) => ({ title, link, date }));
}

/**
 * 시장 전반 뉴스 조회 (종목 무관)
 */
export async function fetchMarketNews(count: number = 10): Promise<RssNewsItem[]> {
  return fetchGlobalRssNews({
    minRelevanceScore: 1,
    maxItems: count,
  });
}
