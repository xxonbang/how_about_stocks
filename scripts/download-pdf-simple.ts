/**
 * 간소화된 PDF 다운로드 스크립트
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

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

async function downloadPdf() {
  console.log('=== PDF 다운로드 ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true, // 다운로드 허용
  });
  const page = await context.newPage();

  // 다운로드 요청 모니터링
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('pdf') || url.includes('download')) {
      console.log(`📤 PDF Request: ${url}`);
    }
  });

  try {
    // 1. 로그인
    console.log('1. 로그인 중...');
    await page.goto('https://www.saveticker.com/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await page.click('text=이메일로 로그인');
    await page.waitForTimeout(1500);

    await page.fill('input[type="email"]', process.env.SAVETICKER_EMAIL!);
    await page.fill('input[type="password"]', process.env.SAVETICKER_PASSWORD!);
    await page.waitForTimeout(500);

    await page.locator('div:has-text("로그인"):not(:has-text("이메일로"))').last().click();

    // 로그인 완료 대기
    await page.waitForTimeout(4000);
    console.log('   로그인 완료!\n');

    // 2. 리포트 페이지로 이동
    console.log('2. 리포트 페이지 이동...');
    await page.goto('https://www.saveticker.com/app/report', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log('   페이지 로드 완료!\n');

    // 3. 첫 번째 "PDF 다운로드" 버튼 클릭
    console.log('3. PDF 다운로드 버튼 클릭...');

    // 다운로드 이벤트 대기 설정
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

    // "PDF 다운로드" 버튼 클릭
    const pdfButton = page.locator('text=PDF 다운로드').first();
    const buttonCount = await pdfButton.count();
    console.log(`   PDF 다운로드 버튼 발견: ${buttonCount}개`);

    if (buttonCount > 0) {
      await pdfButton.click();
      console.log('   버튼 클릭 완료!\n');

      // 4. 다운로드 완료 대기
      console.log('4. 다운로드 대기 중...');
      const download = await downloadPromise;

      console.log('\n✅ 다운로드 성공!');
      console.log(`   파일명: ${download.suggestedFilename()}`);
      console.log(`   URL: ${download.url()}`);

      // 파일 저장
      const savePath = `/tmp/${download.suggestedFilename()}`;
      await download.saveAs(savePath);
      console.log(`   저장 경로: ${savePath}`);

      // 파일 크기 확인
      const stats = fs.statSync(savePath);
      console.log(`   파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);

      return {
        success: true,
        filename: download.suggestedFilename(),
        url: download.url(),
        path: savePath,
        size: stats.size,
      };
    } else {
      throw new Error('PDF 다운로드 버튼을 찾을 수 없습니다');
    }

  } catch (error) {
    console.error('\n❌ 에러:', error);
    await page.screenshot({ path: '/tmp/pdf-download-error.png' });
    console.log('에러 스크린샷: /tmp/pdf-download-error.png');
    throw error;
  } finally {
    await browser.close();
  }
}

downloadPdf()
  .then(result => {
    console.log('\n=== 결과 ===');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(() => process.exit(1));
