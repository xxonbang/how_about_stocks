/**
 * PDF 생성 유틸리티
 *
 * jspdf + html2canvas를 사용하여 분석 결과를 PDF로 변환
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { AnalyzeResult } from './types';

// PDF 설정
const PDF_CONFIG = {
  pageWidth: 210, // A4 width in mm
  pageHeight: 297, // A4 height in mm
  margin: 15,
  fontSize: {
    title: 18,
    subtitle: 14,
    heading: 12,
    body: 10,
    small: 8,
  },
  lineHeight: 1.4,
};

/**
 * 차트 요소를 캡처하여 이미지로 변환
 */
async function captureChartAsImage(
  chartElement: HTMLElement
): Promise<string | null> {
  try {
    const canvas = await html2canvas(chartElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true,
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to capture chart:', error);
    return null;
  }
}

/**
 * 텍스트를 여러 줄로 분할 (줄바꿈 처리)
 */
function splitTextToLines(
  pdf: jsPDF,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  paragraphs.forEach((paragraph) => {
    if (paragraph.trim() === '') {
      lines.push('');
      return;
    }
    const splitLines = pdf.splitTextToSize(paragraph, maxWidth);
    lines.push(...splitLines);
  });

  return lines;
}

/**
 * 마크다운을 일반 텍스트로 변환 (기본적인 변환만)
 */
function markdownToPlainText(markdown: string): string {
  return markdown
    // 헤더 (## -> 볼드 텍스트로 표시)
    .replace(/^### (.*$)/gm, '\n[$1]\n')
    .replace(/^## (.*$)/gm, '\n\n=== $1 ===\n')
    .replace(/^# (.*$)/gm, '\n\n<<< $1 >>>\n')
    // 볼드/이탤릭
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    // 리스트
    .replace(/^\s*[-*+]\s/gm, '  - ')
    // 코드 블록
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`(.*?)`/g, '$1')
    // 링크
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    // 수평선
    .replace(/^---$/gm, '\n---\n')
    // 여러 개의 연속 줄바꿈을 2개로 제한
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 숫자 포맷팅
 */
function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return '-';
  return value.toLocaleString('ko-KR');
}

/**
 * 퍼센트 포맷팅
 */
function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

interface PDFGeneratorOptions {
  includeCharts?: boolean;
  chartsContainer?: HTMLElement | null;
}

/**
 * 분석 결과를 PDF로 생성
 */
export async function generateAnalysisPDF(
  result: AnalyzeResult,
  options: PDFGeneratorOptions = {}
): Promise<Blob> {
  const { includeCharts = true, chartsContainer } = options;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const { pageWidth, pageHeight, margin, fontSize, lineHeight } = PDF_CONFIG;
  const contentWidth = pageWidth - margin * 2;

  let yPosition = margin;

  // 헬퍼 함수: 새 페이지 필요 시 추가
  const checkNewPage = (requiredHeight: number) => {
    if (yPosition + requiredHeight > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin;
    }
  };

  // 헬퍼 함수: 텍스트 출력
  const addText = (
    text: string,
    size: number,
    isBold = false,
    color: [number, number, number] = [0, 0, 0]
  ) => {
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    // jsPDF는 기본적으로 한글을 지원하지 않으므로, 영문/숫자만 표시됨
    // 한글 지원을 위해서는 별도의 폰트 임베딩이 필요하지만,
    // 여기서는 기본 구현으로 진행 (일부 한글이 깨질 수 있음)
    const lines = splitTextToLines(pdf, text, contentWidth);
    lines.forEach((line) => {
      checkNewPage(size * 0.35 * lineHeight);
      pdf.text(line, margin, yPosition);
      yPosition += size * 0.35 * lineHeight;
    });
  };

  // 1. 헤더
  pdf.setFillColor(59, 130, 246); // blue-500
  pdf.rect(0, 0, pageWidth, 25, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(fontSize.title);
  pdf.text(`${result.symbol} Analysis Report`, margin, 16);
  pdf.setFontSize(fontSize.small);
  const now = new Date();
  pdf.text(
    `Generated: ${now.toLocaleDateString('ko-KR')} ${now.toLocaleTimeString('ko-KR')}`,
    pageWidth - margin - 50,
    16
  );

  yPosition = 35;

  // 2. 요약 섹션
  pdf.setTextColor(0, 0, 0);
  addText('Summary', fontSize.subtitle, true);
  yPosition += 3;

  const { marketData } = result;

  // 요약 테이블 형식
  const summaryData = [
    ['Price', formatNumber(marketData.price)],
    ['Change', formatPercent(marketData.changePercent)],
    ['Volume', formatNumber(marketData.volume)],
    ...(marketData.rsi !== undefined ? [['RSI(14)', marketData.rsi.toString()]] : []),
    ...(marketData.disparity !== undefined
      ? [['Disparity(20)', `${marketData.disparity}%`]]
      : []),
    ...(marketData.vix !== undefined ? [['VIX', marketData.vix.toString()]] : []),
  ];

  // 요약 데이터 출력 (2열 레이아웃)
  pdf.setFontSize(fontSize.body);
  const colWidth = contentWidth / 2;
  let col = 0;
  summaryData.forEach(([label, value]) => {
    const x = margin + col * colWidth;
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${label}:`, x, yPosition);
    pdf.setTextColor(0, 0, 0);
    pdf.text(value, x + 35, yPosition);
    col++;
    if (col >= 2) {
      col = 0;
      yPosition += fontSize.body * 0.5;
    }
  });
  if (col !== 0) {
    yPosition += fontSize.body * 0.5;
  }

  yPosition += 10;

  // 3. 이동평균선 (있는 경우)
  if (marketData.movingAverages) {
    addText('Moving Averages', fontSize.heading, true, [59, 130, 246]);
    yPosition += 2;

    const maData = [
      ['MA5', formatNumber(marketData.movingAverages.ma5)],
      ['MA20', formatNumber(marketData.movingAverages.ma20)],
      ['MA60', formatNumber(marketData.movingAverages.ma60)],
      ['MA120', formatNumber(marketData.movingAverages.ma120)],
    ];

    pdf.setFontSize(fontSize.body);
    col = 0;
    maData.forEach(([label, value]) => {
      const x = margin + col * colWidth;
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${label}:`, x, yPosition);
      pdf.setTextColor(0, 0, 0);
      pdf.text(value, x + 25, yPosition);
      col++;
      if (col >= 2) {
        col = 0;
        yPosition += fontSize.body * 0.5;
      }
    });
    if (col !== 0) {
      yPosition += fontSize.body * 0.5;
    }

    yPosition += 8;
  }

  // 4. 볼린저 밴드 (있는 경우)
  if (marketData.bollingerBands) {
    addText('Bollinger Bands', fontSize.heading, true, [59, 130, 246]);
    yPosition += 2;

    const bbData = [
      ['Upper', formatNumber(marketData.bollingerBands.upper)],
      ['Middle', formatNumber(marketData.bollingerBands.middle)],
      ['Lower', formatNumber(marketData.bollingerBands.lower)],
      ['Bandwidth', `${marketData.bollingerBands.bandwidth}%`],
    ];

    pdf.setFontSize(fontSize.body);
    col = 0;
    bbData.forEach(([label, value]) => {
      const x = margin + col * colWidth;
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${label}:`, x, yPosition);
      pdf.setTextColor(0, 0, 0);
      pdf.text(value, x + 25, yPosition);
      col++;
      if (col >= 2) {
        col = 0;
        yPosition += fontSize.body * 0.5;
      }
    });
    if (col !== 0) {
      yPosition += fontSize.body * 0.5;
    }

    yPosition += 8;
  }

  // 5. MACD (있는 경우)
  if (marketData.macd) {
    addText('MACD', fontSize.heading, true, [59, 130, 246]);
    yPosition += 2;

    pdf.setFontSize(fontSize.body);
    const macdData = [
      ['MACD', marketData.macd.macd.toFixed(2)],
      ['Signal', marketData.macd.signal.toFixed(2)],
      ['Histogram', marketData.macd.histogram.toFixed(2)],
      ['Trend', marketData.macd.trend],
    ];

    col = 0;
    macdData.forEach(([label, value]) => {
      const x = margin + col * colWidth;
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${label}:`, x, yPosition);
      pdf.setTextColor(0, 0, 0);
      pdf.text(value, x + 25, yPosition);
      col++;
      if (col >= 2) {
        col = 0;
        yPosition += fontSize.body * 0.5;
      }
    });
    if (col !== 0) {
      yPosition += fontSize.body * 0.5;
    }

    yPosition += 8;
  }

  // 6. 스토캐스틱 (있는 경우)
  if (marketData.stochastic) {
    addText('Stochastic', fontSize.heading, true, [59, 130, 246]);
    yPosition += 2;

    pdf.setFontSize(fontSize.body);
    const stochData = [
      ['%K', marketData.stochastic.k.toFixed(2)],
      ['%D', marketData.stochastic.d.toFixed(2)],
      ['Zone', marketData.stochastic.zone],
      ['Signal', marketData.stochastic.signal],
    ];

    col = 0;
    stochData.forEach(([label, value]) => {
      const x = margin + col * colWidth;
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${label}:`, x, yPosition);
      pdf.setTextColor(0, 0, 0);
      pdf.text(value, x + 25, yPosition);
      col++;
      if (col >= 2) {
        col = 0;
        yPosition += fontSize.body * 0.5;
      }
    });
    if (col !== 0) {
      yPosition += fontSize.body * 0.5;
    }

    yPosition += 8;
  }

  // 7. 차트 섹션 (선택적)
  if (includeCharts && chartsContainer) {
    checkNewPage(80);
    addText('Charts', fontSize.subtitle, true);
    yPosition += 5;

    try {
      const chartImage = await captureChartAsImage(chartsContainer);
      if (chartImage) {
        // 차트 이미지 추가 (가로폭에 맞춤)
        const imgWidth = contentWidth;
        const imgHeight = 70; // 고정 높이
        checkNewPage(imgHeight + 10);
        pdf.addImage(chartImage, 'PNG', margin, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 10;
      }
    } catch (error) {
      console.error('Failed to add charts to PDF:', error);
      pdf.setFontSize(fontSize.small);
      pdf.setTextColor(150, 150, 150);
      pdf.text('(Charts could not be captured)', margin, yPosition);
      yPosition += 10;
    }
  }

  // 8. AI 분석 리포트
  checkNewPage(30);
  addText('AI Analysis Report', fontSize.subtitle, true);
  yPosition += 5;

  const plainTextReport = markdownToPlainText(result.aiReport);
  pdf.setFontSize(fontSize.body);
  pdf.setTextColor(50, 50, 50);

  const reportLines = splitTextToLines(pdf, plainTextReport, contentWidth);
  reportLines.forEach((line) => {
    checkNewPage(fontSize.body * 0.4);

    // 섹션 헤더 스타일링
    if (line.startsWith('===') && line.endsWith('===')) {
      pdf.setFontSize(fontSize.heading);
      pdf.setTextColor(59, 130, 246);
      pdf.text(line.replace(/===/g, '').trim(), margin, yPosition);
      pdf.setFontSize(fontSize.body);
      pdf.setTextColor(50, 50, 50);
    } else if (line.startsWith('[') && line.endsWith(']')) {
      pdf.setFontSize(fontSize.body);
      pdf.setTextColor(100, 100, 100);
      pdf.text(line, margin, yPosition);
      pdf.setTextColor(50, 50, 50);
    } else {
      pdf.text(line, margin, yPosition);
    }
    yPosition += fontSize.body * 0.4;
  });

  // 9. 푸터 (면책조항)
  pdf.addPage();
  yPosition = margin;

  pdf.setFillColor(245, 245, 245);
  pdf.rect(margin, yPosition, contentWidth, 40, 'F');
  yPosition += 8;

  pdf.setFontSize(fontSize.small);
  pdf.setTextColor(100, 100, 100);

  const disclaimer = [
    'Disclaimer',
    '',
    'This report is for informational purposes only and does not constitute',
    'investment advice. Past performance is not indicative of future results.',
    'Always conduct your own research before making investment decisions.',
    '',
    'Generated by jongmok-eottae.ai',
    `Report Date: ${now.toISOString()}`,
  ];

  disclaimer.forEach((line) => {
    if (line === 'Disclaimer') {
      pdf.setFontSize(fontSize.body);
      pdf.setTextColor(80, 80, 80);
    } else {
      pdf.setFontSize(fontSize.small);
      pdf.setTextColor(100, 100, 100);
    }
    pdf.text(line, margin + 5, yPosition);
    yPosition += fontSize.small * 0.5;
  });

  return pdf.output('blob');
}

/**
 * PDF 다운로드
 */
export function downloadPDF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 분석 결과 PDF 생성 및 다운로드 (편의 함수)
 */
export async function exportAnalysisToPDF(
  result: AnalyzeResult,
  options: PDFGeneratorOptions = {}
): Promise<void> {
  const blob = await generateAnalysisPDF(result, options);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const filename = `${result.symbol}_analysis_${dateStr}.pdf`;
  downloadPDF(blob, filename);
}
