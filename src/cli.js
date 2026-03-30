#!/usr/bin/env node

const { ingest } = require('./ingest');
const { startScheduler } = require('./scheduler');
const { getDb, initSchema, POSTGRES_SCHEMA } = require('./db/schema');
const { TASI_TICKERS } = require('./config/tickers');

const command = process.argv[2];
const flags = process.argv.slice(3);

async function main() {
  switch (command) {
    case 'backfill': {
      // Full historical backfill (2+ years)
      const years = parseInt(process.argv[3] || '2', 10);
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - years);
      const start = startDate.toISOString().split('T')[0];
      console.log(`Running ${years}-year backfill from ${start}...`);
      await ingest({ startDate: start });
      break;
    }

    case 'daily': {
      // Fetch recent data (last 3 days)
      const today = new Date().toISOString().split('T')[0];
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
      console.log(`Running daily update from ${threeDaysAgo} to ${today}...`);
      await ingest({ startDate: threeDaysAgo, endDate: today });
      break;
    }

    case 'scheduler': {
      startScheduler();
      break;
    }

    case 'init-db': {
      const db = getDb();
      initSchema(db);
      console.log('Database initialized successfully');
      db.close();
      break;
    }

    case 'tickers': {
      console.log(`\nTASI Tickers (${TASI_TICKERS.length} stocks):\n`);
      const bySector = {};
      for (const t of TASI_TICKERS) {
        if (!bySector[t.sector]) bySector[t.sector] = [];
        bySector[t.sector].push(t);
      }
      for (const [sector, tickers] of Object.entries(bySector)) {
        console.log(`${sector}:`);
        for (const t of tickers) {
          console.log(`  ${t.symbol.padEnd(10)} ${t.name}`);
        }
        console.log();
      }
      break;
    }

    case 'stats': {
      const db = getDb();
      initSchema(db);
      const stockCount = db.prepare('SELECT COUNT(*) as count FROM stocks').get();
      const priceCount = db.prepare('SELECT COUNT(*) as count FROM daily_prices').get();
      const dateRange = db.prepare('SELECT MIN(date) as min_date, MAX(date) as max_date FROM daily_prices').get();
      const lastRun = db.prepare('SELECT * FROM ingestion_runs ORDER BY id DESC LIMIT 1').get();

      // New tables stats
      let caCount = { count: 0 }, annCount = { count: 0 }, intradayCount = { count: 0 }, earningsCount = { count: 0 };
      try { caCount = db.prepare('SELECT COUNT(*) as count FROM corporate_actions').get(); } catch (_) {}
      try { annCount = db.prepare('SELECT COUNT(*) as count FROM announcements').get(); } catch (_) {}
      try { intradayCount = db.prepare('SELECT COUNT(*) as count FROM intraday_prices').get(); } catch (_) {}
      try { earningsCount = db.prepare('SELECT COUNT(*) as count FROM earnings').get(); } catch (_) {}

      // Source usage stats
      let sourceStats = [];
      try {
        sourceStats = db.prepare(
          'SELECT source, data_type, COUNT(*) as requests, SUM(record_count) as records FROM data_source_log GROUP BY source, data_type ORDER BY source'
        ).all();
      } catch (_) {}

      console.log('\n=== TASI Pipeline Stats ===');
      console.log(`Stocks in DB: ${stockCount.count}`);
      console.log(`Price records: ${priceCount.count}`);
      console.log(`Corporate actions: ${caCount.count}`);
      console.log(`Announcements: ${annCount.count}`);
      console.log(`Intraday bars: ${intradayCount.count}`);
      console.log(`Earnings records: ${earningsCount.count}`);
      if (dateRange.min_date) {
        console.log(`Date range: ${dateRange.min_date} to ${dateRange.max_date}`);
      }
      if (lastRun) {
        console.log(`Last run: ${lastRun.started_at} (${lastRun.status}) - ${lastRun.rows_inserted} rows`);
      }
      if (sourceStats.length > 0) {
        console.log('\nData Source Usage:');
        for (const s of sourceStats) {
          console.log(`  ${s.source} / ${s.data_type}: ${s.requests} requests, ${s.records} records`);
        }
      }
      db.close();
      break;
    }

    case 'sources': {
      const { getSourceStatus } = require('./fetcher/sources');
      const status = getSourceStatus();
      console.log('\n=== Data Source Status ===');
      console.log(`Yahoo Finance:  ${status.yahoo ? 'ENABLED' : 'DISABLED'} (primary — no API key required)`);
      console.log(`Alpha Vantage:  ${status.alphaVantage ? 'ENABLED' : 'DISABLED (set ALPHA_VANTAGE_API_KEY)'} (fallback + enrichment)`);
      if (status.alphaVantageRateLimit) {
        const rl = status.alphaVantageRateLimit;
        console.log(`  Rate limit: ${rl.minuteRemaining}/5 per minute, ${rl.dailyRemaining}/25 per day`);
      }
      console.log(`Tadawul:        ${status.tadawul ? 'ENABLED' : 'DISABLED'} (corporate actions, announcements, market summary)`);
      console.log('\nSupported data types:');
      console.log('  Real-time prices:     Yahoo Finance');
      console.log('  Historical OHLCV:     Yahoo Finance -> Alpha Vantage (fallback)');
      console.log('  Intraday OHLCV:       Alpha Vantage (exclusive — hourly bars)');
      console.log('  Fundamentals:         Yahoo Finance + Alpha Vantage (merged enrichment)');
      console.log('  Earnings (EPS):       Alpha Vantage (exclusive — quarterly w/ surprise)');
      console.log('  Financial statements: Yahoo Finance -> Alpha Vantage (fallback)');
      console.log('  Corporate actions:    Tadawul (Saudi Exchange)');
      console.log('  Dividends:            Tadawul (Saudi Exchange)');
      console.log('  News/Announcements:   Tadawul (Saudi Exchange)');
      break;
    }

    case 'pg-schema': {
      console.log(POSTGRES_SCHEMA);
      break;
    }

    case 'analyze': {
      const { runPipeline } = require('./analysis/pipeline');
      const useAi = flags.includes('--ai');
      const skipEnrich = flags.includes('--skip-enrich');
      await runPipeline({ useAi, skipEnrich });
      break;
    }

    case 'serve': {
      // Ensure schema is initialized
      const db2 = getDb();
      initSchema(db2);
      db2.close();
      const { startServer } = require('./api/server');
      startServer();
      break;
    }

    case 'enrich': {
      const { enrichFundamentals } = require('./analysis/fundamental');
      console.log('Enriching fundamental data from Yahoo Finance...');
      const result = await enrichFundamentals();
      console.log(`Done. Enriched ${result.enriched}/${result.total} stocks.`);
      break;
    }

    case 'financials': {
      const { enrichFinancialReports } = require('./analysis/fundamental');
      console.log('Fetching financial statements from Yahoo Finance...');
      const result = await enrichFinancialReports();
      console.log(`Done. ${result.reportsStored} reports stored for ${result.stocksProcessed} stocks.`);
      break;
    }

    case 'candlestick': {
      const { analyzeAllCandlesticks, initCandlestickSchema } = require('./analysis/candlestick');
      const db4 = getDb();
      initSchema(db4);
      initCandlestickSchema(db4);
      db4.close();
      console.log('Scanning candlestick patterns across all TASI stocks...\n');
      const results = analyzeAllCandlesticks();
      const buys = results.filter(r => r.recommendation?.direction === 'strong_buy' || r.recommendation?.direction === 'buy');
      const sells = results.filter(r => r.recommendation?.direction === 'strong_sell' || r.recommendation?.direction === 'sell');
      console.log(`\nSummary: ${results.length} stocks analyzed`);
      console.log(`  Buy signals: ${buys.length}`);
      console.log(`  Sell signals: ${sells.length}`);
      if (buys.length > 0) {
        console.log('\nBuy Recommendations:');
        for (const b of buys) {
          const r = b.recommendation;
          console.log(`  ${b.symbol} (${b.name}): ${r.direction} | Entry: ${r.entryPrice} | SL: ${r.stopLoss} | T1: ${r.target1} | T2: ${r.target2} | R:R ${r.riskReward || 'N/A'}`);
        }
      }
      const { CMA_DISCLAIMER } = require('./analysis/scoring');
      console.log(`\n${CMA_DISCLAIMER}`);
      break;
    }

    case 'backtest': {
      const { backtestAll, storeBacktestResults } = require('./analysis/backtest');
      const holdDays = parseInt(flags.find(f => f.startsWith('--hold='))?.split('=')[1] || '10', 10);
      console.log(`Running backtest (hold period: ${holdDays} days)...\n`);
      const results = backtestAll({ holdDays });
      if (flags.includes('--store')) {
        storeBacktestResults(results);
        console.log('\nResults stored in database.');
      }
      const { CMA_DISCLAIMER } = require('./analysis/scoring');
      console.log(`\n${CMA_DISCLAIMER}`);
      break;
    }

    case 'var-backtest': {
      const { backtestVaRAllStocks, generateMonthlyReport, storeBacktestResults, getBacktestHistory } = require('./analysis/var-backtest');
      const mode = flags[0] || 'monthly';

      if (mode === 'monthly') {
        const now = new Date();
        const year = parseInt(flags.find(f => f.startsWith('--year='))?.split('=')[1] || now.getFullYear(), 10);
        const month = parseInt(flags.find(f => f.startsWith('--month='))?.split('=')[1] || now.getMonth() + 1, 10);
        console.log(`\nGenerating VaR backtest report for ${year}-${String(month).padStart(2, '0')}...\n`);
        const report = generateMonthlyReport(year, month);
        console.log(JSON.stringify(report, null, 2));

        // Store results for each stock
        if (report.summary.backtests) {
          for (const backtest of report.summary.backtests) {
            storeBacktestResults(backtest);
          }
          console.log(`\n✅ Stored ${report.summary.backtests.length} backtest results in database.`);
        }
      } else if (mode === 'history') {
        const symbol = flags.find(f => f.startsWith('--symbol='))?.split('=')[1];
        if (!symbol) {
          console.error('Error: --symbol=SYMBOL required for history mode');
          process.exit(1);
        }
        const months = parseInt(flags.find(f => f.startsWith('--months='))?.split('=')[1] || '6', 10);
        console.log(`\nVaR backtest history for ${symbol} (last ${months} months):\n`);
        const history = getBacktestHistory(symbol, months);
        console.log(JSON.stringify(history, null, 2));
      } else if (mode === 'all') {
        const startDate = flags.find(f => f.startsWith('--start='))?.split('=')[1];
        const endDate = flags.find(f => f.startsWith('--end='))?.split('=')[1];
        if (!startDate || !endDate) {
          console.error('Error: --start=YYYY-MM-DD and --end=YYYY-MM-DD required for all mode');
          process.exit(1);
        }
        console.log(`\nRunning VaR backtest from ${startDate} to ${endDate}...\n`);
        const result = backtestVaRAllStocks(new Date(startDate), new Date(endDate));
        console.log(JSON.stringify(result, null, 2));

        // Store results
        if (result.backtests) {
          for (const backtest of result.backtests) {
            storeBacktestResults(backtest);
          }
          console.log(`\n✅ Stored ${result.backtests.length} backtest results in database.`);
        }
      } else {
        console.error(`Unknown var-backtest mode: ${mode}`);
        console.log('\nUsage:');
        console.log('  node src/cli.js var-backtest monthly [--year=2026] [--month=3]');
        console.log('  node src/cli.js var-backtest history --symbol=SYMBOL [--months=6]');
        console.log('  node src/cli.js var-backtest all --start=YYYY-MM-DD --end=YYYY-MM-DD');
        process.exit(1);
      }
      break;
    }

    case 'correlations': {
      const { computeFullCorrelationMatrix, analyzeCorrelationRegimes } = require('./analysis/correlation-matrix');
      const mode = flags[0] || 'compute';

      if (mode === 'compute') {
        const window = parseInt(flags.find(f => f.startsWith('--window='))?.split('=')[1] || '252', 10);
        console.log(`\nComputing correlation matrix (${window}-day window)...\n`);
        const result = computeFullCorrelationMatrix(window);
        console.log(`Computed correlations for ${result.symbols.length} stocks`);
        console.log('\nTop correlations (>0.6):');

        const correlations = [];
        for (const sym1 of result.symbols) {
          for (const sym2 of result.symbols) {
            if (sym1 < sym2) {
              const corr = result.matrix[sym1][sym2];
              if (corr !== null && corr > 0.6) {
                correlations.push({ sym1, sym2, corr: Math.round(corr * 100) / 100 });
              }
            }
          }
        }
        correlations.sort((a, b) => b.corr - a.corr);
        for (const { sym1, sym2, corr } of correlations.slice(0, 10)) {
          console.log(`  ${sym1} ↔ ${sym2}: ${corr}`);
        }
      } else if (mode === 'regimes') {
        console.log(`\nAnalyzing correlation regimes...\n`);
        const regimes = analyzeCorrelationRegimes();

        // Group by regime
        const grouped = {};
        for (const r of regimes) {
          grouped[r.regime] = (grouped[r.regime] || 0) + 1;
        }

        console.log('Regime distribution (last 2 years):');
        for (const [regime, count] of Object.entries(grouped)) {
          const pct = (count / regimes.length * 100).toFixed(1);
          console.log(`  ${regime}: ${count} periods (${pct}%)`);
        }

        // Show recent regimes
        console.log('\nRecent regimes:');
        for (const r of regimes.slice(-10).reverse()) {
          console.log(`  ${r.date}: ${r.regime} (avg corr: ${(r.avgCorrelation || 0).toFixed(3)})`);
        }
      } else {
        console.error(`Unknown correlations mode: ${mode}`);
        console.log('\nUsage:');
        console.log('  node src/cli.js correlations compute [--window=252]');
        console.log('  node src/cli.js correlations regimes');
        process.exit(1);
      }
      break;
    }

    case 'notify-daily': {
      const { dispatchDailySummary } = require('./notifications/dispatcher');
      console.log('Dispatching daily summary emails...');
      const notifyResult = await dispatchDailySummary();
      console.log(`Done. Sent: ${notifyResult.sent}, Skipped: ${notifyResult.skipped}`);
      break;
    }

    case 'report-preview': {
      const { generateReportData } = require('./notifications/dispatcher');
      const { dailySummaryTemplate } = require('./notifications/templates');
      const fs = require('fs');
      const lang = flags.includes('--en') ? 'en' : 'ar';
      console.log(`Generating daily report preview (${lang})...`);
      const data = await generateReportData();
      if (!data) {
        console.log('No analysis data available. Run: node src/cli.js analyze');
        break;
      }
      const template = dailySummaryTemplate(data, lang);
      const outPath = flags.find(f => f.startsWith('--out='))?.split('=')[1] || 'data/daily-report-preview.html';
      fs.writeFileSync(outPath, template.html, 'utf8');
      console.log(`Report preview saved to ${outPath}`);
      console.log(`Subject: ${template.subject}`);
      break;
    }

    case 'risk': {
      const { analyzeStockRisk, analyzeAllRisks, computeSectorCorrelations, assessSectorRisks, detectRiskAlerts, generateArabicRiskReport } = require('./analysis/risk-engine');
      const symbol = flags[0];
      if (symbol === '--all') {
        console.log('Running risk analysis for all TASI stocks...\n');
        const results = analyzeAllRisks();
        console.log(`\nDone. Analyzed ${results.length} stocks. Results stored in risk_analysis table.`);
      } else if (symbol === '--correlations') {
        console.log('Computing sector correlation matrix...\n');
        const { sectors, matrix } = computeSectorCorrelations();
        console.log('Sector Correlation Matrix:');
        console.log(''.padEnd(20) + sectors.map(s => s.slice(0, 8).padEnd(10)).join(''));
        for (const s1 of sectors) {
          const row = sectors.map(s2 => {
            const val = matrix[s1][s2];
            return val !== null ? val.toFixed(2).padEnd(10) : 'N/A'.padEnd(10);
          }).join('');
          console.log(s1.slice(0, 18).padEnd(20) + row);
        }
      } else if (symbol === '--sectors') {
        console.log('Assessing sector-level risk...\n');
        const sectorRisks = assessSectorRisks();
        console.log('Sector           Stocks  Risk     AvgVol   AvgBeta  AvgVaR95  AvgSharpe');
        console.log('─'.repeat(78));
        for (const s of sectorRisks) {
          if (s.error) { console.log(`${s.sector.padEnd(17)} ${String(s.stockCount).padStart(6)}  ${s.error}`); continue; }
          console.log(
            `${s.sector.slice(0, 16).padEnd(17)} ${String(s.stockCount).padStart(6)}  ${(s.riskLevel || '').padEnd(8)} ` +
            `${s.avgVolatility ? (s.avgVolatility * 100).toFixed(1).padStart(5) + '%' : '  N/A '} ` +
            `${s.avgBeta ? s.avgBeta.toFixed(2).padStart(7) : '    N/A'} ` +
            `${s.avgVar95 ? (s.avgVar95 * 100).toFixed(2).padStart(7) + '%' : '     N/A'} ` +
            `${s.avgSharpeRatio ? s.avgSharpeRatio.toFixed(2).padStart(9) : '      N/A'}`
          );
        }
      } else if (symbol === '--alerts') {
        console.log('Scanning risk alerts...\n');
        const alertData = detectRiskAlerts();
        console.log(`Date: ${alertData.date} | Total: ${alertData.totalAlerts} | Critical: ${alertData.critical} | Warnings: ${alertData.warnings}\n`);
        for (const a of alertData.alerts) {
          const icon = a.severity === 'critical' ? '🔴' : '🟡';
          console.log(`  ${icon} [${a.type}] ${a.symbol} (${a.name}): ${a.messageEn}`);
        }
        if (alertData.totalAlerts === 0) console.log('  No risk alerts detected.');
      } else if (symbol === '--report' && flags[1]) {
        const reportSymbol = flags[1];
        console.log(`Generating Arabic risk report for ${reportSymbol}...\n`);
        const analysis = analyzeStockRisk(reportSymbol);
        if (!analysis) { console.log('Stock not found'); break; }
        if (analysis.error) { console.log(analysis.error); break; }
        const report = generateArabicRiskReport(analysis);
        console.log(report);
      } else if (symbol) {
        console.log(`Analyzing risk for ${symbol}...\n`);
        const analysis = analyzeStockRisk(symbol);
        if (!analysis) { console.log('Stock not found'); break; }
        if (analysis.error) { console.log(analysis.error); break; }

        console.log(`${analysis.name} (${analysis.symbol}) - ${analysis.sector}`);
        console.log(`Price: ${analysis.latestPrice?.toFixed(2)} SAR | Risk: ${analysis.riskLevel}`);
        console.log(`Volatility: ${(analysis.volatility * 100)?.toFixed(1) || 'N/A'}% | Beta: ${analysis.beta?.toFixed(2) || 'N/A'}`);
        console.log(`\nRisk-Adjusted Returns:`);
        console.log(`  Sharpe Ratio:  ${analysis.sharpeRatio?.toFixed(3) || 'N/A'}`);
        console.log(`  Sortino Ratio: ${analysis.sortinoRatio?.toFixed(3) || 'N/A'}`);
        if (analysis.maxDrawdown) {
          console.log(`  Max Drawdown:  ${(analysis.maxDrawdown.value * 100).toFixed(1)}% (${analysis.maxDrawdown.peakDate} → ${analysis.maxDrawdown.troughDate})`);
        }
        console.log(`\nValue at Risk (Daily):`);
        for (const v of (analysis.var?.daily || [])) {
          console.log(`  ${(v.confidence * 100).toFixed(0)}% VaR: ${(v.var * 100).toFixed(2)}% | CVaR: ${(v.cvar * 100).toFixed(2)}%`);
        }
        console.log(`\nValue at Risk (10-Day):`);
        for (const v of (analysis.var?.tenDay || [])) {
          console.log(`  ${(v.confidence * 100).toFixed(0)}% VaR: ${(v.var * 100).toFixed(2)}% | CVaR: ${(v.cvar * 100).toFixed(2)}%`);
        }
        console.log(`\nStress Test Scenarios:`);
        for (const s of (analysis.stressTests || [])) {
          console.log(`  ${s.scenario.padEnd(22)} Loss: ${(s.lossPct * 100).toFixed(1)}% → ${s.projectedPrice.toFixed(2)} SAR [${s.severity}]`);
        }
      } else {
        console.log('Usage: node src/cli.js risk <symbol>');
        console.log('       node src/cli.js risk --all           Run for all stocks');
        console.log('       node src/cli.js risk --correlations   Show sector correlations');
        console.log('       node src/cli.js risk --sectors        Sector-level risk assessment');
        console.log('       node src/cli.js risk --alerts         Scan risk alerts');
        console.log('       node src/cli.js risk --report <sym>   Arabic risk report');
      }
      const { CMA_DISCLAIMER: disc } = require('./analysis/scoring');
      console.log(`\n${disc}`);
      break;
    }

    case 'portfolio': {
      const subCmd = flags[0];
      if (subCmd === 'build' || subCmd === 'rebalance') {
        const { buildModelPortfolio } = require('./analysis/portfolio');
        const useAi = flags.includes('--ai');
        const result = await buildModelPortfolio({ useAi });
        if (!result) { console.log('Portfolio build failed. Run analyze first.'); break; }
        const { CMA_DISCLAIMER } = require('./analysis/scoring');
        console.log(`\n${CMA_DISCLAIMER}`);
      } else if (subCmd === 'show') {
        const { getActivePortfolio } = require('./analysis/portfolio');
        const portfolio = getActivePortfolio();
        if (!portfolio) { console.log('No active portfolio. Run: node src/cli.js portfolio build'); break; }
        console.log(`\nModel Portfolio (rebalanced ${portfolio.rebalanceDate})`);
        console.log(`Strategy: ${portfolio.strategy} | Stocks: ${portfolio.stockCount} | Diversification: ${portfolio.diversificationScore?.toFixed(1) || 'N/A'}/10\n`);
        console.log('Symbol      Name                          Weight   Entry    Current  P&L%   Signal');
        console.log('─'.repeat(90));
        for (const h of portfolio.holdings) {
          console.log(
            `${h.symbol.padEnd(10)}  ${h.name.padEnd(30).slice(0, 30)}  ${(h.weight * 100).toFixed(1).padStart(5)}%  ${(h.entry_price || 0).toFixed(2).padStart(7)}  ${(h.current_price || 0).toFixed(2).padStart(7)}  ${h.pnl.toFixed(1).padStart(5)}%  ${h.rationale?.split(',')[0] || ''}`
          );
        }
        console.log('\nSector Allocation:');
        for (const [sector, weight] of Object.entries(portfolio.sectorAllocation).sort((a, b) => b[1] - a[1])) {
          const bar = '█'.repeat(Math.round(weight * 50));
          console.log(`  ${sector.padEnd(25)} ${(weight * 100).toFixed(1).padStart(5)}% ${bar}`);
        }
        if (portfolio.summary) {
          console.log(`\nPerformance (${portfolio.summary.latestDate}):`);
          console.log(`  Portfolio:  ${(portfolio.summary.cumulativeReturn * 100).toFixed(2)}%`);
          console.log(`  TASI:       ${(portfolio.summary.tasiReturn * 100).toFixed(2)}%`);
          console.log(`  Excess:     ${(portfolio.summary.excessReturn * 100).toFixed(2)}%`);
        }
        const { CMA_DISCLAIMER } = require('./analysis/scoring');
        console.log(`\n${CMA_DISCLAIMER}`);
      } else if (subCmd === 'backtest') {
        const { backtestPortfolio } = require('./analysis/portfolio');
        const weeks = parseInt(flags.find(f => f.startsWith('--weeks='))?.split('=')[1] || '52', 10);
        console.log(`Running portfolio strategy backtest (${weeks} weeks)...\n`);
        const result = backtestPortfolio({ weeks });
        if (result.error) { console.log(result.error); break; }
        console.log(`Period: ${result.startDate} to ${result.endDate} (${result.rebalances} rebalances)`);
        console.log(`Portfolio return: ${(result.totalReturn * 100).toFixed(2)}%`);
        console.log(`TASI return:      ${(result.tasiTotalReturn * 100).toFixed(2)}%`);
        console.log(`Excess return:    ${(result.excessReturn * 100).toFixed(2)}%`);
        console.log(`\nFinal values (base 10,000):`);
        console.log(`  Portfolio: ${result.portfolioFinalValue.toFixed(0)}`);
        console.log(`  TASI:      ${result.tasiFinalValue.toFixed(0)}`);
        const { CMA_DISCLAIMER } = require('./analysis/scoring');
        console.log(`\n${CMA_DISCLAIMER}`);
      } else if (subCmd === 'update') {
        const { updatePerformanceTracking } = require('./analysis/portfolio');
        console.log('Updating portfolio performance tracking...');
        const result = updatePerformanceTracking();
        if (!result) { console.log('No active portfolio found.'); break; }
        console.log(`Portfolio #${result.portfolioId}: ${result.status}${result.newDays ? ` (+${result.newDays} days)` : ''}`);
      } else if (subCmd === 'history') {
        const { getPortfolioHistory } = require('./analysis/portfolio');
        const history = getPortfolioHistory();
        if (history.length === 0) { console.log('No portfolio history.'); break; }
        console.log(`\nPortfolio History (${history.length} rebalances):\n`);
        for (const p of history) {
          const delta = p.rebalance;
          console.log(`  #${p.id} ${p.rebalance_date} [${p.status}] ${p.stock_count} stocks | Div: ${p.diversification_score?.toFixed(1) || 'N/A'}/10`);
          if (delta) {
            if (delta.additions.length) console.log(`    + ${delta.additions.join(', ')}`);
            if (delta.removals.length) console.log(`    - ${delta.removals.join(', ')}`);
            console.log(`    Turnover: ${(delta.turnover * 100).toFixed(1)}%`);
          }
        }
      } else {
        console.log(`
Portfolio Commands:
  portfolio build [--ai]    Build/rebalance the model portfolio
  portfolio show            Show current active portfolio
  portfolio backtest        Backtest portfolio strategy (--weeks=52)
  portfolio update          Update performance tracking with latest prices
  portfolio history         Show all portfolio rebalances
`);
      }
      break;
    }

    case 'sectors': {
      const { generateSectorReports } = require('./analysis/sectors');
      console.log('Generating comprehensive sector reports...\n');
      const result = generateSectorReports();
      if (!result.date) {
        console.log('No analysis data available. Run: node src/cli.js analyze');
        break;
      }
      console.log(`Date: ${result.date}\n`);
      console.log('=== Sector Reports ===\n');
      for (const s of result.sectors.sort((a, b) => b.avgScore - a.avgScore)) {
        const perf1w = s.pricePerformance?.['1w']?.avgReturn;
        const perf1m = s.pricePerformance?.['1m']?.avgReturn;
        console.log(`${s.sector} (${s.stockCount} stocks)`);
        console.log(`  Score: ${s.avgScore}/10 | Trend: ${s.trend} | RSI: ${s.avgRsi || 'N/A'} | P/E: ${s.avgPe || 'N/A'}`);
        console.log(`  Returns: 1W ${perf1w != null ? perf1w.toFixed(1) + '%' : 'N/A'} | 1M ${perf1m != null ? perf1m.toFixed(1) + '%' : 'N/A'}`);
        console.log(`  Top: ${s.topPerformers[0]?.name || 'N/A'} (${s.topPerformers[0]?.score || 'N/A'})`);
        console.log(`  Bottom: ${s.bottomPerformers[0]?.name || 'N/A'} (${s.bottomPerformers[0]?.score || 'N/A'})`);
        if (s.quarterlyEarnings?.yoyGrowth) {
          const yoy = s.quarterlyEarnings.yoyGrowth;
          console.log(`  Quarterly YoY: Revenue ${yoy.revenueGrowth != null ? yoy.revenueGrowth + '%' : 'N/A'} | Net Income ${yoy.netIncomeGrowth != null ? yoy.netIncomeGrowth + '%' : 'N/A'}`);
        }
        console.log();
      }
      if (result.rotation.length > 0) {
        console.log('=== Sector Rotation Signals ===\n');
        console.log('Sector                    Signal         Momentum  Buy%  Score  1W%    1M%');
        console.log('─'.repeat(80));
        for (const r of result.rotation) {
          console.log(
            `${r.sector.padEnd(26)} ${r.signal.padEnd(14)} ${String(r.momentum).padStart(8)}  ${(r.buyRatio * 100).toFixed(0).padStart(4)}% ${String(r.avgScore).padStart(5)}  ${r.priceReturn1w != null ? (r.priceReturn1w + '%').padStart(5) : '  N/A'}  ${r.priceReturn1m != null ? (r.priceReturn1m + '%').padStart(5) : '  N/A'}`
          );
        }
      }
      const { CMA_DISCLAIMER } = require('./analysis/scoring');
      console.log(`\n${CMA_DISCLAIMER}`);
      break;
    }

    case 'rankings': {
      const db3 = getDb();
      initSchema(db3);
      const latestDate = db3.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
      if (!latestDate) {
        console.log('No analysis data. Run: node src/cli.js analyze');
        db3.close();
        break;
      }
      const rankings = db3.prepare(`
        SELECT s.symbol, s.name, s.sector, ss.overall_score, ss.entry_signal, ss.risk_level
        FROM stocks s
        JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
        ORDER BY ss.overall_score DESC
        LIMIT 20
      `).all(latestDate);
      console.log(`\nTop 20 TASI Stocks (as of ${latestDate}):\n`);
      console.log('Rank  Symbol      Name                          Score  Signal       Risk');
      console.log('─'.repeat(80));
      rankings.forEach((r, i) => {
        console.log(
          `${String(i + 1).padStart(4)}  ${r.symbol.padEnd(10)}  ${r.name.padEnd(30).slice(0, 30)}  ${String(r.overall_score).padStart(5)}  ${(r.entry_signal || 'N/A').padEnd(12)} ${r.risk_level}`
        );
      });
      const { CMA_DISCLAIMER } = require('./analysis/scoring');
      console.log(`\n${CMA_DISCLAIMER}`);
      db3.close();
      break;
    }

    case 'stress-calibrate': {
      const {
        runFullCalibration,
        HISTORICAL_SHOCKS,
      } = require('./analysis/stress-test-calibration');
      const mode = flags[0] || 'all';

      if (mode === 'covid' || mode === '2020') {
        console.log('\n📊 Calibrating Stress Tests Against 2020 COVID Crisis\n');
        const report = runFullCalibration('covid_2020');
        console.log('\n' + '='.repeat(80));
        console.log('CALIBRATION REPORT: COVID-19 MARKET CRASH (2020)');
        console.log('='.repeat(80));
        console.log(`\n📈 Historical Analysis:`);
        console.log(`  Stocks analyzed: ${report.historicalAnalysis.stocksAnalyzed}`);
        console.log(`  Average realized loss: ${report.historicalAnalysis.avgRealizedLoss}`);
        console.log(`\nBy Sector:`);
        for (const [sector, data] of Object.entries(report.historicalAnalysis.bySector)) {
          console.log(`  ${sector.padEnd(25)} Avg: ${(data.avgLoss * 100).toFixed(2)}%  Max: ${(data.maxLoss * 100).toFixed(2)}%`);
        }
        console.log(`\n⚖️  Calibration Results:`);
        console.log(`  Proposed multipliers:`);
        if (report.calibration.proposedMultipliers.oilSensitive) {
          console.log(`    Oil-sensitive: ${report.calibration.currentMultipliers.oilSensitive} → ${report.calibration.proposedMultipliers.oilSensitive}`);
        }
        if (report.calibration.proposedMultipliers.rateSensitive) {
          console.log(`    Rate-sensitive: ${report.calibration.currentMultipliers.rateSensitive} → ${report.calibration.proposedMultipliers.rateSensitive}`);
        }
        console.log(`\n✅ Model Validation:`);
        console.log(`  Accuracy (within 20%): ${report.validation.accuracyMetrics.accuracyRate}`);
        console.log(`  Avg error: ${report.validation.accuracyMetrics.avgError}`);
        console.log(`  Median error: ${report.validation.accuracyMetrics.medianError}`);
        console.log(`  Max error: ${report.validation.accuracyMetrics.maxError}`);
        console.log(`\n💡 Recommendations:`);
        for (const rec of report.recommendations) {
          console.log(`  ${rec}`);
        }
        console.log();
      } else if (mode === 'oil' || mode === '2016') {
        console.log('\n📊 Calibrating Stress Tests Against 2015-2016 Oil Shock\n');
        const report = runFullCalibration('oil_shock_2015_2016');
        console.log('\n' + '='.repeat(80));
        console.log('CALIBRATION REPORT: OIL PRICE COLLAPSE (2015-2016)');
        console.log('='.repeat(80));
        console.log(`\n📈 Historical Analysis:`);
        console.log(`  Stocks analyzed: ${report.historicalAnalysis.stocksAnalyzed}`);
        console.log(`  Average realized loss: ${report.historicalAnalysis.avgRealizedLoss}`);
        console.log(`\nBy Sector:`);
        for (const [sector, data] of Object.entries(report.historicalAnalysis.bySector)) {
          console.log(`  ${sector.padEnd(25)} Avg: ${(data.avgLoss * 100).toFixed(2)}%  Max: ${(data.maxLoss * 100).toFixed(2)}%`);
        }
        console.log(`\n⚖️  Calibration Results:`);
        console.log(`  Proposed multipliers:`);
        if (report.calibration.proposedMultipliers.oilSensitive) {
          console.log(`    Oil-sensitive: ${report.calibration.currentMultipliers.oilSensitive} → ${report.calibration.proposedMultipliers.oilSensitive}`);
        }
        if (report.calibration.proposedMultipliers.rateSensitive) {
          console.log(`    Rate-sensitive: ${report.calibration.currentMultipliers.rateSensitive} → ${report.calibration.proposedMultipliers.rateSensitive}`);
        }
        console.log(`\n✅ Model Validation:`);
        console.log(`  Accuracy (within 20%): ${report.validation.accuracyMetrics.accuracyRate}`);
        console.log(`  Avg error: ${report.validation.accuracyMetrics.avgError}`);
        console.log(`  Median error: ${report.validation.accuracyMetrics.medianError}`);
        console.log(`  Max error: ${report.validation.accuracyMetrics.maxError}`);
        console.log(`\n💡 Recommendations:`);
        for (const rec of report.recommendations) {
          console.log(`  ${rec}`);
        }
        console.log();
      } else if (mode === 'all' || mode === 'both') {
        console.log('\n📊 Running Full Stress Test Calibration Against All Historical Shocks\n');
        const reports = {};
        for (const [key] of Object.entries(HISTORICAL_SHOCKS)) {
          console.log(`Calibrating against ${HISTORICAL_SHOCKS[key].name}...`);
          reports[key] = runFullCalibration(key);
        }
        console.log('\n' + '='.repeat(80));
        console.log('FULL CALIBRATION SUMMARY');
        console.log('='.repeat(80));
        for (const [key, report] of Object.entries(reports)) {
          console.log(`\n${report.shockPeriod}:`);
          console.log(`  Stocks: ${report.historicalAnalysis.stocksAnalyzed}`);
          console.log(`  Avg loss: ${report.historicalAnalysis.avgRealizedLoss}`);
          console.log(`  Model accuracy: ${report.validation.accuracyMetrics.accuracyRate}`);
        }
        console.log();
      } else {
        console.error(`Unknown stress-calibrate mode: ${mode}`);
        console.log('\nUsage:');
        console.log('  node src/cli.js stress-calibrate covid    # Calibrate against 2020 COVID crash');
        console.log('  node src/cli.js stress-calibrate oil      # Calibrate against 2015-2016 oil shock');
        console.log('  node src/cli.js stress-calibrate all      # Calibrate against all historical shocks');
        process.exit(1);
      }
      break;
    }

    default:
      console.log(`
TASI Analysis Platform
=======================

Usage:
  node src/cli.js <command>

Data Commands:
  backfill [years]  Full historical data load (default: 2 years)
  daily             Fetch last 3 days of data
  scheduler         Start cron-based daily scheduler
  init-db           Initialize database schema only
  enrich            Enrich stocks with fundamental data from Yahoo Finance
  financials        Fetch quarterly/annual financial statements (income, balance, cash flow)
  tickers           List all covered TASI tickers
  stats             Show pipeline statistics (incl. source usage)
  sources           Show data source status and configuration
  pg-schema         Print PostgreSQL migration schema

Environment Variables:
  ALPHA_VANTAGE_API_KEY   Enable Alpha Vantage as fallback data source
  TASI_DB_PATH            Custom SQLite database path

Analysis Commands:
  analyze           Run full analysis pipeline (technical + fundamental + scoring)
  analyze --ai      Run with AI-powered scoring (requires ANTHROPIC_API_KEY)
  analyze --skip-enrich  Skip Yahoo Finance fundamental enrichment
  candlestick       Run candlestick pattern recognition (engulfing, doji, stars, etc.)
  backtest          Backtest recommendation accuracy against historical data
  backtest --hold=N Set hold period in days (default: 10)
  backtest --store  Save backtest results to database
  risk <symbol>     Detailed risk analysis (VaR, Sharpe, stress tests)
  risk --all        Run risk analysis for all stocks (stores results)
  risk --correlations  Show sector correlation matrix
  risk --sectors    Sector-level risk assessment
  risk --alerts     Scan for risk alerts (high VaR, volatility spikes, etc.)
  risk --report <s> Generate Arabic risk report for a stock
  sectors           Generate comprehensive sector reports (trends, rotation, earnings)
  rankings          Show top 20 stocks by score

Stress Test Calibration:
  stress-calibrate covid    Calibrate against 2020 COVID crash (~30% decline)
  stress-calibrate oil      Calibrate against 2015-2016 oil shock (~22% decline)
  stress-calibrate all      Calibrate against all historical shock periods

Portfolio Commands:
  portfolio build   Build/rebalance the AI model portfolio (--ai for AI reasoning)
  portfolio show    Show current active portfolio with holdings and performance
  portfolio backtest  Backtest portfolio strategy (--weeks=52)
  portfolio update  Update performance tracking with latest prices
  portfolio history Show all portfolio rebalances

Notification Commands:
  notify-daily      Send daily market summary email to all eligible subscribers
  report-preview    Generate daily report HTML preview (--en for English, --out=path)

API Server:
  serve             Start the analysis API server (default port 3000)
`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
