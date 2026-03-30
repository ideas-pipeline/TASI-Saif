const { getDb, initSchema } = require('../db/schema');
const { computeFullCorrelationMatrix, computeDiversificationFromCorrelations, computeCorrelation, getReturns } = require('./correlation-matrix');
const { generateScenarioMultiplierMatrix, getScenarioMultiplier } = require('./stress-test-calibration');

// ─── Constants ────────────────────────────────────────────────────────
const TRADING_DAYS = 252;
const RISK_FREE_RATE = 0.05; // ~5% Saudi T-bill rate (SAMA)

// ─── Helper: compute log returns ──────────────────────────────────────
function logReturns(closePrices) {
  const returns = [];
  for (let i = 1; i < closePrices.length; i++) {
    if (closePrices[i - 1] > 0) {
      returns.push(Math.log(closePrices[i] / closePrices[i - 1]));
    }
  }
  return returns;
}

function simpleReturns(closePrices) {
  const returns = [];
  for (let i = 1; i < closePrices.length; i++) {
    if (closePrices[i - 1] > 0) {
      returns.push((closePrices[i] - closePrices[i - 1]) / closePrices[i - 1]);
    }
  }
  return returns;
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// ─── Value at Risk (Historical Simulation) ────────────────────────────
/**
 * Compute VaR at given confidence levels using historical simulation.
 * @param {number[]} closePrices - Daily close prices (oldest first)
 * @param {number[]} confidenceLevels - e.g. [0.95, 0.99]
 * @param {number} horizon - Time horizon in days (default 1)
 * @returns {{ confidence: number, var: number, cvar: number }[] | null}
 */
function computeVaR(closePrices, confidenceLevels = [0.95, 0.99], horizon = 1) {
  const returns = simpleReturns(closePrices);
  if (returns.length < 30) return null;

  // Sort returns ascending (worst to best)
  const sorted = [...returns].sort((a, b) => a - b);

  const results = confidenceLevels.map(confidence => {
    const cutoffIndex = Math.floor(sorted.length * (1 - confidence));
    const varDaily = -sorted[cutoffIndex]; // VaR as positive loss

    // CVaR (Expected Shortfall): average of losses beyond VaR
    const tailLosses = sorted.slice(0, cutoffIndex + 1);
    const cvar = tailLosses.length > 0 ? -mean(tailLosses) : varDaily;

    // Scale to horizon using square root of time
    const scaleFactor = Math.sqrt(horizon);
    return {
      confidence,
      var: varDaily * scaleFactor,
      cvar: cvar * scaleFactor,
      horizon,
    };
  });

  return results;
}

// ─── Parametric VaR (Variance-Covariance) ─────────────────────────────
function computeParametricVaR(closePrices, confidenceLevels = [0.95, 0.99], horizon = 1) {
  const returns = simpleReturns(closePrices);
  if (returns.length < 30) return null;

  const mu = mean(returns);
  const sigma = stddev(returns);

  // Z-scores for confidence levels
  const zScores = { 0.90: 1.282, 0.95: 1.645, 0.99: 2.326 };

  return confidenceLevels.map(confidence => {
    const z = zScores[confidence] || 1.645;
    const scaleFactor = Math.sqrt(horizon);
    const varDaily = z * sigma - mu;
    return {
      confidence,
      var: varDaily * scaleFactor,
      cvar: null, // parametric CVaR requires distribution assumption
      horizon,
      method: 'parametric',
    };
  });
}

// ─── Sharpe Ratio ─────────────────────────────────────────────────────
/**
 * Compute annualized Sharpe Ratio.
 */
function computeSharpeRatio(closePrices) {
  const returns = simpleReturns(closePrices);
  if (returns.length < 30) return null;

  const dailyRf = RISK_FREE_RATE / TRADING_DAYS;
  const excessReturns = returns.map(r => r - dailyRf);
  const avgExcess = mean(excessReturns);
  const sigmaExcess = stddev(excessReturns);

  if (sigmaExcess === 0) return null;
  return (avgExcess / sigmaExcess) * Math.sqrt(TRADING_DAYS);
}

// ─── Sortino Ratio ────────────────────────────────────────────────────
/**
 * Compute annualized Sortino Ratio (penalizes only downside volatility).
 */
function computeSortinoRatio(closePrices) {
  const returns = simpleReturns(closePrices);
  if (returns.length < 30) return null;

  const dailyRf = RISK_FREE_RATE / TRADING_DAYS;
  const excessReturns = returns.map(r => r - dailyRf);
  const avgExcess = mean(excessReturns);

  // Downside deviation: only negative excess returns
  const downsideReturns = excessReturns.filter(r => r < 0);
  if (downsideReturns.length === 0) return null;

  const downsideVariance = downsideReturns.reduce((sum, r) => sum + r * r, 0) / downsideReturns.length;
  const downsideDev = Math.sqrt(downsideVariance);

  if (downsideDev === 0) return null;
  return (avgExcess / downsideDev) * Math.sqrt(TRADING_DAYS);
}

// ─── Maximum Drawdown ─────────────────────────────────────────────────
function computeMaxDrawdown(closePrices) {
  if (closePrices.length < 2) return null;

  let peak = closePrices[0];
  let maxDrawdown = 0;
  let peakDate = 0;
  let troughDate = 0;
  let recoveryDate = null;
  let currentPeakIdx = 0;
  let currentTroughIdx = 0;

  for (let i = 1; i < closePrices.length; i++) {
    if (closePrices[i] > peak) {
      peak = closePrices[i];
      currentPeakIdx = i;
    }
    const drawdown = (peak - closePrices[i]) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      peakDate = currentPeakIdx;
      currentTroughIdx = i;
    }
  }

  return {
    maxDrawdown,
    peakIndex: peakDate,
    troughIndex: currentTroughIdx,
  };
}

