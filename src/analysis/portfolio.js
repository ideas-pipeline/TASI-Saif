const Anthropic = require('@anthropic-ai/sdk');
const { getDb, initSchema } = require('../db/schema');
const { computeDiversificationScore, analyzePortfolioRisk } = require('./risk-engine');

// ─── Constants ────────────────────────────────────────────────────────
const PORTFOLIO_SIZE = { min: 10, max: 15 };
const BASE_VALUE = 10000; // Normalized portfolio value
const MAX_SINGLE_WEIGHT = 0.15; // Max 15% per stock
const MAX_SECTOR_WEIGHT = 0.30; // Max 30% per sector
const MIN_WEIGHT = 0.03; // Min 3% per stock

/**
 * Select stocks for the model portfolio based on combined scoring,
 * risk constraints, and diversification requirements.
 */
function selectPortfolioStocks() {
  const db = getDb();
  initSchema(db);

  try {
    const latestDate = db.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
    if (!latestDate) return { error: 'No scoring data. Run analyze first.' };

    // Get all scored stocks with prices
    const candidates = db.prepare(`
      SELECT s.symbol, s.name, s.sector, s.market_cap, s.pe_ratio, s.dividend_yield,
             ss.overall_score, ss.technical_score, ss.fundamental_score, ss.ai_score,
             ss.risk_level, ss.volatility, ss.beta, ss.entry_signal, ss.ai_reasoning,
             dp.close as latest_price
      FROM stocks s
      JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
      LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = (
        SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol
      )
      WHERE ss.overall_score IS NOT NULL AND dp.close IS NOT NULL AND dp.close > 0
      ORDER BY ss.overall_score DESC
    `).all(latestDate);

    if (candidates.length === 0) return { error: 'No scored stocks available.' };

    // Phase 1: Score-based ranking with risk penalty
    const ranked = candidates.map(c => {
      let adjustedScore = c.overall_score;
      // Slight bonus for buy/strong_buy signals
      if (c.entry_signal === 'strong_buy') adjustedScore += 0.5;
      else if (c.entry_signal === 'buy') adjustedScore += 0.25;
      // Penalty for high risk
      if (c.risk_level === 'high') adjustedScore -= 0.5;
      // Penalty for sell signals
      if (c.entry_signal === 'sell') adjustedScore -= 1.0;
      if (c.entry_signal === 'strong_sell') adjustedScore -= 2.0;
      return { ...c, adjustedScore };
    }).sort((a, b) => b.adjustedScore - a.adjustedScore);

    // Phase 2: Greedy selection with sector diversification constraint
    const selected = [];
    const sectorWeights = {};

    for (const stock of ranked) {
      if (selected.length >= PORTFOLIO_SIZE.max) break;

      // Skip stocks with sell signals
      if (stock.entry_signal === 'sell' || stock.entry_signal === 'strong_sell') continue;

      // Check sector constraint: would adding this stock push sector above limit?
      const sectorCount = (sectorWeights[stock.sector] || 0);
      const maxPerSector = Math.ceil(PORTFOLIO_SIZE.max * MAX_SECTOR_WEIGHT);
      if (sectorCount >= maxPerSector) continue;

      selected.push(stock);
      sectorWeights[stock.sector] = sectorCount + 1;
    }

    // If we don't have minimum stocks, relax constraints
    if (selected.length < PORTFOLIO_SIZE.min) {
      for (const stock of ranked) {
        if (selected.length >= PORTFOLIO_SIZE.min) break;
        if (selected.find(s => s.symbol === stock.symbol)) continue;
        if (stock.entry_signal === 'strong_sell') continue;
        selected.push(stock);
      }
    }

    return { stocks: selected, date: latestDate };
  } finally {
    db.close();
  }
}

/**
 * Compute portfolio weights using score-proportional allocation
 * with risk-parity adjustments.
 */
