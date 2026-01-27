/**
 * 한국투자증권 API 연결 테스트
 * 실행: npx tsx scripts/test-kis-api.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// .env.local 수동 로드 (모듈 import 전에 실행)
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

// 환경변수 로드 후 동적 import
const loadKISModule = async () => {
  const module = await import('../lib/finance-kis');
  return module;
};

async function testKISApi() {
  console.log('=== 한국투자증권 API 연결 테스트 ===\n');

  // 모듈 동적 로드
  const {
    isKISConfigured,
    validateKISApiKey,
    fetchQuoteKIS,
    fetchDailyPricesKIS,
    fetchStockDataKIS,
  } = await loadKISModule();

  // 1. 환경변수 확인
  console.log('1. 환경변수 확인');
  console.log(`   KIS_APP_KEY: ${process.env.KIS_APP_KEY ? '✅ 설정됨 (' + process.env.KIS_APP_KEY.substring(0, 8) + '...)' : '❌ 미설정'}`);
  console.log(`   KIS_APP_SECRET: ${process.env.KIS_APP_SECRET ? '✅ 설정됨 (' + process.env.KIS_APP_SECRET.substring(0, 8) + '...)' : '❌ 미설정'}`);
  console.log(`   isKISConfigured(): ${isKISConfigured() ? '✅' : '❌'}\n`);

  if (!isKISConfigured()) {
    console.log('❌ KIS API 키가 설정되지 않았습니다.');
    process.exit(1);
  }

  // 2. API 키 유효성 검증
  console.log('2. API 키 유효성 검증 (토큰 발급 테스트)');
  const startTime = Date.now();
  try {
    const isValid = await validateKISApiKey();
    const duration = Date.now() - startTime;
    console.log(`   유효성: ${isValid ? '✅ 유효' : '❌ 무효'} (${duration}ms)\n`);

    if (!isValid) {
      console.log('❌ API 키가 유효하지 않습니다. 키를 확인해주세요.');
      process.exit(1);
    }
  } catch (error) {
    console.log(`   ❌ 검증 실패: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }

  // 3. 삼성전자 현재가 조회
  console.log('3. 삼성전자(005930) 현재가 조회');
  try {
    const quote = await fetchQuoteKIS('005930');
    if (quote) {
      console.log(`   종목명: ${quote.rprs_mrkt_kor_name || '삼성전자'}`);
      console.log(`   현재가: ${parseInt(quote.stck_prpr).toLocaleString()}원`);
      console.log(`   전일대비: ${quote.prdy_vrss}원 (${quote.prdy_ctrt}%)`);
      console.log(`   거래량: ${parseInt(quote.acml_vol).toLocaleString()}주`);
      console.log(`   시가총액: ${(parseInt(quote.hts_avls) * 1).toLocaleString()}억원`);
      console.log(`   PER: ${quote.per}`);
      console.log(`   PBR: ${quote.pbr}\n`);
    } else {
      console.log('   ❌ 시세 조회 실패\n');
    }
  } catch (error) {
    console.log(`   ❌ 조회 실패: ${error instanceof Error ? error.message : error}\n`);
  }

  // 4. SK하이닉스 통합 데이터 조회
  console.log('4. SK하이닉스(000660) 통합 데이터 조회');
  try {
    const stockData = await fetchStockDataKIS('000660');
    if (stockData) {
      console.log(`   종목: ${stockData.symbol}`);
      console.log(`   현재가: ${stockData.currentPrice.toLocaleString()}원`);
      console.log(`   등락률: ${stockData.changePercent >= 0 ? '+' : ''}${stockData.changePercent}%`);
      console.log(`   거래량: ${stockData.volume.toLocaleString()}주`);
      console.log(`   52주 최고/최저: ${stockData.high52Week.toLocaleString()} / ${stockData.low52Week.toLocaleString()}`);
      console.log(`   외국인 보유율: ${stockData.foreignOwnership}%\n`);
    } else {
      console.log('   ❌ 데이터 조회 실패\n');
    }
  } catch (error) {
    console.log(`   ❌ 조회 실패: ${error instanceof Error ? error.message : error}\n`);
  }

  // 5. 일별 시세 조회 (최근 5일)
  console.log('5. 삼성전자 일별 시세 조회 (최근 5일)');
  try {
    const dailyPrices = await fetchDailyPricesKIS('005930', 'D');
    if (dailyPrices.length > 0) {
      console.log(`   총 ${dailyPrices.length}개 데이터 조회됨`);
      dailyPrices.slice(0, 5).forEach((day, i) => {
        const date = day.stck_bsop_date;
        const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
        console.log(`   ${i + 1}. [${formattedDate}] 종가: ${parseInt(day.stck_clpr).toLocaleString()}원, 거래량: ${parseInt(day.acml_vol).toLocaleString()}`);
      });
      console.log();
    } else {
      console.log('   ❌ 일별 시세 조회 실패\n');
    }
  } catch (error) {
    console.log(`   ❌ 조회 실패: ${error instanceof Error ? error.message : error}\n`);
  }

  console.log('✅ 한국투자증권 API 연결 테스트 완료!');
}

testKISApi().catch(console.error);
