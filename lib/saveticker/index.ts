/**
 * Saveticker 모듈
 *
 * 세이브티커(saveticker.com) 리포트 자동 수집
 * - 이메일 로그인 자동화 (Playwright)
 * - JWT 토큰 자동 갱신
 * - 리포트 목록 조회 및 PDF 다운로드
 *
 * @example
 * ```typescript
 * import { getLatestReport, downloadPDF, isSavetickerConfigured } from '@/lib/saveticker';
 *
 * if (isSavetickerConfigured()) {
 *   const report = await getLatestReport();
 *   if (report?.pdfUrl) {
 *     const pdf = await downloadPDF(report);
 *     // pdf를 Gemini에 전달하여 분석
 *   }
 * }
 * ```
 */

// 인증
export {
  isSavetickerConfigured,
  loginWithEmail,
  getValidToken,
  refreshToken,
  getCachedTokenInfo,
  clearTokenCache,
  closeBrowser,
} from './auth';

// 클라이언트
export {
  getReportsList,
  getLatestReport,
  getReportByDate,
  downloadPDF,
  downloadLatestReportPDF,
  savePDFToFile,
  closeBrowserClient,
  type SavetickerReport,
} from './client';
