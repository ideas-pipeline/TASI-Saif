const { computeAllIndicators } = require('./technical');
const { enrichFundamentals } = require('./fundamental');
const { scoreAllStocks } = require('./scoring');
const { analyzeSectors, generateSectorReports } = require('./sectors');
const { analyzeAllCandlesticks } = require('./candlestick');
const { dispatchInstantAlerts } = require('../notifications/dispatcher');
const { analyzeAllRisks, detectRiskAlerts } = require('./risk-engine');

/**
 * Run the full analysis pipeline:
 * 1. Enrich fundamentals from Yahoo Finance
 * 2. Compute technical indicators
 * 3. Score all stocks (with optional AI)
 * 4. Analyze sectors
 */
async function runPipeline({ useAi = false, skipEnrich = false } = {}) {
  const startTime = Date.now();
  console.log('=== TASI Analysis Pipeline ===\n');

  // Step 1: Enrich fundamentals
  if (!skipEnrich) {
    console.log('Step 1: Enriching fundamental data...');
    try {
      const enrichResult = await enrichFundamentals();
      console.log(`  Enriched ${enrichResult.enriched}/${enrichResult.total} stocks\n`);
    } catch (err) {
      console.warn(`  Fundamental enrichment failed: ${err.message}`);
      console.warn('  Continuing with existing data...\n');
    }
  } else {
    console.log('Step 1: Skipping fundamental enrichment\n');
  }

  // Step 2: Technical indicators
  console.log('Step 2: Computing technical indicators...');
  const indicatorCount = computeAllIndicators();
  console.log(`  Computed ${indicatorCount} indicator rows\n`);

  // Step 2.5: Candlestick pattern recognition
  console.log('Step 2.5: Scanning candlestick patterns...');
  const candlestickResults = analyzeAllCandlesticks();
  const totalPatterns = candlestickResults.reduce((sum, r) => sum + r.patterns, 0);
  const buySignalsCandlestick = candlestickResults.filter(r =>
    r.recommendation?.direction === 'strong_buy' || r.recommendation?.direction === 'buy'
  );
  console.log(`  Found ${totalPatterns} patterns across ${candlestickResults.length} stocks`);
  console.log(`  Candlestick buy signals: ${buySignalsCandlestick.length} stocks\n`);

  // Step 3: Stock scoring
  console.log(`Step 3: Scoring all stocks (AI=${useAi})...`);
  const scores = await scoreAllStocks({ useAi });
  console.log(`  Scored ${scores.length} stocks\n`);

  // Step 4: Sector analysis
  console.log('Step 4: Analyzing sectors...');
  const sectors = analyzeSectors();
  console.log(`  Analyzed ${sectors.length} sectors\n`);

  // Step 4.5: Generate detailed sector reports
  console.log('Step 4.5: Generating sector reports...');
  const sectorReports = generateSectorReports();
  console.log(`  Generated ${sectorReports.sectors.length} sector reports with ${sectorReports.rotation.length} rotation signals\n`);

  // Step 5: Risk analysis
  console.log('Step 5: Running risk analysis...');
  const riskResults = analyzeAllRisks();
  console.log(`  Analyzed risk for ${riskResults.length} stocks\n`);

  // Step 5.5: Risk alerts
  console.log('Step 5.5: Scanning risk alerts...');
  const riskAlerts = detectRiskAlerts();
  console.log(`  Found ${riskAlerts.totalAlerts} alerts (${riskAlerts.critical} critical, ${riskAlerts.warnings} warnings)\n`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`=== Pipeline complete in ${elapsed}s ===`);

  // Summary
  const buySignals = scores.filter(s => s.entrySignal === 'strong_buy' || s.entrySignal === 'buy');
  const topStocks = scores.sort((a, b) => b.overallScore - a.overallScore).slice(0, 5);

  console.log(`\nTop 5 Opportunities:`);
  for (const s of topStocks) {
    console.log(`  ${s.symbol} (${s.name}) - Score: ${s.overallScore}/10 [${s.entrySignal}] Risk: ${s.riskLevel}`);
  }
  console.log(`\nBuy signals: ${buySignals.length} stocks`);

  // Step 6: Dispatch instant email alerts for actionable signals
  console.log('\nStep 6: Dispatching instant alerts...');
  try {
    const alertResult = await dispatchInstantAlerts(scores);
    console.log(`  Alerts: ${alertResult.sent} sent, ${alertResult.skipped} skipped`);
  } catch (err) {
    console.warn(`  Alert dispatch failed: ${err.message}`);
  }

  return { scores, sectors, riskAlerts, elapsed };
}

module.exports = { runPipeline };
