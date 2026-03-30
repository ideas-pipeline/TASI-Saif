const https = require('https');

const API_BASE = 'https://www.alphavantage.co/query';

/**
 * Alpha Vantage fetcher for TASI stocks.
 * Free tier: 25 requests/day, 5 requests/minute.
 * Requires API key via ALPHA_VANTAGE_API_KEY env var.
 * Saudi stocks use symbol format: e.g. '2222.SAU' (Tadawul code + .SAU suffix).
 */

// --- Rate Limiter ---
// Free tier: 5 requests/minute, 25 requests/day
const rateLimiter = {
  minuteWindow: [],    // timestamps of requests in current minute
  dailyCount: 0,
  dailyResetDate: null,
  maxPerMinute: 5,
  maxPerDay: 25,

  canRequest() {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // Reset daily counter on new day
    if (this.dailyResetDate !== today) {
      this.dailyCount = 0;
      this.dailyResetDate = today;
    }

    if (this.dailyCount >= this.maxPerDay) {
      return { allowed: false, reason: 'daily_limit', retryAfterMs: null };
    }

    // Clean up minute window
    this.minuteWindow = this.minuteWindow.filter(t => now - t < 60000);

    if (this.minuteWindow.length >= this.maxPerMinute) {
      const oldest = this.minuteWindow[0];
      const retryAfterMs = 60000 - (now - oldest) + 100;
      return { allowed: false, reason: 'minute_limit', retryAfterMs };
    }

    return { allowed: true };
  },

  recordRequest() {
    this.minuteWindow.push(Date.now());
    this.dailyCount++;
  },

  getStatus() {
    const now = Date.now();
    this.minuteWindow = this.minuteWindow.filter(t => now - t < 60000);
    return {
      minuteUsed: this.minuteWindow.length,
      minuteRemaining: Math.max(0, this.maxPerMinute - this.minuteWindow.length),
      dailyUsed: this.dailyCount,
      dailyRemaining: Math.max(0, this.maxPerDay - this.dailyCount),
    };
  },
};

function getApiKey() {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error('ALPHA_VANTAGE_API_KEY environment variable is required');
  return key;
}

/**
 * Convert Yahoo Finance .SR symbol to Alpha Vantage .SAU format.
 * e.g. '2222.SR' -> '2222.SAU'
 */
function toAlphaVantageSymbol(yahooSymbol) {
  return yahooSymbol.replace(/\.SR$/, '.SAU');
}

/**
 * Make an HTTPS GET request and return parsed JSON.
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Alpha Vantage response: ${data.slice(0, 200)}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Rate-limited fetch with automatic wait on minute-limit hits.
 */
