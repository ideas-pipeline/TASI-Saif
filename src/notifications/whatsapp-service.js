const https = require('https');
const http = require('http');

// WhatsApp Business API (Cloud API) configuration
const WHATSAPP_TOKEN = process.env.TASI_WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.TASI_WHATSAPP_PHONE_ID || '';
const WHATSAPP_API_BASE = process.env.TASI_WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';

/**
 * Make an HTTP(S) request to the WhatsApp Business Cloud API.
 * @param {string} endpoint - API path (e.g. '/{phoneId}/messages')
 * @param {Object} body - JSON request body
 * @returns {Promise<Object>}
 */
function whatsappRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      return resolve({ error: { message: 'WhatsApp credentials not configured' } });
    }

    const url = new URL(endpoint, WHATSAPP_API_BASE);
    const payload = JSON.stringify(body);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
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
          resolve({ error: { message: `Invalid response: ${data.slice(0, 200)}` } });
        }
      });
    });

    req.on('error', err => resolve({ error: { message: err.message } }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ error: { message: 'Request timed out' } });
    });
    req.end(payload);
  });
}

/**
 * Send a WhatsApp text message via the Cloud API.
 * @param {string} to - Recipient phone number in E.164 format (e.g. +966501234567)
 * @param {string} text - Plain text message body
 * @returns {Promise<Object>} - { success, messageId?, error? }
 */
async function sendWhatsApp({ to, text }) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log(`[WhatsApp-DryRun] To: ${to} | Text: ${text.slice(0, 80)}...`);
    return { success: true, messageId: `dry-run-${Date.now()}`, dryRun: true };
  }

  const result = await whatsappRequest(`/${WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/[^0-9]/g, ''), // strip non-digits for API
    type: 'text',
    text: { preview_url: false, body: text },
  });

  if (result.messages && result.messages[0]) {
    const msgId = result.messages[0].id;
    console.log(`[WhatsApp] Sent to ${to} (msg ${msgId})`);
    return { success: true, messageId: msgId };
  }

  const errMsg = result.error?.message || 'Unknown WhatsApp API error';
  console.error(`[WhatsApp] Failed to send to ${to}: ${errMsg}`);
  return { success: false, error: errMsg };
}

/**
 * Send a WhatsApp template message (required for initiating conversations).
 * @param {string} to - Recipient phone number in E.164 format
 * @param {string} templateName - Approved template name
 * @param {string} languageCode - Template language code (e.g. 'ar', 'en')
 * @param {Array} components - Template components array
 * @returns {Promise<Object>}
 */
async function sendWhatsAppTemplate({ to, templateName, languageCode = 'ar', components = [] }) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log(`[WhatsApp-DryRun] Template: ${templateName} To: ${to}`);
    return { success: true, messageId: `dry-run-${Date.now()}`, dryRun: true };
  }

  const result = await whatsappRequest(`/${WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/[^0-9]/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });

  if (result.messages && result.messages[0]) {
    return { success: true, messageId: result.messages[0].id };
  }

  const errMsg = result.error?.message || 'Unknown WhatsApp API error';
  return { success: false, error: errMsg };
}

module.exports = { sendWhatsApp, sendWhatsAppTemplate, whatsappRequest };
