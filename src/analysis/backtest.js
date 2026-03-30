const { getDb, initSchema } = require('../db/schema');
const { scanPatterns, computeSupportResistance, computeFibonacciLevels, generateRecommendation, initCandlestickSchema } = require('./candlestick');

const DEFAULT_HOLD_DAYS = 10;
const DEFAULT_STOP_LOSS_PCT = 0.03;

/**
 * Run a backtest on a single symbol's historical data.
 * Walks through the candle history, generating recommendations at each point
 * and evaluating whether the signal was correct over the forward window.
 */
function backtestSymbol(symbol, { holdDays = DEFAULT_HOLD_DAYS, minDataPoints = 60 } = {}) {
  const db = getDb();
  initSchema(db);

  const rows = db.prepare(
    'SELECT date, open, high, low, close, volume FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
  ).all(symbol);

  db.close();

  if (rows.length < minDataPoints) {
    return { symbol, trades: [], error: `Insufficient data (${rows.length} < ${minDataPoints})` };
  }

  const trades = [];
  // Walk through history, using a lookback window to generate signals
  // Start at index 60 (need enough history) and step every 5 days to avoid overlapping trades
  const startIdx = Math.max(60, Math.floor(rows.length * 0.2));
  const step = 5;

  for (let i = startIdx; i < rows.length - holdDays; i += step) {
    const historyWindow = rows.slice(0, i + 1);
    const forwardWindow = rows.slice(i + 1, i + 1 + holdDays);

    if (forwardWindow.length === 0) continue;

    // Generate recommendation based on history up to this point
    const patterns = scanPatterns(historyWindow);
    const sr = computeSupportResistance(historyWindow);
    const fib = computeFibonacciLevels(historyWindow);
    const rec = generateRecommendation(symbol, historyWindow, patterns, sr, fib);

    if (!rec || rec.direction === 'hold') continue;

    const entryPrice = rec.currentPrice;
    const isBuy = rec.direction === 'buy' || rec.direction === 'strong_buy';

    // Evaluate the trade over the forward window
    let exitPrice = forwardWindow[forwardWindow.length - 1].close;
    let exitReason = 'hold_period';
    let exitDay = forwardWindow.length;

    // Check for stop-loss or target hit during the hold period
    for (let j = 0; j < forwardWindow.length; j++) {
      const day = forwardWindow[j];

      if (isBuy) {
        // Check stop loss (using low of day)
        if (rec.stopLoss && day.low <= rec.stopLoss) {
          exitPrice = rec.stopLoss;
          exitReason = 'stop_loss';
          exitDay = j + 1;
          break;
        }
        // Check target 1 (using high of day)
        if (rec.target1 && day.high >= rec.target1) {
          exitPrice = rec.target1;
          exitReason = 'target_hit';
          exitDay = j + 1;
          break;
        }
      } else {
        // Sell/short: inverse logic
        if (rec.stopLoss && day.high >= rec.stopLoss) {
          exitPrice = rec.stopLoss;
          exitReason = 'stop_loss';
          exitDay = j + 1;
          break;
        }
        if (rec.target1 && day.low <= rec.target1) {
          exitPrice = rec.target1;
          exitReason = 'target_hit';
          exitDay = j + 1;
          break;
        }
      }
    }

    // Calculate P&L
    const pnlPct = isBuy
      ? (exitPrice - entryPrice) / entryPrice
      : (entryPrice - exitPrice) / entryPrice;

    const correct = pnlPct > 0;

    trades.push({
      symbol,
      date: rec.date,
      direction: rec.direction,
      entryPrice,
      exitPrice: Math.round(exitPrice * 100) / 100,
      stopLoss: rec.stopLoss,
      target1: rec.target1,
      pnlPct: Math.round(pnlPct * 10000) / 10000,
      exitReason,
      exitDay,
      correct,
      patternScore: rec.patternScore,
      indicatorScore: rec.indicatorScore,
      combinedScore: rec.combinedScore,
      confluenceSignals: rec.confluenceSignals,
      recentPatterns: rec.recentPatterns,
    });
  }

  return { symbol, trades };
}

/**
 * Aggregate backtest results into summary statistics.
 */
