'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, RefreshCw, Pause } from 'lucide-react';

interface DataSourceMetrics {
  source: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  warningCount: number;
  averageResponseTime: number;
  lastSuccessTime?: number;
  lastErrorTime?: number;
}

interface DataQualityMetric {
  timestamp: number;
  symbol: string;
  dataSource: string;
  metricType: 'success' | 'error' | 'warning' | 'validation_failure' | 'consistency_check';
  message: string;
  metadata?: Record<string, any>;
}

interface MetricsResponse {
  success: boolean;
  data: {
    dataSourceMetrics: DataSourceMetrics[];
    recentMetrics: DataQualityMetric[];
    summary: {
      totalMetrics: number;
      dataSourceCount: number;
    };
  };
}

export default function MetricsDashboard() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string>('all');

  const fetchMetrics = async () => {
    try {
      const url = selectedSource === 'all' 
        ? '/api/metrics?limit=100'
        : `/api/metrics?source=${encodeURIComponent(selectedSource)}&limit=100`;
      
      const response = await fetch(url);
      const data: MetricsResponse = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [selectedSource]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchMetrics();
    }, 5000); // 5초마다 자동 갱신

    return () => clearInterval(interval);
  }, [autoRefresh, selectedSource]);

  const getSuccessRate = (source: DataSourceMetrics): number => {
    if (source.totalRequests === 0) return 0;
    return Math.round((source.successCount / source.totalRequests) * 100);
  };

  const getErrorRate = (source: DataSourceMetrics): number => {
    if (source.totalRequests === 0) return 0;
    return Math.round((source.errorCount / source.totalRequests) * 100);
  };

  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('ko-KR');
  };

  const getMetricTypeColor = (type: string): string => {
    switch (type) {
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'validation_failure':
        return 'text-orange-600 bg-orange-50';
      case 'consistency_check':
        return 'text-blue-600 bg-blue-50';
      case 'success':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getMetricTypeLabel = (type: string): string => {
    switch (type) {
      case 'error':
        return '오류';
      case 'warning':
        return '경고';
      case 'validation_failure':
        return '검증 실패';
      case 'consistency_check':
        return '정합성 검사';
      case 'success':
        return '성공';
      default:
        return type;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8">
        <div className="container mx-auto max-w-7xl">
          <Skeleton className="h-8 sm:h-12 w-48 sm:w-64 mb-6 sm:mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8">
        <div className="container mx-auto max-w-7xl">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-sm sm:text-base text-gray-500">메트릭 데이터를 불러올 수 없습니다.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const dataSources = metrics.data.dataSourceMetrics;
  const recentMetrics = metrics.data.recentMetrics;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8">
      <div className="container mx-auto max-w-7xl">
        {/* 헤더 */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2"><BarChart3 className="w-7 h-7 inline-block mr-1.5" /> 데이터 품질 메트릭</h1>
            <p className="text-sm sm:text-base text-gray-600">실시간 데이터 수집 품질 모니터링</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="px-3 sm:px-4 py-2 text-sm sm:text-base border rounded-lg bg-white w-full sm:w-auto"
            >
              <option value="all">전체 소스</option>
              {dataSources.map((source) => (
                <option key={source.source} value={source.source}>
                  {source.source}
                </option>
              ))}
            </select>
            <Button
              onClick={() => setAutoRefresh(!autoRefresh)}
              variant={autoRefresh ? 'default' : 'outline'}
              className="w-full sm:w-auto text-sm sm:text-base"
            >
              {autoRefresh ? <><RefreshCw className="w-4 h-4 inline-block mr-1" /> 자동 갱신 중</> : <><Pause className="w-4 h-4 inline-block mr-1" /> 일시정지</>}
            </Button>
            <Button 
              onClick={fetchMetrics}
              className="w-full sm:w-auto text-sm sm:text-base"
            >
              새로고침
            </Button>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs sm:text-sm">전체 메트릭</CardDescription>
              <CardTitle className="text-xl sm:text-2xl md:text-3xl">{metrics.data.summary.totalMetrics}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs sm:text-sm">데이터 소스</CardDescription>
              <CardTitle className="text-xl sm:text-2xl md:text-3xl">{metrics.data.summary.dataSourceCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs sm:text-sm">전체 요청</CardDescription>
              <CardTitle className="text-xl sm:text-2xl md:text-3xl">
                {dataSources.reduce((sum, s) => sum + s.totalRequests, 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs sm:text-sm">평균 성공률</CardDescription>
              <CardTitle className="text-xl sm:text-2xl md:text-3xl">
                {dataSources.length > 0
                  ? Math.round(
                      dataSources.reduce((sum, s) => sum + getSuccessRate(s), 0) /
                        dataSources.length
                    )
                  : 0}
                %
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 데이터 소스별 메트릭 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {dataSources.map((source) => {
            const successRate = getSuccessRate(source);
            const errorRate = getErrorRate(source);

            return (
              <Card key={source.source}>
                <CardHeader>
                  <CardTitle className="text-lg">{source.source}</CardTitle>
                  <CardDescription>데이터 소스별 통계</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">전체 요청</span>
                    <span className="font-semibold">{source.totalRequests}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">성공</span>
                    <span className="font-semibold text-green-600">
                      {source.successCount} ({successRate}%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">오류</span>
                    <span className="font-semibold text-red-600">
                      {source.errorCount} ({errorRate}%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">경고</span>
                    <span className="font-semibold text-yellow-600">{source.warningCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">평균 응답 시간</span>
                    <span className="font-semibold">{Math.round(source.averageResponseTime)}ms</span>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-xs text-gray-500">
                      <div>마지막 성공: {formatTime(source.lastSuccessTime)}</div>
                      {source.lastErrorTime && (
                        <div className="text-red-500">
                          마지막 오류: {formatTime(source.lastErrorTime)}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* 최근 메트릭 로그 */}
        <Card>
          <CardHeader>
            <CardTitle>최근 메트릭 로그</CardTitle>
            <CardDescription>실시간 데이터 수집 이벤트</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {recentMetrics.length === 0 ? (
                <p className="text-center text-gray-500 py-8">메트릭 데이터가 없습니다.</p>
              ) : (
                recentMetrics.map((metric, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${getMetricTypeColor(metric.metricType)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">
                            {getMetricTypeLabel(metric.metricType)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {metric.symbol} ({metric.dataSource})
                          </span>
                        </div>
                        <p className="text-sm">{metric.message}</p>
                        {metric.metadata && Object.keys(metric.metadata).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-500 cursor-pointer">
                              상세 정보
                            </summary>
                            <pre className="text-xs mt-1 p-2 bg-white/50 rounded">
                              {JSON.stringify(metric.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 ml-4">
                        {formatTime(metric.timestamp)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