function computeWeights(stocks) {
  if (!stocks || stocks.length === 0) return [];

  // Score-proportional raw weights
  const totalScore = stocks.reduce((s, st) => s + Math.max(1, st.adjustedScore), 0);
  let weighted = stocks.map(st => ({
    ...st,
    rawWeight: Math.max(1, st.adjustedScore) / totalScore,
  }));

  // Apply inverse-volatility adjustment (risk parity lite)
  const volWeighted = weighted.map(w => {
    const vol = w.volatility || 0.30;
    return { ...w, invVol: 1 / Math.max(0.05, vol) };
  });
  const totalInvVol = volWeighted.reduce((s, w) => s + w.invVol, 0);

  // Blend: 60% score-based, 40% risk-parity
  let blended = volWeighted.map(w => ({
    ...w,
    weight: 0.6 * w.rawWeight + 0.4 * (w.invVol / totalInvVol),
  }));

  // Enforce constraints: min/max per stock, max per sector
  blended = enforceConstraints(blended);

  return blended;
}

/**
 * Enforce portfolio weight constraints iteratively.
 */
function enforceConstraints(holdings) {
  const maxIterations = 10;
  let result = [...holdings];

  for (let iter = 0; iter < maxIterations; iter++) {
    let adjusted = false;
    let totalWeight = result.reduce((s, h) => s + h.weight, 0);

    // Normalize
    result = result.map(h => ({ ...h, weight: h.weight / totalWeight }));

    // Cap individual weights
    let excess = 0;
    let uncapped = 0;
    for (const h of result) {
      if (h.weight > MAX_SINGLE_WEIGHT) {
        excess += h.weight - MAX_SINGLE_WEIGHT;
        h.weight = MAX_SINGLE_WEIGHT;
        adjusted = true;
      } else if (h.weight < MIN_WEIGHT) {
        excess -= (MIN_WEIGHT - h.weight);
        h.weight = MIN_WEIGHT;
        adjusted = true;
      } else {
        uncapped++;
      }
    }

    // Redistribute excess to uncapped holdings
    if (excess > 0 && uncapped > 0) {
      const redistribution = excess / uncapped;
      for (const h of result) {
        if (h.weight < MAX_SINGLE_WEIGHT && h.weight > MIN_WEIGHT) {
          h.weight += redistribution;
        }
      }
    }

    // Cap sector weights
    const sectorTotals = {};
    for (const h of result) {
      sectorTotals[h.sector] = (sectorTotals[h.sector] || 0) + h.weight;
    }
    for (const [sector, total] of Object.entries(sectorTotals)) {
      if (total > MAX_SECTOR_WEIGHT) {
        const sectorHoldings = result.filter(h => h.sector === sector);
        const scale = MAX_SECTOR_WEIGHT / total;
        const sectorExcess = total - MAX_SECTOR_WEIGHT;
        for (const h of sectorHoldings) {
          h.weight *= scale;
        }
        // Redistribute to other sectors
        const others = result.filter(h => h.sector !== sector);
        const othersTotal = others.reduce((s, h) => s + h.weight, 0);
        if (othersTotal > 0) {
          for (const h of others) {
            h.weight += sectorExcess * (h.weight / othersTotal);
          }
        }
        adjusted = true;
      }
    }

    if (!adjusted) break;
  }

  // Final normalize
  const total = result.reduce((s, h) => s + h.weight, 0);
  return result.map(h => ({
    ...h,
    weight: Math.round((h.weight / total) * 10000) / 10000,
  }));
}

/**
 * Use Claude AI to generate portfolio reasoning and validate selection.
 */
