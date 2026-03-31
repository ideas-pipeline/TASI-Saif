'use client';

import { useState, useEffect } from 'react';
import { Stock, getStocks } from '../../lib/api';
import { getWatchlist, removeFromWatchlist } from '../../lib/watchlist';
import StockCard from '../../components/StockCard';
import Disclaimer from '../../components/Disclaimer';
import Link from 'next/link';

export default function WatchlistPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [watchlist, setWatchlistState] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const wl = getWatchlist();
    setWatchlistState(wl);

    if (wl.length === 0) {
      setLoading(false);
      return;
    }

    getStocks().then((data) => {
      const wlStocks = (data.stocks || []).filter((s) => wl.includes(s.symbol));
      setStocks(wlStocks);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleRemove = (symbol: string) => {
    const updated = removeFromWatchlist(symbol);
    setWatchlistState(updated);
    setStocks((prev) => prev.filter((s) => s.symbol !== symbol));
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-400">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">قائمة المتابعة</h1>

      {watchlist.length === 0 ? (
        <div className="text-center py-16 bg-tasi-card border border-tasi-border rounded-lg">
          <p className="text-gray-400 text-lg mb-2">قائمة المتابعة فارغة</p>
          <p className="text-gray-500 text-sm mb-4">أضف أسهم من صفحة فرز الأسهم أو من صفحة تفاصيل السهم</p>
          <Link href="/screener" className="text-tasi-gold hover:underline">فرز الأسهم ←</Link>
        </div>
      ) : (
        <>
          <p className="text-gray-400 text-sm">{stocks.length} سهم في المتابعة</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stocks.map((stock) => (
              <div key={stock.symbol} className="relative">
                <StockCard stock={stock} />
                <button
                  onClick={() => handleRemove(stock.symbol)}
                  className="absolute top-2 left-2 bg-red-600/80 hover:bg-red-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center"
                  title="إزالة"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <Disclaimer />
    </div>
  );
}
