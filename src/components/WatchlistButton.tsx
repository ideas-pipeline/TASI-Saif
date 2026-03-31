'use client';

import { useState, useEffect } from 'react';
import { isInWatchlist, addToWatchlist, removeFromWatchlist } from '../lib/watchlist';

export default function WatchlistButton({ symbol }: { symbol: string }) {
  const [inList, setInList] = useState(false);

  useEffect(() => {
    setInList(isInWatchlist(symbol));
  }, [symbol]);

  const toggle = () => {
    if (inList) {
      removeFromWatchlist(symbol);
      setInList(false);
    } else {
      addToWatchlist(symbol);
      setInList(true);
    }
  };

  return (
    <button
      onClick={toggle}
      className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
        inList
          ? 'bg-tasi-gold text-black hover:bg-yellow-400'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {inList ? '★ في المتابعة' : '☆ أضف للمتابعة'}
    </button>
  );
}
