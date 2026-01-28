/**
 * 동적 한국 주식 이름 → 티커 변환 유틸리티
 *
 * 하드코딩된 매핑 대신 FinanceDataReader StockListing을 활용하여
 * 동적으로 티커를 검색합니다.
 *
 * ⚠️ 서버 사이드 전용 모듈입니다.
 */

import { CACHE_TTL_MS, SIMILARITY_THRESHOLD, containsKorean, isKoreaTicker } from './constants';

// 서버 사이드 전용 모듈
// 클라이언트에서 import 시도 시 에러 발생
if (typeof window !== 'undefined') {
  throw new Error('korea-stock-mapper-dynamic is server-only and cannot be imported in client components');
}

// Node.js 전용 모듈은 동적 import로 처리 (클라이언트 번들에서 제외)

// 캐시 파일 경로 (서버 사이드에서만 사용)
const CACHE_TTL = CACHE_TTL_MS; // 24시간

async function getCachePaths() {
  const { join } = await import('path');
  const CACHE_DIR = join(process.cwd(), '.cache');
  const STOCK_LISTING_CACHE_FILE = join(CACHE_DIR, 'krx-stock-listing.json');
  return { CACHE_DIR, STOCK_LISTING_CACHE_FILE };
}

interface StockListingItem {
  Symbol: string;
  Name: string;
  Market: string;
}

interface CachedStockListing {
  data: StockListingItem[];
  timestamp: number;
  version?: string; // 캐시 버전 (데이터 형식 변경 시 무효화용)
}

// 캐시 버전 (데이터 형식이 변경되면 증가)
const CACHE_VERSION = '2.0';

// 최소 유효 종목 수 (캐시 손상 감지용)
const MIN_VALID_STOCK_COUNT = 1000;


/**
 * Python 스크립트를 통해 KRX 전체 종목 리스트 가져오기
 * 종합적인 데이터 소스를 활용하여 최대한 완전한 리스트 확보
 */
async function fetchStockListingFromPython(): Promise<StockListingItem[]> {
  return new Promise(async (resolve, reject) => {
    try {
      // Node.js 전용 모듈은 서버 사이드에서만 사용 가능하므로 동적 import
      const { spawn } = await import('child_process');
      const { join } = await import('path');
      const { findPythonCommand } = await import('./python-utils');
      
      const { command: pythonCommand } = await findPythonCommand();
      // 종합적인 데이터 소스를 활용하는 스크립트 사용
      const scriptPath = join(process.cwd(), 'scripts', 'get_comprehensive_stock_listing.py');
      const pythonProcess = spawn(pythonCommand, [scriptPath]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${errorOutput.substring(0, 500)}`));
        return;
      }

      try {
        // JSON 출력 찾기 (stderr 메시지 제외)
        const jsonStart = output.indexOf('{');
        const jsonEnd = output.lastIndexOf('}') + 1;
        if (jsonStart === -1 || jsonEnd <= jsonStart) {
          reject(new Error(`No JSON found in output. Output: ${output.substring(0, 500)}`));
          return;
        }

        const jsonText = output.substring(jsonStart, jsonEnd);
        const result = JSON.parse(jsonText);
        
        if (result.success === false) {
          reject(new Error(result.error || 'Unknown error from Python script'));
          return;
        }
        
        if (result.data && Array.isArray(result.data)) {
          resolve(result.data);
        } else if (result.error) {
          reject(new Error(result.error));
        } else {
          reject(new Error('Invalid response format'));
        }
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e instanceof Error ? e.message : String(e)}. Output: ${output.substring(0, 500)}`));
      }
    });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 캐시 데이터 유효성 검증
 */
function validateCacheData(cached: CachedStockListing): { valid: boolean; reason?: string } {
  // 1. 버전 확인
  if (cached.version && cached.version !== CACHE_VERSION) {
    return { valid: false, reason: `버전 불일치 (캐시: ${cached.version}, 현재: ${CACHE_VERSION})` };
  }

  // 2. 데이터 배열 확인
  if (!cached.data || !Array.isArray(cached.data)) {
    return { valid: false, reason: '데이터 배열이 없거나 잘못됨' };
  }

  // 3. 최소 종목 수 확인 (손상된 캐시 감지)
  if (cached.data.length < MIN_VALID_STOCK_COUNT) {
    return { valid: false, reason: `종목 수 부족 (${cached.data.length} < ${MIN_VALID_STOCK_COUNT})` };
  }

  // 4. 데이터 형식 샘플링 검증 (처음 10개 항목)
  const sampleSize = Math.min(10, cached.data.length);
  for (let i = 0; i < sampleSize; i++) {
    const item = cached.data[i];
    if (!item.Symbol || !item.Name || typeof item.Symbol !== 'string' || typeof item.Name !== 'string') {
      return { valid: false, reason: `잘못된 데이터 형식 (인덱스 ${i})` };
    }
  }

  return { valid: true };
}

