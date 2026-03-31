import stocksJson from '../data/stocks.json';
import pricesJson from '../data/prices.json';
import indicatorsJson from '../data/indicators.json';
import scoresJson from '../data/scores.json';

const DISCLAIMER = 'تنويه: هذا التحليل لأغراض تعليمية ومعلوماتية فقط وليس نصيحة استثمارية. يجب عليك استشارة مستشار مالي مرخص قبل اتخاذ أي قرارات استثمارية.\nDisclaimer: This analysis is for educational and informational purposes only and does not constitute financial advice.';

export interface StockRow {
  symbol: string;
  name: string;
  sector: string;
  market_cap: number | null;
  pe_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;
  currency: string;
  updated_at: string;
}

export interface PriceRow {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ScoreRow {
  symbol: string;
  date: string;
  technical_score: number | null;
  fundamental_score: number | null;
  ai_score: number | null;
  overall_score: number | null;
  risk_level: string | null;
  volatility: number | null;
  beta: number | null;
  ai_reasoning: string | null;
  entry_signal: string | null;
  entry_reasoning: string | null;
  signal_reasoning?: string | null;
}

export interface IndicatorRow {
  symbol: string;
  date: string;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  ema_20: number | null;
  ema_50: number | null;
  ema_200: number | null;
  rsi_14: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  avg_volume_20: number | null;
  volume_ratio: number | null;
}

const stocks = stocksJson as StockRow[];
const prices = pricesJson as PriceRow[];
const indicators = indicatorsJson as IndicatorRow[];
const scores = scoresJson as ScoreRow[];

export function getStocks(params?: { sector?: string; sort?: string; order?: string; limit?: number }) {
  let result = stocks.map(s => {
    const score = scores.find(sc => sc.symbol === s.symbol);
    return { ...s, ...(score || {}) };
  });

  if (params?.sector) {
    result = result.filter(s => s.sector === params.sector);
  }
  if (params?.sort) {
    const key = params.sort as keyof typeof result[0];
    const dir = params.order === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      const av = (a as any)[key] ?? -Infinity;
      const bv = (b as any)[key] ?? -Infinity;
      return av > bv ? dir : av < bv ? -dir : 0;
    });
  }
  if (params?.limit) {
    result = result.slice(0, params.limit);
  }
  return { disclaimer: DISCLAIMER, date: scores[0]?.date || null, count: result.length, stocks: result };
}

export function getStock(symbol: string) {
  const stock = stocks.find(s => s.symbol === symbol);
  if (!stock) return null;
  const score = scores.find(sc => sc.symbol === symbol);
  const stockPrices = prices.filter(p => p.symbol === symbol).sort((a, b) => a.date.localeCompare(b.date));
  const stockIndicators = indicators.filter(i => i.symbol === symbol).map(i => ({
    date: i.date,
    sma_20: i.sma_20,
    sma_50: i.sma_50,
    sma_200: i.sma_200,
    ema_20: i.ema_20,
    rsi_14: i.rsi_14,
    macd: i.macd_line,
    macd_signal: i.macd_signal,
    bb_upper: i.bb_upper,
    bb_middle: i.bb_middle,
    bb_lower: i.bb_lower,
    volume_avg_20: i.avg_volume_20,
  }));
  return {
    stock: { ...stock, ...(score || {}) },
    prices: stockPrices,
    indicators: stockIndicators,
    disclaimer: DISCLAIMER,
  };
}

export function getRankings(limit = 20) {
  const ranked = stocks.map(s => {
    const score = scores.find(sc => sc.symbol === s.symbol);
    return { ...s, ...(score || {}) };
  }).filter(s => s.overall_score != null)
    .sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0))
    .slice(0, limit);
  return { disclaimer: DISCLAIMER, rankings: ranked };
}

