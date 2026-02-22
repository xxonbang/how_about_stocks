'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface APIStatus {
  name: string;
  configured: boolean;
  valid: boolean | null;
  message: string;
  note?: string;
  statusCode?: number;
  latency?: number;
}

interface APIStatusResponse {
  success: boolean;
  timestamp: number;
  apis: Record<string, APIStatus>;
}

// API 카테고리 정의
const API_CATEGORIES = {
  korean: {
    title: '한국 주식 데이터',
    description: '한국 시장 데이터 수집에 사용되는 API',
    apis: ['krx', 'kis', 'publicdata'],
  },
  us: {
    title: '미국 주식 데이터',
    description: '미국 시장 데이터 수집에 사용되는 API',
    apis: ['fmp', 'finnhub', 'twelvedata'],
  },
  ai: {
    title: 'AI 분석',
    description: 'AI 기반 주식 분석에 사용되는 서비스',
    apis: ['gemini'],
  },
};

// API별 추가 정보
const API_INFO: Record<string, { icon: string; docUrl: string; rateLimit?: string }> = {
  krx: {
    icon: '🏛️',
    docUrl: 'https://openapi.krx.co.kr/',
    rateLimit: '10,000회/일',
  },
  kis: {
    icon: '🏦',
    docUrl: 'https://apiportal.koreainvestment.com/',
    rateLimit: '20회/초',
  },
  publicdata: {
    icon: '📊',
    docUrl: 'https://www.data.go.kr/',
    rateLimit: '무제한 (권장)',
  },
  fmp: {
    icon: '💹',
    docUrl: 'https://financialmodelingprep.com/',
    rateLimit: '250회/일',
  },
  finnhub: {
    icon: '📈',
    docUrl: 'https://finnhub.io/',
    rateLimit: '60회/분',
  },
  twelvedata: {
    icon: '📉',
    docUrl: 'https://twelvedata.com/',
    rateLimit: '800회/일',
  },
  gemini: {
    icon: '🤖',
    docUrl: 'https://aistudio.google.com/app/apikey',
    rateLimit: '변동 (티어별)',
  },
};

