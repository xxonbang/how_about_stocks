'use client';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { ChartDataPoint } from '@/lib/chart-utils';
import { formatChartDate } from '@/lib/chart-utils';
import { Star, AlertTriangle } from 'lucide-react';

interface MACDChartProps {
  data: ChartDataPoint[];
}

// MACD 신호 분석 함수
function analyzeMACDSignal(macdLine: number, signalLine: number, histogram: number, prevHistogram?: number): {
  trend: 'bullish' | 'bearish' | 'neutral';
  crossover: 'golden' | 'death' | 'none';
  label: string;
  color: string;
} {
  const trend = histogram > 0 ? 'bullish' : histogram < 0 ? 'bearish' : 'neutral';

  // 골든크로스/데드크로스 감지
  let crossover: 'golden' | 'death' | 'none' = 'none';
  if (prevHistogram !== undefined) {
    if (prevHistogram < 0 && histogram >= 0) {
      crossover = 'golden';
    } else if (prevHistogram > 0 && histogram <= 0) {
      crossover = 'death';
    }
  }

  let label = '';
  let color = '';

  if (crossover === 'golden') {
    label = '골든크로스';
    color = 'text-green-600';
  } else if (crossover === 'death') {
    label = '데드크로스';
    color = 'text-red-600';
  } else if (trend === 'bullish') {
    label = '상승추세';
    color = 'text-green-600';
  } else if (trend === 'bearish') {
    label = '하락추세';
    color = 'text-red-600';
  } else {
    label = '중립';
    color = 'text-gray-600';
  }

  return { trend, crossover, label, color };
}

export function MACDChart({ data }: MACDChartProps) {
  // MACD 데이터 필터링
  const macdData = data
    .filter((d) => d.macdLine !== undefined && d.signalLine !== undefined)
    .map((d, index, arr) => ({
      date: d.date,
      macdLine: d.macdLine!,
      signalLine: d.signalLine!,
      histogram: d.histogram ?? 0,
      prevHistogram: index > 0 ? arr[index - 1].histogram : undefined,
    }));

  if (macdData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        MACD 데이터가 없습니다. (26일 이상의 데이터 필요)
      </div>
    );
  }

  // 최신 60일 데이터만 표시
  const displayData = macdData.slice(-60);

  // 현재 MACD 상태
  const latest = displayData[displayData.length - 1];
  const prev = displayData.length > 1 ? displayData[displayData.length - 2] : null;
  const currentSignal = analyzeMACDSignal(
    latest.macdLine,
    latest.signalLine,
    latest.histogram,
    prev?.histogram
  );

  // 커스텀 툴팁
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: number; payload: typeof displayData[0] }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const signal = analyzeMACDSignal(d.macdLine, d.signalLine, d.histogram, d.prevHistogram);

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">MACD</span>
              <span className="font-bold text-blue-600">{d.macdLine.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Signal</span>
              <span className="font-bold text-orange-600">{d.signalLine.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Histogram</span>
              <span className={`font-bold ${d.histogram >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {d.histogram.toFixed(2)}
              </span>
            </div>
            <div className="border-t pt-1 mt-1">
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">신호</span>
                <span className={`font-medium ${signal.color}`}>
                  {signal.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative">
      {/* 현재 MACD 상태 배지 */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
        <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
          currentSignal.crossover === 'golden' ? 'bg-green-100 text-green-700' :
          currentSignal.crossover === 'death' ? 'bg-red-100 text-red-700' :
          currentSignal.trend === 'bullish' ? 'bg-green-50 text-green-600' :
          currentSignal.trend === 'bearish' ? 'bg-red-50 text-red-600' :
          'bg-gray-100 text-gray-700'
        }`}>
          {currentSignal.crossover !== 'none' && (
            <span className="mr-1 inline-flex">{currentSignal.crossover === 'golden' ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : <AlertTriangle className="w-4 h-4 text-orange-500" />}</span>
          )}
          {currentSignal.label}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200} className="sm:h-[220px]">
        <ComposedChart
          data={displayData}
          margin={{ top: 30, right: 10, left: 0, bottom: 5 }}
          className="sm:!mr-8 sm:!ml-5"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            stroke="#6b7280"
            style={{ fontSize: '11px' }}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: '11px' }}
            tickFormatter={(value) => value.toFixed(0)}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* 0 기준선 */}
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />

          {/* 히스토그램 바 */}
          <Bar dataKey="histogram" name="Histogram" barSize={4}>
            {displayData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.histogram >= 0 ? '#22c55e' : '#ef4444'}
                fillOpacity={0.8}
              />
            ))}
          </Bar>

          {/* MACD 라인 */}
          <Line
            type="monotone"
            dataKey="macdLine"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="MACD"
            activeDot={{ r: 5, strokeWidth: 2, fill: 'white', stroke: '#3b82f6' }}
          />

          {/* Signal 라인 */}
          <Line
            type="monotone"
            dataKey="signalLine"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            name="Signal"
            strokeDasharray="5 5"
            activeDot={{ r: 5, strokeWidth: 2, fill: 'white', stroke: '#f97316' }}
          />

          {/* 커스텀 범례 */}
          <Legend
            content={() => (
              <ul className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-blue-500" />
                  <span className="text-gray-600">MACD (12-26)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-orange-500" style={{ borderStyle: 'dashed' }} />
                  <span className="text-gray-600">Signal (9)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-green-500" />
                  <span className="text-gray-600">상승</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-red-500" />
                  <span className="text-gray-600">하락</span>
                </li>
              </ul>
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
