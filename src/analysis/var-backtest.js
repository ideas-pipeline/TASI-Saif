const { getDb, initSchema } = require('../db/schema');
const {
  computeVaR,
  computeParametricVaR,
  computeSharpeRatio,
  computeSortinoRatio,
} = require('./risk-engine');

// ─── VaR Backtesting Framework ────────────────────────────────────────
/**
 * Backtest VaR predictions against realized losses.
 * Compare predicted VaR (95%, 99%) vs actual daily/10-day returns.
 * Calculate hit rates and track model accuracy over time.
 */

const TRADING_DAYS = 252;

/**
 * Compute realized returns for a given horizon
 * @param {number[]} closePrices - Daily close prices
 * @param {number} horizon - Time horizon in days (1, 10, etc)
 * @returns {number[]} Array of realized returns
 */
function computeRealizedReturns(closePrices, horizon = 1) {
  const returns = [];
  for (let i = horizon; i < closePrices.length; i++) {
    const startPrice = closePrices[i - horizon];
    const endPrice = closePrices[i];
    if (startPrice > 0) {
      const ret = (endPrice - startPrice) / startPrice;
      returns.push(ret);
    }
  }
  return returns;
}

/**
 * Run VaR backtest for a single stock over a time period
 * @param {string} symbol - Stock symbol
 * @param {Date} startDate - Backtest start date
 * @param {Date} endDate - Backtest end date
 * @param {number} lookbackDays - Window for VaR calculation (e.g., 252)
 * @returns {object} Backtest results with hit rates and accuracy metrics
 */