async function getAiPortfolioReasoning(holdings, date) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return 'AI reasoning unavailable (no API key). Portfolio constructed using quantitative scoring and risk-parity weighting.';
  }

  const client = new Anthropic({ apiKey });
  const holdingSummary = holdings.map(h =>
    `${h.symbol} (${h.name}, ${h.sector}): weight=${(h.weight * 100).toFixed(1)}%, score=${h.overall_score}, signal=${h.entry_signal}, risk=${h.risk_level}`
  ).join('\n');

  const sectorWeights = {};
  for (const h of holdings) {
    sectorWeights[h.sector] = (sectorWeights[h.sector] || 0) + h.weight;
  }
  const sectorSummary = Object.entries(sectorWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s}: ${(w * 100).toFixed(1)}%`)
    .join(', ');

  const prompt = `You are a Saudi stock market portfolio analyst. Provide a brief portfolio construction rationale for this TASI model portfolio dated ${date}.

Holdings:
${holdingSummary}

Sector allocation: ${sectorSummary}

Respond in JSON: {"reasoning_en": "<2-3 sentences in English about the portfolio thesis and key allocation decisions>", "reasoning_ar": "<same in Arabic>"}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const json = JSON.parse(response.content[0].text);
    return `${json.reasoning_en}\n${json.reasoning_ar || ''}`;
  } catch (err) {
    console.error(`  AI portfolio reasoning failed: ${err.message}`);
    return 'AI reasoning unavailable. Portfolio constructed using quantitative scoring and risk-parity weighting.';
  }
}

/**
 * Build (or rebalance) the model portfolio.
 * Main entry point for portfolio construction.
 */
