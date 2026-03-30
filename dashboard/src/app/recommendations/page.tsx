import { getSignals, getRankings } from '../../lib/api';
import { signalLabels, signalColors, getSectorArabic, riskLabels, riskColors } from '../../lib/arabic';
import SignalBadge from '../../components/SignalBadge';
import ScoreBar from '../../components/ScoreBar';
import Disclaimer from '../../components/Disclaimer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage() {
  let signals, rankings;
  try {
    [signals, rankings] = await Promise.all([getSignals(), getRankings(20)]);
  } catch {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-bold text-red-400 mb-2">خطأ في الاتصال</h1>
        <p className="text-gray-400">تعذر الاتصال بخادم البيانات</p>
      </div>
    );
  }

  const topOpportunities = (rankings?.rankings || []).filter(
    (s) => s.entry_signal === 'strong_buy' || s.entry_signal === 'buy'
  );

  const signalGroups = [
    { key: 'strong_buy', stocks: signals?.strong_buy || [] },
    { key: 'buy', stocks: signals?.buy || [] },
    { key: 'hold', stocks: signals?.hold || [] },
    { key: 'sell', stocks: signals?.sell || [] },
    { key: 'strong_sell', stocks: signals?.strong_sell || [] },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">التوصيات</h1>

      {/* Top AI Opportunities */}
      {topOpportunities.length > 0 && (
        <div className="bg-tasi-card border border-emerald-700/30 rounded-lg p-4">
          <h2 className="text-lg font-bold text-emerald-400 mb-1">أفضل الفرص الاستثمارية</h2>
          <p className="text-xs text-gray-500 mb-4">مرتبة حسب التقييم الإجمالي (فني + أساسي + ذكاء اصطناعي)</p>

          <div className="space-y-3">
            {topOpportunities.map((stock, i) => (
              <Link
                key={stock.symbol}
                href={`/stock/${stock.symbol}`}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-tasi-gold font-bold text-lg w-8 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white text-sm">{stock.name}</span>
                    <SignalBadge signal={stock.entry_signal} />
                    <span className={`text-xs ${riskColors[stock.risk_level || 'medium']}`}>
                      {riskLabels[stock.risk_level || 'medium']}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{stock.symbol} · {getSectorArabic(stock.sector)}</p>
                  <div className="mt-1">
                    <ScoreBar score={stock.overall_score} />
                  </div>
                  {stock.signal_reasoning && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{stock.signal_reasoning}</p>
                  )}
                </div>
                <span className="text-2xl font-bold text-emerald-400">{stock.overall_score?.toFixed(1)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Signal Groups */}
      <div className="space-y-4">
        {signalGroups.map(({ key, stocks }) => (
          <div key={key} className="bg-tasi-card border border-tasi-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${signalColors[key]}`} />
                <h2 className="text-sm font-bold text-white">{signalLabels[key]}</h2>
              </div>
              <span className="text-xs text-gray-500">{stocks.length} سهم</span>
            </div>

            {stocks.length === 0 ? (
              <p className="text-gray-600 text-xs">لا توجد أسهم</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {stocks.map((stock) => (
                  <Link
                    key={stock.symbol}
                    href={`/stock/${stock.symbol}`}
                    className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors"
                  >
                    <div>
                      <p className="text-white text-sm">{stock.name}</p>
                      <p className="text-gray-500 text-xs">{stock.symbol}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-300">{stock.overall_score?.toFixed(1)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Disclaimer />
    </div>
  );
}