/**
 * 캐시된 StockListing 데이터 읽기 (만료 여부 및 유효성 검증 포함)
 */
async function readCachedStockListing(): Promise<{ data: StockListingItem[]; isExpired: boolean } | null> {
  try {
    const { existsSync } = await import('fs');
    const { readFile, unlink } = await import('fs/promises');
    const { STOCK_LISTING_CACHE_FILE } = await getCachePaths();

    if (!existsSync(STOCK_LISTING_CACHE_FILE)) {
      return null;
    }

    const content = await readFile(STOCK_LISTING_CACHE_FILE, 'utf-8');
    const cached: CachedStockListing = JSON.parse(content);

    // 캐시 유효성 검증
    const validation = validateCacheData(cached);
    if (!validation.valid) {
      console.warn(`[Dynamic Mapping] 캐시 무효화: ${validation.reason}`);
      // 손상된 캐시 삭제
      try {
        await unlink(STOCK_LISTING_CACHE_FILE);
        console.log('[Dynamic Mapping] 손상된 캐시 파일 삭제됨');
      } catch (unlinkError) {
        console.warn('[Dynamic Mapping] 캐시 파일 삭제 실패:', unlinkError);
      }
      return null;
    }

    // 캐시 만료 확인
    const now = Date.now();
    const isExpired = now - cached.timestamp > CACHE_TTL;

    return {
      data: cached.data,
      isExpired,
    };
  } catch (error) {
    console.warn('Failed to read cached stock listing:', error);
    return null;
  }
}

/**
 * StockListing 데이터를 캐시에 저장
 */
async function saveCachedStockListing(data: StockListingItem[]): Promise<void> {
  try {
    const { existsSync } = await import('fs');
    const { mkdir, writeFile } = await import('fs/promises');
    const { CACHE_DIR, STOCK_LISTING_CACHE_FILE } = await getCachePaths();

    // 데이터 유효성 검증 (저장 전)
    if (!data || data.length < MIN_VALID_STOCK_COUNT) {
      console.warn(`[Dynamic Mapping] 캐시 저장 거부: 종목 수 부족 (${data?.length || 0})`);
      return;
    }

    // 캐시 디렉토리 생성
    if (!existsSync(CACHE_DIR)) {
      await mkdir(CACHE_DIR, { recursive: true });
    }

    const cached: CachedStockListing = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    };

    await writeFile(STOCK_LISTING_CACHE_FILE, JSON.stringify(cached, null, 2), 'utf-8');
    console.log(`[Dynamic Mapping] 캐시 저장 완료: ${data.length}개 종목, 버전 ${CACHE_VERSION}`);
  } catch (error) {
    console.warn('Failed to save cached stock listing:', error);
  }
}

/**
 * 공공데이터포털에서 KRX 상장종목 가져오기 (Python 없이도 동작)
 */
