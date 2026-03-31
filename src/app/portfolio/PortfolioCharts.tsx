'use client';

import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { PortfolioPerformance } from '../../lib/api';
import { getSectorArabic } from '../../lib/arabic';

const SECTOR_COLORS = [
  '#FFD600', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16', '#F97316',
  '#14B8A6', '#6366F1', '#D946EF', '#22D3EE',
];

interface PortfolioChartsProps {
  performance: PortfolioPerformance[];
  sectorAllocation: Record<string, number>;
}

export default function PortfolioCharts({ performance, sectorAllocation }: PortfolioChartsProps) {
  const chartData = performance.map((p) => ({
    date: p.date?.slice(0, 10),
    portfolio: p.cumulative_return * 100,
    tasi: p.tasi_return * 100,
    excess: p.excess_return * 100,
  }));

  const pieData = Object.entries(sectorAllocation)
    .sort(([, a], [, b]) => b - a)
    .map(([sector, weight], i) => ({
      name: getSectorArabic(sector),
      value: Math.round(weight * 1000) / 10,
      fill: SECTOR_COLORS[i % SECTOR_COLORS.length],
    }));

  return (
    <div className="space-y-6">
      {/* Performance Line Chart */}
      <div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 10, fill: '#6B7280' }}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #374151',
                borderRadius: 8,
                direction: 'rtl',
              }}
              labelStyle={{ color: '#9CA3AF' }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  portfolio: 'المحفظة',
                  tasi: 'مؤشر تاسي',
                  excess: 'العائد الزائد',
                };
                return [`${value.toFixed(2)}%`, labels[name] || name];
              }}
            />

            {/* Zero line */}
            <Area
              type="monotone"
              dataKey="excess"
              stroke="none"
              fill="#10B981"
              fillOpacity={0.08}
            />

            <Line
              type="monotone"
              dataKey="portfolio"
              stroke="#FFD600"
              strokeWidth={2}
              dot={false}
              name="portfolio"
            />
            <Line
              type="monotone"
              dataKey="tasi"
              stroke="#6B7280"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
              name="tasi"
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-2 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-tasi-gold inline-block" /> المحفظة
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-gray-500 inline-block" style={{ borderTop: '1px dashed' }} /> مؤشر تاسي
          </span>
        </div>
      </div>

      {/* Sector Pie Chart */}
      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2">توزيع القطاعات</h3>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey="value"
              label={({ name, value }) => `${name} ${value}%`}
              labelLine={{ stroke: '#4B5563' }}
            >
              {pieData.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #374151',
                borderRadius: 8,
              }}
              formatter={(value: number) => [`${value}%`, 'الوزن']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
