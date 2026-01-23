'use client';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import type { ChartDataPoint } from '@/lib/chart-utils';
import { formatChartDate } from '@/lib/chart-utils';

interface StochasticChartProps {
  data: ChartDataPoint[];
}

// Stochastic 영역 판단 함수
function getStochasticZone(k: number, d: number): {
  zone: 'overbought' | 'oversold' | 'neutral';
  signal: 'buy' | 'sell' | 'none';
  label: string;
  color: string;
} {
  let zone: 'overbought' | 'oversold' | 'neutral';
  let signal: 'buy' | 'sell' | 'none' = 'none';

  if (k >= 80) {
    zone = 'overbought';
  } else if (k <= 20) {
    zone = 'oversold';
  } else {
    zone = 'neutral';
  }

  // 매수/매도 신호: K가 D를 교차
  if (k > d && zone === 'oversold') {
    signal = 'buy';
  } else if (k < d && zone === 'overbought') {
    signal = 'sell';
  }

  let label = '';
  let color = '';

  if (signal === 'buy') {
    label = '매수 신호';
    color = 'text-green-600';
  } else if (signal === 'sell') {
    label = '매도 신호';
    color = 'text-red-600';
  } else if (zone === 'overbought') {
    label = '과매수';
    color = 'text-red-600';
  } else if (zone === 'oversold') {
    label = '과매도';
    color = 'text-green-600';
  } else {
    label = '중립';
    color = 'text-gray-600';
  }

  return { zone, signal, label, color };
}

export function StochasticChart({ data }: StochasticChartProps) {
  // Stochastic 데이터 필터링
  const stochasticData = data
    .filter((d) => d.stochasticK !== undefined && d.stochasticD !== undefined)
    .map((d) => ({
      date: d.date,
      k: d.stochasticK!,
      d: d.stochasticD!,
    }));

  if (stochasticData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Stochastic 데이터가 없습니다. (14일 이상의 데이터 필요)
      </div>
    );
  }

  // 최신 60일 데이터만 표시
  const displayData = stochasticData.slice(-60);

  // 현재 Stochastic 상태
  const latest = displayData[displayData.length - 1];
  const currentSignal = getStochasticZone(latest.k, latest.d);

  // 커스텀 툴팁
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: number; payload: typeof displayData[0] }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const signal = getStochasticZone(d.k, d.d);

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">%K (Fast)</span>
              <span className="font-bold text-blue-600">{d.k.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">%D (Slow)</span>
              <span className="font-bold text-orange-600">{d.d.toFixed(2)}</span>
            </div>
            <div className="border-t pt-1 mt-1">
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">영역</span>
                <span className={`font-medium ${signal.color}`}>
                  {signal.zone === 'overbought' ? '과매수' :
                   signal.zone === 'oversold' ? '과매도' : '중립'}
                </span>
              </div>
              {signal.signal !== 'none' && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">신호</span>
                  <span className={`font-medium ${signal.color}`}>
                    {signal.signal === 'buy' ? '🟢 매수' : '🔴 매도'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative">
      {/* 현재 Stochastic 상태 배지 */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
        <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
          currentSignal.signal === 'buy' ? 'bg-green-100 text-green-700' :
          currentSignal.signal === 'sell' ? 'bg-red-100 text-red-700' :
          currentSignal.zone === 'overbought' ? 'bg-red-50 text-red-600' :
          currentSignal.zone === 'oversold' ? 'bg-green-50 text-green-600' :
          'bg-gray-100 text-gray-700'
        }`}>
          {currentSignal.signal !== 'none' && (
            <span className="mr-1">{currentSignal.signal === 'buy' ? '🟢' : '🔴'}</span>
          )}
          %K {latest.k.toFixed(0)} ({currentSignal.label})
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200} className="sm:h-[220px]">
        <LineChart
          data={displayData}
          margin={{ top: 30, right: 10, left: 0, bottom: 5 }}
          className="sm:!mr-8 sm:!ml-5"
        >
          {/* 과매수 영역 배경 (80-100) */}
          <ReferenceArea
            y1={80}
            y2={100}
            fill="#fee2e2"
            fillOpacity={0.5}
          />

          {/* 과매도 영역 배경 (0-20) */}
          <ReferenceArea
            y1={0}
            y2={20}
            fill="#dcfce7"
            fillOpacity={0.5}
          />

          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            stroke="#6b7280"
            style={{ fontSize: '11px' }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#6b7280"
            style={{ fontSize: '11px' }}
            ticks={[0, 20, 50, 80, 100]}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* 기준선 */}
          <ReferenceLine
            y={80}
            stroke="#ef4444"
            strokeDasharray="3 3"
            label={{
              value: '80',
              position: 'right',
              fill: '#ef4444',
              fontSize: 10,
            }}
          />
          <ReferenceLine
            y={20}
            stroke="#10b981"
            strokeDasharray="3 3"
            label={{
              value: '20',
              position: 'right',
              fill: '#10b981',
              fontSize: 10,
            }}
          />
          <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="2 2" />

          {/* %K 라인 (Fast) */}
          <Line
            type="monotone"
            dataKey="k"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="%K"
            activeDot={{ r: 5, strokeWidth: 2, fill: 'white', stroke: '#3b82f6' }}
          />

          {/* %D 라인 (Slow) */}
          <Line
            type="monotone"
            dataKey="d"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            name="%D"
            strokeDasharray="5 5"
            activeDot={{ r: 5, strokeWidth: 2, fill: 'white', stroke: '#f97316' }}
          />

          {/* 커스텀 범례 */}
          <Legend
            content={() => (
              <ul className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-blue-500" />
                  <span className="text-gray-600">%K (14)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-orange-500" style={{ borderStyle: 'dashed' }} />
                  <span className="text-gray-600">%D (3)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300" />
                  <span className="text-gray-600">과매수 (80+)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
                  <span className="text-gray-600">과매도 (20-)</span>
                </li>
              </ul>
            )}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
