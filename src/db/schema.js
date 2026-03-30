const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.TASI_DB_PATH || path.join(__dirname, '..', '..', 'data', 'tasi.db');

function getDb() {
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initSchema(db) {
  db.exec(`
    -- Stock master data
    CREATE TABLE IF NOT EXISTS stocks (
      symbol        TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      sector        TEXT NOT NULL,
      market_cap    REAL,
      pe_ratio      REAL,
      eps           REAL,
      dividend_yield REAL,
      currency      TEXT DEFAULT 'SAR',
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    -- Daily OHLCV price data (time-series)
    CREATE TABLE IF NOT EXISTS daily_prices (
      symbol  TEXT NOT NULL,
      date    TEXT NOT NULL,  -- YYYY-MM-DD
      open    REAL,
      high    REAL,
      low     REAL,
      close   REAL,
      adj_close REAL,
      volume  INTEGER,
      PRIMARY KEY (symbol, date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    -- Index on date for range queries
    CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON daily_prices(date);

    -- Ingestion run log
    CREATE TABLE IF NOT EXISTS ingestion_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status      TEXT NOT NULL DEFAULT 'running', -- running, success, failed
      stocks_processed INTEGER DEFAULT 0,
      rows_inserted    INTEGER DEFAULT 0,
      error_message    TEXT
    );

    -- Technical indicators (computed from daily_prices)
    CREATE TABLE IF NOT EXISTS technical_indicators (
      symbol      TEXT NOT NULL,
      date        TEXT NOT NULL,
      sma_20      REAL,
      sma_50      REAL,
      sma_200     REAL,
      ema_20      REAL,
      ema_50      REAL,
      ema_200     REAL,
      rsi_14      REAL,
      macd_line   REAL,
      macd_signal REAL,
      macd_hist   REAL,
      bb_upper    REAL,
      bb_middle   REAL,
      bb_lower    REAL,
      avg_volume_20 REAL,
      volume_ratio  REAL,
      PRIMARY KEY (symbol, date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_tech_ind_date ON technical_indicators(date);

    -- Stock analysis scores
    CREATE TABLE IF NOT EXISTS stock_scores (
      symbol          TEXT NOT NULL,
      date            TEXT NOT NULL,
      technical_score REAL,
      fundamental_score REAL,
      ai_score        REAL,
      overall_score   REAL,
      risk_level      TEXT,  -- low, medium, high
      volatility      REAL,
      beta            REAL,
      ai_reasoning    TEXT,
      entry_signal    TEXT,  -- strong_buy, buy, hold, sell, strong_sell
      entry_reasoning TEXT,
      PRIMARY KEY (symbol, date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_scores_date ON stock_scores(date);
    CREATE INDEX IF NOT EXISTS idx_stock_scores_overall ON stock_scores(overall_score DESC);

    -- Sector analysis
    CREATE TABLE IF NOT EXISTS sector_analysis (
      sector          TEXT NOT NULL,
      date            TEXT NOT NULL,
      avg_score       REAL,
      top_stock       TEXT,
      trend           TEXT,  -- bullish, bearish, neutral
      avg_rsi         REAL,
      avg_pe          REAL,
      stock_count     INTEGER,
      summary         TEXT,
      PRIMARY KEY (sector, date)
    );

    -- Corporate actions (dividends, splits, rights issues) from Tadawul
    CREATE TABLE IF NOT EXISTS corporate_actions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol      TEXT NOT NULL,
      type        TEXT NOT NULL,  -- dividend, stock_split, rights_issue, bonus_shares, merger
      ex_date     TEXT,           -- YYYY-MM-DD
      record_date TEXT,
      amount      REAL,
      currency    TEXT DEFAULT 'SAR',
      description TEXT,
      source      TEXT DEFAULT 'tadawul',
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol),
      UNIQUE(symbol, type, ex_date)
    );

    CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol ON corporate_actions(symbol);
    CREATE INDEX IF NOT EXISTS idx_corporate_actions_date ON corporate_actions(ex_date);

    -- Company announcements / news from Tadawul
    CREATE TABLE IF NOT EXISTS announcements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol      TEXT NOT NULL,
      date        TEXT NOT NULL,
      title       TEXT NOT NULL,
      source      TEXT DEFAULT 'tadawul',
      url         TEXT,
      category    TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol),
      UNIQUE(symbol, date, title)
    );

    CREATE INDEX IF NOT EXISTS idx_announcements_symbol ON announcements(symbol);
    CREATE INDEX IF NOT EXISTS idx_announcements_date ON announcements(date);

    -- Data source tracking for observability
    CREATE TABLE IF NOT EXISTS data_source_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol      TEXT NOT NULL,
      data_type   TEXT NOT NULL,  -- historical, fundamentals, corporate_actions, announcements
      source      TEXT NOT NULL,  -- yahoo, alpha_vantage, tadawul
      success     INTEGER NOT NULL DEFAULT 1,
      record_count INTEGER DEFAULT 0,
      fetched_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_source_log_symbol ON data_source_log(symbol);
    CREATE INDEX IF NOT EXISTS idx_source_log_fetched ON data_source_log(fetched_at);

    -- Quarterly financial reports (income statement, balance sheet, cash flow)
    CREATE TABLE IF NOT EXISTS financial_reports (
      symbol          TEXT NOT NULL,
      period_end      TEXT NOT NULL,  -- YYYY-MM-DD end of fiscal quarter
      period_type     TEXT NOT NULL DEFAULT 'quarterly',  -- quarterly, annual
      -- Income statement
      total_revenue       REAL,
      cost_of_revenue     REAL,
      gross_profit        REAL,
      operating_income    REAL,
      net_income          REAL,
      ebitda              REAL,
      -- Per-share
      eps_basic           REAL,
      eps_diluted         REAL,
      -- Margins (stored as decimals, e.g. 0.25 = 25%)
      gross_margin        REAL,
      operating_margin    REAL,
      net_margin          REAL,
      -- Balance sheet
      total_assets        REAL,
      total_liabilities   REAL,
      total_equity        REAL,
      total_debt          REAL,
      total_cash          REAL,
      current_assets      REAL,
      current_liabilities REAL,
      -- Cash flow
      operating_cash_flow REAL,
      capital_expenditure REAL,
      free_cash_flow      REAL,
      -- Valuation context
      shares_outstanding  REAL,
      book_value_per_share REAL,
      -- Metadata
      currency        TEXT DEFAULT 'SAR',
      source          TEXT DEFAULT 'yahoo',
      fetched_at      TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (symbol, period_end, period_type),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_financial_reports_symbol ON financial_reports(symbol);
    CREATE INDEX IF NOT EXISTS idx_financial_reports_period ON financial_reports(period_end);

    -- Model portfolio snapshots (one row per rebalance)
    CREATE TABLE IF NOT EXISTS model_portfolios (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      rebalance_date  TEXT NOT NULL,           -- YYYY-MM-DD
      version         INTEGER NOT NULL DEFAULT 1,
      status          TEXT NOT NULL DEFAULT 'active',  -- active, superseded
      strategy        TEXT NOT NULL DEFAULT 'ai_composite',
      stock_count     INTEGER NOT NULL,
      diversification_score REAL,
      ai_reasoning    TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(rebalance_date, version)
    );

    CREATE INDEX IF NOT EXISTS idx_model_portfolios_date ON model_portfolios(rebalance_date);

    -- Individual holdings within a model portfolio snapshot
    CREATE TABLE IF NOT EXISTS portfolio_holdings (
      portfolio_id    INTEGER NOT NULL,
      symbol          TEXT NOT NULL,
      weight          REAL NOT NULL,          -- 0.0 to 1.0
      shares_notional REAL,                   -- notional shares for 100K SAR portfolio
      entry_price     REAL,
      score_at_entry  REAL,
      sector          TEXT,
      rationale       TEXT,
      PRIMARY KEY (portfolio_id, symbol),
      FOREIGN KEY (portfolio_id) REFERENCES model_portfolios(id),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    -- Track changes between rebalances
    CREATE TABLE IF NOT EXISTS portfolio_rebalances (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id    INTEGER NOT NULL,
      prev_portfolio_id INTEGER,
      rebalance_date  TEXT NOT NULL,
      additions       TEXT,   -- JSON array of symbols added
      removals        TEXT,   -- JSON array of symbols removed
      weight_changes  TEXT,   -- JSON array of {symbol, old_weight, new_weight}
      turnover        REAL,   -- total weight change (0.0 to 2.0)
      reasoning       TEXT,
      FOREIGN KEY (portfolio_id) REFERENCES model_portfolios(id)
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_rebalances_date ON portfolio_rebalances(rebalance_date);

    -- Intraday price data (Alpha Vantage exclusive)
    CREATE TABLE IF NOT EXISTS intraday_prices (
      symbol      TEXT NOT NULL,
      timestamp   TEXT NOT NULL,  -- YYYY-MM-DD HH:MM:SS
      interval    TEXT NOT NULL DEFAULT '60min',  -- 1min, 5min, 15min, 30min, 60min
      open        REAL,
      high        REAL,
      low         REAL,
      close       REAL,
      volume      INTEGER,
      source      TEXT DEFAULT 'alpha_vantage',
      PRIMARY KEY (symbol, timestamp, interval),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_intraday_symbol_ts ON intraday_prices(symbol, timestamp);

    -- Earnings data (Alpha Vantage exclusive — quarterly EPS with surprise)
    CREATE TABLE IF NOT EXISTS earnings (
      symbol              TEXT NOT NULL,
      fiscal_date_ending  TEXT NOT NULL,
      period_type         TEXT NOT NULL DEFAULT 'quarterly',  -- quarterly, annual
      reported_date       TEXT,
      reported_eps        REAL,
      estimated_eps       REAL,
      surprise            REAL,
      surprise_percentage REAL,
      source              TEXT DEFAULT 'alpha_vantage',
      fetched_at          TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (symbol, fiscal_date_ending, period_type),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_earnings_symbol ON earnings(symbol);
    CREATE INDEX IF NOT EXISTS idx_earnings_date ON earnings(fiscal_date_ending);

    -- Daily portfolio performance tracking
    CREATE TABLE IF NOT EXISTS portfolio_performance (
      portfolio_id    INTEGER NOT NULL,
      date            TEXT NOT NULL,
      portfolio_value REAL NOT NULL,           -- normalized to base 10000
      daily_return    REAL,
      cumulative_return REAL,
      tasi_value      REAL,                    -- TASI index value (normalized)
      tasi_return     REAL,
      excess_return   REAL,                    -- portfolio vs TASI
      PRIMARY KEY (portfolio_id, date),
      FOREIGN KEY (portfolio_id) REFERENCES model_portfolios(id)
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_perf_date ON portfolio_performance(date);
  `);
}

/**
 * PostgreSQL-equivalent schema (for documentation / migration).
 * The SQLite schema above mirrors this structure.
 */
const POSTGRES_SCHEMA = `
-- PostgreSQL Schema for TASI Data Pipeline
-- Migrate from SQLite by running this DDL then importing data.

CREATE TABLE IF NOT EXISTS stocks (
  symbol        VARCHAR(20) PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  sector        VARCHAR(100) NOT NULL,
  market_cap    NUMERIC,
  pe_ratio      NUMERIC,
  eps           NUMERIC,
  dividend_yield NUMERIC,
  currency      VARCHAR(10) DEFAULT 'SAR',
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_prices (
  symbol    VARCHAR(20) NOT NULL REFERENCES stocks(symbol),
  date      DATE NOT NULL,
  open      NUMERIC,
  high      NUMERIC,
  low       NUMERIC,
  close     NUMERIC,
  adj_close NUMERIC,
  volume    BIGINT,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON daily_prices(date);
CREATE INDEX IF NOT EXISTS idx_daily_prices_symbol_date ON daily_prices(symbol, date DESC);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id              SERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'running',
  stocks_processed INTEGER DEFAULT 0,
  rows_inserted    INTEGER DEFAULT 0,
  error_message    TEXT
);
`;

module.exports = { getDb, initSchema, POSTGRES_SCHEMA, DB_PATH };
