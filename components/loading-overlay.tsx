'use client';

import { useEffect, useState, useRef } from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
  stocks?: string[];
}

interface StepTiming {
  step: number;
  duration: number;
  weight: number;
}

export function LoadingOverlay({ isLoading, stocks = [] }: LoadingOverlayProps) {
  const [loadingStep, setLoadingStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const stepStartTimeRef = useRef<number | null>(null);

  const loadingSteps = [
    { text: '데이터 수집 중...', weight: 0.25 }, // 25%
    { text: '기술적 지표 계산 중...', weight: 0.30 }, // 30%
    { text: 'AI 분석 중...', weight: 0.35 }, // 35%
    { text: '리포트 생성 중...', weight: 0.10 }, // 10%
  ];

  // 로컬 스토리지에서 이전 분석의 실제 소요 시간 가져오기
  const getHistoricalTimings = (): { dataCollection: number; indicatorCalculation: number; aiAnalysis: number; reportGeneration: number; total: number } | null => {
    if (typeof window === 'undefined') return null;
    
    try {
      const timingKey = `analysisTiming_${stocks.length}`;
      const stored = localStorage.getItem(timingKey);
      if (!stored) return null;
      
      const timing = JSON.parse(stored);
      // 종목 수가 일치하는 경우에만 사용
      if (timing && timing.stockCount === stocks.length) {
        return {
          dataCollection: timing.dataCollection || 0,
          indicatorCalculation: timing.indicatorCalculation || 0,
          aiAnalysis: timing.aiAnalysis || 0,
          reportGeneration: timing.reportGeneration || 0,
          total: timing.total || 0,
        };
      }
    } catch (error) {
      console.warn('Failed to load historical timings:', error);
    }
    
    return null;
  };

  // 기본 예상 시간 (밀리초)
  const getDefaultTimings = () => {
    const baseTime = 15000; // 기본 15초
    const timePerStock = 5000; // 종목당 추가 5초
    const totalTime = baseTime + (stocks.length * timePerStock);
    
    return {
      dataCollection: totalTime * loadingSteps[0].weight,
      indicatorCalculation: totalTime * loadingSteps[1].weight,
      aiAnalysis: totalTime * loadingSteps[2].weight,
      reportGeneration: totalTime * loadingSteps[3].weight,
      total: totalTime,
    };
  };

  useEffect(() => {
    if (!isLoading) {
      // 분석 완료 시 실제 소요 시간은 API 응답에서 받아서 저장하므로 여기서는 저장하지 않음
      
      setLoadingStep(0);
      setProgress(0);
      startTimeRef.current = null;
      stepStartTimeRef.current = null;
      return;
    }

    // 분석 시작
    startTimeRef.current = Date.now();
    stepStartTimeRef.current = Date.now();
    
    // 이전 분석의 실제 소요 시간 또는 기본 예상 시간 사용
    const historicalTimings = getHistoricalTimings();
    const stepTimings = historicalTimings || getDefaultTimings();
    
    // 각 단계별 예상 소요 시간 계산 (실제 측정된 시간 사용)
    const stepDurations = [
      stepTimings.dataCollection,
      stepTimings.indicatorCalculation,
      stepTimings.aiAnalysis,
      stepTimings.reportGeneration,
    ];
    
    // 총 예상 시간 (모든 종목을 종합한 전체 시간)
    const estimatedTotalTime = stepTimings.total;
    
    let currentStep = 0;

    const interval = setInterval(() => {
      if (!startTimeRef.current) return;
      
      const elapsed = Date.now() - startTimeRef.current;
      
      // 전체 진행률 계산: 경과 시간을 총 예상 시간으로 나눔
      const progressPercent = Math.min(
        (elapsed / estimatedTotalTime) * 100,
        99 // 99%까지만 진행 (완료는 API 응답 시)
      );
      setProgress(progressPercent);

      // 단계별 진행 확인 (누적 시간 기준)
      let accumulated = 0;
      for (let i = 0; i < loadingSteps.length; i++) {
        accumulated += stepDurations[i];
        if (elapsed < accumulated) {
          if (currentStep !== i) {
            currentStep = i;
            setLoadingStep(i);
            stepStartTimeRef.current = Date.now();
          }
          break;
        } else if (i === loadingSteps.length - 1) {
          // 마지막 단계까지 완료
          if (currentStep !== i) {
            currentStep = i;
            setLoadingStep(i);
          }
        }
      }
    }, 100); // 100ms마다 업데이트

    return () => clearInterval(interval);
  }, [isLoading, stocks.length]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="relative w-full max-w-sm sm:max-w-md">
        {/* 메인 로딩 카드 - 모바일 최적화 */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-5 sm:p-8 space-y-4 sm:space-y-6 animate-scale-in">
          {/* 애니메이션 스피너 - 모바일에서 작게 */}
          <div className="flex justify-center">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20">
              {/* 외부 회전 링 */}
              <div className="absolute inset-0 border-[3px] sm:border-4 border-blue-200 rounded-full"></div>
              <div className="absolute inset-0 border-[3px] sm:border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>

              {/* 내부 펄스 원 */}
              <div className="absolute inset-3 sm:inset-4 bg-blue-600 rounded-full animate-pulse"></div>

              {/* 중앙 아이콘 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* 로딩 텍스트 - 모바일 폰트 크기 조정 */}
          <div className="text-center space-y-1.5 sm:space-y-2">
            <h3 className="text-lg sm:text-2xl font-bold text-gray-900 animate-pulse">
              {loadingSteps[loadingStep]?.text || '분석 중...'}
            </h3>
            {stocks.length > 0 && (
              <p className="text-xs sm:text-sm text-gray-600">
                {stocks.length}개 종목 분석 중
              </p>
            )}
          </div>

          {/* 진행 바 - 모바일에서 더 두껍게 */}
          <div className="space-y-1.5 sm:space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-2.5 sm:h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 rounded-full transition-all duration-300 ease-out relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-white/30 animate-shimmer"></div>
              </div>
            </div>
            <div className="flex justify-between text-[10px] sm:text-xs text-gray-500">
              <span>진행 중...</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>

          {/* 단계 인디케이터 */}
          <div className="flex justify-center gap-1.5 sm:gap-2">
            {loadingSteps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                  index <= loadingStep
                    ? 'bg-blue-600 w-6 sm:w-8'
                    : 'bg-gray-300 w-1.5 sm:w-2'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 배경 파티클 효과 */}
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-blue-400 rounded-full opacity-30 animate-float"
              style={{
                left: `${20 + i * 15}%`,
                top: `${30 + (i % 3) * 20}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: `${3 + (i % 2)}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
