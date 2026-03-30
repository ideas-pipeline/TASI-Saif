const { getDb, initSchema } = require('../db/schema');

/**
 * Compute sector-level analysis and trends.
 */
function analyzeSectors() {
  const db = getDb();
  initSchema(db);

  const latestDate = db.prepare(
    'SELECT MAX(date) as date FROM stock_scores'
  ).get()?.date;

  if (!latestDate) {
    console.error('No stock scores found. Run scoring first.');
    db.close();
    return [];
  }

  const sectors = db.prepare(
    'SELECT DISTINCT sector FROM stocks ORDER BY sector'
  ).all().map(r => r.sector);

  const insertSector = db.prepare(`
    INSERT OR REPLACE INTO sector_analysis
    (sector, date, avg_score, top_stock, trend, avg_rsi, avg_pe, stock_count, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const results = [];
  for (const sector of sectors) {
    // Get all stocks in this sector with their scores
    const stockScores = db.prepare(`
      SELECT s.symbol, s.name, s.pe_ratio, ss.overall_score, ss.technical_score,
             ss.entry_signal, ss.risk_level,
             ti.rsi_14
      FROM stocks s
      JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
      LEFT JOIN technical_indicators ti ON s.symbol = ti.symbol AND ti.date = ?
      WHERE s.sector = ?
      ORDER BY ss.overall_score DESC
    `).all(latestDate, latestDate, sector);

    if (stockScores.length === 0) continue;

    const avgScore = stockScores.reduce((sum, s) => sum + (s.overall_score || 0), 0) / stockScores.length;
    const topStock = stockScores[0].symbol;

    const rsiValues = stockScores.filter(s => s.rsi_14 !== null).map(s => s.rsi_14);
    const avgRsi = rsiValues.length > 0
      ? rsiValues.reduce((a, b) => a + b, 0) / rsiValues.length
      : null;

    const peValues = stockScores.filter(s => s.pe_ratio !== null && s.pe_ratio > 0).map(s => s.pe_ratio);
    const avgPe = peValues.length > 0
      ? peValues.reduce((a, b) => a + b, 0) / peValues.length
      : null;

    // Determine sector trend
    let trend;
    if (avgRsi !== null) {
      if (avgRsi > 60 && avgScore > 6) trend = 'bullish';
      else if (avgRsi < 40 && avgScore < 4) trend = 'bearish';
      else trend = 'neutral';
    } else {
      trend = avgScore > 6 ? 'bullish' : avgScore < 4 ? 'bearish' : 'neutral';
    }

    const buySignals = stockScores.filter(s => s.entry_signal === 'buy' || s.entry_signal === 'strong_buy').length;
    const summary = `${sector}: ${stockScores.length} stocks, avg score ${avgScore.toFixed(1)}/10, ` +
      `trend ${trend}. ${buySignals} buy signals. Top: ${stockScores[0].name} (${topStock}).`;

    insertSector.run(
      sector, latestDate, avgScore, topStock, trend,
      avgRsi, avgPe, stockScores.length, summary
    );

    results.push({
      sector,
      avgScore: Math.round(avgScore * 10) / 10,
      topStock,
      topStockName: stockScores[0].name,
      trend,
      avgRsi: avgRsi ? Math.round(avgRsi * 10) / 10 : null,
      avgPe: avgPe ? Math.round(avgPe * 10) / 10 : null,
      stockCount: stockScores.length,
      buySignals,
      stocks: stockScores,
    });

    console.log(`  ${summary}`);
  }

  db.close();
  return results;
}

/**
 * Generate comprehensive sector reports with trends, comparisons,
 * rotation signals, and quarterly earnings alignment.
 */
function generateSectorReports() {
  const db = getDb();
  initSchema(db);
  initSectorReportsSchema(db);

  const latestDate = db.prepare(
    'SELECT MAX(date) as date FROM stock_scores'
  ).get()?.date;

  if (!latestDate) {
    db.close();
    return { date: null, sectors: [], rotation: [] };
  }

  const sectors = db.prepare(
    'SELECT DISTINCT sector FROM stocks ORDER BY sector'
  ).all().map(r => r.sector);

  const reports = [];

  for (const sector of sectors) {
    const report = buildSectorReport(db, sector, latestDate);
    if (report) reports.push(report);
  }

  // Compute sector rotation signals across all sectors
  const rotation = computeRotationSignals(db, reports, latestDate);

  // Store reports
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO sector_reports
    (sector, date, report_json)
    VALUES (?, ?, ?)
  `);
  for (const r of reports) {
    upsert.run(r.sector, latestDate, JSON.stringify(r));
  }

  db.close();
  return { date: latestDate, sectors: reports, rotation };
}