async function fetchStockListingFromPublicData(): Promise<StockListingItem[]> {
  try {
    const { fetchKRXListedStocksForMapper, isPublicDataAvailable } = await import('./finance-publicdata');

    if (!isPublicDataAvailable()) {
      console.log('[Dynamic Mapping] 공공데이터포털 API 키 미설정');
      return [];
    }

    console.log('[Dynamic Mapping] 공공데이터포털에서 KRX 상장종목 조회 중...');
    const stocks = await fetchKRXListedStocksForMapper();

    if (stocks.length > 0) {
      console.log(`[Dynamic Mapping] 공공데이터포털에서 ${stocks.length}개 종목 로드 완료`);
    }

    return stocks;
  } catch (error) {
    console.warn('[Dynamic Mapping] 공공데이터포털 조회 실패:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * symbols.json에서 종목 데이터 읽기 (정적 파일, 항상 사용 가능)
 */
async function readSymbolsJson(): Promise<StockListingItem[]> {
  try {
    const { existsSync } = await import('fs');
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');

    const symbolsPath = join(process.cwd(), 'public', 'data', 'symbols.json');

    if (!existsSync(symbolsPath)) {
      console.warn('[Dynamic Mapping] symbols.json not found');
      return [];
    }

    const content = await readFile(symbolsPath, 'utf-8');
    const data = JSON.parse(content);

    if (!data.korea || !Array.isArray(data.korea.stocks)) {
      console.warn('[Dynamic Mapping] Invalid symbols.json format');
      return [];
    }

    // symbols.json 형식을 StockListingItem 형식으로 변환
    const stocks: StockListingItem[] = data.korea.stocks.map((stock: { code: string; name: string; market: string }) => ({
      Symbol: stock.code,
      Name: stock.name,
      Market: stock.market || 'KRX',
    }));

    console.log(`[Dynamic Mapping] Loaded ${stocks.length} stocks from symbols.json`);
    return stocks;
  } catch (error) {
    console.warn('[Dynamic Mapping] Failed to read symbols.json:', error);
    return [];
  }
}

/**
 * 백그라운드에서 종목 리스트 갱신 (공공데이터포털 우선, Python fallback)
 */
async function refreshStockListingInBackground(): Promise<void> {
  // 공공데이터포털 우선 시도
  fetchStockListingFromPublicData()
    .then(async (publicData) => {
      if (publicData && publicData.length >= MIN_VALID_STOCK_COUNT) {
        await saveCachedStockListing(publicData);
        console.log(`[Dynamic Mapping] Cache refreshed from PublicData Portal (${publicData.length} stocks)`);
        return;
      }

      // 공공데이터포털 실패 시 Python 시도
      console.log('[Dynamic Mapping] PublicData insufficient, trying Python in background...');
      const pythonData = await fetchStockListingFromPython();
      if (pythonData && pythonData.length > 0) {
        await saveCachedStockListing(pythonData);
        console.log(`[Dynamic Mapping] Cache refreshed from Python (${pythonData.length} stocks)`);
      }
    })
    .catch((err) => {
      console.warn('[Dynamic Mapping] Background refresh (PublicData) failed, trying Python:', err);

      // PublicData 예외 발생 시 Python 시도
      fetchStockListingFromPython()
        .then((data) => {
          if (data && data.length > 0) {
            saveCachedStockListing(data).catch(() => {});
            console.log(`[Dynamic Mapping] Cache refreshed from Python fallback (${data.length} stocks)`);
          }
        })
        .catch((pythonErr) => {
          console.warn('[Dynamic Mapping] Background refresh (Python) also failed:', pythonErr);
        });
    });
}

/**
 * StockListing 데이터 가져오기 (캐시 우선, symbols.json 폴백)
 */
export async function getStockListing(): Promise<StockListingItem[]> {
  // 0. symbols.json 먼저 로드 (항상 사용 가능한 정적 데이터)
  let symbolsJsonData: StockListingItem[] = [];
  try {
    symbolsJsonData = await readSymbolsJson();
  } catch (e) {
    console.warn('[Dynamic Mapping] symbols.json load failed:', e);
  }

  // 1. 캐시 확인 (만료 여부와 관계없이)
  let cachedData: StockListingItem[] | null = null;
  let isExpired = false;

  try {
    const cached = await readCachedStockListing();
    if (cached && cached.data.length > 0) {
      cachedData = cached.data;
      isExpired = cached.isExpired;

      // 만료되지 않았으면 즉시 반환 (symbols.json과 병합)
      if (!isExpired) {
        const merged = mergeStockLists(cachedData, symbolsJsonData);
        console.log(`[Dynamic Mapping] Using cached stock listing (${cachedData.length} cached + ${symbolsJsonData.length} from symbols.json = ${merged.length} total)`);
        return merged;
      }

      // 만료되었어도 일단 사용 (백그라운드 갱신)
      console.log(`[Dynamic Mapping] Cache expired, using stale cache (${cachedData.length} stocks) while refreshing in background...`);
    }
  } catch (error) {
    console.warn('[Dynamic Mapping] Failed to read cache, fetching fresh data:', error);
  }

  // 2. 백그라운드에서 갱신 시도 (만료된 캐시가 있으면)
  if (cachedData && isExpired) {
    // 비동기로 백그라운드 갱신 (공공데이터포털 우선, Python fallback)
    refreshStockListingInBackground();

    // 만료된 캐시 + symbols.json 병합하여 반환
    const merged = mergeStockLists(cachedData, symbolsJsonData);
    return merged;
  }

  // 3. 캐시가 없으면 symbols.json이라도 사용
  if (symbolsJsonData.length > 0) {
    console.log(`[Dynamic Mapping] No cache available, using symbols.json (${symbolsJsonData.length} stocks)`);

    // 백그라운드에서 캐시 생성 시도
    refreshStockListingInBackground();

    return symbolsJsonData;
  }

  // 4. symbols.json도 없으면 공공데이터포털 → Python 순서로 시도
  // 4-1. 공공데이터포털 시도 (Python 없이도 동작)
  console.log('[Dynamic Mapping] Fetching stock listing from PublicData Portal...');
  try {
    const publicData = await fetchStockListingFromPublicData();
    if (publicData && publicData.length >= MIN_VALID_STOCK_COUNT) {
      await saveCachedStockListing(publicData);
      console.log(`[Dynamic Mapping] Fetched from PublicData Portal: ${publicData.length} stocks`);
      return publicData;
    }
    console.log(`[Dynamic Mapping] PublicData returned ${publicData.length} stocks, trying Python...`);
  } catch (publicDataError) {
    console.warn('[Dynamic Mapping] PublicData failed, trying Python:', publicDataError instanceof Error ? publicDataError.message : publicDataError);
  }

  // 4-2. Python 스크립트 시도
  console.log('[Dynamic Mapping] Fetching stock listing from Python...');
  try {
    const data = await fetchStockListingFromPython();
    if (!data || data.length === 0) {
      // 실패해도 만료된 캐시가 있으면 사용
      if (cachedData) {
        console.warn('[Dynamic Mapping] Fetch returned empty, using stale cache');
        return cachedData;
      }
      throw new Error('Stock listing returned empty data');
    }

    // 캐시에 저장 (실패해도 계속 진행)
    try {
      await saveCachedStockListing(data);
      console.log(`[Dynamic Mapping] Fetched and cached ${data.length} stocks`);
    } catch (cacheError) {
      console.warn('[Dynamic Mapping] Failed to save cache, but data is available:', cacheError);
    }
    return data;
  } catch (error) {
    // 실패해도 만료된 캐시가 있으면 사용
    if (cachedData) {
      console.warn('[Dynamic Mapping] Fetch failed, using stale cache:', error instanceof Error ? error.message : String(error));
      return cachedData;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Dynamic Mapping] Failed to fetch stock listing:', errorMessage);
    throw error;
  }
}

/**
 * 두 종목 리스트 병합 (중복 제거, 첫 번째 리스트 우선)
 */
function mergeStockLists(primary: StockListingItem[], secondary: StockListingItem[]): StockListingItem[] {
  const seen = new Set<string>();
  const result: StockListingItem[] = [];

  for (const stock of primary) {
    if (stock.Symbol && !seen.has(stock.Symbol)) {
      seen.add(stock.Symbol);
      result.push(stock);
    }
  }

  for (const stock of secondary) {
    if (stock.Symbol && !seen.has(stock.Symbol)) {
      seen.add(stock.Symbol);
      result.push(stock);
    }
  }

  return result;
}

/**
 * Levenshtein 거리 계산 (문자열 유사도 측정)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * 문자열 유사도 계산 (0.0 ~ 1.0)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * 한국 주식 이름으로 티커 검색 (동적)
 */
export async function searchTickerByName(name: string): Promise<string | null> {
  const searchStartTime = Date.now();
  
  try {
    const stockList = await getStockListing();
    
    if (!stockList || stockList.length === 0) {
      console.warn('[Dynamic Mapping] Stock listing is empty');
      return null;
    }
    
    console.log(`[Dynamic Mapping] Searching "${name}" in ${stockList.length} stocks`);
    
    // 정확한 이름 매칭 시도 (공백 무시)
    const normalizedName = name.replace(/\s+/g, '');
    const exactMatch = stockList.find(
      (stock) => {
        if (!stock.Name || !stock.Symbol) return false;
        const normalizedStockName = stock.Name.replace(/\s+/g, '');
        return stock.Name === name || normalizedStockName === normalizedName;
      }
    );
    
    if (exactMatch && exactMatch.Symbol) {
      const duration = Date.now() - searchStartTime;
      console.log(`[Dynamic Mapping] Found exact match: ${name} -> ${exactMatch.Symbol} (${duration}ms)`);
      return exactMatch.Symbol;
    }

    // 부분 매칭 시도 - 검색어가 종목명에 포함되는 경우만 (역방향 매칭 제거)
    const partialMatches = stockList
      .map((stock) => {
        if (!stock.Name || !stock.Symbol) return null;
        const stockName = stock.Name.replace(/\s+/g, '');
        const searchName = normalizedName;
        
        // 검색어가 종목명에 포함되는 경우만 매칭
        if (!stockName.includes(searchName)) return null;
        
        // 유사도 계산
        const similarity = calculateSimilarity(searchName, stockName);
        
        return {
          stock,
          similarity,
          stockName,
        };
      })
      .filter((item): item is { stock: StockListingItem; similarity: number; stockName: string } =>
        item !== null && item.similarity > SIMILARITY_THRESHOLD // 60% 이상 유사도만 고려
      );
    
    if (partialMatches.length > 0) {
      // 유사도와 기타 조건을 종합하여 최적 매칭 선택
      const bestMatch = partialMatches.reduce((best, current) => {
        if (!best) return current;
        
        const bestName = best.stockName;
        const currentName = current.stockName;
        
        // 1. 정확한 매칭 우선
        if (bestName === normalizedName && currentName !== normalizedName) return best;
        if (currentName === normalizedName && bestName !== normalizedName) return current;
        
        // 2. 유사도가 높은 것 우선
        if (current.similarity > best.similarity) return current;
        if (best.similarity > current.similarity) return best;
        
        // 3. 검색어로 시작하는 종목 우선
        const bestStartsWith = bestName.startsWith(normalizedName);
        const currentStartsWith = currentName.startsWith(normalizedName);
        if (currentStartsWith && !bestStartsWith) return current;
        if (bestStartsWith && !currentStartsWith) return best;
        
        // 4. 검색어와 길이가 비슷한 종목 우선 (더 정확한 매칭)
        const bestLengthDiff = Math.abs(bestName.length - normalizedName.length);
        const currentLengthDiff = Math.abs(currentName.length - normalizedName.length);
        if (currentLengthDiff < bestLengthDiff) return current;
        if (bestLengthDiff < currentLengthDiff) return best;
        
        // 5. 이름 길이 짧은 것 우선 (더 정확한 매칭)
        if (bestName.length !== currentName.length) {
          return bestName.length < currentName.length ? best : current;
        }
        
        return best;
      });
      
      if (bestMatch && bestMatch.stock.Symbol) {
        const duration = Date.now() - searchStartTime;
        console.log(`[Dynamic Mapping] Found partial match: ${name} -> ${bestMatch.stock.Symbol} (${bestMatch.stock.Name}, similarity: ${(bestMatch.similarity * 100).toFixed(1)}%, ${duration}ms)`);
        return bestMatch.stock.Symbol;
      }
    }

    // 실패 시 유사한 종목명 제안 (로깅용)
    const suggestions = stockList
      .map((stock) => {
        if (!stock.Name || !stock.Symbol) return null;
        const stockName = stock.Name.replace(/\s+/g, '');
        const similarity = calculateSimilarity(normalizedName, stockName);
        return { stock, similarity };
      })
      .filter((item): item is { stock: StockListingItem; similarity: number } => 
        item !== null && item.similarity > 0.3
      )
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map((item) => `${item.stock.Name} (${(item.similarity * 100).toFixed(1)}%)`);
    
    const duration = Date.now() - searchStartTime;
    console.log(`[Dynamic Mapping] No match found for: ${name} (${duration}ms)`);
    if (suggestions.length > 0) {
      console.log(`[Dynamic Mapping] Suggestions: ${suggestions.join(', ')}`);
    }
    
    return null;
  } catch (error) {
    const duration = Date.now() - searchStartTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[Dynamic Mapping] Failed to search ticker for ${name} (${duration}ms):`, errorMessage);
    return null;
  }
}

/**
 * 주식 심볼을 정규화 (하드코딩 매핑 + 동적 검색)
 */
export async function normalizeStockSymbolDynamic(symbol: string): Promise<string> {
  try {
    // 1. 이미 티커 형식인 경우
    if (/^\d{6}$/.test(symbol) || symbol.includes('.KS')) {
      return symbol.includes('.KS') ? symbol : `${symbol}.KS`;
    }

    // 2. 하드코딩된 매핑 확인 (빠른 조회)
    try {
      const { convertKoreaStockNameToTicker } = await import('./korea-stock-mapper');
      const cached = convertKoreaStockNameToTicker(symbol);
      if (cached) {
        return cached;
      }
    } catch (importError) {
      console.warn('[Dynamic Mapping] Failed to import static mapper, continuing with dynamic search:', importError);
    }

    // 3. 티커 코드로 직접 검색 시도 (6자리 숫자인 경우)
    if (/^\d{6}$/.test(symbol)) {
      try {
        const stockList = await getStockListing();
        const tickerMatch = stockList.find((stock) => stock.Symbol === symbol);
        if (tickerMatch) {
          return `${symbol}.KS`;
        }
      } catch (error) {
        console.warn(`[Dynamic Mapping] Ticker search failed for ${symbol}:`, error);
      }
    }

    // 4. 동적 검색 (한글 이름인 경우만)
    const isKoreanName = containsKorean(symbol);
    if (isKoreanName) {
      try {
        const ticker = await searchTickerByName(symbol);
        if (ticker) {
          return `${ticker}.KS`;
        }
      } catch (searchError) {
        // 동적 검색 실패해도 계속 진행 (원본 반환)
        console.warn(`[Dynamic Mapping] Search failed for ${symbol}, using original:`, searchError);
      }
    }

    // 5. Fallback: 원본 반환
    return symbol;
  } catch (error) {
    // 전체 프로세스 실패 시 원본 반환
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Dynamic Mapping] Normalization failed for ${symbol}, using original:`, errorMessage);
    return symbol;
  }
}

/**
 * 캐시 강제 무효화 (삭제)
 */
export async function invalidateCache(): Promise<{ success: boolean; message: string }> {
  try {
    const { existsSync } = await import('fs');
    const { unlink } = await import('fs/promises');
    const { STOCK_LISTING_CACHE_FILE } = await getCachePaths();

    if (!existsSync(STOCK_LISTING_CACHE_FILE)) {
      return { success: true, message: '캐시 파일이 존재하지 않습니다.' };
    }

    await unlink(STOCK_LISTING_CACHE_FILE);
    console.log('[Dynamic Mapping] 캐시 강제 무효화 완료');
    return { success: true, message: '캐시가 무효화되었습니다.' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Dynamic Mapping] 캐시 무효화 실패:', errorMessage);
    return { success: false, message: errorMessage };
  }
}

/**
 * 캐시 상태 조회
 */
export async function getCacheStatus(): Promise<{
  exists: boolean;
  stockCount: number;
  timestamp: number | null;
  isExpired: boolean;
  version: string | null;
  ageHours: number | null;
}> {
  try {
    const cached = await readCachedStockListing();

    if (!cached) {
      return {
        exists: false,
        stockCount: 0,
        timestamp: null,
        isExpired: true,
        version: null,
        ageHours: null,
      };
    }

    const { existsSync } = await import('fs');
    const { readFile } = await import('fs/promises');
    const { STOCK_LISTING_CACHE_FILE } = await getCachePaths();

    let version: string | null = null;
    let timestamp: number | null = null;

    if (existsSync(STOCK_LISTING_CACHE_FILE)) {
      const content = await readFile(STOCK_LISTING_CACHE_FILE, 'utf-8');
      const raw = JSON.parse(content);
      version = raw.version || null;
      timestamp = raw.timestamp || null;
    }

    const ageMs = timestamp ? Date.now() - timestamp : null;
    const ageHours = ageMs ? Math.round(ageMs / (1000 * 60 * 60) * 10) / 10 : null;

    return {
      exists: true,
      stockCount: cached.data.length,
      timestamp,
      isExpired: cached.isExpired,
      version,
      ageHours,
    };
  } catch (error) {
    console.error('[Dynamic Mapping] 캐시 상태 조회 실패:', error);
    return {
      exists: false,
      stockCount: 0,
      timestamp: null,
      isExpired: true,
      version: null,
      ageHours: null,
    };
  }
}
