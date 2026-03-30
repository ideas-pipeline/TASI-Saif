const https = require('https');
const http = require('http');

const TELEGRAM_BOT_TOKEN = process.env.TASI_TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API_BASE = process.env.TASI_TELEGRAM_API_URL || 'https://api.telegram.org';

/**
 * Make an HTTP(S) request to the Telegram Bot API.
 * @param {string} method - Telegram API method (e.g. 'sendMessage')
 * @param {Object} body - JSON request body
 * @returns {Promise<Object>} - { ok, result } or { ok: false, description }
 */
function telegramRequest(method, body) {
  return new Promise((resolve, reject) => {
    if (!TELEGRAM_BOT_TOKEN) {
      return resolve({ ok: false, description: 'Telegram bot token not configured' });
    }

    const url = new URL(`/bot${TELEGRAM_BOT_TOKEN}/${method}`, TELEGRAM_API_BASE);
    const payload = JSON.stringify(body);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: false, description: `Invalid response: ${data.slice(0, 200)}` });
        }
      });
    });

    req.on('error', err => resolve({ ok: false, description: err.message }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ ok: false, description: 'Request timed out' });
    });
    req.end(payload);
  });
}

/**
 * Send a Telegram message (MarkdownV2 or HTML).
 * @param {string} chatId - Telegram chat ID
 * @param {string} text - Message text
 * @param {Object} opts - { parseMode: 'MarkdownV2'|'HTML', disablePreview: boolean }
 * @returns {Promise<Object>} - { success, messageId?, error? }
 */
async function sendTelegram({ chatId, text, parseMode = 'HTML', disablePreview = true }) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log(`[Telegram-DryRun] ChatId: ${chatId} | Text: ${text.slice(0, 80)}...`);
    return { success: true, messageId: `dry-run-${Date.now()}`, dryRun: true };
  }

  const result = await telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: disablePreview,
  });

  if (result.ok) {
    console.log(`[Telegram] Sent to ${chatId} (msg ${result.result.message_id})`);
    return { success: true, messageId: String(result.result.message_id) };
  }

  console.error(`[Telegram] Failed to send to ${chatId}: ${result.description}`);
  return { success: false, error: result.description };
}

/**
 * Set up the Telegram webhook for receiving /start commands.
 * Call once during deployment.
 * @param {string} webhookUrl - Public HTTPS URL for webhook
 */
async function setWebhook(webhookUrl) {
  const result = await telegramRequest('setWebhook', { url: webhookUrl });
  if (result.ok) {
    console.log(`[Telegram] Webhook set to ${webhookUrl}`);
  } else {
    console.error(`[Telegram] Failed to set webhook: ${result.description}`);
  }
  return result;
}

module.exports = { sendTelegram, setWebhook, telegramRequest };
