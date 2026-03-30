const { getDb, initSchema } = require('../db/schema');
const { sma, ema, computeRsi, macd, bollingerBands } = require('./technical');

// ── Utility helpers ──────────────────────────────────────────────────

function bodySize(candle) {
  return Math.abs(candle.close - candle.open);
}

function totalRange(candle) {
  return candle.high - candle.low;
}

function upperShadow(candle) {
  return candle.high - Math.max(candle.open, candle.close);
}

function lowerShadow(candle) {
  return Math.min(candle.open, candle.close) - candle.low;
}

function isBullish(candle) {
  return candle.close > candle.open;
}

function isBearish(candle) {
  return candle.close < candle.open;
}

function midpoint(candle) {
  return (candle.open + candle.close) / 2;
}

// ── Single-candle patterns ───────────────────────────────────────────

function isDoji(c) {
  const range = totalRange(c);
  if (range === 0) return false;
  return bodySize(c) / range < 0.1;
}

function isDragonflyDoji(c) {
  const range = totalRange(c);
  if (range === 0) return false;
  return bodySize(c) / range < 0.1 && upperShadow(c) / range < 0.1 && lowerShadow(c) / range > 0.6;
}

function isGravestoneDoji(c) {
  const range = totalRange(c);
  if (range === 0) return false;
  return bodySize(c) / range < 0.1 && lowerShadow(c) / range < 0.1 && upperShadow(c) / range > 0.6;
}

function isHammer(c) {
  const body = bodySize(c);
  const range = totalRange(c);
  if (range === 0 || body === 0) return false;
  return lowerShadow(c) >= body * 2 && upperShadow(c) / range < 0.15;
}

function isHangingMan(c) {
  // Same shape as hammer but context matters (appears in uptrend)
  return isHammer(c);
}

function isShootingStar(c) {
  const body = bodySize(c);
  const range = totalRange(c);
  if (range === 0 || body === 0) return false;
  return upperShadow(c) >= body * 2 && lowerShadow(c) / range < 0.15;
}

function isMarubozu(c) {
  const range = totalRange(c);
  if (range === 0) return false;
  return upperShadow(c) / range < 0.05 && lowerShadow(c) / range < 0.05 && bodySize(c) / range > 0.9;
}

// ── Two-candle patterns ──────────────────────────────────────────────

function isBullishEngulfing(prev, curr) {
  return isBearish(prev) && isBullish(curr) &&
    curr.open <= prev.close && curr.close >= prev.open &&
    bodySize(curr) > bodySize(prev);
}

function isBearishEngulfing(prev, curr) {
  return isBullish(prev) && isBearish(curr) &&
    curr.open >= prev.close && curr.close <= prev.open &&
    bodySize(curr) > bodySize(prev);
}

function isBullishHarami(prev, curr) {
  return isBearish(prev) && isBullish(curr) &&
    curr.open >= prev.close && curr.close <= prev.open &&
    bodySize(curr) < bodySize(prev);
}

function isBearishHarami(prev, curr) {
  return isBullish(prev) && isBearish(curr) &&
    curr.open <= prev.close && curr.close >= prev.open &&
    bodySize(curr) < bodySize(prev);
}

function isPiercingLine(prev, curr) {
  return isBearish(prev) && isBullish(curr) &&
    curr.open < prev.low &&
    curr.close > midpoint(prev) &&
    curr.close < prev.open;
}

function isDarkCloudCover(prev, curr) {
  return isBullish(prev) && isBearish(curr) &&
    curr.open > prev.high &&
    curr.close < midpoint(prev) &&
    curr.close > prev.close;
}

// ── Three-candle patterns ────────────────────────────────────────────

function isMorningStar(c1, c2, c3) {
  return isBearish(c1) && isBullish(c3) &&
    bodySize(c2) < bodySize(c1) * 0.3 &&
    c2.close < c1.close &&
    c3.close > midpoint(c1);
}

function isEveningStar(c1, c2, c3) {
  return isBullish(c1) && isBearish(c3) &&
    bodySize(c2) < bodySize(c1) * 0.3 &&
    c2.close > c1.close &&
    c3.close < midpoint(c1);
}