async function rateLimitedFetch(url) {
  const check = rateLimiter.canRequest();
  if (!check.allowed) {
    if (check.reason === 'daily_limit') {
      throw new Error('Alpha Vantage daily request limit (25) reached');
    }
    // Wait for minute window to clear
    console.log(`  Alpha Vantage rate limit: waiting ${Math.ceil(check.retryAfterMs / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, check.retryAfterMs));
  }

  rateLimiter.recordRequest();
  const data = await fetchJson(url);

  // Handle API-level rate limit response
  if (data['Note'] && data['Note'].includes('call frequency')) {
    console.warn(`Alpha Vantage rate limit hit, waiting 60s...`);
    await new Promise(resolve => setTimeout(resolve, 60000));
    rateLimiter.recordRequest();
    return fetchJson(url);
  }

  return data;
}

/**
 * Fetch historical daily OHLCV data from Alpha Vantage.
 * @param {string} symbol - Yahoo-style symbol (e.g. '2222.SR')
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD (optional)
 * @returns {Array} Array of { date, open, high, low, close, adjClose, volume }
 */
async function fetchHistoricalData(symbol, startDate, endDate) {
  const apiKey = getApiKey();
  const avSymbol = toAlphaVantageSymbol(symbol);
  const url = `${API_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${avSymbol}&outputsize=full&apikey=${apiKey}`;

  try {
    const data = await rateLimitedFetch(url);

    if (data['Error Message']) {
      console.warn(`Alpha Vantage error for ${symbol}: ${data['Error Message']}`);
      return [];
    }

    const timeSeries = data['Time Series (Daily)'];
    if (!timeSeries) {
      console.warn(`No time series data from Alpha Vantage for ${symbol}`);
      return [];
    }

    const start = startDate ? new Date(startDate) : new Date('2000-01-01');
    const end = endDate ? new Date(endDate) : new Date();

    return Object.entries(timeSeries)
      .filter(([date]) => {
        const d = new Date(date);
        return d >= start && d <= end;
      })
      .map(([date, values]) => ({
        date,
        open: parseFloat(values['1. open']) || null,
        high: parseFloat(values['2. high']) || null,
        low: parseFloat(values['3. low']) || null,
        close: parseFloat(values['4. close']) || null,
        adjClose: parseFloat(values['5. adjusted close']) || null,
        volume: parseInt(values['6. volume'], 10) || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error(`Alpha Vantage historical fetch error for ${symbol}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch intraday OHLCV data from Alpha Vantage.
 * Only available via Alpha Vantage — Yahoo Finance does not provide intraday for Saudi stocks.
 * @param {string} symbol - Yahoo-style symbol (e.g. '2222.SR')
 * @param {string} [interval='60min'] - 1min, 5min, 15min, 30min, 60min
 * @returns {Array} Array of { timestamp, open, high, low, close, volume }
 */
async function fetchIntradayData(symbol, interval = '60min') {
  const apiKey = getApiKey();
  const avSymbol = toAlphaVantageSymbol(symbol);
  const url = `${API_BASE}?function=TIME_SERIES_INTRADAY&symbol=${avSymbol}&interval=${interval}&outputsize=full&apikey=${apiKey}`;

  try {
    const data = await rateLimitedFetch(url);

    if (data['Error Message']) {
      console.warn(`Alpha Vantage intraday error for ${symbol}: ${data['Error Message']}`);
      return [];
    }

    const seriesKey = `Time Series (${interval})`;
    const timeSeries = data[seriesKey];
    if (!timeSeries) {
      console.warn(`No intraday data from Alpha Vantage for ${symbol}`);
      return [];
    }

    return Object.entries(timeSeries)
      .map(([timestamp, values]) => ({
        timestamp,
        open: parseFloat(values['1. open']) || null,
        high: parseFloat(values['2. high']) || null,
        low: parseFloat(values['3. low']) || null,
        close: parseFloat(values['4. close']) || null,
        volume: parseInt(values['5. volume'], 10) || 0,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch (err) {
    console.error(`Alpha Vantage intraday fetch error for ${symbol}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch fundamental/quote data from Alpha Vantage OVERVIEW endpoint.
 * Returns market cap, P/E, EPS, dividend yield.
 */
async function fetchQuoteSummary(symbol) {
  const fallback = { marketCap: null, peRatio: null, eps: null, dividendYield: null, currency: 'SAR' };
  const apiKey = getApiKey();
  const avSymbol = toAlphaVantageSymbol(symbol);
  const url = `${API_BASE}?function=OVERVIEW&symbol=${avSymbol}&apikey=${apiKey}`;

  try {
    const data = await rateLimitedFetch(url);

    if (data['Error Message'] || !data.Symbol) {
      return fallback;
    }

    return {
      marketCap: data.MarketCapitalization ? parseFloat(data.MarketCapitalization) : null,
      peRatio: data.TrailingPE ? parseFloat(data.TrailingPE) : null,
      eps: data.EPS ? parseFloat(data.EPS) : null,
      dividendYield: data.DividendYield ? parseFloat(data.DividendYield) : null,
      currency: data.Currency || 'SAR',
      // Additional fields unique to Alpha Vantage OVERVIEW
      bookValue: data.BookValue ? parseFloat(data.BookValue) : null,
      profitMargin: data.ProfitMargin ? parseFloat(data.ProfitMargin) : null,
      revenuePerShare: data.RevenuePerShareTTM ? parseFloat(data.RevenuePerShareTTM) : null,
      returnOnEquity: data.ReturnOnEquityTTM ? parseFloat(data.ReturnOnEquityTTM) : null,
      returnOnAssets: data.ReturnOnAssetsTTM ? parseFloat(data.ReturnOnAssetsTTM) : null,
      beta: data.Beta ? parseFloat(data.Beta) : null,
      fiftyTwoWeekHigh: data['52WeekHigh'] ? parseFloat(data['52WeekHigh']) : null,
      fiftyTwoWeekLow: data['52WeekLow'] ? parseFloat(data['52WeekLow']) : null,
      analystTargetPrice: data.AnalystTargetPrice ? parseFloat(data.AnalystTargetPrice) : null,
    };
  } catch (err) {
    console.error(`Alpha Vantage overview fetch error for ${symbol}: ${err.message}`);
    return fallback;
  }
}

/**
 * Fetch earnings data from Alpha Vantage EARNINGS endpoint.
 * Provides quarterly and annual EPS (reported vs estimated).
 * @param {string} symbol - Yahoo-style symbol (e.g. '2222.SR')
 * @returns {{ quarterly: Array, annual: Array }}
 */
async function fetchEarnings(symbol) {
  const apiKey = getApiKey();
  const avSymbol = toAlphaVantageSymbol(symbol);
  const url = `${API_BASE}?function=EARNINGS&symbol=${avSymbol}&apikey=${apiKey}`;

  try {
    const data = await rateLimitedFetch(url);

    if (data['Error Message'] || !data.quarterlyEarnings) {
      return { quarterly: [], annual: [] };
    }

    const quarterly = (data.quarterlyEarnings || []).map(e => ({
      fiscalDateEnding: e.fiscalDateEnding,
      reportedDate: e.reportedDate,
      reportedEPS: e.reportedEPS !== 'None' ? parseFloat(e.reportedEPS) : null,
      estimatedEPS: e.estimatedEPS !== 'None' ? parseFloat(e.estimatedEPS) : null,
      surprise: e.surprise !== 'None' ? parseFloat(e.surprise) : null,
      surprisePercentage: e.surprisePercentage !== 'None' ? parseFloat(e.surprisePercentage) : null,
    }));

    const annual = (data.annualEarnings || []).map(e => ({
      fiscalDateEnding: e.fiscalDateEnding,
      reportedEPS: e.reportedEPS !== 'None' ? parseFloat(e.reportedEPS) : null,
    }));

    return { quarterly, annual };
  } catch (err) {
    console.error(`Alpha Vantage earnings fetch error for ${symbol}: ${err.message}`);
    return { quarterly: [], annual: [] };
  }
}

/**
 * Check if Alpha Vantage is configured (API key present).
 */
function isAvailable() {
  return !!process.env.ALPHA_VANTAGE_API_KEY;
}

/**
 * Get current rate limit status.
 */
function getRateLimitStatus() {
  return rateLimiter.getStatus();
}

module.exports = {
  fetchHistoricalData,
  fetchIntradayData,
  fetchQuoteSummary,
  fetchEarnings,
  isAvailable,
  toAlphaVantageSymbol,
  getRateLimitStatus,
};