// ─── Scenario-Specific Multiplier Matrix ─────────────────────────────
// Initialize multiplier matrix on module load
let SCENARIO_MULTIPLIER_MATRIX = null;

function initializeMultiplierMatrix() {
  if (!SCENARIO_MULTIPLIER_MATRIX) {
    try {
      SCENARIO_MULTIPLIER_MATRIX = generateScenarioMultiplierMatrix();
    } catch (e) {
      console.warn('Failed to initialize multiplier matrix, using defaults:', e.message);
      SCENARIO_MULTIPLIER_MATRIX = {};
    }
  }
  return SCENARIO_MULTIPLIER_MATRIX;
}

// ─── Stress Testing ───────────────────────────────────────────────────
/**
 * Apply stress test scenarios to a stock's current price.
 * Returns projected prices and losses under each scenario.
 * Uses scenario-specific calibrated multipliers based on historical analysis.
 */
function stressTest(currentPrice, volatility, beta, sector) {
  const matrix = initializeMultiplierMatrix();

  const scenarios = [
    {
      name: 'market_crash',
      nameAr: 'انهيار السوق',
      description: 'Broad market decline of 20-30% (similar to 2020 COVID crash)',
      marketShock: -0.25,
    },
    {
      name: 'sector_downturn',
      nameAr: 'تراجع القطاع',
      description: 'Sector-specific decline of 15-20%',
      marketShock: -0.10,
      sectorShock: -0.15,
    },
    {
      name: 'interest_rate_hike',
      nameAr: 'رفع أسعار الفائدة',
      description: 'SAMA raises rates by 100bps, market drops 8-12%',
      marketShock: -0.10,
    },
    {
      name: 'oil_price_crash',
      nameAr: 'انهيار أسعار النفط',
      description: 'Oil drops 40%, heavy impact on Saudi economy',
      marketShock: -0.20,
    },
    {
      name: 'mild_correction',
      nameAr: 'تصحيح بسيط',
      description: 'Normal market correction of 5-10%',
      marketShock: -0.075,
    },
    {
      name: 'geopolitical_crisis',
      nameAr: 'أزمة جيوسياسية',
      description: 'Regional geopolitical tensions causing market uncertainty',
      marketShock: -0.15,
    },
  ];

  const effectiveBeta = beta || 1.0;
  const effectiveVol = volatility || 0.30;
  const effectiveSector = sector || 'Banking';

  return scenarios.map(scenario => {
    let stockShock = scenario.marketShock * effectiveBeta;

    // Add sector-specific shock if applicable
    if (scenario.sectorShock) {
      stockShock += scenario.sectorShock;
    }

    // Apply scenario-specific multiplier based on historical calibration
    // This replaces hardcoded multipliers (1.5x, 1.4x) with evidence-based factors
    const scenarioMultiplier = getScenarioMultiplier(scenario.name, effectiveSector, matrix);
    stockShock *= scenarioMultiplier;

    // Add volatility-based adjustment (stocks with higher vol move more)
    const volMultiplier = 1 + (effectiveVol - 0.25) * 0.5;
    stockShock *= Math.max(0.5, volMultiplier);

    const projectedPrice = currentPrice * (1 + stockShock);
    const loss = currentPrice - projectedPrice;
    const lossPct = -stockShock;

    return {
      scenario: scenario.name,
      scenarioAr: scenario.nameAr,
      description: scenario.description,
      projectedPrice: Math.max(0, projectedPrice),
      loss: Math.max(0, loss),
      lossPct,
      severity: lossPct > 0.25 ? 'severe' : lossPct > 0.15 ? 'high' : lossPct > 0.08 ? 'moderate' : 'low',
      multiplier: scenarioMultiplier, // Track which multiplier was used (for debugging/validation)
    };
  });
}

// ─── Portfolio Diversification Score ──────────────────────────────────
/**
 * Compute diversification score for a portfolio of stocks.
 * Score ranges from 0 (concentrated) to 10 (well-diversified).
 * @param {string[]} symbols - Portfolio stock symbols
 * @returns {{ score: number, breakdown: object, recommendations: string[] }}
 */