function isThreeWhiteSoldiers(c1, c2, c3) {
  return isBullish(c1) && isBullish(c2) && isBullish(c3) &&
    c2.open > c1.open && c2.close > c1.close &&
    c3.open > c2.open && c3.close > c2.close &&
    bodySize(c1) > totalRange(c1) * 0.5 &&
    bodySize(c2) > totalRange(c2) * 0.5 &&
    bodySize(c3) > totalRange(c3) * 0.5;
}

function isThreeBlackCrows(c1, c2, c3) {
  return isBearish(c1) && isBearish(c2) && isBearish(c3) &&
    c2.open < c1.open && c2.close < c1.close &&
    c3.open < c2.open && c3.close < c2.close &&
    bodySize(c1) > totalRange(c1) * 0.5 &&
    bodySize(c2) > totalRange(c2) * 0.5 &&
    bodySize(c3) > totalRange(c3) * 0.5;
}

// ── Trend detection (simple lookback) ────────────────────────────────

function detectTrend(candles, lookback = 5) {
  if (candles.length < lookback) return 'neutral';
  const recent = candles.slice(-lookback);
  const first = recent[0].close;
  const last = recent[recent.length - 1].close;
  const change = (last - first) / first;
  if (change > 0.02) return 'up';
  if (change < -0.02) return 'down';
  return 'neutral';
}

// ── Pattern scanner ──────────────────────────────────────────────────

function scanPatterns(candles) {
  const patterns = [];
  if (candles.length < 3) return patterns;

  for (let i = 2; i < candles.length; i++) {
    const c3 = candles[i];
    const c2 = candles[i - 1];
    const c1 = candles[i - 2];
    const prior = candles.slice(0, i);
    const trend = detectTrend(prior, Math.min(5, prior.length));

    // Three-candle patterns
    if (isMorningStar(c1, c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'morning_star', direction: 'bullish', strength: 3 });
    }
    if (isEveningStar(c1, c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'evening_star', direction: 'bearish', strength: 3 });
    }
    if (isThreeWhiteSoldiers(c1, c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'three_white_soldiers', direction: 'bullish', strength: 3 });
    }
    if (isThreeBlackCrows(c1, c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'three_black_crows', direction: 'bearish', strength: 3 });
    }

    // Two-candle patterns
    if (isBullishEngulfing(c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'bullish_engulfing', direction: 'bullish', strength: 2 });
    }
    if (isBearishEngulfing(c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'bearish_engulfing', direction: 'bearish', strength: 2 });
    }
    if (isBullishHarami(c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'bullish_harami', direction: 'bullish', strength: 1 });
    }
    if (isBearishHarami(c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'bearish_harami', direction: 'bearish', strength: 1 });
    }
    if (isPiercingLine(c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'piercing_line', direction: 'bullish', strength: 2 });
    }
    if (isDarkCloudCover(c2, c3)) {
      patterns.push({ date: c3.date, pattern: 'dark_cloud_cover', direction: 'bearish', strength: 2 });
    }

    // Single-candle patterns (on c3)
    if (isDoji(c3)) {
      patterns.push({ date: c3.date, pattern: 'doji', direction: 'neutral', strength: 1 });
    }
    if (isDragonflyDoji(c3)) {
      patterns.push({ date: c3.date, pattern: 'dragonfly_doji', direction: 'bullish', strength: 1 });
    }
    if (isGravestoneDoji(c3)) {
      patterns.push({ date: c3.date, pattern: 'gravestone_doji', direction: 'bearish', strength: 1 });
    }
    if (isHammer(c3) && trend === 'down') {
      patterns.push({ date: c3.date, pattern: 'hammer', direction: 'bullish', strength: 2 });
    }
    if (isHangingMan(c3) && trend === 'up') {
      patterns.push({ date: c3.date, pattern: 'hanging_man', direction: 'bearish', strength: 2 });
    }
    if (isShootingStar(c3) && trend === 'up') {
      patterns.push({ date: c3.date, pattern: 'shooting_star', direction: 'bearish', strength: 2 });
    }
    if (isMarubozu(c3)) {
      const dir = isBullish(c3) ? 'bullish' : 'bearish';
      patterns.push({ date: c3.date, pattern: 'marubozu', direction: dir, strength: 2 });
    }
  }

  return patterns;
}

// ── Support & Resistance ─────────────────────────────────────────────

