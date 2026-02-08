'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalysisHistoryRow } from '@/lib/supabase/types';

interface HistoryListItem {
  id: string;
  requestId: string;
  stocks: string[];
  period: string;
  historicalPeriod: string;
  analysisDate: string;
  indicators: Record<string, boolean>;
  dataSource: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface HistoryResponse {
  success: boolean;
  data?: {
    history: HistoryListItem[];
    stockNames: Record<string, string>;
    total: number;
    hasMore: boolean;
  };
  error?: string;
}

interface HistoryDetailResponse {
  success: boolean;
  data?: AnalysisHistoryRow & { stockNames?: Record<string, string> };
  error?: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [stockNames, setStockNames] = useState<Record<string, string>>({});

  const LIMIT = 20;

  const fetchHistory = useCallback(async (reset = false) => {
    try {
      if (reset) {
        setIsLoading(true);
        setOffset(0);
      } else {
        setIsLoadingMore(true);
      }

      const currentOffset = reset ? 0 : offset;
      const url = new URL('/api/history', window.location.origin);
      url.searchParams.set('limit', LIMIT.toString());
      url.searchParams.set('offset', currentOffset.toString());

      if (searchQuery.trim()) {
        url.searchParams.set('stocks', searchQuery.trim());
      }

      const response = await fetch(url.toString());
      const data: HistoryResponse = await response.json();

      if (data.success && data.data) {
        if (reset) {
          setHistory(data.data.history);
          setStockNames(data.data.stockNames ?? {});
        } else {
          setHistory((prev) => [...prev, ...data.data!.history]);
          setStockNames((prev) => ({ ...prev, ...(data.data!.stockNames ?? {}) }));
        }
        setHasMore(data.data.hasMore);
        setTotal(data.data.total);
        setOffset(currentOffset + LIMIT);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [searchQuery, offset]);

  useEffect(() => {
    fetchHistory(true);
    // 검색어 변경 시 리셋
  }, [searchQuery]);

  const handleView = async (id: string) => {
    try {
      setViewingId(id);

      const response = await fetch(`/api/history/${id}`);
      const data: HistoryDetailResponse = await response.json();

      if (data.success && data.data) {
        // 종목명 매핑 적용 (API에서 stockNames 제공)
        const names: Record<string, string> = data.data.stockNames ?? {};
        const resultsArray = Array.isArray(data.data.results) ? data.data.results : [];
        const resultsWithNames = resultsArray.map((result: Record<string, unknown>) => {
          const symbol = result.symbol as string;
          if (symbol && names[symbol]) {
            return { ...result, name: names[symbol] };
          }
          return result;
        });

        // sessionStorage에 결과 저장 (report 페이지와 동일한 형식)
        const analysisResponse = {
          results: resultsWithNames,
          dataSource: data.data.data_source,
          _metadata: data.data.metadata,
        };
        sessionStorage.setItem('analysisResults', JSON.stringify(analysisResponse));
        router.push('/report');
      } else {
        alert('히스토리를 불러올 수 없습니다.');
      }
    } catch (error) {
      console.error('Failed to fetch history detail:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setViewingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 분석 기록을 삭제하시겠습니까?')) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch(`/api/history/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setHistory((prev) => prev.filter((h) => h.id !== id));
        setTotal((prev) => prev - 1);
      } else {
        alert('삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete history:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const periodToKorean = (period: string): string => {
    const periodMap: Record<string, string> = {
      '1d': '1일',
      '1w': '1주',
      '1m': '1개월',
      '3m': '3개월',
      '6m': '6개월',
      '1y': '1년',
    };
    return periodMap[period] || period;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8">
        <div className="container mx-auto max-w-5xl">
          <Skeleton className="h-8 sm:h-12 w-48 sm:w-64 mb-6 sm:mb-8" />
          <Skeleton className="h-10 w-full mb-6" />
          <div className="space-y-3 sm:space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8">
      <div className="container mx-auto max-w-5xl">
        {/* 헤더 */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            분석 히스토리
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            최근 30일간의 분석 결과를 조회할 수 있습니다 (총 {total}건)
          </p>
        </div>

        {/* 검색 필터 */}
        <Card className="mb-6">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="text"
                placeholder="종목명 또는 심볼 검색 (예: 삼성전자, AAPL)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => fetchHistory(true)}
                variant="outline"
                className="w-full sm:w-auto"
              >
                검색
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 히스토리 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">분석 기록</CardTitle>
            <CardDescription>
              클릭하여 분석 결과를 다시 확인할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">분석 기록이 없습니다</p>
                <p className="text-sm">
                  종목 분석을 실행하면 여기에 기록이 표시됩니다
                </p>
                <Button
                  onClick={() => router.push('/')}
                  className="mt-4"
                >
                  분석 시작하기
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* 종목 정보 */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {item.stocks.map((stock) => (
                            <span
                              key={stock}
                              className="px-2 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded"
                            >
                              {stockNames[stock]
                                ? `${stockNames[stock]} (${stock.replace(/\.(KS|KQ)$/, '')})`
                                : stock}
                            </span>
                          ))}
                        </div>

                        {/* 분석 정보 */}
                        <div className="text-sm text-gray-600 space-y-1">
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>
                              전망: <strong>{periodToKorean(item.period)}</strong>
                            </span>
                            <span>
                              분석일: <strong>{item.analysisDate}</strong>
                            </span>
                          </div>
                          <div className="text-xs text-gray-400">
                            생성: {formatDate(item.createdAt)}
                          </div>
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleView(item.id)}
                          variant="default"
                          size="sm"
                          disabled={viewingId === item.id}
                          className="min-w-[60px]"
                        >
                          {viewingId === item.id ? '로딩...' : '보기'}
                        </Button>
                        <Button
                          onClick={() => handleDelete(item.id)}
                          variant="outline"
                          size="sm"
                          disabled={deletingId === item.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {deletingId === item.id ? '삭제중...' : '삭제'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* 더 보기 버튼 */}
                {hasMore && (
                  <div className="pt-4 text-center">
                    <Button
                      onClick={() => fetchHistory(false)}
                      variant="outline"
                      disabled={isLoadingMore}
                      className="w-full sm:w-auto"
                    >
                      {isLoadingMore ? '로딩 중...' : '더 보기'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
