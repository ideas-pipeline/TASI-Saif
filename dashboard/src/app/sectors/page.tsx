import { getSectorReports } from '../../lib/api';
import {
  getSectorArabic, trendLabels, trendColors, signalLabels, signalColors,
  formatPrice, formatPercent, formatMarketCap, formatLargeNumber,
  rotationSignalLabels, rotationSignalColors, periodArabicLabels, riskLabels,
} from '../../lib/arabic';
import Disclaimer from '../../components/Disclaimer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SectorsPage() {
  let data;
  try {
    data = await getSectorReports();
  } catch {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-bold text-tasi-gold mb-2">تقارير القطاعات</h1>
        <p className="text-gray-400 mb-4">لا توجد تقارير قطاعات بعد</p>
        <p className="text-gray-500 text-sm">
          شغّل: <code className="bg-tasi-card px-2 py-1 rounded text-xs">node src/cli.js sectors</code>
        </p>
      </div>
    );
  }

  const { date, sectors, rotation } = data;
  const sortedSectors = [...sectors].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-arabic">تقارير القطاعات</h1>
          <p className="text-gray-400 text-sm mt-1 font-arabic">
            تحليل شامل لجميع قطاعات تداول مع إشارات التدوير والأرباح الفصلية
          </p>
        </div>
        <div className="text-left">
          <p className="text-xs text-gray-500">تاريخ التحليل</p>
          <p className="text-sm font-bold text-tasi-gold">{date || '—'}</p>
        </div>
      </div>

      {/* Sector Rotation Signals */}
      {rotation.length > 0 && (
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-lg font-bold text-white mb-3 font-arabic">إشارات تدوير القطاعات</h2>
          <p className="text-gray-400 text-xs mb-4 font-arabic">
            مبنية على الزخم ونسبة إشارات الشراء والأداء السعري
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-tasi-border">
                  <th className="text-right py-2 font-arabic">القطاع</th>
                  <th className="text-center py-2 font-arabic">الإشارة</th>
                  <th className="text-center py-2">الزخم</th>
                  <th className="text-center py-2 font-arabic">نسبة الشراء</th>
                  <th className="text-center py-2 font-arabic">التقييم</th>
                  <th className="text-center py-2 font-arabic">الاتجاه</th>
                  <th className="text-center py-2 font-arabic">أسبوع</th>
                  <th className="text-center py-2 font-arabic">شهر</th>
                </tr>
              </thead>
              <tbody>
                {rotation.map((r) => (
                  <tr key={r.sector} className="border-b border-tasi-border/50 hover:bg-white/5">
                    <td className="py-2 text-white font-arabic font-bold">{getSectorArabic(r.sector)}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${rotationSignalColors[r.signal] || 'text-gray-400'}`}>
                        {rotationSignalLabels[r.signal] || r.signal}
                      </span>
                    </td>
                    <td className={`py-2 text-center font-mono ${r.momentum > 0 ? 'text-green-400' : r.momentum < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {r.momentum > 0 ? '+' : ''}{r.momentum}
                    </td>
                    <td className="py-2 text-center text-gray-300">{(r.buyRatio * 100).toFixed(0)}%</td>
                    <td className="py-2 text-center text-tasi-gold font-bold">{r.avgScore ?? '—'}</td>
                    <td className={`py-2 text-center font-arabic ${trendColors[r.trend] || 'text-gray-400'}`}>
                      {trendLabels[r.trend] || r.trend}
                    </td>
                    <td className={`py-2 text-center font-mono ${(r.priceReturn1w ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {r.priceReturn1w != null ? `${r.priceReturn1w > 0 ? '+' : ''}${r.priceReturn1w}%` : '—'}
                    </td>
                    <td className={`py-2 text-center font-mono ${(r.priceReturn1m ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {r.priceReturn1m != null ? `${r.priceReturn1m > 0 ? '+' : ''}${r.priceReturn1m}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sector Comparison Overview */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-lg font-bold text-white mb-3 font-arabic">مقارنة القطاعات</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedSectors.map((s) => (
            <SectorCard key={s.sector} sector={s} />
          ))}
        </div>
      </div>

      {/* Detailed Sector Reports */}
      {sortedSectors.map((s) => (
        <SectorDetailCard key={s.sector} sector={s} />
      ))}

      <Disclaimer />
    </div>
  );
}

function SectorCard({ sector: s }: { sector: any }) {
  const perf1w = s.pricePerformance?.['1w']?.avgReturn;
  const perf1m = s.pricePerformance?.['1m']?.avgReturn;

  return (
    <div className="bg-tasi-bg border border-tasi-border rounded-lg p-4 hover:border-tasi-gold/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white font-bold font-arabic">{getSectorArabic(s.sector)}</h3>
        <span className={`text-xs px-2 py-0.5 rounded font-arabic ${trendColors[s.trend]} bg-white/5`}>
          {trendLabels[s.trend] || s.trend}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Metric label="التقييم" value={s.avgScore != null ? `${s.avgScore}/10` : '—'} highlight />
        <Metric label="RSI" value={s.avgRsi != null ? String(s.avgRsi) : '—'} />
        <Metric label="P/E" value={s.avgPe != null ? String(s.avgPe) : '—'} />
        <Metric label="الأسهم" value={String(s.stockCount)} />
        <Metric
          label="أسبوع"
          value={perf1w != null ? `${perf1w > 0 ? '+' : ''}${perf1w}%` : '—'}
          positive={perf1w != null ? perf1w >= 0 : undefined}
        />
        <Metric
          label="شهر"
          value={perf1m != null ? `${perf1m > 0 ? '+' : ''}${perf1m}%` : '—'}
          positive={perf1m != null ? perf1m >= 0 : undefined}
        />
      </div>
      {s.topPerformers?.[0] && (
        <div className="mt-2 pt-2 border-t border-tasi-border/50">
          <p className="text-xs text-gray-500 font-arabic">الأفضل أداء</p>
          <Link href={`/stock/${encodeURIComponent(s.topPerformers[0].symbol)}`} className="text-tasi-gold text-sm hover:underline">
            {s.topPerformers[0].name} ({s.topPerformers[0].score}/10)
          </Link>
        </div>
      )}
    </div>
  );
}

function SectorDetailCard({ sector: s }: { sector: any }) {
  return (
    <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white font-arabic">{getSectorArabic(s.sector)}</h2>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-arabic ${trendColors[s.trend]}`}>
            {trendLabels[s.trend] || s.trend}
          </span>
          <span className="text-tasi-gold font-bold">{s.avgScore}/10</span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
        <MetricBox label="متوسط الفني" value={s.avgTechnical} suffix="/10" />
        <MetricBox label="متوسط الأساسي" value={s.avgFundamental} suffix="/10" />
        <MetricBox label="متوسط RSI" value={s.avgRsi} />
        <MetricBox label="متوسط P/E" value={s.avgPe} />
        <MetricBox label="عائد التوزيعات" value={s.avgDividendYield} suffix="%" />
        <MetricBox label="القيمة السوقية" value={s.totalMarketCap ? formatMarketCap(s.totalMarketCap) : '—'} raw />
      </div>

      {/* Price Performance */}
      {s.pricePerformance && (
        <div className="mb-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2 font-arabic">الأداء السعري</h3>
          <div className="grid grid-cols-4 gap-2">
            {['1w', '2w', '1m', '3m'].map((period) => {
              const perf = s.pricePerformance?.[period];
              return (
                <div key={period} className="bg-tasi-bg rounded p-2 text-center">
                  <p className="text-xs text-gray-500 font-arabic">{periodArabicLabels[period] || period}</p>
                  <p className={`text-sm font-bold font-mono ${perf?.avgReturn != null ? (perf.avgReturn >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`}>
                    {perf?.avgReturn != null ? `${perf.avgReturn > 0 ? '+' : ''}${perf.avgReturn}%` : '—'}
                  </p>
                  {perf?.positiveRatio != null && (
                    <p className="text-xs text-gray-500">{(perf.positiveRatio * 100).toFixed(0)}% ايجابي</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Signal Distribution */}
      {s.signalDistribution && Object.keys(s.signalDistribution).length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2 font-arabic">توزيع الإشارات</h3>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(s.signalDistribution).map(([signal, count]) => (
              <span key={signal} className={`${signalColors[signal] || 'bg-gray-600'} text-white text-xs px-2 py-1 rounded`}>
                {signalLabels[signal] || signal}: {count as number}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top & Bottom Performers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-green-400 mb-2 font-arabic">الأفضل أداء</h3>
          <div className="space-y-1">
            {s.topPerformers?.map((stock: any) => (
              <Link
                key={stock.symbol}
                href={`/stock/${encodeURIComponent(stock.symbol)}`}
                className="flex items-center justify-between bg-tasi-bg rounded px-3 py-2 hover:bg-white/5 transition-colors"
              >
                <span className="text-white text-sm">{stock.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-tasi-gold text-sm font-bold">{stock.score}/10</span>
                  {stock.signal && (
                    <span className={`${signalColors[stock.signal] || 'bg-gray-600'} text-white text-xs px-1.5 py-0.5 rounded`}>
                      {signalLabels[stock.signal] || stock.signal}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-bold text-red-400 mb-2 font-arabic">الأضعف أداء</h3>
          <div className="space-y-1">
            {s.bottomPerformers?.map((stock: any) => (
              <Link
                key={stock.symbol}
                href={`/stock/${encodeURIComponent(stock.symbol)}`}
                className="flex items-center justify-between bg-tasi-bg rounded px-3 py-2 hover:bg-white/5 transition-colors"
              >
                <span className="text-white text-sm">{stock.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-tasi-gold text-sm font-bold">{stock.score}/10</span>
                  {stock.signal && (
                    <span className={`${signalColors[stock.signal] || 'bg-gray-600'} text-white text-xs px-1.5 py-0.5 rounded`}>
                      {signalLabels[stock.signal] || stock.signal}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Quarterly Earnings */}
      {s.quarterlyEarnings?.quarters?.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2 font-arabic">الأرباح الفصلية</h3>
          {s.quarterlyEarnings.yoyGrowth && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              <YoYMetric label="نمو الإيرادات (سنوي)" value={s.quarterlyEarnings.yoyGrowth.revenueGrowth} />
              <YoYMetric label="نمو صافي الدخل (سنوي)" value={s.quarterlyEarnings.yoyGrowth.netIncomeGrowth} />
              <YoYMetric label="تغير الهامش" value={s.quarterlyEarnings.yoyGrowth.marginChange} suffix="نقطة" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-tasi-border">
                  <th className="text-right py-1 font-arabic">الفترة</th>
                  <th className="text-center py-1 font-arabic">الإيرادات</th>
                  <th className="text-center py-1 font-arabic">صافي الدخل</th>
                  <th className="text-center py-1 font-arabic">هامش صافي</th>
                  <th className="text-center py-1 font-arabic">الشركات</th>
                </tr>
              </thead>
              <tbody>
                {s.quarterlyEarnings.quarters.slice(0, 4).map((q: any) => (
                  <tr key={q.periodEnd} className="border-b border-tasi-border/50">
                    <td className="py-1 text-gray-300">{q.periodEnd}</td>
                    <td className="py-1 text-center text-gray-300">{q.revenue ? formatLargeNumber(q.revenue) : '—'}</td>
                    <td className={`py-1 text-center ${q.netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {q.netIncome ? formatLargeNumber(q.netIncome) : '—'}
                    </td>
                    <td className="py-1 text-center text-gray-300">
                      {q.avgNetMargin != null ? `${(q.avgNetMargin * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-1 text-center text-gray-500">{q.reportingCompanies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Stocks Table */}
      <div>
        <h3 className="text-sm font-bold text-gray-400 mb-2 font-arabic">جميع أسهم القطاع</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-tasi-border text-xs">
                <th className="text-right py-1.5 font-arabic">السهم</th>
                <th className="text-center py-1.5 font-arabic">التقييم</th>
                <th className="text-center py-1.5 font-arabic">فني</th>
                <th className="text-center py-1.5 font-arabic">أساسي</th>
                <th className="text-center py-1.5 font-arabic">الإشارة</th>
                <th className="text-center py-1.5 font-arabic">المخاطر</th>
                <th className="text-center py-1.5">RSI</th>
                <th className="text-center py-1.5">P/E</th>
                <th className="text-center py-1.5 font-arabic">السعر</th>
              </tr>
            </thead>
            <tbody>
              {s.stocks?.map((stock: any) => (
                <tr key={stock.symbol} className="border-b border-tasi-border/30 hover:bg-white/5">
                  <td className="py-1.5">
                    <Link href={`/stock/${encodeURIComponent(stock.symbol)}`} className="text-tasi-gold hover:underline">
                      {stock.name}
                    </Link>
                    <span className="text-gray-500 text-xs mr-1">{stock.symbol}</span>
                  </td>
                  <td className="py-1.5 text-center text-white font-bold">{stock.score ?? '—'}</td>
                  <td className="py-1.5 text-center text-gray-300">{stock.technical ?? '—'}</td>
                  <td className="py-1.5 text-center text-gray-300">{stock.fundamental ?? '—'}</td>
                  <td className="py-1.5 text-center">
                    {stock.signal && (
                      <span className={`${signalColors[stock.signal] || 'bg-gray-600'} text-white text-xs px-1.5 py-0.5 rounded`}>
                        {signalLabels[stock.signal] || stock.signal}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-center text-xs font-arabic text-gray-400">
                    {riskLabels[stock.risk] || stock.risk || '—'}
                  </td>
                  <td className="py-1.5 text-center text-gray-300 font-mono text-xs">{stock.rsi ?? '—'}</td>
                  <td className="py-1.5 text-center text-gray-300 font-mono text-xs">{stock.pe ?? '—'}</td>
                  <td className="py-1.5 text-center text-gray-300 font-mono">{stock.price ? formatPrice(stock.price) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight, positive }: { label: string; value: string; highlight?: boolean; positive?: boolean }) {
  let valueColor = 'text-gray-300';
  if (highlight) valueColor = 'text-tasi-gold';
  else if (positive === true) valueColor = 'text-green-400';
  else if (positive === false) valueColor = 'text-red-400';

  return (
    <div>
      <p className="text-xs text-gray-500 font-arabic">{label}</p>
      <p className={`text-sm font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

function MetricBox({ label, value, suffix, raw }: { label: string; value: any; suffix?: string; raw?: boolean }) {
  const display = raw ? value : (value != null ? `${value}${suffix || ''}` : '—');
  return (
    <div className="bg-tasi-bg rounded p-2 text-center">
      <p className="text-xs text-gray-500 font-arabic">{label}</p>
      <p className="text-sm font-bold text-white">{display}</p>
    </div>
  );
}

function YoYMetric({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <div className="bg-tasi-bg rounded p-2 text-center">
      <p className="text-xs text-gray-500 font-arabic">{label}</p>
      <p className={`text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
        {isPositive ? '+' : ''}{value}%{suffix ? ` ${suffix}` : ''}
      </p>
    </div>
  );
}
