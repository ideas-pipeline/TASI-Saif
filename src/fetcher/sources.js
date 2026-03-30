const yahoo = require('./yahoo');
const alphaVantage = require('./alpha-vantage');
const tadawul = require('./tadawul');

/**
 * Unified data source manager.
 * Primary: Yahoo Finance (no key required, best coverage for .SR stocks)
 * Secondary: Alpha Vantage (requires API key, used as fallback + unique data)
 * Supplementary: Tadawul (corporate actions, news — always attempted)
 *
 * Strategy:
 * - For OHLCV and fundamentals: try Yahoo first, fall back to Alpha Vantage
 * - For intraday data: Alpha Vantage only (Yahoo doesn't provide intraday for Saudi stocks)
 * - For earnings data: Alpha Vantage only (quarterly EPS with surprise data)
 * - For corporate actions and news: always fetch from Tadawul (unique data)
 * - Log which source served each request for observability
 */

const SOURCES = {
  YAHOO: 'yahoo',
  ALPHA_VANTAGE: 'alpha_vantage',
  TADAWUL: 'tadawul',
};

/**
 * Fetch historical OHLCV with automatic fallback.
 * @param {string} symbol - Yahoo-style symbol (e.g. '2222.SR')
 * @param {string} startDate
 * @param {string} endDate
 * @returns {{ data: Array, source: string }}
 */
async function fetchHistoricalData(symbol, startDate, endDate) {
  // Try Yahoo Finance first
  try {
    const data = await yahoo.fetchHistoricalData(symbol, startDate, endDate);
    if (data && data.length > 0) {
      return { data, source: SOURCES.YAHOO };
    }
  } catch (err) {
    console.warn(`Yahoo historical failed for ${symbol}: ${err.message}`);
  }

  // Fall back to Alpha Vantage if configured
  if (alphaVantage.isAvailable()) {
    try {
      const data = await alphaVantage.fetchHistoricalData(symbol, startDate, endDate);
      if (data && data.length > 0) {
        console.log(`  -> Used Alpha Vantage fallback for ${symbol} historical data`);
        return { data, source: SOURCES.ALPHA_VANTAGE };
      }
    } catch (err) {
      console.warn(`Alpha Vantage historical failed for ${symbol}: ${err.message}`);
    }
  }

  return { data: [], source: null };
}

/**
 * Fetch fundamental/quote data with automatic fallback.
 * When Alpha Vantage is available, merge its additional fields (beta, ROE, analyst target)
 * with Yahoo's base data for richer fundamental coverage.
 * @param {string} symbol
 * @returns {{ data: Object, source: string }}
 */
async function fetchQuoteSummary(symbol) {
  const fallback = { marketCap: null, peRatio: null, eps: null, dividendYield: null, currency: 'SAR' };

  let yahooData = null;
  let avData = null;

  // Try Yahoo Finance first
  try {
    const data = await yahoo.fetchQuoteSummary(symbol);
    if (data && (data.marketCap || data.peRatio || data.eps)) {
      yahooData = data;
    }
  } catch (err) {
    console.warn(`Yahoo quote failed for ${symbol}: ${err.message}`);
  }

  // Try Alpha Vantage for enrichment or as fallback
  if (alphaVantage.isAvailable()) {
    try {
      const data = await alphaVantage.fetchQuoteSummary(symbol);
      if (data && (data.marketCap || data.peRatio || data.eps)) {
        avData = data;
        if (!yahooData) {
          console.log(`  -> Used Alpha Vantage fallback for ${symbol} fundamentals`);
        }
      }
    } catch (err) {
      console.warn(`Alpha Vantage quote failed for ${symbol}: ${err.message}`);
    }
  }

  // Merge: Yahoo as base, Alpha Vantage enrichment for fields Yahoo doesn't provide
  if (yahooData && avData) {
    return {
      data: {
        ...yahooData,
        // Alpha Vantage unique fields
        bookValue: avData.bookValue || null,
        profitMargin: avData.profitMargin || null,
        revenuePerShare: avData.revenuePerShare || null,
        returnOnEquity: avData.returnOnEquity || null,
        returnOnAssets: avData.returnOnAssets || null,
        beta: avData.beta || yahooData.beta || null,
        fiftyTwoWeekHigh: avData.fiftyTwoWeekHigh || null,
        fiftyTwoWeekLow: avData.fiftyTwoWeekLow || null,
        analystTargetPrice: avData.analystTargetPrice || null,
      },
      source: 'yahoo+alpha_vantage',
    };
  }

  if (yahooData) return { data: yahooData, source: SOURCES.YAHOO };
  if (avData) return { data: avData, source: SOURCES.ALPHA_VANTAGE };

  return { data: fallback, source: null };
}