function backtestVaRForStock(symbol, startDate, endDate, lookbackDays = 252) {
  const db = getDb();
  initSchema(db);

  try {
    // Fetch all prices for the symbol
    const allPrices = db.prepare(
      'SELECT date, close FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
    ).all(symbol);

    if (allPrices.length < lookbackDays + 30) {
      return {
        symbol,
        error: `Insufficient data for backtest (${allPrices.length} days, need ${lookbackDays + 30})`,
        results: [],
      };
    }

    // Filter to date range
    const startIdx = allPrices.findIndex(p => new Date(p.date) >= startDate);
    const endIdx = allPrices.findIndex(p => new Date(p.date) >= endDate);

    if (startIdx < 0 || endIdx < 0) {
      return {
        symbol,
        error: 'Date range not found in price history',
        results: [],
      };
    }

    const results = [];
    const hitRates95 = { daily: [], tenDay: [] };
    const hitRates99 = { daily: [], tenDay: [] };
    const parameterChanges = { volatility: [], beta: [] };

    // Walk through the test period
    // For each day, use lookback window to calculate VaR, then check if realized loss exceeds it
    for (let i = startIdx + lookbackDays; i < endIdx; i++) {
      const testDate = allPrices[i].date;
      const historyWindow = allPrices.slice(i - lookbackDays, i);
      const closePrices = historyWindow.map(p => p.close);

      // Compute VaR predictions
      const var1day = computeVaR(closePrices, [0.95, 0.99], 1);
      const var10day = computeVaR(closePrices, [0.95, 0.99], 10);

      // Compute realized returns - note: need sufficient future data for 10-day horizon
      const realized1day = i + 1 < allPrices.length
        ? computeRealizedReturns(allPrices.slice(i, i + 2), 1)
        : [];
      const realized10day = i + 10 < allPrices.length
        ? computeRealizedReturns(allPrices.slice(i, i + 11), 10)
        : [];

      // Check VaR hits (realized loss > predicted VaR)
      const loss1day = realized1day.length > 0 ? realized1day[0] : 0;
      const loss10day = realized10day.length > 0 ? realized10day[0] : 0;

      if (var1day) {
        const var95_1d = var1day.find(v => v.confidence === 0.95);
        const var99_1d = var1day.find(v => v.confidence === 0.99);

        if (var95_1d) {
          const hit95 = Math.abs(loss1day) > var95_1d.var ? 1 : 0;
          hitRates95.daily.push(hit95);
        }

        if (var99_1d) {
          const hit99 = Math.abs(loss1day) > var99_1d.var ? 1 : 0;
          hitRates99.daily.push(hit99);
        }
      }

      if (var10day) {
        const var95_10d = var10day.find(v => v.confidence === 0.95);
        const var99_10d = var10day.find(v => v.confidence === 0.99);

        if (var95_10d) {
          const hit95 = Math.abs(loss10day) > var95_10d.var ? 1 : 0;
          hitRates95.tenDay.push(hit95);
        }

        if (var99_10d) {
          const hit99 = Math.abs(loss10day) > var99_10d.var ? 1 : 0;
          hitRates99.tenDay.push(hit99);
        }
      }

      results.push({
        date: testDate,
        var1day,
        var10day,
        realizedLoss1day: loss1day,
        realizedLoss10day: loss10day,
      });
    }

    // Calculate average hit rates
    const avgHitRate95Daily = hitRates95.daily.length > 0
      ? hitRates95.daily.reduce((a, b) => a + b, 0) / hitRates95.daily.length
      : null;
    const avgHitRate99Daily = hitRates99.daily.length > 0
      ? hitRates99.daily.reduce((a, b) => a + b, 0) / hitRates99.daily.length
      : null;
    const avgHitRate95TenDay = hitRates95.tenDay.length > 0
      ? hitRates95.tenDay.reduce((a, b) => a + b, 0) / hitRates95.tenDay.length
      : null;
    const avgHitRate99TenDay = hitRates99.tenDay.length > 0
      ? hitRates99.tenDay.reduce((a, b) => a + b, 0) / hitRates99.tenDay.length
      : null;

    // Expected hit rates: 5% for 95% VaR, 1% for 99% VaR
    // Check for accuracy tolerance (±2%)
    const TOLERANCE = 0.02;
    const needsRecalibration = (actual) => {
      return actual !== null && Math.abs(actual - 0.05) > TOLERANCE && Math.abs(actual - 0.01) > TOLERANCE;
    };

    const summary = {
      symbol,
      testPeriod: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
      testDays: results.length,
      hitRates: {
        daily: {
          var95: {
            actual: avgHitRate95Daily,
            expected: 0.05,
            accuracy: avgHitRate95Daily ? Math.abs(avgHitRate95Daily - 0.05) : null,
            status: avgHitRate95Daily ? (Math.abs(avgHitRate95Daily - 0.05) <= TOLERANCE ? '✅ Within tolerance' : '⚠️ Needs calibration') : null,
          },
          var99: {
            actual: avgHitRate99Daily,
            expected: 0.01,
            accuracy: avgHitRate99Daily ? Math.abs(avgHitRate99Daily - 0.01) : null,
            status: avgHitRate99Daily ? (Math.abs(avgHitRate99Daily - 0.01) <= TOLERANCE ? '✅ Within tolerance' : '⚠️ Needs calibration') : null,
          },
        },
        tenDay: {
          var95: {
            actual: avgHitRate95TenDay,
            expected: 0.05,
            accuracy: avgHitRate95TenDay ? Math.abs(avgHitRate95TenDay - 0.05) : null,
            status: avgHitRate95TenDay ? (Math.abs(avgHitRate95TenDay - 0.05) <= TOLERANCE ? '✅ Within tolerance' : '⚠️ Needs calibration') : null,
          },
          var99: {
            actual: avgHitRate99TenDay,
            expected: 0.01,
            accuracy: avgHitRate99TenDay ? Math.abs(avgHitRate99TenDay - 0.01) : null,
            status: avgHitRate99TenDay ? (Math.abs(avgHitRate99TenDay - 0.01) <= TOLERANCE ? '✅ Within tolerance' : '⚠️ Needs calibration') : null,
          },
        },
      },
      recalibrationNeeded: avgHitRate95Daily ? Math.abs(avgHitRate95Daily - 0.05) > TOLERANCE : false || avgHitRate99Daily ? Math.abs(avgHitRate99Daily - 0.01) > TOLERANCE : false,
      parameterStability: {
        averageDeviation: parameterChanges.volatility.length > 0
          ? parameterChanges.volatility.reduce((a, b) => a + b, 0) / parameterChanges.volatility.length
          : null,
      },
    };

    return { symbol, summary, results: results.slice(-30) }; // Return last 30 days for brevity
  } finally {
    db.close();
  }
}

/**
 * Run VaR backtest across all TASI stocks
 * @param {Date} startDate - Backtest start
 * @param {Date} endDate - Backtest end
 * @returns {object} Summary across all stocks
 */
