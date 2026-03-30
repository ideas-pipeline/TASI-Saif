const { getDb } = require('./schema');

function initNotificationSchema(db) {
  db.exec(`
    -- Notification preferences per user
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id               TEXT PRIMARY KEY,
      email_enabled         INTEGER NOT NULL DEFAULT 1,
      telegram_enabled      INTEGER NOT NULL DEFAULT 0,
      whatsapp_enabled      INTEGER NOT NULL DEFAULT 0,
      telegram_chat_id      TEXT,                            -- Telegram chat ID (set via bot /start)
      whatsapp_phone        TEXT,                            -- WhatsApp number in E.164 format
      daily_summary         INTEGER NOT NULL DEFAULT 1,
      instant_alerts        INTEGER NOT NULL DEFAULT 1,
      alert_signals         TEXT DEFAULT 'strong_buy,buy',  -- comma-separated signals to alert on
      alert_sectors         TEXT DEFAULT '',                 -- comma-separated sectors (empty = all)
      alert_min_score       REAL DEFAULT 7.0,               -- minimum score to trigger alert
      preferred_language    TEXT DEFAULT 'ar',               -- ar or en
      quiet_hours_start     TEXT DEFAULT '22:00',            -- no alerts after this (AST)
      quiet_hours_end       TEXT DEFAULT '07:00',            -- no alerts before this (AST)
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Notification log for tracking sent notifications across all channels
    CREATE TABLE IF NOT EXISTS notification_log (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      type            TEXT NOT NULL,       -- instant_alert, daily_summary
      channel         TEXT NOT NULL DEFAULT 'email',  -- email, telegram, whatsapp
      subject         TEXT NOT NULL,
      recipient       TEXT NOT NULL,       -- email address, chat ID, or phone number
      status          TEXT NOT NULL DEFAULT 'pending',  -- pending, sent, failed
      error_message   TEXT,
      metadata        TEXT,               -- JSON: stock symbols, scores, etc.
      created_at      TEXT DEFAULT (datetime('now')),
      sent_at         TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_notif_log_user ON notification_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_log_type ON notification_log(type);
    CREATE INDEX IF NOT EXISTS idx_notif_log_created ON notification_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_notif_log_channel ON notification_log(channel);
  `);

  // Migrate existing tables: add new columns if they don't exist
  const cols = db.pragma('table_info(notification_preferences)').map(c => c.name);
  if (!cols.includes('telegram_enabled')) {
    db.exec(`ALTER TABLE notification_preferences ADD COLUMN telegram_enabled INTEGER NOT NULL DEFAULT 0`);
  }
  if (!cols.includes('whatsapp_enabled')) {
    db.exec(`ALTER TABLE notification_preferences ADD COLUMN whatsapp_enabled INTEGER NOT NULL DEFAULT 0`);
  }
  if (!cols.includes('telegram_chat_id')) {
    db.exec(`ALTER TABLE notification_preferences ADD COLUMN telegram_chat_id TEXT`);
  }
  if (!cols.includes('whatsapp_phone')) {
    db.exec(`ALTER TABLE notification_preferences ADD COLUMN whatsapp_phone TEXT`);
  }

  // Migrate notification_log: add channel + rename recipient_email -> recipient
  const logCols = db.pragma('table_info(notification_log)').map(c => c.name);
  if (!logCols.includes('channel')) {
    db.exec(`ALTER TABLE notification_log ADD COLUMN channel TEXT NOT NULL DEFAULT 'email'`);
  }
  if (!logCols.includes('recipient') && logCols.includes('recipient_email')) {
    db.exec(`ALTER TABLE notification_log ADD COLUMN recipient TEXT NOT NULL DEFAULT ''`);
  }
}

module.exports = { initNotificationSchema };
