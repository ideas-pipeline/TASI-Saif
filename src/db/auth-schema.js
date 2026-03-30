const { getDb } = require('./schema');

function initAuthSchema(db) {
  db.exec(`
    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name          TEXT,
      locale        TEXT DEFAULT 'ar',
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- Sessions (JWT refresh tokens)
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      token       TEXT NOT NULL UNIQUE,
      expires_at  TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- Subscriptions
    CREATE TABLE IF NOT EXISTS subscriptions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL UNIQUE,
      tier            TEXT NOT NULL DEFAULT 'free',  -- free, basic, advanced, enterprise
      billing_cycle   TEXT DEFAULT 'monthly',        -- monthly, annual
      status          TEXT NOT NULL DEFAULT 'active', -- active, trial, cancelled, expired
      trial_ends_at   TEXT,
      current_period_start TEXT,
      current_period_end   TEXT,
      stripe_customer_id   TEXT,
      stripe_subscription_id TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);
  `);
}

const TIERS = {
  free: {
    name: 'Free',
    nameAr: 'مجاني',
    priceMonthly: 0,
    priceAnnual: 0,
    features: ['delayed_recommendations', 'basic_screener', 'limited_watchlist_5'],
  },
  basic: {
    name: 'Basic',
    nameAr: 'أساسي',
    priceMonthly: 9900,   // 99 SAR in halalas
    priceAnnual: 95040,   // 99 * 12 * 0.80 = 950.40 SAR
    trialDays: 7,
    features: ['realtime_recommendations', 'full_screener', 'watchlist_20', 'email_alerts_daily'],
  },
  advanced: {
    name: 'Advanced',
    nameAr: 'متقدم',
    priceMonthly: 19900,  // 199 SAR
    priceAnnual: 191040,  // 199 * 12 * 0.80 = 1910.40 SAR
    features: ['realtime_recommendations', 'full_screener', 'unlimited_watchlist', 'email_alerts_realtime', 'ai_analysis', 'sector_reports'],
  },
  enterprise: {
    name: 'Enterprise',
    nameAr: 'مؤسسات',
    priceMonthly: 49900,  // 499 SAR
    priceAnnual: 479040,  // 499 * 12 * 0.80 = 4790.40 SAR
    features: ['all_advanced', 'api_access', 'custom_alerts', 'portfolio_tracking', 'priority_support'],
  },
};

module.exports = { initAuthSchema, TIERS };
