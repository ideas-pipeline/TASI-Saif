const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { initAuthSchema } = require('../db/auth-schema');
const { initNotificationSchema } = require('../db/notification-schema');
const { getAuthUser, getEffectiveTier } = require('../auth/middleware');
const { parseBody } = require('../auth/routes');

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function handleNotificationRoutes(req, res, path) {
  // GET /api/notifications/preferences — get notification preferences
  if (path === '/api/notifications/preferences' && req.method === 'GET') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const db = getDb();
    initNotificationSchema(db);
    try {
      const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(user.id);

      if (!prefs) {
        // Return defaults
        return json(res, {
          preferences: {
            emailEnabled: true,
            telegramEnabled: false,
            whatsappEnabled: false,
            telegramChatId: null,
            whatsappPhone: null,
            telegramConnected: false,
            whatsappConnected: false,
            dailySummary: true,
            instantAlerts: true,
            alertSignals: ['strong_buy', 'buy'],
            alertSectors: [],
            alertMinScore: 7.0,
            preferredLanguage: user.locale || 'ar',
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
          },
          isDefault: true,
        });
      }

      return json(res, {
        preferences: {
          emailEnabled: prefs.email_enabled === 1,
          telegramEnabled: prefs.telegram_enabled === 1,
          whatsappEnabled: prefs.whatsapp_enabled === 1,
          telegramChatId: prefs.telegram_chat_id || null,
          whatsappPhone: prefs.whatsapp_phone || null,
          telegramConnected: !!prefs.telegram_chat_id,
          whatsappConnected: !!prefs.whatsapp_phone,
          dailySummary: prefs.daily_summary === 1,
          instantAlerts: prefs.instant_alerts === 1,
          alertSignals: prefs.alert_signals ? prefs.alert_signals.split(',').filter(Boolean) : [],
          alertSectors: prefs.alert_sectors ? prefs.alert_sectors.split(',').filter(Boolean) : [],
          alertMinScore: prefs.alert_min_score,
          preferredLanguage: prefs.preferred_language,
          quietHoursStart: prefs.quiet_hours_start,
          quietHoursEnd: prefs.quiet_hours_end,
        },
        isDefault: false,
      });
    } finally {
      db.close();
    }
  }

  // PUT /api/notifications/preferences — update notification preferences
  if (path === '/api/notifications/preferences' && (req.method === 'PUT' || req.method === 'POST')) {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const body = await parseBody(req);

    const db = getDb();
    initNotificationSchema(db);
    try {
      const existing = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(user.id);

      const emailEnabled = body.emailEnabled !== undefined ? (body.emailEnabled ? 1 : 0) : (existing?.email_enabled ?? 1);
      const telegramEnabled = body.telegramEnabled !== undefined ? (body.telegramEnabled ? 1 : 0) : (existing?.telegram_enabled ?? 0);
      const whatsappEnabled = body.whatsappEnabled !== undefined ? (body.whatsappEnabled ? 1 : 0) : (existing?.whatsapp_enabled ?? 0);
      const dailySummary = body.dailySummary !== undefined ? (body.dailySummary ? 1 : 0) : (existing?.daily_summary ?? 1);
      const instantAlerts = body.instantAlerts !== undefined ? (body.instantAlerts ? 1 : 0) : (existing?.instant_alerts ?? 1);
      const alertSignals = body.alertSignals !== undefined
        ? (Array.isArray(body.alertSignals) ? body.alertSignals.join(',') : body.alertSignals)
        : (existing?.alert_signals ?? 'strong_buy,buy');
      const alertSectors = body.alertSectors !== undefined
        ? (Array.isArray(body.alertSectors) ? body.alertSectors.join(',') : body.alertSectors)
        : (existing?.alert_sectors ?? '');
      const alertMinScore = body.alertMinScore !== undefined ? body.alertMinScore : (existing?.alert_min_score ?? 7.0);
      const preferredLanguage = body.preferredLanguage || existing?.preferred_language || user.locale || 'ar';
      const quietHoursStart = body.quietHoursStart || existing?.quiet_hours_start || '22:00';
      const quietHoursEnd = body.quietHoursEnd || existing?.quiet_hours_end || '07:00';

      // Preserve connected channel IDs (can't change via preferences update)
      const telegramChatId = existing?.telegram_chat_id || null;
      const whatsappPhone = body.whatsappPhone || existing?.whatsapp_phone || null;

      // Validate signals
      const validSignals = ['strong_buy', 'buy', 'hold', 'sell', 'strong_sell'];
      const signalList = alertSignals.split(',').filter(Boolean);
      for (const sig of signalList) {
        if (!validSignals.includes(sig)) {
          return json(res, { error: `Invalid signal: ${sig}. Valid: ${validSignals.join(', ')}` }, 400);
        }
      }

      // Validate language
      if (!['ar', 'en'].includes(preferredLanguage)) {
        return json(res, { error: 'Invalid language. Options: ar, en' }, 400);
      }

      // Validate WhatsApp phone format if provided
      if (whatsappPhone && !/^\+?[1-9]\d{6,14}$/.test(whatsappPhone.replace(/[\s-]/g, ''))) {
        return json(res, { error: 'Invalid phone number. Use E.164 format (e.g. +966501234567)' }, 400);
      }

      // Cannot enable Telegram without connecting first
      if (telegramEnabled && !telegramChatId) {
        return json(res, { error: 'Connect Telegram first using the bot link before enabling' }, 400);
      }

      if (existing) {
        db.prepare(`
          UPDATE notification_preferences
          SET email_enabled = ?, telegram_enabled = ?, whatsapp_enabled = ?,
              whatsapp_phone = ?,
              daily_summary = ?, instant_alerts = ?,
              alert_signals = ?, alert_sectors = ?, alert_min_score = ?,
              preferred_language = ?, quiet_hours_start = ?, quiet_hours_end = ?,
              updated_at = datetime('now')
          WHERE user_id = ?
        `).run(emailEnabled, telegramEnabled, whatsappEnabled,
          whatsappPhone,
          dailySummary, instantAlerts, alertSignals, alertSectors,
          alertMinScore, preferredLanguage, quietHoursStart, quietHoursEnd, user.id);
      } else {
        db.prepare(`
          INSERT INTO notification_preferences
            (user_id, email_enabled, telegram_enabled, whatsapp_enabled,
             telegram_chat_id, whatsapp_phone,
             daily_summary, instant_alerts, alert_signals,
             alert_sectors, alert_min_score, preferred_language, quiet_hours_start, quiet_hours_end)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, emailEnabled, telegramEnabled, whatsappEnabled,
          telegramChatId, whatsappPhone,
          dailySummary, instantAlerts, alertSignals,
          alertSectors, alertMinScore, preferredLanguage, quietHoursStart, quietHoursEnd);
      }

      return json(res, {
        preferences: {
          emailEnabled: emailEnabled === 1,
          telegramEnabled: telegramEnabled === 1,
          whatsappEnabled: whatsappEnabled === 1,
          telegramChatId,
          whatsappPhone,
          telegramConnected: !!telegramChatId,
          whatsappConnected: !!whatsappPhone,
          dailySummary: dailySummary === 1,
          instantAlerts: instantAlerts === 1,
          alertSignals: signalList,
          alertSectors: alertSectors ? alertSectors.split(',').filter(Boolean) : [],
          alertMinScore,
          preferredLanguage,
          quietHoursStart,
          quietHoursEnd,
        },
        message: 'Notification preferences updated',
      });
    } finally {
      db.close();
    }
  }

  // POST /api/notifications/telegram/webhook — Telegram bot webhook handler
  // Handles /start command to link Telegram chat to user account
  if (path === '/api/notifications/telegram/webhook' && req.method === 'POST') {
    const body = await parseBody(req);
    const message = body.message;

    if (!message || !message.text) {
      return json(res, { ok: true }); // acknowledge but ignore non-text updates
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    // /start <link_token> — link Telegram account
    if (text.startsWith('/start')) {
      const linkToken = text.replace('/start', '').trim();

      if (!linkToken) {
        // No token: send instructions
        const { sendTelegram } = require('./telegram-service');
        await sendTelegram({
          chatId,
          text: 'مرحباً بك في بوت منصة تداول! 🇸🇦\n\nلربط حسابك، استخدم رابط الربط من إعدادات الإشعارات في المنصة.\n\nWelcome to TASI Platform Bot!\nUse the link from your notification settings to connect your account.',
        });
        return json(res, { ok: true });
      }

      // Validate link token and bind chat ID
      const db = getDb();
      initNotificationSchema(db);
      initAuthSchema(db);
      try {
        const link = db.prepare(
          'SELECT * FROM telegram_link_tokens WHERE token = ? AND expires_at > datetime(\'now\')'
        ).get(linkToken);

        if (!link) {
          const { sendTelegram } = require('./telegram-service');
          await sendTelegram({
            chatId,
            text: '❌ رابط الربط غير صالح أو منتهي الصلاحية.\nPlease generate a new link from your notification settings.',
          });
          return json(res, { ok: true });
        }

        // Link the Telegram chat to the user
        const existing = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(link.user_id);
        if (existing) {
          db.prepare(
            'UPDATE notification_preferences SET telegram_chat_id = ?, telegram_enabled = 1, updated_at = datetime(\'now\') WHERE user_id = ?'
          ).run(chatId, link.user_id);
        } else {
          db.prepare(
            'INSERT INTO notification_preferences (user_id, telegram_chat_id, telegram_enabled) VALUES (?, ?, 1)'
          ).run(link.user_id, chatId);
        }

        // Delete used token
        db.prepare('DELETE FROM telegram_link_tokens WHERE token = ?').run(linkToken);

        const { sendTelegram } = require('./telegram-service');
        await sendTelegram({
          chatId,
          text: '✅ تم ربط حسابك بنجاح! ستصلك التنبيهات هنا.\nAccount linked successfully! You will receive alerts here.',
        });

        return json(res, { ok: true });
      } finally {
        db.close();
      }
    }

    return json(res, { ok: true });
  }

  // POST /api/notifications/telegram/link — generate a Telegram link token
  if (path === '/api/notifications/telegram/link' && req.method === 'POST') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const db = getDb();
    initNotificationSchema(db);
    try {
      // Create telegram_link_tokens table if needed
      db.exec(`
        CREATE TABLE IF NOT EXISTS telegram_link_tokens (
          token       TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL,
          expires_at  TEXT NOT NULL,
          created_at  TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // Clean expired tokens
      db.prepare("DELETE FROM telegram_link_tokens WHERE expires_at < datetime('now')").run();

      // Generate a short link token (valid 15 minutes)
      const token = uuidv4().replace(/-/g, '').slice(0, 16);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
      db.prepare('INSERT INTO telegram_link_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

      const botUsername = process.env.TASI_TELEGRAM_BOT_USERNAME || 'TASIPlatformBot';
      const deepLink = `https://t.me/${botUsername}?start=${token}`;

      return json(res, {
        linkUrl: deepLink,
        expiresInSeconds: 900,
        message: 'Open this link in Telegram to connect your account',
      });
    } finally {
      db.close();
    }
  }

  // DELETE /api/notifications/telegram/link — disconnect Telegram
  if (path === '/api/notifications/telegram/link' && req.method === 'DELETE') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const db = getDb();
    initNotificationSchema(db);
    try {
      db.prepare(
        'UPDATE notification_preferences SET telegram_chat_id = NULL, telegram_enabled = 0, updated_at = datetime(\'now\') WHERE user_id = ?'
      ).run(user.id);
      return json(res, { message: 'Telegram disconnected' });
    } finally {
      db.close();
    }
  }

  // GET /api/notifications/channels — get available channels and connection status
  if (path === '/api/notifications/channels' && req.method === 'GET') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const tier = getEffectiveTier(user);

    const db = getDb();
    initNotificationSchema(db);
    try {
      const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(user.id);

      return json(res, {
        channels: {
          email: {
            available: true,
            enabled: prefs ? prefs.email_enabled === 1 : true,
            connected: true, // email is always connected via user account
            requiredTier: 'basic',
          },
          telegram: {
            available: true,
            enabled: prefs ? prefs.telegram_enabled === 1 : false,
            connected: !!(prefs?.telegram_chat_id),
            requiredTier: 'basic',
          },
          whatsapp: {
            available: true,
            enabled: prefs ? prefs.whatsapp_enabled === 1 : false,
            connected: !!(prefs?.whatsapp_phone),
            requiredTier: 'enterprise',
          },
        },
        currentTier: tier,
      });
    } finally {
      db.close();
    }
  }

  // GET /api/notifications/history — notification history
  if (path === '/api/notifications/history' && req.method === 'GET') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const db = getDb();
    initNotificationSchema(db);
    try {
      const notifications = db.prepare(`
        SELECT id, type, channel, subject, status, created_at, sent_at
        FROM notification_log
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(user.id);

      return json(res, { notifications });
    } finally {
      db.close();
    }
  }

  // POST /api/notifications/test — send a test notification
  if (path === '/api/notifications/test' && req.method === 'POST') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const tier = getEffectiveTier(user);
    if (tier === 'free') {
      return json(res, { error: 'Notification testing requires a paid subscription' }, 403);
    }

    const body = await parseBody(req);
    const channel = body.channel || 'email'; // email, telegram, whatsapp

    const lang = user.locale || 'ar';
    const testStocks = [{
      symbol: '1120.SR',
      name: 'Al Rajhi Bank',
      sector: 'Banking',
      overall_score: 8.5,
      entry_signal: 'strong_buy',
      risk_level: 'low',
      latest_price: 95.50,
      entry_reasoning: lang === 'ar'
        ? 'اختبار التنبيهات — هذه رسالة تجريبية للتحقق من إعدادات الإشعارات.'
        : 'Test alert — This is a test message to verify notification settings.',
    }];

    if (channel === 'telegram') {
      const db = getDb();
      initNotificationSchema(db);
      try {
        const prefs = db.prepare('SELECT telegram_chat_id FROM notification_preferences WHERE user_id = ?').get(user.id);
        if (!prefs?.telegram_chat_id) {
          return json(res, { error: 'Telegram not connected. Generate a link first.' }, 400);
        }
        const { telegramInstantAlert } = require('./messaging-templates');
        const { sendTelegram } = require('./telegram-service');
        const text = telegramInstantAlert(testStocks, lang);
        const result = await sendTelegram({ chatId: prefs.telegram_chat_id, text });
        return json(res, {
          success: result.success,
          channel: 'telegram',
          message: result.success ? 'Test notification sent to Telegram' : 'Failed to send test',
          error: result.error,
          dryRun: result.dryRun || false,
        });
      } finally {
        db.close();
      }
    }

    if (channel === 'whatsapp') {
      const db = getDb();
      initNotificationSchema(db);
      try {
        const prefs = db.prepare('SELECT whatsapp_phone FROM notification_preferences WHERE user_id = ?').get(user.id);
        if (!prefs?.whatsapp_phone) {
          return json(res, { error: 'WhatsApp phone number not configured' }, 400);
        }
        const { whatsappInstantAlert } = require('./messaging-templates');
        const { sendWhatsApp } = require('./whatsapp-service');
        const text = whatsappInstantAlert(testStocks, lang);
        const result = await sendWhatsApp({ to: prefs.whatsapp_phone, text });
        return json(res, {
          success: result.success,
          channel: 'whatsapp',
          message: result.success ? 'Test notification sent to WhatsApp' : 'Failed to send test',
          error: result.error,
          dryRun: result.dryRun || false,
        });
      } finally {
        db.close();
      }
    }

    // Default: email
    const { sendEmail } = require('./email-service');
    const { instantAlertTemplate } = require('./templates');
    const template = instantAlertTemplate(testStocks, lang);
    const result = await sendEmail({
      to: user.email,
      subject: `[TEST] ${template.subject}`,
      html: template.html,
      text: template.text,
    });

    return json(res, {
      success: result.success,
      channel: 'email',
      message: result.success ? 'Test notification sent' : 'Failed to send test notification',
      error: result.error,
      dryRun: result.dryRun || false,
    });
  }

  return false; // not handled
}

module.exports = { handleNotificationRoutes };
