import { getStock } from '../../../lib/api';
import { getSectorArabic, formatPrice, formatMarketCap, formatPercent, riskLabels, riskColors } from '../../../lib/arabic';
import PriceChart from '../../../components/PriceChart';
import RSIChart from '../../../components/RSIChart';
import MACDChart from '../../../components/MACDChart';
import ScoreBar from '../../../components/ScoreBar';
import SignalBadge from '../../../components/SignalBadge';
import WatchlistButton from '../../../components/WatchlistButton';
import Disclaimer from '../../../components/Disclaimer';
import Link from 'next/link';

export function generateStaticParams() {
  return [
    "1010.SR","1020.SR","1030.SR","1050.SR","1060.SR","1080.SR","1120.SR","1140.SR","1150.SR","1180.SR","1210.SR","1211.SR","1212.SR","2010.SR","2222.SR"
  ].map(symbol => ({ symbol }));
}

export default async function StockDetailPage({ params }: { params: { symbol: string } }) {
  let data;
  try {
    data = await getStock(params.symbol);
  } catch {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-bold text-red-400 mb-2">السهم غير موجود</h1>
        <p className="text-gray-400 mb-4">تعذر العثور على السهم {params.symbol}</p>
        <Link href="/screener" className="text-tasi-gold hover:underline">العودة لفرز الأسهم</Link>
      </div>
    );
  }

  const { stock, prices, indicators } = data;
  const lastPrice = prices.length > 0 ? prices[prices.length - 1] : null;
  const prevPrice = prices.length > 1 ? prices[prices.length - 2] : null;
  const change = lastPrice && prevPrice ? ((lastPrice.close - prevPrice.close) / prevPrice.close) * 100 : null;
  const risk = stock.risk_level || 'medium';

  const lastIndicator = indicators.length > 0 ? indicators[indicators.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{stock.name}</h1>
            <SignalBadge signal={stock.entry_signal} />
          </div>
          <p className="text-gray-400 text-sm">
            {stock.symbol} · {getSectorArabic(stock.sector)}
          </p>
          {lastPrice && (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl font-bold text-white ltr-nums">{formatPrice(lastPrice.close)}</span>
              <span className="text-sm text-gray-400">ر.س</span>
              {change !== null && (
                <span className={`text-sm font-bold ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}٪
                </span>
              )}
            </div>
          )}
        </div>
        <WatchlistButton symbol={stock.symbol} />
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <Link
          href={`/stock/${stock.symbol}/financials`}
          className="bg-tasi-card border border-tasi-border rounded-lg px-4 py-2 text-sm text-tasi-gold hover:bg-white/5 transition-colors"
        >
          التقارير المالية →
        </Link>
        <Link
          href={`/stock/${stock.symbol}/risk`}
          className="bg-tasi-card border border-tasi-border rounded-lg px-4 py-2 text-sm text-tasi-gold hover:bg-white/5 transition-colors"
        >
          تحليل المخاطر →
        </Link>
      </div>

      {/* Scores */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-sm font-bold text-gray-300 mb-3">التقييم</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <ScoreBar score={stock.overall_score} label="إجمالي" />
            <ScoreBar score={stock.technical_score} label="فني" />
            <ScoreBar score={stock.fundamental_score} label="أساسي" />
            <ScoreBar score={stock.ai_score} label="ذكاء" />
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>المخاطر</span>
              <span className={riskColors[risk]}>{riskLabels[risk] || risk}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>مكرر الربحية</span>
              <span className="text-white ltr-nums">{stock.pe_ratio?.toFixed(2) ?? '—'}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>ربحية السهم</span>
              <span className="text-white ltr-nums">{stock.eps?.toFixed(2) ?? '—'}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>التوزيعات</span>
              <span className="text-white">{stock.dividend_yield ? formatPercent(stock.dividend_yield) : '—'}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>القيمة السوقية</span>
              <span className="text-white">{formatMarketCap(stock.market_cap)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      {stock.signal_reasoning && (
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-2">تحليل الذكاء الاصطناعي</h2>
          <p className="text-gray-300 text-sm leading-relaxed">{stock.signal_reasoning}</p>
        </div>
      )}

      {/* Price Chart */}
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
        <h2 className="text-sm font-bold text-gray-300 mb-3">مخطط السعر</h2>
        <PriceChart prices={prices} indicators={indicators} showSMA showBollinger showVolume />
        <div className="flex gap-4 mt-2 text-xs text-gray-500 justify-center">
          <span><span className="inline-block w-3 h-0.5 bg-tasi-gold ml-1" />الإغلاق</span>
          <span><span className="inline-block w-3 h-0.5 bg-emerald-500 ml-1" />SMA 20</span>
          <span><span className="inline-block w-3 h-0.5 bg-yellow-500 ml-1" />SMA 50</span>
          <span><span className="inline-block w-3 h-0.5 bg-red-500 ml-1" />SMA 200</span>
        </div>
      </div>

      {/* Technical Indicators */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3">مؤشر القوة النسبية (RSI)</h2>
          <RSIChart indicators={indicators} />
        </div>
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3">مؤشر MACD</h2>
          <MACDChart indicators={indicators} />
        </div>
      </div>

      {/* Technical Summary */}
      {lastIndicator && (
        <div className="bg-tasi-card border border-tasi-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3">ملخص المؤشرات الفنية</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="text-center">
              <p className="text-gray-500 text-xs">RSI (14)</p>
              <p className={`font-bold ${(lastIndicator.rsi_14 ?? 50) > 70 ? 'text-red-400' : (lastIndicator.rsi_14 ?? 50) < 30 ? 'text-green-400' : 'text-white'}`}>
                {lastIndicator.rsi_14?.toFixed(1) ?? '—'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs">MACD</p>
              <p className={`font-bold ${(lastIndicator.macd ?? 0) > (lastIndicator.macd_signal ?? 0) ? 'text-green-400' : 'text-red-400'}`}>
                {lastIndicator.macd?.toFixed(3) ?? '—'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs">SMA 20</p>
              <p className="text-white font-bold ltr-nums">{lastIndicator.sma_20?.toFixed(2) ?? '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs">متوسط الحجم (20)</p>
              <p className="text-white font-bold ltr-nums">{lastIndicator.volume_avg_20 ? Math.round(lastIndicator.volume_avg_20).toLocaleString() : '—'}</p>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
