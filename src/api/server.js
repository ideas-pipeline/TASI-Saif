const http = require('http');
const { getDb, initSchema } = require('../db/schema');
const { initAuthSchema } = require('../db/auth-schema');
const { CMA_DISCLAIMER } = require('../analysis/scoring');
const { getFinancialReports, computeValuationMetrics } = require('../analysis/fundamental');
const { handleAuthRoutes } = require('../auth/routes');
const { handleSubscriptionRoutes, gateContent } = require('../auth/subscription');
const { getAuthUser, getEffectiveTier } = require('../auth/middleware');
const { handleNotificationRoutes } = require('../notifications/routes');
const { initNotificationSchema } = require('../db/notification-schema');
const { fetchMarketSummary } = require('../fetcher/sources');
const { dailySummaryTemplate } = require('../notifications/templates');
const { analyzeStockRisk, analyzePortfolioRisk, computeSectorCorrelations, computeDiversificationScore, assessSectorRisks, detectRiskAlerts, getRiskSummary, generateArabicRiskReport } = require('../analysis/risk-engine');
const { backtestVaRForStock, backtestVaRAllStocks, generateMonthlyReport, storeBacktestResults, getBacktestHistory } = require('../analysis/var-backtest');
const { computeFullCorrelationMatrix, analyzeCorrelationRegimes, computePortfolioCorrelation } = require('../analysis/correlation-matrix');
const { getActivePortfolio, getPortfolioHistory, backtestPortfolio } = require('../analysis/portfolio');
const { getAllSectorReports, getSectorReport } = require('../analysis/sectors');
const { generateScenarioCalibrationReport, generateScenarioMultiplierMatrix, recordDailyAccuracy, getAccuracyTrend, getDriftStatus, initializeDriftMonitoring, DRIFT_THRESHOLDS } = require('../analysis/stress-test-calibration');

