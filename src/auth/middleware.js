const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');
const { initAuthSchema } = require('../db/auth-schema');

const JWT_SECRET = process.env.TASI_JWT_SECRET || 'tasi-platform-secret-change-in-production';
const JWT_EXPIRY = '24h';

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

function getAuthUser(req) {
  const token = extractToken(req);
  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded) return null;

  const db = getDb();
  initAuthSchema(db);
  try {
    const user = db.prepare('SELECT id, email, name, locale, created_at FROM users WHERE id = ?').get(decoded.userId);
    if (!user) return null;

    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);
    return { ...user, subscription: sub || null };
  } finally {
    db.close();
  }
}

function getEffectiveTier(user) {
  if (!user || !user.subscription) return 'free';
  const sub = user.subscription;

  if (sub.status === 'cancelled' || sub.status === 'expired') return 'free';

  if (sub.status === 'trial') {
    const now = new Date();
    const trialEnd = new Date(sub.trial_ends_at);
    if (now > trialEnd) return 'free';
    return sub.tier;
  }

  return sub.tier;
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return null;
  }
  return user;
}

function requireTier(req, res, minTiers) {
  const user = requireAuth(req, res);
  if (!user) return null;

  const tier = getEffectiveTier(user);
  if (!minTiers.includes(tier)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Subscription upgrade required',
      currentTier: tier,
      requiredTiers: minTiers,
    }));
    return null;
  }
  return user;
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  extractToken,
  getAuthUser,
  getEffectiveTier,
  requireAuth,
  requireTier,
};
