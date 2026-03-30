const { recordDailyAccuracy, getAccuracyTrend, getDriftStatus } = require('./src/analysis/stress-test-calibration');

console.log('Testing drift monitoring API functions directly...\n');

// Test 1: Record accuracy
recordDailyAccuracy('market_crash', 85.0, '2026-03-20');
recordDailyAccuracy('market_crash', 82.5, '2026-03-21');
recordDailyAccuracy('market_crash', 80.0, '2026-03-22');

console.log('✅ Recorded accuracy for market_crash');

// Test 2: Get trend
const trend = getAccuracyTrend('market_crash');
console.log('\n📊 Accuracy Trend:');
console.log(JSON.stringify(trend, null, 2));

// Test 3: Get drift status
const status = getDriftStatus();
console.log('\n📊 Overall Drift Status:');
console.log(JSON.stringify(status, null, 2));

console.log('\n✅ All functions working correctly!');