/**
 * Fetch intraday OHLCV data (Alpha Vantage exclusive).
 * Yahoo Finance does not provide intraday data for Saudi stocks.
 * @param {string} symbol
 * @param {string} [interval='60min']
 * @returns {{ data: Array, source: string }}
 */
async function fetchIntradayData(symbol, interval = '60min') {
  if (!alphaVantage.isAvailable()) {
    return { data: [], source: null };
  }

  try {
    const data = await alphaVantage.fetchIntradayData(symbol, interval);
    if (data && data.length > 0) {
      return { data, source: SOURCES.ALPHA_VANTAGE };
    }
  } catch (err) {
    console.warn(`Alpha Vantage intraday failed for ${symbol}: ${err.message}`);
  }

  return { data: [], source: null };
}

/**
 * Fetch earnings data (Alpha Vantage exclusive).
 * Quarterly and annual EPS with surprise/estimate data.
 * @param {string} symbol
 * @returns {{ data: { quarterly: Array, annual: Array }, source: string }}
 */
async function fetchEarnings(symbol) {
  if (!alphaVantage.isAvailable()) {
    return { data: { quarterly: [], annual: [] }, source: null };
  }

  try {
    const data = await alphaVantage.fetchEarnings(symbol);
    if (data.quarterly.length > 0 || data.annual.length > 0) {
      return { data, source: SOURCES.ALPHA_VANTAGE };
    }
  } catch (err) {
    console.warn(`Alpha Vantage earnings failed for ${symbol}: ${err.message}`);
  }

  return { data: { quarterly: [], annual: [] }, source: null };
}

/**
 * Fetch corporate actions from Tadawul.
 * @param {string} symbol
 * @returns {{ data: Array, source: string }}
 */
async function fetchCorporateActions(symbol) {
  try {
    const data = await tadawul.fetchCorporateActions(symbol);
    return { data, source: SOURCES.TADAWUL };
  } catch (err) {
    console.warn(`Tadawul corporate actions failed for ${symbol}: ${err.message}`);
    return { data: [], source: null };
  }
}

/**
 * Fetch announcements/news from Tadawul.
 * @param {string} symbol
 * @param {number} [limit=20]
 * @returns {{ data: Array, source: string }}
 */
async function fetchAnnouncements(symbol, limit = 20) {
  try {
    const data = await tadawul.fetchAnnouncements(symbol, limit);
    return { data, source: SOURCES.TADAWUL };
  } catch (err) {
    console.warn(`Tadawul announcements failed for ${symbol}: ${err.message}`);
    return { data: [], source: null };
  }
}

/**
 * Fetch TASI market summary from Tadawul.
 * @returns {{ data: Object|null, source: string }}
 */
async function fetchMarketSummary() {
  try {
    const data = await tadawul.fetchMarketSummary();
    return { data, source: SOURCES.TADAWUL };
  } catch (err) {
    console.warn(`Tadawul market summary failed: ${err.message}`);
    return { data: null, source: null };
  }
}

/**
 * Get status of all configured data sources.
 * @returns {Object}
 */
function getSourceStatus() {
  const status = {
    yahoo: true, // Always available (no API key needed)
    alphaVantage: alphaVantage.isAvailable(),
    tadawul: true, // Public endpoints, always attempted
  };

  if (status.alphaVantage) {
    status.alphaVantageRateLimit = alphaVantage.getRateLimitStatus();
  }

  return status;
}

module.exports = {
  SOURCES,
  fetchHistoricalData,
  fetchQuoteSummary,
  fetchIntradayData,
  fetchEarnings,
  fetchCorporateActions,
  fetchAnnouncements,
  fetchMarketSummary,
  getSourceStatus,
};
