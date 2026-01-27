/**
 * Saveticker API 클라이언트
 *
 * 리포트 목록 조회 및 PDF 다운로드
 * - 자동 토큰 갱신 연동
 * - 401 응답 시 토큰 재발급 및 재시도
 * - Playwright를 사용한 PDF 다운로드
 */

import { chromium, type Browser } from 'playwright';
import { getValidToken, refreshToken } from './auth';

const SAVETICKER_API_BASE = 'https://api.saveticker.com/api';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

export async function closeBrowserClient(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * 리포트 정보 타입 (API 응답 구조에 맞춤)
 */
export interface SavetickerReport {
  id: string;
  title: string;
  content?: string;
  author_name?: string;
  author_profile_image_url?: string | null;
  has_pdf: boolean;
  tag_names?: string[];
  created_at: string; // ISO date string
  view_count?: number;
}

/**
 * 리포트 목록 응답 타입
 */
interface ReportsListResponse {
  reports?: SavetickerReport[];
  items?: SavetickerReport[];
  data?: SavetickerReport[];
  // 다양한 API 응답 형태 대응
  [key: string]: unknown;
}

/**
 * API 요청 헬퍼
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOnUnauthorized = true
): Promise<T> {
  const token = await getValidToken();

  const response = await fetch(`${SAVETICKER_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  // 401 Unauthorized - 토큰 갱신 후 재시도
  if (response.status === 401 && retryOnUnauthorized) {
    console.log('[Saveticker Client] 401 응답 - 토큰 재발급 후 재시도');
    await refreshToken();
    return apiRequest<T>(endpoint, options, false);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API 요청 실패 [${response.status}]: ${errorText.substring(0, 200)}`
    );
  }

  return response.json();
}

/**
 * 리포트 목록 조회
 */
export async function getReportsList(): Promise<SavetickerReport[]> {
  console.log('[Saveticker Client] 리포트 목록 조회...');

  const response = await apiRequest<ReportsListResponse>('/reports/list');

  // API 응답 구조에 따라 리포트 배열 추출
  let reports: SavetickerReport[] = [];

  if (Array.isArray(response)) {
    reports = response;
  } else if (response.reports) {
    reports = response.reports;
  } else if (response.items) {
    reports = response.items;
  } else if (response.data) {
    reports = response.data;
  }

  console.log(`[Saveticker Client] ${reports.length}개 리포트 조회됨`);
  return reports;
}

/**
 * 최신 리포트 가져오기
 */
export async function getLatestReport(): Promise<SavetickerReport | null> {
  const reports = await getReportsList();

  if (reports.length === 0) {
    console.log('[Saveticker Client] 리포트가 없습니다');
    return null;
  }

  // 날짜 기준 정렬 (최신순) - API가 이미 정렬되어 있지만 확실히 하기 위해
  const sorted = reports.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  const latest = sorted[0];
  console.log(`[Saveticker Client] 최신 리포트: ${latest.title} (${latest.created_at})`);

  return latest;
}

/**
 * 특정 날짜의 리포트 가져오기
 */
export async function getReportByDate(
  targetDate: string
): Promise<SavetickerReport | null> {
  const reports = await getReportsList();

  // 날짜 비교 (YYYY-MM-DD 형식)
  const target = targetDate.split('T')[0];

  const found = reports.find((report) => {
    const reportDate = report.created_at.split('T')[0];
    return reportDate === target;
  });

  if (!found) {
    console.log(`[Saveticker Client] ${targetDate} 날짜의 리포트 없음`);
    return null;
  }

  return found;
}

/**
 * Playwright를 사용한 PDF 다운로드
 * - 웹 페이지에서 PDF 다운로드 버튼 클릭
 * - 다운로드된 PDF를 Buffer로 반환
 */
export async function downloadPDF(
  report: SavetickerReport
): Promise<Buffer> {
  if (!report.has_pdf) {
    throw new Error('리포트에 PDF가 없습니다');
  }

  console.log(`[Saveticker Client] PDF 다운로드 시작: ${report.title}`);

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    // 1. 로그인
    await page.goto('https://www.saveticker.com/login', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);

    await page.click('text=이메일로 로그인');
    await page.waitForTimeout(1500);

    await page.fill('input[type="email"]', process.env.SAVETICKER_EMAIL!);
    await page.fill('input[type="password"]', process.env.SAVETICKER_PASSWORD!);
    await page.waitForTimeout(500);

    await page.locator('div:has-text("로그인"):not(:has-text("이메일로"))').last().click();
    await page.waitForTimeout(4000);

    // 2. 리포트 페이지로 이동
    await page.goto('https://www.saveticker.com/app/report', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    // 3. 해당 리포트의 PDF 다운로드 버튼 찾기 및 클릭
    // 리포트 제목으로 해당 카드 찾기
    const reportCard = page.locator(`text=${report.title}`).first();
    const cardExists = await reportCard.count() > 0;

    if (!cardExists) {
      throw new Error(`리포트를 찾을 수 없습니다: ${report.title}`);
    }

    // 해당 카드 근처의 PDF 다운로드 버튼 찾기
    // 카드 컨테이너를 찾아서 그 안의 PDF 다운로드 버튼 클릭
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

    // 첫 번째 PDF 다운로드 버튼 클릭 (최신 리포트)
    const pdfButton = page.locator('text=PDF 다운로드').first();
    await pdfButton.click();

    // 4. 다운로드 완료 대기
    const download = await downloadPromise;
    const tempPath = `/tmp/saveticker-${Date.now()}.pdf`;
    await download.saveAs(tempPath);

    // 5. 파일 읽기
    const fs = await import('fs/promises');
    const pdfBuffer = await fs.readFile(tempPath);

    // 임시 파일 삭제
    await fs.unlink(tempPath).catch(() => {});

    console.log(`[Saveticker Client] PDF 다운로드 완료 (${pdfBuffer.length} bytes)`);
    return pdfBuffer;
  } finally {
    await context.close();
  }
}

/**
 * 최신 리포트 PDF 다운로드 (간편 함수)
 */
export async function downloadLatestReportPDF(): Promise<{
  report: SavetickerReport;
  pdf: Buffer;
} | null> {
  const report = await getLatestReport();

  if (!report) {
    return null;
  }

  if (!report.has_pdf) {
    console.log('[Saveticker Client] 최신 리포트에 PDF가 없습니다');
    return { report, pdf: Buffer.alloc(0) };
  }

  const pdf = await downloadPDF(report);

  return { report, pdf };
}

/**
 * PDF를 파일로 저장
 */
export async function savePDFToFile(
  pdf: Buffer,
  filePath: string
): Promise<void> {
  const fs = await import('fs/promises');
  await fs.writeFile(filePath, pdf);
  console.log(`[Saveticker Client] PDF 저장: ${filePath}`);
}
