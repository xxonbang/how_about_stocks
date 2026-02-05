'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import type { ChartDataPoint } from '@/lib/chart-utils';
import { formatChartDate } from '@/lib/chart-utils';

interface RSIChartProps {
  data: ChartDataPoint[];
  currentRSI?: number;
}

// RSI 영역 판단 함수
function getRSIZone(rsi: number): { zone: 'overbought' | 'oversold' | 'neutral'; label: string; color: string } {
  if (rsi >= 70) {
    return { zone: 'overbought', label: '과매수', color: 'text-red-600' };
  } else if (rsi <= 30) {
    return { zone: 'oversold', label: '과매도', color: 'text-green-600' };
  } else {
    return { zone: 'neutral', label: '중립', color: 'text-gray-600' };
  }
}

export function RSIChart({ data, currentRSI }: RSIChartProps) {
  if (!currentRSI && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 sm:h-48 text-gray-500 text-sm">
        RSI 데이터가 없습니다.
      </div>
    );
  }

  // RSI 데이터 생성 (과거 데이터가 있으면 사용, 없으면 현재값만)
  const rsiData = data
    .filter((d) => d.rsi !== undefined)
    .map((d) => ({
      date: d.date,
      rsi: d.rsi!,
    }));

  // RSI 데이터가 없으면 현재값만 표시
  if (rsiData.length === 0 && currentRSI) {
    rsiData.push({ date: data[0]?.date || '', rsi: currentRSI });
  }

  // 최신 60일 데이터만 표시
  const displayData = rsiData.slice(-60);

  // displayData가 빈 배열이면 메시지 표시
  if (displayData.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 sm:h-48 text-gray-500 text-sm">
        RSI 데이터가 없습니다.
      </div>
    );
  }

  // 현재 RSI 값 (가장 최신)
  const latestRSI = displayData.length > 0 ? displayData[displayData.length - 1].rsi : currentRSI;
  const rsiZone = latestRSI ? getRSIZone(latestRSI) : null;

  // 커스텀 툴팁 - 모바일 최적화
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      const rsi = payload[0].value;
      const zone = getRSIZone(rsi);

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 sm:p-3 text-xs sm:text-sm max-w-[180px] sm:max-w-none">
          <p className="font-medium text-gray-900 mb-1.5 sm:mb-2 truncate">{label}</p>
          <div className="space-y-0.5 sm:space-y-1">
            <div className="flex justify-between gap-2 sm:gap-4">
              <span className="text-gray-600">RSI</span>
              <span className={`font-bold ${zone.color}`}>
                {rsi.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between gap-2 sm:gap-4">
              <span className="text-gray-600">상태</span>
              <span className={`font-medium ${zone.color}`}>
                {zone.label}
                <span className="hidden sm:inline">
                  {zone.zone === 'overbought' && ' (매도 고려)'}
                  {zone.zone === 'oversold' && ' (매수 고려)'}
                </span>
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // RSI 라인 색상 결정
  const getLineColor = () => {
    if (!latestRSI) return '#3b82f6';
    if (latestRSI >= 70) return '#ef4444'; // 과매수: 빨강
    if (latestRSI <= 30) return '#10b981'; // 과매도: 초록
    return '#3b82f6'; // 중립: 파랑
  };

  return (
    <div className="relative">
      {/* 현재 RSI 상태 배지 - 모바일 최적화 */}
      {latestRSI && rsiZone && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
          <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-bold ${
            rsiZone.zone === 'overbought' ? 'bg-red-100 text-red-700' :
            rsiZone.zone === 'oversold' ? 'bg-green-100 text-green-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            <span className="sm:hidden">{latestRSI.toFixed(0)}</span>
            <span className="hidden sm:inline">RSI {latestRSI.toFixed(1)} ({rsiZone.label})</span>
          </div>
        </div>
      )}

      {/* 모바일: 140px, 태블릿/데스크탑: 180px */}
      <div className="h-[140px] sm:h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={displayData}
            margin={{ top: 25, right: 5, left: -15, bottom: 5 }}
          >
          {/* 과매수 영역 배경 (70-100) */}
          <ReferenceArea
            y1={70}
            y2={100}
            fill="#fee2e2"
            fillOpacity={0.5}
          />

          {/* 과매도 영역 배경 (0-30) */}
          <ReferenceArea
            y1={0}
            y2={30}
            fill="#dcfce7"
            fillOpacity={0.5}
          />

          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            stroke="#6b7280"
            tick={{ fontSize: 10 }}
            tickMargin={5}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            stroke="#6b7280"
            tick={{ fontSize: 10 }}
            width={30}
            ticks={[0, 30, 50, 70, 100]}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* 기준선 */}
          <ReferenceLine
            y={70}
            stroke="#ef4444"
            strokeDasharray="3 3"
            label={{
              value: '70',
              position: 'right',
              fill: '#ef4444',
              fontSize: 10,
            }}
          />
          <ReferenceLine
            y={30}
            stroke="#10b981"
            strokeDasharray="3 3"
            label={{
              value: '30',
              position: 'right',
              fill: '#10b981',
              fontSize: 10,
            }}
          />
          <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="2 2" />

          {/* RSI 라인 */}
          <Line
            type="monotone"
            dataKey="rsi"
            stroke={getLineColor()}
            strokeWidth={2.5}
            dot={false}
            name="RSI"
            activeDot={{
              r: 6,
              strokeWidth: 2,
              fill: 'white',
              stroke: getLineColor()
            }}
          />

          {/* 커스텀 범례 - 모바일 최적화 */}
          <Legend
            content={() => (
              <ul className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-1.5 sm:mt-2 text-[10px] sm:text-xs">
                <li className="flex items-center gap-1 sm:gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-red-100 border border-red-300" />
                  <span className="text-gray-600">과매수 (70+)</span>
                </li>
                <li className="flex items-center gap-1 sm:gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-green-100 border border-green-300" />
                  <span className="text-gray-600">과매도 (30-)</span>
                </li>
              </ul>
            )}
          />
        </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
