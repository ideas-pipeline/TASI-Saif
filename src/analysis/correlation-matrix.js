const { getDb, initSchema } = require('../db/schema');

// ─── Advanced Correlation Matrix ──────────────────────────────────────
/**
 * Build rolling Pearson correlation matrices for TASI stocks.
 * Replaces sector-proxy approach with actual return correlations.
 * Identifies correlation regimes (normal vs. crisis).
 */

const TRADING_DAYS = 252;

/**
 * Compute Pearson correlation coefficient between two return series
 * @param {number[]} returns1 - First return series
 * @param {number[]} returns2 - Second return series
 * @returns {number} Correlation coefficient (-1 to 1)
 */
function computeCorrelation(returns1, returns2) {
  if (returns1.length !== returns2.length || returns1.length < 2) return null;

  const n = returns1.length;
  const mean1 = returns1.reduce((a, b) => a + b, 0) / n;
  const mean2 = returns2.reduce((a, b) => a + b, 0) / n;

  let cov = 0, var1 = 0, var2 = 0;
  for (let i = 0; i < n; i++) {
    const dev1 = returns1[i] - mean1;
    const dev2 = returns2[i] - mean2;
    cov += dev1 * dev2;
    var1 += dev1 * dev1;
    var2 += dev2 * dev2;
  }

  cov /= n;
  var1 /= n;
  var2 /= n;

  const denom = Math.sqrt(var1 * var2);
  return denom > 0 ? cov / denom : null;
}

/**
 * Extract returns for a given stock from database
 * @param {string} symbol - Stock symbol
 * @param {number} days - Number of days to fetch (default 252)
 * @returns {number[]} Daily returns (most recent last)
 */
function getReturns(symbol, days = TRADING_DAYS) {
  const db = getDb();
  try {
    const prices = db.prepare(
      'SELECT close FROM daily_prices WHERE symbol = ? ORDER BY date ASC LIMIT ?'
    ).all(symbol, days + 1);

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1].close > 0) {
        returns.push((prices[i].close - prices[i - 1].close) / prices[i - 1].close);
      }
    }
    return returns;
  } finally {
    db.close();
  }
}

/**
 * Compute full correlation matrix for all TASI stocks
 * @param {number} window - Lookback window in days (default 252)
 * @returns {object} Correlation matrix with symbols as keys
 */
function computeFullCorrelationMatrix(window = TRADING_DAYS) {
  const db = getDb();
  initSchema(db);

  try {
    const stocks = db.prepare('SELECT symbol FROM stocks ORDER BY symbol ASC').all();
    const symbols = stocks.map(s => s.symbol);
    const matrix = {};

    // Fetch returns for all stocks
    const allReturns = {};
    for (const symbol of symbols) {
      const returns = getReturns(symbol, window);
      if (returns.length >= 30) {
        allReturns[symbol] = returns;
      }
    }

    // Build correlation matrix
    const validSymbols = Object.keys(allReturns);
    for (const sym1 of validSymbols) {
      matrix[sym1] = {};
      for (const sym2 of validSymbols) {
        if (sym1 === sym2) {
          matrix[sym1][sym2] = 1.0;
        } else if (matrix[sym2]?.[sym1] !== undefined) {
          // Use already computed correlation
          matrix[sym1][sym2] = matrix[sym2][sym1];
        } else {
          const corr = computeCorrelation(allReturns[sym1], allReturns[sym2]);
          matrix[sym1][sym2] = corr;
        }
      }
    }

    return { symbols: validSymbols, matrix, window };
  } finally {
    db.close();
  }
}

/**
 * Identify correlation regimes (normal vs. crisis)
 * Crisis periods have higher correlations (stocks move together)
 * @returns {object} Regime analysis
 */