const PORT = parseInt(process.env.TASI_PORT || '3000', 10);

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function parseUrl(url) {
  const [path, qs] = url.split('?');
  const params = {};
  if (qs) {
    for (const pair of qs.split('&')) {
      const [k, v] = pair.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  return { path, params };
}

async function handleRequest(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const { path, params } = parseUrl(req.url);

  // Handle auth routes (register, login, me, tiers)
  if (path.startsWith('/api/auth/')) {
    const result = await handleAuthRoutes(req, res, path);
    if (result !== false) return;
  }

  // Handle subscription routes
  if (path.startsWith('/api/subscription/')) {
    const result = await handleSubscriptionRoutes(req, res, path);
    if (result !== false) return;
  }

  // Handle notification routes
  if (path.startsWith('/api/notifications/')) {
    const result = await handleNotificationRoutes(req, res, path);
    if (result !== false) return;
  }

  // Determine user tier for content gating (optional auth - unauthenticated = free)
  const user = getAuthUser(req);
  const tier = getEffectiveTier(user);

  const db = getDb();
  initSchema(db);
  initAuthSchema(db);
  initNotificationSchema(db);

  try {
    // GET /api/health
    if (path === '/api/health') {
      return json(res, { status: 'ok', timestamp: new Date().toISOString() });
    }

    // GET /api/stocks — list all stocks with latest scores
    if (path === '/api/stocks') {
      const latestDate = db.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
      const sector = params.sector;
      const sortBy = params.sort || 'overall_score';
      const order = params.order === 'asc' ? 'ASC' : 'DESC';
      const limit = Math.min(parseInt(params.limit || '100', 10), 200);

      let query = `
        SELECT s.*, ss.technical_score, ss.fundamental_score, ss.ai_score,
               ss.overall_score, ss.risk_level, ss.volatility, ss.beta,
               ss.entry_signal, ss.entry_reasoning, ss.ai_reasoning,
               dp.close as latest_price, dp.volume as latest_volume
        FROM stocks s
        LEFT JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
        LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = (
          SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol
        )
      `;
      const queryParams = [latestDate];

      if (sector) {
        query += ' WHERE s.sector = ?';
        queryParams.push(sector);
      }

      const validSorts = ['overall_score', 'technical_score', 'fundamental_score', 'ai_score', 'symbol', 'name'];
      const sortCol = validSorts.includes(sortBy) ? `ss.${sortBy}` : 'ss.overall_score';
      query += ` ORDER BY ${sortBy === 'symbol' ? 's.symbol' : sortBy === 'name' ? 's.name' : sortCol} ${order} LIMIT ?`;
      queryParams.push(limit);

      const stocks = db.prepare(query).all(...queryParams);
      const response = { disclaimer: CMA_DISCLAIMER, date: latestDate, count: stocks.length, stocks };
      return json(res, gateContent(response, tier));
    }

    // GET /api/stocks/:symbol/intraday — intraday price data (Alpha Vantage)
    const intradayMatch = path.match(/^\/api\/stocks\/([^/]+)\/intraday$/);
    if (intradayMatch) {
      const symbol = decodeURIComponent(intradayMatch[1]);
      const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
      if (!stock) return json(res, { error: 'Stock not found' }, 404);

      const interval = params.interval || '60min';
      const limit = Math.min(parseInt(params.limit || '100', 10), 500);
      let rows = [];
      try {
        rows = db.prepare(
          'SELECT * FROM intraday_prices WHERE symbol = ? AND interval = ? ORDER BY timestamp DESC LIMIT ?'
        ).all(symbol, interval, limit);
      } catch (_) {}

      return json(res, {
        disclaimer: CMA_DISCLAIMER,
        stock: { symbol: stock.symbol, name: stock.name, sector: stock.sector },
        interval,
        count: rows.length,
        prices: rows,
        source: 'alpha_vantage',
      });
    }

    // GET /api/stocks/:symbol/earnings — earnings data (Alpha Vantage)
    const earningsMatch = path.match(/^\/api\/stocks\/([^/]+)\/earnings$/);
    if (earningsMatch) {
      const symbol = decodeURIComponent(earningsMatch[1]);
      const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
      if (!stock) return json(res, { error: 'Stock not found' }, 404);

      let quarterly = [], annual = [];
      try {
        quarterly = db.prepare(
          'SELECT * FROM earnings WHERE symbol = ? AND period_type = ? ORDER BY fiscal_date_ending DESC'
        ).all(symbol, 'quarterly');
        annual = db.prepare(
          'SELECT * FROM earnings WHERE symbol = ? AND period_type = ? ORDER BY fiscal_date_ending DESC'
        ).all(symbol, 'annual');
      } catch (_) {}

      return json(res, {
        disclaimer: CMA_DISCLAIMER,
        stock: { symbol: stock.symbol, name: stock.name, sector: stock.sector },
        quarterly,
        annual,
        source: 'alpha_vantage',
      });
    }

    // GET /api/stocks/:symbol/financials — financial reports and valuation
    const financialsMatch = path.match(/^\/api\/stocks\/([^/]+)\/financials$/);
    if (financialsMatch) {
      const symbol = decodeURIComponent(financialsMatch[1]);
      const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
      if (!stock) return json(res, { error: 'Stock not found' }, 404);

      const periodType = params.period; // 'quarterly', 'annual', or undefined for both
      const reports = getFinancialReports(symbol, periodType);
      const valuation = computeValuationMetrics(symbol);

      // YoY comparisons for quarterly reports
      const quarterly = reports.filter(r => r.period_type === 'quarterly');
      const yoyComparisons = quarterly.map((current, i) => {
        // Find same quarter from previous year
        const currentDate = new Date(current.period_end);
        const targetYear = currentDate.getFullYear() - 1;
        const yoyMatch = quarterly.find(r => {
          const d = new Date(r.period_end);
          return d.getFullYear() === targetYear && d.getMonth() === currentDate.getMonth();
        });
        if (!yoyMatch) return { periodEnd: current.period_end, yoy: null };

        return {
          periodEnd: current.period_end,
          yoy: {
            revenueGrowth: yoyMatch.total_revenue ? (current.total_revenue - yoyMatch.total_revenue) / Math.abs(yoyMatch.total_revenue) : null,
            netIncomeGrowth: yoyMatch.net_income ? (current.net_income - yoyMatch.net_income) / Math.abs(yoyMatch.net_income) : null,
            marginChange: current.net_margin != null && yoyMatch.net_margin != null ? current.net_margin - yoyMatch.net_margin : null,
          },
        };
      });

      const response = {
        disclaimer: CMA_DISCLAIMER,
        stock: { symbol: stock.symbol, name: stock.name, sector: stock.sector },
        reports,
        valuation,
        yoyComparisons,
      };
      return json(res, gateContent(response, tier));
    }

    // GET /api/stocks/:symbol — detailed stock analysis
    const stockMatch = path.match(/^\/api\/stocks\/([^/]+)$/);
    if (stockMatch) {
      const symbol = decodeURIComponent(stockMatch[1]);
      const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
      if (!stock) return json(res, { error: 'Stock not found' }, 404);

      const latestDate = db.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
      const score = latestDate
        ? db.prepare('SELECT * FROM stock_scores WHERE symbol = ? AND date = ?').get(symbol, latestDate)
        : null;
      const indicators = latestDate
        ? db.prepare('SELECT * FROM technical_indicators WHERE symbol = ? AND date = ?').get(symbol, latestDate)
        : null;

      // Recent prices (last 30 days)
      const recentPrices = db.prepare(
        'SELECT * FROM daily_prices WHERE symbol = ? ORDER BY date DESC LIMIT 30'
      ).all(symbol);

      // Historical indicators (last 30)
      const recentIndicators = db.prepare(
        'SELECT date, rsi_14, macd_hist, sma_20, sma_50, volume_ratio FROM technical_indicators WHERE symbol = ? ORDER BY date DESC LIMIT 30'
      ).all(symbol);

      const response = {
        disclaimer: CMA_DISCLAIMER,
        stock,
        score,
        indicators,
        recentPrices,
        recentIndicators,
      };
      return json(res, gateContent(response, tier));
    }

    // GET /api/rankings — top opportunities
    if (path === '/api/rankings') {
      const latestDate = db.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
      const limit = Math.min(parseInt(params.limit || '20', 10), 53);
      const signal = params.signal; // filter by entry_signal

      let query = `
        SELECT s.symbol, s.name, s.sector, s.pe_ratio, s.dividend_yield,
               ss.overall_score, ss.technical_score, ss.fundamental_score,
               ss.ai_score, ss.risk_level, ss.entry_signal, ss.entry_reasoning,
               dp.close as latest_price
        FROM stocks s
        JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
        LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = (
          SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol
        )
      `;
      const queryParams = [latestDate];

      if (signal) {
        query += ' WHERE ss.entry_signal = ?';
        queryParams.push(signal);
      }

      query += ' ORDER BY ss.overall_score DESC LIMIT ?';
      queryParams.push(limit);

      const rankings = db.prepare(query).all(...queryParams);
      const response = { disclaimer: CMA_DISCLAIMER, date: latestDate, rankings };
      return json(res, gateContent(response, tier));
    }

    // GET /api/sectors — sector analysis
    if (path === '/api/sectors') {
      const latestDate = db.prepare('SELECT MAX(date) as date FROM sector_analysis').get()?.date;
      const sectors = latestDate
        ? db.prepare('SELECT * FROM sector_analysis WHERE date = ? ORDER BY avg_score DESC').all(latestDate)
        : [];
      return json(res, { disclaimer: CMA_DISCLAIMER, date: latestDate, sectors });
    }

    // GET /api/sectors/reports — comprehensive sector reports with rotation signals
    if (path === '/api/sectors/reports') {
      const data = getAllSectorReports();
      const response = { disclaimer: CMA_DISCLAIMER, ...data };
      return json(res, gateContent(response, tier));
    }

    // GET /api/sectors/rotation — sector rotation signals only
    if (path === '/api/sectors/rotation') {
      const data = getAllSectorReports();
      return json(res, { disclaimer: CMA_DISCLAIMER, date: data.date, rotation: data.rotation });
    }

    // GET /api/sectors/:sector/report — detailed single sector report
    const sectorReportMatch = path.match(/^\/api\/sectors\/([^/]+)\/report$/);
    if (sectorReportMatch) {
      const sector = decodeURIComponent(sectorReportMatch[1]);
      const report = getSectorReport(sector);
      if (!report) return json(res, { error: 'Sector report not found. Run: node src/cli.js sectors' }, 404);
      const response = { disclaimer: CMA_DISCLAIMER, ...report };
      return json(res, gateContent(response, tier));
    }

    // GET /api/sectors/:sector — sector detail with stocks
    const sectorMatch = path.match(/^\/api\/sectors\/([^/]+)$/);
    if (sectorMatch) {
      const sector = decodeURIComponent(sectorMatch[1]);
      const latestDate = db.prepare('SELECT MAX(date) as date FROM sector_analysis').get()?.date;
      const sectorData = latestDate
        ? db.prepare('SELECT * FROM sector_analysis WHERE sector = ? AND date = ?').get(sector, latestDate)
        : null;

      if (!sectorData) return json(res, { error: 'Sector not found' }, 404);

      const latestScoreDate = db.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
      const stocks = db.prepare(`
        SELECT s.symbol, s.name, ss.overall_score, ss.entry_signal, ss.risk_level,
               dp.close as latest_price
        FROM stocks s
        JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
        LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = (
          SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol
        )
        WHERE s.sector = ?
        ORDER BY ss.overall_score DESC
      `).all(latestScoreDate, sector);

      return json(res, { disclaimer: CMA_DISCLAIMER, sector: sectorData, stocks });
    }

    // GET /api/signals — entry signals summary
    if (path === '/api/signals') {
      const latestDate = db.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
      if (!latestDate) return json(res, { signals: {} });

      const signals = {};
      for (const sig of ['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']) {
        const stocks = db.prepare(`
          SELECT s.symbol, s.name, s.sector, ss.overall_score, ss.entry_reasoning,
                 dp.close as latest_price
          FROM stocks s
          JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
          LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = (
            SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol
          )
          WHERE ss.entry_signal = ?
          ORDER BY ss.overall_score DESC
        `).all(latestDate, sig);
        signals[sig] = stocks;
      }

      const response = { disclaimer: CMA_DISCLAIMER, date: latestDate, signals };
      return json(res, gateContent(response, tier));
    }

    // GET /api/stats — pipeline stats
    if (path === '/api/stats') {
      const stockCount = db.prepare('SELECT COUNT(*) as count FROM stocks').get();
      const priceCount = db.prepare('SELECT COUNT(*) as count FROM daily_prices').get();
      const indicatorCount = db.prepare('SELECT COUNT(*) as count FROM technical_indicators').get();
      const scoreCount = db.prepare('SELECT COUNT(*) as count FROM stock_scores').get();
      const dateRange = db.prepare('SELECT MIN(date) as min, MAX(date) as max FROM daily_prices').get();
      const latestAnalysis = db.prepare('SELECT MAX(date) as date FROM stock_scores').get();

      return json(res, {
        stocks: stockCount.count,
        priceRecords: priceCount.count,
        indicatorRecords: indicatorCount.count,
        scoreRecords: scoreCount.count,
        priceRange: { from: dateRange.min, to: dateRange.max },
        latestAnalysis: latestAnalysis.date,
      });
    }

    // GET /api/daily-report — preview daily report as JSON or HTML
    if (path === '/api/daily-report') {
      const latestDate = db.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
      if (!latestDate) return json(res, { error: 'No analysis data available' }, 404);

      const prevDate = db.prepare(
        'SELECT MAX(date) as date FROM daily_prices WHERE date < ?'
      ).get(latestDate)?.date;

      const topStocks = db.prepare(`
        SELECT s.symbol, s.name, s.sector,
               ss.overall_score, ss.technical_score, ss.fundamental_score,
               ss.ai_score, ss.risk_level, ss.entry_signal, ss.entry_reasoning,
               dp.close as latest_price
        FROM stocks s
        JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
        LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = (
          SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol
        )
        ORDER BY ss.overall_score DESC
        LIMIT 10
      `).all(latestDate);

      const sectorSummary = db.prepare(
        'SELECT * FROM sector_analysis WHERE date = ? ORDER BY avg_score DESC'
      ).all(latestDate);

      const signalRows = db.prepare(
        'SELECT entry_signal, COUNT(*) as count FROM stock_scores WHERE date = ? GROUP BY entry_signal'
      ).all(latestDate);
      const signalCounts = {};
      for (const row of signalRows) signalCounts[row.entry_signal] = row.count;

      let topGainers = [], topLosers = [];
      if (prevDate) {
        topGainers = db.prepare(`
          SELECT s.symbol, s.name, s.sector, dp_today.close as close_price, dp_prev.close as prev_close,
                 ROUND(((dp_today.close - dp_prev.close) / dp_prev.close) * 100, 2) as change_pct
          FROM stocks s
          JOIN daily_prices dp_today ON s.symbol = dp_today.symbol AND dp_today.date = ?
          JOIN daily_prices dp_prev ON s.symbol = dp_prev.symbol AND dp_prev.date = ?
          WHERE dp_prev.close > 0 ORDER BY change_pct DESC LIMIT 5
        `).all(latestDate, prevDate);
        topLosers = db.prepare(`
          SELECT s.symbol, s.name, s.sector, dp_today.close as close_price, dp_prev.close as prev_close,
                 ROUND(((dp_today.close - dp_prev.close) / dp_prev.close) * 100, 2) as change_pct
          FROM stocks s
          JOIN daily_prices dp_today ON s.symbol = dp_today.symbol AND dp_today.date = ?
          JOIN daily_prices dp_prev ON s.symbol = dp_prev.symbol AND dp_prev.date = ?
          WHERE dp_prev.close > 0 ORDER BY change_pct ASC LIMIT 5
        `).all(latestDate, prevDate);
      }

      const volumeLeaders = db.prepare(`
        SELECT s.symbol, s.name, s.sector, dp.volume, dp.close as close_price
        FROM stocks s JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = ?
        WHERE dp.volume > 0 ORDER BY dp.volume DESC LIMIT 5
      `).all(latestDate);

      let tasiIndex = null;
      try { tasiIndex = (await fetchMarketSummary()).data; } catch (_) {}

      const reportData = {
        date: latestDate,
        topStocks, sectorSummary, signalCounts,
        marketStats: {
          totalStocks: db.prepare('SELECT COUNT(*) as count FROM stocks').get().count,
          analysisDate: latestDate,
          tasiIndex,
        },
        topGainers, topLosers, volumeLeaders,
      };

      // Return HTML preview if format=html
      if (params.format === 'html') {
        const lang = params.lang || 'ar';
        const template = dailySummaryTemplate(reportData, lang);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(template.html);
      }

      const response = { disclaimer: CMA_DISCLAIMER, ...reportData };
      return json(res, gateContent(response, tier));
    }

    // GET /api/risk/all — risk overview for all stocks
    if (path === '/api/risk/all') {
      const summary = getRiskSummary();
      return json(res, { disclaimer: CMA_DISCLAIMER, ...summary });
    }

    // GET /api/risk/alerts — current risk alerts
    if (path === '/api/risk/alerts') {
      const alerts = detectRiskAlerts();
      return json(res, { disclaimer: CMA_DISCLAIMER, ...alerts });
    }

    // GET /api/risk/sectors — sector-level risk assessment
    if (path === '/api/risk/sectors') {
      const sectorRisks = assessSectorRisks();
      return json(res, { disclaimer: CMA_DISCLAIMER, sectors: sectorRisks });
    }

    // GET /api/risk/sectors/correlations — sector correlation matrix (must be before :symbol route)
    if (path === '/api/risk/sectors/correlations') {
      const correlations = computeSectorCorrelations();
      return json(res, { disclaimer: CMA_DISCLAIMER, ...correlations });
    }

    // GET /api/risk/scenarios/calibration — scenario-specific multiplier matrix and calibration evidence
    if (path === '/api/risk/scenarios/calibration') {
      try {
        const calibrationReport = generateScenarioCalibrationReport();
        const multiplierMatrix = generateScenarioMultiplierMatrix();
        return json(res, {
          disclaimer: CMA_DISCLAIMER,
          description: 'Scenario-specific stress test multipliers calibrated from historical TASI data',
          calibrationReport,
          multiplierMatrix,
          note: 'Each scenario has different multipliers per sector based on historical shock events (COVID-2020, Oil Shock 2015-2016). Multipliers validated to ±20% accuracy.',
        });
      } catch (e) {
        console.error('Calibration endpoint error:', e.message);
        return json(res, { error: 'Unable to generate calibration report', details: e.message }, 500);
      }
    }

    // GET /api/risk/scenarios/drift-status — real-time drift monitoring for calibrated multipliers
    if (path === '/api/risk/scenarios/drift-status') {
      try {
        const driftStatus = getDriftStatus();
        const requiresAction = driftStatus.requiresRecalibration.length > 0;

        return json(res, {
          description: 'Real-time drift monitoring for stress test multiplier accuracy',
          timestamp: driftStatus.timestamp,
          overallHealth: requiresAction ? 'degraded' : (driftStatus.warnings.length > 0 ? 'warning' : 'healthy'),
          driftStatus,
          actionRequired: {
            recalibration: requiresAction,
            scenariosAffected: driftStatus.requiresRecalibration.map(r => r.scenario),
            recommendation: requiresAction
              ? 'Auto-recalibration recommended for scenarios with critical accuracy drift'
              : 'Model performing within tolerance',
          },
          thresholds: {
            warning: `${DRIFT_THRESHOLDS.warning}% accuracy`,
            critical: `${DRIFT_THRESHOLDS.critical}% accuracy`,
          },
        });
      } catch (e) {
        console.error('Drift status endpoint error:', e.message);
        return json(res, { error: 'Unable to retrieve drift status', details: e.message }, 500);
      }
    }

    // POST /api/risk/scenarios/calibration/update-accuracy — record daily accuracy measurement
    if (path === '/api/risk/scenarios/calibration/update-accuracy' && req.method === 'POST') {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => { body += chunk; });
        req.on('end', resolve);
      });
      try {
        const { scenario, accuracy, date } = JSON.parse(body);
        if (!scenario || accuracy === undefined) {
          return json(res, { error: 'scenario and accuracy required. Example: {"scenario":"market_crash","accuracy":78.5}' }, 400);
        }

        recordDailyAccuracy(scenario, accuracy, date);
        const trend = getAccuracyTrend(scenario);

        return json(res, {
          message: 'Accuracy recorded',
          scenario,
          recorded: { accuracy, date: date || new Date().toISOString().split('T')[0] },
          currentTrend: trend,
          action: trend.requiresRecalibration ? 'Auto-recalibration recommended' : 'Monitoring continues',
        }, 201);
      } catch (e) {
        console.error('Accuracy update error:', e.message);
        return json(res, { error: 'Unable to record accuracy', details: e.message }, 400);
      }
    }

    // GET /api/risk/:symbol — detailed risk analysis for a stock
    // ?format=arabic returns markdown Arabic report
    const riskMatch = path.match(/^\/api\/risk\/([^/]+)$/);
    if (riskMatch) {
      const symbol = decodeURIComponent(riskMatch[1]);
      const analysis = analyzeStockRisk(symbol);
      if (!analysis) return json(res, { error: 'Stock not found' }, 404);
      if (analysis.error) return json(res, { error: analysis.error }, 400);
      if (params.format === 'arabic') {
        const report = generateArabicRiskReport(analysis);
        return json(res, { disclaimer: CMA_DISCLAIMER, report, analysis });
      }
      const response = { disclaimer: CMA_DISCLAIMER, ...analysis };
      return json(res, gateContent(response, tier));
    }

    // POST /api/risk/portfolio — portfolio risk analysis
    if (path === '/api/risk/portfolio' && req.method === 'POST') {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => { body += chunk; });
        req.on('end', resolve);
      });
      try {
        const { holdings } = JSON.parse(body);
        if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
          return json(res, { error: 'holdings array required, e.g. [{"symbol":"2222.SR","weight":1}]' }, 400);
        }
        const analysis = analyzePortfolioRisk(holdings);
        if (!analysis) return json(res, { error: 'Analysis failed' }, 400);
        if (analysis.error) return json(res, { error: analysis.error }, 400);
        const response = { disclaimer: CMA_DISCLAIMER, ...analysis };
        return json(res, gateContent(response, tier));
      } catch (e) {
        return json(res, { error: 'Invalid JSON body' }, 400);
      }
    }

    // POST /api/risk/diversification — diversification score for symbols
    if (path === '/api/risk/diversification' && req.method === 'POST') {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => { body += chunk; });
        req.on('end', resolve);
      });
      try {
        const { symbols } = JSON.parse(body);
        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
          return json(res, { error: 'symbols array required' }, 400);
        }
        const result = computeDiversificationScore(symbols);
        if (!result) return json(res, { error: 'No valid stocks found' }, 404);
        return json(res, { disclaimer: CMA_DISCLAIMER, ...result });
      } catch (e) {
        return json(res, { error: 'Invalid JSON body' }, 400);
      }
    }

    // GET /api/risk/backtest/monthly?year=2026&month=3 — monthly VaR accuracy report
    if (path === '/api/risk/backtest/monthly') {
      const year = parseInt(params.year) || new Date().getFullYear();
      const month = parseInt(params.month) || new Date().getMonth() + 1;
      if (month < 1 || month > 12) return json(res, { error: 'Invalid month (1-12)' }, 400);
      const report = generateMonthlyReport(year, month);
      return json(res, { disclaimer: 'VaR backtest results. Hit rates should be ~5% for 95% VaR, ~1% for 99% VaR.', ...report });
    }

    // POST /api/risk/backtest/stock — backtest VaR for a single stock
    if (path === '/api/risk/backtest/stock' && req.method === 'POST') {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => { body += chunk; });
        req.on('end', resolve);
      });
      try {
        const { symbol, startDate, endDate, lookbackDays } = JSON.parse(body);
        if (!symbol || !startDate || !endDate) {
          return json(res, { error: 'symbol, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD) required' }, 400);
        }
        const result = backtestVaRForStock(
          symbol,
          new Date(startDate),
          new Date(endDate),
          lookbackDays || 252
        );
        if (result.error) return json(res, result, 400);
        return json(res, { disclaimer: 'VaR backtest results', ...result });
      } catch (e) {
        return json(res, { error: 'Invalid JSON body or date format' }, 400);
      }
    }

    // POST /api/risk/backtest/all — backtest VaR across all stocks for a period
    if (path === '/api/risk/backtest/all' && req.method === 'POST') {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => { body += chunk; });
        req.on('end', resolve);
      });
      try {
        const { startDate, endDate } = JSON.parse(body);
        if (!startDate || !endDate) {
          return json(res, { error: 'startDate and endDate (YYYY-MM-DD) required' }, 400);
        }
        const result = backtestVaRAllStocks(new Date(startDate), new Date(endDate));
        return json(res, { disclaimer: 'VaR backtest across all TASI stocks', ...result });
      } catch (e) {
        return json(res, { error: 'Invalid JSON body or date format' }, 400);
      }
    }

    // GET /api/risk/backtest/history/:symbol?months=6 — backtest history for drift detection
    if (path.match(/^\/api\/risk\/backtest\/history\/[A-Z0-9]+$/)) {
      const symbol = path.split('/').pop();
      const months = parseInt(params.months) || 6;
      const history = getBacktestHistory(symbol, months);
      return json(res, {
        disclaimer: 'VaR backtest history for drift detection',
        driftStatus: history.driftDetected ? '⚠️ Model drift detected - recalibration recommended' : '✅ Model stable',
        ...history,
      });
    }

    // GET /api/correlations/matrix?window=252 — full correlation matrix
    if (path === '/api/correlations/matrix') {
      const window = parseInt(params.window) || 252;
      const result = computeFullCorrelationMatrix(window);
      return json(res, { disclaimer: 'Pearson correlation matrix', window, ...result });
    }

    // GET /api/correlations/regimes — correlation regime analysis (normal vs crisis)
    if (path === '/api/correlations/regimes') {
      const regimes = analyzeCorrelationRegimes();
      return json(res, { disclaimer: 'Correlation regimes: crisis (>0.4), stress (0.3-0.4), normal (<0.3)', regimes });
    }

    // GET /api/correlations/heatmap?window=252 — correlation matrix formatted for visualization
    if (path === '/api/correlations/heatmap') {
      const window = parseInt(params.window) || 252;
      const result = computeFullCorrelationMatrix(window);

      // Format for heatmap visualization: array of {x, y, value} for each cell
      const heatmapData = [];
      for (const sym1 of result.symbols) {
        for (const sym2 of result.symbols) {
          const corr = result.matrix[sym1][sym2];
          if (corr !== null) {
            heatmapData.push({
              x: sym1,
              y: sym2,
              value: Math.round(corr * 100) / 100,
            });
          }
        }
      }

      return json(res, {
        disclaimer: 'Pearson correlation heatmap for visualization',
        window,
        symbols: result.symbols,
        data: heatmapData,
        matrix: result.matrix, // Also return full matrix for detailed analysis
      });
    }

    // POST /api/correlations/portfolio — portfolio correlation analysis
    if (path === '/api/correlations/portfolio' && req.method === 'POST') {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => { body += chunk; });
        req.on('end', resolve);
      });
      try {
        const { symbols, weights } = JSON.parse(body);
        if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
          return json(res, { error: 'symbols array (min 2) required' }, 400);
        }
        const result = computePortfolioCorrelation(symbols, weights);
        if (!result) return json(res, { error: 'Insufficient data for analysis' }, 400);
        return json(res, { disclaimer: 'Portfolio correlation analysis', ...result });
      } catch (e) {
        return json(res, { error: 'Invalid JSON body' }, 400);
      }
    }

    // GET /api/portfolio — active model portfolio
    if (path === '/api/portfolio') {
      const portfolio = getActivePortfolio();
      if (!portfolio) return json(res, { error: 'No active portfolio. Run: node src/cli.js portfolio build' }, 404);
      const response = { disclaimer: CMA_DISCLAIMER, ...portfolio };
      return json(res, gateContent(response, tier));
    }

    // GET /api/portfolio/performance — portfolio performance history
    if (path === '/api/portfolio/performance') {
      const portfolio = getActivePortfolio();
      if (!portfolio) return json(res, { error: 'No active portfolio' }, 404);
      return json(res, {
        disclaimer: CMA_DISCLAIMER,
        portfolioId: portfolio.id,
        rebalanceDate: portfolio.rebalanceDate,
        performance: portfolio.performance,
        summary: portfolio.summary,
      });
    }

    // GET /api/portfolio/history — all portfolio rebalances
    if (path === '/api/portfolio/history') {
      const history = getPortfolioHistory();
      return json(res, { disclaimer: CMA_DISCLAIMER, portfolios: history });
    }

    // GET /api/portfolio/backtest — historical backtest of portfolio strategy
    if (path === '/api/portfolio/backtest') {
      const weeks = parseInt(params.weeks || '52', 10);
      const result = backtestPortfolio({ weeks });
      if (result.error) return json(res, { error: result.error }, 400);
      return json(res, { disclaimer: CMA_DISCLAIMER, ...result });
    }

    // 404
    json(res, { error: 'Not found', endpoints: [
      'GET  /api/health',
      'GET  /api/stocks?sector=&sort=&order=&limit=',
      'GET  /api/stocks/:symbol',
      'GET  /api/stocks/:symbol/intraday?interval=60min&limit=100',
      'GET  /api/stocks/:symbol/earnings',
      'GET  /api/stocks/:symbol/financials?period=quarterly|annual',
      'GET  /api/rankings?limit=&signal=',
      'GET  /api/sectors',
      'GET  /api/sectors/reports',
      'GET  /api/sectors/rotation',
      'GET  /api/sectors/:sector',
      'GET  /api/sectors/:sector/report',
      'GET  /api/signals',
      'GET  /api/stats',
      'GET  /api/daily-report?format=html|json&lang=ar|en',
      'GET  /api/risk/all',
      'GET  /api/risk/alerts',
      'GET  /api/risk/sectors',
      'GET  /api/risk/sectors/correlations',
      'GET  /api/risk/scenarios/calibration',
      'GET  /api/risk/scenarios/drift-status',
      'POST /api/risk/scenarios/calibration/update-accuracy',
      'GET  /api/risk/:symbol',
      'GET  /api/risk/:symbol?format=arabic',
      'POST /api/risk/portfolio',
      'POST /api/risk/diversification',
      'GET  /api/risk/backtest/monthly?year=&month=',
      'POST /api/risk/backtest/stock',
      'POST /api/risk/backtest/all',
      'GET  /api/correlations/matrix?window=252',
      'GET  /api/correlations/regimes',
      'POST /api/correlations/portfolio',
      'GET  /api/portfolio',
      'GET  /api/portfolio/performance',
      'GET  /api/portfolio/history',
      'GET  /api/portfolio/backtest?weeks=52',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET  /api/auth/me',
      'GET  /api/auth/tiers',
      'POST /api/subscription/subscribe',
      'POST /api/subscription/cancel',
      'GET  /api/subscription/status',
      'GET  /api/notifications/preferences',
      'PUT  /api/notifications/preferences',
      'GET  /api/notifications/channels',
      'GET  /api/notifications/history',
      'POST /api/notifications/test',
      'POST /api/notifications/telegram/link',
      'DELETE /api/notifications/telegram/link',
      'POST /api/notifications/telegram/webhook',
    ]}, 404);
  } catch (err) {
    console.error('API error:', err);
    json(res, { error: 'Internal server error' }, 500);
  } finally {
    db.close();
  }
}

