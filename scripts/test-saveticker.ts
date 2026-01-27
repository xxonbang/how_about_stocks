/**
 * Saveticker 모듈 테스트 스크립트
 *
 * 실행: npx tsx scripts/test-saveticker.ts
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

import {
  isSavetickerConfigured,
  loginWithEmail,
  getValidToken,
  getCachedTokenInfo,
  getReportsList,
  getLatestReport,
  closeBrowser,
} from '../lib/saveticker';

async function testSaveticker() {
  console.log('=== Saveticker 모듈 테스트 ===\n');

  // 1. 환경변수 확인
  console.log('1. 환경변수 확인');
  const configured = isSavetickerConfigured();
  console.log(`   SAVETICKER_EMAIL: ${process.env.SAVETICKER_EMAIL ? '✅ 설정됨' : '❌ 미설정'}`);
  console.log(`   SAVETICKER_PASSWORD: ${process.env.SAVETICKER_PASSWORD ? '✅ 설정됨' : '❌ 미설정'}`);
  console.log(`   구성 완료: ${configured ? '✅' : '❌'}\n`);

  if (!configured) {
    console.log('❌ .env.local에 SAVETICKER_EMAIL과 SAVETICKER_PASSWORD를 설정해주세요.');
    process.exit(1);
  }

  try {
    // 2. 로그인 테스트
    console.log('2. 이메일 로그인 테스트');
    const token = await getValidToken();
    console.log(`   토큰 획득: ✅`);
    console.log(`   토큰 길이: ${token.length}자`);
    console.log(`   토큰 미리보기: ${token.substring(0, 50)}...\n`);

    // 3. 토큰 정보 확인
    console.log('3. 토큰 정보');
    const tokenInfo = getCachedTokenInfo();
    console.log(`   사용자: ${tokenInfo.username}`);
    console.log(`   만료일: ${tokenInfo.expiresAt?.toLocaleString('ko-KR')}`);
    console.log(`   남은 기간: ${tokenInfo.remainingDays}일\n`);

    // 4. 리포트 목록 조회
    console.log('4. 리포트 목록 조회');
    try {
      const reports = await getReportsList();
      console.log(`   총 ${reports.length}개 리포트 조회됨`);

      if (reports.length > 0) {
        console.log('\n   최근 5개 리포트:');
        reports.slice(0, 5).forEach((report, i) => {
          const date = report.created_at.split('T')[0];
          console.log(`   ${i + 1}. [${date}] ${report.title}`);
          console.log(`      PDF 있음: ${report.has_pdf ? '✅' : '❌'}`);
        });
      }
    } catch (error) {
      console.log(`   ⚠️ 리포트 조회 실패: ${error instanceof Error ? error.message : error}`);
      console.log('   (API 응답 구조 확인 필요)');
    }

    // 5. 최신 리포트
    console.log('\n5. 최신 리포트 조회');
    try {
      const latest = await getLatestReport();
      if (latest) {
        console.log(`   제목: ${latest.title}`);
        console.log(`   날짜: ${latest.created_at.split('T')[0]}`);
        console.log(`   PDF 있음: ${latest.has_pdf ? '✅' : '❌'}`);
        console.log(`   조회수: ${latest.view_count || 0}`);
      } else {
        console.log('   최신 리포트 없음');
      }
    } catch (error) {
      console.log(`   ⚠️ 조회 실패: ${error instanceof Error ? error.message : error}`);
    }

    console.log('\n✅ 테스트 완료!');
  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

testSaveticker();
