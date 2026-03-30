const { getDb, initSchema } = require('../db/schema');
const { fetchQuoteSummary, fetchFinancialStatements } = require('../fetcher/yahoo');

/**
 * Enrich stocks table with fundamental data from Yahoo Finance.
 */
async function enrichFundamentals() {
  const db = getDb();
  initSchema(db);
  const stocks = db.prepare('SELECT symbol, name FROM stocks').all();

  const update = db.prepare(`
    UPDATE stocks SET
      market_cap = ?,
      pe_ratio = ?,
      eps = ?,
      dividend_yield = ?,
      updated_at = datetime('now')
    WHERE symbol = ?
  `);

  let enriched = 0;
  for (const { symbol, name } of stocks) {
    try {
      const data = await fetchQuoteSummary(symbol);
      update.run(data.marketCap, data.peRatio, data.eps, data.dividendYield, symbol);
      const hasData = data.marketCap || data.peRatio || data.eps || data.dividendYield;
      if (hasData) enriched++;
      console.log(`  ${symbol} (${name}): PE=${data.peRatio ?? 'N/A'} EPS=${data.eps ?? 'N/A'} DivYield=${data.dividendYield ?? 'N/A'}`);
    } catch (err) {
      console.error(`  ${symbol}: Failed to enrich - ${err.message}`);
    }
    // Rate-limit to avoid Yahoo Finance throttling
    await new Promise(r => setTimeout(r, 300));
  }

  db.close();
  return { total: stocks.length, enriched };
}

/**
 * Score a stock's fundamentals on a 1-10 scale.
 * Uses available data; returns partial score if some metrics are missing.
 */
