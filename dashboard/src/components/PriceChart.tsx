'use client';

import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Area } from 'recharts';
import { DailyPrice, TechnicalIndicator } from '../lib/api';

interface PriceChartProps {
  prices: DailyPrice[];
  indicators: TechnicalIndicator[];
  showSMA?: boolean;
  showBollinger?: boolean;
  showVolume?: boolean;
}

export default function PriceChart({ prices, indicators, showSMA = true, showBollinger = false, showVolume = true }: PriceChartProps) {
  const data = prices.map((p, i) => ({
    date: p.date?.slice(0, 10),
    close: p.close,
    open: p.open,
    high: p.high,
    low: p.low,
    volume: p.volume,
    sma_20: indicators[i]?.sma_20,
    sma_50: indicators[i]?.sma_50,
    sma_200: indicators[i]?.sma_200,
    bb_upper: indicators[i]?.bb_upper,
    bb_lower: indicators[i]?.bb_lower,
    bb_middle: indicators[i]?.bb_middle,
  }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#6B7280' }} orientation="left" />
          {showVolume && (
            <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 10, fill: '#374151' }} />
          )}
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, direction: 'rtl' }}
            labelStyle={{ color: '#9CA3AF' }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                close: 'الإغلاق',
                sma_20: 'SMA 20',
                sma_50: 'SMA 50',
                sma_200: 'SMA 200',
                bb_upper: 'بولنجر علوي',
                bb_lower: 'بولنجر سفلي',
                volume: 'الحجم',
              };
              return [typeof value === 'number' ? value.toFixed(2) : value, labels[name] || name];
            }}
          />

          {showVolume && (
            <Bar yAxisId="volume" dataKey="volume" fill="#374151" opacity={0.3} />
          )}

          {showBollinger && (
            <>
              <Area dataKey="bb_upper" stroke="#6366F1" fill="#6366F1" fillOpacity={0.05} strokeWidth={1} dot={false} strokeDasharray="3 3" />
              <Area dataKey="bb_lower" stroke="#6366F1" fill="#6366F1" fillOpacity={0.05} strokeWidth={1} dot={false} strokeDasharray="3 3" />
            </>
          )}

          <Line type="monotone" dataKey="close" stroke="#FFD600" strokeWidth={2} dot={false} />

          {showSMA && (
            <>
              <Line type="monotone" dataKey="sma_20" stroke="#10B981" strokeWidth={1} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="sma_50" stroke="#F59E0B" strokeWidth={1} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="sma_200" stroke="#EF4444" strokeWidth={1} dot={false} strokeDasharray="4 2" />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
