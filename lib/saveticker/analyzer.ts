/**
 * Saveticker PDF 분석 모듈
 *
 * PDF를 Gemini API에 전달하여 분석하는 기능
 * - 기존 주식 분석 프롬프트에 통합 가능
 * - 단일 Gemini API 호출로 종합 분석
 */

import {
  isSavetickerConfigured,
  getLatestReport,
  downloadPDF,
  closeBrowser,
  type SavetickerReport,
} from './index';

/**
 * Saveticker PDF 데이터 (Gemini 전달용)
 */
export interface SavetickerPDFData {
  report: SavetickerReport;
  pdfBase64: string;
  mimeType: 'application/pdf';
}

/**
 * 캐시된 PDF 데이터 (세션 동안 재사용)
 */
let cachedPDFData: {
  data: SavetickerPDFData;
  fetchedAt: number;
  reportDate: string;
} | null = null;

// 캐시 유효 시간 (1시간)
const CACHE_TTL = 60 * 60 * 1000;

/**
 * 최신 Saveticker PDF 가져오기 (캐시 지원)
 *
 * @param forceRefresh 캐시 무시하고 새로 가져오기
 * @returns PDF 데이터 또는 null (미설정/실패 시)
 */
export async function fetchLatestSavetickerPDF(
  forceRefresh = false
): Promise<SavetickerPDFData | null> {
  // 환경변수 미설정 시 null 반환
  if (!isSavetickerConfigured()) {
    console.log('[Saveticker Analyzer] 환경변수 미설정, 건너뜀');
    return null;
  }

  const now = Date.now();

  // 캐시 확인 (유효하면 캐시 반환)
  if (!forceRefresh && cachedPDFData) {
    const cacheAge = now - cachedPDFData.fetchedAt;
    if (cacheAge < CACHE_TTL) {
      console.log(
        `[Saveticker Analyzer] 캐시 사용 (${Math.round(cacheAge / 1000)}초 전 수집)`
      );
      return cachedPDFData.data;
    }
    console.log('[Saveticker Analyzer] 캐시 만료, 새로 수집');
  }

  try {
    console.log('[Saveticker Analyzer] 최신 리포트 조회 중...');

    // 1. 최신 리포트 정보 가져오기
    const report = await getLatestReport();

    if (!report) {
      console.log('[Saveticker Analyzer] 리포트 없음');
      return null;
    }

    // 2. 캐시된 리포트와 동일한 날짜면 캐시 반환
    if (
      cachedPDFData &&
      cachedPDFData.reportDate === report.created_at.split('T')[0]
    ) {
      console.log('[Saveticker Analyzer] 동일 날짜 리포트, 캐시 유지');
      cachedPDFData.fetchedAt = now; // 캐시 갱신 시간 업데이트
      return cachedPDFData.data;
    }

    // 3. PDF 다운로드
    if (!report.has_pdf) {
      console.log('[Saveticker Analyzer] 리포트에 PDF 없음');
      return null;
    }

    console.log(`[Saveticker Analyzer] PDF 다운로드 중: ${report.title}`);
    const pdfBuffer = await downloadPDF(report);

    // 4. Base64 인코딩
    const pdfBase64 = pdfBuffer.toString('base64');
    console.log(
      `[Saveticker Analyzer] PDF 준비 완료 (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`
    );

    // 5. 캐시 저장
    const pdfData: SavetickerPDFData = {
      report,
      pdfBase64,
      mimeType: 'application/pdf',
    };

    cachedPDFData = {
      data: pdfData,
      fetchedAt: now,
      reportDate: report.created_at.split('T')[0],
    };

    return pdfData;
  } catch (error) {
    console.error('[Saveticker Analyzer] PDF 수집 실패:', error);
    return null;
  } finally {
    // 브라우저 정리
    await closeBrowser().catch(() => {});
  }
}

/**
 * 캐시 초기화
 */
export function clearPDFCache(): void {
  cachedPDFData = null;
  console.log('[Saveticker Analyzer] 캐시 초기화됨');
}

/**
 * 캐시 상태 조회
 */
export function getPDFCacheStatus(): {
  cached: boolean;
  reportDate: string | null;
  cacheAge: number | null;
} {
  if (!cachedPDFData) {
    return { cached: false, reportDate: null, cacheAge: null };
  }

  return {
    cached: true,
    reportDate: cachedPDFData.reportDate,
    cacheAge: Date.now() - cachedPDFData.fetchedAt,
  };
}

/**
 * Saveticker 리포트 분석을 위한 Gemini 프롬프트 섹션 생성
 *
 * @param pdfData PDF 데이터
 * @returns 프롬프트에 추가할 텍스트 섹션
 */
export function generateSavetickerPromptSection(
  pdfData: SavetickerPDFData
): string {
  const reportDate = pdfData.report.created_at.split('T')[0];

  return `
## Saveticker 시황 리포트 (${reportDate})

**리포트 제목**: ${pdfData.report.title}
**작성자**: ${pdfData.report.author_name || '세이브티커'}
**작성일**: ${reportDate}

위에 첨부된 PDF는 전문 증권 애널리스트가 작성한 일일 시황 리포트입니다.

**중요: PDF에서 다음 3개 섹션만 참고하세요**:
1. **전일 요약** - 전일 시장 동향 및 주요 지수 흐름
2. **오늘의 소식** - 당일 주요 뉴스 및 이슈
3. **주요 일정** - 예정된 경제 지표 발표, 기업 실적 발표 등

**리포트 분석 지침**:
- 위 3개 섹션의 내용만 추출하여 주식 종목 분석에 반영하세요.
- 분석 대상 종목과 관련된 뉴스나 일정이 있다면 반드시 언급하세요.
- 시장 전반의 분위기와 투자 심리를 파악하여 종목 분석에 활용하세요.
- PDF의 다른 섹션(개별 종목 추천 등)은 무시하세요.

---
`;
}
