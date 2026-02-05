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
  Area,
  ComposedChart,
  ReferenceDot,
} from 'recharts';
import type { ChartDataPoint } from '@/lib/chart-utils';
import { formatChartDate, formatChartPrice } from '@/lib/chart-utils';

interface PriceChartProps {
  data: ChartDataPoint[];
  symbol: string;
  showMovingAverages?: boolean;
  showBollingerBands?: boolean;
}

export function PriceChart({
  data,
  symbol,
  showMovingAverages = true,
  showBollingerBands = false,
}: PriceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 sm:h-64 text-gray-500 text-sm">
        차트 데이터가 없습니다.
      </div>
    );
  }

  // 최신 60일 데이터만 표시 (가독성 향상)
  const displayData = data.slice(-60);
  const latestData = displayData[displayData.length - 1];
  const prevData = displayData.length > 1 ? displayData[displayData.length - 2] : latestData;
  const isUp = latestData.close >= prevData.close;

  // Y축 범위 계산
  const prices = displayData.map(d => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  // 커스텀 툴팁 - 모바일 최적화
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const change = data.priceChange || 0;
      const changePercent = data.close > 0 ? ((change / (data.close - change)) * 100) : 0;
      const isPositive = change >= 0;

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 sm:p-3 text-xs sm:text-sm max-w-[200px] sm:max-w-none">
          <p className="font-medium text-gray-900 mb-1.5 sm:mb-2 truncate">{label}</p>
          <div className="space-y-0.5 sm:space-y-1">
            <div className="flex justify-between gap-2 sm:gap-4">
              <span className="text-gray-600">종가</span>
              <span className="font-bold">{data.close?.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between gap-2 sm:gap-4">
              <span className="text-gray-600">전일대비</span>
              <span className={`font-medium ${isPositive ? 'text-red-600' : 'text-blue-600'}`}>
                {isPositive ? '+' : ''}{change.toLocaleString()} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
              </span>
            </div>
            {data.volume && (
              <div className="flex justify-between gap-2 sm:gap-4">
                <span className="text-gray-600">거래량</span>
                <span>{data.volume.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative">
      {/* 현재가 표시 배지 - 모바일 최적화 */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
        <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-bold ${
          isUp ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {isUp ? '▲' : '▼'} {latestData.close.toLocaleString()}원
        </div>
      </div>

      {/* 모바일: 220px, 태블릿: 260px, 데스크탑: 320px */}
      <div className="h-[220px] sm:h-[260px] md:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={displayData}
            margin={{ top: 25, right: 5, left: -15, bottom: 5 }}
          >
            <defs>
              {/* 주가 영역 그라데이션 */}
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isUp ? "#ef4444" : "#3b82f6"} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={isUp ? "#ef4444" : "#3b82f6"} stopOpacity={0.05}/>
              </linearGradient>
            </defs>

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
              tickFormatter={formatChartPrice}
              stroke="#6b7280"
              tick={{ fontSize: 10 }}
              width={45}
              domain={[minPrice - priceRange * 0.1, maxPrice + priceRange * 0.1]}
            />
          <Tooltip content={<CustomTooltip />} />

          {/* 주가 영역 채우기 */}
          <Area
            type="monotone"
            dataKey="close"
            stroke="transparent"
            fill="url(#priceGradient)"
            fillOpacity={1}
          />

          {/* 주가 라인 */}
          <Line
            type="monotone"
            dataKey="close"
            stroke={isUp ? "#ef4444" : "#3b82f6"}
            strokeWidth={2.5}
            dot={false}
            name="주가"
            activeDot={{ r: 6, strokeWidth: 2, fill: 'white', stroke: isUp ? "#ef4444" : "#3b82f6" }}
          />

          {/* 이동평균선 */}
          {showMovingAverages && (
            <>
              <Line
                type="monotone"
                dataKey="ma5"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                name="5일선"
                strokeDasharray="5 5"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="ma20"
                stroke="#10b981"
                strokeWidth={1.5}
                dot={false}
                name="20일선"
                strokeDasharray="5 5"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="ma60"
                stroke="#8b5cf6"
                strokeWidth={1.5}
                dot={false}
                name="60일선"
                strokeDasharray="5 5"
                connectNulls
              />
            </>
          )}

          {/* 볼린저 밴드 */}
          {showBollingerBands && (
            <>
              <Line
                type="monotone"
                dataKey="bbUpper"
                stroke="#ef4444"
                strokeWidth={1}
                dot={false}
                name="상단선"
                strokeDasharray="3 3"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="bbMiddle"
                stroke="#6b7280"
                strokeWidth={1}
                dot={false}
                name="중심선"
                strokeDasharray="3 3"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="bbLower"
                stroke="#06b6d4"
                strokeWidth={1}
                dot={false}
                name="하단선"
                strokeDasharray="3 3"
                connectNulls
              />
            </>
          )}

          {/* 커스텀 범례 - 모바일 최적화 */}
          <Legend
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null;

              const order = ['주가', '5일선', '20일선', '60일선', '상단선', '중심선', '하단선'];
              const sortedPayload = [...payload].sort((a, b) => {
                const aIndex = order.findIndex(name => a.value === name);
                const bIndex = order.findIndex(name => b.value === name);
                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
              });

              return (
                <ul className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-2 sm:mt-3 text-[10px] sm:text-xs">
                  {sortedPayload.map((entry, index) => (
                    <li key={`item-${index}`} className="flex items-center gap-1 sm:gap-1.5">
                      <span
                        style={{
                          display: 'inline-block',
                          width: '10px',
                          height: '2px',
                          backgroundColor: entry.color,
                          borderRadius: '1px',
                        }}
                        className="sm:!w-3 sm:!h-[3px]"
                      />
                      <span style={{ color: '#4b5563' }}>
                        {entry.value}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            }}
          />
        </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
