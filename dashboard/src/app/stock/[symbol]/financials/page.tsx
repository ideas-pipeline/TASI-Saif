import { getFinancials } from '../../../../lib/api';
import {
  getSectorArabic, formatLargeNumber, formatMarginPercent, formatRatio,
  financialLabels, valuationLabels, periodLabels,
} from '../../../../lib/arabic';
import Disclaimer from '../../../../components/Disclaimer';
import Link from 'next/link';

export function generateStaticParams() {
  return [
    "1010.SR","1020.SR","1030.SR","1050.SR","1060.SR","1080.SR","1120.SR","1140.SR","1150.SR","1180.SR","1210.SR","1211.SR","1212.SR","2010.SR","2222.SR"
  ].map(symbol => ({ symbol }));
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-500">—</span>;
  const pct = (value * 100).toFixed(1);
  const isPositive = value >= 0;
  return (
    <span className={`text-xs font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPositive ? '▲' : '▼'} {Math.abs(parseFloat(pct))}٪
    </span>
  );
}

function ValuationCard({ label, value, format }: { label: string; value: number | null; format: 'ratio' | 'percent' }) {
  return (
    <div className="bg-tasi-card border border-tasi-border rounded-lg p-3 text-center">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className="text-white font-bold text-lg ltr-nums">
        {format === 'percent' ? formatMarginPercent(value) : formatRatio(value)}
      </p>
    </div>
  );
}

export default async function FinancialsPage({ params }: { params: { symbol: string } }) {
  let data;
  try {
    data = await getFinancials(params.symbol);
  } catch {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-bold text-red-400 mb-2">البيانات المالية غير متوفرة</h1>
        <p className="text-gray-400 mb-4">تعذر تحميل التقارير المالية لـ {params.symbol}</p>
        <Link href={`/stock/${params.symbol}`} className="text-tasi-gold hover:underline">العودة لصفحة السهم</Link>
      </div>
    );
  }

  const { stock, reports, valuation, yoyComparisons } = data;
  const quarterly = reports.filter(r => r.period_type === 'quarterly');
  const annual = reports.filter(r => r.period_type === 'annual');

  const incomeKeys = ['total_revenue', 'cost_of_revenue', 'gross_profit', 'operating_income', 'net_income', 'ebitda'] as const;
  const marginKeys = ['gross_margin', 'operating_margin', 'net_margin'] as const;
  const balanceKeys = ['total_assets', 'total_liabilities', 'total_equity', 'total_debt', 'total_cash', 'current_assets', 'current_liabilities'] as const;
  const cashKeys = ['operating_cash_flow', 'capital_expenditure', 'free_cash_flow'] as const;

  function renderTable(title: string, keys: readonly string[], data: typeof quarterly) {
    if (data.length === 0) return null;
    return (
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-gray-300 mb-3">{title}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tasi-border">
              <th className="text-right text-gray-500 py-2 pr-2 min-w-[140px]">البند</th>
              {data.map(r => (
                <th key={r.period_end} className="text-center text-gray-400 py-2 px-2 ltr-nums min-w-[100px]">
                  {r.period_end.slice(0, 7)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map(key => (
              <tr key={key} className="border-b border-tasi-border/30 hover:bg-white/5">
                <td className="text-gray-400 py-2 pr-2">{financialLabels[key] || key}</td>
                {data.map(r => {
                  const val = (r as unknown as Record<string, number | null>)[key];
                  const isMargin = key.includes('margin');
                  return (
                    <td key={r.period_end} className={`text-center py-2 px-2 ltr-nums ${val != null && val < 0 ? 'text-red-400' : 'text-white'}`}>
                      {isMargin ? formatMarginPercent(val) : formatLargeNumber(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/stock/${stock.symbol}`} className="text-tasi-gold hover:underline text-sm">
              ← {stock.name}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white">التقارير المالية</h1>
          <p className="text-gray-400 text-sm">
            {stock.symbol} · {getSectorArabic(stock.sector)}
          </p>
        </div>
      </div>

      {/* Valuation Metrics */}
      {valuation && (
        <div>
          <h2 className="text-sm font-bold text-gray-300 mb-3">مؤشرات التقييم</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <ValuationCard label={valuationLabels.pe} value={valuation.pe} format="ratio" />
            <ValuationCard label={valuationLabels.pb} value={valuation.pb} format="ratio" />
            <ValuationCard label={valuationLabels.ps} value={valuation.ps} format="ratio" />
            <ValuationCard label={valuationLabels.evToEbitda} value={valuation.evToEbitda} format="ratio" />
            <ValuationCard label={valuationLabels.dividendYield} value={valuation.dividendYield} format="percent" />
            <ValuationCard label={valuationLabels.roe} value={valuation.roe} format="percent" />
            <ValuationCard label={valuationLabels.roa} value={valuation.roa} format="percent" />
            <ValuationCard label={valuationLabels.debtToEquity} value={valuation.debtToEquity} format="ratio" />
            <ValuationCard label={valuationLabels.currentRatio} value={valuation.currentRatio} format="ratio" />
          </div>
        </div>
      )}

      {/* YoY Growth Summary */}
      {yoyComparisons.length > 0 && yoyComparisons.some(c => c.yoy) && (
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-3">النمو مقارنة بالعام السابق</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {yoyComparisons.filter(c => c.yoy).slice(0, 4).map(c => (
              <div key={c.periodEnd} className="text-center">
                <p className="text-gray-500 text-xs ltr-nums mb-2">{c.periodEnd.slice(0, 7)}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">الإيرادات</span>
                    <GrowthBadge value={c.yoy!.revenueGrowth} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">صافي الدخل</span>
                    <GrowthBadge value={c.yoy!.netIncomeGrowth} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">تغير الهامش</span>
                    <GrowthBadge value={c.yoy!.marginChange} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quarterly Income Statement */}
      {renderTable('قائمة الدخل — ربع سنوي', incomeKeys, quarterly)}

      {/* Quarterly Margins */}
      {renderTable('الهوامش — ربع سنوي', marginKeys, quarterly)}

      {/* Quarterly Balance Sheet */}
      {renderTable('الميزانية العمومية — ربع سنوي', balanceKeys, quarterly)}

      {/* Quarterly Cash Flow */}
      {renderTable('التدفقات النقدية — ربع سنوي', cashKeys, quarterly)}

      {/* Annual Income Statement */}
      {renderTable('قائمة الدخل — سنوي', incomeKeys, annual)}

      {/* Annual Balance Sheet */}
      {renderTable('الميزانية العمومية — سنوي', balanceKeys, annual)}

      {/* Annual Cash Flow */}
      {renderTable('التدفقات النقدية — سنوي', cashKeys, annual)}

      {reports.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">لا تتوفر تقارير مالية حالياً</p>
          <p className="text-gray-500 text-sm mt-1">قم بتشغيل <code className="text-tasi-gold">node src/cli.js financials</code> لجلب البيانات</p>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