async function buildModelPortfolio({ useAi = false } = {}) {
  console.log('Building AI model portfolio...\n');

  // Step 1: Select stocks
  const selection = selectPortfolioStocks();
  if (selection.error) {
    console.error(selection.error);
    return null;
  }

  const { stocks, date } = selection;
  console.log(`  Selected ${stocks.length} stocks from ${date} scoring data`);

  // Step 2: Compute weights
  const weighted = computeWeights(stocks);
  console.log('  Weight allocation computed');

  // Step 3: AI reasoning (optional)
  let reasoning = 'Portfolio constructed using quantitative scoring and risk-parity weighting.';
  if (useAi) {
    console.log('  Generating AI reasoning...');
    reasoning = await getAiPortfolioReasoning(weighted, date);
  }

  // Step 4: Compute diversification score
  const symbols = weighted.map(w => w.symbol);
  const divScore = computeDiversificationScore(symbols);

  // Step 5: Store in database
  const db = getDb();
  initSchema(db);

  try {
    // Mark previous active portfolios as superseded
    db.prepare(
      "UPDATE model_portfolios SET status = 'superseded' WHERE status = 'active'"
    ).run();

    // Get previous active portfolio for rebalance comparison
    const prevPortfolio = db.prepare(
      "SELECT id FROM model_portfolios WHERE status = 'superseded' ORDER BY rebalance_date DESC, version DESC LIMIT 1"
    ).get();

    // Determine version (increment if same date)
    const maxVersion = db.prepare(
      'SELECT MAX(version) as v FROM model_portfolios WHERE rebalance_date = ?'
    ).get(date)?.v || 0;
    const version = maxVersion + 1;

    // Insert new portfolio
    const insertPortfolio = db.prepare(`
      INSERT INTO model_portfolios (rebalance_date, version, status, strategy, stock_count, diversification_score, ai_reasoning)
      VALUES (?, ?, 'active', 'ai_composite', ?, ?, ?)
    `);
    const result = insertPortfolio.run(date, version, weighted.length, divScore?.score || null, reasoning);
    const portfolioId = result.lastInsertRowid;

    // Insert holdings
    const insertHolding = db.prepare(`
      INSERT INTO portfolio_holdings (portfolio_id, symbol, weight, shares_notional, entry_price, score_at_entry, sector, rationale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const BASE_CAPITAL = 100000; // 100K SAR notional portfolio
    for (const h of weighted) {
      const sharesNotional = h.latest_price > 0 ? Math.floor((h.weight * BASE_CAPITAL) / h.latest_price) : 0;
      insertHolding.run(
        portfolioId, h.symbol, h.weight, sharesNotional,
        h.latest_price, h.overall_score, h.sector,
        h.ai_reasoning || `Score: ${h.overall_score}, Signal: ${h.entry_signal}`
      );
    }

    // Compute rebalance delta if we have a previous portfolio
    if (prevPortfolio) {
      const prevHoldings = db.prepare(
        'SELECT symbol, weight FROM portfolio_holdings WHERE portfolio_id = ?'
      ).all(prevPortfolio.id);
      const prevMap = Object.fromEntries(prevHoldings.map(h => [h.symbol, h.weight]));
      const newMap = Object.fromEntries(weighted.map(h => [h.symbol, h.weight]));

      const additions = weighted.filter(h => !prevMap[h.symbol]).map(h => h.symbol);
      const removals = prevHoldings.filter(h => !newMap[h.symbol]).map(h => h.symbol);
      const weightChanges = weighted
        .filter(h => prevMap[h.symbol] && Math.abs(h.weight - prevMap[h.symbol]) > 0.005)
        .map(h => ({ symbol: h.symbol, old_weight: prevMap[h.symbol], new_weight: h.weight }));

      const turnover = additions.reduce((s, sym) => s + (newMap[sym] || 0), 0) +
        removals.reduce((s, sym) => s + (prevMap[sym] || 0), 0) +
        weightChanges.reduce((s, c) => s + Math.abs(c.new_weight - c.old_weight), 0);

      const rebalanceReasoning = [
        additions.length > 0 ? `Added: ${additions.join(', ')}` : null,
        removals.length > 0 ? `Removed: ${removals.join(', ')}` : null,
        weightChanges.length > 0 ? `Reweighted: ${weightChanges.length} stocks` : null,
        `Turnover: ${(turnover * 100).toFixed(1)}%`,
      ].filter(Boolean).join('. ');

      db.prepare(`
        INSERT INTO portfolio_rebalances (portfolio_id, prev_portfolio_id, rebalance_date, additions, removals, weight_changes, turnover, reasoning)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        portfolioId, prevPortfolio.id, date,
        JSON.stringify(additions), JSON.stringify(removals),
        JSON.stringify(weightChanges), turnover, rebalanceReasoning
      );

      console.log(`\n  Rebalance from portfolio #${prevPortfolio.id}:`);
      if (additions.length) console.log(`    + Added: ${additions.join(', ')}`);
      if (removals.length) console.log(`    - Removed: ${removals.join(', ')}`);
      if (weightChanges.length) console.log(`    ~ Reweighted: ${weightChanges.length} stocks`);
      console.log(`    Turnover: ${(turnover * 100).toFixed(1)}%`);
    }

    // Step 6: Initialize performance tracking
    initPerformanceTracking(db, portfolioId, weighted, date);

    console.log(`\n  Portfolio #${portfolioId} saved (${weighted.length} stocks)`);
    console.log(`  Diversification score: ${divScore?.score?.toFixed(1) || 'N/A'}/10`);

    // Print holdings
    console.log('\n  Holdings:');
    console.log('  Symbol      Name                          Weight   Price    Score  Signal');
    console.log('  ' + '─'.repeat(78));
    for (const h of weighted.sort((a, b) => b.weight - a.weight)) {
      console.log(
        `  ${h.symbol.padEnd(10)}  ${h.name.padEnd(30).slice(0, 30)}  ${(h.weight * 100).toFixed(1).padStart(5)}%  ${h.latest_price?.toFixed(2).padStart(7)}  ${String(h.overall_score).padStart(5)}  ${h.entry_signal}`
      );
    }

    // Print sector allocation
    const sectorWeights = {};
    for (const h of weighted) {
      sectorWeights[h.sector] = (sectorWeights[h.sector] || 0) + h.weight;
    }
    console.log('\n  Sector Allocation:');
    for (const [sector, weight] of Object.entries(sectorWeights).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${sector.padEnd(25)} ${(weight * 100).toFixed(1)}%`);
    }

    return {
      portfolioId,
      date,
      holdings: weighted.map(h => ({
        symbol: h.symbol, name: h.name, sector: h.sector,
        weight: h.weight, price: h.latest_price, score: h.overall_score,
        signal: h.entry_signal, risk: h.risk_level,
      })),
      diversificationScore: divScore?.score || null,
      reasoning,
    };
  } finally {
    db.close();
  }
}

/**
 * Initialize performance tracking for a new portfolio.
 */
function initPerformanceTracking(db, portfolioId, holdings, startDate) {
  // Get all trading dates from the rebalance date onward for backfill
  const dates = db.prepare(
    'SELECT DISTINCT date FROM daily_prices WHERE date >= ? ORDER BY date ASC'
  ).all(startDate).map(r => r.date);

  if (dates.length === 0) return;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO portfolio_performance
    (portfolio_id, date, portfolio_value, daily_return, cumulative_return, tasi_value, tasi_return, excess_return)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Compute TASI average as benchmark (equal-weight all stocks)
  const allSymbols = db.prepare('SELECT symbol FROM stocks').all().map(r => r.symbol);

  let prevPortValue = BASE_VALUE;
  let prevTasiValue = BASE_VALUE;
  const holdingPrices = {};

  // Get entry prices
  for (const h of holdings) {
    holdingPrices[h.symbol] = h.latest_price;
  }

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    // Portfolio value: weighted sum of price changes
    let portfolioValue = 0;
    for (const h of holdings) {
      const price = db.prepare(
        'SELECT close FROM daily_prices WHERE symbol = ? AND date = ?'
      ).get(h.symbol, date);
      if (price && holdingPrices[h.symbol] > 0) {
        portfolioValue += h.weight * BASE_VALUE * (price.close / holdingPrices[h.symbol]);
      } else {
        portfolioValue += h.weight * BASE_VALUE;
      }
    }

    // TASI benchmark: equal-weight average of all stocks
    let tasiValue = 0;
    let tasiCount = 0;
    for (const symbol of allSymbols) {
      const entryPrice = db.prepare(
        'SELECT close FROM daily_prices WHERE symbol = ? AND date <= ? ORDER BY date DESC LIMIT 1'
      ).get(symbol, startDate);
      const currentPrice = db.prepare(
        'SELECT close FROM daily_prices WHERE symbol = ? AND date = ?'
      ).get(symbol, date);
      if (entryPrice && currentPrice && entryPrice.close > 0) {
        tasiValue += currentPrice.close / entryPrice.close;
        tasiCount++;
      }
    }
    tasiValue = tasiCount > 0 ? BASE_VALUE * (tasiValue / tasiCount) : BASE_VALUE;

    const dailyReturn = i === 0 ? 0 : (portfolioValue - prevPortValue) / prevPortValue;
    const cumulativeReturn = (portfolioValue - BASE_VALUE) / BASE_VALUE;
    const tasiReturn = (tasiValue - BASE_VALUE) / BASE_VALUE;
    const excessReturn = cumulativeReturn - tasiReturn;

    insert.run(portfolioId, date, portfolioValue, dailyReturn, cumulativeReturn, tasiValue, tasiReturn, excessReturn);

    prevPortValue = portfolioValue;
    prevTasiValue = tasiValue;
  }
}

/**
 * Update performance tracking for the active portfolio with latest prices.
 */
function updatePerformanceTracking() {
  const db = getDb();
  initSchema(db);

  try {
    const portfolio = db.prepare(
      "SELECT * FROM model_portfolios WHERE status = 'active' ORDER BY rebalance_date DESC LIMIT 1"
    ).get();
    if (!portfolio) return null;

    const holdings = db.prepare(
      'SELECT * FROM portfolio_holdings WHERE portfolio_id = ?'
    ).all(portfolio.id);

    const lastTracked = db.prepare(
      'SELECT MAX(date) as date FROM portfolio_performance WHERE portfolio_id = ?'
    ).get(portfolio.id)?.date;

    if (!lastTracked) {
      initPerformanceTracking(db, portfolio.id, holdings, portfolio.rebalance_date);
      return { portfolioId: portfolio.id, status: 'initialized' };
    }

    // Get new dates since last tracking
    const newDates = db.prepare(
      'SELECT DISTINCT date FROM daily_prices WHERE date > ? ORDER BY date ASC'
    ).all(lastTracked).map(r => r.date);

    if (newDates.length === 0) return { portfolioId: portfolio.id, status: 'up_to_date' };

    const insert = db.prepare(`
      INSERT OR REPLACE INTO portfolio_performance
      (portfolio_id, date, portfolio_value, daily_return, cumulative_return, tasi_value, tasi_return, excess_return)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const lastPerf = db.prepare(
      'SELECT * FROM portfolio_performance WHERE portfolio_id = ? AND date = ?'
    ).get(portfolio.id, lastTracked);

    let prevValue = lastPerf?.portfolio_value || BASE_VALUE;
    const allSymbols = db.prepare('SELECT symbol FROM stocks').all().map(r => r.symbol);

    for (const date of newDates) {
      let portfolioValue = 0;
      for (const h of holdings) {
        const price = db.prepare(
          'SELECT close FROM daily_prices WHERE symbol = ? AND date = ?'
        ).get(h.symbol, date);
        if (price && h.entry_price > 0) {
          portfolioValue += h.weight * BASE_VALUE * (price.close / h.entry_price);
        } else {
          portfolioValue += h.weight * BASE_VALUE;
        }
      }

      // TASI benchmark
      let tasiValue = 0;
      let tasiCount = 0;
      for (const symbol of allSymbols) {
        const entryPrice = db.prepare(
          'SELECT close FROM daily_prices WHERE symbol = ? AND date <= ? ORDER BY date DESC LIMIT 1'
        ).get(symbol, portfolio.rebalance_date);
        const currentPrice = db.prepare(
          'SELECT close FROM daily_prices WHERE symbol = ? AND date = ?'
        ).get(symbol, date);
        if (entryPrice && currentPrice && entryPrice.close > 0) {
          tasiValue += currentPrice.close / entryPrice.close;
          tasiCount++;
        }
      }
      tasiValue = tasiCount > 0 ? BASE_VALUE * (tasiValue / tasiCount) : BASE_VALUE;

      const dailyReturn = (portfolioValue - prevValue) / prevValue;
      const cumulativeReturn = (portfolioValue - BASE_VALUE) / BASE_VALUE;
      const tasiReturn = (tasiValue - BASE_VALUE) / BASE_VALUE;
      const excessReturn = cumulativeReturn - tasiReturn;

      insert.run(portfolio.id, date, portfolioValue, dailyReturn, cumulativeReturn, tasiValue, tasiReturn, excessReturn);
      prevValue = portfolioValue;
    }

    return { portfolioId: portfolio.id, status: 'updated', newDays: newDates.length };
  } finally {
    db.close();
  }
}