function APIStatusCard({ apiKey, status }: { apiKey: string; status: APIStatus }) {
  const info = API_INFO[apiKey] || { icon: '🔗', docUrl: '#' };

  const getStatusColor = () => {
    if (!status.configured) return 'bg-gray-50 border-gray-300';
    if (status.valid === true) return 'bg-green-50 border-green-500';
    if (status.valid === false) return 'bg-red-50 border-red-500';
    return 'bg-yellow-50 border-yellow-500';
  };

  const getStatusIcon = () => {
    if (!status.configured) return '⚪';
    if (status.valid === true) return '✅';
    if (status.valid === false) return '❌';
    return '⚠️';
  };

  const getStatusText = () => {
    if (!status.configured) return '미설정';
    if (status.valid === true) return '정상';
    if (status.valid === false) return '오류';
    return '확인 필요';
  };

  return (
    <div className={`p-3 sm:p-4 rounded-lg border-2 ${getStatusColor()}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-lg sm:text-xl">{info.icon}</span>
            <h4 className="font-semibold text-sm sm:text-base">{status.name}</h4>
            <span
              className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                status.valid === true
                  ? 'bg-green-100 text-green-700'
                  : status.valid === false
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              {getStatusIcon()} {getStatusText()}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 mb-2">{status.message}</p>

          {status.note && (
            <p className="text-xs text-gray-500 mb-2">
              <strong>참고:</strong> {status.note}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {status.latency !== undefined && <span>응답시간: {status.latency}ms</span>}
            {info.rateLimit && <span>제한: {info.rateLimit}</span>}
            <a
              href={info.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              문서 보기 →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function APIStatusSkeleton() {
  return (
    <div className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export default function SettingsPage() {
  const [apiStatuses, setApiStatuses] = useState<Record<string, APIStatus> | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkAllAPIs = async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/api-status');
      const data: APIStatusResponse = await response.json();

      if (data.success) {
        setApiStatuses(data.apis);
        setLastChecked(new Date(data.timestamp));
      }
    } catch (error) {
      console.error('Failed to check API status:', error);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkAllAPIs();
  }, []);

  // 통계 계산
  const stats = apiStatuses
    ? {
        total: Object.keys(apiStatuses).length,
        configured: Object.values(apiStatuses).filter((s) => s.configured).length,
        valid: Object.values(apiStatuses).filter((s) => s.valid === true).length,
        invalid: Object.values(apiStatuses).filter((s) => s.valid === false).length,
      }
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8">
      <div className="container mx-auto max-w-4xl">
        {/* 헤더 */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            ⚙️ 설정
          </h1>
          <p className="text-sm sm:text-base text-gray-600">시스템 설정 및 API 키 관리</p>
        </div>

        {/* 전체 상태 요약 */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-lg sm:text-xl">API 연결 상태</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  모든 외부 API 서비스의 연결 상태를 확인합니다.
                  {lastChecked && (
                    <span className="ml-2 text-gray-400">
                      (마지막 확인: {lastChecked.toLocaleTimeString()})
                    </span>
                  )}
                </CardDescription>
              </div>
              <Button onClick={checkAllAPIs} disabled={isChecking} className="w-full sm:w-auto">
                {isChecking ? '확인 중...' : '전체 검사'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* 통계 */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="bg-gray-100 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-700">{stats.total}</div>
                  <div className="text-xs text-gray-500">전체 API</div>
                </div>
                <div className="bg-blue-100 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{stats.configured}</div>
                  <div className="text-xs text-blue-600">설정됨</div>
                </div>
                <div className="bg-green-100 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{stats.valid}</div>
                  <div className="text-xs text-green-600">정상</div>
                </div>
                <div className="bg-red-100 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-700">{stats.invalid}</div>
                  <div className="text-xs text-red-600">오류</div>
                </div>
              </div>
            )}

            {/* 카테고리별 API 상태 */}
            {Object.entries(API_CATEGORIES).map(([categoryKey, category]) => (
              <div key={categoryKey} className="mb-6 last:mb-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-1">
                  {category.title}
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 mb-3">{category.description}</p>

                <div className="grid gap-3">
                  {isChecking || !apiStatuses ? (
                    category.apis.map((apiKey) => <APIStatusSkeleton key={apiKey} />)
                  ) : (
                    category.apis.map(
                      (apiKey) =>
                        apiStatuses[apiKey] && (
                          <APIStatusCard
                            key={apiKey}
                            apiKey={apiKey}
                            status={apiStatuses[apiKey]}
                          />
                        )
                    )
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 환경 변수 설정 가이드 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">환경 변수 설정</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              API 키는 .env.local 파일에 설정합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-xs sm:text-sm text-green-400 whitespace-pre-wrap">
                {`# 한국 주식 데이터
KRX_API_KEY=your_krx_api_key
KIS_APP_KEY=your_kis_app_key
KIS_APP_SECRET=your_kis_app_secret
PUBLIC_DATA_API_KEY=your_public_data_key

# 미국 주식 데이터
FMP_API_KEY=your_fmp_api_key
FINNHUB_API_KEY=your_finnhub_api_key
TWELVE_DATA_API_KEY=your_twelve_data_key

# AI 분석
GEMINI_API_KEY_01=your_gemini_api_key
GEMINI_API_KEY_02=your_backup_gemini_key
`}
              </pre>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              설정 후 서버를 재시작하거나 Vercel에서 재배포하세요.
            </p>
          </CardContent>
        </Card>

        {/* 알림 설정 안내 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">알림 설정</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              API 키 무효 등 중요한 알림은 자동으로 생성됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs sm:text-sm text-gray-600">
              <p>• API 키가 무효하거나 만료된 경우 자동으로 알림이 생성됩니다.</p>
              <p>
                • 알림은{' '}
                <a href="/alerts" className="text-blue-600 hover:underline">
                  알림 페이지
                </a>
                에서 확인할 수 있습니다.
              </p>
              <p>• Slack/Discord 알림을 설정한 경우 외부 채널로도 전송됩니다.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