function summarizeTrades(trades) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      avgPnl: 0,
      totalPnl: 0,
      maxWin: 0,
      maxLoss: 0,
      profitFactor: 0,
      avgHoldDays: 0,
      byDirection: {},
      byExitReason: {},
    };
  }

  const wins = trades.filter(t => t.correct);
  const losses = trades.filter(t => !t.correct);
  const pnls = trades.map(t => t.pnlPct);

  const totalWinPnl = wins.reduce((s, t) => s + t.pnlPct, 0);
  const totalLossPnl = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));

  // By direction
  const byDirection = {};
  for (const t of trades) {
    if (!byDirection[t.direction]) byDirection[t.direction] = { total: 0, wins: 0, pnl: 0 };
    byDirection[t.direction].total++;
    if (t.correct) byDirection[t.direction].wins++;
    byDirection[t.direction].pnl += t.pnlPct;
  }
  for (const dir of Object.keys(byDirection)) {
    byDirection[dir].winRate = Math.round(byDirection[dir].wins / byDirection[dir].total * 10000) / 100;
    byDirection[dir].pnl = Math.round(byDirection[dir].pnl * 10000) / 10000;
  }

  // By exit reason
  const byExitReason = {};
  for (const t of trades) {
    if (!byExitReason[t.exitReason]) byExitReason[t.exitReason] = { total: 0, wins: 0 };
    byExitReason[t.exitReason].total++;
    if (t.correct) byExitReason[t.exitReason].wins++;
  }

  return {
    totalTrades: trades.length,
    winRate: Math.round(wins.length / trades.length * 10000) / 100,
    avgPnl: Math.round(pnls.reduce((a, b) => a + b, 0) / pnls.length * 10000) / 10000,
    totalPnl: Math.round(pnls.reduce((a, b) => a + b, 0) * 10000) / 10000,
    maxWin: Math.round(Math.max(...pnls) * 10000) / 10000,
    maxLoss: Math.round(Math.min(...pnls) * 10000) / 10000,
    profitFactor: totalLossPnl > 0 ? Math.round(totalWinPnl / totalLossPnl * 100) / 100 : totalWinPnl > 0 ? Infinity : 0,
    avgHoldDays: Math.round(trades.reduce((s, t) => s + t.exitDay, 0) / trades.length * 10) / 10,
    byDirection,
    byExitReason,
  };
}

/**
 * Run backtests for all stocks and produce an aggregate report.
 */
function backtestAll({ holdDays = DEFAULT_HOLD_DAYS } = {}) {
  const db = getDb();
  initSchema(db);
  const symbols = db.prepare('SELECT symbol, name FROM stocks').all();
  db.close();

  const allTrades = [];
  const perSymbol = [];

  for (const { symbol, name } of symbols) {
    const result = backtestSymbol(symbol, { holdDays });
    if (result.error) {
      console.log(`  ${symbol} (${name}): ${result.error}`);
      continue;
    }
    const summary = summarizeTrades(result.trades);
    console.log(`  ${symbol} (${name}): ${summary.totalTrades} trades, win rate=${summary.winRate}%, avg P&L=${(summary.avgPnl * 100).toFixed(2)}%`);
    allTrades.push(...result.trades);
    perSymbol.push({ symbol, name, ...summary });
  }

  const overall = summarizeTrades(allTrades);

  console.log(`\n=== Backtest Summary ===`);
  console.log(`Total trades: ${overall.totalTrades}`);
  console.log(`Win rate: ${overall.winRate}%`);
  console.log(`Average P&L per trade: ${(overall.avgPnl * 100).toFixed(2)}%`);
  console.log(`Total P&L: ${(overall.totalPnl * 100).toFixed(2)}%`);
  console.log(`Profit factor: ${overall.profitFactor}`);
  console.log(`Max win: ${(overall.maxWin * 100).toFixed(2)}%`);
  console.log(`Max loss: ${(overall.maxLoss * 100).toFixed(2)}%`);
  console.log(`Avg hold: ${overall.avgHoldDays} days`);

  if (overall.byDirection) {
    console.log(`\nBy Direction:`);
    for (const [dir, stats] of Object.entries(overall.byDirection)) {
      console.log(`  ${dir}: ${stats.total} trades, win rate=${stats.winRate}%`);
    }
  }

  const targetMet = overall.winRate >= 65;
  console.log(`\nTarget accuracy (65%): ${targetMet ? 'MET' : 'NOT MET'} (${overall.winRate}%)`);

  return { overall, perSymbol, targetMet };
}

/**
 * Store backtest results in the database for reference.
 */
function storeBacktestResults(results) {
  const db = getDb();
  initSchema(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_results (
      run_date      TEXT NOT NULL,
      symbol        TEXT,
      total_trades  INTEGER,
      win_rate      REAL,
      avg_pnl       REAL,
      total_pnl     REAL,
      profit_factor REAL,
      max_win       REAL,
      max_loss      REAL,
      avg_hold_days REAL,
      target_met    INTEGER,
      details       TEXT,
      PRIMARY KEY (run_date, symbol)
    );
  `);

  const insert = db.prepare(
    'INSERT OR REPLACE INTO backtest_results (run_date, symbol, total_trades, win_rate, avg_pnl, total_pnl, profit_factor, max_win, max_loss, avg_hold_days, target_met, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const runDate = new Date().toISOString().split('T')[0];

  const storeAll = db.transaction(() => {
    // Overall
    insert.run(runDate, '_overall', results.overall.totalTrades, results.overall.winRate,
      results.overall.avgPnl, results.overall.totalPnl, results.overall.profitFactor,
      results.overall.maxWin, results.overall.maxLoss, results.overall.avgHoldDays,
      results.targetMet ? 1 : 0, JSON.stringify(results.overall.byDirection));

    // Per symbol
    for (const s of results.perSymbol) {
      insert.run(runDate, s.symbol, s.totalTrades, s.winRate,
        s.avgPnl, s.totalPnl, s.profitFactor,
        s.maxWin, s.maxLoss, s.avgHoldDays,
        s.winRate >= 65 ? 1 : 0, JSON.stringify(s.byDirection));
    }
  });

  storeAll();
  db.close();
}

module.exports = {
  backtestSymbol,
  backtestAll,
  summarizeTrades,
  storeBacktestResults,
};