function backtestVaRAllStocks(startDate, endDate) {
  const db = getDb();
  initSchema(db);

  try {
    const stocks = db.prepare('SELECT symbol FROM stocks').all();
    const backtests = [];

    for (const { symbol } of stocks) {
      const result = backtestVaRForStock(symbol, startDate, endDate);
      if (!result.error) {
        backtests.push(result.summary);
      }
    }

    // Aggregate statistics
    const validBacktests = backtests.filter(b => b.hitRates);
    const avgHitRate95Daily = validBacktests.length > 0
      ? validBacktests.reduce((sum, b) => sum + (b.hitRates.daily.var95.actual || 0), 0) / validBacktests.length
      : null;
    const avgHitRate99Daily = validBacktests.length > 0
      ? validBacktests.reduce((sum, b) => sum + (b.hitRates.daily.var99.actual || 0), 0) / validBacktests.length
      : null;

    return {
      period: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
      stocksAnalyzed: backtests.length,
      aggregateHitRates: {
        daily: {
          var95: { actual: avgHitRate95Daily, expected: 0.05 },
          var99: { actual: avgHitRate99Daily, expected: 0.01 },
        },
      },
      backtests,
    };
  } finally {
    db.close();
  }
}

/**
 * Generate monthly VaR accuracy report
 * Tracks model performance and identifies periods needing recalibration
 */
function generateMonthlyReport(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const report = backtestVaRAllStocks(startDate, endDate);

  const getAccuracy = (actual, expected) => {
    if (actual === null) return null;
    return {
      value: actual,
      expected,
      deviation: actual - expected,
      deviationPct: ((actual - expected) / expected * 100).toFixed(1) + '%',
      status: Math.abs(actual - expected) <= 0.02 ? '✅ Within tolerance' : '⚠️ Needs calibration',
    };
  };

  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    summary: report,
    accuracy: {
      daily: {
        var95: getAccuracy(report.aggregateHitRates.daily.var95.actual, 0.05),
        var99: getAccuracy(report.aggregateHitRates.daily.var99.actual, 0.01),
      },
    },
  };
}

/**
 * Store backtest results in database for historical tracking
 * Enables trend analysis and model drift detection
 */
function storeBacktestResults(backtestSummary) {
  const db = getDb();
  initSchema(db);

  try {
    // Create backtest_results table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS backtest_results (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        symbol TEXT NOT NULL,
        var95_hit_rate REAL,
        var99_hit_rate REAL,
        var95_10day_hit_rate REAL,
        var99_10day_hit_rate REAL,
        needs_recalibration INTEGER,
        test_period_start TEXT,
        test_period_end TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const { v4: uuid } = require('uuid');
    const now = new Date().toISOString().split('T')[0];

    const stmt = db.prepare(`
      INSERT INTO backtest_results (
        id, date, symbol, var95_hit_rate, var99_hit_rate,
        var95_10day_hit_rate, var99_10day_hit_rate, needs_recalibration,
        test_period_start, test_period_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const { symbol, hitRates, testPeriod, recalibrationNeeded } = backtestSummary;
    stmt.run(
      uuid(),
      now,
      symbol,
      hitRates.daily.var95.actual,
      hitRates.daily.var99.actual,
      hitRates.tenDay.var95.actual,
      hitRates.tenDay.var99.actual,
      recalibrationNeeded ? 1 : 0,
      testPeriod.start,
      testPeriod.end
    );
  } finally {
    db.close();
  }
}

/**
 * Get backtest history for a stock (last N months)
 * Useful for detecting model drift over time
 */
function getBacktestHistory(symbol, months = 6) {
  const db = getDb();
  initSchema(db);

  try {
    // Create backtest_results table if needed
    db.exec(`
      CREATE TABLE IF NOT EXISTS backtest_results (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        symbol TEXT NOT NULL,
        var95_hit_rate REAL,
        var99_hit_rate REAL,
        var95_10day_hit_rate REAL,
        var99_10day_hit_rate REAL,
        needs_recalibration INTEGER,
        test_period_start TEXT,
        test_period_end TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    const history = db.prepare(`
      SELECT * FROM backtest_results
      WHERE symbol = ? AND date >= ?
      ORDER BY date ASC
    `).all(symbol, cutoffDate.toISOString().split('T')[0]);

    return {
      symbol,
      months,
      entries: history.length,
      data: history,
      driftDetected: history.some(h => h.needs_recalibration),
    };
  } finally {
    db.close();
  }
}

module.exports = {
  backtestVaRForStock,
  backtestVaRAllStocks,
  generateMonthlyReport,
  computeRealizedReturns,
  storeBacktestResults,
  getBacktestHistory,
};