function computeSupportResistance(candles, lookback = 60) {
  const recent = candles.slice(-lookback);
  if (recent.length < 10) return { support: [], resistance: [] };

  // Collect pivot points (local highs and lows over 5-bar windows)
  const pivotHighs = [];
  const pivotLows = [];

  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];
    if (c.high >= recent[i - 1].high && c.high >= recent[i - 2].high &&
        c.high >= recent[i + 1].high && c.high >= recent[i + 2].high) {
      pivotHighs.push({ date: c.date, price: c.high });
    }
    if (c.low <= recent[i - 1].low && c.low <= recent[i - 2].low &&
        c.low <= recent[i + 1].low && c.low <= recent[i + 2].low) {
      pivotLows.push({ date: c.date, price: c.low });
    }
  }

  // Cluster nearby levels (within 1.5% tolerance)
  function clusterLevels(pivots) {
    if (pivots.length === 0) return [];
    const sorted = [...pivots].sort((a, b) => a.price - b.price);
    const clusters = [];
    let cluster = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const avgPrice = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
      if ((sorted[i].price - avgPrice) / avgPrice < 0.015) {
        cluster.push(sorted[i]);
      } else {
        clusters.push(cluster);
        cluster = [sorted[i]];
      }
    }
    clusters.push(cluster);

    return clusters.map(cl => ({
      price: Math.round(cl.reduce((s, p) => s + p.price, 0) / cl.length * 100) / 100,
      touches: cl.length,
      lastDate: cl[cl.length - 1].date,
    })).filter(l => l.touches >= 2).sort((a, b) => b.touches - a.touches);
  }

  return {
    support: clusterLevels(pivotLows).slice(0, 5),
    resistance: clusterLevels(pivotHighs).slice(0, 5),
  };
}

// ── Fibonacci Retracements ───────────────────────────────────────────

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function computeFibonacciLevels(candles, lookback = 60) {
  const recent = candles.slice(-lookback);
  if (recent.length < 10) return null;

  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));
  const diff = high - low;

  if (diff === 0) return null;

  // Determine trend direction for retracement orientation
  const trend = detectTrend(recent, Math.min(20, recent.length));

  const levels = {};
  for (const fib of FIB_LEVELS) {
    if (trend === 'up') {
      // Retracement from high: levels are below high
      levels[fib] = Math.round((high - diff * fib) * 100) / 100;
    } else {
      // Retracement from low: levels are above low
      levels[fib] = Math.round((low + diff * fib) * 100) / 100;
    }
  }

  return { high, low, trend: trend === 'neutral' ? 'down' : trend, levels };
}

// ── Recommendation Generator ─────────────────────────────────────────

function computeIndicatorSignals(candles) {
  if (candles.length < 26) return { score: 0, signals: [] };

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume || 0);
  const signals = [];
  let score = 0;

  // RSI
  const rsiValues = computeRsi(closes, 14);
  const latestRsi = rsiValues[rsiValues.length - 1];
  if (latestRsi !== null) {
    if (latestRsi < 30) { score += 2; signals.push('RSI oversold'); }
    else if (latestRsi < 40) { score += 1; signals.push('RSI approaching oversold'); }
    else if (latestRsi > 70) { score -= 2; signals.push('RSI overbought'); }
    else if (latestRsi > 60) { score -= 1; signals.push('RSI approaching overbought'); }
  }

  // MACD crossover
  const macdResult = macd(closes);
  const ml = macdResult.macdLine;
  const sig = macdResult.signal;
  const hist = macdResult.histogram;
  const len = ml.length;
  if (len >= 2 && hist[len - 1] !== null && hist[len - 2] !== null) {
    if (hist[len - 1] > 0 && hist[len - 2] <= 0) {
      score += 2; signals.push('MACD bullish crossover');
    } else if (hist[len - 1] < 0 && hist[len - 2] >= 0) {
      score -= 2; signals.push('MACD bearish crossover');
    } else if (hist[len - 1] > 0 && ml[len - 1] > 0) {
      score += 1; signals.push('MACD bullish momentum');
    } else if (hist[len - 1] < 0 && ml[len - 1] < 0) {
      score -= 1; signals.push('MACD bearish momentum');
    }
  }

  // Bollinger Bands
  const bb = bollingerBands(closes, 20, 2);
  const latestClose = closes[closes.length - 1];
  const bbUpper = bb.upper[bb.upper.length - 1];
  const bbLower = bb.lower[bb.lower.length - 1];
  if (bbUpper !== null && bbLower !== null) {
    const bbRange = bbUpper - bbLower;
    if (bbRange > 0) {
      const bbPos = (latestClose - bbLower) / bbRange;
      if (bbPos < 0.1) { score += 2; signals.push('Price at lower Bollinger Band'); }
      else if (bbPos < 0.25) { score += 1; signals.push('Price near lower Bollinger Band'); }
      else if (bbPos > 0.9) { score -= 2; signals.push('Price at upper Bollinger Band'); }
      else if (bbPos > 0.75) { score -= 1; signals.push('Price near upper Bollinger Band'); }
    }
  }

  // Moving average alignment
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const s20 = sma20[sma20.length - 1];
  const s50 = sma50[sma50.length - 1];
  if (s20 !== null && s50 !== null) {
    if (s20 > s50 && latestClose > s20) { score += 1; signals.push('Price above rising MAs'); }
    else if (s20 < s50 && latestClose < s20) { score -= 1; signals.push('Price below falling MAs'); }
  }

  // Volume confirmation
  if (volumes.length >= 20) {
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const latestVol = volumes[volumes.length - 1];
    if (avgVol > 0 && latestVol > avgVol * 1.5) {
      signals.push('High volume confirmation');
      score += score > 0 ? 1 : score < 0 ? -1 : 0;
    }
  }

  return { score, signals, rsi: latestRsi, macdHist: hist[len - 1] };
}