function scoreFundamentals(stock) {
  let score = 5; // neutral baseline
  let factors = 0;

  // P/E ratio scoring (lower is generally better for value)
  if (stock.pe_ratio !== null && stock.pe_ratio > 0) {
    factors++;
    if (stock.pe_ratio < 10) score += 2;
    else if (stock.pe_ratio < 15) score += 1.5;
    else if (stock.pe_ratio < 20) score += 0.5;
    else if (stock.pe_ratio < 30) score -= 0.5;
    else score -= 1.5;
  }

  // EPS scoring (positive and growing is good)
  if (stock.eps !== null) {
    factors++;
    if (stock.eps > 5) score += 2;
    else if (stock.eps > 2) score += 1;
    else if (stock.eps > 0) score += 0.5;
    else score -= 1.5;
  }

  // Dividend yield scoring
  if (stock.dividend_yield !== null) {
    factors++;
    if (stock.dividend_yield > 0.05) score += 1.5;
    else if (stock.dividend_yield > 0.03) score += 1;
    else if (stock.dividend_yield > 0.01) score += 0.5;
    else score += 0;
  }

  // Market cap scoring (larger = generally more stable)
  if (stock.market_cap !== null && stock.market_cap > 0) {
    factors++;
    if (stock.market_cap > 100e9) score += 1; // mega cap
    else if (stock.market_cap > 10e9) score += 0.5; // large cap
    else if (stock.market_cap < 1e9) score -= 0.5; // small cap
  }

  // Clamp to 1-10
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Get fundamental data for all stocks.
 */
function getAllFundamentals() {
  const db = getDb();
  initSchema(db);
  const stocks = db.prepare('SELECT * FROM stocks ORDER BY sector, symbol').all();
  db.close();
  return stocks.map(s => ({
    ...s,
    fundamentalScore: scoreFundamentals(s),
  }));
}

/**
 * Fetch and store financial statements for all stocks.
 */
async function enrichFinancialReports() {
  const db = getDb();
  initSchema(db);
  const stocks = db.prepare('SELECT symbol, name FROM stocks').all();

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO financial_reports (
      symbol, period_end, period_type,
      total_revenue, cost_of_revenue, gross_profit, operating_income, net_income, ebitda,
      eps_basic, eps_diluted, gross_margin, operating_margin, net_margin,
      total_assets, total_liabilities, total_equity, total_debt, total_cash,
      current_assets, current_liabilities,
      operating_cash_flow, capital_expenditure, free_cash_flow,
      shares_outstanding, book_value_per_share, currency, source, fetched_at
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, 'SAR', 'yahoo', datetime('now')
    )
  `);

  let total = 0;
  for (const { symbol, name } of stocks) {
    try {
      const reports = await fetchFinancialStatements(symbol);
      for (const r of reports) {
        upsert.run(
          symbol, r.periodEnd, r.periodType,
          r.totalRevenue, r.costOfRevenue, r.grossProfit, r.operatingIncome, r.netIncome, r.ebitda,
          r.epsBasic, r.epsDiluted, r.grossMargin, r.operatingMargin, r.netMargin,
          r.totalAssets, r.totalLiabilities, r.totalEquity, r.totalDebt, r.totalCash,
          r.currentAssets, r.currentLiabilities,
          r.operatingCashFlow, r.capitalExpenditure, r.freeCashFlow,
          r.sharesOutstanding, r.bookValuePerShare,
        );
        total++;
      }
      console.log(`  ${symbol} (${name}): ${reports.length} financial reports stored`);
    } catch (err) {
      console.error(`  ${symbol}: Failed to fetch financials - ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  db.close();
  return { stocksProcessed: stocks.length, reportsStored: total };
}

/**
 * Get financial reports for a specific stock.
 */
function getFinancialReports(symbol, periodType) {
  const db = getDb();
  initSchema(db);
  let query = 'SELECT * FROM financial_reports WHERE symbol = ?';
  const params = [symbol];
  if (periodType) {
    query += ' AND period_type = ?';
    params.push(periodType);
  }
  query += ' ORDER BY period_end DESC';
  const reports = db.prepare(query).all(...params);
  db.close();
  return reports;
}

/**
 * Compute valuation metrics for a stock from its latest financial data and price.
 */
function computeValuationMetrics(symbol) {
  const db = getDb();
  initSchema(db);

  const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
  if (!stock) { db.close(); return null; }

  const latestPrice = db.prepare(
    'SELECT close FROM daily_prices WHERE symbol = ? ORDER BY date DESC LIMIT 1'
  ).get(symbol);

  const annualReport = db.prepare(
    "SELECT * FROM financial_reports WHERE symbol = ? AND period_type = 'annual' ORDER BY period_end DESC LIMIT 1"
  ).get(symbol);

  const quarterlyReports = db.prepare(
    "SELECT * FROM financial_reports WHERE symbol = ? AND period_type = 'quarterly' ORDER BY period_end DESC LIMIT 4"
  ).all(symbol);

  db.close();

  const price = latestPrice?.close;
  const ttmRevenue = quarterlyReports.reduce((s, r) => s + (r.total_revenue || 0), 0);
  const ttmNetIncome = quarterlyReports.reduce((s, r) => s + (r.net_income || 0), 0);
  const ttmEbitda = quarterlyReports.reduce((s, r) => s + (r.ebitda || 0), 0);
  const shares = annualReport?.shares_outstanding || stock.market_cap / (price || 1);

  return {
    pe: price && ttmNetIncome > 0 && shares ? (price * shares) / ttmNetIncome : stock.pe_ratio,
    pb: price && annualReport?.book_value_per_share ? price / annualReport.book_value_per_share : null,
    ps: price && ttmRevenue > 0 && shares ? (price * shares) / ttmRevenue : null,
    evToEbitda: stock.market_cap && annualReport?.total_debt != null && annualReport?.total_cash != null && ttmEbitda > 0
      ? (stock.market_cap + (annualReport.total_debt || 0) - (annualReport.total_cash || 0)) / ttmEbitda
      : null,
    dividendYield: stock.dividend_yield,
    roe: annualReport?.net_income && annualReport?.total_equity
      ? annualReport.net_income / annualReport.total_equity : null,
    roa: annualReport?.net_income && annualReport?.total_assets
      ? annualReport.net_income / annualReport.total_assets : null,
    debtToEquity: annualReport?.total_debt && annualReport?.total_equity
      ? annualReport.total_debt / annualReport.total_equity : null,
    currentRatio: annualReport?.current_assets && annualReport?.current_liabilities
      ? annualReport.current_assets / annualReport.current_liabilities : null,
  };
}

module.exports = {
  enrichFundamentals, scoreFundamentals, getAllFundamentals,
  enrichFinancialReports, getFinancialReports, computeValuationMetrics,
};
