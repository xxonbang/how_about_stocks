import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { startAlertMonitoring } from "@/lib/alert-system";
import { getSession } from "@/lib/auth";
import { checkAnalysisRateLimit } from "@/lib/rate-limit";
import type { AnalysisHistoryInsert } from "@/lib/supabase/types";

/**
 * Supabase에 분석 히스토리 저장 (비동기, 비블로킹)
 */
async function saveAnalysisHistoryToSupabase(
  history: AnalysisHistoryInsert
): Promise<void> {
  try {
    const { db, isDrizzleEnabled, analysisHistory } = await import(
      "@/lib/supabase/db"
    );

    if (!isDrizzleEnabled() || !db) {
      return; // DB 미설정 시 건너뜀
    }

    // Drizzle ORM을 사용하여 insert
    await db.insert(analysisHistory).values({
      requestId: history.request_id,
      stocks: history.stocks,
      period: history.period,
      historicalPeriod: history.historical_period,
      analysisDate: history.analysis_date,
      indicators: history.indicators,
      results: history.results,
      dataSource: history.data_source,
      metadata: history.metadata || {},
      userId: history.user_id ?? null,
    });

    console.log("[AnalysisHistory] Saved to Supabase:", history.request_id);
  } catch (err) {
    // 중복 request_id인 경우 무시 (unique constraint)
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes("duplicate") || errorMessage.includes("23505")) {
      console.log("[AnalysisHistory] Duplicate request_id, skipping save");
      return;
    }
    console.error("[AnalysisHistory] Supabase save error:", errorMessage);
  }
}

// 알림 모니터링 시작 (서버 시작 시 한 번만)
let monitoringStarted = false;
if (!monitoringStarted && typeof window === "undefined") {
  startAlertMonitoring(30000); // 30초마다 체크
  monitoringStarted = true;
}
import {
  fetchStocksData,
  fetchExchangeRate,
  fetchVIX,
  fetchNews,
  fetchUnifiedQuotesBatch,
  getDataSourceInfo,
} from "@/lib/finance-adapter";
import {
  fetchKoreaSupplyDemand,
  calculateRSI,
  calculateMA,
  calculateDisparity,
  type StockData,
} from "@/lib/finance";
import {
  calculateETFPremium,
  calculateBollingerBands,
  calculateVolatility,
  calculateVolumeIndicators,
  detectSupportLevel,
  calculateSupportResistance,
  calculateMACD,
  calculateStochastic,
} from "@/lib/indicators";
import { callGeminiWithFallback, getGeminiApiKeys } from "@/lib/gemini-client";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeResult,
} from "@/lib/types";
import { periodToKorean } from "@/lib/period-utils";
import {
  fetchLatestSavetickerPDF,
  generateSavetickerPromptSection,
  type SavetickerPDFData,
} from "@/lib/saveticker";

const getSystemPrompt = (
  period: string,
  historicalPeriod: string,
  analysisDate: string,
  hasSavetickerReport: boolean = false,
) => `당신은 월스트리트와 여의도에서 20년 이상 활동한 **수석 투자 전략가(Chief Investment Strategist)**입니다.
당신의 분석 스타일은 **'데이터에 기반한 냉철한 통찰'**입니다. 단순히 '사라/팔아라'가 아니라, 거시 경제 상황과 기업의 펀더멘털, 그리고 기술적 위치를 종합하여 논리적인 시나리오를 제시합니다.

**재료분석 (필수)** — 뉴스 기반 촉매 요인 분석:
각 종목에 대해 아래 2단계 프로세스로 재료분석을 실시하십시오.

1. **뉴스 수집**: 종목별로 제공된 참고 헤드라인을 시작점으로 삼고, Google 검색을 추가 수행하여 최근 금융/경제 뉴스를 총 10건 이상 확보하십시오. 검색 시 "[종목명] 주가", "[종목명] 실적", "[종목명] 전망" 등 금융 키워드를 다양하게 조합하십시오.
2. **분류 및 평가**: 수집된 뉴스를 면밀히 분석하여 다음 기준으로 분류하십시오:
   - **호재(Positive Catalyst)**: 실적 호조, 신사업/신제품, 수주·계약 확대, 정책 수혜, 배당 확대, 자사주 매입, 목표가 상향, 업종 호황 등
   - **악재(Negative Catalyst)**: 실적 부진, 규제 강화, 소송·과징금, 경영진 리스크, 공급망 이슈, 목표가 하향, 업종 침체 등
   - **모니터링 이슈**: M&A 루머, 지배구조 변화, 업종 재편, 정책 변화 대기 등 방향성 미확정 이슈
   - 각 재료에 **영향 시간축**(단기 1주 이내 / 중기 1~3개월 / 장기 3개월 이상)과 **영향 강도**(상·중·하)를 부여하십시오.

**재료분석 작성 규칙**:
- 결과는 "재료분석 (뉴스 기반)" 섹션에 집중 정리하십시오.
- 다른 섹션(향후 전망, 투자 의견)에서는 재료분석 결론만 간결히 인용하고, 뉴스 내용을 중복 기술하지 마십시오.

[분석 지침]
**중요: 분석 기준일과 분석 기간은 다음과 같습니다.**
- **분석 기준일**: ${analysisDate} (오늘 날짜) - 모든 분석은 이 날짜를 기준으로 수행하십시오.
- **향후 전망 분석 기간**: [${period}] - 이 기간 동안의 주가 전망을 분석하십시오.
- **과거 이력 분석 기간**: [${historicalPeriod}] - 이 기간 동안의 과거 주가 움직임과 패턴을 분석하십시오.

**분석 기준일(${analysisDate}) 기준:**
- 모든 가격, 지표, 데이터는 ${analysisDate} 기준으로 해석하십시오.
- "오늘", "현재", "최근" 등의 표현은 모두 ${analysisDate}를 의미합니다.
- 향후 전망은 ${analysisDate}부터 시작하여 ${period} 기간 동안의 전망을 제시하십시오.

**향후 전망 분석 기간(${period}) 관점:**
- '1일' 또는 '1주일'을 선택했다면 단기 트레이딩 관점에서 분석하십시오.
- '1달' 또는 '3개월'을 선택했다면 중기 투자 관점에서 분석하십시오.
- '6개월' 또는 '1년'을 선택했다면 펀더멘털과 장기 추세 관점에서 분석하십시오.

**과거 이력 분석 기간(${historicalPeriod}) 관점:**
- 제공된 과거 데이터(${historicalPeriod} 기간)를 바탕으로 주가의 과거 패턴, 추세, 변동성을 분석하십시오.
- 과거 이력과 현재 상황을 비교하여 향후 전망의 신뢰도를 평가하십시오.

1. **과거 이력 분석**: 제공된 과거 데이터(${historicalPeriod} 기간)를 바탕으로 주가의 과거 패턴, 추세, 변동성, 주요 이벤트를 분석하십시오.
2. **기술적 분석**: 제공된 RSI, 이평선, 이격도 데이터를 바탕으로 현재 주가의 위치(과열/침체)를 진단하십시오. 과거 이력(${historicalPeriod})과 비교하여 현재 위치를 평가하십시오.
3. **수급 분석**: 기관/외국인 매매 동향을 통해 '스마트 머니'의 흐름을 해석하십시오.
4. **향후 전망**: 과거 이력(${historicalPeriod}) 분석 결과와 현재 기술적 지표를 종합하여 향후 전망 기간(${period}) 동안의 주가 전망을 제시하십시오.
5. **결론**: 향후 전망 기간(${period})에 맞는 투자 의견을 명확하게 제시하십시오. 과거 이력 분석 결과를 근거로 제시하십시오.
6. **어조**: 전문적이고 신뢰감 있게, 그러나 개인 투자자가 이해하기 쉽게 설명하십시오.
7. **할루시네이션(Hallucination)**: AI가 실제 데이터나 사실이 아닌 정보를 절대 생성하지 않도록 주의하시오. 모든 분석과 주장은 제공된 데이터와 사실에 근거해야 합니다.

응답은 마크다운 형식으로 작성하되, 다음 구조를 따르세요:
${hasSavetickerReport ? `## 시황 리포트 요약 (Saveticker)
` : ''}## 과거 이력 분석 (${historicalPeriod} 기간)
## 현재 시장 상황
## 재료분석 (뉴스 기반)
  - 주요 호재
  - 주요 악재
  - 모니터링 이슈
  - 종합 재료 평가
## 기술적 분석 (과거 이력 ${historicalPeriod} vs 현재)
## 수급 분석
## 향후 전망 (${period} 기간)
  - 긍정적 시나리오
  - 부정적 시나리오
  - 종합 전망
## 투자 의견
  - 과거 이력 기반 평가
  - 향후 전망 기간(${period}) 관점
  - 재료분석 반영 의견
${hasSavetickerReport ? `  - 시황 리포트 반영 의견
` : ''}`;