function computeDiversificationScore(symbols) {
  const db = getDb();
  initSchema(db);

  try {
    const stocks = symbols.map(symbol =>
      db.prepare('SELECT symbol, name, sector, market_cap FROM stocks WHERE symbol = ?').get(symbol)
    ).filter(Boolean);

    if (stocks.length === 0) return null;

    let score = 0;
    const breakdown = {};
    const recommendations = [];

    // 1. Sector concentration (0-3 points)
    const sectorCounts = {};
    for (const s of stocks) {
      sectorCounts[s.sector] = (sectorCounts[s.sector] || 0) + 1;
    }
    const sectorCount = Object.keys(sectorCounts).length;
    const maxSectorWeight = Math.max(...Object.values(sectorCounts)) / stocks.length;

    let sectorScore = 0;
    if (sectorCount >= 5) sectorScore = 3;
    else if (sectorCount >= 3) sectorScore = 2;
    else if (sectorCount >= 2) sectorScore = 1;
    // Penalize heavy concentration
    if (maxSectorWeight > 0.5) sectorScore = Math.max(0, sectorScore - 1);

    score += sectorScore;
    breakdown.sectorDiversification = { score: sectorScore, maxScore: 3, sectorCount, sectorCounts };

    if (sectorCount < 3) recommendations.push('أضف أسهم من قطاعات مختلفة لتقليل مخاطر التركز');
    if (maxSectorWeight > 0.5) recommendations.push('خفض وزن القطاع الأكبر إلى أقل من 50٪');

    // 2. Number of holdings (0-2 points)
    let holdingScore = 0;
    if (stocks.length >= 10) holdingScore = 2;
    else if (stocks.length >= 5) holdingScore = 1.5;
    else if (stocks.length >= 3) holdingScore = 1;

    score += holdingScore;
    breakdown.holdingCount = { score: holdingScore, maxScore: 2, count: stocks.length };

    if (stocks.length < 5) recommendations.push('أضف المزيد من الأسهم (5-15 سهم مثالي) لتحسين التنويع');

    // 3. Market cap mix (0-2 points)
    const hasCaps = stocks.filter(s => s.market_cap);
    let capScore = 0;
    if (hasCaps.length > 0) {
      const large = hasCaps.filter(s => s.market_cap >= 10e9).length;
      const mid = hasCaps.filter(s => s.market_cap >= 2e9 && s.market_cap < 10e9).length;
      const small = hasCaps.filter(s => s.market_cap < 2e9).length;
      const capTypes = [large > 0, mid > 0, small > 0].filter(Boolean).length;
      capScore = Math.min(2, capTypes);
    }

    score += capScore;
    breakdown.marketCapMix = { score: capScore, maxScore: 2 };

    if (capScore < 2) recommendations.push('نوّع بين أسهم الشركات الكبيرة والمتوسطة والصغيرة');

    // 4. Correlation-based score (0-3 points) — using actual return correlations
    // Compute real pairwise correlations between portfolio stocks
    let correlationScore = 0;
    let avgCorrelation = null;
    let correlationMatrix = null;

    if (symbols.length >= 2) {
      try {
        // Get actual returns for each symbol
        const allReturns = {};
        for (const symbol of symbols) {
          const returns = getReturns(symbol, TRADING_DAYS);
          if (returns.length >= 30) {
            allReturns[symbol] = returns;
          }
        }

        const validSymbols = Object.keys(allReturns);
        if (validSymbols.length >= 2) {
          // Build correlation matrix
          correlationMatrix = {};
          const correlations = [];
          for (const sym1 of validSymbols) {
            correlationMatrix[sym1] = {};
            for (const sym2 of validSymbols) {
              if (sym1 === sym2) {
                correlationMatrix[sym1][sym2] = 1.0;
              } else if (correlationMatrix[sym2]?.[sym1] !== undefined) {
                correlationMatrix[sym1][sym2] = correlationMatrix[sym2][sym1];
              } else {
                const corr = computeCorrelation(allReturns[sym1], allReturns[sym2]);
                correlationMatrix[sym1][sym2] = corr;
                if (corr !== null) correlations.push(corr);
              }
            }
          }

          // Calculate average correlation
          avgCorrelation = correlations.length > 0
            ? correlations.reduce((a, b) => a + b, 0) / correlations.length
            : null;

          // Score based on average correlation:
          // avgCorr < 0.3 → 3 points (good diversification)
          // avgCorr 0.3-0.5 → 2 points (moderate)
          // avgCorr 0.5-0.7 → 1 point (low)
          // avgCorr > 0.7 → 0 points (poor)
          if (avgCorrelation < 0.3) correlationScore = 3;
          else if (avgCorrelation < 0.5) correlationScore = 2;
          else if (avgCorrelation < 0.7) correlationScore = 1;
          else correlationScore = 0;
        }
      } catch (e) {
        // Fallback to sector proxy if correlation calculation fails
        const uniqueSectors = Object.keys(sectorCounts);
        const defensiveSectors = ['Banking', 'Utilities', 'Telecommunications', 'Healthcare'];
        const cyclicalSectors = ['Materials', 'Real Estate', 'Capital Goods', 'Energy'];
        const hasDefensive = uniqueSectors.some(s => defensiveSectors.includes(s));
        const hasCyclical = uniqueSectors.some(s => cyclicalSectors.includes(s));

        if (hasDefensive && hasCyclical) correlationScore = 3;
        else if (hasDefensive || hasCyclical) correlationScore = 2;
        else if (sectorCount >= 2) correlationScore = 1;
      }
    }

    score += correlationScore;
    breakdown.correlationAnalysis = {
      score: correlationScore,
      maxScore: 3,
      method: correlationMatrix ? 'actual_returns' : 'sector_proxy',
      averageCorrelation: avgCorrelation,
      correlationMatrix,
    };

    // Recommendation based on actual correlations
    if (avgCorrelation !== null) {
      if (avgCorrelation > 0.7) {
        recommendations.push('الأسهم مرتبطة بقوة جداً. أضف أسهم من قطاعات غير مرتبطة لتحسين التنويع.');
      } else if (avgCorrelation > 0.5) {
        recommendations.push('الارتباط مرتفع. ابحث عن أسهم برتباط أقل للحصول على تنويع أفضل.');
      }
    }

    return {
      score: Math.min(10, score),
      maxScore: 10,
      breakdown,
      recommendations,
    };
  } finally {
    db.close();
  }
}