/**
 * Get the current active portfolio with full details.
 */
function getActivePortfolio() {
  const db = getDb();
  initSchema(db);

  try {
    const portfolio = db.prepare(
      "SELECT * FROM model_portfolios WHERE status = 'active' ORDER BY rebalance_date DESC LIMIT 1"
    ).get();
    if (!portfolio) return null;

    const holdings = db.prepare(`
      SELECT ph.*, s.name, dp.close as current_price
      FROM portfolio_holdings ph
      JOIN stocks s ON ph.symbol = s.symbol
      LEFT JOIN daily_prices dp ON ph.symbol = dp.symbol AND dp.date = (
        SELECT MAX(date) FROM daily_prices WHERE symbol = ph.symbol
      )
      WHERE ph.portfolio_id = ?
      ORDER BY ph.weight DESC
    `).all(portfolio.id);

    // Compute current values
    const BASE_CAPITAL = 100000;
    for (const h of holdings) {
      h.current_value = h.current_price && h.entry_price > 0
        ? h.weight * BASE_CAPITAL * (h.current_price / h.entry_price)
        : h.weight * BASE_CAPITAL;
      h.pnl = h.current_price && h.entry_price
        ? ((h.current_price - h.entry_price) / h.entry_price) * 100
        : 0;
    }

    // Performance history
    const performance = db.prepare(
      'SELECT * FROM portfolio_performance WHERE portfolio_id = ? ORDER BY date ASC'
    ).all(portfolio.id);

    // Latest rebalance info
    const rebalance = db.prepare(
      'SELECT * FROM portfolio_rebalances WHERE portfolio_id = ? ORDER BY rebalance_date DESC LIMIT 1'
    ).get(portfolio.id);

    // Sector allocation
    const sectorAllocation = {};
    for (const h of holdings) {
      sectorAllocation[h.sector] = (sectorAllocation[h.sector] || 0) + h.weight;
    }

    // Latest performance metrics
    const latestPerf = performance.length > 0 ? performance[performance.length - 1] : null;

    return {
      id: portfolio.id,
      rebalanceDate: portfolio.rebalance_date,
      strategy: portfolio.strategy,
      stockCount: portfolio.stock_count,
      diversificationScore: portfolio.diversification_score,
      reasoning: portfolio.ai_reasoning,
      holdings,
      performance,
      rebalance: rebalance ? {
        ...rebalance,
        additions: JSON.parse(rebalance.additions || '[]'),
        removals: JSON.parse(rebalance.removals || '[]'),
        weightChanges: JSON.parse(rebalance.weight_changes || '[]'),
      } : null,
      sectorAllocation,
      summary: latestPerf ? {
        portfolioValue: latestPerf.portfolio_value,
        cumulativeReturn: latestPerf.cumulative_return,
        tasiReturn: latestPerf.tasi_return,
        excessReturn: latestPerf.excess_return,
        latestDate: latestPerf.date,
      } : null,
    };
  } finally {
    db.close();
  }
}