function generateRecommendation(symbol, candles, patterns, sr, fib) {
  if (candles.length < 5) return null;

  const latest = candles[candles.length - 1];
  const currentPrice = latest.close;

  // Score recent patterns (last 5 trading days)
  const recentPatterns = patterns.filter(p => {
    const pIdx = candles.findIndex(c => c.date === p.date);
    return pIdx >= candles.length - 5;
  });

  let patternScore = 0;
  for (const p of recentPatterns) {
    const weight = p.direction === 'bullish' ? 1 : p.direction === 'bearish' ? -1 : 0;
    patternScore += weight * p.strength;
  }

  // Integrate technical indicator signals for confluence
  const indicatorResult = computeIndicatorSignals(candles);
  const indicatorScore = indicatorResult.score;
  const confluenceSignals = indicatorResult.signals;

  // Combined score: pattern score (weight 0.4) + indicator score (weight 0.6)
  const combinedScore = patternScore * 0.4 + indicatorScore * 0.6;

  // Confluence bonus: when patterns and indicators agree, boost confidence
  const patternDir = patternScore > 0 ? 1 : patternScore < 0 ? -1 : 0;
  const indicatorDir = indicatorScore > 0 ? 1 : indicatorScore < 0 ? -1 : 0;
  const confluenceBonus = (patternDir !== 0 && patternDir === indicatorDir) ? patternDir * 1.5 : 0;
  const finalScore = combinedScore + confluenceBonus;

  // Determine signal direction using tighter thresholds with confluence
  let direction;
  if (finalScore >= 4) direction = 'strong_buy';
  else if (finalScore >= 1.5) direction = 'buy';
  else if (finalScore <= -4) direction = 'strong_sell';
  else if (finalScore <= -1.5) direction = 'sell';
  else direction = 'hold';

  // Compute entry, stop-loss, and targets using S/R and Fibonacci
  let entryPrice = currentPrice;
  let stopLoss = null;
  let target1 = null;
  let target2 = null;

  if (direction === 'buy' || direction === 'strong_buy') {
    // Stop loss: nearest support below current price, or -3%
    const supportBelow = (sr.support || []).filter(s => s.price < currentPrice);
    stopLoss = supportBelow.length > 0
      ? supportBelow[supportBelow.length - 1].price
      : Math.round(currentPrice * 0.97 * 100) / 100;

    // Targets: nearest resistance above current price, or Fib levels
    const resistanceAbove = (sr.resistance || []).filter(r => r.price > currentPrice);
    if (resistanceAbove.length > 0) {
      target1 = resistanceAbove[0].price;
      target2 = resistanceAbove.length > 1
        ? resistanceAbove[1].price
        : Math.round(currentPrice * 1.06 * 100) / 100;
    } else if (fib) {
      const fibAbove = Object.values(fib.levels)
        .filter(l => l > currentPrice)
        .sort((a, b) => a - b);
      target1 = fibAbove[0] || Math.round(currentPrice * 1.03 * 100) / 100;
      target2 = fibAbove[1] || Math.round(currentPrice * 1.06 * 100) / 100;
    } else {
      target1 = Math.round(currentPrice * 1.03 * 100) / 100;
      target2 = Math.round(currentPrice * 1.06 * 100) / 100;
    }

    // Refine entry: if near support, use support as entry for better risk/reward
    if (supportBelow.length > 0) {
      const nearestSupport = supportBelow[supportBelow.length - 1].price;
      if ((currentPrice - nearestSupport) / currentPrice < 0.015) {
        entryPrice = nearestSupport;
      }
    }
  } else if (direction === 'sell' || direction === 'strong_sell') {
    // Stop loss: nearest resistance above current price, or +3%
    const resistanceAbove = (sr.resistance || []).filter(r => r.price > currentPrice);
    stopLoss = resistanceAbove.length > 0
      ? resistanceAbove[0].price
      : Math.round(currentPrice * 1.03 * 100) / 100;

    // Targets: nearest support below current price
    const supportBelow = (sr.support || []).filter(s => s.price < currentPrice);
    if (supportBelow.length > 0) {
      target1 = supportBelow[supportBelow.length - 1].price;
      target2 = supportBelow.length > 1
        ? supportBelow[supportBelow.length - 2].price
        : Math.round(currentPrice * 0.94 * 100) / 100;
    } else {
      target1 = Math.round(currentPrice * 0.97 * 100) / 100;
      target2 = Math.round(currentPrice * 0.94 * 100) / 100;
    }

    // Refine entry: if near resistance, use resistance as entry
    if ((sr.resistance || []).length > 0) {
      const nearestRes = (sr.resistance || []).filter(r => r.price > currentPrice);
      if (nearestRes.length > 0 && (nearestRes[0].price - currentPrice) / currentPrice < 0.015) {
        entryPrice = nearestRes[0].price;
      }
    }
  }

  // Risk/reward ratio
  const risk = stopLoss ? Math.abs(entryPrice - stopLoss) : null;
  const reward = target1 ? Math.abs(target1 - entryPrice) : null;
  const riskReward = risk && risk > 0 ? Math.round(reward / risk * 100) / 100 : null;

  return {
    symbol,
    date: latest.date,
    direction,
    patternScore,
    indicatorScore,
    combinedScore: Math.round(finalScore * 100) / 100,
    confluenceSignals,
    recentPatterns: recentPatterns.map(p => p.pattern),
    currentPrice,
    entryPrice,
    stopLoss,
    target1,
    target2,
    riskReward,
  };
}