function analyzeCorrelationRegimes() {
  const db = getDb();
  initSchema(db);

  try {
    const stocks = db.prepare('SELECT symbol FROM stocks').all();
    const symbols = stocks.map(s => s.symbol);

    // Compute rolling correlations for the past 2 years
    const dates = db.prepare(
      'SELECT DISTINCT date FROM daily_prices ORDER BY date DESC LIMIT 504'
    ).all().map(r => r.date).reverse();

    const regimes = [];

    // Sliding window of 252 days
    for (let i = 252; i < dates.length; i++) {
      const windowStart = dates[i - 252];
      const windowEnd = dates[i];

      // Get all correlations for this window
      const allReturns = {};
      for (const symbol of symbols) {
        const prices = db.prepare(
          'SELECT close FROM daily_prices WHERE symbol = ? AND date >= ? AND date <= ? ORDER BY date ASC'
        ).all(symbol, windowStart, windowEnd);

        const returns = [];
        for (let j = 1; j < prices.length; j++) {
          if (prices[j - 1].close > 0) {
            returns.push((prices[j].close - prices[j - 1].close) / prices[j - 1].close);
          }
        }
        if (returns.length >= 30) {
          allReturns[symbol] = returns;
        }
      }

      // Compute average absolute correlation
      const validSymbols = Object.keys(allReturns);
      const correlations = [];
      for (let s1 = 0; s1 < validSymbols.length; s1++) {
        for (let s2 = s1 + 1; s2 < validSymbols.length; s2++) {
          const corr = computeCorrelation(allReturns[validSymbols[s1]], allReturns[validSymbols[s2]]);
          if (corr !== null) {
            correlations.push(corr);
          }
        }
      }

      const avgCorr = correlations.length > 0
        ? correlations.reduce((a, b) => a + b, 0) / correlations.length
        : null;
      const volatility = correlations.length > 0
        ? Math.sqrt(correlations.reduce((sum, c) => sum + Math.pow(c - (avgCorr || 0), 2), 0) / correlations.length)
        : null;

      // Classify regime: crisis if avg correlation > 0.4, stress if > 0.3
      let regime = 'normal';
      if (avgCorr > 0.4) regime = 'crisis';
      else if (avgCorr > 0.3) regime = 'stress';

      regimes.push({
        date: windowEnd,
        avgCorrelation: avgCorr,
        correlationVolatility: volatility,
        regime,
      });
    }

    return regimes;
  } finally {
    db.close();
  }
}

/**
 * Compute portfolio correlation given a list of symbols and weights
 * @param {string[]} symbols - Portfolio symbols
 * @param {number[]} weights - Portfolio weights (optional, defaults to equal weight)
 * @returns {object} Portfolio correlation metrics
 */
function computePortfolioCorrelation(symbols, weights) {
  const n = symbols.length;
  if (n === 0) return null;

  // Default to equal weights
  const w = weights || Array(n).fill(1 / n);
  if (w.reduce((a, b) => a + b, 0) < 0.99) return null; // Weights don't sum to ~1

  // Get returns for all symbols
  const allReturns = {};
  for (const symbol of symbols) {
    const returns = getReturns(symbol);
    if (returns.length >= 30) {
      allReturns[symbol] = returns;
    }
  }

  const validSymbols = Object.keys(allReturns);
  if (validSymbols.length < 2) return null;

  // Compute all pairwise correlations
    const corrMatrix = {};
  for (const sym1 of validSymbols) {
    corrMatrix[sym1] = {};
    for (const sym2 of validSymbols) {
      if (sym1 === sym2) {
        corrMatrix[sym1][sym2] = 1.0;
      } else if (corrMatrix[sym2]?.[sym1] !== undefined) {
        corrMatrix[sym1][sym2] = corrMatrix[sym2][sym1];
      } else {
        const corr = computeCorrelation(allReturns[sym1], allReturns[sym2]);
        corrMatrix[sym1][sym2] = corr;
      }
    }
  }

  // Compute average correlation weighted by portfolio weights
  let avgWeightedCorr = 0;
  let pairCount = 0;
  for (let i = 0; i < validSymbols.length; i++) {
    for (let j = i + 1; j < validSymbols.length; j++) {
      const sym1 = validSymbols[i];
      const sym2 = validSymbols[j];
      const corr = corrMatrix[sym1][sym2];
      if (corr !== null) {
        const weight1 = symbols.indexOf(sym1) >= 0 ? w[symbols.indexOf(sym1)] : 0;
        const weight2 = symbols.indexOf(sym2) >= 0 ? w[symbols.indexOf(sym2)] : 0;
        avgWeightedCorr += weight1 * weight2 * corr;
        pairCount++;
      }
    }
  }

  return {
    symbols: validSymbols,
    weights: w.slice(0, validSymbols.length),
    averageCorrelation: avgWeightedCorr,
    correlationMatrix: corrMatrix,
    diversificationScore: computeDiversificationFromCorrelations(corrMatrix, validSymbols.length),
  };
}

/**
 * Compute diversification score from correlation matrix
 * Higher score = better diversification (lower correlations)
 * @returns {number} Score 0-10
 */
function computeDiversificationFromCorrelations(corrMatrix, n) {
  const symbols = Object.keys(corrMatrix);
  if (symbols.length < 2) return 0;

  // Average correlation
  let sumCorr = 0;
  let count = 0;
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const corr = corrMatrix[symbols[i]][symbols[j]];
      if (corr !== null) {
        sumCorr += corr;
        count++;
      }
    }
  }

  const avgCorr = count > 0 ? sumCorr / count : 0;

  // Score: higher avg correlation = lower score
  // avgCorr 1.0 → score 0 (perfect correlation, no diversification)
  // avgCorr 0.0 → score 10 (zero correlation, perfect diversification)
  const score = Math.max(0, Math.min(10, (1 - avgCorr) * 10));
  return Math.round(score * 100) / 100; // Round to 2 decimals
}

module.exports = {
  computeFullCorrelationMatrix,
  computeCorrelation,
  analyzeCorrelationRegimes,
  computePortfolioCorrelation,
  computeDiversificationFromCorrelations,
  getReturns,
};