/**
 * Build a detailed report for one sector.
 */
function buildSectorReport(db, sector, latestDate) {
  // Current stocks with full scoring
  const stocks = db.prepare(`
    SELECT s.symbol, s.name, s.pe_ratio, s.dividend_yield, s.market_cap,
           ss.overall_score, ss.technical_score, ss.fundamental_score,
           ss.ai_score, ss.entry_signal, ss.risk_level, ss.volatility,
           ti.rsi_14, ti.macd_hist, ti.sma_20, ti.sma_50, ti.sma_200,
           ti.volume_ratio,
           dp.close as latest_price, dp.volume as latest_volume
    FROM stocks s
    JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
    LEFT JOIN technical_indicators ti ON s.symbol = ti.symbol AND ti.date = ?
    LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = (
      SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol
    )
    WHERE s.sector = ?
    ORDER BY ss.overall_score DESC
  `).all(latestDate, latestDate, sector);

  if (stocks.length === 0) return null;

  // Averages
  const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const validScores = stocks.filter(s => s.overall_score != null);
  const avgScore = avg(validScores.map(s => s.overall_score));
  const avgTechnical = avg(validScores.map(s => s.technical_score).filter(v => v != null));
  const avgFundamental = avg(validScores.map(s => s.fundamental_score).filter(v => v != null));
  const avgRsi = avg(stocks.map(s => s.rsi_14).filter(v => v != null));
  const avgPe = avg(stocks.map(s => s.pe_ratio).filter(v => v != null && v > 0));
  const avgDividendYield = avg(stocks.map(s => s.dividend_yield).filter(v => v != null && v > 0));
  const avgVolatility = avg(stocks.map(s => s.volatility).filter(v => v != null));
  const totalMarketCap = stocks.reduce((sum, s) => sum + (s.market_cap || 0), 0);

  // Top and bottom performers
  const topPerformers = stocks.slice(0, 3).map(s => ({
    symbol: s.symbol, name: s.name, score: s.overall_score, signal: s.entry_signal,
    price: s.latest_price, rsi: s.rsi_14,
  }));
  const bottomPerformers = stocks.slice(-3).reverse().map(s => ({
    symbol: s.symbol, name: s.name, score: s.overall_score, signal: s.entry_signal,
    price: s.latest_price, rsi: s.rsi_14,
  }));

  // Signal distribution
  const signalDist = {};
  for (const s of stocks) {
    const sig = s.entry_signal || 'hold';
    signalDist[sig] = (signalDist[sig] || 0) + 1;
  }

  // Trend determination
  let trend;
  if (avgRsi !== null) {
    if (avgRsi > 60 && avgScore > 6) trend = 'bullish';
    else if (avgRsi < 40 && avgScore < 4) trend = 'bearish';
    else trend = 'neutral';
  } else {
    trend = avgScore > 6 ? 'bullish' : avgScore < 4 ? 'bearish' : 'neutral';
  }

  // Historical trend — compare with scores from 7, 14, 30 days ago
  const historicalTrend = computeHistoricalTrend(db, sector, latestDate);

  // Quarterly earnings data
  const quarterlyEarnings = getQuarterlyEarnings(db, sector);

  // Sector price performance (avg return over recent periods)
  const pricePerformance = computeSectorPricePerformance(db, sector, latestDate);

  return {
    sector,
    stockCount: stocks.length,
    trend,
    avgScore: round2(avgScore),
    avgTechnical: round2(avgTechnical),
    avgFundamental: round2(avgFundamental),
    avgRsi: round2(avgRsi),
    avgPe: round2(avgPe),
    avgDividendYield: round2(avgDividendYield),
    avgVolatility: round2(avgVolatility),
    totalMarketCap,
    topPerformers,
    bottomPerformers,
    signalDistribution: signalDist,
    historicalTrend,
    pricePerformance,
    quarterlyEarnings,
    stocks: stocks.map(s => ({
      symbol: s.symbol,
      name: s.name,
      score: s.overall_score,
      technical: s.technical_score,
      fundamental: s.fundamental_score,
      signal: s.entry_signal,
      risk: s.risk_level,
      price: s.latest_price,
      pe: s.pe_ratio,
      rsi: s.rsi_14,
      volume: s.latest_volume,
      volumeRatio: s.volume_ratio,
    })),
  };
}

/**
 * Compare current sector scores with historical values.
 */
