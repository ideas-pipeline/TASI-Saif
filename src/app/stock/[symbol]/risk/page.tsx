import { getRiskAnalysis } from '../../../../lib/api';
import {
  getSectorArabic, formatPrice, formatPercent,
  riskLabels, riskColors, riskMetricLabels,
  stressScenarioLabels, severityLabels, severityColors,
} from '../../../../lib/arabic';
import Disclaimer from '../../../../components/Disclaimer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function RiskGauge({ value, label, description }: { value: number | null; label: string; description: string }) {
  if (value == null) return (
    <div className="text-center p-3">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-gray-400 text-lg font-bold">—</p>
      <p className="text-gray-600 text-xs">{description}</p>
    </div>
  );

  return (
    <div className="text-center p-3">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className={`text-lg font-bold ltr-nums ${value > 1 ? 'text-emerald-400' : value > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
        {value.toFixed(3)}
      </p>
      <p className="text-gray-600 text-xs">{description}</p>
    </div>
  );
}

export default async function RiskAnalysisPage({ params }: { params: { symbol: string } }) {
  let data;
  try {
    data = await getRiskAnalysis(params.symbol);
  } catch {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-bold text-red-400 mb-2">تحليل المخاطر غير متاح</h1>
        <p className="text-gray-400 mb-4">تعذر تحميل تحليل المخاطر للسهم {params.symbol}</p>
        <Link href={`/stock/${params.symbol}`} className="text-tasi-gold hover:underline">العودة لتف��صيل السهم</Link>
      </div>
    );
  }

  const risk = data.riskLevel || 'medium';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white">تحليل المخاطر</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
            risk === 'high' ? 'bg-red-500/20 text-red-400' :
            risk === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            {riskLabels[risk] || risk}
          </span>
        </div>
        <p className="text-gray-400 text-sm">
          {data.name} ({data.symbol}) · {getSectorArabic(data.sector)} · {formatPrice(data.latestPrice)} ر.س
        </p>
        <div className="flex gap-3 mt-3">
          <Link href={`/stock/${data.symbol}`} className="text-sm text-tasi-gold hover:underline">← تفاصيل السهم</Link>
          <Link href={`/stock/${data.symbol}/financials`} className="text-sm text-tasi-gold hover:underline">التقارير المالية</Link>
        </div>
      </div>

      {/* Risk-Adjusted Returns */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-sm font-bold text-gray-300 mb-3">العوائد المعدلة بالمخاطر</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <RiskGauge value={data.sharpeRatio} label={riskMetricLabels.sharpe_ratio} description="> 1 جيد، > 2 ممتاز" />
          <RiskGauge value={data.sortinoRatio} label={riskMetricLabels.sortino_ratio} description="> 1 جيد، > 2 م��تاز" />
          <div className="text-center p-3">
            <p className="text-gray-500 text-xs">{riskMetricLabels.volatility}</p>
            <p className={`text-lg font-bold ltr-nums ${
              (data.volatility || 0) > 0.4 ? 'text-red-400' : (data.volatility || 0) > 0.25 ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {data.volatility != null ? `${(data.volatility * 100).toFixed(1)}٪` : '—'}
            </p>
            <p className="text-gray-600 text-xs">&lt; 25٪ منخفض</p>
          </div>
          <div className="text-center p-3">
            <p className="text-gray-500 text-xs">{riskMetricLabels.beta}</p>
            <p className={`text-lg font-bold ltr-nums ${
              (data.beta || 1) > 1.3 ? 'text-red-400' : (data.beta || 1) > 0.8 ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {data.beta?.toFixed(2) ?? '���'}
            </p>
            <p className="text-gray-600 text-xs">1.0 = السوق</p>
          </div>
        </div>
      </div>

      {/* Maximum Drawdown */}
      {data.maxDrawdown && (
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3">{riskMetricLabels.max_drawdown}</h2>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-red-400 ltr-nums">
                {(data.maxDrawdown.value * 100).toFixed(1)}٪
              </p>
              <p className="text-gray-500 text-xs mt-1">أقصى تراجع من القمة</p>
            </div>
            <div className="flex-1 text-sm text-gray-400">
              <p>القمة: <span className="text-white ltr-nums">{data.maxDrawdown.peakDate}</span></p>
              <p>القاع: <span className="text-white ltr-nums">{data.maxDrawdown.troughDate}</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Value at Risk */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-sm font-bold text-gray-300 mb-3">القيمة المع��ضة للخطر (VaR)</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Daily VaR */}
          <div>
            <h3 className="text-xs text-gray-500 mb-2">يومي (1 يوم)</h3>
            <div className="space-y-2">
              {data.var?.daily?.map(v => (
                <div key={v.confidence} className="flex justify-between items-center bg-gray-800/50 rounded p-2">
                  <span className="text-gray-400 text-sm">{(v.confidence * 100).toFixed(0)}٪ ثقة</span>
                  <div className="text-end">
                    <span className="text-red-400 font-bold ltr-nums">{(v.var * 100).toFixed(2)}٪</span>
                    <span className="text-gray-600 text-xs mx-1">VaR</span>
                    <span className="text-orange-400 font-bold ltr-nums">{(v.cvar * 100).toFixed(2)}٪</span>
                    <span className="text-gray-600 text-xs mr-1">CVaR</span>
                  </div>
                </div>
              )) || <p className="text-gray-500 text-sm">لا توجد بيانات كاف��ة</p>}
            </div>
          </div>
          {/* 10-Day VaR */}
          <div>
            <h3 className="text-xs text-gray-500 mb-2">10 أيام</h3>
            <div className="space-y-2">
              {data.var?.tenDay?.map(v => (
                <div key={v.confidence} className="flex justify-between items-center bg-gray-800/50 rounded p-2">
                  <span className="text-gray-400 text-sm">{(v.confidence * 100).toFixed(0)}٪ ثقة</span>
                  <div className="text-end">
                    <span className="text-red-400 font-bold ltr-nums">{(v.var * 100).toFixed(2)}٪</span>
                    <span className="text-gray-600 text-xs mx-1">VaR</span>
                    <span className="text-orange-400 font-bold ltr-nums">{(v.cvar * 100).toFixed(2)}٪</span>
                    <span className="text-gray-600 text-xs mr-1">CVaR</span>
                  </div>
                </div>
              )) || <p className="text-gray-500 text-sm">لا تو��د بيانات كافية</p>}
            </div>
          </div>
        </div>
        <p className="text-gray-600 text-xs mt-3">
          VaR = أقصى خسارة متوقعة بمستوى ثقة محدد | CVaR = متوسط الخسارة في أسوأ السيناريوهات
        </p>
      </div>

      {/* Stress Tests */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-sm font-bold text-gray-300 mb-3">اختبارات الضغط</h2>
        <div className="space-y-2">
          {data.stressTests?.map(test => (
            <div key={test.scenario} className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-800/50 rounded p-3 gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">
                    {stressScenarioLabels[test.scenario] || test.scenarioAr}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    test.severity === 'severe' ? 'bg-red-500/20 text-red-400' :
                    test.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    test.severity === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {severityLabels[test.severity] || test.severity}
                  </span>
                </div>
                <p className="text-gray-500 text-xs mt-0.5">{test.description}</p>
              </div>
              <div className="text-end sm:text-end flex sm:flex-col gap-3 sm:gap-0">
                <p className="text-red-400 font-bold ltr-nums">-{(test.lossPct * 100).toFixed(1)}٪</p>
                <p className="text-gray-400 text-xs ltr-nums">{formatPrice(test.projectedPrice)} ر.س</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
