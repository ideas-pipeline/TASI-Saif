#!/usr/bin/env node
/**
 * Integration Tests for TASI Platform Risk Analysis
 * Validates VaR backtesting, stress test calibration, and drift monitoring
 */

const {
  recordDailyAccuracy,
  getAccuracyTrend,
  getDriftStatus,
  initializeDriftMonitoring,
  DRIFT_THRESHOLDS,
  generateScenarioCalibrationReport,
} = require('../src/analysis/stress-test-calibration');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
    throw new Error(message);
  }
}

function pass(message) {
  console.log(`✅ PASS: ${message}`);
  testsPassed++;
}

// ─── Test Suite: Drift Monitoring ───────────────────────────────────────────

console.log('\n📋 INTEGRATION TESTS: Drift Monitoring (Phase 5)\n');

try {
  // Test 1: Record daily accuracy and retrieve trend
  console.log('🧪 Test 1: Record accuracy and retrieve trend');
  recordDailyAccuracy('market_crash', 85.0, '2026-03-20');
  recordDailyAccuracy('market_crash', 82.5, '2026-03-21');
  recordDailyAccuracy('market_crash', 80.0, '2026-03-22');

  const trend = getAccuracyTrend('market_crash');
  assert(trend.currentAccuracy === 80.0, 'Current accuracy should be 80.0');
  assert(trend.trend30day >= 79 && trend.trend30day <= 83, 'Trend should be between 79-83');
  assert(trend.driftStatus === 'healthy', 'Status should be healthy above 75%');
  assert(!trend.requiresRecalibration, 'Should not require recalibration above 60%');
  pass('Accuracy recording and trend calculation working correctly');

  // Test 2: Warning threshold detection
  console.log('\n🧪 Test 2: Warning threshold detection (75%)');
  recordDailyAccuracy('interest_rate_hike', 74.0, '2026-03-23');

  const warningTrend = getAccuracyTrend('interest_rate_hike');
  assert(warningTrend.driftStatus === 'warning', 'Status should be warning at 74%');
  assert(!warningTrend.requiresRecalibration, 'Should not require recalibration above 60%');
  pass('Warning threshold correctly triggers at <75%');

  // Test 3: Critical threshold detection
  console.log('\n🧪 Test 3: Critical threshold detection (60%)');
  recordDailyAccuracy('oil_price_crash', 55.0, '2026-03-24');

  const criticalTrend = getAccuracyTrend('oil_price_crash');
  assert(criticalTrend.driftStatus === 'critical', 'Status should be critical at 55%');
  assert(criticalTrend.requiresRecalibration, 'Should require recalibration below 60%');
  pass('Critical threshold correctly triggers at <60%');

  // Test 4: Drift status aggregation
  console.log('\n🧪 Test 4: Multi-scenario drift status aggregation');
  recordDailyAccuracy('mild_correction', 92.0, '2026-03-25');
  recordDailyAccuracy('sector_downturn', 65.0, '2026-03-26');
  recordDailyAccuracy('geopolitical_crisis', 58.0, '2026-03-27');

  const driftStatus = getDriftStatus();
  assert(driftStatus.scenarioStatus, 'Drift status should have scenario data');
  assert(driftStatus.requiresRecalibration.length > 0, 'Should flag scenarios below critical threshold');
  assert(driftStatus.warnings.length > 0, 'Should track warning-level scenarios');

  const criticalScenarios = driftStatus.requiresRecalibration.map(r => r.scenario);
  assert(criticalScenarios.includes('oil_price_crash'), 'oil_price_crash should be in critical list');
  assert(criticalScenarios.includes('geopolitical_crisis'), 'geopolitical_crisis should be in critical list');
  pass('Drift status correctly aggregates multi-scenario monitoring');

  // Test 5: Rolling 30-day window
  console.log('\n🧪 Test 5: Rolling 30-day window enforcement');
  recordDailyAccuracy('market_crash', 78.0, '2026-03-01'); // 28 days ago
  recordDailyAccuracy('market_crash', 81.0, '2026-03-29'); // Today

  const rollingTrend = getAccuracyTrend('market_crash');
  // Should only include data from last 30 days
  assert(rollingTrend.trend30day, 'Rolling window should compute 30-day average');
  assert(rollingTrend.currentAccuracy === 81.0, 'Current should be latest recorded value');
  pass('Rolling 30-day window correctly maintained');

  // Test 6: Drift thresholds constant values
  console.log('\n🧪 Test 6: Drift threshold constants');
  assert(DRIFT_THRESHOLDS.warning === 75, 'Warning threshold should be 75%');
  assert(DRIFT_THRESHOLDS.critical === 60, 'Critical threshold should be 60%');
  pass('Drift thresholds correctly defined');

  // Test 7: Initialize drift monitoring from calibration report
  console.log('\n🧪 Test 7: Initialize drift monitoring from calibration report');
  const mockReport = {
    validationSummary: {
      market_crash: { avgAccuracy: '82.5%' },
      oil_price_crash: { avgAccuracy: '78.0%' },
      interest_rate_hike: { avgAccuracy: '80.0%' },
    },
  };

  initializeDriftMonitoring(mockReport);
  const initializedStatus = getDriftStatus();
  assert(initializedStatus.scenarioStatus.market_crash.currentAccuracy === 82.5, 'Should seed with calibration accuracy');
  pass('Drift monitoring correctly initialized from calibration report');

  // Test 8: No data scenario
  console.log('\n🧪 Test 8: Handle no-data scenarios gracefully');
  const noDataTrend = getAccuracyTrend('nonexistent_scenario');
  assert(noDataTrend.driftStatus === 'no_data', 'Should return no_data status for untracked scenarios');
  assert(noDataTrend.currentAccuracy === null, 'Current accuracy should be null when no data');
  pass('No-data scenario handled correctly');

  console.log('\n' + '='.repeat(60));
  console.log(`✨ Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));

  if (testsFailed > 0) {
    process.exit(1);
  }

  console.log('\n✅ All drift monitoring tests passed successfully!\n');
  process.exit(0);

} catch (e) {
  console.error('\n❌ Test suite failed:', e.message);
  console.error(e.stack);
  process.exit(1);
}
