const { v4: uuidv4 } = require('uuid');
const { getDb, initSchema } = require('../db/schema');
const { initAuthSchema, TIERS } = require('../db/auth-schema');
const { initNotificationSchema } = require('../db/notification-schema');
const { sendEmail } = require('./email-service');
const { sendTelegram } = require('./telegram-service');
const { sendWhatsApp } = require('./whatsapp-service');
const { instantAlertTemplate, dailySummaryTemplate } = require('./templates');
const { telegramInstantAlert, telegramDailySummary, whatsappInstantAlert, whatsappDailySummary } = require('./messaging-templates');
const { fetchMarketSummary } = require('../fetcher/sources');

/**
 * Get all users eligible for a specific notification type.
 * Respects subscription tiers and notification preferences.
 */
function getEligibleUsers(db, notificationType) {
  initAuthSchema(db);
  initNotificationSchema(db);

  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.locale,
           s.tier, s.status AS sub_status, s.trial_ends_at,
           np.email_enabled, np.telegram_enabled, np.whatsapp_enabled,
           np.telegram_chat_id, np.whatsapp_phone,
           np.daily_summary, np.instant_alerts,
           np.alert_signals, np.alert_sectors, np.alert_min_score,
           np.preferred_language, np.quiet_hours_start, np.quiet_hours_end
    FROM users u
    LEFT JOIN subscriptions s ON u.id = s.user_id
    LEFT JOIN notification_preferences np ON u.id = np.user_id
  `).all();

  return users.filter(user => {
    // Check if email notifications are enabled (default: yes)
    if (user.email_enabled === 0) return false;

    // Determine effective tier
    const tier = getEffectiveTierFromRow(user);

    // Check tier-based eligibility
    if (notificationType === 'instant_alert') {
      // Instant alerts: advanced and enterprise only
      const tierFeatures = TIERS[tier]?.features || [];
      if (!tierFeatures.includes('email_alerts_realtime') && !tierFeatures.includes('all_advanced')) {
        return false;
      }
      if (user.instant_alerts === 0) return false;
    }

    if (notificationType === 'daily_summary') {
      // Daily summary: basic and above
      const tierFeatures = TIERS[tier]?.features || [];
      const hasDailyEmail = tierFeatures.includes('email_alerts_daily') ||
        tierFeatures.includes('email_alerts_realtime') ||
        tierFeatures.includes('all_advanced');
      if (!hasDailyEmail) return false;
      if (user.daily_summary === 0) return false;
    }

    return true;
  });
}

function getEffectiveTierFromRow(user) {
  if (!user.tier) return 'free';
  if (user.sub_status === 'cancelled' || user.sub_status === 'expired') return 'free';
  if (user.sub_status === 'trial') {
    const now = new Date();
    const trialEnd = new Date(user.trial_ends_at);
    if (now > trialEnd) return 'free';
    return user.tier;
  }
  return user.tier;
}

/**
 * Filter stocks based on user preferences.
 */
function filterStocksForUser(stocks, user) {
  let filtered = stocks;

  // Filter by preferred signals
  if (user.alert_signals) {
    const signals = user.alert_signals.split(',').map(s => s.trim()).filter(Boolean);
    if (signals.length > 0) {
      filtered = filtered.filter(s => signals.includes(s.entry_signal));
    }
  }

  // Filter by preferred sectors
  if (user.alert_sectors) {
    const sectors = user.alert_sectors.split(',').map(s => s.trim()).filter(Boolean);
    if (sectors.length > 0) {
      filtered = filtered.filter(s => sectors.includes(s.sector));
    }
  }

  // Filter by minimum score
  const minScore = user.alert_min_score || 7.0;
  filtered = filtered.filter(s => s.overall_score >= minScore);

  return filtered;
}

/**
 * Check if current time is within quiet hours (AST = UTC+3).
 */
function isQuietHours(user) {
  const now = new Date();
  const astHour = (now.getUTCHours() + 3) % 24;
  const astMinute = now.getUTCMinutes();
  const currentTime = `${String(astHour).padStart(2, '0')}:${String(astMinute).padStart(2, '0')}`;

  const start = user.quiet_hours_start || '22:00';
  const end = user.quiet_hours_end || '07:00';

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }
  return currentTime >= start && currentTime < end;
}

/**
 * Log a notification attempt.
 */
function logNotification(db, { userId, type, channel = 'email', subject, recipient, recipientEmail, status, errorMessage, metadata }) {
  initNotificationSchema(db);
  const id = uuidv4();
  const recipientValue = recipient || recipientEmail || '';
  db.prepare(`
    INSERT INTO notification_log (id, user_id, type, channel, subject, recipient, status, error_message, metadata, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'sent' ? "datetime('now')" : 'NULL'})
  `).run(id, userId, type, channel, subject, recipientValue, status, errorMessage || null, metadata ? JSON.stringify(metadata) : null);
  return id;
}

/**
 * Send instant alerts when new buy/sell signals are detected.
 * Called after the analysis pipeline produces new scores.
 */
async function dispatchInstantAlerts(newScores) {
  if (!newScores || newScores.length === 0) return { sent: 0, skipped: 0 };

  // Filter to actionable signals only
  const actionableStocks = newScores.filter(s =>
    s.entry_signal === 'strong_buy' || s.entry_signal === 'buy' ||
    s.entry_signal === 'sell' || s.entry_signal === 'strong_sell'
  );

  if (actionableStocks.length === 0) return { sent: 0, skipped: 0 };

  const db = getDb();
  initSchema(db);
  initAuthSchema(db);
  initNotificationSchema(db);

  try {
    const users = getEligibleUsers(db, 'instant_alert');
    let sent = 0;
    let skipped = 0;

    for (const user of users) {
      // Check quiet hours
      if (isQuietHours(user)) {
        skipped++;
        continue;
      }

      // Filter stocks for this user's preferences
      const userStocks = filterStocksForUser(actionableStocks, user);
      if (userStocks.length === 0) {
        skipped++;
        continue;
      }

      const lang = user.preferred_language || user.locale || 'ar';
      const baseMeta = { stockCount: userStocks.length, symbols: userStocks.map(s => s.symbol) };
      let userSent = false;

      // Email channel
      if (user.email_enabled !== 0) {
        const template = instantAlertTemplate(userStocks, lang);
        const result = await sendEmail({
          to: user.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        logNotification(db, {
          userId: user.id, type: 'instant_alert', channel: 'email',
          subject: template.subject, recipient: user.email,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.error, metadata: baseMeta,
        });
        if (result.success) userSent = true;
      }

      // Telegram channel
      if (user.telegram_enabled && user.telegram_chat_id) {
        const text = telegramInstantAlert(userStocks, lang);
        const result = await sendTelegram({ chatId: user.telegram_chat_id, text });
        logNotification(db, {
          userId: user.id, type: 'instant_alert', channel: 'telegram',
          subject: 'Instant Alert', recipient: user.telegram_chat_id,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.error, metadata: baseMeta,
        });
        if (result.success) userSent = true;
      }

      // WhatsApp channel (premium subscribers only — enterprise tier)
      if (user.whatsapp_enabled && user.whatsapp_phone) {
        const tierFeatures = TIERS[getEffectiveTierFromRow(user)]?.features || [];
        const hasPremium = tierFeatures.includes('all_advanced') || tierFeatures.includes('custom_alerts');
        if (hasPremium) {
          const text = whatsappInstantAlert(userStocks, lang);
          const result = await sendWhatsApp({ to: user.whatsapp_phone, text });
          logNotification(db, {
            userId: user.id, type: 'instant_alert', channel: 'whatsapp',
            subject: 'Instant Alert', recipient: user.whatsapp_phone,
            status: result.success ? 'sent' : 'failed',
            errorMessage: result.error, metadata: baseMeta,
          });
          if (result.success) userSent = true;
        }
      }

      if (userSent) sent++;
      else skipped++;
    }

    console.log(`[Notifications] Instant alerts: ${sent} sent, ${skipped} skipped`);
    return { sent, skipped };
  } finally {
    db.close();
  }
}

/**
 * Gather all data needed for the daily market summary report.
 * Reusable by dispatchDailySummary, CLI preview, and API endpoint.
 * @returns {Object|null} Report data object, or null if no analysis data.
 */
async function generateReportData() {
  const db = getDb();
  initSchema(db);

  try {
    const latestDate = db.prepare('SELECT MAX(date) as date FROM stock_scores').get()?.date;
    if (!latestDate) return null;

    const topStocks = db.prepare(`
      SELECT s.symbol, s.name, s.sector,
             ss.overall_score, ss.technical_score, ss.fundamental_score,
             ss.ai_score, ss.risk_level, ss.entry_signal, ss.entry_reasoning,
             dp.close as latest_price
      FROM stocks s
      JOIN stock_scores ss ON s.symbol = ss.symbol AND ss.date = ?
      LEFT JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = (
        SELECT MAX(date) FROM daily_prices WHERE symbol = s.symbol
      )
      ORDER BY ss.overall_score DESC
      LIMIT 10
    `).all(latestDate);

    const sectorSummary = db.prepare(
      'SELECT * FROM sector_analysis WHERE date = ? ORDER BY avg_score DESC'
    ).all(latestDate);

    const signalRows = db.prepare(`
      SELECT entry_signal, COUNT(*) as count
      FROM stock_scores WHERE date = ? GROUP BY entry_signal
    `).all(latestDate);
    const signalCounts = {};
    for (const row of signalRows) signalCounts[row.entry_signal] = row.count;

    const prevDate = db.prepare(
      'SELECT MAX(date) as date FROM daily_prices WHERE date < ?'
    ).get(latestDate)?.date;

    let topGainers = [];
    let topLosers = [];
    if (prevDate) {
      topGainers = db.prepare(`
        SELECT s.symbol, s.name, s.sector,
               dp_today.close as close_price, dp_prev.close as prev_close,
               ROUND(((dp_today.close - dp_prev.close) / dp_prev.close) * 100, 2) as change_pct
        FROM stocks s
        JOIN daily_prices dp_today ON s.symbol = dp_today.symbol AND dp_today.date = ?
        JOIN daily_prices dp_prev ON s.symbol = dp_prev.symbol AND dp_prev.date = ?
        WHERE dp_prev.close > 0 ORDER BY change_pct DESC LIMIT 5
      `).all(latestDate, prevDate);

      topLosers = db.prepare(`
        SELECT s.symbol, s.name, s.sector,
               dp_today.close as close_price, dp_prev.close as prev_close,
               ROUND(((dp_today.close - dp_prev.close) / dp_prev.close) * 100, 2) as change_pct
        FROM stocks s
        JOIN daily_prices dp_today ON s.symbol = dp_today.symbol AND dp_today.date = ?
        JOIN daily_prices dp_prev ON s.symbol = dp_prev.symbol AND dp_prev.date = ?
        WHERE dp_prev.close > 0 ORDER BY change_pct ASC LIMIT 5
      `).all(latestDate, prevDate);
    }

    const volumeLeaders = db.prepare(`
      SELECT s.symbol, s.name, s.sector, dp.volume, dp.close as close_price
      FROM stocks s
      JOIN daily_prices dp ON s.symbol = dp.symbol AND dp.date = ?
      WHERE dp.volume > 0 ORDER BY dp.volume DESC LIMIT 5
    `).all(latestDate);

    let tasiIndex = null;
    try {
      const { data } = await fetchMarketSummary();
      tasiIndex = data;
    } catch (err) {
      console.warn(`[Report] Could not fetch TASI index: ${err.message}`);
    }

    return {
      date: latestDate,
      topStocks, sectorSummary, signalCounts,
      marketStats: {
        totalStocks: db.prepare('SELECT COUNT(*) as count FROM stocks').get().count,
        analysisDate: latestDate,
        tasiIndex,
      },
      topGainers, topLosers, volumeLeaders,
    };
  } finally {
    db.close();
  }
}

/**
 * Send daily market summary to all eligible users.
 * Called by the scheduler after market close.
 */
async function dispatchDailySummary() {
  const summaryData = await generateReportData();
  if (!summaryData) {
    console.log('[Notifications] No analysis data available for daily summary');
    return { sent: 0, skipped: 0 };
  }

  const db = getDb();
  initSchema(db);
  initAuthSchema(db);
  initNotificationSchema(db);

  try {
    const users = getEligibleUsers(db, 'daily_summary');
    let sent = 0;
    let skipped = 0;

    for (const user of users) {
      const lang = user.preferred_language || user.locale || 'ar';
      const baseMeta = { date: summaryData.date, topStockCount: (summaryData.topStocks || []).length };
      let userSent = false;

      // Email channel
      if (user.email_enabled !== 0) {
        const template = dailySummaryTemplate(summaryData, lang);
        const result = await sendEmail({
          to: user.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        logNotification(db, {
          userId: user.id, type: 'daily_summary', channel: 'email',
          subject: template.subject, recipient: user.email,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.error, metadata: baseMeta,
        });
        if (result.success) userSent = true;
      }

      // Telegram channel
      if (user.telegram_enabled && user.telegram_chat_id) {
        const text = telegramDailySummary(summaryData, lang);
        const result = await sendTelegram({ chatId: user.telegram_chat_id, text });
        logNotification(db, {
          userId: user.id, type: 'daily_summary', channel: 'telegram',
          subject: 'Daily Summary', recipient: user.telegram_chat_id,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.error, metadata: baseMeta,
        });
        if (result.success) userSent = true;
      }

      // WhatsApp channel (premium subscribers only)
      if (user.whatsapp_enabled && user.whatsapp_phone) {
        const tierFeatures = TIERS[getEffectiveTierFromRow(user)]?.features || [];
        const hasPremium = tierFeatures.includes('all_advanced') || tierFeatures.includes('custom_alerts');
        if (hasPremium) {
          const text = whatsappDailySummary(summaryData, lang);
          const result = await sendWhatsApp({ to: user.whatsapp_phone, text });
          logNotification(db, {
            userId: user.id, type: 'daily_summary', channel: 'whatsapp',
            subject: 'Daily Summary', recipient: user.whatsapp_phone,
            status: result.success ? 'sent' : 'failed',
            errorMessage: result.error, metadata: baseMeta,
          });
          if (result.success) userSent = true;
        }
      }

      if (userSent) sent++;
      else skipped++;
    }

    console.log(`[Notifications] Daily summary: ${sent} sent, ${skipped} skipped`);
    return { sent, skipped };
  } finally {
    db.close();
  }
}

/**
 * Dispatch rebalancing alerts for the model portfolio.
 * Sends to advanced+ tier users who have instant alerts enabled.
 */
async function dispatchRebalanceAlerts(portfolioResult) {
  if (!portfolioResult) return { sent: 0, skipped: 0 };

  const db = getDb();
  initSchema(db);
  initAuthSchema(db);
  initNotificationSchema(db);

  try {
    const users = getEligibleUsers(db, 'instant_alert');
    let sent = 0;
    let skipped = 0;

    const { holdings, date, reasoning, diversificationScore } = portfolioResult;
    const topHoldings = holdings.slice(0, 5);

    for (const user of users) {
      if (isQuietHours(user)) { skipped++; continue; }

      const lang = user.preferred_language || user.locale || 'ar';
      const baseMeta = { type: 'rebalance', date, holdingCount: holdings.length };

      // Build rebalance email
      const subject = lang === 'ar'
        ? `إعادة توازن المحفظة النموذجية — ${date}`
        : `Model Portfolio Rebalanced — ${date}`;

      const holdingsList = topHoldings.map(h =>
        `• ${h.name} (${h.symbol}) — ${(h.weight * 100).toFixed(1)}% | Score: ${h.score}/10`
      ).join('\n');

      const textBody = lang === 'ar'
        ? `تم إعادة توازن المحفظة النموذجية\n\nالتاريخ: ${date}\nعدد الأسهم: ${holdings.length}\nالتنويع: ${diversificationScore?.toFixed(1) || '—'}/10\n\nأعلى 5 أسهم:\n${holdingsList}\n\n${reasoning || ''}`
        : `Model Portfolio Rebalanced\n\nDate: ${date}\nStocks: ${holdings.length}\nDiversification: ${diversificationScore?.toFixed(1) || '—'}/10\n\nTop 5 Holdings:\n${holdingsList}\n\n${reasoning || ''}`;

      const htmlBody = `
        <div style="font-family:system-ui;direction:${lang === 'ar' ? 'rtl' : 'ltr'};max-width:600px;margin:0 auto;background:#111827;color:#E5E7EB;padding:24px;border-radius:12px;">
          <h2 style="color:#FFD600;margin-bottom:16px;">${lang === 'ar' ? 'إعادة توازن المحفظة النموذجية' : 'Model Portfolio Rebalanced'}</h2>
          <p style="color:#9CA3AF;margin-bottom:8px;">${date} — ${holdings.length} ${lang === 'ar' ? 'سهم' : 'stocks'}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:12px;">
            <thead><tr style="border-bottom:1px solid #374151;">
              <th style="text-align:${lang === 'ar' ? 'right' : 'left'};padding:8px;color:#9CA3AF;font-size:12px;">${lang === 'ar' ? 'السهم' : 'Stock'}</th>
              <th style="text-align:center;padding:8px;color:#9CA3AF;font-size:12px;">${lang === 'ar' ? 'الوزن' : 'Weight'}</th>
              <th style="text-align:center;padding:8px;color:#9CA3AF;font-size:12px;">${lang === 'ar' ? 'التقييم' : 'Score'}</th>
            </tr></thead>
            <tbody>
              ${topHoldings.map(h => `
                <tr style="border-bottom:1px solid #1F2937;">
                  <td style="padding:8px;"><strong>${h.name}</strong><br><span style="color:#6B7280;font-size:12px;">${h.symbol}</span></td>
                  <td style="text-align:center;padding:8px;">${(h.weight * 100).toFixed(1)}%</td>
                  <td style="text-align:center;padding:8px;color:#FFD600;font-weight:bold;">${h.score}/10</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${reasoning ? `<p style="color:#9CA3AF;margin-top:16px;font-size:13px;">${reasoning}</p>` : ''}
        </div>
      `;

      // Email
      if (user.email_enabled !== 0) {
        const result = await sendEmail({ to: user.email, subject, html: htmlBody, text: textBody });
        logNotification(db, {
          userId: user.id, type: 'portfolio_rebalance', channel: 'email',
          subject, recipient: user.email,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.error, metadata: baseMeta,
        });
        if (result.success) { sent++; continue; }
      }

      // Telegram
      if (user.telegram_enabled && user.telegram_chat_id) {
        const telegramText = `${lang === 'ar' ? 'إعادة توازن المحفظة النموذجية' : 'Model Portfolio Rebalanced'}\n${date} — ${holdings.length} ${lang === 'ar' ? 'سهم' : 'stocks'}\n\n${holdingsList}`;
        const result = await sendTelegram({ chatId: user.telegram_chat_id, text: telegramText });
        logNotification(db, {
          userId: user.id, type: 'portfolio_rebalance', channel: 'telegram',
          subject: 'Portfolio Rebalance', recipient: user.telegram_chat_id,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.error, metadata: baseMeta,
        });
        if (result.success) sent++;
        else skipped++;
      } else {
        skipped++;
      }
    }

    console.log(`[Notifications] Portfolio rebalance alerts: ${sent} sent, ${skipped} skipped`);
    return { sent, skipped };
  } finally {
    db.close();
  }
}

module.exports = {
  dispatchInstantAlerts,
  dispatchDailySummary,
  dispatchRebalanceAlerts,
  generateReportData,
  getEligibleUsers,
  filterStocksForUser,
  isQuietHours,
  logNotification,
};
