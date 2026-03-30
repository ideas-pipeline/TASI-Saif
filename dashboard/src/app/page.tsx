import { getRankings, getSectors, getSignals, getStats } from '../lib/api';
import { signalLabels, signalColors, getSectorArabic, formatNumber } from '../lib/arabic';
import SectorHeatmap from '../components/SectorHeatmap';
import StockCard from '../components/StockCard';
import SignalBadge from '../components/SignalBadge';
import Disclaimer from '../components/Disclaimer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let rankings, sectors, signals, stats;
  try {
    [rankings, sectors, signals, stats] = await Promise.all([
      getRankings(10),
      getSectors(),
      getSignals(),
      getStats(),
    ]);
  } catch {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-red-400 mb-2">خطأ في الاتصال</h1>
        <p className="text-gray-400">تعذر الاتصال بخادم البيانات. تأكد من تشغيل الخادم على المنفذ 3000.</p>
      </div>
    );
  }

  const gainers = [...(rankings?.rankings || [])].sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0)).slice(0, 5);
  const losers = [...(rankings?.rankings || [])].sort((a, b) => (a.overall_score ?? 0) - (b.overall_score ?? 0)).slice(0, 5);

  const strongBuyCount = signals?.strong_buy?.length || 0;
  const buyCount = signals?.buy?.length || 0;
  const holdCount = signals?.hold?.length || 0;
  const sellCount = (signals?.sell?.length || 0) + (signals?.strong_sell?.length || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-1">تحليل تاسي</h1>
        <p className="text-gray-400 text-sm">منصة تحليل الأسهم السعودية بالذكاء الاصطناعي</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-tasi-gold">{stats?.total_stocks || 0}</p>
          <p className="text-xs text-gray-400">سهم مغطى</p>
        </div>
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{strongBuyCount + buyCount}</p>
          <p className="text-xs text-gray-400">إشارة شراء</p>
        </div>
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{holdCount}</p>
          <p className="text-xs text-gray-400">احتفاظ</p>
        </div>
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{sellCount}</p>
          <p className="text-xs text-gray-400">إشارة بيع</p>
        </div>
      </div>

      {/* Signal Distribution */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-lg font-bold text-white mb-3">توزيع الإشارات</h2>
        <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
          {[
            { key: 'strong_buy', count: strongBuyCount, color: 'bg-emerald-500' },
            { key: 'buy', count: buyCount, color: 'bg-green-500' },
            { key: 'hold', count: holdCount, color: 'bg-yellow-500' },
            { key: 'sell', count: signals?.sell?.length || 0, color: 'bg-orange-500' },
            { key: 'strong_sell', count: signals?.strong_sell?.length || 0, color: 'bg-red-500' },
          ].map((s) => {
            const total = stats?.total_stocks || 1;
            const width = Math.max((s.count / total) * 100, s.count > 0 ? 4 : 0);
            return (
              <div
                key={s.key}
                className={`${s.color} flex items-center justify-center text-xs text-white font-bold transition-all`}
                style={{ width: `${width}%` }}
                title={`${signalLabels[s.key]}: ${s.count}`}
              >
                {s.count > 0 && s.count}
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-2 justify-center text-xs text-gray-400">
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 ml-1" />شراء قوي</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 ml-1" />شراء</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 ml-1" />احتفاظ</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-orange-500 ml-1" />بيع</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1" />بيع قوي</span>
        </div>
      </div>

      {/* Sector Heatmap */}
      {sectors?.sectors && <SectorHeatmap sectors={sectors.sectors} />}

      {/* Top Gainers & Losers */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-lg font-bold text-emerald-400 mb-3">🔼 أعلى التقييمات</h2>
          <div className="space-y-2">
            {gainers.map((stock, i) => (
              <Link
                key={stock.symbol}
                href={`/stock/${stock.symbol}`}
                className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-tasi-gold font-bold text-sm w-5">{i + 1}</span>
                  <div>
                    <p className="text-white text-sm font-medium">{stock.name}</p>
                    <p className="text-gray-500 text-xs">{stock.symbol}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">{stock.overall_score?.toFixed(1)}</span>
                  <SignalBadge signal={stock.entry_signal} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-lg font-bold text-red-400 mb-3">🔽 أدنى التقييمات</h2>
          <div className="space-y-2">
            {losers.map((stock, i) => (
              <Link
                key={stock.symbol}
                href={`/stock/${stock.symbol}`}
                className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-bold text-sm w-5">{i + 1}</span>
                  <div>
                    <p className="text-white text-sm font-medium">{stock.name}</p>
                    <p className="text-gray-500 text-xs">{stock.symbol}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-400 font-bold">{stock.overall_score?.toFixed(1)}</span>
                  <SignalBadge signal={stock.entry_signal} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
