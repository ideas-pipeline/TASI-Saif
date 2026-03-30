const nodemailer = require('nodemailer');

// SMTP configuration from environment variables
const SMTP_HOST = process.env.TASI_SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.TASI_SMTP_PORT || '587', 10);
const SMTP_USER = process.env.TASI_SMTP_USER || '';
const SMTP_PASS = process.env.TASI_SMTP_PASS || '';
const SMTP_FROM = process.env.TASI_SMTP_FROM || 'TASI Platform <noreply@tasi-platform.com>';
const SMTP_SECURE = process.env.TASI_SMTP_SECURE === 'true';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('[Email] SMTP credentials not configured. Emails will be logged but not sent.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send an email. Falls back to console logging if SMTP is not configured.
 * @param {Object} opts - { to, subject, html, text }
 * @returns {Object} - { success, messageId?, error? }
 */
async function sendEmail({ to, subject, html, text }) {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[Email-DryRun] To: ${to} | Subject: ${subject}`);
    return { success: true, messageId: `dry-run-${Date.now()}`, dryRun: true };
  }

  try {
    const result = await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
      text,
    });
    console.log(`[Email] Sent to ${to}: ${subject} (${result.messageId})`);
    return { success: true, messageId: result.messageId };
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail, getTransporter };
