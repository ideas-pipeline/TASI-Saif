'use client';

const WATCHLIST_KEY = 'tasi-watchlist';

export function getWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(WATCHLIST_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToWatchlist(symbol: string): string[] {
  const list = getWatchlist();
  if (!list.includes(symbol)) {
    list.push(symbol);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  }
  return list;
}

export function removeFromWatchlist(symbol: string): string[] {
  const list = getWatchlist().filter((s) => s !== symbol);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  return list;
}

export function isInWatchlist(symbol: string): boolean {
  return getWatchlist().includes(symbol);
}
