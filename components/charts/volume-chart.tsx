'use client';

import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { ChartDataPoint } from '@/lib/chart-utils';
import { formatChartDate } from '@/lib/chart-utils';

interface SupplyDemandData {
  institutional: number;
  foreign: number;
  individual: number;
}

interface VolumeChartProps {
  data: ChartDataPoint[];
  averageVolume?: number;
  supplyDemand?: SupplyDemandData;
}

export function VolumeChart({ data, averageVolume, supplyDemand }: VolumeChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        거래량 데이터가 없습니다.
      </div>
    );
  }

  // 최신 60일 데이터만 표시
  const displayData = data.slice(-60).map((d) => ({
    ...d,
    avgVolume: averageVolume,
  }));

  // 고거래량 기준 계산 (평균의 1.5배 이상)
  const highVolumeThreshold = averageVolume ? averageVolume * 1.5 : 0;

  // 쌍끌이 여부 확인 (외국인 + 기관 모두 양수)
  const isSsangkkeuli = supplyDemand &&
    supplyDemand.foreign > 0 &&
    supplyDemand.institutional > 0;

  // 커스텀 툴팁
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }>; label?: string }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const isHighVolume = averageVolume && d.volume > highVolumeThreshold;
      const volumeRatio = averageVolume ? ((d.volume / averageVolume) * 100).toFixed(0) : null;

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">거래량</span>
              <span className={`font-bold ${isHighVolume ? 'text-orange-600' : ''}`}>
                {d.volume.toLocaleString()}
                {isHighVolume && ' 🔥'}
              </span>
            </div>
            {averageVolume && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">평균대비</span>
                <span className={`font-medium ${
                  d.volume > averageVolume ? 'text-red-600' : 'text-blue-600'
                }`}>
                  {volumeRatio}%
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">주가</span>
              <span className={`font-medium ${d.isUp ? 'text-red-600' : 'text-blue-600'}`}>
                {d.isUp ? '▲ 상승' : '▼ 하락'}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // 바 색상 결정 함수
  const getBarColor = (entry: ChartDataPoint): string => {
    const isHighVolume = averageVolume && entry.volume > highVolumeThreshold;

    if (entry.isUp) {
      // 상승일: 빨간색 계열
      return isHighVolume ? '#dc2626' : '#ef4444'; // 고거래량이면 더 진한 빨강
    } else {
      // 하락일: 파란색 계열
      return isHighVolume ? '#1d4ed8' : '#3b82f6'; // 고거래량이면 더 진한 파랑
    }
  };

  return (
    <div className="space-y-3">
      {/* 고거래량 안내 배지 */}
      {averageVolume && displayData.some(d => d.volume > highVolumeThreshold) && (
        <div className="flex justify-end">
          <div className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-md flex items-center gap-1">
            <span>🔥</span>
            <span>고거래량 = 평균의 150% 이상</span>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={180} className="sm:h-[200px]">
        <ComposedChart
          data={displayData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
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
            tickFormatter={(value) => {
              if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
              if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
              return value.toString();
            }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* 거래량 바 - 주가 연동 색상 */}
          <Bar
            dataKey="volume"
            name="거래량"
            radius={[2, 2, 0, 0]}
          >
            {displayData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColor(entry)}
                fillOpacity={averageVolume && entry.volume > highVolumeThreshold ? 1 : 0.8}
              />
            ))}
          </Bar>

          {/* 평균 거래량 라인 */}
          {averageVolume && (
            <ReferenceLine
              y={averageVolume}
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 5"
              label={{
                value: '평균',
                position: 'right',
                fill: '#f59e0b',
                fontSize: 10,
              }}
            />
          )}

          {/* 커스텀 범례 */}
          <Legend
            content={() => (
              <ul className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-red-500" />
                  <span className="text-gray-600">상승일</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
                  <span className="text-gray-600">하락일</span>
                </li>
                {averageVolume && (
                  <li className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 bg-amber-500" style={{ borderStyle: 'dashed' }} />
                    <span className="text-gray-600">평균 거래량</span>
                  </li>
                )}
              </ul>
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* 외국인/기관 순매수 정보 */}
      {supplyDemand && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs sm:text-sm font-medium text-gray-700">
              당일 수급 현황
            </div>
            {isSsangkkeuli && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-bold rounded-full animate-pulse">
                <span>🔥</span>
                <span>쌍끌이</span>
              </div>
            )}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs sm:text-sm">
            <div className="text-center p-2 bg-white rounded border">
              <div className="text-gray-500 mb-1">외국인</div>
              <div className={`font-bold ${supplyDemand.foreign >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {supplyDemand.foreign >= 0 ? '+' : ''}{supplyDemand.foreign.toLocaleString()}
              </div>
            </div>
            <div className="text-center p-2 bg-white rounded border">
              <div className="text-gray-500 mb-1">기관</div>
              <div className={`font-bold ${supplyDemand.institutional >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {supplyDemand.institutional >= 0 ? '+' : ''}{supplyDemand.institutional.toLocaleString()}
              </div>
            </div>
            <div className="text-center p-2 bg-white rounded border">
              <div className="text-gray-500 mb-1">개인</div>
              <div className={`font-bold ${supplyDemand.individual >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {supplyDemand.individual >= 0 ? '+' : ''}{supplyDemand.individual.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