export function getSectors() {
  const sectorMap = new Map<string, any[]>();
  for (const s of stocks) {
    const arr = sectorMap.get(s.sector) || [];
    const score = scores.find(sc => sc.symbol === s.symbol);
    arr.push({ ...s, ...(score || {}) });
    sectorMap.set(s.sector, arr);
  }
  const sectors = Array.from(sectorMap.entries()).map(([sector, sectorStocks]) => {
    const avgScore = sectorStocks.reduce((sum, s) => sum + (s.overall_score || 0), 0) / sectorStocks.length;
    const avgRsi = sectorStocks.reduce((sum, s) => {
      const ind = indicators.find(i => i.symbol === s.symbol);
      return sum + (ind?.rsi_14 || 0);
    }, 0) / sectorStocks.length;
    const avgPe = sectorStocks.reduce((sum, s) => sum + (s.pe_ratio || 0), 0) / sectorStocks.length;
    const topStock = sectorStocks.sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0))[0];
    const buyCount = sectorStocks.filter(s => s.entry_signal === 'buy' || s.entry_signal === 'strong_buy').length;
    return {
      sector,
      avg_score: Math.round(avgScore * 10) / 10 || null,
      top_stock: topStock?.symbol || null,
      trend: avgRsi > 60 ? 'bullish' : avgRsi < 40 ? 'bearish' : 'neutral',
      avg_rsi: Math.round(avgRsi * 10) / 10 || null,
      avg_pe: Math.round(avgPe * 10) / 10 || null,
      stock_count: sectorStocks.length,
      buy_signal_count: buyCount,
      summary: null,
    };
  });
  return { disclaimer: DISCLAIMER, sectors };
}

export function getSignals() {
  const merged = stocks.map(s => {
    const score = scores.find(sc => sc.symbol === s.symbol);
    return { ...s, ...(score || {}) };
  });
  return {
    strong_buy: merged.filter(s => s.entry_signal === 'strong_buy'),
    buy: merged.filter(s => s.entry_signal === 'buy'),
    hold: merged.filter(s => s.entry_signal === 'hold'),
    sell: merged.filter(s => s.entry_signal === 'sell'),
    strong_sell: merged.filter(s => s.entry_signal === 'strong_sell'),
    disclaimer: DISCLAIMER,
  };
}

export function getStats() {
  const dates = prices.map(p => p.date).sort();
  return {
    stocks: stocks.length,
    priceRecords: prices.length,
    indicatorRecords: indicators.length,
    scoreRecords: scores.length,
    priceRange: { from: dates[0], to: dates[dates.length - 1] },
    latestAnalysis: scores[0]?.date || null,
  };
}

export function getRiskAnalysis(symbol: string) {
  const stock = stocks.find(s => s.symbol === symbol);
  if (!stock) return null;
  const score = scores.find(sc => sc.symbol === symbol);
  const stockPrices = prices.filter(p => p.symbol === symbol).sort((a, b) => a.date.localeCompare(b.date));

  // Compute basic risk metrics from price data
  const returns: number[] = [];
  for (let i = 1; i < stockPrices.length; i++) {
    returns.push((stockPrices[i].close - stockPrices[i - 1].close) / stockPrices[i - 1].close);
  }
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const var95 = sortedReturns[Math.floor(returns.length * 0.05)] || 0;
  const cvar95 = sortedReturns.slice(0, Math.floor(returns.length * 0.05)).reduce((a, b) => a + b, 0) / Math.floor(returns.length * 0.05) || 0;

  const latestPrice = stockPrices[stockPrices.length - 1]?.close || 0;

  return {
    symbol,
    name: stock.name,
    sector: stock.sector,
    latestPrice,
    latestDate: stockPrices[stockPrices.length - 1]?.date || '',
    volatility: Math.round(volatility * 1000) / 1000,
    beta: null,
    riskLevel: score?.risk_level || (volatility > 0.4 ? 'high' : volatility > 0.2 ? 'medium' : 'low'),
    var: {
      daily: [{ confidence: 0.95, var: Math.round(var95 * 10000) / 10000, cvar: Math.round(cvar95 * 10000) / 10000, horizon: 1 }],
      tenDay: [{ confidence: 0.95, var: Math.round(var95 * Math.sqrt(10) * 10000) / 10000, cvar: Math.round(cvar95 * Math.sqrt(10) * 10000) / 10000, horizon: 10 }],
    },
    sharpeRatio: mean !== 0 ? Math.round((mean * 252) / volatility * 100) / 100 : null,
    sortinoRatio: null,
    maxDrawdown: null,
    stressTests: [],
    disclaimer: DISCLAIMER,
  };
}

export { DISCLAIMER };
