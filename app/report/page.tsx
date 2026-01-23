"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyzeResponse, AnalyzeResult } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import { PriceChart } from "@/components/charts/price-chart";
import { VolumeChart } from "@/components/charts/volume-chart";
import { RSIChart } from "@/components/charts/rsi-chart";
import { MACDChart } from "@/components/charts/macd-chart";
import { StochasticChart } from "@/components/charts/stochastic-chart";
import { transformToChartData } from "@/lib/chart-utils";
import { IndicatorInfoButton } from "@/components/indicator-info-button";
import { LegendTooltip } from "@/components/legend-tooltip";

export default function ReportPage() {
  const router = useRouter();
  const [results, setResults] = useState<AnalyzeResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [periodText, setPeriodText] = useState("데이터를");

  useEffect(() => {
    // sessionStorage는 클라이언트 사이드에서만 사용 가능
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }

    // 즉시 스크롤을 최상단으로 이동 (화면 전환 체감 개선)
    window.scrollTo({ top: 0, behavior: "instant" });

    const stored = sessionStorage.getItem("analysisResults");
    if (!stored) {
      router.push("/");
      setIsLoading(false);
      return;
    }

    // 비동기로 처리하여 UI 블로킹 방지
    requestAnimationFrame(() => {
      try {
        const data: AnalyzeResponse = JSON.parse(stored);

        // API 오류가 있으면 표시
        if (data.error) {
          setResults([]);
          setIsLoading(false);
          return;
        }

        if (data.results && data.results.length > 0) {
          setResults(data.results);
          setSelectedIndex(0); // 결과가 로드되면 첫 번째 종목으로 리셋

          // 분석 기간 텍스트 설정 (하이드레이션 오류 방지)
          if (data.results[0].period) {
            setPeriodText(`${data.results[0].period} 동안의 데이터를`);
          }
        } else {
          setResults([]);
        }
      } catch (error) {
        console.error("Failed to parse results:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    });
  }, [router]);

  // selectedIndex가 유효한 범위인지 확인하고 자동 조정
  // ⚠️ 중요: 모든 hooks는 조건부 return 이전에 호출되어야 함 (React Hooks 규칙)
  useEffect(() => {
    if (
      results.length > 0 &&
      (selectedIndex >= results.length || selectedIndex < 0)
    ) {
      setSelectedIndex(0);
    }
  }, [results.length]); // results.length만 의존성으로 사용 (무한 루프 방지)

  // 오류 페이지 표시 시 최상단으로 스크롤
  useEffect(() => {
    if (results.length === 0 && !isLoading) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [results.length, isLoading]);

  // 안전한 인덱스 계산 (항상 유효한 범위 내)
  const safeIndex =
    results.length > 0
      ? Math.max(0, Math.min(selectedIndex, results.length - 1))
      : 0;

  const currentResult = results.length > 0 ? results[safeIndex] : null;

  // 차트 데이터 메모이제이션
  // ⚠️ 중요: 모든 hooks는 조건부 return 이전에 호출되어야 함 (React Hooks 규칙)
  const chartData = useMemo(() => {
    if (
      !currentResult?.historicalData ||
      currentResult.historicalData.length === 0
    ) {
      return null;
    }
    // marketData.volume을 전달하여 최신 거래량과 차트 데이터 일치시키기
    return transformToChartData(
      currentResult,
      currentResult.marketData?.volume
    );
  }, [currentResult]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-12 max-w-6xl">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              📊 분석 결과
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              AI가 {periodText} 분석 중입니다...
            </p>
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    // sessionStorage에서 오류 메시지 확인
    let errorMessage = "분석 결과가 없습니다.";
    let invalidStocks: string[] = [];
    try {
      const stored = sessionStorage.getItem("analysisResults");
      if (stored) {
        const data: AnalyzeResponse & { invalidStocks?: string[] } = JSON.parse(stored);
        if (data.error) {
          errorMessage = data.error;
        }
        if (data.invalidStocks) {
          invalidStocks = data.invalidStocks;
        }
      }
    } catch (e) {
      // 무시
    }

    // 종목명을 추출하여 강조 표시
    const renderErrorMessage = () => {
      if (invalidStocks.length > 0) {
        return (
          <div className="space-y-3">
            <p className="text-red-700 font-medium">다음 종목{invalidStocks.length > 1 ? '들을' : '을'} 찾을 수 없습니다:</p>
            <div className="space-y-2">
              {invalidStocks.map((stock, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200"
                >
                  <span className="text-red-600 font-bold text-lg">•</span>
                  <span className="text-gray-900 font-bold text-lg">{stock}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-blue-800 text-sm font-medium mb-1">💡 입력 방법:</p>
              <ul className="text-blue-700 text-sm space-y-1 list-disc list-inside">
                <li>정확한 종목명을 입력하세요 (예: "삼성전자")</li>
                <li>또는 6자리 종목코드를 입력하세요 (예: "005930")</li>
              </ul>
            </div>
          </div>
        );
      }
      
      // 기존 오류 메시지가 있으면 그대로 표시 (마크다운 지원)
      return (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{errorMessage}</ReactMarkdown>
        </div>
      );
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-6 sm:py-12 max-w-6xl">
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader>
              <CardTitle className="text-red-700 flex items-center gap-2">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                분석 오류
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-white rounded-lg border border-red-200">
                <p className="text-red-700 font-medium mb-3">오류 내용:</p>
                {renderErrorMessage()}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => {
                    // 오류가 난 종목명을 쿼리 파라미터로 전달
                    if (invalidStocks.length > 0) {
                      const stocksParam = invalidStocks.map(s => encodeURIComponent(s)).join(',');
                      router.push(`/?stocks=${stocksParam}`);
                    } else {
                      router.push("/");
                    }
                  }}
                  className="w-full sm:w-auto bg-red-600 hover:bg-red-700"
                >
                  다시 분석하기
                </Button>
                <Button
                  onClick={() => router.back()}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  이전 페이지로
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!currentResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-12 max-w-6xl">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">
                분석 결과를 불러올 수 없습니다.
              </p>
              <Button onClick={() => router.push("/")} className="mt-4 w-full">
                다시 분석하기
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { marketData, aiReport } = currentResult;

  const getRSIStatus = (rsi?: number) => {
    if (!rsi) return { text: "N/A", color: "text-gray-500" };
    if (rsi >= 70) return { text: "🔴 과매수", color: "text-red-600" };
    if (rsi <= 30) return { text: "🟢 과매도", color: "text-green-600" };
    return { text: "🟡 중립", color: "text-yellow-600" };
  };

  const rsiStatus = getRSIStatus(marketData.rsi);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              📊 분석 결과
            </h1>
            {(currentResult.period || currentResult.historicalPeriod) && (
              <div className="text-xs sm:text-sm text-gray-600 mt-1 space-y-0.5 sm:space-y-1">
                {currentResult.historicalPeriod && (
                  <p>과거 이력 분석 기간: {currentResult.historicalPeriod}</p>
                )}
                {currentResult.period && (
                  <p>향후 전망 분석 기간: {currentResult.period}</p>
                )}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            className="w-full sm:w-auto"
          >
            새 분석
          </Button>
        </div>

        {/* 종목 탭 - 항상 표시 (1개일 때도 표시하여 일관성 유지) */}
        <div className="flex gap-2 mb-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {results.map((result, index) => (
            <button
              key={`${result.symbol}-${index}`}
              onClick={() => setSelectedIndex(index)}
              className={`px-3 sm:px-4 py-2 rounded-md font-medium whitespace-nowrap transition-colors text-sm sm:text-base flex-shrink-0 ${
                selectedIndex === index
                  ? "bg-primary text-primary-foreground"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="block sm:inline">
                {result.name || result.symbol}
              </span>
              {(result.period || result.historicalPeriod) && (
                <span className="ml-1 sm:ml-2 text-xs opacity-75 hidden sm:inline">
                  {result.historicalPeriod &&
                    `과거: ${result.historicalPeriod}`}
                  {result.historicalPeriod && result.period && " / "}
                  {result.period && `전망: ${result.period}`}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 네이버 증권 링크 + 범례 안내 */}
        <div className="mb-2 sm:mb-3 px-1 space-y-1.5">
          {/* 네이버 증권 링크 */}
          {currentResult && (
            <a
              href={`https://stock.naver.com/domestic/stock/${currentResult.symbol.replace(/\.(KS|KQ)$/, '')}/price`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] sm:text-xs text-blue-600 hover:text-blue-800 bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50 rounded px-2 py-1.5 transition-all group w-fit"
            >
              <span className="text-sm">📊</span>
              <span className="font-medium">
                네이버 증권에서 {currentResult.name || currentResult.symbol} 상세 정보 보기
              </span>
              <svg
                className="w-3 h-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
          {/* 범례 안내 텍스트 */}
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded px-2 py-1">
            <span className="text-sm">💡</span>
            <span>
              각 지표의 범례를 클릭하면 의미 또는 시사점 확인 가능합니다
            </span>
          </div>
        </div>

        {/* 대시보드 섹션 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {/* 현재가 */}
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                💰 현재가
                <IndicatorInfoButton indicatorKey="price" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                {marketData.price.toLocaleString()}
              </div>
              <div
                className={`text-xs sm:text-sm mt-1 ${
                  marketData.changePercent >= 0
                    ? "text-red-600"
                    : "text-blue-600"
                }`}
              >
                {marketData.changePercent >= 0 ? "+" : ""}
                {marketData.changePercent.toFixed(2)}% (
                {marketData.change >= 0 ? "+" : ""}
                {marketData.change.toLocaleString()})
              </div>
            </CardContent>
          </Card>

          {/* RSI */}
          {marketData.rsi !== undefined && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📈 RSI(14)
                  <IndicatorInfoButton indicatorKey="rsi" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold">
                  {marketData.rsi}
                </div>
                <div
                  className={`text-sm font-bold sm:text-sm mt-1 ${rsiStatus.color}`}
                >
                  {rsiStatus.text}
                </div>
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        상태 범례:
                      </span>
                      <LegendTooltip
                        label="과매수 (≥70)"
                        description="주가가 너무 많이 올라서 매도 압력이 커질 수 있는 상태입니다. 상승 추세가 약해질 가능성이 있습니다."
                      >
                        🔴 과매수 (≥70)
                      </LegendTooltip>
                      <LegendTooltip
                        label="중립 (30-70)"
                        description="주가가 적정 수준에 있는 상태입니다. 과도한 매수나 매도 압력이 없는 균형 상태입니다."
                      >
                        🟡 중립 (30-70)
                      </LegendTooltip>
                      <LegendTooltip
                        label="과매도 (≤30)"
                        description="주가가 너무 많이 내려서 매수 기회가 생길 수 있는 상태입니다. 반등 가능성이 있습니다."
                      >
                        🟢 과매도 (≤30)
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 이동평균선 */}
          {marketData.movingAverages && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📉 이동평균선
                  <IndicatorInfoButton indicatorKey="movingAverages" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs sm:text-sm">
                <div className="flex items-center gap-1.5">
                  <span>📅</span>
                  <span className="font-medium">5일:</span>
                  <span className="font-semibold text-gray-900">
                    {marketData.movingAverages.ma5.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>📅</span>
                  <span className="font-medium">20일:</span>
                  <span className="font-semibold text-gray-900">
                    {marketData.movingAverages.ma20.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>📅</span>
                  <span className="font-medium">60일:</span>
                  <span className="font-semibold text-gray-900">
                    {marketData.movingAverages.ma60.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>📅</span>
                  <span className="font-medium">120일:</span>
                  <span className="font-semibold text-gray-900">
                    {marketData.movingAverages.ma120.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 이격도 */}
          {marketData.disparity !== undefined && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📏 이격도 (20일 기준)
                  <IndicatorInfoButton indicatorKey="disparity" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold">
                  {marketData.disparity}%
                </div>
                <div
                  className={`text-sm sm:text-base font-bold mt-1 flex items-center gap-1.5 ${
                    marketData.disparity > 105
                      ? "text-red-600"
                      : marketData.disparity < 95
                      ? "text-blue-600"
                      : "text-green-600"
                  }`}
                >
                  {marketData.disparity > 105
                    ? "🔴 과열 구간"
                    : marketData.disparity < 95
                    ? "🔵 침체 구간"
                    : "🟢 정상 구간"}
                </div>
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        상태 범례:
                      </span>
                      <LegendTooltip
                        label="과열 구간 (>105%)"
                        description="현재가가 20일 이동평균선보다 5% 이상 높은 상태입니다. 주가가 과도하게 상승했을 수 있어 하락 위험이 있습니다."
                      >
                        🔴 과열 구간 (&gt;105%)
                      </LegendTooltip>
                      <LegendTooltip
                        label="정상 구간 (95-105%)"
                        description="현재가가 20일 이동평균선 근처에 있는 상태입니다. 주가가 적정 수준에 있어 안정적입니다."
                      >
                        🟢 정상 구간 (95-105%)
                      </LegendTooltip>
                      <LegendTooltip
                        label="침체 구간 (<95%)"
                        description="현재가가 20일 이동평균선보다 5% 이상 낮은 상태입니다. 주가가 과도하게 하락했을 수 있어 반등 기회가 있을 수 있습니다."
                      >
                        🔵 침체 구간 (&lt;95%)
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 수급 */}
          {marketData.supplyDemand && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  🔄 수급 (주)
                  <IndicatorInfoButton indicatorKey="supplyDemand" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs sm:text-sm">
                <div>
                  기관:{" "}
                  <span
                    className={
                      marketData.supplyDemand.institutional >= 0
                        ? "text-red-600"
                        : "text-blue-600"
                    }
                  >
                    {marketData.supplyDemand.institutional >= 0 ? "+" : ""}
                    {marketData.supplyDemand.institutional.toLocaleString()}
                  </span>
                </div>
                <div>
                  외국인:{" "}
                  <span
                    className={
                      marketData.supplyDemand.foreign >= 0
                        ? "text-red-600"
                        : "text-blue-600"
                    }
                  >
                    {marketData.supplyDemand.foreign >= 0 ? "+" : ""}
                    {marketData.supplyDemand.foreign.toLocaleString()}
                  </span>
                </div>
                <div>
                  개인:{" "}
                  <span
                    className={
                      marketData.supplyDemand.individual >= 0
                        ? "text-red-600"
                        : "text-blue-600"
                    }
                  >
                    {marketData.supplyDemand.individual >= 0 ? "+" : ""}
                    {marketData.supplyDemand.individual.toLocaleString()}
                  </span>
                </div>
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        상태 범례:
                      </span>
                      <LegendTooltip
                        label="매수 (+)"
                        description="해당 투자자 집단(기관, 외국인, 개인)이 주식을 사들인 상태입니다. 매수세가 강하면 주가 상승에 도움이 될 수 있습니다."
                      >
                        🔴 매수 (+)
                      </LegendTooltip>
                      <LegendTooltip
                        label="매도 (-)"
                        description="해당 투자자 집단(기관, 외국인, 개인)이 주식을 팔아치운 상태입니다. 매도세가 강하면 주가 하락 압력이 있을 수 있습니다."
                      >
                        🔵 매도 (-)
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* VIX */}
          {marketData.vix !== undefined && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  😰 VIX 지수
                  <IndicatorInfoButton indicatorKey="fearGreed" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold">
                  {marketData.vix.toFixed(2)}
                </div>
                <div className="text-xs sm:text-sm mt-1 text-gray-600">
                  {marketData.vix > 30
                    ? "공포 구간"
                    : marketData.vix < 20
                    ? "탐욕 구간"
                    : "중립"}
                </div>
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        상태 범례:
                      </span>
                      <LegendTooltip
                        label="공포 구간 (>30)"
                        description="시장 참여자들이 공포 상태에 있어 주가가 더 하락할 수 있습니다. 하지만 과도한 하락 후 반등 기회가 생길 수도 있습니다."
                      >
                        🔴 공포 구간 (&gt;30)
                      </LegendTooltip>
                      <LegendTooltip
                        label="중립 (20-30)"
                        description="시장 심리가 균형 상태입니다. 공포나 탐욕이 과도하지 않은 정상적인 시장 상황입니다."
                      >
                        🟡 중립 (20-30)
                      </LegendTooltip>
                      <LegendTooltip
                        label="탐욕 구간 (<20)"
                        description="시장 참여자들이 탐욕 상태에 있어 주가가 더 상승할 수 있습니다. 하지만 과도한 상승 후 하락 위험이 있을 수 있습니다."
                      >
                        🟢 탐욕 구간 (&lt;20)
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 환율 */}
          {marketData.exchangeRate && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  💱 환율 (USD/KRW)
                  <IndicatorInfoButton indicatorKey="exchangeRate" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold">
                  {marketData.exchangeRate.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phase 1 지표 */}
          {/* ETF 괴리율 */}
          {(marketData.etfPremium ||
            (currentResult.selectedIndicators?.etfPremium &&
              !marketData.etfPremium)) && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📊 ETF 괴리율
                  <IndicatorInfoButton indicatorKey="etfPremium" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {marketData.etfPremium ? (
                  <>
                    <div className="text-xl sm:text-2xl font-bold">
                      {marketData.etfPremium.premium >= 0 ? "+" : ""}
                      {marketData.etfPremium.premium}%
                    </div>
                    <div
                      className={`text-xs sm:text-sm mt-1 ${
                        marketData.etfPremium.isPremium
                          ? "text-red-600"
                          : marketData.etfPremium.isDiscount
                          ? "text-blue-600"
                          : "text-gray-600"
                      }`}
                    >
                      {marketData.etfPremium.isPremium
                        ? "프리미엄"
                        : marketData.etfPremium.isDiscount
                        ? "할인"
                        : "정상"}
                    </div>
                    {/* 범례 */}
                    <div className="mt-3 pt-2 border-t border-gray-200">
                      <div className="text-[10px] text-gray-500">
                        <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                          <span className="font-medium text-gray-600">
                            상태 범례:
                          </span>
                          <LegendTooltip
                            label="프리미엄 (>0%)"
                            description="ETF 시장 가격이 실제 가치(NAV)보다 높은 상태입니다. ETF를 비싸게 사는 것이므로 매수 시 주의가 필요합니다."
                          >
                            🔴 프리미엄 (&gt;0%)
                          </LegendTooltip>
                          <LegendTooltip
                            label="정상 (=0%)"
                            description="ETF 시장 가격이 실제 가치(NAV)와 거의 같은 상태입니다. 공정한 가격으로 거래되고 있습니다."
                          >
                            ⚪ 정상 (=0%)
                          </LegendTooltip>
                          <LegendTooltip
                            label="할인 (<0%)"
                            description="ETF 시장 가격이 실제 가치(NAV)보다 낮은 상태입니다. ETF를 싸게 살 수 있는 기회일 수 있습니다."
                          >
                            🔵 할인 (&lt;0%)
                          </LegendTooltip>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    ⚠️ 일반 종목은 ETF 괴리율 분석이 불가능합니다. ETF 괴리율은
                    ETF 전용 지표입니다.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 볼린저 밴드 */}
          {marketData.bollingerBands && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📊 볼린저 밴드
                  <IndicatorInfoButton indicatorKey="bollingerBands" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs sm:text-sm">
                <div>
                  상단: {marketData.bollingerBands.upper.toLocaleString()}
                </div>
                <div>
                  중심선: {marketData.bollingerBands.middle.toLocaleString()}
                </div>
                <div>
                  하단: {marketData.bollingerBands.lower.toLocaleString()}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm">📍</span>
                    <span className="text-xs sm:text-sm font-medium text-gray-700">
                      현재 위치:
                    </span>
                    <span className="text-sm sm:text-base font-bold text-gray-900">
                      {(marketData.bollingerBands.position * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs sm:text-sm text-gray-600">
                      {marketData.bollingerBands.position >= 0.8
                        ? "🔴 상단 근처"
                        : marketData.bollingerBands.position >= 0.2
                        ? "🟡 중간 구간"
                        : "🔵 하단 근처"}
                    </span>
                  </div>
                </div>
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        위치 범례:
                      </span>
                      <LegendTooltip
                        label="상단 근처 (80-100%)"
                        description="주가가 볼린저 밴드 상단선 근처에 있습니다. 주가가 높은 수준이므로 하락 압력이 있을 수 있습니다."
                      >
                        🔴 상단 근처 (80-100%)
                      </LegendTooltip>
                      <LegendTooltip
                        label="중간 구간 (20-80%)"
                        description="주가가 볼린저 밴드 중간 구간에 있습니다. 주가가 적정 수준에 있어 안정적인 상태입니다."
                      >
                        🟡 중간 구간 (20-80%)
                      </LegendTooltip>
                      <LegendTooltip
                        label="하단 근처 (0-20%)"
                        description="주가가 볼린저 밴드 하단선 근처에 있습니다. 주가가 낮은 수준이므로 반등 기회가 있을 수 있습니다."
                      >
                        🔵 하단 근처 (0-20%)
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 변동성 */}
          {marketData.volatility && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📊 변동성
                  <IndicatorInfoButton indicatorKey="volatility" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold">
                  {marketData.volatility.annualizedVolatility.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500 mt-0.5">(20일 기준)</div>
                <div
                  className={`text-sm sm:text-base font-bold mt-1 flex items-center gap-1.5 ${
                    marketData.volatility.volatilityRank === "low"
                      ? "text-green-600"
                      : marketData.volatility.volatilityRank === "medium"
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {marketData.volatility.volatilityRank === "low"
                    ? "🟢 낮음"
                    : marketData.volatility.volatilityRank === "medium"
                    ? "🟡 보통"
                    : "🔴 높음"}
                </div>
                <div className="text-xs sm:text-sm text-gray-600 mt-1.5 flex items-center gap-1">
                  <span>📊</span>
                  <span>
                    일일 변동률:{" "}
                    <span className="font-semibold text-gray-900">
                      {marketData.volatility.volatility.toFixed(2)}%
                    </span>
                  </span>
                </div>
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        등급 범례:
                      </span>
                      <LegendTooltip
                        label="낮음 (<15%)"
                        description="주가 변동이 작아 안정적인 상태입니다. 큰 손실 위험은 낮지만 큰 수익 기회도 제한적일 수 있습니다."
                      >
                        🟢 낮음 (&lt;15%)
                      </LegendTooltip>
                      <LegendTooltip
                        label="보통 (15-30%)"
                        description="주가 변동이 적정 수준입니다. 일반적인 시장 상황으로 보이며, 적절한 리스크와 수익 기회가 공존합니다."
                      >
                        🟡 보통 (15-30%)
                      </LegendTooltip>
                      <LegendTooltip
                        label="높음 (≥30%)"
                        description="주가 변동이 매우 큽니다. 큰 수익 기회가 있지만 동시에 큰 손실 위험도 있습니다. 신중한 투자가 필요합니다."
                      >
                        🔴 높음 (≥30%)
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 거래량 지표 */}
          {marketData.volumeIndicators && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📦 거래량 지표
                  <IndicatorInfoButton indicatorKey="volumeIndicators" />
                  {/* 쌍끌이 표시 */}
                  {marketData.supplyDemand &&
                    marketData.supplyDemand.foreign > 0 &&
                    marketData.supplyDemand.institutional > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-bold rounded-full animate-pulse">
                        🔥 쌍끌이
                      </span>
                    )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs sm:text-sm">
                {/* 핵심 정보 영역 - 더 강조 */}
                <div className="font-medium text-gray-700 flex items-center gap-1.5">
                  <span>📅</span>
                  <span>
                    {new Date().getFullYear()}.
                    {String(new Date().getMonth() + 1).padStart(2, "0")}.
                    {String(new Date().getDate()).padStart(2, "0")}일 현 시점
                    기준 거래량:{" "}
                    <span className="font-bold text-gray-900">
                      {(
                        marketData.volumeIndicators.currentVolume ??
                        marketData.volume
                      ).toLocaleString()}
                    </span>
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex flex-wrap gap-x-4 gap-y-2 items-center">
                  <div className="text-sm sm:text-base text-gray-700">
                    <span className="font-semibold">20일 평균:</span>{" "}
                    <span className="font-bold text-gray-900">
                      {marketData.volumeIndicators.averageVolume.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm sm:text-base text-gray-700">
                    <span className="font-semibold">평균 대비:</span>{" "}
                    <span className="font-bold text-gray-900">
                      {marketData.volumeIndicators.volumeRatio.toFixed(2)}배
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 items-center text-sm sm:text-base">
                  <div
                    className={`font-semibold ${
                      marketData.volumeIndicators.isHighVolume
                        ? "text-red-600"
                        : "text-gray-700"
                    }`}
                  >
                    <span className="font-medium text-gray-700">상태:</span>{" "}
                    <span className="font-bold">
                      {marketData.volumeIndicators.isHighVolume
                        ? "🔴 고거래량"
                        : "⚪ 정상"}
                    </span>
                  </div>
                  <div className="font-semibold text-gray-700">
                    <span className="font-medium">추세:</span>{" "}
                    <span className="font-bold">
                      {marketData.volumeIndicators.volumeTrend === "increasing"
                        ? "📈 증가"
                        : marketData.volumeIndicators.volumeTrend ===
                          "decreasing"
                        ? "📉 감소"
                        : "➡️ 안정"}
                    </span>
                  </div>
                </div>
                {/* 외국인/기관 순매수 정보 */}
                {marketData.supplyDemand && (
                  <div className="pt-3 border-t border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      수급 현황 (순매수)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-gray-600">외국인</span>
                        <span
                          className={`font-bold ${
                            marketData.supplyDemand.foreign >= 0
                              ? "text-red-600"
                              : "text-blue-600"
                          }`}
                        >
                          {marketData.supplyDemand.foreign >= 0 ? "+" : ""}
                          {marketData.supplyDemand.foreign.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-gray-600">기관</span>
                        <span
                          className={`font-bold ${
                            marketData.supplyDemand.institutional >= 0
                              ? "text-red-600"
                              : "text-blue-600"
                          }`}
                        >
                          {marketData.supplyDemand.institutional >= 0 ? "+" : ""}
                          {marketData.supplyDemand.institutional.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center mb-1.5">
                      <span className="font-medium text-gray-600">
                        상태 범례:
                      </span>
                      <LegendTooltip
                        label="고거래량 (≥1.5배)"
                        description="현재 거래량이 평균보다 1.5배 이상 많습니다. 많은 투자자들이 관심을 보이고 있어 주가 변동이 클 수 있습니다."
                      >
                        🔴 고거래량 (≥1.5배)
                      </LegendTooltip>
                      <LegendTooltip
                        label="정상 (<1.5배)"
                        description="현재 거래량이 평균 수준입니다. 일반적인 거래 활동이 이루어지고 있는 상태입니다."
                      >
                        ⚪ 정상 (&lt;1.5배)
                      </LegendTooltip>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        추세 범례:
                      </span>
                      <LegendTooltip
                        label="증가"
                        description="최근 거래량이 증가하고 있습니다. 관심이 높아지고 있어 주가 변동이 커질 수 있습니다."
                      >
                        📈 증가
                      </LegendTooltip>
                      <LegendTooltip
                        label="안정"
                        description="거래량이 안정적인 상태입니다. 큰 변화 없이 일정한 수준을 유지하고 있습니다."
                      >
                        ➡️ 안정
                      </LegendTooltip>
                      <LegendTooltip
                        label="감소"
                        description="최근 거래량이 감소하고 있습니다. 관심이 줄어들고 있어 주가 변동이 작아질 수 있습니다."
                      >
                        📉 감소
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phase 2 지표 */}
          {/* 눌림목 여부 */}
          {marketData.supportLevel && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  🛡️ 눌림목 여부
                  <IndicatorInfoButton indicatorKey="supportLevel" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-lg sm:text-2xl font-bold flex items-center gap-1.5 ${
                    marketData.supportLevel.isNearSupport
                      ? "text-green-600"
                      : "text-gray-600"
                  }`}
                >
                  {marketData.supportLevel.isNearSupport
                    ? "🟢 지지선 근처"
                    : "⚪ 일반 구간"}
                </div>
                <div className="text-xs sm:text-sm mt-1 text-gray-600">
                  지지선:{" "}
                  {marketData.supportLevel.supportLevel.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  거리:{" "}
                  {marketData.supportLevel.distanceFromSupport >= 0 ? "+" : ""}
                  {marketData.supportLevel.distanceFromSupport.toFixed(2)}%
                </div>
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        상태 범례:
                      </span>
                      <LegendTooltip
                        label="지지선 근처 (±5% 이내)"
                        description="주가가 과거 저점(지지선) 근처에 있습니다. 지지선에서 반등할 가능성이 있어 매수 기회일 수 있습니다."
                      >
                        🟢 지지선 근처 (±5% 이내)
                      </LegendTooltip>
                      <LegendTooltip
                        label="일반 구간 (5% 초과)"
                        description="주가가 지지선에서 멀리 떨어져 있습니다. 지지선의 영향을 받지 않는 일반적인 구간입니다."
                      >
                        ⚪ 일반 구간 (5% 초과)
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 저항선/지지선 */}
          {marketData.supportResistance && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  🎯 저항선/지지선
                  <IndicatorInfoButton indicatorKey="supportResistance" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs sm:text-sm">
                <div>
                  <div className="font-medium text-gray-700 mb-1">
                    저항선 (최근 고점 기준 3개):
                  </div>
                  <div className="text-gray-600 break-words flex flex-wrap gap-x-3 gap-y-1">
                    {marketData.supportResistance?.resistanceLevels.map(
                      (l, idx) => {
                        // 디버깅: 날짜 데이터 확인
                        const allDates =
                          marketData.supportResistance?.resistanceDates || [];
                        const date = allDates[idx] || "";

                        // 디버깅 로그
                        if (!date && idx === 0) {
                          console.warn(
                            "[Report Page] Resistance dates missing:",
                            {
                              resistanceDates: allDates,
                              resistanceLevels:
                                marketData.supportResistance?.resistanceLevels,
                              index: idx,
                            }
                          );
                        }

                        let formattedDate = "";
                        if (date) {
                          try {
                            // 날짜 형식 변환 (YYYY-MM-DD 또는 다른 형식 지원)
                            const dateObj = new Date(date);
                            if (!isNaN(dateObj.getTime())) {
                              formattedDate = dateObj
                                .toLocaleDateString("ko-KR", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                })
                                .replace(/\./g, ".")
                                .replace(/\s/g, "");
                            } else {
                              console.warn(
                                `[Report Page] Invalid date: ${date}`
                              );
                            }
                          } catch (e) {
                            console.warn(
                              `[Report Page] Failed to parse date: ${date}`,
                              e
                            );
                          }
                        }
                        return (
                          <LegendTooltip
                            key={idx}
                            label={`${idx + 1}차 저항선`}
                            description={
                              formattedDate
                                ? `${formattedDate}에 형성된 저항선입니다.`
                                : `날짜 정보 없음 (원본: ${date || "없음"})`
                            }
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                {idx + 1}차
                              </span>
                              <span className="font-semibold text-gray-900">
                                {l.toLocaleString()}
                              </span>
                            </span>
                          </LegendTooltip>
                        );
                      }
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-gray-700 mb-1 mt-2">
                    지지선 (최근 저점 기준 3개):
                  </div>
                  <div className="text-gray-600 break-words flex flex-wrap gap-x-3 gap-y-1">
                    {marketData.supportResistance?.supportLevels.map(
                      (l, idx) => {
                        // 디버깅: 날짜 데이터 확인
                        const allDates =
                          marketData.supportResistance?.supportDates || [];
                        const date = allDates[idx] || "";

                        // 디버깅 로그
                        if (!date && idx === 0) {
                          console.warn("[Report Page] Support dates missing:", {
                            supportDates: allDates,
                            supportLevels:
                              marketData.supportResistance?.supportLevels,
                            index: idx,
                          });
                        }

                        let formattedDate = "";
                        if (date) {
                          try {
                            // 날짜 형식 변환 (YYYY-MM-DD 또는 다른 형식 지원)
                            const dateObj = new Date(date);
                            if (!isNaN(dateObj.getTime())) {
                              formattedDate = dateObj
                                .toLocaleDateString("ko-KR", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                })
                                .replace(/\./g, ".")
                                .replace(/\s/g, "");
                            } else {
                              console.warn(
                                `[Report Page] Invalid date: ${date}`
                              );
                            }
                          } catch (e) {
                            console.warn(
                              `[Report Page] Failed to parse date: ${date}`,
                              e
                            );
                          }
                        }
                        return (
                          <LegendTooltip
                            key={idx}
                            label={`${idx + 1}차 지지선`}
                            description={
                              formattedDate
                                ? `${formattedDate}에 형성된 지지선입니다.`
                                : `날짜 정보 없음 (원본: ${date || "없음"})`
                            }
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                {idx + 1}차
                              </span>
                              <span className="font-semibold text-gray-900">
                                {l.toLocaleString()}
                              </span>
                            </span>
                          </LegendTooltip>
                        );
                      }
                    )}
                  </div>
                </div>
                <div
                  className={`text-sm sm:text-base font-bold mt-3 pt-2 border-t border-gray-200 flex items-center gap-1.5 flex-wrap ${
                    marketData.supportResistance?.currentPosition ===
                    "near_resistance"
                      ? "text-red-600"
                      : marketData.supportResistance?.currentPosition ===
                        "near_support"
                      ? "text-green-600"
                      : "text-gray-600"
                  }`}
                >
                  <span>📍</span>
                  <span>현재:</span>
                  {(() => {
                    const currentPrice = marketData.price;
                    let positionText = "";
                    let levelIndex = -1;

                    if (
                      marketData.supportResistance?.currentPosition ===
                      "near_resistance"
                    ) {
                      // 가장 가까운 저항선 찾기
                      const distances =
                        marketData.supportResistance?.resistanceLevels.map(
                          (level, idx) => ({
                            index: idx,
                            distance: Math.abs(level - currentPrice),
                          })
                        );
                      const nearest = distances.reduce((min, curr) =>
                        curr.distance < min.distance ? curr : min
                      );
                      levelIndex = nearest.index;
                      positionText = `🔴 ${levelIndex + 1}차 저항선 근처`;
                    } else if (
                      marketData.supportResistance?.currentPosition ===
                      "near_support"
                    ) {
                      // 가장 가까운 지지선 찾기
                      const distances =
                        marketData.supportResistance?.supportLevels.map(
                          (level, idx) => ({
                            index: idx,
                            distance: Math.abs(level - currentPrice),
                          })
                        );
                      const nearest = distances.reduce((min, curr) =>
                        curr.distance < min.distance ? curr : min
                      );
                      levelIndex = nearest.index;
                      positionText = `🟢 ${levelIndex + 1}차 지지선 근처`;
                    } else {
                      positionText = "⚪ 중간";
                    }

                    return <span>{positionText}</span>;
                  })()}
                </div>
                {/* 범례 */}
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        위치 범례:
                      </span>
                      <LegendTooltip
                        label="저항선 근처 (3% 이내)"
                        description="주가가 과거 고점(저항선) 근처에 있습니다. 저항선에서 하락 압력을 받을 수 있어 주의가 필요합니다."
                      >
                        🔴 저항선 근처 (3% 이내)
                      </LegendTooltip>
                      <LegendTooltip
                        label="지지선 근처 (3% 이내)"
                        description="주가가 과거 저점(지지선) 근처에 있습니다. 지지선에서 반등할 가능성이 있어 매수 기회일 수 있습니다."
                      >
                        🟢 지지선 근처 (3% 이내)
                      </LegendTooltip>
                      <LegendTooltip
                        label="중간 구간"
                        description="주가가 저항선과 지지선 중간에 있습니다. 특별한 압력 없이 자유롭게 움직일 수 있는 구간입니다."
                      >
                        ⚪ 중간 구간
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* MACD */}
          {marketData.macd && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📊 MACD
                  <IndicatorInfoButton indicatorKey="macd" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-gray-600">MACD Line</span>
                    <span className={`text-sm sm:text-base font-bold ${
                      marketData.macd.macd > 0 ? "text-red-600" : marketData.macd.macd < 0 ? "text-blue-600" : "text-gray-600"
                    }`}>
                      {marketData.macd.macd.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-gray-600">Signal Line</span>
                    <span className="text-sm sm:text-base font-medium text-gray-700">
                      {marketData.macd.signal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-gray-600">Histogram</span>
                    <span className={`text-sm sm:text-base font-bold ${
                      marketData.macd.histogram > 0 ? "text-red-600" : marketData.macd.histogram < 0 ? "text-blue-600" : "text-gray-600"
                    }`}>
                      {marketData.macd.histogram.toFixed(2)}
                    </span>
                  </div>
                  <div className={`text-sm sm:text-base font-bold mt-3 pt-2 border-t border-gray-200 ${
                    marketData.macd.crossover === "golden"
                      ? "text-red-600"
                      : marketData.macd.crossover === "death"
                      ? "text-blue-600"
                      : marketData.macd.trend === "bullish"
                      ? "text-red-600"
                      : marketData.macd.trend === "bearish"
                      ? "text-blue-600"
                      : "text-gray-600"
                  }`}>
                    {marketData.macd.crossover === "golden"
                      ? "🔴 골든 크로스 (매수 신호)"
                      : marketData.macd.crossover === "death"
                      ? "🔵 데드 크로스 (매도 신호)"
                      : marketData.macd.trend === "bullish"
                      ? "🔴 상승 추세"
                      : marketData.macd.trend === "bearish"
                      ? "🔵 하락 추세"
                      : "⚪ 중립"}
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-2">지표 해석</div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        신호 범례:
                      </span>
                      <LegendTooltip
                        label="골든 크로스"
                        description="MACD Line이 Signal Line을 아래에서 위로 돌파하면 상승 추세 전환 신호입니다. 매수 타이밍으로 볼 수 있습니다."
                      >
                        🔴 골든 크로스
                      </LegendTooltip>
                      <LegendTooltip
                        label="데드 크로스"
                        description="MACD Line이 Signal Line을 위에서 아래로 돌파하면 하락 추세 전환 신호입니다. 매도 타이밍으로 볼 수 있습니다."
                      >
                        🔵 데드 크로스
                      </LegendTooltip>
                      <LegendTooltip
                        label="중립"
                        description="특별한 크로스오버 신호가 없는 상태입니다. 추세 방향을 확인하세요."
                      >
                        ⚪ 중립
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 스토캐스틱 */}
          {marketData.stochastic && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                  📈 스토캐스틱
                  <IndicatorInfoButton indicatorKey="stochastic" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-gray-600">%K</span>
                    <span className={`text-sm sm:text-base font-bold ${
                      marketData.stochastic.k >= 80 ? "text-red-600" : marketData.stochastic.k <= 20 ? "text-blue-600" : "text-gray-700"
                    }`}>
                      {marketData.stochastic.k.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-gray-600">%D</span>
                    <span className="text-sm sm:text-base font-medium text-gray-700">
                      {marketData.stochastic.d.toFixed(1)}
                    </span>
                  </div>
                  <div className={`text-sm sm:text-base font-bold mt-3 pt-2 border-t border-gray-200 ${
                    marketData.stochastic.signal === "buy"
                      ? "text-red-600"
                      : marketData.stochastic.signal === "sell"
                      ? "text-blue-600"
                      : marketData.stochastic.zone === "overbought"
                      ? "text-red-600"
                      : marketData.stochastic.zone === "oversold"
                      ? "text-green-600"
                      : "text-gray-600"
                  }`}>
                    {marketData.stochastic.signal === "buy"
                      ? "🔴 매수 신호 (%K↑%D 돌파)"
                      : marketData.stochastic.signal === "sell"
                      ? "🔵 매도 신호 (%K↓%D 돌파)"
                      : marketData.stochastic.zone === "overbought"
                      ? "🔴 과매수 구간 (≥80)"
                      : marketData.stochastic.zone === "oversold"
                      ? "🟢 과매도 구간 (≤20)"
                      : "⚪ 중립 구간"}
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-2">지표 해석</div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <span className="font-medium text-gray-600">
                        구간 범례:
                      </span>
                      <LegendTooltip
                        label="과매수 (≥80)"
                        description="주가가 최근 범위의 상단에 위치합니다. 하락 반전 가능성이 있어 매도 타이밍을 고려해볼 수 있습니다."
                      >
                        🔴 과매수 (≥80)
                      </LegendTooltip>
                      <LegendTooltip
                        label="중립 (20-80)"
                        description="주가가 최근 범위의 중간에 위치합니다. 특별한 과매수/과매도 신호가 없는 상태입니다."
                      >
                        ⚪ 중립 (20-80)
                      </LegendTooltip>
                      <LegendTooltip
                        label="과매도 (≤20)"
                        description="주가가 최근 범위의 하단에 위치합니다. 상승 반전 가능성이 있어 매수 타이밍을 고려해볼 수 있습니다."
                      >
                        🟢 과매도 (≤20)
                      </LegendTooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 거래량 */}
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-1">
                거래량
                <IndicatorInfoButton indicatorKey="volume" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                {marketData.volume.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 차트 섹션 */}
        {chartData && chartData.length > 0 && (
          <div className="space-y-4 sm:space-y-6 mb-4 sm:mb-6">
            {/* 주가 차트 (이동평균선) */}
            {marketData.movingAverages && (
              <Card>
                <CardHeader>
                  <CardTitle>주가 차트 (이동평균선)</CardTitle>
                  <CardDescription>
                    {currentResult.name || currentResult.symbol}의 주가 추이 및
                    5일/20일/60일 이동평균선
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PriceChart
                    data={chartData}
                    symbol={currentResult.symbol}
                    showMovingAverages={true}
                    showBollingerBands={false}
                  />
                </CardContent>
              </Card>
            )}

            {/* 주가 차트 (볼린저 밴드) */}
            {marketData.bollingerBands && (
              <Card>
                <CardHeader>
                  <CardTitle>주가 차트 (볼린저 밴드)</CardTitle>
                  <CardDescription>
                    {currentResult.name || currentResult.symbol}의 주가 추이 및
                    볼린저 밴드 (상단/중심/하단선)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PriceChart
                    data={chartData}
                    symbol={currentResult.symbol}
                    showMovingAverages={false}
                    showBollingerBands={true}
                  />
                </CardContent>
              </Card>
            )}

            {/* 이동평균선과 볼린저밴드 모두 없는 경우 기본 주가 차트 */}
            {!marketData.movingAverages && !marketData.bollingerBands && (
              <Card>
                <CardHeader>
                  <CardTitle>주가 차트</CardTitle>
                  <CardDescription>
                    {currentResult.name || currentResult.symbol}의 주가 추이
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PriceChart
                    data={chartData}
                    symbol={currentResult.symbol}
                    showMovingAverages={false}
                    showBollingerBands={false}
                  />
                </CardContent>
              </Card>
            )}

            {/* 거래량 차트 */}
            <Card>
              <CardHeader>
                <CardTitle>거래량 차트</CardTitle>
                <CardDescription>일일 거래량 및 평균 거래량</CardDescription>
              </CardHeader>
              <CardContent>
                <VolumeChart
                  data={chartData}
                  averageVolume={marketData.volumeIndicators?.averageVolume}
                  supplyDemand={marketData.supplyDemand}
                />
              </CardContent>
            </Card>

            {/* RSI 차트 */}
            {marketData.rsi !== undefined && (
              <Card>
                <CardHeader>
                  <CardTitle>RSI (상대강도지수)</CardTitle>
                  <CardDescription>과매수/과매도 구간 분석</CardDescription>
                </CardHeader>
                <CardContent>
                  <RSIChart data={chartData} currentRSI={marketData.rsi} />
                </CardContent>
              </Card>
            )}

            {/* MACD 차트 */}
            {marketData.macd && (
              <Card>
                <CardHeader>
                  <CardTitle>MACD (이동평균수렴확산)</CardTitle>
                  <CardDescription>추세 전환 및 매매 시점 분석 (12-26-9 기준)</CardDescription>
                </CardHeader>
                <CardContent>
                  <MACDChart data={chartData} />
                </CardContent>
              </Card>
            )}

            {/* Stochastic 차트 */}
            {marketData.stochastic && (
              <Card>
                <CardHeader>
                  <CardTitle>스토캐스틱 (Stochastic)</CardTitle>
                  <CardDescription>모멘텀 및 과매수/과매도 분석 (%K 14일, %D 3일)</CardDescription>
                </CardHeader>
                <CardContent>
                  <StochasticChart data={chartData} />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* AI 리포트 섹션 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>AI 분석 리포트</CardTitle>
            <CardDescription>
              {currentResult.name || currentResult.symbol} 종목 분석
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => (
                    <h2 className="text-xl font-bold mt-6 mb-3 text-gray-900">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-800">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="mb-3 text-gray-700 leading-relaxed">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-6 mb-3 space-y-1 text-gray-700">
                      {children}
                    </ul>
                  ),
                  li: ({ children }) => (
                    <li className="text-gray-700">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-900">
                      {children}
                    </strong>
                  ),
                }}
              >
                {currentResult.name
                  ? aiReport.replace(
                      new RegExp(currentResult.symbol, "g"),
                      currentResult.name
                    )
                  : aiReport}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>

        {/* 뉴스 섹션 */}
        {marketData.news && marketData.news.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                최근 뉴스
                <span className="text-xs font-normal text-gray-500">(클릭하면 해당 뉴스로 이동)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {marketData.news.map((item, index) => (
                  <a
                    key={index}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors line-clamp-2">
                          {item.title}
                        </div>
                        {item.date && (
                          <div className="text-xs text-gray-500 mt-1.5">
                            {new Date(item.date).toLocaleDateString("ko-KR")}
                          </div>
                        )}
                      </div>
                      {/* 외부 링크 아이콘 */}
                      <div className="flex-shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors">
                        <svg
                          className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
