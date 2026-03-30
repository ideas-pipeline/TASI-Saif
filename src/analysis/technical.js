const { getDb, initSchema } = require('../db/schema');

/**
 * Compute SMA (Simple Moving Average) for a price array.
 */
function sma(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

/**
 * Compute EMA (Exponential Moving Average) for a price array.
 */
function ema(prices, period) {
  const result = [];
  const k = 2 / (period + 1);

  // Start with SMA for first value
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sum += prices[i];
      result.push(null);
    } else if (i === period - 1) {
      sum += prices[i];
      result.push(sum / period);
    } else {
      const prev = result[i - 1];
      result.push(prices[i] * k + prev * (1 - k));
    }
  }
  return result;
}

/**
 * Compute RSI (Relative Strength Index).
 */
function rsi(prices, period = 14) {
  const result = [];
  const gains = [];
  const losses = [];

  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
      result.push(null);
      continue;
    }

    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);

    if (i < period) {
      result.push(null);
      continue;
    }

    if (i === period) {
      const avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      }
    } else {
      // Use smoothed averages
      const prevRsi = result[i - 1];
      if (prevRsi === null) { result.push(null); continue; }

      // Reconstruct previous avg gain/loss from RSI
      // Instead, track them separately
      const prevAvgGain = i === period + 1
        ? gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
        : (result._avgGain || 0);
      const prevAvgLoss = i === period + 1
        ? losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
        : (result._avgLoss || 0);

      const avgGain = (prevAvgGain * (period - 1) + gains[i]) / period;
      const avgLoss = (prevAvgLoss * (period - 1) + losses[i]) / period;
      result._avgGain = avgGain;
      result._avgLoss = avgLoss;

      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      }
    }
  }
  return result;
}

/**
 * Better RSI implementation using Wilder's smoothing.
 */
function computeRsi(closePrices, period = 14) {
  const result = new Array(closePrices.length).fill(null);
  if (closePrices.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = closePrices[i] - closePrices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closePrices.length; i++) {
    const change = closePrices[i] - closePrices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

/**
 * Compute MACD (12, 26, 9).
 */
function macd(prices) {
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);

  const macdLine = prices.map((_, i) => {
    if (ema12[i] === null || ema26[i] === null) return null;
    return ema12[i] - ema26[i];
  });

  // Signal line is 9-period EMA of MACD line
  const validMacd = macdLine.filter(v => v !== null);
  const signalValues = ema(validMacd, 9);

  // Map signal back to full array
  const signal = new Array(macdLine.length).fill(null);
  let j = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      signal[i] = signalValues[j] || null;
      j++;
    }
  }

  const histogram = prices.map((_, i) => {
    if (macdLine[i] === null || signal[i] === null) return null;
    return macdLine[i] - signal[i];
  });

  return { macdLine, signal, histogram };
}

/**
 * Compute Bollinger Bands (20-period, 2 std devs).
 */
function bollingerBands(prices, period = 20, stdDevMultiplier = 2) {
  const middle = sma(prices, period);
  const upper = [];
  const lower = [];

  for (let i = 0; i < prices.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      upper.push(mean + stdDevMultiplier * stdDev);
      lower.push(mean - stdDevMultiplier * stdDev);
    }
  }

  return { upper, middle, lower };
}

/**
 * Compute all technical indicators for a stock and store in DB.
 */
function computeAndStoreIndicators(symbol) {
  const db = getDb();
  initSchema(db);

  const rows = db.prepare(
    'SELECT date, close, volume FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
  ).all(symbol);

  if (rows.length < 200) {
    console.warn(`${symbol}: Only ${rows.length} data points, need 200+ for full indicators`);
  }
  if (rows.length < 26) {
    console.warn(`${symbol}: Not enough data for indicators (need at least 26)`);
    db.close();
    return 0;
  }

  const closes = rows.map(r => r.close);
  const volumes = rows.map(r => r.volume);
  const dates = rows.map(r => r.date);

  // Compute all indicators
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsiValues = computeRsi(closes, 14);
  const macdResult = macd(closes);
  const bb = bollingerBands(closes, 20, 2);
  const avgVol20 = sma(volumes, 20);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO technical_indicators
    (symbol, date, sma_20, sma_50, sma_200, ema_20, ema_50, ema_200,
     rsi_14, macd_line, macd_signal, macd_hist,
     bb_upper, bb_middle, bb_lower, avg_volume_20, volume_ratio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      // Only store rows where at least some indicators are computed
      if (sma20[i] === null && rsiValues[i] === null) continue;

      const volRatio = avgVol20[i] && avgVol20[i] > 0
        ? volumes[i] / avgVol20[i]
        : null;

      insert.run(
        symbol, dates[i],
        sma20[i], sma50[i], sma200[i],
        ema20[i], ema50[i], ema200[i],
        rsiValues[i],
        macdResult.macdLine[i], macdResult.signal[i], macdResult.histogram[i],
        bb.upper[i], bb.middle[i], bb.lower[i],
        avgVol20[i], volRatio
      );
      count++;
    }
    return count;
  });

  const count = insertMany();
  db.close();
  return count;
}

/**
 * Compute indicators for all stocks.
 */
function computeAllIndicators() {
  const db = getDb();
  initSchema(db);
  const symbols = db.prepare('SELECT symbol, name FROM stocks').all();
  db.close();

  let total = 0;
  for (const { symbol, name } of symbols) {
    const count = computeAndStoreIndicators(symbol);
    console.log(`  ${symbol} (${name}): ${count} indicator rows`);
    total += count;
  }
  return total;
}

module.exports = {
  sma, ema, computeRsi, macd, bollingerBands,
  computeAndStoreIndicators, computeAllIndicators
};