// ─── Sector Correlation Matrix ────────────────────────────────────────
/**
 * Compute correlation matrix between sectors based on average daily returns.
 */
function computeSectorCorrelations() {
  const db = getDb();
  initSchema(db);

  try {
    const sectors = db.prepare('SELECT DISTINCT sector FROM stocks').all().map(r => r.sector);
    const sectorReturns = {};

    for (const sector of sectors) {
      const stocks = db.prepare('SELECT symbol FROM stocks WHERE sector = ?').all(sector);
      const dailyReturns = {};

      for (const { symbol } of stocks) {
        const prices = db.prepare(
          'SELECT date, close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
        ).all(symbol);

        for (let i = 1; i < prices.length; i++) {
          if (prices[i - 1].close > 0) {
            const ret = (prices[i].close - prices[i - 1].close) / prices[i - 1].close;
            const date = prices[i].date;
            if (!dailyReturns[date]) dailyReturns[date] = [];
            dailyReturns[date].push(ret);
          }
        }
      }

      // Average return per day for the sector
      const dates = Object.keys(dailyReturns).sort();
      sectorReturns[sector] = dates.map(d => ({
        date: d,
        return: mean(dailyReturns[d]),
      }));
    }

    // Build correlation matrix
    const matrix = {};
    for (const s1 of sectors) {
      matrix[s1] = {};
      for (const s2 of sectors) {
        if (s1 === s2) {
          matrix[s1][s2] = 1.0;
          continue;
        }
        // Align dates
        const dates1 = new Set(sectorReturns[s1].map(r => r.date));
        const common = sectorReturns[s2].filter(r => dates1.has(r.date));
        const ret1Map = Object.fromEntries(sectorReturns[s1].map(r => [r.date, r.return]));

        const r1 = common.map(r => ret1Map[r.date]).filter(v => v !== undefined);
        const r2 = common.map(r => r.return);

        if (r1.length < 20) {
          matrix[s1][s2] = null;
          continue;
        }

        const m1 = mean(r1);
        const m2 = mean(r2);
        let cov = 0, v1 = 0, v2 = 0;
        for (let i = 0; i < r1.length; i++) {
          cov += (r1[i] - m1) * (r2[i] - m2);
          v1 += Math.pow(r1[i] - m1, 2);
          v2 += Math.pow(r2[i] - m2, 2);
        }
        const denom = Math.sqrt(v1 * v2);
        matrix[s1][s2] = denom > 0 ? cov / denom : null;
      }
    }

    return { sectors, matrix };
  } finally {
    db.close();
  }
}

// ─── Full Risk Analysis for a Stock ───────────────────────────────────
function analyzeStockRisk(symbol) {
  const db = getDb();
  initSchema(db);

  try {
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
    if (!stock) return null;

    const prices = db.prepare(
      'SELECT date, close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
    ).all(symbol);
    const closes = prices.map(p => p.close);

    if (closes.length < 30) return { symbol, error: 'Insufficient price data' };

    const latestPrice = closes[closes.length - 1];
    const latestDate = prices[prices.length - 1].date;

    // Get existing risk metrics from stock_scores
    const score = db.prepare(
      'SELECT volatility, beta, risk_level FROM stock_scores WHERE symbol = ? ORDER BY date DESC LIMIT 1'
    ).get(symbol);

    const volatility = score?.volatility || null;
    const beta = score?.beta || null;

    // Compute advanced metrics
    const var95_99 = computeVaR(closes, [0.95, 0.99], 1);
    const var10day = computeVaR(closes, [0.95, 0.99], 10);
    const sharpeRatio = computeSharpeRatio(closes);
    const sortinoRatio = computeSortinoRatio(closes);
    const maxDrawdown = computeMaxDrawdown(closes);
    const stressResults = stressTest(latestPrice, volatility, beta, stock.sector);

    return {
      symbol,
      name: stock.name,
      sector: stock.sector,
      latestPrice,
      latestDate,
      volatility,
      beta,
      riskLevel: score?.risk_level || 'medium',
      var: {
        daily: var95_99,
        tenDay: var10day,
      },
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown ? {
        value: maxDrawdown.maxDrawdown,
        peakDate: prices[maxDrawdown.peakIndex]?.date,
        troughDate: prices[maxDrawdown.troughIndex]?.date,
      } : null,
      stressTests: stressResults,
    };
  } finally {
    db.close();
  }
}

