'use client';

import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TechnicalIndicator } from '../lib/api';

export default function MACDChart({ indicators }: { indicators: TechnicalIndicator[] }) {
  const data = indicators.map((ind) => {
    const macd = ind.macd ?? 0;
    const signal = ind.macd_signal ?? 0;
    return {
      date: (ind as Record<string, unknown> & TechnicalIndicator).date?.slice(0, 10),
      macd,
      signal,
      histogram: macd - signal,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          formatter={(v: number, name: string) => {
            const labels: Record<string, string> = { macd: 'MACD', signal: 'الإشارة', histogram: 'الفرق' };
            return [v?.toFixed(3), labels[name] || name];
          }}
        />
        <Bar dataKey="histogram" fill="#6366F1" opacity={0.4} />
        <Line type="monotone" dataKey="macd" stroke="#3B82F6" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="signal" stroke="#EF4444" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
