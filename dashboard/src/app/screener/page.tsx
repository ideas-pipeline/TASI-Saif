'use client';

import { useState, useEffect } from 'react';
import { Stock, getStocks, getSectors, SectorData } from '../../lib/api';
import { getSectorArabic, signalLabels, riskLabels } from '../../lib/arabic';
import StockCard from '../../components/StockCard';
import Disclaimer from '../../components/Disclaimer';

export default function ScreenerPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [sectorFilter, setSectorFilter] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [maxPE, setMaxPE] = useState(100);
  const [minDividend, setMinDividend] = useState(0);
  const [signalFilter, setSignalFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [sortBy, setSortBy] = useState('overall_score');

  useEffect(() => {
    Promise.all([getStocks(), getSectors()]).then(([stockData, sectorData]) => {
      setStocks(stockData.stocks || []);
      setSectors(sectorData.sectors || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = stocks
    .filter((s) => !sectorFilter || s.sector === sectorFilter)
    .filter((s) => (s.overall_score ?? 0) >= minScore)
    .filter((s) => !s.pe_ratio || s.pe_ratio <= maxPE)
    .filter((s) => (s.dividend_yield ?? 0) >= minDividend)
    .filter((s) => !signalFilter || s.entry_signal === signalFilter)
    .filter((s) => !riskFilter || s.risk_level === riskFilter)
    .sort((a, b) => {
      const av = (a as unknown as Record<string, number | null>)[sortBy] ?? 0;
      const bv = (b as unknown as Record<string, number | null>)[sortBy] ?? 0;
      return bv - av;
    });

  const uniqueSectors = [...new Set(stocks.map((s) => s.sector))].sort();

  if (loading) {
    return <div className="text-center py-20 text-gray-400">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">فرز الأسهم</h1>

      {/* Filters */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-sm font-bold text-gray-300 mb-3">الفلاتر</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">القطاع</label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="">الكل</option>
              {uniqueSectors.map((s) => (
                <option key={s} value={s}>{getSectorArabic(s)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">الحد الأدنى للتقييم</label>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-xs text-gray-400">{minScore}</span>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">الحد الأقصى لمكرر الربحية</label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={maxPE}
              onChange={(e) => setMaxPE(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-xs text-gray-400">{maxPE}</span>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">الحد الأدنى للتوزيعات ٪</label>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={minDividend}
              onChange={(e) => setMinDividend(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-xs text-gray-400">{minDividend}٪</span>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">الإشارة</label>
            <select
              value={signalFilter}
              onChange={(e) => setSignalFilter(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="">الكل</option>
              {Object.entries(signalLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">المخاطر</label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="">الكل</option>
              {Object.entries(riskLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">ترتيب حسب:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
            >
              <option value="overall_score">التقييم الإجمالي</option>
              <option value="technical_score">التقييم الفني</option>
              <option value="fundamental_score">التقييم الأساسي</option>
              <option value="dividend_yield">التوزيعات</option>
              <option value="pe_ratio">مكرر الربحية</option>
            </select>
          </div>
          <span className="text-xs text-gray-400">{filtered.length} سهم</span>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((stock) => (
          <StockCard key={stock.symbol} stock={stock} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10 text-gray-400">لا توجد نتائج تطابق الفلاتر المحددة</div>
      )}

      <Disclaimer />
    </div>
  );
}
