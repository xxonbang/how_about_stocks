"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingOverlay } from "@/components/loading-overlay";
import { IndicatorInfoButton } from "@/components/indicator-info-button";
import { StockAutocomplete } from "@/components/stock-autocomplete";
import { useAuth } from "@/lib/auth-context";
import type { AnalyzeRequest } from "@/lib/types";
import type { StockSuggestion } from "@/lib/stock-search";

import type { AnalysisPeriod } from "@/lib/types";

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [stocks, setStocks] = useState<string[]>([""]);

  // 리포트 페이지를 미리 프리페치하여 전환 속도 개선
  useEffect(() => {
    router.prefetch("/report");
  }, [router]);

  // 종목명 -> 심볼 매핑 (분석 시 심볼로 변환하기 위해 사용)
  const [stockSymbolMap, setStockSymbolMap] = useState<Map<string, string>>(
    new Map()
  );
  
  // URL 쿼리 파라미터에서 종목명 읽기 (오류 페이지에서 전달된 경우)
  useEffect(() => {
    const stocksParam = searchParams.get('stocks');
    if (stocksParam) {
      try {
        const stockNames = stocksParam.split(',').map(s => decodeURIComponent(s)).filter(s => s.trim() !== '');
        if (stockNames.length > 0) {
          // 종목명을 입력 필드에 설정
          setStocks(stockNames.length <= 5 ? stockNames : stockNames.slice(0, 5));
          
          // URL에서 쿼리 파라미터 제거 (깔끔하게)
          router.replace('/', { scroll: false });
        }
      } catch (error) {
        console.warn('Failed to parse stocks parameter:', error);
      }
    }
  }, [searchParams, router]);
  const [period, setPeriod] = useState<AnalysisPeriod>("1m"); // 향후 전망 분석 기간
  const [historicalPeriod, setHistoricalPeriod] =
    useState<AnalysisPeriod>("3m"); // 과거 이력 분석 기간
  // 분석 기준일: 오늘 날짜 KST 기준 (YYYY-MM-DD 형식)
  const [analysisDate] = useState<string>(() => {
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().split("T")[0];
  });
  const [indicators, setIndicators] = useState({
    rsi: true,
    movingAverages: true,
    disparity: true,
    supplyDemand: true,
    fearGreed: true,
    exchangeRate: true,
    // Phase 1 지표
    etfPremium: true,
    bollingerBands: true,
    volatility: true,
    volumeIndicators: true,
    // Phase 2 지표
    supportLevel: true,
    supportResistance: true,
    // Phase 3 지표
    macd: true,
    stochastic: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showLoginAlert, setShowLoginAlert] = useState(false);
  const [showRateLimitAlert, setShowRateLimitAlert] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remaining: number; limit: number } | null>(null);

  const addStockInput = () => {
    if (stocks.length < 2) {
      setStocks([...stocks, ""]);
    }
  };

  const removeStockInput = (index: number) => {
    if (stocks.length > 1) {
      const removedStock = stocks[index];
      const newStocks = stocks.filter((_, i) => i !== index);
      setStocks(newStocks);

      // 삭제된 종목의 심볼 매핑도 제거
      if (removedStock && stockSymbolMap.has(removedStock)) {
        const newMap = new Map(stockSymbolMap);
        newMap.delete(removedStock);
        setStockSymbolMap(newMap);
      }
    }
  };

  const updateStock = (index: number, value: string) => {
    const newStocks = [...stocks];
    const oldValue = newStocks[index];
    newStocks[index] = value;
    setStocks(newStocks);

    // 사용자가 직접 입력한 경우 심볼 매핑 제거 (자동완성 선택이 아닌 경우)
    if (oldValue && stockSymbolMap.has(oldValue)) {
      const newMap = new Map(stockSymbolMap);
      newMap.delete(oldValue);
      setStockSymbolMap(newMap);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 로그인 체크
    if (!isAuthenticated) {
      setShowLoginAlert(true);
      return;
    }

    const validStocks = stocks.filter((s) => s.trim() !== "");
    if (validStocks.length === 0) {
      toast.warning("최소 1개 이상의 종목을 입력해주세요.");
      return;
    }

    if (validStocks.length > 5) {
      toast.warning("최대 5개 종목까지 분석 가능합니다.");
      return;
    }

    setIsLoading(true);

    try {
      // 검색 결과가 사용자 입력과 유사한지 검증하는 함수
      const isNameSimilar = (userInput: string, resultName: string): boolean => {
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[주식회사㈜(주)]/g, '');
        const normalizedInput = normalize(userInput);
        const normalizedResult = normalize(resultName);

        // 정확히 일치하거나 포함 관계
        if (normalizedResult === normalizedInput) return true;
        if (normalizedResult.includes(normalizedInput)) return true;
        if (normalizedInput.includes(normalizedResult)) return true;

        // 시작 부분이 일치 (예: "삼성" -> "삼성전자")
        if (normalizedResult.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedResult)) return true;

        // 공통 문자 비율 계산 (Jaccard-like)
        const inputChars = new Set(normalizedInput);
        const resultChars = new Set(normalizedResult);
        const intersection = [...inputChars].filter(c => resultChars.has(c)).length;
        const union = new Set([...inputChars, ...resultChars]).size;
        const similarity = intersection / union;

        // 60% 이상 유사하면 허용 (더 엄격하게 조정)
        return similarity >= 0.6;
      };

      // 종목명을 심볼로 변환
      const convertToSymbols = async (
        stockNames: string[]
      ): Promise<{
        symbols: string[];
        nameMap: Map<string, string>;
        foundMap: Map<string, boolean>; // 원본 이름 -> 검색 성공 여부
      }> => {
        const symbols: string[] = [];
        const nameMap = new Map<string, string>(); // 심볼 -> 종목명 매핑 (API 응답에 종목명 추가용)
        const foundMap = new Map<string, boolean>(); // 원본 이름 -> 검색 성공 여부

        for (const name of stockNames) {
          // 이미 매핑된 심볼이 있으면 사용
          if (stockSymbolMap.has(name)) {
            const symbol = stockSymbolMap.get(name)!;
            symbols.push(symbol);
            nameMap.set(symbol, name);
            foundMap.set(name, true); // 기존 매핑이 있으면 검색 성공으로 간주
            continue;
          }

          // 매핑이 없으면 종목명을 티커 코드로 변환 (필수)
          try {
            // 1. 티커 코드인지 확인 (6자리 숫자)
            if (/^\d{6}$/.test(name)) {
              // 이미 티커 코드인 경우
              const symbol = `${name}.KS`;
              symbols.push(symbol);
              nameMap.set(symbol, name);
              foundMap.set(name, true);
              continue;
            }

            // 2. 종목명으로 검색하여 티커 코드 찾기
            const { searchStocks } = await import("@/lib/stock-search");
            const results = await searchStocks(name);

            if (results.length > 0) {
              // 검색 결과 검증: 사용자 입력과 유사한 결과만 사용
              // 첫 번째 결과가 유사하지 않으면 다른 결과에서 찾기
              let bestMatch = results.find(r => isNameSimilar(name, r.name));

              if (!bestMatch) {
                // 유사한 결과가 없으면 첫 번째 결과 사용 전 경고
                console.warn(`[Search Validation] No similar match found for "${name}". Top result: "${results[0].name}" (${results[0].symbol})`);
                // 유사도가 너무 낮으면 검색 실패로 처리
                throw new Error(`"${name}"에 대한 정확한 검색 결과를 찾을 수 없습니다. 첫 번째 검색 결과 "${results[0].name}"이(가) 입력과 다릅니다. 정확한 종목명을 입력해주세요.`);
              }

              const symbol = bestMatch.symbol;
              const matchedName = bestMatch.name;
              symbols.push(symbol);
              nameMap.set(symbol, matchedName);
              foundMap.set(name, true); // 검색 성공

              // 매핑 저장
              const newMap = new Map(stockSymbolMap);
              newMap.set(name, symbol);
              setStockSymbolMap(newMap);
            } else {
              // 검색 결과가 없으면 추가 변환 시도
              try {
                // normalizeStockSymbolHybrid를 직접 사용하여 티커 코드로 변환 시도
                const { normalizeStockSymbolHybrid } = await import("@/lib/korea-stock-mapper");
                const normalized = await normalizeStockSymbolHybrid(name, true);
                
                // 티커 코드로 변환되었는지 확인
                if (normalized !== name && (normalized.includes('.KS') || normalized.includes('.KQ') || /^\d{6}$/.test(normalized.replace(/\.(KS|KQ)$/, '')))) {
                  symbols.push(normalized);
                  nameMap.set(normalized, name);
                  foundMap.set(name, true);
                  
                  // 매핑 저장
                  const newMap = new Map(stockSymbolMap);
                  newMap.set(name, normalized);
                  setStockSymbolMap(newMap);
                } else {
                  // 변환 실패 - 에러 발생
                  throw new Error(`종목 "${name}"을(를) 찾을 수 없습니다.`);
                }
              } catch (normalizeError) {
                // 모든 변환 시도 실패
                throw new Error(`종목 "${name}"을(를) 찾을 수 없습니다. 정확한 종목명 또는 종목코드(6자리 숫자)를 입력해주세요.`);
              }
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to convert "${name}" to symbol:`, errorMessage);
            // 변환 실패 시 에러를 전파하여 사용자에게 명확한 메시지 제공
            throw new Error(errorMessage);
          }
        }

        return { symbols, nameMap, foundMap };
      };

      const { symbols: stockSymbols, nameMap: symbolToNameMap, foundMap } =
        await convertToSymbols(validStocks);

      // 검색 결과가 없는 종목이 있는지 확인
      // 검색에 실패했고, 원본 입력값과 심볼이 동일한 경우만 오류로 처리
      const hasInvalidStocks = stockSymbols.some((symbol, index) => {
        const originalName = validStocks[index];
        const wasFound = foundMap.get(originalName) === true;
        // 검색 실패 && 원본과 심볼이 동일 && 빈 문자열이 아닌 경우
        return (
          !wasFound &&
          symbol === originalName &&
          originalName.trim().length > 0
        );
      });

      if (hasInvalidStocks) {
        const invalidNames = validStocks.filter((name, index) => {
          const symbol = stockSymbols[index];
          const wasFound = foundMap.get(name) === true;
          return (
            !wasFound &&
            symbol === name &&
            name.trim().length > 0
          );
        });
        
        // 종목명을 강조하여 표시
        const stockNamesList = invalidNames.map(name => `"${name}"`).join(", ");
        const errorMessage = invalidNames.length === 1
          ? `다음 종목을 찾을 수 없습니다:\n\n**${invalidNames[0]}**\n\n정확한 종목명 또는 종목코드(6자리 숫자)를 입력해주세요.\n예: "삼성전자" 또는 "005930"`
          : `다음 종목들을 찾을 수 없습니다:\n\n${invalidNames.map(name => `• **${name}**`).join("\n")}\n\n정확한 종목명 또는 종목코드(6자리 숫자)를 입력해주세요.`;
        
        sessionStorage.setItem(
          "analysisResults",
          JSON.stringify({
            error: errorMessage,
            invalidStocks: invalidNames, // 종목명 배열도 별도로 저장
            results: [],
          })
        );
        router.push("/report");
        return;
      }

      const request: AnalyzeRequest = {
        stocks: stockSymbols,
        period,
        historicalPeriod,
        analysisDate,
        indicators,
      };

      // 지표 선택 상태 로깅 (디버깅용)
      console.log("[Frontend] Sending request with indicators:", indicators);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        let errorMessage = "분석 요청에 실패했습니다.";
        try {
          const errorData = await response.json();
          // Rate Limit 초과 (429)
          if (response.status === 429 && errorData.rateLimited) {
            setRateLimitInfo({ remaining: errorData.remaining, limit: errorData.limit });
            setShowRateLimitAlert(true);
            setIsLoading(false);
            return;
          }
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          // JSON 파싱 실패 시 기본 메시지 사용
          errorMessage = `서버 오류 (${response.status}): ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // 응답 데이터 검증
      if (data.error) {
        // 오류가 있으면 sessionStorage에 저장하고 리포트 페이지로 이동 (오류 표시용)
        sessionStorage.setItem(
          "analysisResults",
          JSON.stringify({ error: data.error, results: [] })
        );
        router.push("/report");
        return;
      }

      if (!data || !data.results || data.results.length === 0) {
        // 결과가 없으면 오류로 처리
        sessionStorage.setItem(
          "analysisResults",
          JSON.stringify({
            error: "분석 결과가 없습니다. 입력하신 종목을 확인해주세요.",
            results: [],
          })
        );
        router.push("/report");
        return;
      }

      // 실제 소요 시간 메타데이터를 로컬 스토리지에 저장 (다음 분석 시 진행률 계산에 활용)
      if (data._metadata) {
        try {
          const timingKey = `analysisTiming_${validStocks.length}`;
          localStorage.setItem(timingKey, JSON.stringify(data._metadata));
          console.log("[Frontend] Saved analysis timing:", data._metadata);
        } catch (error) {
          console.warn("Failed to save analysis timing:", error);
        }
      }

      // 종목명 매핑을 결과에 추가 (symbolToNameMap 사용)
      const resultsWithNames = data.results.map((result: any) => {
        // symbolToNameMap에서 종목명 찾기 (가장 정확)
        if (symbolToNameMap.has(result.symbol)) {
          return { ...result, name: symbolToNameMap.get(result.symbol) };
        }
        // 없으면 stockSymbolMap에서 찾기
        for (const [name, symbol] of stockSymbolMap.entries()) {
          if (symbol === result.symbol) {
            return { ...result, name };
          }
        }
        return result;
      });

      const dataWithNames = { ...data, results: resultsWithNames };

      // 결과를 sessionStorage에 저장하고 리포트 페이지로 이동
      sessionStorage.setItem("analysisResults", JSON.stringify(dataWithNames));
      router.push("/report");
      // 주의: 성공 시 setIsLoading(false)를 호출하지 않음
      // 로딩 오버레이가 페이지 전환 완료(컴포넌트 언마운트)까지 유지되어 매끄러운 전환 제공
    } catch (error) {
      console.error("Analysis error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  const validStocks = stocks.filter((s) => s.trim() !== "");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <LoadingOverlay isLoading={isLoading} stocks={validStocks} />

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-12 max-w-4xl">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
            <Image src="/logo.svg" alt="" width={40} height={40} className="rounded-xl" />
            종목어때.ai
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            AI 기반 실시간 주식 분석 리포트
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3">
          {/* 종목 입력 섹션 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl sm:text-2xl">종목 입력</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                분석할 종목을 입력하세요 (최대 2개)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs sm:text-sm font-medium text-gray-700 flex-1">
                  종목명, 종목코드, 티커 등 (예: 삼성전자, AAPL, TSLA,
                  005930.KS)
                </label>
                {stocks.length < 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addStockInput}
                    disabled={isLoading}
                    size="sm"
                    className="text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8 flex-shrink-0"
                  >
                    ➕ 추가
                  </Button>
                )}
              </div>
              {stocks.map((stock, index) => (
                <div key={index} className="flex gap-2">
                  <StockAutocomplete
                    value={stock}
                    onChange={(value) => updateStock(index, value)}
                    onSelect={(suggestion) => {
                      // 종목명으로 저장하고, 심볼 매핑도 함께 저장
                      updateStock(index, suggestion.name);
                      const newMap = new Map(stockSymbolMap);
                      newMap.set(suggestion.name, suggestion.symbol);
                      setStockSymbolMap(newMap);
                    }}
                    disabled={isLoading}
                    placeholder="종목 입력"
                    className="flex-1"
                  />
                  {stocks.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeStockInput(index)}
                      disabled={isLoading}
                    >
                      ➖
                    </Button>
                  )}
                </div>
              ))}
              {/* 안내 문구 */}
              <div className="mt-0 px-0.5 py-0 bg-gray-50/50 rounded-md space-y-0.5">
                <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed">
                  1회 분석 시 최대 2개 종목까지 입력 가능합니다.
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed">
                  검색이 끝나지 않았더라도 종목명, 종목코드, 티커 등을 정확히 입력한 상태라면 바로 분석 가능합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 분석 기준일 섹션 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl sm:text-2xl">분석 기준일</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                분석을 수행하는 기준 날짜입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="px-3 py-2.5 sm:py-2 bg-gray-50 border border-gray-200 rounded-md text-base sm:text-sm text-gray-700 min-h-[44px] sm:min-h-0 flex items-center">
                  {(() => {
                    const [y, m, d] = analysisDate.split("-");
                    return `${y}년 ${Number(m)}월 ${Number(d)}일 (오늘)`;
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 종목별 과거 이력 분석 기간 선택 섹션 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl sm:text-2xl">
                종목별 과거 이력 분석 기간
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                분석할 과거 데이터 기간을 선택하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {(["1d", "1w", "1m", "3m", "6m", "1y"] as AnalysisPeriod[]).map(
                  (p) => {
                    const labels: Record<AnalysisPeriod, string> = {
                      "1d": "1일",
                      "1w": "1주일",
                      "1m": "1달",
                      "3m": "3개월",
                      "6m": "6개월",
                      "1y": "1년",
                    };
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setHistoricalPeriod(p)}
                        disabled={isLoading}
                        aria-pressed={historicalPeriod === p}
                        aria-label={`과거 데이터 기간 ${labels[p]}`}
                        className={`min-h-[44px] sm:min-h-0 px-3 sm:px-3 py-2.5 sm:py-2 text-sm rounded-md font-medium transition-colors touch-manipulation ${
                          historicalPeriod === p
                            ? "bg-primary text-primary-foreground active:bg-primary/80"
                            : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100"
                        }`}
                      >
                        {labels[p]}
                      </button>
                    );
                  }
                )}
              </div>
            </CardContent>
          </Card>

          {/* 종목별 향후 전망 분석 기간 선택 섹션 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl sm:text-2xl">
                종목별 향후 전망 분석 기간
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                향후 전망할 기간을 선택하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {(["1d", "1w", "1m", "3m", "6m", "1y"] as AnalysisPeriod[]).map(
                  (p) => {
                    const labels: Record<AnalysisPeriod, string> = {
                      "1d": "1일",
                      "1w": "1주일",
                      "1m": "1달",
                      "3m": "3개월",
                      "6m": "6개월",
                      "1y": "1년",
                    };
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        disabled={isLoading}
                        aria-pressed={period === p}
                        aria-label={`전망 기간 ${labels[p]}`}
                        className={`min-h-[44px] sm:min-h-0 px-3 sm:px-3 py-2.5 sm:py-2 text-sm rounded-md font-medium transition-colors touch-manipulation ${
                          period === p
                            ? "bg-primary text-primary-foreground active:bg-primary/80"
                            : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100"
                        }`}
                      >
                        {labels[p]}
                      </button>
                    );
                  }
                )}
              </div>
            </CardContent>
          </Card>

          {/* 지표 선택 섹션 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl sm:text-2xl">
                분석 지표 선택
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                분석에 사용할 지표를 선택하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 지표 그리드 - 모바일 터치 최적화 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2">
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.rsi}
                    onChange={(e) =>
                      setIndicators({ ...indicators, rsi: e.target.checked })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">RSI</span>
                  <IndicatorInfoButton indicatorKey="rsi" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.movingAverages}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        movingAverages: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">이동평균선</span>
                  <IndicatorInfoButton indicatorKey="movingAverages" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.disparity}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        disparity: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">이격도</span>
                  <IndicatorInfoButton indicatorKey="disparity" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.supplyDemand}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        supplyDemand: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">수급 (기관/외인)</span>
                  <IndicatorInfoButton indicatorKey="supplyDemand" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.fearGreed}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        fearGreed: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">공포/탐욕 지수</span>
                  <IndicatorInfoButton indicatorKey="fearGreed" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.exchangeRate}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        exchangeRate: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">환율</span>
                  <IndicatorInfoButton indicatorKey="exchangeRate" />
                </label>
                {/* Phase 1 지표 */}
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.etfPremium || false}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        etfPremium: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">ETF 괴리율</span>
                  <IndicatorInfoButton indicatorKey="etfPremium" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.bollingerBands || false}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        bollingerBands: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">볼린저 밴드</span>
                  <IndicatorInfoButton indicatorKey="bollingerBands" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.volatility || false}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        volatility: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">변동성 지표</span>
                  <IndicatorInfoButton indicatorKey="volatility" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.volumeIndicators || false}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        volumeIndicators: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">거래량 지표</span>
                  <IndicatorInfoButton indicatorKey="volumeIndicators" />
                </label>
                {/* Phase 2 지표 */}
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.supportLevel || false}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        supportLevel: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">눌림목 여부</span>
                  <IndicatorInfoButton indicatorKey="supportLevel" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.supportResistance || false}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        supportResistance: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">저항선/지지선</span>
                  <IndicatorInfoButton indicatorKey="supportResistance" />
                </label>
                {/* Phase 3 지표 */}
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.macd || false}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        macd: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">MACD</span>
                  <IndicatorInfoButton indicatorKey="macd" />
                </label>
                <label className="flex items-center space-x-2.5 py-2 sm:py-1.5 px-1 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0">
                  <Checkbox
                    checked={indicators.stochastic || false}
                    onChange={(e) =>
                      setIndicators({
                        ...indicators,
                        stochastic: e.target.checked,
                      })
                    }
                    disabled={isLoading}
                  />
                  <span className="text-sm sm:text-sm flex-1">스토캐스틱</span>
                  <IndicatorInfoButton indicatorKey="stochastic" />
                </label>
              </div>
            </CardContent>
          </Card>

          {/* 분석 시작 버튼 */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold relative overflow-hidden group transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
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
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>분석 중...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl">🔍</span>
                <span>분석 시작</span>
              </span>
            )}
            {!isLoading && (
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>
            )}
          </Button>
        </form>
      </div>

      {/* 로그인 안내 팝업 */}
      <Dialog open={showLoginAlert} onOpenChange={setShowLoginAlert}>
        <DialogContent className="w-[calc(100%-2rem)] sm:w-full sm:max-w-md mx-4 sm:mx-0">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <DialogTitle className="mb-0">로그인 필요</DialogTitle>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              분석 기능을 사용하려면 로그인이 필요합니다
            </p>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <svg
                className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-blue-800 font-medium flex-1 leading-relaxed">
                종목 분석 기능은 로그인 후 이용하실 수 있습니다.
                <br />
                로그인 버튼을 클릭하여 로그인해주세요.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowLoginAlert(false)}
                className="min-w-[80px] min-h-[44px] sm:min-h-0 touch-manipulation"
              >
                취소
              </Button>
              <Button
                onClick={() => {
                  setShowLoginAlert(false);
                  // 로그인 버튼으로 스크롤 및 하이라이트 효과
                  window.dispatchEvent(new Event("highlightLogin"));
                }}
                className="min-w-[100px] min-h-[44px] sm:min-h-0 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800 shadow-md touch-manipulation"
              >
                로그인하기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 일일 분석 횟수 초과 팝업 */}
      <Dialog open={showRateLimitAlert} onOpenChange={setShowRateLimitAlert}>
        <DialogContent className="w-[calc(100%-2rem)] sm:w-full sm:max-w-md mx-4 sm:mx-0">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-md">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <DialogTitle className="mb-0">일일 분석 횟수 초과</DialogTitle>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              오늘의 분석 횟수를 모두 사용했습니다
            </p>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <svg
                className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-orange-800 font-medium flex-1 leading-relaxed">
                하루 {rateLimitInfo?.limit ?? 2}회까지 분석이 가능합니다.
                <br />
                내일 다시 이용하실 수 있습니다.
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setShowRateLimitAlert(false)}
                className="min-w-[100px] min-h-[44px] sm:min-h-0 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:from-orange-700 active:to-orange-800 shadow-md touch-manipulation"
              >
                확인
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Suspense boundary로 감싸서 useSearchParams 지원
export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}
