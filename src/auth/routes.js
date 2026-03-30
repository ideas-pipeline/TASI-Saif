const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { initAuthSchema, TIERS } = require('../db/auth-schema');
const { generateToken, getAuthUser, getEffectiveTier } = require('./middleware');

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function handleAuthRoutes(req, res, path) {
  // POST /api/auth/register
  if (path === '/api/auth/register' && req.method === 'POST') {
    const body = await parseBody(req);
    const { email, password, name } = body;

    if (!email || !password) {
      return json(res, { error: 'Email and password are required' }, 400);
    }
    if (password.length < 8) {
      return json(res, { error: 'Password must be at least 8 characters' }, 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return json(res, { error: 'Invalid email format' }, 400);
    }

    const db = getDb();
    initAuthSchema(db);
    try {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
      if (existing) {
        return json(res, { error: 'Email already registered' }, 409);
      }

      const userId = uuidv4();
      const passwordHash = await bcrypt.hash(password, 12);

      db.prepare(
        'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
      ).run(userId, email.toLowerCase(), passwordHash, name || null);

      // Create free subscription by default
      const subId = uuidv4();
      db.prepare(
        'INSERT INTO subscriptions (id, user_id, tier, status) VALUES (?, ?, ?, ?)'
      ).run(subId, userId, 'free', 'active');

      const token = generateToken({ id: userId, email: email.toLowerCase() });

      return json(res, {
        token,
        user: { id: userId, email: email.toLowerCase(), name: name || null },
        subscription: { tier: 'free', status: 'active' },
      }, 201);
    } finally {
      db.close();
    }
  }

  // POST /api/auth/login
  if (path === '/api/auth/login' && req.method === 'POST') {
    const body = await parseBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return json(res, { error: 'Email and password are required' }, 400);
    }

    const db = getDb();
    initAuthSchema(db);
    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
      if (!user) {
        return json(res, { error: 'Invalid credentials' }, 401);
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return json(res, { error: 'Invalid credentials' }, 401);
      }

      const token = generateToken({ id: user.id, email: user.email });
      const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);

      return json(res, {
        token,
        user: { id: user.id, email: user.email, name: user.name, locale: user.locale },
        subscription: sub ? { tier: sub.tier, status: sub.status, billingCycle: sub.billing_cycle } : null,
      });
    } finally {
      db.close();
    }
  }

  // GET /api/auth/me
  if (path === '/api/auth/me' && req.method === 'GET') {
    const user = getAuthUser(req);
    if (!user) {
      return json(res, { error: 'Authentication required' }, 401);
    }

    const tier = getEffectiveTier(user);
    const tierInfo = TIERS[tier];

    return json(res, {
      user: { id: user.id, email: user.email, name: user.name, locale: user.locale },
      subscription: user.subscription ? {
        tier,
        status: user.subscription.status,
        billingCycle: user.subscription.billing_cycle,
        trialEndsAt: user.subscription.trial_ends_at,
        currentPeriodEnd: user.subscription.current_period_end,
      } : null,
      features: tierInfo ? tierInfo.features : TIERS.free.features,
    });
  }

  // GET /api/auth/tiers — public pricing info
  if (path === '/api/auth/tiers' && req.method === 'GET') {
    const tiers = Object.entries(TIERS).map(([key, t]) => ({
      id: key,
      name: t.name,
      nameAr: t.nameAr,
      priceMonthly: t.priceMonthly,
      priceAnnual: t.priceAnnual,
      trialDays: t.trialDays || 0,
      features: t.features,
    }));
    return json(res, { tiers, currency: 'SAR', annualDiscount: '20%' });
  }

  return false; // not handled
}

module.exports = { handleAuthRoutes, parseBody };
