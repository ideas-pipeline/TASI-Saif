'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { TechnicalIndicator } from '../lib/api';

export default function RSIChart({ indicators }: { indicators: TechnicalIndicator[] }) {
  const data = indicators.map((ind) => ({
    date: (ind as Record<string, unknown> & TechnicalIndicator).date?.slice(0, 10),
    rsi: ind.rsi_14,
  }));

  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6B7280' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          formatter={(v: number) => [v?.toFixed(1), 'RSI']}
        />
        <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="3 3" label={{ value: 'تشبع شرائي', fill: '#EF4444', fontSize: 10 }} />
        <ReferenceLine y={30} stroke="#10B981" strokeDasharray="3 3" label={{ value: 'تشبع بيعي', fill: '#10B981', fontSize: 10 }} />
        <Line type="monotone" dataKey="rsi" stroke="#8B5CF6" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