/**
 * Get portfolio history (all rebalances).
 */
function getPortfolioHistory() {
  const db = getDb();
  initSchema(db);

  try {
    const portfolios = db.prepare(
      'SELECT * FROM model_portfolios ORDER BY rebalance_date DESC'
    ).all();

    return portfolios.map(p => {
      const holdings = db.prepare(
        'SELECT symbol, weight, entry_price, score_at_entry, sector FROM portfolio_holdings WHERE portfolio_id = ?'
      ).all(p.id);
      const rebalance = db.prepare(
        'SELECT * FROM portfolio_rebalances WHERE portfolio_id = ?'
      ).get(p.id);
      return {
        ...p,
        holdings,
        rebalance: rebalance ? {
          ...rebalance,
          additions: JSON.parse(rebalance.additions || '[]'),
          removals: JSON.parse(rebalance.removals || '[]'),
          weightChanges: JSON.parse(rebalance.weight_changes || '[]'),
        } : null,
      };
    });
  } finally {
    db.close();
  }
}

/**
 * Run a historical backtest of the portfolio strategy.
 * Simulates weekly rebalancing over the available data.
 */
function backtestPortfolio({ weeks = 52 } = {}) {
  const db = getDb();
  initSchema(db);

  try {
    // Get all distinct score dates
    const scoreDates = db.prepare(
      'SELECT DISTINCT date FROM stock_scores ORDER BY date ASC'
    ).all().map(r => r.date);

    if (scoreDates.length === 0) return { error: 'No scoring data available.' };

    // Sample dates at weekly intervals
    const weeklyDates = [];
    for (let i = 0; i < scoreDates.length; i += 5) { // ~5 trading days = 1 week
      weeklyDates.push(scoreDates[i]);
    }

    // Limit to requested weeks
    const rebalanceDates = weeklyDates.slice(-weeks);
    if (rebalanceDates.length < 2) return { error: 'Insufficient data for backtest.' };

    let portfolioValue = BASE_VALUE;
    let tasiValue = BASE_VALUE;
    const valueHistory = [];

    for (let i = 0; i < rebalanceDates.length - 1; i++) {
      const date = rebalanceDates[i];
      const nextDate = rebalanceDates[i + 1];

      // Get top stocks at this date
      const topStocks = db.prepare(`
        SELECT s.symbol, ss.overall_score, ss.entry_signal, ss.risk_level, ss.volatility,
               dp.close as price
        FROM stocks s
        JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
        LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = ?
        WHERE ss.overall_score IS NOT NULL AND dp.close > 0
          AND ss.entry_signal NOT IN ('sell', 'strong_sell')
        ORDER BY ss.overall_score DESC
        LIMIT ?
      `).all(date, date, PORTFOLIO_SIZE.max);

      if (topStocks.length === 0) continue;

      // Equal-weight for backtest simplicity
      const weight = 1.0 / topStocks.length;

      // Compute return to next rebalance date
      let periodReturn = 0;
      let tasiPeriodReturn = 0;
      let tasiStockCount = 0;

      for (const stock of topStocks) {
        const nextPrice = db.prepare(
          'SELECT close FROM daily_prices WHERE symbol = ? AND date = ?'
        ).get(stock.symbol, nextDate);
        if (nextPrice && stock.price > 0) {
          periodReturn += weight * ((nextPrice.close - stock.price) / stock.price);
        }
      }

      // TASI benchmark (all stocks equal-weight)
      const allStocks = db.prepare(
        'SELECT symbol FROM stocks'
      ).all();
      for (const { symbol } of allStocks) {
        const p1 = db.prepare('SELECT close FROM daily_prices WHERE symbol = ? AND date = ?').get(symbol, date);
        const p2 = db.prepare('SELECT close FROM daily_prices WHERE symbol = ? AND date = ?').get(symbol, nextDate);
        if (p1 && p2 && p1.close > 0) {
          tasiPeriodReturn += (p2.close - p1.close) / p1.close;
          tasiStockCount++;
        }
      }
      tasiPeriodReturn = tasiStockCount > 0 ? tasiPeriodReturn / tasiStockCount : 0;

      portfolioValue *= (1 + periodReturn);
      tasiValue *= (1 + tasiPeriodReturn);

      valueHistory.push({
        date,
        portfolioValue,
        tasiValue,
        periodReturn,
        tasiPeriodReturn,
        excessReturn: periodReturn - tasiPeriodReturn,
      });
    }

    const totalReturn = (portfolioValue - BASE_VALUE) / BASE_VALUE;
    const tasiTotalReturn = (tasiValue - BASE_VALUE) / BASE_VALUE;

    return {
      startDate: rebalanceDates[0],
      endDate: rebalanceDates[rebalanceDates.length - 1],
      rebalances: valueHistory.length,
      portfolioFinalValue: portfolioValue,
      tasiFinalValue: tasiValue,
      totalReturn,
      tasiTotalReturn,
      excessReturn: totalReturn - tasiTotalReturn,
      valueHistory,
    };
  } finally {
    db.close();
  }
}

module.exports = {
  selectPortfolioStocks,
  computeWeights,
  buildModelPortfolio,
  updatePerformanceTracking,
  getActivePortfolio,
  getPortfolioHistory,
  backtestPortfolio,
  PORTFOLIO_SIZE,
  MAX_SINGLE_WEIGHT,
  MAX_SECTOR_WEIGHT,
};