/**
 * 여러 종목의 데이터를 기반으로 AI 분석 리포트를 한 번에 생성
 * @param stocksData 종목별 마켓 데이터 배열
 * @param period 분석 기간
 * @param genAI GoogleGenerativeAI 인스턴스
 * @param savetickerPDF Saveticker PDF 데이터 (선택)
 * @returns 종목별 리포트 맵 (symbol -> report)
 */
async function generateAIReportsBatch(
  stocksData: Array<{
    symbol: string;
    marketData: AnalyzeResult["marketData"];
    selectedIndicators?: AnalyzeRequest["indicators"];
  }>,
  period: string,
  historicalPeriod: string,
  analysisDate: string,
  genAI: GoogleGenerativeAI,
  modelName: string = "gemini-2.5-flash",
  savetickerPDF?: SavetickerPDFData | null,
): Promise<{
  reports: Map<string, string>;
  tokenUsage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}> {
  // Gemini 모델명: 파라미터로 받은 모델 사용 (기본값: gemini-2.5-flash)
  // Google Search Retrieval 도구 활성화: 재료분석을 위한 실시간 뉴스 검색
  const model = genAI.getGenerativeModel({
    model: modelName,
    tools: [{ googleSearchRetrieval: {} }],
  });

  const hasSavetickerReport = !!savetickerPDF;
  const systemPrompt = getSystemPrompt(period, historicalPeriod, analysisDate, hasSavetickerReport);

  // 모든 종목의 데이터를 하나의 프롬프트로 구성
  const stocksDataPrompt = stocksData
    .map(({ symbol, marketData, selectedIndicators }) => {
      // 프롬프트에 포함될 지표 확인 로깅
      const includedIndicators = [];
      if (marketData.rsi !== undefined) includedIndicators.push("RSI");
      if (marketData.movingAverages !== undefined)
        includedIndicators.push("MovingAverages");
      if (marketData.disparity !== undefined)
        includedIndicators.push("Disparity");
      if (marketData.supplyDemand !== undefined)
        includedIndicators.push("SupplyDemand");
      if (marketData.vix !== undefined) includedIndicators.push("VIX");
      if (marketData.exchangeRate !== undefined)
        includedIndicators.push("ExchangeRate");
      if (marketData.news !== undefined && marketData.news.length > 0)
        includedIndicators.push("News");
      if (marketData.etfPremium !== undefined)
        includedIndicators.push("ETFPremium");
      if (marketData.bollingerBands !== undefined)
        includedIndicators.push("BollingerBands");
      if (marketData.volatility !== undefined)
        includedIndicators.push("Volatility");
      if (marketData.volumeIndicators !== undefined)
        includedIndicators.push("VolumeIndicators");
      if (marketData.supportLevel !== undefined)
        includedIndicators.push("SupportLevel");
      if (marketData.supportResistance !== undefined)
        includedIndicators.push("SupportResistance");

      console.log(
        `[Gemini Prompt] Indicators included for ${symbol}:`,
        includedIndicators,
      );

      return `
## 종목 ${symbol}

**현재가**: ${marketData.price.toLocaleString()}
**변동률**: ${
        marketData.changePercent >= 0 ? "+" : ""
      }${marketData.changePercent.toFixed(2)}%
**거래량**: ${marketData.volume.toLocaleString()}
${
  marketData.marketCap
    ? `**시가총액**: ${marketData.marketCap.toLocaleString()}`
    : ""
}

${marketData.rsi !== undefined ? `**RSI(14)**: ${marketData.rsi}` : ""}
${
  marketData.movingAverages
    ? `
**이동평균선**:
- 5일선: ${marketData.movingAverages.ma5.toLocaleString()}
- 20일선: ${marketData.movingAverages.ma20.toLocaleString()}
- 60일선: ${marketData.movingAverages.ma60.toLocaleString()}
- 120일선: ${marketData.movingAverages.ma120.toLocaleString()}
`
    : ""
}
${
  marketData.disparity !== undefined
    ? `**이격도(20일 기준)**: ${marketData.disparity}%`
    : ""
}
${
  marketData.supplyDemand
    ? `
**수급 데이터**${marketData.supplyDemand.dataDate ? ` (${marketData.supplyDemand.dataDate})` : ""}:
- 기관: ${
        marketData.supplyDemand.institutional > 0 ? "+" : ""
      }${marketData.supplyDemand.institutional.toLocaleString()}
- 외국인: ${
        marketData.supplyDemand.foreign > 0 ? "+" : ""
      }${marketData.supplyDemand.foreign.toLocaleString()}
- 개인: ${
        marketData.supplyDemand.individual > 0 ? "+" : ""
      }${marketData.supplyDemand.individual.toLocaleString()}${marketData.supplyDemand.isIndividualEstimated ? " (추정값)" : ""}
`
    : ""
}
${marketData.vix !== undefined ? `**VIX 지수**: ${marketData.vix}` : ""}
${
  marketData.exchangeRate
    ? `**환율(USD/KRW)**: ${marketData.exchangeRate.toLocaleString()}`
    : ""
}
${
  marketData.news && marketData.news.length > 0
    ? `
**참고 뉴스 헤드라인** (재료분석 시 검색 시작점으로 활용):
${marketData.news
  .slice(0, 3)
  .map(
    (n, i) =>
      `${i + 1}. ${n.title}${
        n.date ? ` (${new Date(n.date).toLocaleDateString("ko-KR")})` : ""
      }`,
  )
  .join("\n")}
`
    : ""
}
${
  marketData.etfPremium
    ? `
**ETF 괴리율**: ${marketData.etfPremium.premium >= 0 ? "+" : ""}${
        marketData.etfPremium.premium
      }%
- 상태: ${
        marketData.etfPremium.isPremium
          ? "프리미엄"
          : marketData.etfPremium.isDiscount
            ? "할인"
            : "정상"
      }
`
    : selectedIndicators?.etfPremium
      ? `
**ETF 괴리율**: ⚠️ ETF 괴리율 데이터를 조회할 수 없습니다. 일반 종목이거나, ETF 데이터가 일시적으로 제공되지 않고 있습니다.
`
      : ""
}
${
  marketData.bollingerBands
    ? `
**볼린저 밴드**:
- 상단: ${marketData.bollingerBands.upper.toLocaleString()}
- 중심선: ${marketData.bollingerBands.middle.toLocaleString()}
- 하단: ${marketData.bollingerBands.lower.toLocaleString()}
- 밴드폭: ${marketData.bollingerBands.bandwidth}%
- 현재 위치: ${(marketData.bollingerBands.position * 100).toFixed(
        1,
      )}% (0=하단, 100=상단)
`
    : ""
}
${
  marketData.volatility
    ? `
**변동성 지표**:
- 일일 변동성: ${marketData.volatility.volatility}%
- 연율화 변동성: ${marketData.volatility.annualizedVolatility}%
- 변동성 등급: ${
        marketData.volatility.volatilityRank === "low"
          ? "낮음"
          : marketData.volatility.volatilityRank === "medium"
            ? "보통"
            : "높음"
      }
`
    : ""
}
${
  marketData.volumeIndicators
    ? `
**거래량 지표**:
- 현재 거래량: ${(
        marketData.volumeIndicators.currentVolume ?? marketData.volume
      ).toLocaleString()}
- 20일 평균 거래량: ${marketData.volumeIndicators.averageVolume.toLocaleString()}
- 평균 대비 비율: ${
        marketData.volumeIndicators.volumeRatio
      }배 (현재 거래량이 평균의 ${marketData.volumeIndicators.volumeRatio}배)
- 고거래량 여부: ${
        marketData.volumeIndicators.isHighVolume ? "예 (1.5배 이상)" : "아니오"
      }
- 거래량 추세: ${
        marketData.volumeIndicators.volumeTrend === "increasing"
          ? "증가"
          : marketData.volumeIndicators.volumeTrend === "decreasing"
            ? "감소"
            : "안정"
      }
`
    : ""
}
${
  marketData.supportLevel
    ? `
**눌림목 여부**:
- 지지선 근처: ${marketData.supportLevel.isNearSupport ? "예" : "아니오"}
- 지지선 레벨: ${marketData.supportLevel.supportLevel.toLocaleString()}
- 지지선으로부터 거리: ${
        marketData.supportLevel.distanceFromSupport >= 0 ? "+" : ""
      }${marketData.supportLevel.distanceFromSupport}%
`
    : ""
}
${
  marketData.supportResistance
    ? `
**저항선/지지선**:
- 저항선 레벨: ${marketData.supportResistance.resistanceLevels
        .map((l) => l.toLocaleString())
        .join(", ")}
- 지지선 레벨: ${marketData.supportResistance.supportLevels
        .map((l) => l.toLocaleString())
        .join(", ")}
- 현재 위치: ${
        marketData.supportResistance.currentPosition === "near_resistance"
          ? "저항선 근처"
          : marketData.supportResistance.currentPosition === "near_support"
            ? "지지선 근처"
            : "중간"
      }
`
    : ""
}
---`;
    })
    .join("\n");

  const symbolsList = stocksData.map(({ symbol }) => symbol).join(", ");

  // 응답 형식 예시 생성
  const formatExample = stocksData
    .map(({ symbol }, index) => {
      return `[종목: ${symbol}]
---
## ${symbol} 현재 시장 상황
[${symbol}의 현재 시장 상황 분석]

## ${symbol} 재료분석 (뉴스 기반)
[Google 검색으로 수집한 뉴스 기반 재료분석]

## ${symbol} 기술적 분석
[${symbol}의 기술적 분석]

## ${symbol} 수급 분석
[${symbol}의 수급 분석]

## ${symbol} 투자 의견
- 단기 관점: [의견]
- 장기 관점: [의견]
- 재료분석 반영: [의견]

`;
    })
    .join("\n");

  const dataPrompt = `
다음 ${stocksData.length}개 종목(${symbolsList})의 데이터를 각각 분석해주세요:

${stocksDataPrompt}

**중요 지침**:
1. 각 종목에 대해 독립적인 분석 리포트를 작성하되, 응답 형식은 반드시 다음과 같이 해주세요:
2. **재료분석 필수**: 시스템 프롬프트의 재료분석 프로세스(뉴스 수집 → 분류 → 평가)를 각 종목에 대해 반드시 수행하고, 결과를 "재료분석 (뉴스 기반)" 섹션에 정리하십시오.

응답 형식:

${formatExample}

각 종목의 리포트는 위 형식을 정확히 따라주세요. 종목 심볼을 명확히 표시하고, 각 종목에 대해 완전한 분석 리포트를 작성해주세요.
`;

  // Saveticker PDF 프롬프트 섹션 추가
  const savetickerSection = savetickerPDF
    ? generateSavetickerPromptSection(savetickerPDF)
    : '';

  const fullPrompt = systemPrompt + "\n\n" + savetickerSection + dataPrompt;

  try {
    // PDF가 있으면 멀티모달 입력, 없으면 텍스트만
    let result;
    if (savetickerPDF) {
      console.log('[Gemini] PDF 포함 멀티모달 요청 (단일 API 호출)');
      result = await model.generateContent([
        {
          inlineData: {
            mimeType: savetickerPDF.mimeType,
            data: savetickerPDF.pdfBase64,
          },
        },
        fullPrompt,
      ]);
    } else {
      result = await model.generateContent(fullPrompt);
    }
    const response = await result.response;
    const fullReport = response.text();

    // 토큰 사용량 추출
    const usageMetadata = response.usageMetadata;
    const tokenUsage = usageMetadata
      ? {
          promptTokenCount: usageMetadata.promptTokenCount || 0,
          candidatesTokenCount: usageMetadata.candidatesTokenCount || 0,
          totalTokenCount: usageMetadata.totalTokenCount || 0,
        }
      : undefined;

    if (tokenUsage) {
      console.log('[Gemini] Token Usage:', tokenUsage);
    }

    // 응답을 종목별로 파싱
    const reportsMap = new Map<string, string>();

    // 심볼 정규화 함수 (이스케이프 처리)
    const escapeRegex = (str: string) =>
      str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 각 종목별로 리포트 분리
    // 패턴: [종목: SYMBOL] 형식 우선, 그 외 다양한 형식 지원
    for (const { symbol } of stocksData) {
      const escapedSymbol = escapeRegex(symbol);

      // 여러 패턴 시도 (우선순위 순)
      const patterns = [
        // [종목: SYMBOL] --- 형식 (가장 명확)
        new RegExp(
          `\\[종목:\\s*${escapedSymbol}\\s*\\]\\s*\\n---\\s*\\n([\\s\\S]*?)(?=\\[종목:|$)`,
          "i",
        ),
        // [종목: SYMBOL] 형식 (--- 없음)
        new RegExp(
          `\\[종목:\\s*${escapedSymbol}\\s*\\]\\s*\\n([\\s\\S]*?)(?=\\[종목:|$)`,
          "i",
        ),
        // ## SYMBOL 현재 시장 상황 형식
        new RegExp(
          `##\\s*${escapedSymbol}\\s+현재 시장 상황[\\s\\S]*?([\\s\\S]*?)(?=##\\s*[A-Z0-9]+(?:\\.KS|\\.KQ)?\\s+현재 시장 상황|\\[종목:|$)`,
          "i",
        ),
        // 종목: SYMBOL 형식
        new RegExp(
          `종목:\\s*${escapedSymbol}\\s*\\n---\\s*\\n([\\s\\S]*?)(?=종목:|$)`,
          "i",
        ),
        // ## SYMBOL 형식
        new RegExp(
          `##\\s*${escapedSymbol}[\\s\\S]*?\\n([\\s\\S]*?)(?=##\\s*[A-Z0-9]+(?:\\.KS|\\.KQ)?|\\[종목:|종목:|$)`,
          "i",
        ),
      ];

      let found = false;
      for (const pattern of patterns) {
        const match = fullReport.match(pattern);
        if (match && match[1]) {
          const report = match[1].trim();
          // 최소 길이 체크 (너무 짧으면 무시)
          if (report.length > 100) {
            // 추가 검증: 매칭된 리포트에 다른 종목의 심볼이 헤더로 포함되어 있으면 제외
            const otherSymbols = stocksData
              .filter((s) => s.symbol !== symbol)
              .map((s) => s.symbol);
            const hasOtherSymbolHeader = otherSymbols.some((other) =>
              new RegExp(`##\\s*${escapeRegex(other)}\\s`, "i").test(
                report.slice(0, 200),
              ),
            );

            if (!hasOtherSymbolHeader) {
              reportsMap.set(symbol, report);
              found = true;
              console.log(
                `[AI Report Parsing] Successfully matched report for ${symbol} (length: ${report.length})`,
              );
              break;
            } else {
              console.warn(
                `[AI Report Parsing] Matched content for ${symbol} contains other symbol header, trying next pattern`,
              );
            }
          }
        }
      }

      if (!found) {
        console.warn(
          `[AI Report Parsing] Failed to find matching report for ${symbol}`,
        );
        // 패턴 매칭 실패 시, 전체 리포트를 첫 번째 종목에 할당
        if (reportsMap.size === 0) {
          reportsMap.set(symbol, fullReport);
        } else {
          reportsMap.set(
            symbol,
            `## ${symbol} 분석 리포트\n\n⚠️ AI 리포트 파싱 중 오류가 발생했습니다. 전체 리포트를 확인해주세요.`,
          );
        }
      }
    }

    // 파싱 실패한 종목이 있으면 전체 리포트를 첫 번째 종목에 할당
    if (reportsMap.size === 0 && stocksData.length > 0) {
      reportsMap.set(stocksData[0].symbol, fullReport);
      for (let i = 1; i < stocksData.length; i++) {
        reportsMap.set(
          stocksData[i].symbol,
          `## ${stocksData[i].symbol} 분석 리포트\n\n⚠️ AI 리포트 파싱 중 오류가 발생했습니다.`,
        );
      }
    }

    return { reports: reportsMap, tokenUsage };
  } catch (error: any) {
    console.error("Error generating AI reports:", error);
    console.error("Error details:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      statusCode: error?.statusCode,
      errorType: error?.constructor?.name,
      fullError: error,
    });

    // 원본 오류를 그대로 throw하여 fallback 로직이 오류 정보를 제대로 감지할 수 있도록 함
    // (status, code 등의 속성이 유지되어야 fallback 로직이 재시도 가능한 오류인지 판단 가능)
    if (error instanceof Error) {
      // Error 객체인 경우 그대로 throw
      throw error;
    } else {
      // 기타 오류인 경우 Error로 감싸되, 원본 속성 유지
      const errorMessage = error?.message || String(error) || "알 수 없는 오류";
      const wrappedError = new Error(errorMessage);
      // 원본 오류의 속성들을 유지
      if (error?.status !== undefined)
        (wrappedError as any).status = error.status;
      if (error?.code !== undefined) (wrappedError as any).code = error.code;
      if (error?.statusCode !== undefined)
        (wrappedError as any).statusCode = error.statusCode;
      throw wrappedError;
    }
  }
}