// ─── Batch: Run Risk Analysis for All Stocks ──────────────────────────
function analyzeAllRisks() {
  const db = getDb();
  initSchema(db);

  // Init risk_analysis table
  db.exec(`
    CREATE TABLE IF NOT EXISTS risk_analysis (
      symbol          TEXT NOT NULL,
      date            TEXT NOT NULL,
      var_95_1d       REAL,
      var_99_1d       REAL,
      cvar_95_1d      REAL,
      cvar_99_1d      REAL,
      var_95_10d      REAL,
      var_99_10d      REAL,
      sharpe_ratio    REAL,
      sortino_ratio   REAL,
      max_drawdown    REAL,
      max_dd_peak     TEXT,
      max_dd_trough   TEXT,
      PRIMARY KEY (symbol, date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );
    CREATE INDEX IF NOT EXISTS idx_risk_analysis_date ON risk_analysis(date);
  `);

  const stocks = db.prepare('SELECT symbol, name, sector FROM stocks').all();
  const today = new Date().toISOString().split('T')[0];

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO risk_analysis
    (symbol, date, var_95_1d, var_99_1d, cvar_95_1d, cvar_99_1d, var_95_10d, var_99_10d, sharpe_ratio, sortino_ratio, max_drawdown, max_dd_peak, max_dd_trough)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const results = [];
  db.close();

  for (const { symbol, name, sector } of stocks) {
    const analysis = analyzeStockRisk(symbol);
    if (!analysis || analysis.error) {
      console.log(`  ${symbol}: skipped (${analysis?.error || 'not found'})`);
      continue;
    }

    const db2 = getDb();
    initSchema(db2);

    const var95d1 = analysis.var?.daily?.find(v => v.confidence === 0.95);
    const var99d1 = analysis.var?.daily?.find(v => v.confidence === 0.99);
    const var95d10 = analysis.var?.tenDay?.find(v => v.confidence === 0.95);
    const var99d10 = analysis.var?.tenDay?.find(v => v.confidence === 0.99);

    db2.prepare(`
      INSERT OR REPLACE INTO risk_analysis
      (symbol, date, var_95_1d, var_99_1d, cvar_95_1d, cvar_99_1d, var_95_10d, var_99_10d, sharpe_ratio, sortino_ratio, max_drawdown, max_dd_peak, max_dd_trough)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      symbol, today,
      var95d1?.var || null, var99d1?.var || null,
      var95d1?.cvar || null, var99d1?.cvar || null,
      var95d10?.var || null, var99d10?.var || null,
      analysis.sharpeRatio,
      analysis.sortinoRatio,
      analysis.maxDrawdown?.value || null,
      analysis.maxDrawdown?.peakDate || null,
      analysis.maxDrawdown?.troughDate || null,
    );

    db2.close();

    console.log(`  ${symbol} (${name}): VaR95=${(var95d1?.var * 100)?.toFixed(2) || 'N/A'}% Sharpe=${analysis.sharpeRatio?.toFixed(2) || 'N/A'} MaxDD=${(analysis.maxDrawdown?.value * 100)?.toFixed(1) || 'N/A'}%`);
    results.push(analysis);
  }

  return results;
}

// ─── Portfolio Risk Analysis ──────────────────────────────────────────
/**
 * Analyze risk for a portfolio (array of {symbol, weight} objects).
 * If no weights, equal-weight assumed.
 */
function analyzePortfolioRisk(holdings) {
  const db = getDb();
  initSchema(db);

  try {
    if (!holdings || holdings.length === 0) return null;

    // Normalize weights
    const totalWeight = holdings.reduce((s, h) => s + (h.weight || 1), 0);
    const normalizedHoldings = holdings.map(h => ({
      symbol: h.symbol,
      weight: (h.weight || 1) / totalWeight,
    }));

    // Fetch prices for all holdings
    const allPrices = {};
    for (const { symbol } of normalizedHoldings) {
      const prices = db.prepare(
        'SELECT date, close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
      ).all(symbol);
      allPrices[symbol] = Object.fromEntries(prices.map(p => [p.date, p.close]));
    }

    // Find common dates
    const dateSets = normalizedHoldings.map(h =>
      new Set(Object.keys(allPrices[h.symbol] || {}))
    );
    const commonDates = [...dateSets[0] || []].filter(d =>
      dateSets.every(s => s.has(d))
    ).sort();

    if (commonDates.length < 30) return { error: 'Insufficient common price data' };

    // Compute portfolio returns (weighted sum of individual returns)
    const portfolioReturns = [];
    for (let i = 1; i < commonDates.length; i++) {
      let portfolioReturn = 0;
      for (const { symbol, weight } of normalizedHoldings) {
        const prev = allPrices[symbol][commonDates[i - 1]];
        const curr = allPrices[symbol][commonDates[i]];
        if (prev > 0) {
          portfolioReturn += weight * ((curr - prev) / prev);
        }
      }
      portfolioReturns.push(portfolioReturn);
    }

    // Portfolio VaR
    const sorted = [...portfolioReturns].sort((a, b) => a - b);
    const varResults = [0.95, 0.99].map(confidence => {
      const idx = Math.floor(sorted.length * (1 - confidence));
      const varVal = -sorted[idx];
      const tail = sorted.slice(0, idx + 1);
      const cvar = tail.length > 0 ? -mean(tail) : varVal;
      return { confidence, var: varVal, cvar };
    });

    // Portfolio Sharpe
    const dailyRf = RISK_FREE_RATE / TRADING_DAYS;
    const excessReturns = portfolioReturns.map(r => r - dailyRf);
    const avgExcess = mean(excessReturns);
    const sigmaExcess = stddev(excessReturns);
    const sharpe = sigmaExcess > 0 ? (avgExcess / sigmaExcess) * Math.sqrt(TRADING_DAYS) : null;

    // Portfolio Sortino
    const downside = excessReturns.filter(r => r < 0);
    const downsideVar = downside.length > 0 ? downside.reduce((s, r) => s + r * r, 0) / downside.length : 0;
    const downsideDev = Math.sqrt(downsideVar);
    const sortino = downsideDev > 0 ? (avgExcess / downsideDev) * Math.sqrt(TRADING_DAYS) : null;

    // Portfolio volatility
    const portfolioVol = stddev(portfolioReturns) * Math.sqrt(TRADING_DAYS);

    // Diversification score
    const symbols = normalizedHoldings.map(h => h.symbol);
    const diversification = computeDiversificationScore(symbols);

    return {
      holdings: normalizedHoldings,
      dataPoints: portfolioReturns.length,
      var: varResults,
      sharpeRatio: sharpe,
      sortinoRatio: sortino,
      annualizedVolatility: portfolioVol,
      annualizedReturn: mean(portfolioReturns) * TRADING_DAYS,
      diversification,
    };
  } finally {
    db.close();
  }
}

// ─── Sector Risk Assessment ──────────────────────────────────────────
/**
 * Compute aggregate risk metrics for each TASI sector.
 * Returns per-sector: avg VaR, avg volatility, avg beta, risk rating,
 * worst-case stock, and stress test impact.
 */
function assessSectorRisks() {
  const db = getDb();
  initSchema(db);

  try {
    const sectors = db.prepare('SELECT DISTINCT sector FROM stocks WHERE sector IS NOT NULL').all().map(r => r.sector);
    const results = [];

    for (const sector of sectors) {
      const stocks = db.prepare('SELECT symbol, name FROM stocks WHERE sector = ?').all(sector);
      const metrics = [];

      for (const { symbol, name } of stocks) {
        const prices = db.prepare(
          'SELECT close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
        ).all(symbol).map(p => p.close);

        if (prices.length < 30) continue;

        const score = db.prepare(
          'SELECT volatility, beta, risk_level FROM stock_scores WHERE symbol = ? ORDER BY date DESC LIMIT 1'
        ).get(symbol);

        const var95 = computeVaR(prices, [0.95], 1);
        const sharpe = computeSharpeRatio(prices);
        const maxDD = computeMaxDrawdown(prices);

        metrics.push({
          symbol,
          name,
          volatility: score?.volatility || null,
          beta: score?.beta || null,
          riskLevel: score?.risk_level || 'medium',
          var95: var95?.[0]?.var || null,
          cvar95: var95?.[0]?.cvar || null,
          sharpe,
          maxDrawdown: maxDD?.maxDrawdown || null,
        });
      }

      if (metrics.length === 0) {
        results.push({ sector, stockCount: 0, error: 'No sufficient data' });
        continue;
      }

      const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const defined = (arr, key) => arr.map(m => m[key]).filter(v => v !== null);

      const avgVol = avg(defined(metrics, 'volatility'));
      const avgBeta = avg(defined(metrics, 'beta'));
      const avgVar95 = avg(defined(metrics, 'var95'));
      const avgCVar95 = avg(defined(metrics, 'cvar95'));
      const avgSharpe = avg(defined(metrics, 'sharpe'));
      const avgMaxDD = avg(defined(metrics, 'maxDrawdown'));

      // Sector risk rating
      let riskScore = 0;
      if (avgVol !== null) {
        if (avgVol > 0.40) riskScore += 3;
        else if (avgVol > 0.28) riskScore += 2;
        else riskScore += 1;
      }
      if (avgBeta !== null) {
        if (Math.abs(avgBeta) > 1.3) riskScore += 3;
        else if (Math.abs(avgBeta) > 1.0) riskScore += 2;
        else riskScore += 1;
      }
      if (avgVar95 !== null) {
        if (avgVar95 > 0.04) riskScore += 2;
        else if (avgVar95 > 0.025) riskScore += 1;
      }
      const sectorRiskLevel = riskScore >= 6 ? 'high' : riskScore >= 3 ? 'medium' : 'low';

      // Find highest-risk stock in sector
      const worstStock = metrics.reduce((worst, m) => {
        if (m.var95 !== null && (worst === null || m.var95 > worst.var95)) return m;
        return worst;
      }, null);

      // Stress test summary for sector
      const latestPrice = db.prepare(
        `SELECT dp.close, s.symbol FROM stocks s
         JOIN daily_prices dp ON s.symbol = dp.symbol
         WHERE s.sector = ? AND dp.date = (SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol)
         LIMIT 1`
      ).get(sector);
      const stressResults = stressTest(latestPrice?.close || 100, avgVol, avgBeta, sector);

      results.push({
        sector,
        stockCount: metrics.length,
        riskLevel: sectorRiskLevel,
        riskScore,
        avgVolatility: avgVol,
        avgBeta: avgBeta,
        avgVar95: avgVar95,
        avgCVar95: avgCVar95,
        avgSharpeRatio: avgSharpe,
        avgMaxDrawdown: avgMaxDD,
        worstStock: worstStock ? { symbol: worstStock.symbol, name: worstStock.name, var95: worstStock.var95 } : null,
        stressTests: stressResults,
        stocks: metrics,
      });
    }

    // Sort by risk score descending
    results.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
    return results;
  } finally {
    db.close();
  }
}

// ─── Risk Alerts ─────────────────────────────────────────────────────
/**
 * Scan all stocks for risk alert conditions.
 * Returns alerts for: high VaR, volatility spikes, drawdown warnings,
 * negative Sharpe, and concentration risk.
 */
function detectRiskAlerts() {
  const db = getDb();
  initSchema(db);

  try {
    const stocks = db.prepare('SELECT symbol, name, sector FROM stocks').all();
    const alerts = [];
    const today = new Date().toISOString().split('T')[0];

    for (const { symbol, name, sector } of stocks) {
      const prices = db.prepare(
        'SELECT date, close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
      ).all(symbol);
      const closes = prices.map(p => p.close);
      if (closes.length < 30) continue;

      const score = db.prepare(
        'SELECT volatility, beta, risk_level FROM stock_scores WHERE symbol = ? ORDER BY date DESC LIMIT 1'
      ).get(symbol);

      const var95 = computeVaR(closes, [0.95], 1);
      const sharpe = computeSharpeRatio(closes);
      const maxDD = computeMaxDrawdown(closes);

      // Alert: High daily VaR (>5% at 95% confidence)
      if (var95?.[0]?.var > 0.05) {
        alerts.push({
          type: 'high_var',
          severity: var95[0].var > 0.08 ? 'critical' : 'warning',
          symbol, name, sector,
          message: `VaR يومي مرتفع: ${(var95[0].var * 100).toFixed(2)}% عند مستوى ثقة 95%`,
          messageEn: `High daily VaR: ${(var95[0].var * 100).toFixed(2)}% at 95% confidence`,
          value: var95[0].var,
          date: today,
        });
      }

      // Alert: Volatility spike (>50% annualized)
      if (score?.volatility > 0.50) {
        alerts.push({
          type: 'volatility_spike',
          severity: score.volatility > 0.70 ? 'critical' : 'warning',
          symbol, name, sector,
          message: `تقلب مرتفع: ${(score.volatility * 100).toFixed(1)}% سنوياً`,
          messageEn: `High volatility: ${(score.volatility * 100).toFixed(1)}% annualized`,
          value: score.volatility,
          date: today,
        });
      }

      // Alert: Deep drawdown (>25%)
      if (maxDD?.maxDrawdown > 0.25) {
        alerts.push({
          type: 'drawdown_warning',
          severity: maxDD.maxDrawdown > 0.40 ? 'critical' : 'warning',
          symbol, name, sector,
          message: `انخفاض حاد: ${(maxDD.maxDrawdown * 100).toFixed(1)}% من القمة`,
          messageEn: `Deep drawdown: ${(maxDD.maxDrawdown * 100).toFixed(1)}% from peak`,
          value: maxDD.maxDrawdown,
          peakDate: prices[maxDD.peakIndex]?.date,
          troughDate: prices[maxDD.troughIndex]?.date,
          date: today,
        });
      }

      // Alert: Negative Sharpe ratio (risk-adjusted returns negative)
      if (sharpe !== null && sharpe < -0.5) {
        alerts.push({
          type: 'negative_sharpe',
          severity: sharpe < -1.0 ? 'critical' : 'warning',
          symbol, name, sector,
          message: `عائد سلبي معدّل بالمخاطر: نسبة شارب ${sharpe.toFixed(2)}`,
          messageEn: `Negative risk-adjusted return: Sharpe ratio ${sharpe.toFixed(2)}`,
          value: sharpe,
          date: today,
        });
      }

      // Alert: High beta (>1.8 — very sensitive to market moves)
      if (score?.beta > 1.8) {
        alerts.push({
          type: 'high_beta',
          severity: 'warning',
          symbol, name, sector,
          message: `بيتا مرتفع: ${score.beta.toFixed(2)} — حساسية عالية لتحركات السوق`,
          messageEn: `High beta: ${score.beta.toFixed(2)} — highly sensitive to market moves`,
          value: score.beta,
          date: today,
        });
      }
    }

    // Sort: critical first, then warning
    alerts.sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
      return (sev[a.severity] || 2) - (sev[b.severity] || 2);
    });

    return {
      date: today,
      totalAlerts: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      warnings: alerts.filter(a => a.severity === 'warning').length,
      alerts,
    };
  } finally {
    db.close();
  }
}

// ─── Risk Summary (All Stocks) ───────────────────────────────────────
/**
 * Get a compact risk overview for all stocks, suitable for dashboards.
 */
function getRiskSummary() {
  const db = getDb();
  initSchema(db);

  try {
    const stocks = db.prepare('SELECT symbol, name, sector FROM stocks').all();
    const summary = [];

    for (const { symbol, name, sector } of stocks) {
      const prices = db.prepare(
        'SELECT close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
      ).all(symbol).map(p => p.close);

      if (prices.length < 30) {
        summary.push({ symbol, name, sector, error: 'Insufficient data' });
        continue;
      }

      const score = db.prepare(
        'SELECT volatility, beta, risk_level FROM stock_scores WHERE symbol = ? ORDER BY date DESC LIMIT 1'
      ).get(symbol);

      const var95 = computeVaR(prices, [0.95], 1);
      const sharpe = computeSharpeRatio(prices);

      summary.push({
        symbol, name, sector,
        riskLevel: score?.risk_level || 'medium',
        volatility: score?.volatility || null,
        beta: score?.beta || null,
        var95: var95?.[0]?.var || null,
        cvar95: var95?.[0]?.cvar || null,
        sharpeRatio: sharpe,
      });
    }

    // Aggregate stats
    const defined = (key) => summary.filter(s => s[key] !== null && s[key] !== undefined).map(s => s[key]);
    const riskDist = { low: 0, medium: 0, high: 0 };
    for (const s of summary) { if (s.riskLevel) riskDist[s.riskLevel] = (riskDist[s.riskLevel] || 0) + 1; }

    return {
      totalStocks: summary.length,
      riskDistribution: riskDist,
      marketAvgVolatility: defined('volatility').length > 0
        ? defined('volatility').reduce((a, b) => a + b, 0) / defined('volatility').length : null,
      marketAvgVar95: defined('var95').length > 0
        ? defined('var95').reduce((a, b) => a + b, 0) / defined('var95').length : null,
      stocks: summary,
    };
  } finally {
    db.close();
  }
}

// ─── Arabic Risk Report ──────────────────────────────────────────────
/**
 * Generate a formatted Arabic risk report for a stock or portfolio.
 */
function generateArabicRiskReport(analysis) {
  if (!analysis) return null;

  const riskLevelAr = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' };
  const severityAr = { low: 'منخفض', moderate: 'متوسط', high: 'مرتفع', severe: 'حاد' };

  if (analysis.holdings) {
    // Portfolio report
    const lines = [
      `# تقرير مخاطر المحفظة`,
      ``,
      `## ملخص`,
      `- عدد الأسهم: ${analysis.holdings.length}`,
      `- التقلب السنوي: ${analysis.annualizedVolatility ? (analysis.annualizedVolatility * 100).toFixed(1) + '%' : 'غير متوفر'}`,
      `- العائد السنوي: ${analysis.annualizedReturn ? (analysis.annualizedReturn * 100).toFixed(1) + '%' : 'غير متوفر'}`,
      `- نسبة شارب: ${analysis.sharpeRatio?.toFixed(2) || 'غير متوفر'}`,
      `- نسبة سورتينو: ${analysis.sortinoRatio?.toFixed(2) || 'غير متوفر'}`,
      ``,
      `## القيمة المعرضة للخطر (VaR)`,
    ];

    if (analysis.var) {
      for (const v of analysis.var) {
        lines.push(`- مستوى ثقة ${(v.confidence * 100).toFixed(0)}%: خسارة يومية محتملة ${(v.var * 100).toFixed(2)}% (CVaR: ${(v.cvar * 100).toFixed(2)}%)`);
      }
    }

    if (analysis.diversification) {
      lines.push(``, `## التنويع`);
      lines.push(`- درجة التنويع: ${analysis.diversification.score}/${analysis.diversification.maxScore}`);
      if (analysis.diversification.recommendations?.length > 0) {
        lines.push(``, `### توصيات التنويع`);
        for (const rec of analysis.diversification.recommendations) {
          lines.push(`- ${rec}`);
        }
      }
    }

    return lines.join('\n');
  }

  // Individual stock report
  const lines = [
    `# تقرير المخاطر: ${analysis.name} (${analysis.symbol})`,
    ``,
    `## معلومات أساسية`,
    `- القطاع: ${analysis.sector}`,
    `- السعر الحالي: ${analysis.latestPrice?.toFixed(2)} ريال`,
    `- تاريخ آخر تحديث: ${analysis.latestDate}`,
    `- مستوى المخاطرة: **${riskLevelAr[analysis.riskLevel] || analysis.riskLevel}**`,
    ``,
    `## مؤشرات المخاطر`,
    `- التقلب السنوي: ${analysis.volatility ? (analysis.volatility * 100).toFixed(1) + '%' : 'غير متوفر'}`,
    `- بيتا: ${analysis.beta?.toFixed(2) || 'غير متوفر'}`,
    `- نسبة شارب: ${analysis.sharpeRatio?.toFixed(2) || 'غير متوفر'}`,
    `- نسبة سورتينو: ${analysis.sortinoRatio?.toFixed(2) || 'غير متوفر'}`,
  ];

  if (analysis.maxDrawdown) {
    lines.push(`- أقصى انخفاض: ${(analysis.maxDrawdown.value * 100).toFixed(1)}% (من ${analysis.maxDrawdown.peakDate} إلى ${analysis.maxDrawdown.troughDate})`);
  }

  lines.push(``, `## القيمة المعرضة للخطر (VaR)`);
  if (analysis.var?.daily) {
    lines.push(`### يومي`);
    for (const v of analysis.var.daily) {
      lines.push(`- مستوى ثقة ${(v.confidence * 100).toFixed(0)}%: خسارة ${(v.var * 100).toFixed(2)}% (CVaR: ${(v.cvar * 100).toFixed(2)}%)`);
    }
  }
  if (analysis.var?.tenDay) {
    lines.push(`### عشرة أيام`);
    for (const v of analysis.var.tenDay) {
      lines.push(`- مستوى ثقة ${(v.confidence * 100).toFixed(0)}%: خسارة ${(v.var * 100).toFixed(2)}% (CVaR: ${v.cvar ? (v.cvar * 100).toFixed(2) + '%' : 'غير متوفر'})`);
    }
  }

  if (analysis.stressTests) {
    lines.push(``, `## اختبارات الضغط`);
    for (const st of analysis.stressTests) {
      lines.push(`- **${st.scenarioAr}**: خسارة ${(st.lossPct * 100).toFixed(1)}% → ${st.projectedPrice.toFixed(2)} ريال (شدة: ${severityAr[st.severity] || st.severity})`);
    }
  }

  lines.push(``, `---`, `*هذا التقرير لأغراض تعليمية فقط ولا يُعتبر نصيحة استثمارية. استشر مستشارك المالي قبل اتخاذ أي قرار استثماري.*`);

  return lines.join('\n');
}

module.exports = {
  computeVaR,
  computeParametricVaR,
  computeSharpeRatio,
  computeSortinoRatio,
  computeMaxDrawdown,
  stressTest,
  computeDiversificationScore,
  computeSectorCorrelations,
  analyzeStockRisk,
  analyzeAllRisks,
  analyzePortfolioRisk,
  assessSectorRisks,
  detectRiskAlerts,
  getRiskSummary,
  generateArabicRiskReport,
  RISK_FREE_RATE,
};
