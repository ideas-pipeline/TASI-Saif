const https = require('https');

/**
 * Tadawul (Saudi Exchange) data fetcher.
 * Uses Tadawul's public JSON endpoints for:
 * - Corporate actions (dividends, splits, rights issues)
 * - Company announcements / news
 * - Real-time market summary
 *
 * No API key required — these are public endpoints.
 */

const TADAWUL_BASE = 'https://www.saudiexchange.sa';

/**
 * Convert Yahoo Finance symbol to Tadawul company code.
 * e.g. '2222.SR' -> '2222'
 */
function toTadawulCode(yahooSymbol) {
  return yahooSymbol.replace(/\.SR$/, '');
}

/**
 * Make an HTTPS GET request with appropriate headers.
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TASI-Platform/2.0',
        'Accept-Language': 'en',
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Tadawul response: ${data.slice(0, 200)}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Fetch corporate actions (dividends, splits) for a company from Tadawul.
 * @param {string} symbol - Yahoo-style symbol (e.g. '2222.SR')
 * @returns {Array} Array of { type, exDate, recordDate, amount, currency, description }
 */
async function fetchCorporateActions(symbol) {
  const code = toTadawulCode(symbol);
  const url = `${TADAWUL_BASE}/wps/portal/tadawul/market-participants/issuers/issuers-directory/company-details/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8zi_Tx8nD0MLIy83V1DjA0czVx8nYP8PI0MDAz0I4EKDFCAo4FTkJGTsYGBu7-RfhTp-pFNIk4_HgVR-EDuAI4GhBQm5oUGhEQaAgAtDuZb/dz/d5/L2dBISEvZ0FBIS9nQSEh/?companySymbol=${code}`;

  try {
    const data = await fetchJson(url);

    if (!data || !Array.isArray(data.corporateActions)) {
      return [];
    }

    return data.corporateActions.map(action => ({
      type: normalizeCorporateActionType(action.type || action.actionType),
      exDate: action.exDate || action.announcementDate || null,
      recordDate: action.recordDate || null,
      amount: action.amount ? parseFloat(action.amount) : null,
      currency: 'SAR',
      description: action.description || action.subject || '',
    }));
  } catch (err) {
    console.warn(`Tadawul corporate actions fetch failed for ${symbol}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch company announcements/news from Tadawul.
 * @param {string} symbol - Yahoo-style symbol (e.g. '2222.SR')
 * @param {number} [limit=20] - Max announcements to return
 * @returns {Array} Array of { date, title, source, url, category }
 */
async function fetchAnnouncements(symbol, limit = 20) {
  const code = toTadawulCode(symbol);
  const url = `${TADAWUL_BASE}/wps/portal/tadawul/market-participants/issuers/issuers-directory/company-news/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8zi_Tx8nD0MLIy83QNDnA0cLQ0tTIODLQ0NjAz0I4EKDFCAo4FTkJGTsYGBu7-RfhTp-pFNIk4_HgVR-EDuAI4GhBQm5oUGhEQaAgAtDuZb/dz/d5/L2dBISEvZ0FBIS9nQSEh/?companySymbol=${code}&limit=${limit}`;

  try {
    const data = await fetchJson(url);

    if (!data || !Array.isArray(data.announcements || data.news)) {
      return [];
    }

    const items = data.announcements || data.news || [];
    return items.slice(0, limit).map(item => ({
      date: item.date || item.publishDate || item.announcementDate || null,
      title: item.title || item.subject || '',
      source: 'Tadawul',
      url: item.url || item.link || null,
      category: item.category || item.type || 'announcement',
    }));
  } catch (err) {
    console.warn(`Tadawul announcements fetch failed for ${symbol}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch the current TASI market summary (index value, change, volume).
 * @returns {Object|null} { indexValue, change, changePercent, volume, date }
 */
async function fetchMarketSummary() {
  const url = `${TADAWUL_BASE}/wps/portal/tadawul/markets/equities/indices/today/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8zi_Tx8nD0MLIy83QNDnA0cLQ0tTIODLQ0NjAz0I4EKDFCAo4FTkJGTsYGBu7-RfhTp-pFNIk4_HgVR-EDuAI4GhBQm5oUGhEQaAgAtDuZb/dz/d5/L2dBISEvZ0FBIS9nQSEh/`;

  try {
    const data = await fetchJson(url);

    if (!data || !data.indexValue) {
      return null;
    }

    return {
      indexValue: parseFloat(data.indexValue) || null,
      change: parseFloat(data.change) || null,
      changePercent: parseFloat(data.changePercent) || null,
      volume: parseInt(data.volume, 10) || null,
      date: data.date || new Date().toISOString().split('T')[0],
    };
  } catch (err) {
    console.warn(`Tadawul market summary fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Normalize corporate action type strings.
 */
function normalizeCorporateActionType(type) {
  if (!type) return 'unknown';
  const lower = type.toLowerCase();
  if (lower.includes('dividend') || lower.includes('cash')) return 'dividend';
  if (lower.includes('split')) return 'stock_split';
  if (lower.includes('right')) return 'rights_issue';
  if (lower.includes('bonus')) return 'bonus_shares';
  if (lower.includes('merger') || lower.includes('acquisition')) return 'merger';
  return lower.replace(/\s+/g, '_');
}

/**
 * Check if Tadawul endpoints are reachable (basic connectivity test).
 */
async function isAvailable() {
  try {
    const summary = await fetchMarketSummary();
    return summary !== null;
  } catch {
    return false;
  }
}

module.exports = {
  fetchCorporateActions,
  fetchAnnouncements,
  fetchMarketSummary,
  isAvailable,
  toTadawulCode,
};