function computeHistoricalTrend(db, sector, latestDate) {
  const periods = [
    { label: '1w', days: 7 },
    { label: '2w', days: 14 },
    { label: '1m', days: 30 },
  ];
  const trend = {};

  for (const { label, days } of periods) {
    const pastDate = db.prepare(`
      SELECT MAX(date) as date FROM sector_analysis
      WHERE sector = ? AND date <= date(?, '-${days} days')
    `).get(sector, latestDate)?.date;

    if (!pastDate) {
      trend[label] = null;
      continue;
    }

    const past = db.prepare(
      'SELECT avg_score, avg_rsi, trend FROM sector_analysis WHERE sector = ? AND date = ?'
    ).get(sector, pastDate);

    const current = db.prepare(
      'SELECT avg_score, avg_rsi, trend FROM sector_analysis WHERE sector = ? AND date = ?'
    ).get(sector, latestDate);

    if (past && current) {
      trend[label] = {
        date: pastDate,
        scoreChange: round2((current.avg_score || 0) - (past.avg_score || 0)),
        rsiChange: current.avg_rsi != null && past.avg_rsi != null
          ? round2(current.avg_rsi - past.avg_rsi) : null,
        prevTrend: past.trend,
        currentTrend: current.trend,
      };
    } else {
      trend[label] = null;
    }
  }

  return trend;
}

/**
 * Compute average price performance across sector stocks over recent periods.
 */
function computeSectorPricePerformance(db, sector, latestDate) {
  const periods = [
    { label: '1w', days: 5 },
    { label: '2w', days: 10 },
    { label: '1m', days: 22 },
    { label: '3m', days: 66 },
  ];

  const performance = {};
  const sectorStocks = db.prepare(
    'SELECT symbol FROM stocks WHERE sector = ?'
  ).all(sector).map(r => r.symbol);

  if (sectorStocks.length === 0) return performance;

  for (const { label, days } of periods) {
    const returns = [];
    for (const symbol of sectorStocks) {
      const latest = db.prepare(
        'SELECT close FROM daily_prices WHERE symbol = ? AND date <= ? ORDER BY date DESC LIMIT 1'
      ).get(symbol, latestDate);
      const past = db.prepare(
        `SELECT close FROM daily_prices WHERE symbol = ? AND date <= date(?, '-${days} days') ORDER BY date DESC LIMIT 1`
      ).get(symbol, latestDate);

      if (latest?.close && past?.close && past.close > 0) {
        returns.push((latest.close - past.close) / past.close);
      }
    }

    if (returns.length > 0) {
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const positiveCount = returns.filter(r => r > 0).length;
      performance[label] = {
        avgReturn: round2(avgReturn * 100),
        positiveRatio: round2(positiveCount / returns.length),
        stocksCovered: returns.length,
      };
    } else {
      performance[label] = null;
    }
  }

  return performance;
}

/**
 * Get quarterly earnings data for the sector.
 */
function getQuarterlyEarnings(db, sector) {
  try {
    const earnings = db.prepare(`
      SELECT fr.period_end, fr.period_type,
             SUM(fr.total_revenue) as sector_revenue,
             SUM(fr.net_income) as sector_net_income,
             AVG(fr.net_margin) as avg_net_margin,
             AVG(fr.gross_margin) as avg_gross_margin,
             COUNT(DISTINCT fr.symbol) as reporting_companies
      FROM financial_reports fr
      JOIN stocks s ON fr.symbol = s.symbol
      WHERE s.sector = ? AND fr.period_type = 'quarterly'
      GROUP BY fr.period_end
      ORDER BY fr.period_end DESC
      LIMIT 8
    `).all(sector);

    if (earnings.length < 2) return { quarters: earnings, yoyGrowth: null };

    // Compute YoY growth for latest quarter
    const latest = earnings[0];
    const latestDate = new Date(latest.period_end);
    const yoyQuarter = earnings.find(e => {
      const d = new Date(e.period_end);
      return d.getFullYear() === latestDate.getFullYear() - 1 &&
             Math.abs(d.getMonth() - latestDate.getMonth()) <= 1;
    });

    let yoyGrowth = null;
    if (yoyQuarter && yoyQuarter.sector_revenue) {
      yoyGrowth = {
        revenueGrowth: round2(((latest.sector_revenue - yoyQuarter.sector_revenue) / Math.abs(yoyQuarter.sector_revenue)) * 100),
        netIncomeGrowth: yoyQuarter.sector_net_income
          ? round2(((latest.sector_net_income - yoyQuarter.sector_net_income) / Math.abs(yoyQuarter.sector_net_income)) * 100)
          : null,
        marginChange: latest.avg_net_margin != null && yoyQuarter.avg_net_margin != null
          ? round2((latest.avg_net_margin - yoyQuarter.avg_net_margin) * 100)
          : null,
      };
    }

    return {
      quarters: earnings.map(e => ({
        periodEnd: e.period_end,
        revenue: e.sector_revenue,
        netIncome: e.sector_net_income,
        avgNetMargin: e.avg_net_margin,
        avgGrossMargin: e.avg_gross_margin,
        reportingCompanies: e.reporting_companies,
      })),
      yoyGrowth,
    };
  } catch {
    return { quarters: [], yoyGrowth: null };
  }
}

