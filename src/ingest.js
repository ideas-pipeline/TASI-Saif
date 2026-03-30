const { getDb, initSchema } = require('./db/schema');
const { TASI_TICKERS } = require('./config/tickers');
const sources = require('./fetcher/sources');

/**
 * Main ingestion pipeline.
 * Uses multi-source fetching: Yahoo Finance (primary) + Alpha Vantage (fallback + enrichment)
 * + Tadawul (corporate actions, announcements).
 *
 * Alpha Vantage provides exclusive data not available from Yahoo Finance:
 * - Intraday OHLCV (hourly price bars for Saudi stocks)
 * - Earnings with surprise data (reported vs estimated EPS)
 * - Enriched fundamentals (ROE, ROA, analyst targets, book value)
 *
 * @param {Object} options
 * @param {string} options.startDate - Historical start date (YYYY-MM-DD)
 * @param {string} [options.endDate] - End date (defaults to today)
 * @param {string[]} [options.symbols] - Subset of symbols to fetch (defaults to all)
 * @param {boolean} [options.skipFundamentals] - Skip quote summary fetch
 * @param {boolean} [options.skipCorporateActions] - Skip corporate actions fetch
 * @param {boolean} [options.skipAnnouncements] - Skip announcements fetch
 * @param {boolean} [options.skipIntraday] - Skip intraday data fetch (Alpha Vantage)
 * @param {boolean} [options.skipEarnings] - Skip earnings data fetch (Alpha Vantage)
 * @param {string} [options.intradayInterval='60min'] - Intraday interval (1min, 5min, 15min, 30min, 60min)
 */
