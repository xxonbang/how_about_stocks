/**
 * 전체 기능 점검 테스트 (Gemini API 제외)
 * 실행: npx tsx scripts/test-all-components.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// .env.local 수동 로드
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  testFn: () => Promise<string | void>
): Promise<void> {
  const start = Date.now();
  try {
    const details = await testFn();
    results.push({
      name,
      status: 'pass',
      duration: Date.now() - start,
      details: details || undefined,
    });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
    if (details) console.log(`   ${details}`);
  } catch (error) {
    results.push({
      name,
      status: 'fail',
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`❌ ${name} (${Date.now() - start}ms)`);
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       전체 기능 점검 테스트 (Gemini API 제외)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ========== 1. 한국투자증권 (KIS) API ==========
  console.log('📊 1. 한국투자증권 (KIS) API\n');

  const kisModule = await import('../lib/finance-kis');

  await runTest('KIS 환경변수 설정', async () => {
    if (!kisModule.isKISConfigured()) {
      throw new Error('KIS_APP_KEY 또는 KIS_APP_SECRET 미설정');
    }
    return 'KIS_APP_KEY, KIS_APP_SECRET 설정됨';
  });

  await runTest('KIS 토큰 발급', async () => {
    const isValid = await kisModule.validateKISApiKey();
    if (!isValid) throw new Error('토큰 발급 실패');
    return '토큰 발급 성공';
  });

  await runTest('KIS 삼성전자 현재가 조회', async () => {
    const data = await kisModule.fetchStockDataKIS('005930');
    if (!data) throw new Error('데이터 없음');
    return `현재가: ${data.currentPrice.toLocaleString()}원, 등락률: ${data.changePercent}%`;
  });

  await runTest('KIS 일별 시세 조회', async () => {
    const data = await kisModule.fetchDailyPricesKIS('005930', 'D');
    if (data.length === 0) throw new Error('데이터 없음');
    return `${data.length}개 일별 데이터 조회`;
  });

  // ========== 2. FMP API (미국 주식) ==========
  console.log('\n📈 2. FMP API (미국 주식)\n');

  const fmpModule = await import('../lib/finance-fmp');

  await runTest('FMP 환경변수 설정', async () => {
    if (!process.env.FMP_API_KEY) {
      throw new Error('FMP_API_KEY 미설정');
    }
    return 'FMP_API_KEY 설정됨';
  });

  await runTest('FMP API 키 유효성 검증', async () => {
    const isValid = await fmpModule.validateFMPApiKey();
    if (!isValid) throw new Error('API 키 유효하지 않음');
    return 'API 키 유효함';
  });

  await runTest('FMP AAPL 시세 조회', async () => {
    const data = await fmpModule.fetchStockDataFMP('AAPL');
    if (!data) throw new Error('데이터 없음');
    return `현재가: $${data.price}, 등락률: ${data.changePercent}%`;
  });

  await runTest('FMP 히스토리컬 데이터 조회', async () => {
    const data = await fmpModule.fetchHistoricalPricesFMP('AAPL', 30);
    if (data.length === 0) throw new Error('데이터 없음');
    return `${data.length}개 일별 데이터 조회`;
  });

  // ========== 3. Saveticker PDF 수집 ==========
  console.log('\n📄 3. Saveticker PDF 수집\n');

  const savetickerModule = await import('../lib/saveticker');

  await runTest('Saveticker 환경변수 설정', async () => {
    if (!savetickerModule.isSavetickerConfigured()) {
      throw new Error('SAVETICKER_EMAIL 또는 SAVETICKER_PASSWORD 미설정');
    }
    return 'SAVETICKER_EMAIL, SAVETICKER_PASSWORD 설정됨';
  });

  await runTest('Saveticker 로그인 및 토큰 발급', async () => {
    const token = await savetickerModule.getValidToken();
    if (!token) throw new Error('토큰 발급 실패');
    return `토큰 길이: ${token.length}자`;
  });

  await runTest('Saveticker 리포트 목록 조회', async () => {
    const reports = await savetickerModule.getReportsList();
    if (reports.length === 0) throw new Error('리포트 없음');
    return `${reports.length}개 리포트 조회`;
  });

  await runTest('Saveticker 최신 리포트 확인', async () => {
    const latest = await savetickerModule.getLatestReport();
    if (!latest) throw new Error('최신 리포트 없음');
    return `제목: ${latest.title}, PDF: ${latest.has_pdf ? '있음' : '없음'}`;
  });

  // 브라우저 정리
  await savetickerModule.closeBrowser();

  // ========== 4. 기술적 지표 계산 ==========
  console.log('\n📐 4. 기술적 지표 계산\n');

  const financeModule = await import('../lib/finance');
  const indicatorsModule = await import('../lib/indicators');

  // 테스트용 샘플 데이터 (30일치)
  const samplePrices = [
    100, 102, 101, 103, 105, 104, 106, 108, 107, 109,
    111, 110, 112, 114, 113, 115, 117, 116, 118, 120,
    119, 121, 123, 122, 124, 126, 125, 127, 129, 128
  ];
  const sampleVolumes = samplePrices.map(() => Math.floor(Math.random() * 1000000) + 500000);

  await runTest('RSI 계산', async () => {
    const rsi = financeModule.calculateRSI(samplePrices, 14);
    if (rsi === null || rsi === undefined) throw new Error('계산 실패');
    return `RSI(14): ${rsi.toFixed(2)}`;
  });

  await runTest('이동평균 계산', async () => {
    const ma5 = financeModule.calculateMA(samplePrices, 5);
    const ma20 = financeModule.calculateMA(samplePrices, 20);
    if (ma5 === null) throw new Error('MA5 계산 실패');
    return `MA5: ${ma5.toFixed(2)}, MA20: ${ma20?.toFixed(2) || 'N/A'}`;
  });

  await runTest('볼린저 밴드 계산', async () => {
    const bb = indicatorsModule.calculateBollingerBands(samplePrices, 20);
    if (!bb) throw new Error('계산 실패');
    return `상단: ${bb.upper.toFixed(2)}, 중심: ${bb.middle.toFixed(2)}, 하단: ${bb.lower.toFixed(2)}`;
  });

  await runTest('MACD 계산', async () => {
    const macd = indicatorsModule.calculateMACD(samplePrices);
    if (!macd) throw new Error('계산 실패');
    return `MACD: ${macd.macd.toFixed(2)}, Signal: ${macd.signal.toFixed(2)}`;
  });

  await runTest('스토캐스틱 계산', async () => {
    const highs = samplePrices.map(p => p + 2);
    const lows = samplePrices.map(p => p - 2);
    const stoch = indicatorsModule.calculateStochastic(highs, lows, samplePrices);
    if (!stoch) throw new Error('계산 실패');
    return `%K: ${stoch.k.toFixed(2)}, %D: ${stoch.d.toFixed(2)}`;
  });

  await runTest('거래량 지표 계산', async () => {
    const volIndicators = indicatorsModule.calculateVolumeIndicators(sampleVolumes);
    if (!volIndicators) throw new Error('계산 실패');
    return `평균거래량: ${volIndicators.averageVolume.toLocaleString()}, 비율: ${volIndicators.volumeRatio.toFixed(2)}배`;
  });

  // ========== 5. 종목 검색 API ==========
  console.log('\n🔍 5. 종목 검색 기능\n');

  // 종목 검색 (Yahoo/Finnhub)
  await runTest('종목 검색 (삼성전자)', async () => {
    const searchModule = await import('../lib/stock-search');
    const results = await searchModule.searchStocks('삼성전자');
    if (results.length === 0) throw new Error('검색 결과 없음');
    return `${results.length}개 결과 (첫번째: ${results[0].name})`;
  });

  await runTest('종목 검색 (AAPL)', async () => {
    const searchModule = await import('../lib/stock-search');
    const results = await searchModule.searchStocks('AAPL');
    if (results.length === 0) throw new Error('검색 결과 없음');
    return `${results.length}개 결과 (첫번째: ${results[0].name})`;
  });

  // ========== 6. 인증 시스템 ==========
  console.log('\n🔐 6. 인증 시스템\n');

  const authModule = await import('../lib/auth');

  await runTest('JWT 토큰 생성', async () => {
    const token = await authModule.createToken('testuser');
    if (!token) throw new Error('토큰 생성 실패');
    return `토큰 길이: ${token.length}자`;
  });

  await runTest('JWT 토큰 검증', async () => {
    const token = await authModule.createToken('testuser');
    const payload = await authModule.verifyToken(token);
    if (!payload) throw new Error('토큰 검증 실패');
    return `username: ${payload.username}, role: ${payload.role}`;
  });

  await runTest('비밀번호 해시 생성', async () => {
    const hash = authModule.hashPassword('testpassword');
    if (!hash) throw new Error('해시 생성 실패');
    return `해시 길이: ${hash.length}자`;
  });

  // ========== 결과 요약 ==========
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                      테스트 결과 요약');
  console.log('═══════════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  const total = results.length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`총 ${total}개 테스트 | ✅ 성공: ${passed} | ❌ 실패: ${failed} | ⏭️ 스킵: ${skipped}`);
  console.log(`총 소요 시간: ${(totalTime / 1000).toFixed(2)}초\n`);

  if (failed > 0) {
    console.log('실패한 테스트:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    console.log();
  }

  // 최종 결과
  if (failed === 0) {
    console.log('🎉 모든 테스트 통과! (Gemini API 제외)\n');
  } else {
    console.log(`⚠️ ${failed}개 테스트 실패\n`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('테스트 실행 중 오류:', error);
  process.exit(1);
});
