const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Fetch historical daily OHLCV data for a symbol from Yahoo Finance.
 * @param {string} symbol - Yahoo Finance symbol (e.g. '2222.SR')
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD (optional, defaults to today)
 * @returns {Array} Array of { date, open, high, low, close, adjClose, volume }
 */
async function fetchHistoricalData(symbol, startDate, endDate) {
  const period1 = startDate;
  const period2 = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await yahooFinance.chart(symbol, {
      period1,
      period2,
      interval: '1d',
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      console.warn(`No historical data returned for ${symbol}`);
      return [];
    }

    return result.quotes.map(q => ({
      date: new Date(q.date).toISOString().split('T')[0],
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      close: q.close ?? null,
      adjClose: q.adjclose ?? q.close ?? null,
      volume: q.volume ?? 0,
    }));
  } catch (err) {
    console.error(`Error fetching historical data for ${symbol}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch fundamental/quote data for a symbol.
 * Returns market cap, P/E, EPS, dividend yield.
 */
async function fetchQuoteSummary(symbol) {
  const fallback = { marketCap: null, peRatio: null, eps: null, dividendYield: null, currency: 'SAR' };

  // Try quoteSummary first, fall back to quote() on failure
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'price'],
    });

    const summary = result.summaryDetail || {};
    const keyStats = result.defaultKeyStatistics || {};
    const price = result.price || {};

    return {
      marketCap: price.marketCap ?? null,
      peRatio: summary.trailingPE ?? null,
      eps: keyStats.trailingEps ?? null,
      dividendYield: summary.dividendYield ?? null,
      currency: price.currency || 'SAR',
    };
  } catch (_) {
    // quoteSummary often fails with redirects for .SR stocks; try quote()
    try {
      const q = await yahooFinance.quote(symbol);
      return {
        marketCap: q.marketCap ?? null,
        peRatio: q.trailingPE ?? null,
        eps: q.epsTrailingTwelveMonths ?? null,
        dividendYield: q.dividendYield ? q.dividendYield / 100 : null,
        currency: q.currency || 'SAR',
      };
    } catch (err2) {
      console.error(`Error fetching quote for ${symbol}: ${err2.message}`);
      return fallback;
    }
  }
}

/**
 * Fetch financial statements (income, balance sheet, cash flow) for a symbol.
 * Returns quarterly and annual data where available.
 */
async function fetchFinancialStatements(symbol) {
  const modules = [
    'incomeStatementHistory',
    'incomeStatementHistoryQuarterly',
    'balanceSheetHistory',
    'balanceSheetHistoryQuarterly',
    'cashflowStatementHistory',
    'cashflowStatementHistoryQuarterly',
    'defaultKeyStatistics',
    'financialData',
  ];

  try {
    const result = await yahooFinance.quoteSummary(symbol, { modules });

    const reports = [];

    // Helper to extract a report row from combined statements
    function extractReport(income, balance, cashflow, periodType, keyStats, finData) {
      const periodEnd = income?.endDate
        ? new Date(income.endDate).toISOString().split('T')[0]
        : balance?.endDate
          ? new Date(balance.endDate).toISOString().split('T')[0]
          : null;
      if (!periodEnd) return null;

      const totalRevenue = income?.totalRevenue ?? null;
      const costOfRevenue = income?.costOfRevenue ?? null;
      const grossProfit = income?.grossProfit ?? null;
      const operatingIncome = income?.operatingIncome ?? null;
      const netIncome = income?.netIncome ?? null;
      const ebitda = income?.ebitda ?? null;

      return {
        periodEnd,
        periodType,
        totalRevenue,
        costOfRevenue,
        grossProfit,
        operatingIncome,
        netIncome,
        ebitda,
        epsBasic: income?.netIncome && keyStats?.sharesOutstanding
          ? income.netIncome / keyStats.sharesOutstanding : null,
        epsDiluted: income?.netIncome && keyStats?.sharesOutstanding
          ? income.netIncome / keyStats.sharesOutstanding : null,
        grossMargin: totalRevenue ? (grossProfit / totalRevenue) : null,
        operatingMargin: totalRevenue ? (operatingIncome / totalRevenue) : null,
        netMargin: totalRevenue ? (netIncome / totalRevenue) : null,
        totalAssets: balance?.totalAssets ?? null,
        totalLiabilities: balance?.totalLiab ?? null,
        totalEquity: balance?.totalStockholderEquity ?? null,
        totalDebt: balance?.longTermDebt ?? null,
        totalCash: balance?.cash ?? null,
        currentAssets: balance?.totalCurrentAssets ?? null,
        currentLiabilities: balance?.totalCurrentLiabilities ?? null,
        operatingCashFlow: cashflow?.totalCashFromOperatingActivities ?? null,
        capitalExpenditure: cashflow?.capitalExpenditures ?? null,
        freeCashFlow: cashflow?.totalCashFromOperatingActivities && cashflow?.capitalExpenditures
          ? cashflow.totalCashFromOperatingActivities + cashflow.capitalExpenditures : null,
        sharesOutstanding: keyStats?.sharesOutstanding ?? null,
        bookValuePerShare: keyStats?.bookValue ?? null,
      };
    }

    const keyStats = result.defaultKeyStatistics || {};
    const finData = result.financialData || {};

    // Quarterly statements
    const qIncome = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const qBalance = result.balanceSheetHistoryQuarterly?.balanceSheetStatements || [];
    const qCashflow = result.cashflowStatementHistoryQuarterly?.cashflowStatements || [];
    const qLen = Math.max(qIncome.length, qBalance.length, qCashflow.length);
    for (let i = 0; i < qLen; i++) {
      const r = extractReport(qIncome[i], qBalance[i], qCashflow[i], 'quarterly', keyStats, finData);
      if (r) reports.push(r);
    }

    // Annual statements
    const aIncome = result.incomeStatementHistory?.incomeStatementHistory || [];
    const aBalance = result.balanceSheetHistory?.balanceSheetStatements || [];
    const aCashflow = result.cashflowStatementHistory?.cashflowStatements || [];
    const aLen = Math.max(aIncome.length, aBalance.length, aCashflow.length);
    for (let i = 0; i < aLen; i++) {
      const r = extractReport(aIncome[i], aBalance[i], aCashflow[i], 'annual', keyStats, finData);
      if (r) reports.push(r);
    }

    return reports;
  } catch (err) {
    console.error(`Error fetching financials for ${symbol}: ${err.message}`);
    return [];
  }
}

module.exports = { fetchHistoricalData, fetchQuoteSummary, fetchFinancialStatements };