function startServer() {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(err => {
      console.error('Unhandled error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });
  server.listen(PORT, () => {
    console.log(`TASI Analysis API running on http://localhost:${PORT}`);
    console.log('Endpoints:');
    console.log('  GET  /api/health');
    console.log('  GET  /api/stocks');
    console.log('  GET  /api/stocks/:symbol');
    console.log('  GET  /api/stocks/:symbol/intraday');
    console.log('  GET  /api/stocks/:symbol/earnings');
    console.log('  GET  /api/rankings');
    console.log('  GET  /api/sectors');
    console.log('  GET  /api/sectors/reports');
    console.log('  GET  /api/sectors/rotation');
    console.log('  GET  /api/sectors/:sector/report');
    console.log('  GET  /api/signals');
    console.log('  GET  /api/daily-report');
    console.log('  GET  /api/risk/all');
    console.log('  GET  /api/risk/alerts');
    console.log('  GET  /api/risk/sectors');
    console.log('  GET  /api/risk/sectors/correlations');
    console.log('  GET  /api/risk/:symbol');
    console.log('  POST /api/risk/portfolio');
    console.log('  POST /api/risk/diversification');
    console.log('  GET  /api/portfolio');
    console.log('  GET  /api/portfolio/performance');
    console.log('  GET  /api/portfolio/history');
    console.log('  GET  /api/portfolio/backtest');
    console.log('  GET  /api/stats');
    console.log('  POST /api/auth/register');
    console.log('  POST /api/auth/login');
    console.log('  GET  /api/auth/me');
    console.log('  GET  /api/auth/tiers');
    console.log('  POST /api/subscription/subscribe');
    console.log('  POST /api/subscription/cancel');
    console.log('  GET  /api/subscription/status');
    console.log('  GET  /api/notifications/preferences');
    console.log('  PUT  /api/notifications/preferences');
    console.log('  GET  /api/notifications/channels');
    console.log('  GET  /api/notifications/history');
    console.log('  POST /api/notifications/test');
    console.log('  POST /api/notifications/telegram/link');
    console.log('  POST /api/notifications/telegram/webhook');
  });
  return server;
}

module.exports = { startServer };