// ── DB Schema Extension ──────────────────────────────────────────────

function initCandlestickSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS candlestick_patterns (
      symbol    TEXT NOT NULL,
      date      TEXT NOT NULL,
      pattern   TEXT NOT NULL,
      direction TEXT NOT NULL,  -- bullish, bearish, neutral
      strength  INTEGER NOT NULL, -- 1 (weak), 2 (moderate), 3 (strong)
      PRIMARY KEY (symbol, date, pattern),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_candle_pat_date ON candlestick_patterns(date);
    CREATE INDEX IF NOT EXISTS idx_candle_pat_direction ON candlestick_patterns(direction);

    CREATE TABLE IF NOT EXISTS support_resistance (
      symbol    TEXT NOT NULL,
      date      TEXT NOT NULL,
      level_type TEXT NOT NULL,  -- support, resistance
      price     REAL NOT NULL,
      touches   INTEGER NOT NULL,
      last_seen TEXT,
      PRIMARY KEY (symbol, date, level_type, price),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE TABLE IF NOT EXISTS fibonacci_levels (
      symbol    TEXT NOT NULL,
      date      TEXT NOT NULL,
      swing_high REAL NOT NULL,
      swing_low  REAL NOT NULL,
      trend     TEXT NOT NULL,
      fib_0     REAL,
      fib_236   REAL,
      fib_382   REAL,
      fib_500   REAL,
      fib_618   REAL,
      fib_786   REAL,
      fib_1     REAL,
      PRIMARY KEY (symbol, date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE TABLE IF NOT EXISTS candlestick_recommendations (
      symbol        TEXT NOT NULL,
      date          TEXT NOT NULL,
      direction     TEXT NOT NULL,
      pattern_score INTEGER,
      recent_patterns TEXT,  -- JSON array
      current_price REAL,
      entry_price   REAL,
      stop_loss     REAL,
      target_1      REAL,
      target_2      REAL,
      risk_reward   REAL,
      PRIMARY KEY (symbol, date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_candle_rec_direction ON candlestick_recommendations(direction);
  `);
}

// ── Main analysis function ───────────────────────────────────────────

function analyzeSymbolCandlesticks(symbol) {
  const db = getDb();
  initSchema(db);
  initCandlestickSchema(db);

  const rows = db.prepare(
    'SELECT date, open, high, low, close, volume FROM daily_prices WHERE symbol = ? ORDER BY date ASC'
  ).all(symbol);

  if (rows.length < 10) {
    db.close();
    return { patterns: 0, recommendation: null };
  }

  const candles = rows;

  // 1. Scan patterns
  const patterns = scanPatterns(candles);

  // 2. Support & Resistance
  const sr = computeSupportResistance(candles);

  // 3. Fibonacci levels
  const fib = computeFibonacciLevels(candles);

  // 4. Generate recommendation
  const rec = generateRecommendation(symbol, candles, patterns, sr, fib);

  // Store results in DB
  const insertPattern = db.prepare(
    'INSERT OR REPLACE INTO candlestick_patterns (symbol, date, pattern, direction, strength) VALUES (?, ?, ?, ?, ?)'
  );
  const insertSR = db.prepare(
    'INSERT OR REPLACE INTO support_resistance (symbol, date, level_type, price, touches, last_seen) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertFib = db.prepare(
    'INSERT OR REPLACE INTO fibonacci_levels (symbol, date, swing_high, swing_low, trend, fib_0, fib_236, fib_382, fib_500, fib_618, fib_786, fib_1) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertRec = db.prepare(
    'INSERT OR REPLACE INTO candlestick_recommendations (symbol, date, direction, pattern_score, recent_patterns, current_price, entry_price, stop_loss, target_1, target_2, risk_reward) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const latestDate = candles[candles.length - 1].date;

  const storeAll = db.transaction(() => {
    // Store patterns (last 30 days worth)
    const recentPatterns = patterns.slice(-100);
    for (const p of recentPatterns) {
      insertPattern.run(symbol, p.date, p.pattern, p.direction, p.strength);
    }

    // Store S/R levels
    for (const s of sr.support) {
      insertSR.run(symbol, latestDate, 'support', s.price, s.touches, s.lastDate);
    }
    for (const r of sr.resistance) {
      insertSR.run(symbol, latestDate, 'resistance', r.price, r.touches, r.lastDate);
    }

    // Store Fibonacci
    if (fib) {
      insertFib.run(
        symbol, latestDate, fib.high, fib.low, fib.trend,
        fib.levels[0], fib.levels[0.236], fib.levels[0.382],
        fib.levels[0.5], fib.levels[0.618], fib.levels[0.786], fib.levels[1]
      );
    }

    // Store recommendation
    if (rec) {
      insertRec.run(
        symbol, rec.date, rec.direction, rec.patternScore,
        JSON.stringify(rec.recentPatterns),
        rec.currentPrice, rec.entryPrice, rec.stopLoss,
        rec.target1, rec.target2, rec.riskReward
      );
    }
  });

  storeAll();
  db.close();

  return { patterns: patterns.length, recommendation: rec };
}

function analyzeAllCandlesticks() {
  const db = getDb();
  initSchema(db);
  initCandlestickSchema(db);
  const symbols = db.prepare('SELECT symbol, name FROM stocks').all();
  db.close();

  const results = [];
  for (const { symbol, name } of symbols) {
    const result = analyzeSymbolCandlesticks(symbol);
    console.log(`  ${symbol} (${name}): ${result.patterns} patterns, signal=${result.recommendation?.direction || 'N/A'}`);
    results.push({ symbol, name, ...result });
  }
  return results;
}

module.exports = {
  // Pattern detection
  scanPatterns,
  isDoji, isDragonflyDoji, isGravestoneDoji,
  isHammer, isShootingStar, isMarubozu,
  isBullishEngulfing, isBearishEngulfing,
  isBullishHarami, isBearishHarami,
  isPiercingLine, isDarkCloudCover,
  isMorningStar, isEveningStar,
  isThreeWhiteSoldiers, isThreeBlackCrows,
  // Analysis
  computeIndicatorSignals,
  computeSupportResistance,
  computeFibonacciLevels,
  generateRecommendation,
  // DB
  initCandlestickSchema,
  analyzeSymbolCandlesticks,
  analyzeAllCandlesticks,
};