/**
 * Compute sector rotation signals based on momentum and relative strength.
 */
function computeRotationSignals(db, sectorReports, latestDate) {
  // Rank sectors by momentum (score change + price performance)
  const signals = sectorReports.map(report => {
    const scoreChange1w = report.historicalTrend?.['1w']?.scoreChange || 0;
    const scoreChange1m = report.historicalTrend?.['1m']?.scoreChange || 0;
    const priceReturn1w = report.pricePerformance?.['1w']?.avgReturn || 0;
    const priceReturn1m = report.pricePerformance?.['1m']?.avgReturn || 0;

    // Momentum score: weighted combination
    const momentum = (scoreChange1w * 0.3) + (scoreChange1m * 0.2) + (priceReturn1w * 0.3) + (priceReturn1m * 0.2);

    // Buy ratio: proportion of buy/strong_buy signals
    const totalStocks = report.stockCount;
    const buyCount = (report.signalDistribution?.buy || 0) + (report.signalDistribution?.strong_buy || 0);
    const buyRatio = totalStocks > 0 ? buyCount / totalStocks : 0;

    // RSI momentum
    const rsiMomentum = report.avgRsi != null ? (report.avgRsi - 50) / 50 : 0;

    let signal;
    if (momentum > 1.5 && buyRatio > 0.4) signal = 'rotate_in';
    else if (momentum < -1.5 && buyRatio < 0.2) signal = 'rotate_out';
    else if (momentum > 0.5) signal = 'overweight';
    else if (momentum < -0.5) signal = 'underweight';
    else signal = 'neutral';

    return {
      sector: report.sector,
      signal,
      momentum: round2(momentum),
      buyRatio: round2(buyRatio),
      rsiMomentum: round2(rsiMomentum),
      avgScore: report.avgScore,
      trend: report.trend,
      priceReturn1w: report.pricePerformance?.['1w']?.avgReturn || null,
      priceReturn1m: report.pricePerformance?.['1m']?.avgReturn || null,
    };
  });

  // Sort by momentum descending
  signals.sort((a, b) => b.momentum - a.momentum);
  return signals;
}

/**
 * Get stored sector report for a specific sector.
 */
function getSectorReport(sector) {
  const db = getDb();
  initSchema(db);
  initSectorReportsSchema(db);

  const latestDate = db.prepare(
    'SELECT MAX(date) as date FROM sector_reports'
  ).get()?.date;

  if (!latestDate) {
    db.close();
    return null;
  }

  const row = db.prepare(
    'SELECT report_json FROM sector_reports WHERE sector = ? AND date = ?'
  ).get(sector, latestDate);

  db.close();
  if (!row) return null;
  return { date: latestDate, ...JSON.parse(row.report_json) };
}

/**
 * Get all stored sector reports with rotation signals.
 */
function getAllSectorReports() {
  const db = getDb();
  initSchema(db);
  initSectorReportsSchema(db);

  const latestDate = db.prepare(
    'SELECT MAX(date) as date FROM sector_reports'
  ).get()?.date;

  if (!latestDate) {
    db.close();
    return { date: null, sectors: [], rotation: [] };
  }

  const rows = db.prepare(
    'SELECT report_json FROM sector_reports WHERE date = ? ORDER BY sector'
  ).all(latestDate);

  const sectors = rows.map(r => JSON.parse(r.report_json));

  // Recompute rotation from stored reports
  const rotation = computeRotationSignals(db, sectors, latestDate);

  db.close();
  return { date: latestDate, sectors, rotation };
}

/**
 * Initialize the sector_reports table.
 */
function initSectorReportsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sector_reports (
      sector    TEXT NOT NULL,
      date      TEXT NOT NULL,
      report_json TEXT NOT NULL,
      PRIMARY KEY (sector, date)
    );
  `);
}

function round2(v) {
  if (v == null) return null;
  return Math.round(v * 100) / 100;
}

module.exports = { analyzeSectors, generateSectorReports, getSectorReport, getAllSectorReports, initSectorReportsSchema };
