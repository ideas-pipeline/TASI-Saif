import Link from 'next/link';
import { Stock } from '../lib/api';
import { getSectorArabic, formatPrice, riskLabels, riskColors } from '../lib/arabic';
import SignalBadge from './SignalBadge';
import ScoreBar from './ScoreBar';

export default function StockCard({ stock }: { stock: Stock }) {
  const risk = stock.risk_level || 'medium';

  return (
    <Link href={`/stock/${stock.symbol}`} className="block">
      <div className="bg-tasi-card border border-tasi-border rounded-lg p-4 hover:border-tasi-gold/40 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-white text-sm">{stock.name}</h3>
            <p className="text-xs text-gray-500">{stock.symbol} · {getSectorArabic(stock.sector)}</p>
          </div>
          <SignalBadge signal={stock.entry_signal} />
        </div>

        <div className="space-y-1.5 mb-3">
          <ScoreBar score={stock.overall_score} label="إجمالي" />
          <ScoreBar score={stock.technical_score} label="فني" />
          <ScoreBar score={stock.fundamental_score} label="أساسي" />
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>مكرر الربحية: {stock.pe_ratio?.toFixed(1) ?? '—'}</span>
          <span className={riskColors[risk]}>
            المخاطر: {riskLabels[risk] || risk}
          </span>
        </div>
      </div>
    </Link>
  );
}
