'use client';

import { SectorData } from '../lib/api';
import { getSectorArabic, trendColors, trendLabels } from '../lib/arabic';

function getHeatColor(score: number | null): string {
  if (score == null) return 'bg-gray-800';
  if (score >= 7) return 'bg-emerald-600';
  if (score >= 6) return 'bg-emerald-700';
  if (score >= 5) return 'bg-yellow-700';
  if (score >= 4) return 'bg-orange-700';
  return 'bg-red-700';
}

export default function SectorHeatmap({ sectors }: { sectors: SectorData[] }) {
  const sorted = [...sectors].sort((a, b) => (b.avg_score ?? 0) - (a.avg_score ?? 0));

  return (
    <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3 font-arabic">خريطة القطاعات</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {sorted.map((s) => (
          <div
            key={s.sector}
            className={`${getHeatColor(s.avg_score)} rounded-lg p-3 text-center transition-all hover:scale-105`}
          >
            <p className="text-white text-xs font-bold font-arabic">{getSectorArabic(s.sector)}</p>
            <p className="text-white text-lg font-bold">{s.avg_score?.toFixed(1) ?? '—'}</p>
            <p className={`text-xs ${trendColors[s.trend || 'neutral']}`}>
              {trendLabels[s.trend || 'neutral']}
            </p>
            <p className="text-white/60 text-xs mt-1">{s.stock_count} أسهم</p>
          </div>
        ))}
      </div>
    </div>
  );
}
