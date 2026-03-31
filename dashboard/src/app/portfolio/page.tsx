import { getPortfolio } from '../../lib/api';
import { getSectorArabic, signalLabels, signalColors, formatPrice, formatPercent } from '../../lib/arabic';
import Disclaimer from '../../components/Disclaimer';
import SignalBadge from '../../components/SignalBadge';
import Link from 'next/link';
import PortfolioCharts from './PortfolioCharts';

export default async function PortfolioPage() {
  let portfolio;
  try {
    portfolio = await getPortfolio();
  } catch {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-bold text-tasi-gold mb-2">المحفظة النموذجية</h1>
        <p className="text-gray-400 mb-4">لا توجد بيانات محفظة متاحة حالياً</p>
      </div>
    );
  }

  const { holdings, performance, sectorAllocation, summary, rebalance } = portfolio;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">المحفظة النموذجية</h1>
          <p className="text-gray-400 text-sm mt-1">
            محفظة ذكاء اصطناعي مبنية على التحليل الفني والأساسي والمخاطر
          </p>
        </div>
        <div className="text-left">
          <p className="text-xs text-gray-500">آخر إعادة توازن</p>
          <p className="text-sm font-bold text-tasi-gold">{portfolio.rebalanceDate}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="عدد الأسهم"
          value={String(portfolio.stockCount)}
          sub={`التنويع: ${portfolio.diversificationScore?.toFixed(1) || '—'}/10`}
        />
        <SummaryCard
          label="أداء المحفظة"
          value={summary ? `${(summary.cumulativeReturn * 100).toFixed(2)}%` : '—'}
          sub="منذ إعادة التوازن"
          positive={summary ? summary.cumulativeReturn >= 0 : true}
        />
        <SummaryCard
          label="أداء تاسي"
          value={summary ? `${(summary.tasiReturn * 100).toFixed(2)}%` : '—'}
          sub="المؤشر المرجعي"
          positive={summary ? summary.tasiReturn >= 0 : true}
        />
        <SummaryCard
          label="العائد الزائد"
          value={summary ? `${(summary.excessReturn * 100).toFixed(2)}%` : '—'}
          sub="المحفظة مقابل تاسي"
          positive={summary ? summary.excessReturn >= 0 : true}
        />
      </div>

      {/* Performance Chart */}
      {performance && performance.length > 1 && (
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-lg font-bold text-white mb-4">أداء المحفظة مقابل تاسي</h2>
          <PortfolioCharts performance={performance} sectorAllocation={sectorAllocation} />
        </div>
      )}

      {/* Holdings Table */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-lg font-bold text-white mb-4">مكونات المحفظة</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tasi-border text-gray-400 text-xs">
                <th className="text-right py-2 px-2">السهم</th>
                <th className="text-right py-2 px-2">القطاع</th>
                <th className="text-center py-2 px-2">الوزن</th>
                <th className="text-center py-2 px-2">سعر الدخول</th>
                <th className="text-center py-2 px-2">السعر الحالي</th>
                <th className="text-center py-2 px-2">الربح/الخسارة</th>
                <th className="text-center py-2 px-2">التقييم</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.symbol} className="border-b border-tasi-border/50 hover:bg-white/5 transition-colors">
                  <td className="py-3 px-2">
                    <Link href={`/stock/${h.symbol}`} className="hover:text-tasi-gold transition-colors">
                      <p className="font-bold text-white">{h.name}</p>
                      <p className="text-xs text-gray-500">{h.symbol}</p>
                    </Link>
                  </td>
                  <td className="py-3 px-2 text-gray-400 text-xs">{getSectorArabic(h.sector)}</td>
                  <td className="py-3 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-16 bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-tasi-gold h-full rounded-full"
                          style={{ width: `${Math.min(100, h.weight * 100 / 0.15 * 100)}%` }}
                        />
                      </div>
                      <span className="text-white text-xs font-mono">{(h.weight * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center text-gray-300 font-mono text-xs">
                    {formatPrice(h.entry_price)}
                  </td>
                  <td className="py-3 px-2 text-center text-white font-mono text-xs">
                    {formatPrice(h.current_price)}
                  </td>
                  <td className={`py-3 px-2 text-center font-bold text-xs ${h.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {h.pnl >= 0 ? '+' : ''}{h.pnl.toFixed(2)}%
                  </td>
                  <td className="py-3 px-2 text-center text-xs">
                    <span className="text-white font-bold">{h.score_at_entry?.toFixed(1)}</span>
                    <span className="text-gray-500">/10</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sector Allocation */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-lg font-bold text-white mb-4">توزيع القطاعات</h2>
        <div className="space-y-2">
          {Object.entries(sectorAllocation)
            .sort(([, a], [, b]) => b - a)
            .map(([sector, weight]) => (
              <div key={sector} className="flex items-center gap-3">
                <span className="text-gray-300 text-sm w-40 text-right">{getSectorArabic(sector)}</span>
                <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-tasi-gold/80 h-full rounded-full transition-all"
                    style={{ width: `${weight * 100}%` }}
                  />
                </div>
                <span className="text-white text-sm font-mono w-14 text-left">{(weight * 100).toFixed(1)}%</span>
              </div>
            ))}
        </div>
      </div>

      {/* Rebalance Info */}
      {rebalance && (
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-lg font-bold text-white mb-3">آخر إعادة توازن</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rebalance.additions.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">أسهم مُضافة</p>
                <div className="space-y-1">
                  {rebalance.additions.map((s) => (
                    <span key={s} className="inline-block bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded mr-1">
                      + {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {rebalance.removals.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">أسهم محذوفة</p>
                <div className="space-y-1">
                  {rebalance.removals.map((s) => (
                    <span key={s} className="inline-block bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded mr-1">
                      - {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-2">معدل الدوران</p>
              <p className="text-white font-bold">{(rebalance.turnover * 100).toFixed(1)}%</p>
              {rebalance.reasoning && (
                <p className="text-xs text-gray-400 mt-1">{rebalance.reasoning}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Reasoning */}
      {portfolio.reasoning && (
        <div className="bg-tasi-card border border-blue-700/30 rounded-lg p-4">
          <h2 className="text-lg font-bold text-blue-400 mb-2">تحليل الذكاء الاصطناعي</h2>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{portfolio.reasoning}</p>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  positive = true,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${
        value.includes('%') ? (positive ? 'text-emerald-400' : 'text-red-400') : 'text-white'
      }`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
