const { getDb, initSchema } = require('../db/schema');
const { stressTest } = require('./risk-engine');

// ─── Historical Shock Periods ─────────────────────────────────────────────
// These represent major market stress events we can analyze and learn from
const HISTORICAL_SHOCKS = {
  covid_2020: {
    name: 'COVID-19 Market Crash (2020)',
    eventDate: '2020-03-15', // Peak market decline in Saudi market
    shockWindowStart: '2020-03-01',
    shockWindowEnd: '2020-04-30',
    analysisWindowStart: '2020-01-01',
    analysisWindowEnd: '2020-06-30',
    expectedScenario: 'market_crash',
    historicalContext: {
      tasiDeclline: -0.30, // ~30% decline from peak
      peakDate: '2020-03-10',
      description: 'Global pandemic caused panic selling. TASI fell ~30% over 2 months.',
      affectedSectors: ['Banking', 'Energy', 'Real Estate', 'Diversified Financials'],
    },
  },
  oil_shock_2015_2016: {
    name: 'Oil Price Collapse (2015-2016)',
    eventDate: '2016-02-15', // Nadir of oil prices
    shockWindowStart: '2015-06-01',
    shockWindowEnd: '2016-03-31',
    analysisWindowStart: '2015-01-01',
    analysisWindowEnd: '2016-06-30',
    expectedScenario: 'oil_price_crash',
    historicalContext: {
      oilPrice: { before: 108, after: 26, decline: -0.76 },
      tasiDecline: -0.22, // ~22% decline
      peakDate: '2015-07-20',
      description: 'Oil collapsed from $108 to $26/barrel. Heavy impact on Saudi energy sector.',
      affectedSectors: ['Energy', 'Materials', 'Capital Goods'],
    },
  },
};

/**
 * Get historical price data for a stock during a shock period
 * @param {string} symbol - Stock symbol
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} Array of {date, close, returns}
 */