async function ingest({ startDate, endDate, symbols, skipFundamentals = false, skipCorporateActions = false, skipAnnouncements = false, skipIntraday = false, skipEarnings = false, intradayInterval = '60min' } = {}) {
  const db = getDb();
  initSchema(db);

  const tickers = symbols
    ? TASI_TICKERS.filter(t => symbols.includes(t.symbol))
    : TASI_TICKERS;

  // Log data source status
  const sourceStatus = sources.getSourceStatus();
  console.log('Data sources:');
  console.log(`  Yahoo Finance: enabled (primary)`);
  console.log(`  Alpha Vantage: ${sourceStatus.alphaVantage ? 'enabled (fallback + enrichment)' : 'disabled (set ALPHA_VANTAGE_API_KEY to enable)'}`);
  if (sourceStatus.alphaVantage && sourceStatus.alphaVantageRateLimit) {
    const rl = sourceStatus.alphaVantageRateLimit;
    console.log(`    Rate limit: ${rl.dailyRemaining}/${rl.dailyRemaining + rl.dailyUsed} daily requests remaining`);
  }
  console.log(`  Tadawul: enabled (corporate actions, news)`);
  if (sourceStatus.alphaVantage) {
    console.log(`  Intraday data: ${skipIntraday ? 'skipped' : 'enabled (Alpha Vantage, ' + intradayInterval + ')'}`);
    console.log(`  Earnings data: ${skipEarnings ? 'skipped' : 'enabled (Alpha Vantage)'}`);
  }
  console.log(`\nStarting ingestion for ${tickers.length} stocks from ${startDate} to ${endDate || 'today'}`);

  // Create ingestion run record
  const runInsert = db.prepare(
    'INSERT INTO ingestion_runs (status) VALUES (?)'
  );
  const { lastInsertRowid: runId } = runInsert.run('running');

  const upsertStock = db.prepare(`
    INSERT INTO stocks (symbol, name, sector, market_cap, pe_ratio, eps, dividend_yield, currency, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      sector = excluded.sector,
      market_cap = excluded.market_cap,
      pe_ratio = excluded.pe_ratio,
      eps = excluded.eps,
      dividend_yield = excluded.dividend_yield,
      currency = excluded.currency,
      updated_at = datetime('now')
  `);

  const upsertPrice = db.prepare(`
    INSERT INTO daily_prices (symbol, date, open, high, low, close, adj_close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, date) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      adj_close = excluded.adj_close,
      volume = excluded.volume
  `);

  const insertManyPrices = db.transaction((rows) => {
    for (const row of rows) {
      upsertPrice.run(
        row.symbol, row.date, row.open, row.high, row.low,
        row.close, row.adjClose, row.volume
      );
    }
  });

  const upsertCorporateAction = db.prepare(`
    INSERT INTO corporate_actions (symbol, type, ex_date, record_date, amount, currency, description, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, type, ex_date) DO UPDATE SET
      record_date = excluded.record_date,
      amount = excluded.amount,
      description = excluded.description
  `);

  const upsertAnnouncement = db.prepare(`
    INSERT INTO announcements (symbol, date, title, source, url, category)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, date, title) DO NOTHING
  `);

  const upsertIntradayPrice = db.prepare(`
    INSERT INTO intraday_prices (symbol, timestamp, interval, open, high, low, close, volume, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'alpha_vantage')
    ON CONFLICT(symbol, timestamp, interval) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `);

  const insertManyIntraday = db.transaction((rows, interval) => {
    for (const row of rows) {
      upsertIntradayPrice.run(
        row.symbol, row.timestamp, interval,
        row.open, row.high, row.low, row.close, row.volume
      );
    }
  });

  const upsertEarning = db.prepare(`
    INSERT INTO earnings (symbol, fiscal_date_ending, period_type, reported_date, reported_eps, estimated_eps, surprise, surprise_percentage, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'alpha_vantage')
    ON CONFLICT(symbol, fiscal_date_ending, period_type) DO UPDATE SET
      reported_date = excluded.reported_date,
      reported_eps = excluded.reported_eps,
      estimated_eps = excluded.estimated_eps,
      surprise = excluded.surprise,
      surprise_percentage = excluded.surprise_percentage
  `);

  const insertSourceLog = db.prepare(`
    INSERT INTO data_source_log (symbol, data_type, source, success, record_count)
    VALUES (?, ?, ?, ?, ?)
  `);

  let totalProcessed = 0;
  let totalRows = 0;
  let totalCorporateActions = 0;
  let totalAnnouncements = 0;
  let totalIntradayRows = 0;
  let totalEarningsRows = 0;
  const sourceUsage = { yahoo: 0, alpha_vantage: 0, tadawul: 0 };
  const errors = [];

  for (const ticker of tickers) {
    try {
      console.log(`[${totalProcessed + 1}/${tickers.length}] Fetching ${ticker.symbol} (${ticker.name})...`);

      // Fetch fundamentals via multi-source
      let fundamentals = { marketCap: null, peRatio: null, eps: null, dividendYield: null, currency: 'SAR' };
      if (!skipFundamentals) {
        const quoteResult = await sources.fetchQuoteSummary(ticker.symbol);
        fundamentals = quoteResult.data;
        if (quoteResult.source) {
          sourceUsage[quoteResult.source]++;
          insertSourceLog.run(ticker.symbol, 'fundamentals', quoteResult.source, 1, 1);
        }
      }

      // Upsert stock master data
      upsertStock.run(
        ticker.symbol, ticker.name, ticker.sector,
        fundamentals.marketCap, fundamentals.peRatio,
        fundamentals.eps, fundamentals.dividendYield,
        fundamentals.currency
      );

      // Fetch historical OHLCV via multi-source
      const histResult = await sources.fetchHistoricalData(ticker.symbol, startDate, endDate);

      if (histResult.data.length > 0) {
        const rows = histResult.data.map(h => ({ symbol: ticker.symbol, ...h }));
        insertManyPrices(rows);
        totalRows += rows.length;
        if (histResult.source) {
          sourceUsage[histResult.source]++;
          insertSourceLog.run(ticker.symbol, 'historical', histResult.source, 1, rows.length);
        }
        console.log(`  -> ${rows.length} price records (source: ${histResult.source || 'none'})`);
      } else {
        console.log(`  -> No price data available`);
        insertSourceLog.run(ticker.symbol, 'historical', 'none', 0, 0);
      }

      // Fetch corporate actions from Tadawul
      if (!skipCorporateActions) {
        const caResult = await sources.fetchCorporateActions(ticker.symbol);
        if (caResult.data.length > 0) {
          for (const action of caResult.data) {
            upsertCorporateAction.run(
              ticker.symbol, action.type, action.exDate, action.recordDate,
              action.amount, action.currency, action.description, caResult.source
            );
          }
          totalCorporateActions += caResult.data.length;
          insertSourceLog.run(ticker.symbol, 'corporate_actions', caResult.source, 1, caResult.data.length);
          console.log(`  -> ${caResult.data.length} corporate actions`);
        }
      }

      // Fetch announcements from Tadawul
      if (!skipAnnouncements) {
        const newsResult = await sources.fetchAnnouncements(ticker.symbol);
        if (newsResult.data.length > 0) {
          for (const item of newsResult.data) {
            upsertAnnouncement.run(
              ticker.symbol, item.date, item.title, newsResult.source,
              item.url, item.category
            );
          }
          totalAnnouncements += newsResult.data.length;
          insertSourceLog.run(ticker.symbol, 'announcements', newsResult.source, 1, newsResult.data.length);
          console.log(`  -> ${newsResult.data.length} announcements`);
        }
      }

      // Fetch intraday data from Alpha Vantage (exclusive)
      if (!skipIntraday && sourceStatus.alphaVantage) {
        const intradayResult = await sources.fetchIntradayData(ticker.symbol, intradayInterval);
        if (intradayResult.data.length > 0) {
          const rows = intradayResult.data.map(d => ({ symbol: ticker.symbol, ...d }));
          insertManyIntraday(rows, intradayInterval);
          totalIntradayRows += rows.length;
          sourceUsage.alpha_vantage++;
          insertSourceLog.run(ticker.symbol, 'intraday', intradayResult.source, 1, rows.length);
          console.log(`  -> ${rows.length} intraday bars (${intradayInterval}, source: alpha_vantage)`);
        }
      }

      // Fetch earnings data from Alpha Vantage (exclusive)
      if (!skipEarnings && sourceStatus.alphaVantage) {
        const earningsResult = await sources.fetchEarnings(ticker.symbol);
        if (earningsResult.data.quarterly.length > 0 || earningsResult.data.annual.length > 0) {
          let earningsCount = 0;
          for (const e of earningsResult.data.quarterly) {
            upsertEarning.run(
              ticker.symbol, e.fiscalDateEnding, 'quarterly',
              e.reportedDate, e.reportedEPS, e.estimatedEPS,
              e.surprise, e.surprisePercentage
            );
            earningsCount++;
          }
          for (const e of earningsResult.data.annual) {
            upsertEarning.run(
              ticker.symbol, e.fiscalDateEnding, 'annual',
              null, e.reportedEPS, null, null, null
            );
            earningsCount++;
          }
          totalEarningsRows += earningsCount;
          sourceUsage.alpha_vantage++;
          insertSourceLog.run(ticker.symbol, 'earnings', earningsResult.source, 1, earningsCount);
          console.log(`  -> ${earningsCount} earnings records (source: alpha_vantage)`);
        }
      }

      totalProcessed++;

      // Rate limiting: small delay between requests to be respectful
      await sleep(500);
    } catch (err) {
      const msg = `${ticker.symbol}: ${err.message}`;
      console.error(`  -> ERROR: ${msg}`);
      errors.push(msg);
      totalProcessed++;
    }
  }

  // Update ingestion run
  const status = errors.length === 0 ? 'success' : (errors.length < tickers.length ? 'success' : 'failed');
  db.prepare(`
    UPDATE ingestion_runs SET finished_at = datetime('now'), status = ?, stocks_processed = ?, rows_inserted = ?, error_message = ?
    WHERE id = ?
  `).run(status, totalProcessed, totalRows, errors.length > 0 ? errors.join('\n') : null, runId);

  console.log(`\nIngestion complete:`);
  console.log(`  Stocks processed: ${totalProcessed}`);
  console.log(`  Price records: ${totalRows}`);
  console.log(`  Intraday bars: ${totalIntradayRows}`);
  console.log(`  Earnings records: ${totalEarningsRows}`);
  console.log(`  Corporate actions: ${totalCorporateActions}`);
  console.log(`  Announcements: ${totalAnnouncements}`);
  console.log(`  Source usage: Yahoo=${sourceUsage.yahoo}, AlphaVantage=${sourceUsage.alpha_vantage}, Tadawul=${sourceUsage.tadawul}`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
  }

  db.close();
  return { totalProcessed, totalRows, totalIntradayRows, totalEarningsRows, totalCorporateActions, totalAnnouncements, sourceUsage, errors };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { ingest };
