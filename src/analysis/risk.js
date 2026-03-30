const { getDb, initSchema } = require('../db/schema');

/**
 * Compute annualized volatility from daily returns.
 */
function computeVolatility(closePrices) {
  if (closePrices.length < 21) return null;

  // Use last 60 days or all available
  const window = closePrices.slice(-Math.min(60, closePrices.length));
  const returns = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1] > 0) {
      returns.push(Math.log(window[i] / window[i - 1]));
    }
  }

  if (returns.length < 10) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);

  // Annualize (252 trading days)
  return dailyVol * Math.sqrt(252);
}

/**
 * Compute beta relative to market (approximated as average of all stocks).
 * For a proper implementation, we'd use TASI index data.
 */
function computeBeta(stockCloses, marketCloses) {
  if (stockCloses.length < 21 || marketCloses.length < 21) return null;

  const len = Math.min(stockCloses.length, marketCloses.length, 60);
  const stockSlice = stockCloses.slice(-len);
  const marketSlice = marketCloses.slice(-len);

  const stockReturns = [];
  const marketReturns = [];

  for (let i = 1; i < len; i++) {
    if (stockSlice[i - 1] > 0 && marketSlice[i - 1] > 0) {
      stockReturns.push((stockSlice[i] - stockSlice[i - 1]) / stockSlice[i - 1]);
      marketReturns.push((marketSlice[i] - marketSlice[i - 1]) / marketSlice[i - 1]);
    }
  }

  if (stockReturns.length < 10) return null;

  const meanStock = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
  const meanMarket = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;

  let covariance = 0;
  let marketVariance = 0;

  for (let i = 0; i < stockReturns.length; i++) {
    covariance += (stockReturns[i] - meanStock) * (marketReturns[i] - meanMarket);
    marketVariance += Math.pow(marketReturns[i] - meanMarket, 2);
  }

  if (marketVariance === 0) return null;
  return covariance / marketVariance;
}

/**
 * Classify risk level based on volatility, beta, and sector.
 */
function classifyRisk(volatility, beta, sector) {
  let riskScore = 0;

  // Volatility component (0-3)
  if (volatility !== null) {
    if (volatility > 0.50) riskScore += 3;
    else if (volatility > 0.35) riskScore += 2;
    else if (volatility > 0.20) riskScore += 1;
  } else {
    riskScore += 1.5; // unknown = medium
  }

  // Beta component (0-3)
  if (beta !== null) {
    const absBeta = Math.abs(beta);
    if (absBeta > 1.5) riskScore += 3;
    else if (absBeta > 1.2) riskScore += 2;
    else if (absBeta > 0.8) riskScore += 1;
  } else {
    riskScore += 1.5;
  }

  // Sector risk component (0-2)
  const highRiskSectors = ['Insurance', 'Real Estate', 'Capital Goods'];
  const lowRiskSectors = ['Banking', 'Utilities', 'Energy', 'Telecommunications'];

  if (highRiskSectors.includes(sector)) riskScore += 2;
  else if (lowRiskSectors.includes(sector)) riskScore += 0;
  else riskScore += 1;

  // Classify
  if (riskScore >= 6) return 'high';
  if (riskScore >= 3) return 'medium';
  return 'low';
}

/**
 * Compute risk metrics for all stocks.
 */
function computeAllRiskMetrics() {
  const db = getDb();
  initSchema(db);

  const stocks = db.prepare('SELECT symbol, name, sector FROM stocks').all();

  // Build a market-average price series for beta calculation
  const allSymbols = stocks.map(s => s.symbol);
  const marketPrices = {};

  for (const symbol of allSymbols) {
    const prices = db.prepare(
      'SELECT date, close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
    ).all(symbol);
    for (const { date, close } of prices) {
      if (!marketPrices[date]) marketPrices[date] = [];
      marketPrices[date].push(close);
    }
  }

  // Compute market average by date
  const sortedDates = Object.keys(marketPrices).sort();
  const marketAvg = sortedDates.map(d => {
    const prices = marketPrices[d];
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  });

  const results = [];
  for (const { symbol, name, sector } of stocks) {
    const prices = db.prepare(
      'SELECT date, close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
    ).all(symbol);

    const closes = prices.map(p => p.close);
    const volatility = computeVolatility(closes);
    const beta = computeBeta(closes, marketAvg);
    const riskLevel = classifyRisk(volatility, beta, sector);

    results.push({ symbol, name, sector, volatility, beta, riskLevel });
    console.log(`  ${symbol} (${name}): vol=${volatility?.toFixed(3) ?? 'N/A'} beta=${beta?.toFixed(2) ?? 'N/A'} risk=${riskLevel}`);
  }

  db.close();
  return results;
}

module.exports = { computeVolatility, computeBeta, classifyRisk, computeAllRiskMetrics };