export async function POST(request: NextRequest) {
  const analysisStartTime = Date.now();
  const stepTimings: {
    step: string;
    startTime: number;
    endTime?: number;
    duration?: number;
  }[] = [];

  try {
    const body: AnalyzeRequest = await request.json();
    const { stocks, period, historicalPeriod, analysisDate, indicators } = body;

    // 인증 확인
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    // Rate Limit 확인 (Admin은 무제한)
    const rateLimitResult = await checkAnalysisRateLimit(session);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: "일일 분석 횟수를 초과했습니다.",
          rateLimited: true,
          remaining: rateLimitResult.remaining,
          limit: rateLimitResult.limit,
        },
        { status: 429 },
      );
    }

    // 지표 선택 상태 로깅 (모든 지표 포함)
    console.log("[Analyze API] Selected indicators:", {
      rsi: indicators.rsi,
      movingAverages: indicators.movingAverages,
      disparity: indicators.disparity,
      supplyDemand: indicators.supplyDemand,
      fearGreed: indicators.fearGreed,
      exchangeRate: indicators.exchangeRate,
      // Phase 1 지표
      etfPremium: indicators.etfPremium,
      bollingerBands: indicators.bollingerBands,
      volatility: indicators.volatility,
      volumeIndicators: indicators.volumeIndicators,
      // Phase 2 지표
      supportLevel: indicators.supportLevel,
      supportResistance: indicators.supportResistance,
      // Phase 3 지표
      macd: indicators.macd,
      stochastic: indicators.stochastic,
    });

    // period 기본값 설정
    const analysisPeriod = period || "1m";
    const historicalAnalysisPeriod = historicalPeriod || "3m";
    const periodKorean = periodToKorean(analysisPeriod);
    const historicalPeriodKorean = periodToKorean(historicalAnalysisPeriod);

    if (!stocks || stocks.length === 0) {
      return NextResponse.json(
        { error: "주식 종목이 필요합니다." },
        { status: 400 },
      );
    }

    if (stocks.length > 5) {
      return NextResponse.json(
        { error: "최대 5개 종목까지 분석 가능합니다." },
        { status: 400 },
      );
    }

    // Gemini API 키 확인 (fallback 지원)
    const apiKeys = getGeminiApiKeys();
    if (apiKeys.length === 0) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY가 설정되지 않았습니다. 최소 1개의 API 키가 필요합니다.",
        },
        { status: 500 },
      );
    }

    console.log(
      `[Gemini] ${apiKeys.length}개의 API 키 사용 가능 (Primary + ${
        apiKeys.length - 1
      }개 Fallback)`,
    );

    // 배치로 모든 종목 데이터 수집
    // 우선순위: 듀얼소스(finance-adapter) → Python 스크립트(fallback)
    console.log(`Fetching data for ${stocks.length} stocks...`);

    // 단계 1: 데이터 수집 시작
    const dataCollectionStart = Date.now();
    stepTimings.push({
      step: "dataCollection",
      startTime: dataCollectionStart,
    });

    let stockDataMap: Map<string, StockData>;

    // Python fallback 사용 가능 여부 확인
    const pythonFallbackEnabled =
      process.env.USE_PYTHON_SCRIPT === "true" ||
      process.env.DATA_SOURCE === "vercel";

    // 1차 시도: finance-adapter 사용 (듀얼소스 또는 기본 소스)
    console.log(
      `[DataCollection] Primary: finance-adapter (USE_DUAL_SOURCE=${process.env.USE_DUAL_SOURCE || 'false'})`,
    );
    console.log(`Original symbols: ${stocks.join(", ")}`);

    try {
      stockDataMap = await fetchStocksData(stocks);
      console.log(
        `[DataCollection] Success via finance-adapter: ${Array.from(stockDataMap.keys()).join(", ")}`,
      );

      // 데이터가 비어있으면 Python fallback 시도
      if (stockDataMap.size === 0 && pythonFallbackEnabled) {
        console.warn(
          "[DataCollection] finance-adapter returned no data, trying Python fallback...",
        );
        const { fetchStocksDataBatchVercel } =
          await import("@/lib/finance-vercel");
        stockDataMap = await fetchStocksDataBatchVercel(
          stocks,
          historicalAnalysisPeriod,
        );
        console.log(
          `[DataCollection] Python fallback result: ${Array.from(stockDataMap.keys()).join(", ")}`,
        );
      }
    } catch (primaryError) {
      console.error(
        "[DataCollection] finance-adapter failed:",
        primaryError instanceof Error ? primaryError.message : primaryError,
      );

      // 2차 시도: Python 스크립트 fallback
      if (pythonFallbackEnabled) {
        console.log(
          `[DataCollection] Fallback: Python script (historical period: ${historicalAnalysisPeriod})`,
        );
        try {
          const { fetchStocksDataBatchVercel } =
            await import("@/lib/finance-vercel");
          stockDataMap = await fetchStocksDataBatchVercel(
            stocks,
            historicalAnalysisPeriod,
          );
          console.log(
            `[DataCollection] Python fallback success: ${Array.from(stockDataMap.keys()).join(", ")}`,
          );

          if (stockDataMap.size === 0) {
            throw new Error("Python fallback also returned no data");
          }
        } catch (fallbackError) {
          console.error(
            "[DataCollection] Python fallback also failed:",
            fallbackError,
          );
          throw new Error(
            `모든 종목 데이터 수집에 실패했습니다: Primary(${
              primaryError instanceof Error
                ? primaryError.message
                : String(primaryError)
            }), Fallback(${
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError)
            })`,
          );
        }
      } else {
        // Python fallback 비활성화 상태면 원래 에러 throw
        throw new Error(
          `종목 데이터 수집에 실패했습니다: ${
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError)
          }`,
        );
      }
    }

    // 환율 및 VIX 조회 (통합 배치 또는 개별 캐시)
    // 최적화: 둘 다 필요하면 1회 API 호출, 캐시 있으면 API 호출 없음
    let exchangeRate: number | null = null;
    let vix: number | null = null;

    if (indicators.exchangeRate || indicators.fearGreed) {
      try {
        // 빈 배열로 호출하면 환율/VIX만 배치로 가져옴 (캐시 활용)
        const unifiedResult = await fetchUnifiedQuotesBatch([], {
          includeExchangeRate: indicators.exchangeRate,
          includeVIX: indicators.fearGreed,
        });
        exchangeRate = unifiedResult.exchangeRate;
        vix = unifiedResult.vix;
        console.log(`[DataCollection] Unified batch: exchangeRate=${exchangeRate}, vix=${vix}`);
      } catch (error) {
        console.warn("[DataCollection] Unified batch failed, using individual fetches:", error);
        // 폴백: 개별 호출 (캐시 있으면 캐시에서 반환)
        [exchangeRate, vix] = await Promise.all([
          indicators.exchangeRate ? fetchExchangeRate().catch(() => null) : Promise.resolve(null),
          indicators.fearGreed ? fetchVIX().catch(() => null) : Promise.resolve(null),
        ]);
      }
    }

    // 단계 1: 데이터 수집 완료
    const dataCollectionEnd = Date.now();
    const dataCollectionTiming = stepTimings.find(
      (t) => t.step === "dataCollection",
    );
    if (dataCollectionTiming) {
      dataCollectionTiming.endTime = dataCollectionEnd;
      dataCollectionTiming.duration =
        dataCollectionEnd - dataCollectionTiming.startTime;
    }

    // 단계 2: 기술적 지표 계산 시작
    const indicatorCalculationStart = Date.now();
    stepTimings.push({
      step: "indicatorCalculation",
      startTime: indicatorCalculationStart,
    });

    const results: AnalyzeResult[] = [];
    const stocksDataForAI: Array<{
      symbol: string;
      marketData: AnalyzeResult["marketData"];
      selectedIndicators?: AnalyzeRequest["indicators"];
    }> = [];

    // 각 종목별로 데이터 처리 (AI 리포트 생성 전에 모든 데이터 수집)
    for (const symbol of stocks) {
      const stockData = stockDataMap.get(symbol);

      if (!stockData) {
        console.error(`Failed to fetch data for ${symbol}`);
        continue;
      }
      const isKoreaStock = symbol.includes(".KS") || /^\d{6}$/.test(symbol);

      // 수급 데이터 수집 (한국 주식만)
      let supplyDemand = undefined;
      if (indicators.supplyDemand && isKoreaStock) {
        const koreaSymbol = symbol.replace(".KS", "");
        supplyDemand = await fetchKoreaSupplyDemand(koreaSymbol).catch(
          () => undefined,
        );
      }

      // 뉴스 수집 (최신 3개, 필수 - 실패해도 계속 진행하되 빈 배열 반환)
      const news = await fetchNews(symbol, 3).catch((err) => {
        console.warn(`Failed to fetch news for ${symbol}:`, err);
        return [];
      });

      // Phase 1 & Phase 2 지표 계산
      // historicalData가 없으면 빈 배열로 처리
      // historicalData는 "과거 → 최신" 순서로 정렬되어 있어야 함
      let historicalData = stockData.historicalData || [];

      // 날짜 기준 정렬 보장 (과거 → 최신)
      if (historicalData.length > 0) {
        historicalData = [...historicalData].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
      }

      const closes =
        historicalData.length > 0 ? historicalData.map((d) => d.close) : [];
      const volumes =
        historicalData.length > 0 ? historicalData.map((d) => d.volume) : [];

      // Phase 1 지표
      let etfPremium = undefined;
      if (indicators.etfPremium) {
        // ETF인 경우 NAV 가져오기 (한국 주식만)
        // 일반 주식에는 NAV가 없으므로 ETF 괴리율 계산 불가능
        if (isKoreaStock) {
          try {
            const { fetchKoreaETFInfoKRX } = await import("@/lib/krx-api");
            const koreaSymbol = symbol.replace(".KS", "");

            // ETF API 호출 (symbol과 일치하는 ETF만 반환하도록 수정됨)
            const etfInfo = await fetchKoreaETFInfoKRX(koreaSymbol).catch(
              () => null,
            );

            // fetchKoreaETFInfoKRX는 symbol과 일치하는 ETF가 없으면 null을 반환
            // NAV가 있고 0보다 큰 경우에만 ETF 괴리율 계산
            // 일반 주식의 경우 etfInfo가 null이거나 nav가 없으므로 etfPremium은 undefined로 유지됨
            // 중요: 괴리율 계산 시 반드시 동일한 소스(KRX)의 가격과 NAV를 사용해야 함
            if (etfInfo && etfInfo.nav && etfInfo.nav > 0 && etfInfo.price && etfInfo.price > 0) {
              // etfInfo.price (KRX 종가)와 etfInfo.nav (KRX NAV)를 사용하여 정확한 괴리율 계산
              etfPremium = calculateETFPremium(etfInfo.price, etfInfo.nav);
              console.log(
                `[Analyze API] ETF premium calculated for ${symbol}: price=${etfInfo.price}, nav=${etfInfo.nav}, premium=${etfPremium.premium}%`,
              );
            } else {
              console.log(
                `[Analyze API] ${symbol} is not an ETF or NAV not available (etfInfo: ${
                  etfInfo ? "exists but no NAV" : "null"
                })`,
              );
            }
          } catch (error) {
            console.warn(`Failed to fetch ETF NAV for ${symbol}:`, error);
          }
        }
        // 미국 ETF는 별도 처리 필요 (현재는 한국 ETF만 지원)
      }

      const bollingerBands =
        indicators.bollingerBands && closes.length > 0
          ? calculateBollingerBands(closes, 20, 2, stockData.price)
          : undefined;

      const volatility =
        indicators.volatility && closes.length > 0
          ? calculateVolatility(closes)
          : undefined;

      const volumeIndicators =
        indicators.volumeIndicators && volumes.length > 0
          ? (() => {
              console.log(
                `[Analyze API] Calculating volume indicators for ${symbol}: stockData.volume=${
                  stockData.volume
                }, volumes.length=${volumes.length}, last volume in array=${
                  volumes[volumes.length - 1]
                }`,
              );
              return calculateVolumeIndicators(volumes, 20, stockData.volume); // stockData.volume을 최신 거래량으로 전달
            })()
          : undefined;

      // Phase 2 지표
      const supportLevel =
        indicators.supportLevel && historicalData.length > 0
          ? detectSupportLevel(historicalData, stockData.price)
          : undefined;

      const supportResistance =
        indicators.supportResistance && historicalData.length > 0
          ? (() => {
              const result = calculateSupportResistance(historicalData);
              // 디버깅: 날짜 정보 확인
              console.log(
                `[Analyze API] SupportResistance dates for ${symbol}:`,
                {
                  resistanceDates: result.resistanceDates,
                  supportDates: result.supportDates,
                  resistanceLevels: result.resistanceLevels,
                  supportLevels: result.supportLevels,
                  historicalDataSample: historicalData
                    .slice(0, 3)
                    .map((d) => ({ date: d.date, high: d.high, low: d.low })),
                },
              );
              return result;
            })()
          : undefined;

      // Phase 3 지표
      const macd =
        indicators.macd && closes.length >= 26
          ? (() => {
              const result = calculateMACD(closes);
              console.log(`[Analyze API] MACD for ${symbol}:`, {
                macd: result.macd,
                signal: result.signal,
                histogram: result.histogram,
                trend: result.trend,
                crossover: result.crossover,
              });
              return {
                macd: result.macd,
                signal: result.signal,
                histogram: result.histogram,
                trend: result.trend,
                crossover: result.crossover,
              };
            })()
          : undefined;

      const stochastic =
        indicators.stochastic && historicalData.length >= 14
          ? (() => {
              const highs = historicalData.map((d) => d.high || d.close);
              const lows = historicalData.map((d) => d.low || d.close);
              const result = calculateStochastic(highs, lows, closes);
              console.log(`[Analyze API] Stochastic for ${symbol}:`, {
                k: result.k,
                d: result.d,
                zone: result.zone,
                signal: result.signal,
              });
              return {
                k: result.k,
                d: result.d,
                zone: result.zone,
                signal: result.signal,
              };
            })()
          : undefined;

      // 기술적 지표 (RSI, MA, 이격도 등) 계산
      const rsiValue = calculateRSI(closes, 14);
      const ma5 = calculateMA(closes, 5);
      const ma20 = calculateMA(closes, 20);
      const ma60 = calculateMA(closes, 60);
      const ma120 = calculateMA(closes, 120);

      const disparity =
        ma20 !== null ? calculateDisparity(stockData.price, ma20) : null;

      // 마켓 데이터 구성
      const marketData: AnalyzeResult["marketData"] = {
        price: stockData.price,
        change: stockData.change,
        changePercent: stockData.changePercent,
        volume: stockData.volume,
        marketCap: stockData.marketCap,
        ...(indicators.rsi && { rsi: rsiValue }),
        ...(indicators.movingAverages &&
          ma5 !== null &&
          ma20 !== null &&
          ma60 !== null &&
          ma120 !== null && {
            movingAverages: {
              ma5,
              ma20,
              ma60,
              ma120,
            },
          }),
        ...(indicators.disparity && disparity !== null && { disparity }),
        ...(supplyDemand && { supplyDemand }),
        ...(indicators.fearGreed && vix !== null && { vix }),
        ...(indicators.exchangeRate &&
          exchangeRate !== null && { exchangeRate }),
        ...(news.length > 0 && { news }),
        // Phase 1 지표
        ...(etfPremium && { etfPremium }),
        ...(bollingerBands && { bollingerBands }),
        ...(volatility && { volatility }),
        ...(volumeIndicators && { volumeIndicators }),
        // Phase 2 지표
        ...(supportLevel && { supportLevel }),
        ...(supportResistance && { supportResistance }),
        // Phase 3 지표
        ...(macd && { macd }),
        ...(stochastic && { stochastic }),
      };

      // marketData에 포함된 지표 로깅 (모든 지표 포함)
      console.log(`[Analyze API] Market data for ${symbol}:`, {
        hasRSI: marketData.rsi !== undefined,
        hasMovingAverages: marketData.movingAverages !== undefined,
        hasDisparity: marketData.disparity !== undefined,
        hasSupplyDemand: marketData.supplyDemand !== undefined,
        hasVIX: marketData.vix !== undefined,
        hasExchangeRate: marketData.exchangeRate !== undefined,
        hasNews: marketData.news !== undefined,
        // Phase 1 지표
        hasETFPremium: marketData.etfPremium !== undefined,
        hasBollingerBands: marketData.bollingerBands !== undefined,
        hasVolatility: marketData.volatility !== undefined,
        hasVolumeIndicators: marketData.volumeIndicators !== undefined,
        // Phase 2 지표
        hasSupportLevel: marketData.supportLevel !== undefined,
        hasSupportResistance: marketData.supportResistance !== undefined,
        // Phase 3 지표
        hasMACD: marketData.macd !== undefined,
        hasStochastic: marketData.stochastic !== undefined,
        // 디버깅 정보
        historicalDataLength: historicalData.length,
        closesLength: closes.length,
      });

      stocksDataForAI.push({
        symbol,
        marketData,
        selectedIndicators: indicators,
      });
    }

    // 단계 2: 기술적 지표 계산 완료
    const indicatorCalculationEnd = Date.now();
    const indicatorCalculationTiming = stepTimings.find(
      (t) => t.step === "indicatorCalculation",
    );
    if (indicatorCalculationTiming) {
      indicatorCalculationTiming.endTime = indicatorCalculationEnd;
      indicatorCalculationTiming.duration =
        indicatorCalculationEnd - indicatorCalculationTiming.startTime;
    }

    // 단계 3: AI 분석 시작 (Saveticker PDF 수집 포함)
    const aiAnalysisStart = Date.now();
    stepTimings.push({ step: "aiAnalysis", startTime: aiAnalysisStart });

    // Saveticker PDF 수집 (환경변수 설정 시에만 실행)
    let savetickerPDF: SavetickerPDFData | null = null;
    try {
      console.log('[Saveticker] PDF 수집 시작...');
      const pdfFetchStart = Date.now();
      savetickerPDF = await fetchLatestSavetickerPDF();
      const pdfFetchDuration = Date.now() - pdfFetchStart;

      if (savetickerPDF) {
        console.log(
          `[Saveticker] PDF 수집 완료: ${savetickerPDF.report.title} (${pdfFetchDuration}ms)`
        );
      } else {
        console.log('[Saveticker] PDF 없음 또는 미설정 (건너뜀)');
      }
    } catch (pdfError) {
      console.warn('[Saveticker] PDF 수집 실패, 주식 분석만 진행:', pdfError);
      savetickerPDF = null;
    }

    // 모든 종목의 데이터를 모아서 한 번에 AI 리포트 생성 (단 1회 Gemini API 호출, fallback 지원)
    // Saveticker PDF가 있으면 함께 전달하여 종합 분석
    let aiReportsMap = new Map<string, string>();
    let tokenUsage: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    } | undefined;

    if (stocksDataForAI.length > 0) {
      try {
        const reportSource = savetickerPDF
          ? `${stocksDataForAI.length} stocks + Saveticker PDF`
          : `${stocksDataForAI.length} stocks`;
        console.log(
          `Generating AI reports for ${reportSource} in a single API call...`,
        );

        // Fallback 지원으로 Gemini API 호출 (PDF 포함 시 멀티모달)
        const analysisDateStr =
          analysisDate || new Date().toISOString().split("T")[0];
        const result = await callGeminiWithFallback(
          async (genAI: GoogleGenerativeAI, modelName?: string) => {
            return await generateAIReportsBatch(
              stocksDataForAI,
              periodKorean,
              historicalPeriodKorean,
              analysisDateStr,
              genAI,
              modelName || "gemini-2.5-flash",
              savetickerPDF, // PDF 데이터 전달
            );
          },
          {
            model: "gemini-2.5-flash",
          },
        );
        aiReportsMap = result.reports;
        tokenUsage = result.tokenUsage;
      } catch (error) {
        console.error("Failed to generate AI reports:", error);

        // AI 리포트 생성 실패 시 에러 메시지로 채움
        const errorMessage =
          error instanceof Error ? error.message : "알 수 없는 오류";
        for (const { symbol } of stocksDataForAI) {
          aiReportsMap.set(
            symbol,
            `## ${symbol} 분석 리포트\n\n⚠️ AI 리포트 생성 중 오류가 발생했습니다: ${errorMessage}\n\n데이터 수집은 성공적으로 완료되었습니다.`,
          );
        }
      }
    }

    // 단계 3: AI 분석 완료
    const aiAnalysisEnd = Date.now();
    const aiAnalysisTiming = stepTimings.find((t) => t.step === "aiAnalysis");
    if (aiAnalysisTiming) {
      aiAnalysisTiming.endTime = aiAnalysisEnd;
      aiAnalysisTiming.duration = aiAnalysisEnd - aiAnalysisTiming.startTime;
    }

    // 단계 4: 리포트 생성 시작
    const reportGenerationStart = Date.now();
    stepTimings.push({
      step: "reportGeneration",
      startTime: reportGenerationStart,
    });

    // 결과 구성
    for (const { symbol, marketData } of stocksDataForAI) {
      const aiReport =
        aiReportsMap.get(symbol) ||
        `## ${symbol} 분석 리포트\n\n⚠️ AI 리포트를 생성할 수 없습니다.\n\n데이터 수집은 성공적으로 완료되었습니다.`;

      // historicalData 가져오기
      const stockData = stockDataMap.get(symbol);
      const historicalData = stockData?.historicalData || undefined;

      results.push({
        symbol,
        period: periodKorean,
        historicalPeriod: historicalPeriodKorean,
        marketData,
        historicalData,
        aiReport,
        // indicators 정보도 함께 전달 (일반 종목에서 ETF 괴리율 선택 시 메시지 표시용)
        selectedIndicators: indicators,
      });
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: "모든 종목 데이터 수집에 실패했습니다." },
        { status: 500 },
      );
    }

    // 단계 4: 리포트 생성 완료
    const reportGenerationEnd = Date.now();
    const reportGenerationTiming = stepTimings.find(
      (t) => t.step === "reportGeneration",
    );
    if (reportGenerationTiming) {
      reportGenerationTiming.endTime = reportGenerationEnd;
      reportGenerationTiming.duration =
        reportGenerationEnd - reportGenerationTiming.startTime;
    }

    // 전체 분석 시간 계산
    const totalAnalysisTime = Date.now() - analysisStartTime;

    // 각 단계별 소요 시간을 클라이언트에 전달하기 위한 메타데이터 생성
    const stepDurations = {
      dataCollection:
        stepTimings.find((t) => t.step === "dataCollection")?.duration || 0,
      indicatorCalculation:
        stepTimings.find((t) => t.step === "indicatorCalculation")?.duration ||
        0,
      aiAnalysis:
        stepTimings.find((t) => t.step === "aiAnalysis")?.duration || 0,
      reportGeneration:
        stepTimings.find((t) => t.step === "reportGeneration")?.duration || 0,
      total: totalAnalysisTime,
      stockCount: stocks.length,
      // Saveticker 통합 정보
      savetickerIncluded: !!savetickerPDF,
      savetickerReport: savetickerPDF
        ? {
            title: savetickerPDF.report.title,
            date: savetickerPDF.report.created_at.split('T')[0],
          }
        : null,
      // 토큰 사용량 (admin 전용)
      tokenUsage: tokenUsage || null,
    };

    console.log("[Analyze API] Step timings:", stepDurations);
    if (savetickerPDF) {
      console.log(
        `[Analyze API] Saveticker 리포트 통합: ${savetickerPDF.report.title} (Gemini API 단일 호출)`
      );
    }

    // 데이터 소스 정보 생성
    const dataSourceInfo = getDataSourceInfo(stocks);

    // 분석 히스토리 Supabase 저장 (비동기, 비블로킹)
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const analysisDateStr = analysisDate || new Date().toISOString().split("T")[0];

    saveAnalysisHistoryToSupabase({
      request_id: requestId,
      stocks,
      period: analysisPeriod,
      historical_period: historicalAnalysisPeriod,
      analysis_date: analysisDateStr,
      indicators: indicators as Record<string, boolean>,
      results: results as unknown as Record<string, unknown>,
      data_source: dataSourceInfo as Record<string, unknown>,
      metadata: {
        stepDurations,
        savetickerIncluded: !!savetickerPDF,
        tokenUsage: tokenUsage || null,
      },
      user_id: session.id,
    }).catch(() => {
      // 이미 함수 내부에서 에러 로깅하므로 여기서는 무시
    });

    const response: AnalyzeResponse = {
      results,
      // 데이터 소스 정보 (UI 표시용)
      dataSource: dataSourceInfo,
      // 메타데이터를 응답 헤더에 포함 (클라이언트에서 활용 가능)
      _metadata: stepDurations,
    };

    const responseObj = NextResponse.json(response);
    // 클라이언트에서 활용할 수 있도록 헤더에도 포함
    // 주의: HTTP 헤더는 ASCII만 허용하므로 한국어 텍스트가 포함된 필드 제외
    const headerSafeTimings = {
      dataCollection: stepDurations.dataCollection,
      indicatorCalculation: stepDurations.indicatorCalculation,
      aiAnalysis: stepDurations.aiAnalysis,
      reportGeneration: stepDurations.reportGeneration,
      total: stepDurations.total,
      stockCount: stepDurations.stockCount,
      savetickerIncluded: stepDurations.savetickerIncluded,
      // savetickerReport 제외 (한국어 제목 포함 가능)
      // tokenUsage 제외 (민감 정보)
    };
    responseObj.headers.set("X-Analysis-Timing", JSON.stringify(headerSafeTimings));

    return responseObj;
  } catch (error) {
    console.error("Error in analyze API:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "분석 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
