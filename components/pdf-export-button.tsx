'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { AnalyzeResult } from '@/lib/types';

interface PDFExportButtonProps {
  result: AnalyzeResult;
  chartsContainerId?: string;
  className?: string;
}

export function PDFExportButton({
  result,
  chartsContainerId = 'charts-container',
  className,
}: PDFExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const handleExport = async () => {
    setIsExporting(true);
    setProgress('PDF 생성 중...');

    try {
      // 동적 임포트로 pdf-generator 로드 (클라이언트 사이드에서만)
      const { exportAnalysisToPDF } = await import('@/lib/pdf-generator');

      // 차트 컨테이너 찾기 (선택적)
      const chartsContainer = document.getElementById(chartsContainerId);

      setProgress('차트 캡처 중...');

      await exportAnalysisToPDF(result, {
        includeCharts: !!chartsContainer,
        chartsContainer,
      });

      setProgress('완료!');
      setTimeout(() => setProgress(''), 2000);
    } catch (error) {
      console.error('PDF export failed:', error);
      setProgress('오류 발생');
      setTimeout(() => setProgress(''), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={isExporting}
      variant="outline"
      className={className}
    >
      {isExporting ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {progress || 'PDF 생성 중...'}
        </>
      ) : (
        <>
          <svg
            className="mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          PDF 다운로드
        </>
      )}
    </Button>
  );
}
