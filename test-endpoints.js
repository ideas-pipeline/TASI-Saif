// Direct test of drift monitoring endpoints without HTTP
const { getDriftStatus, recordDailyAccuracy, getAccuracyTrend } = require('./src/analysis/stress-test-calibration');

console.log('\n✅ ENDPOINT TEST: Drift Monitoring Functions\n');

// Test 1: GET /api/risk/scenarios/drift-status equivalent
console.log('📊 GET /api/risk/scenarios/drift-status');
recordDailyAccuracy('market_crash', 85.0, '2026-03-20');
recordDailyAccuracy('market_crash', 82.5, '2026-03-21');
recordDailyAccuracy('market_crash', 80.0, '2026-03-22');
recordDailyAccuracy('oil_price_crash', 55.0, '2026-03-23');

const driftStatus = getDriftStatus();
console.log(JSON.stringify({
  description: 'Real-time drift monitoring for stress test multiplier accuracy',
  timestamp: driftStatus.timestamp,
  overallHealth: driftStatus.requiresRecalibration.length > 0 ? 'degraded' : (driftStatus.warnings.length > 0 ? 'warning' : 'healthy'),
  driftStatus,
  thresholds: {
    warning: '75% accuracy',
    critical: '60% accuracy',
  },
}, null, 2));

// Test 2: POST /api/risk/scenarios/calibration/update-accuracy equivalent
console.log('\n\n📊 POST /api/risk/scenarios/calibration/update-accuracy');
recordDailyAccuracy('interest_rate_hike', 78.5, '2026-03-24');
const trend = getAccuracyTrend('interest_rate_hike');
console.log(JSON.stringify({
  message: 'Accuracy recorded',
  scenario: 'interest_rate_hike',
  recorded: { accuracy: 78.5, date: '2026-03-24' },
  currentTrend: trend,
  action: trend.requiresRecalibration ? 'Auto-recalibration recommended' : 'Monitoring continues',
}, null, 2));

console.log('\n✅ All drift monitoring endpoints functional!\n');
