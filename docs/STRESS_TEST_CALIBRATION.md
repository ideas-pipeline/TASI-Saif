# Stress Test Calibration Framework

## Overview

This document describes the stress test calibration framework for the TASI risk analysis platform. The framework validates and calibrates stress test scenario multipliers against actual historical market shocks, ensuring that model predictions align with empirical market behavior.

**Status**: Phase 3 Implementation (SUL-28)
**Last Updated**: 2026-03-29

## Problem Statement

The initial stress test implementation in `src/analysis/risk-engine.js` used hardcoded multipliers:
- **Oil-sensitive sectors** (Energy, Materials, Capital Goods): `1.5x` multiplier for oil price shocks
- **Rate-sensitive sectors** (Banking, Real Estate, Insurance): `1.4x` multiplier for interest rate shocks

These multipliers were estimates based on financial theory but lacked empirical validation against actual TASI historical events. This could lead to:
1. **Overprediction**: Model predicts larger losses than actually realized
2. **Underprediction**: Model misses severity of sector-specific impacts
3. **Lack of confidence**: Portfolio managers cannot trust stress test outputs without historical evidence

## Solution: Historical Calibration

We calibrate multipliers by comparing model predictions against actual realized losses during two major historical shock periods:

### 1. COVID-19 Market Crash (2020)

**Event Details:**
- **Peak Decline Date**: March 10, 2020
- **Total TASI Decline**: ~30% from peak to trough
- **Shock Window**: March 1 – April 30, 2020
- **Analysis Window**: January 1 – June 30, 2020

**Affected Sectors:**
- Banking: ~28% average loss
- Real Estate: ~25% average loss
- Diversified Financials: ~26% average loss
- Energy: ~20% average loss (less direct impact than oil shock)

**Calibration Target:**
- Validates rate-sensitive sector multiplier (1.4x) by comparing predicted losses in "interest_rate_hike" scenario against actual COVID losses
- COVID market crash behavior mimics rate-sensitive sector stress in many respects

### 2. Oil Price Collapse (2015-2016)

**Event Details:**
- **Trough Date**: February 15, 2016
- **Oil Price Decline**: 76% (from $108/bbl to $26/bbl)
- **TASI Decline**: ~22% from July 2015 peak
- **Shock Window**: June 1, 2015 – March 31, 2016
- **Analysis Window**: January 1, 2015 – June 30, 2016

**Affected Sectors:**
- Energy: ~35% average loss
- Materials: ~25% average loss
- Capital Goods: ~18% average loss (supply chain effects)

**Calibration Target:**
- Validates oil-sensitive sector multiplier (1.5x) by comparing predicted losses in "oil_price_crash" scenario against actual Energy/Materials sector losses

## Calibration Methodology

### Step 1: Historical Shock Analysis

For each shock period:

```
1. Get all stocks with their sector classifications
2. For each stock, fetch price data from shock window
3. Calculate realized loss: (first_price - last_price) / first_price
4. Pre-shock metrics:
   - Volatility: from 252-day lookback before shock
   - Beta: estimated from volatility correlation patterns
5. Aggregate by sector:
   - Average loss per sector
   - Max/min loss range
   - Stock count per sector
```

**Key Calculation:**
```javascript
realizedLoss = (priceAtShockStart - priceAtShockEnd) / priceAtShockStart
```

### Step 2: Model Prediction Generation

For each stock, run current stress test scenario:

```javascript
predictions = stressTest(currentPrice, volatility, beta, sector)
// Returns loss % for each of 6 scenarios
```

Focus on scenario most relevant to historical shock:
- COVID 2020: Use "market_crash" scenario predictions
- Oil 2015-2016: Use "oil_price_crash" scenario predictions

### Step 3: Multiplier Calibration

**Algorithm:**

```
Base Market Shock (from scenario): e.g., 20% for oil scenario

Current Model Prediction for Oil-Sensitive Sector:
  = baseMarketShock × currentMultiplier
  = 0.20 × 1.5
  = 0.30 (30% predicted loss)

Actual Realized Loss (from historical data):
  = 0.25 (25% average Energy sector loss)

Calibration Factor:
  = Actual Realized Loss / Base Market Shock
  = 0.25 / 0.20
  = 1.25

Proposed Adjusted Multiplier:
  = max(1.0, calibrationFactor)
  = 1.25
```

### Step 4: Validation Framework

Measure model accuracy on all stocks during shock period:

```
For each stock:
  1. Get realized loss from historical data
  2. Run stress test prediction for same period
  3. Calculate error: |predicted - realized| / max(realized, 0.001)
  4. Flag as "accurate" if error ≤ 20%

Final Metrics:
  - Accuracy Rate: % of stocks predicted within 20% error
  - Avg Error: Mean absolute % error across all stocks
  - Median Error: Middle-point error (robust to outliers)
  - Max Error: Worst case prediction error

Target: Accuracy Rate ≥ 80% (at least 4 in 5 stocks within 20%)
```

## Implementation

### File Structure

```
src/analysis/
├── stress-test-calibration.js    # Main calibration module
└── risk-engine.js                # Existing stress test implementation
```

### Key Functions

**`analyzeHistoricalShock(shockPeriod)`**
- Analyzes actual losses during a historical shock
- Returns: {byStock, bySector, overallMetrics}

**`calibrateMultipliers(historicalAnalysis, scenario)`**
- Compares predicted vs actual and generates adjusted multipliers
- Returns: {currentMultipliers, proposedMultipliers, calibrationDetails}

**`validateStressTestAccuracy(byStockAnalysis)`**
- Measures model prediction accuracy
- Returns: {predictions[], accuracyMetrics}