function getHistoricalPricesForPeriod(symbol, startDate, endDate) {
  const db = getDb();
  initSchema(db);

  const prices = db.prepare(`
    SELECT date, close FROM daily_prices
    WHERE symbol = ? AND date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(symbol, startDate, endDate);

  // Compute returns
  const withReturns = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const curr = prices[i];
    if (prev.close > 0) {
      withReturns.push({
        date: curr.date,
        close: curr.close,
        returns: (curr.close - prev.close) / prev.close,
      });
    }
  }

  return withReturns;
}

/**
 * Get all stocks and their sectors
 * @returns {Array} Array of {symbol, sector}
 */
function getAllStocksWithSectors() {
  const db = getDb();
  initSchema(db);

  return db.prepare('SELECT symbol, sector FROM stocks ORDER BY symbol ASC').all();
}

/**
 * Get stock volatility and beta for a period
 * @param {string} symbol
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {{volatility: number, beta: number, avgReturn: number}}
 */
function getStockMetrics(symbol, startDate, endDate) {
  const prices = getHistoricalPricesForPeriod(symbol, startDate, endDate);

  if (prices.length < 5) {
    return { volatility: 0.30, beta: 1.0, avgReturn: 0 };
  }

  const returns = prices.map(p => p.returns);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

  const variance = returns.reduce((sum, r) => {
    return sum + Math.pow(r - avgReturn, 2);
  }, 0) / returns.length;
  const volatility = Math.sqrt(variance);

  // For beta, we'd ideally compare to TASI index, but estimate from volatility
  // Higher volatility correlates with higher beta
  const beta = 0.8 + volatility / 0.40; // Scale 0.8 to 1.8 based on vol

  return { volatility: volatility || 0.30, beta: Math.max(0.5, beta), avgReturn };
}

/**
 * Analyze realized losses during a historical shock period
 * @param {object} shockPeriod - One of HISTORICAL_SHOCKS
 * @returns {object} Analysis with actual sector impacts
 */
function analyzeHistoricalShock(shockPeriod) {
  const stocks = getAllStocksWithSectors();
  // Use string dates directly for database queries (YYYY-MM-DD format)
  const shockStart = shockPeriod.shockWindowStart;
  const shockEnd = shockPeriod.shockWindowEnd;

  const analysis = {
    shockName: shockPeriod.name,
    shockPeriod: { start: shockPeriod.shockWindowStart, end: shockPeriod.shockWindowEnd },
    byStock: [],
    bySector: {},
    overallMetrics: {},
  };

  // Get prices before shock for baseline and during shock for comparison
  const beforeData = {};
  const duringData = {};
  const afterData = {};

  for (const stock of stocks) {
    const symbol = stock.symbol;

    // Get historical metrics from pre-shock period (for vol/beta)
    const preShockMetrics = getStockMetrics(symbol, '2019-01-01', shockStart);

    // Get prices during shock
    const duringPrices = getHistoricalPricesForPeriod(symbol, shockStart, shockEnd);
    if (duringPrices.length === 0) continue;

    // Calculate realized loss during shock
    const firstPrice = duringPrices[0].close;
    const lastPrice = duringPrices[duringPrices.length - 1].close;
    const realizedLoss = (firstPrice - lastPrice) / firstPrice;

    analysis.byStock.push({
      symbol,
      sector: stock.sector,
      firstPrice,
      lastPrice,
      realizedLoss,
      returns: duringPrices.map(p => p.returns),
      avgReturn: duringPrices.reduce((a, p) => a + p.returns, 0) / duringPrices.length,
      minReturn: Math.min(...duringPrices.map(p => p.returns)),
      volatility: preShockMetrics.volatility,
      beta: preShockMetrics.beta,
    });

    // Aggregate by sector
    if (!analysis.bySector[stock.sector]) {
      analysis.bySector[stock.sector] = {
        losses: [],
        stockCount: 0,
        avgLoss: 0,
        maxLoss: 0,
        minLoss: 0,
      };
    }
    analysis.bySector[stock.sector].losses.push(realizedLoss);
    analysis.bySector[stock.sector].stockCount++;
  }

  // Calculate sector aggregates
  for (const sector in analysis.bySector) {
    const losses = analysis.bySector[sector].losses;
    analysis.bySector[sector].avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    analysis.bySector[sector].maxLoss = Math.max(...losses);
    analysis.bySector[sector].minLoss = Math.min(...losses);
    delete analysis.bySector[sector].losses; // Don't store all individual values
  }

  // Overall metrics
  const allLosses = analysis.byStock.map(s => s.realizedLoss);
  analysis.overallMetrics = {
    avgLoss: allLosses.reduce((a, b) => a + b, 0) / allLosses.length,
    medianLoss: allLosses.sort((a, b) => a - b)[Math.floor(allLosses.length / 2)],
    maxLoss: Math.max(...allLosses),
    minLoss: Math.min(...allLosses),
    stocksAnalyzed: analysis.byStock.length,
  };

  return analysis;
}

/**
 * Calibrate stress test multipliers based on historical data
 * @param {object} historicalAnalysis - Result from analyzeHistoricalShock
 * @param {object} currentScenario - Current scenario config with hardcoded multipliers
 * @returns {object} Calibration results with adjusted multipliers
 */
function calibrateMultipliers(historicalAnalysis, currentScenario) {
  const calibration = {
    scenario: historicalAnalysis.shockName,
    analysisDate: new Date().toISOString(),
    currentMultipliers: {
      oilSensitive: 1.5, // Current hardcoded value
      rateSensitive: 1.4, // Current hardcoded value
    },
    proposedMultipliers: {},
    calibrationDetails: {},
  };

  // For oil shock analysis
  if (historicalAnalysis.shockName.includes('Oil')) {
    const energySector = historicalAnalysis.bySector['Energy'] || {};
    const materialsSector = historicalAnalysis.bySector['Materials'] || {};

    const avgEnergyLoss = energySector.avgLoss || 0.20;
    const avgMaterialsLoss = materialsSector.avgLoss || 0.15;

    // If model predicts 20% loss (base -20%) but adds 1.5x multiplier = -30%
    // And actual was 25%, we might need 1.25x to match
    const oilSectorAvgLoss = (avgEnergyLoss + avgMaterialsLoss) / 2;
    const baseMarketShock = 0.20; // From scenario definition
    const predictedOilSectorLoss = baseMarketShock * 1.5;

    if (oilSectorAvgLoss > 0) {
      // Scale multiplier to match actual
      const adjustedMultiplier = Math.max(1.0, oilSectorAvgLoss / baseMarketShock);
      calibration.proposedMultipliers.oilSensitive = Math.round(adjustedMultiplier * 100) / 100;
      calibration.calibrationDetails.oil = {
        actualOilSectorAvgLoss: Math.round(oilSectorAvgLoss * 100) + '%',
        baseMarketShock: Math.round(baseMarketShock * 100) + '%',
        predictedLoss: Math.round(predictedOilSectorLoss * 100) + '%',
        adjustmentFactor: Math.round(oilSectorAvgLoss / baseMarketShock * 100) / 100,
      };
    }
  }

  // For market crash analysis (rate-sensitive impact is less direct)
  if (historicalAnalysis.shockName.includes('COVID')) {
    const bankingSector = historicalAnalysis.bySector['Banking'] || {};
    const realEstateSector = historicalAnalysis.bySector['Real Estate'] || {};

    const avgBankingLoss = bankingSector.avgLoss || 0.28;
    const avgRealEstateLoss = realEstateSector.avgLoss || 0.25;

    const rateSectorAvgLoss = (avgBankingLoss + avgRealEstateLoss) / 2;
    const baseMarketShock = 0.10; // From rate hike scenario
    const predictedRateSectorLoss = baseMarketShock * 1.4;

    if (rateSectorAvgLoss > 0) {
      const adjustedMultiplier = Math.max(1.0, rateSectorAvgLoss / baseMarketShock);
      calibration.proposedMultipliers.rateSensitive = Math.round(adjustedMultiplier * 100) / 100;
      calibration.calibrationDetails.rates = {
        actualRateSectorAvgLoss: Math.round(rateSectorAvgLoss * 100) + '%',
        baseMarketShock: Math.round(baseMarketShock * 100) + '%',
        predictedLoss: Math.round(predictedRateSectorLoss * 100) + '%',
        adjustmentFactor: Math.round(rateSectorAvgLoss / baseMarketShock * 100) / 100,
      };
    }
  }

  return calibration;
}

/**
 * Validate stress test accuracy against historical realized losses
 * @param {Array} byStockAnalysis - Stock-level analysis from analyzeHistoricalShock
 * @returns {object} Validation metrics
 */
function validateStressTestAccuracy(byStockAnalysis) {
  const validationResults = {
    totalStocks: byStockAnalysis.length,
    predictions: [],
    accuracyMetrics: {},
  };

  // For each stock, run current stress test and compare to realized loss
  for (const stock of byStockAnalysis) {
    const { symbol, sector, realizedLoss, volatility, beta } = stock;

    // Current price doesn't matter for percentage comparison
    const predictions = stressTest(100, volatility, beta, sector); // Use 100 as baseline price

    // Find the market crash prediction (for COVID) or oil crash (for oil shock)
    let relevantPrediction = null;
    if (realizedLoss > 0.15) {
      // Likely market crash
      relevantPrediction = predictions.find(p => p.scenario === 'market_crash');
    } else {
      // Might be sector-specific
      relevantPrediction = predictions.find(p => p.scenario === 'oil_price_crash');
    }

    if (!relevantPrediction) {
      relevantPrediction = predictions[0]; // Fallback
    }

    const predictedLoss = relevantPrediction.lossPct;
    const error = Math.abs(predictedLoss - realizedLoss) / Math.max(realizedLoss, 0.001);
    const accurate = error <= 0.20; // Within 20% error

    validationResults.predictions.push({
      symbol,
      sector,
      realizedLoss: Math.round(realizedLoss * 100) + '%',
      predictedLoss: Math.round(predictedLoss * 100) + '%',
      error: Math.round(error * 100) + '%',
      accurate,
    });
  }

  // Calculate accuracy metrics
  const accurateCount = validationResults.predictions.filter(p => p.accurate).length;
  const errors = validationResults.predictions.map(p => {
    const errorStr = p.error.replace('%', '');
    return parseFloat(errorStr) / 100;
  });

  validationResults.accuracyMetrics = {
    accuracyRate: (accurateCount / validationResults.totalStocks * 100).toFixed(2) + '%',
    avgError: (errors.reduce((a, b) => a + b, 0) / errors.length * 100).toFixed(2) + '%',
    medianError: (errors.sort((a, b) => a - b)[Math.floor(errors.length / 2)] * 100).toFixed(2) + '%',
    maxError: (Math.max(...errors) * 100).toFixed(2) + '%',
  };

  return validationResults;
}

/**
 * Run full calibration pipeline for a historical shock period
 * @param {string} shockKey - Key from HISTORICAL_SHOCKS (e.g., 'covid_2020')
 * @returns {object} Complete calibration report
 */
function runFullCalibration(shockKey) {
  const shockPeriod = HISTORICAL_SHOCKS[shockKey];
  if (!shockPeriod) {
    throw new Error(`Unknown shock period: ${shockKey}`);
  }

  // Step 1: Analyze historical shock
  console.log(`\n📊 Analyzing ${shockPeriod.name}...`);
  const historicalAnalysis = analyzeHistoricalShock(shockPeriod);

  // Step 2: Calibrate multipliers
  console.log(`\n⚖️  Calibrating multipliers...`);
  const calibration = calibrateMultipliers(historicalAnalysis, shockPeriod.expectedScenario);

  // Step 3: Validate accuracy
  console.log(`\n✅ Validating stress test accuracy...`);
  const validation = validateStressTestAccuracy(historicalAnalysis.byStock);

  // Step 4: Generate report
  const report = {
    shockPeriod: shockPeriod.name,
    timestamp: new Date().toISOString(),
    historicalAnalysis: {
      stocksAnalyzed: historicalAnalysis.overallMetrics.stocksAnalyzed,
      avgRealizedLoss: (historicalAnalysis.overallMetrics.avgLoss * 100).toFixed(2) + '%',
      bySector: historicalAnalysis.bySector,
    },
    calibration,
    validation,
    recommendations: generateRecommendations(calibration, validation),
  };

  return report;
}

/**
 * Generate calibration recommendations
 * @param {object} calibration - Calibration results
 * @param {object} validation - Validation results
 * @returns {Array} Array of recommendation strings
 */
function generateRecommendations(calibration, validation) {
  const recommendations = [];

  const accuracyRate = parseFloat(validation.accuracyMetrics.accuracyRate);
  if (accuracyRate < 60) {
    recommendations.push('⚠️  Accuracy below 60% - consider expanding historical data window');
    recommendations.push('⚠️  May need to include more historical shocks for robust calibration');
  }

  if (calibration.proposedMultipliers.oilSensitive) {
    const diff = calibration.proposedMultipliers.oilSensitive - calibration.currentMultipliers.oilSensitive;
    if (Math.abs(diff) > 0.1) {
      recommendations.push(
        `💡 Update oil-sensitive multiplier from ${calibration.currentMultipliers.oilSensitive} to ${calibration.proposedMultipliers.oilSensitive}`
      );
    }
  }

  if (calibration.proposedMultipliers.rateSensitive) {
    const diff = calibration.proposedMultipliers.rateSensitive - calibration.currentMultipliers.rateSensitive;
    if (Math.abs(diff) > 0.1) {
      recommendations.push(
        `💡 Update rate-sensitive multiplier from ${calibration.currentMultipliers.rateSensitive} to ${calibration.proposedMultipliers.rateSensitive}`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Current multipliers are well-calibrated to historical events');
  }

  return recommendations;
}

/**
 * Generate scenario-specific multiplier matrix from historical shocks
 * Maps each scenario + sector combination to a calibrated multiplier
 * @param {Array} shockKeys - Array of shock period keys to analyze (e.g., ['covid_2020', 'oil_shock_2015_2016'])
 * @returns {object} Multiplier matrix {scenario: {sector: multiplier}}
 */
function generateScenarioMultiplierMatrix(shockKeys = Object.keys(HISTORICAL_SHOCKS)) {
  const matrix = {};
  const scenarios = [
    'market_crash',
    'sector_downturn',
    'interest_rate_hike',
    'oil_price_crash',
    'mild_correction',
    'geopolitical_crisis',
  ];

  for (const scenario of scenarios) {
    matrix[scenario] = {};
  }

  // Analyze each shock and assign scenarios + sectors
  for (const shockKey of shockKeys) {
    const shockPeriod = HISTORICAL_SHOCKS[shockKey];
    if (!shockPeriod) continue;

    const historicalAnalysis = analyzeHistoricalShock(shockPeriod);
    const stocks = getAllStocksWithSectors();

    // Map shock to primary scenario
    const mappedScenario = mapShockToScenario(shockPeriod.expectedScenario);

    // Calculate sector-specific multipliers for this shock
    for (const sector in historicalAnalysis.bySector) {
      const sectorData = historicalAnalysis.bySector[sector];
      const avgLoss = sectorData.avgLoss;

      if (avgLoss > 0) {
        // Determine base market shock from scenario definition
        let baseMarketShock = 0.25; // Default to market crash
        if (mappedScenario === 'oil_price_crash') baseMarketShock = 0.20;
        else if (mappedScenario === 'interest_rate_hike') baseMarketShock = 0.10;
        else if (mappedScenario === 'mild_correction') baseMarketShock = 0.075;
        else if (mappedScenario === 'sector_downturn') baseMarketShock = 0.15;
        else if (mappedScenario === 'geopolitical_crisis') baseMarketShock = 0.15;

        // Calculate multiplier: actual loss / base market shock
        const multiplier = Math.min(3.0, Math.max(1.0, avgLoss / baseMarketShock));
        matrix[mappedScenario][sector] = Math.round(multiplier * 100) / 100;
      }
    }
  }

  // Fill in missing sectors with defaults per scenario
  const sectorDefaults = {
    market_crash: 1.2,
    sector_downturn: 1.0,
    interest_rate_hike: 1.1,
    oil_price_crash: 1.5,
    mild_correction: 1.0,
    geopolitical_crisis: 1.1,
  };

  const allSectors = ['Banking', 'Energy', 'Materials', 'Capital Goods', 'Real Estate',
                      'Diversified Financials', 'Insurance', 'Utilities', 'Pharmaceuticals',
                      'Telecommunications', 'Retail', 'Agriculture', 'Transportation'];

  for (const scenario of scenarios) {
    for (const sector of allSectors) {
      if (!matrix[scenario][sector]) {
        matrix[scenario][sector] = sectorDefaults[scenario] || 1.0;
      }
    }
  }

  return matrix;
}

/**
 * Map historical shock to primary stress scenario
 * @param {string} expectedScenario - Scenario from shock period definition
 * @returns {string} Primary scenario name
 */
function mapShockToScenario(expectedScenario) {
  const mapping = {
    'market_crash': 'market_crash',
    'oil_price_crash': 'oil_price_crash',
    'rate_hike': 'interest_rate_hike',
    'sector_downturn': 'sector_downturn',
    'geopolitical': 'geopolitical_crisis',
  };
  return mapping[expectedScenario] || 'market_crash';
}

/**
 * Get scenario-specific multiplier for a stock
 * @param {string} scenario - Scenario name (e.g., 'oil_price_crash')
 * @param {string} sector - Stock sector
 * @param {object} matrix - Multiplier matrix from generateScenarioMultiplierMatrix
 * @returns {number} Multiplier (e.g., 1.5, 2.1, etc.)
 */
function getScenarioMultiplier(scenario, sector, matrix) {
  if (!matrix || !matrix[scenario] || !matrix[scenario][sector]) {
    return 1.0; // Default if not found
  }
  return matrix[scenario][sector];
}

/**
 * Generate comprehensive calibration report with scenario-specific evidence
 * @param {Array} shockKeys - Shock periods to analyze
 * @returns {object} Complete calibration report with scenario matrix
 */
function generateScenarioCalibrationReport(shockKeys = Object.keys(HISTORICAL_SHOCKS)) {
  const report = {
    generatedAt: new Date().toISOString(),
    scenarios: {},
    scenarioMultiplierMatrix: {},
    validationSummary: {},
  };

  const matrix = generateScenarioMultiplierMatrix(shockKeys);
  report.scenarioMultiplierMatrix = matrix;

  // Analyze each historical shock for detailed evidence
  for (const shockKey of shockKeys) {
    const shockPeriod = HISTORICAL_SHOCKS[shockKey];
    if (!shockPeriod) continue;

    const historicalAnalysis = analyzeHistoricalShock(shockPeriod);
    const validation = validateStressTestAccuracy(historicalAnalysis.byStock);
    const scenario = mapShockToScenario(shockPeriod.expectedScenario);

    if (!report.scenarios[scenario]) {
      report.scenarios[scenario] = [];
    }

    report.scenarios[scenario].push({
      shockEvent: shockPeriod.name,
      shockPeriod: { start: shockPeriod.shockWindowStart, end: shockPeriod.shockWindowEnd },
      historicalContext: shockPeriod.historicalContext,
      sectorImpact: historicalAnalysis.bySector,
      overallMetrics: historicalAnalysis.overallMetrics,
      accuracy: validation.accuracyMetrics,
    });
  }

  // Generate validation summary
  for (const scenario in report.scenarios) {
    const events = report.scenarios[scenario];
    const accuracies = events.map(e => parseFloat(e.accuracy.accuracyRate));
    report.validationSummary[scenario] = {
      eventsAnalyzed: events.length,
      avgAccuracy: (accuracies.reduce((a, b) => a + b) / accuracies.length).toFixed(2) + '%',
      accuracyTarget: '±20% (or 80%+ hit rate)',
      calibrated: accuracies.every(a => a >= 60),
    };
  }

  return report;
}

// ─── Drift Monitoring (Phase 5) ────────────────────────────────────────────
// Track accuracy decay and trigger auto-recalibration when needed

/**
 * Drift history storage - keeps rolling 30-day accuracy for each scenario
 * Structure: {scenario: {dates: [...], accuracies: [...]}}
 */
let driftHistory = {
  market_crash: { dates: [], accuracies: [] },
  sector_downturn: { dates: [], accuracies: [] },
  interest_rate_hike: { dates: [], accuracies: [] },
  oil_price_crash: { dates: [], accuracies: [] },
  mild_correction: { dates: [], accuracies: [] },
  geopolitical_crisis: { dates: [], accuracies: [] },
};

/**
 * Drift thresholds
 */
const DRIFT_THRESHOLDS = {
  warning: 75,      // Yellow alert: accuracy below 75%
  critical: 60,     // Red alert: accuracy below 60% (requires recalibration)
};

/**
 * Record a daily accuracy measurement for a scenario
 * @param {string} scenario - Scenario name
 * @param {number} accuracy - Measured accuracy (0-100%)
 * @param {string} date - ISO date string (default: today)
 */
function recordDailyAccuracy(scenario, accuracy, date = new Date().toISOString().split('T')[0]) {
  if (!driftHistory[scenario]) {
    driftHistory[scenario] = { dates: [], accuracies: [] };
  }

  const history = driftHistory[scenario];
  history.dates.push(date);
  history.accuracies.push(accuracy);

  // Keep only rolling 30-day window
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  while (history.dates.length > 0 && history.dates[0] < thirtyDaysAgoStr) {
    history.dates.shift();
    history.accuracies.shift();
  }
}

/**
 * Get current accuracy trend for a scenario
 * @param {string} scenario - Scenario name
 * @returns {object} {currentAccuracy, trend30day, driftStatus, requiresRecalibration}
 */
function getAccuracyTrend(scenario) {
  const history = driftHistory[scenario] || { dates: [], accuracies: [] };

  if (history.accuracies.length === 0) {
    return {
      currentAccuracy: null,
      trend30day: null,
      driftStatus: 'no_data',
      requiresRecalibration: false,
    };
  }

  const currentAccuracy = history.accuracies[history.accuracies.length - 1];
  const avgAccuracy30d = history.accuracies.reduce((a, b) => a + b, 0) / history.accuracies.length;

  let driftStatus = 'healthy';
  let requiresRecalibration = false;

  if (currentAccuracy < DRIFT_THRESHOLDS.critical) {
    driftStatus = 'critical';
    requiresRecalibration = true;
  } else if (currentAccuracy < DRIFT_THRESHOLDS.warning) {
    driftStatus = 'warning';
  }

  return {
    currentAccuracy: Math.round(currentAccuracy * 100) / 100,
    trend30day: Math.round(avgAccuracy30d * 100) / 100,
    driftStatus,
    requiresRecalibration,
    dateCurrent: history.dates[history.dates.length - 1],
  };
}

/**
 * Get drift status for all scenarios
 * @returns {object} Drift status summary with alerts
 */
function getDriftStatus() {
  const status = {
    timestamp: new Date().toISOString(),
    scenarioStatus: {},
    requiresRecalibration: [],
    warnings: [],
  };

  for (const scenario of Object.keys(driftHistory)) {
    const trend = getAccuracyTrend(scenario);
    status.scenarioStatus[scenario] = trend;

    if (trend.requiresRecalibration) {
      status.requiresRecalibration.push({
        scenario,
        currentAccuracy: trend.currentAccuracy,
        reason: 'Accuracy below critical threshold (60%)',
      });
    } else if (trend.driftStatus === 'warning') {
      status.warnings.push({
        scenario,
        currentAccuracy: trend.currentAccuracy,
        message: 'Accuracy declining - monitor closely',
      });
    }
  }

  return status;
}

/**
 * Initialize drift monitoring from stored calibration
 * Called after loading scenario multipliers to seed baseline accuracy
 * @param {object} calibrationReport - Report from generateScenarioCalibrationReport
 */
function initializeDriftMonitoring(calibrationReport) {
  if (!calibrationReport.validationSummary) return;

  const today = new Date().toISOString().split('T')[0];

  for (const scenario in calibrationReport.validationSummary) {
    const summary = calibrationReport.validationSummary[scenario];
    const avgAccuracy = parseFloat(summary.avgAccuracy);

    // Seed with calibration accuracy as baseline
    recordDailyAccuracy(scenario, avgAccuracy, today);
  }
}

module.exports = {
  HISTORICAL_SHOCKS,
  analyzeHistoricalShock,
  calibrateMultipliers,
  validateStressTestAccuracy,
  runFullCalibration,
  getHistoricalPricesForPeriod,
  getStockMetrics,
  getAllStocksWithSectors,
  generateScenarioMultiplierMatrix,
  generateScenarioCalibrationReport,
  getScenarioMultiplier,
  mapShockToScenario,
  // Phase 5 Drift Monitoring
  recordDailyAccuracy,
  getAccuracyTrend,
  getDriftStatus,
  initializeDriftMonitoring,
  DRIFT_THRESHOLDS,
};