**`runFullCalibration(shockKey)`**
- Orchestrates full pipeline: analyze → calibrate → validate
- Returns: complete calibration report with recommendations

### CLI Commands

```bash
# Calibrate against 2020 COVID crash
node src/cli.js stress-calibrate covid

# Calibrate against 2015-2016 oil shock
node src/cli.js stress-calibrate oil

# Calibrate against all historical shocks
node src/cli.js stress-calibrate all
```

### Example Output

```
📊 Calibrating Stress Tests Against 2015-2016 Oil Shock

================================================================================
CALIBRATION REPORT: OIL PRICE COLLAPSE (2015-2016)
================================================================================

📈 Historical Analysis:
  Stocks analyzed: 152
  Average realized loss: 24.31%

By Sector:
  Energy                    Avg: 35.42%  Max: 52.18%
  Materials                 Avg: 25.33%  Max: 41.75%
  Capital Goods             Avg: 18.22%  Max: 33.91%
  ...

⚖️  Calibration Results:
  Proposed multipliers:
    Oil-sensitive: 1.5 → 1.32

✅ Model Validation:
  Accuracy (within 20%): 82.24%
  Avg error: 12.45%
  Median error: 9.87%
  Max error: 38.91%

💡 Recommendations:
  ✅ Current multipliers are well-calibrated to historical events
```

## Results and Interpretation

### Accuracy Targets

| Target | Threshold | Interpretation |
|--------|-----------|-----------------|
| Accuracy Rate | ≥ 80% | At least 4 in 5 stocks predicted within 20% |
| Avg Error | < 15% | On average, predictions within 15% of actual |
| Median Error | < 12% | Typical error is less than 12% |
| Max Error | < 40% | Even worst cases not off by more than 40% |

### Scenario 1: Calibration Successful

**Condition:** All metrics meet or exceed targets

**Action:**
- Keep current multipliers if error is small (< 5%)
- Update multipliers if adjustment is significant (> 10%) but still validates

**Example:**
```
Current: 1.5x oil multiplier
Proposed: 1.48x (1% adjustment)
→ Keep current (already well-calibrated)

Current: 1.5x oil multiplier
Proposed: 1.32x (12% reduction)
→ Update to 1.32x (model was overpredicting)
```

### Scenario 2: Calibration Suggests Changes

**Condition:** Adjusted multiplier differs significantly from current

**Analysis:**
- Oil shock example: Actual Energy sector loss was 25% but model with 1.5x multiplier predicts 30%
- → Model is overpredicting by ~5 percentage points
- → Reduce multiplier from 1.5x to 1.32x to match empirical behavior

**Confidence Factors:**
- **Large sample size** (150+ stocks): High confidence in aggregate sector metrics
- **Extended time window** (6+ months): Captures sustained impacts, not just initial shock
- **Clear event boundary**: Shock date is unambiguous (market crash, oil collapse)

## Limitations and Caveats

1. **Historical Data Dependency**: Calibration assumes past shocks are representative of future shocks
   - Mitigated by using multiple distinct historical events (pandemic vs commodity shock)

2. **Sector Classification**: Assumes current sector classifications were stable during historical period
   - Actual: Some companies may have shifted sectors or IPO'd post-2016
   - Impact: Relatively minor given 150+ sample size

3. **Volatility Changes**: Uses pre-shock volatility to estimate beta, but volatility spikes during shocks
   - Trade-off: Using shock-period volatility inflates estimates; using pre-shock maintains consistency

4. **Multiplier Stability**: Assumes 1.4x and 1.5x multipliers are appropriate across all scenarios
   - Future work: Develop scenario-specific multipliers (rate hike ≠ market crash ≠ oil crash)

## Next Steps (Phase 4+)

1. **Extended Historical Coverage**
   - Add 2011 European Debt Crisis analysis
   - Add 2008 Financial Crisis (if data available)

2. **Scenario-Specific Calibration**
   - Separate multipliers for each of 6 scenarios
   - Rather than lumping oil-sensitive and rate-sensitive

3. **Regime-Based Multipliers**
   - Adjust multipliers based on current market regime (normal, stress, crisis)
   - Use correlation regimes from correlation-matrix.js

4. **Real-Time Model Updates**
   - Monitor prediction errors on ongoing market data
   - Auto-trigger recalibration if accuracy drifts below 75%

5. **Stress Scenario Expansion**
   - Add scenarios: China trade war, Saudi fiscal shock, tech bubble burst
   - Calibrate new scenarios against relevant historical proxies

## References

### Internal Systems
- **Risk Engine**: `src/analysis/risk-engine.js` (stress test implementation)
- **Correlation Matrix**: `src/analysis/correlation-matrix.js` (regime detection)
- **VaR Backtesting**: `src/analysis/var-backtest.js` (validation framework)
- **Database Schema**: `src/db/schema.js` (daily_prices table with historical OHLCV)

### Historical Events
- **COVID-19 (2020)**
  - Peak decline: March 10, 2020
  - TASI range: 3,500 → 5,500 (normalized indices vary)
  - Source: Yahoo Finance historical data via ingest pipeline

- **Oil Shock (2015-2016)**
  - WTI Crude: $108/bbl (June 2014) → $26/bbl (Feb 2016)
  - TASI range: 8,100 → 6,300 (normalized indices vary)
  - Source: Yahoo Finance historical data via ingest pipeline

### Regulatory Context
- **CMA Disclaimer**: Saudi Capital Market Authority disclosure required on all risk reports
- **Risk Disclosure**: Stress tests are illustrative; actual returns may differ significantly
