const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { initAuthSchema, TIERS } = require('../db/auth-schema');
const { getAuthUser, getEffectiveTier } = require('./middleware');
const { parseBody } = require('./routes');

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

async function handleSubscriptionRoutes(req, res, path) {
  // POST /api/subscription/subscribe — start or change subscription
  if (path === '/api/subscription/subscribe' && req.method === 'POST') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const body = await parseBody(req);
    const { tier, billingCycle } = body;

    if (!tier || !TIERS[tier]) {
      return json(res, { error: 'Invalid tier. Options: free, basic, advanced, enterprise' }, 400);
    }
    if (tier === 'free') {
      return json(res, { error: 'Use /api/subscription/cancel to downgrade to free' }, 400);
    }

    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly';
    const tierInfo = TIERS[tier];
    const now = new Date();

    const db = getDb();
    initAuthSchema(db);
    try {
      const existing = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);

      const periodEnd = cycle === 'annual' ? addMonths(now, 12) : addMonths(now, 1);

      // Check if eligible for trial (only basic tier, first-time non-free subscribers)
      const isTrialEligible = tier === 'basic' && existing && existing.tier === 'free';
      const status = isTrialEligible ? 'trial' : 'active';
      const trialEndsAt = isTrialEligible ? addDays(now, tierInfo.trialDays || 7) : null;

      if (existing) {
        db.prepare(`
          UPDATE subscriptions
          SET tier = ?, billing_cycle = ?, status = ?, trial_ends_at = ?,
              current_period_start = datetime('now'), current_period_end = ?,
              updated_at = datetime('now')
          WHERE user_id = ?
        `).run(tier, cycle, status, trialEndsAt, periodEnd, user.id);
      } else {
        db.prepare(`
          INSERT INTO subscriptions (id, user_id, tier, billing_cycle, status, trial_ends_at, current_period_start, current_period_end)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
        `).run(uuidv4(), user.id, tier, cycle, status, trialEndsAt, periodEnd);
      }

      const price = cycle === 'annual' ? tierInfo.priceAnnual : tierInfo.priceMonthly;

      return json(res, {
        subscription: {
          tier,
          billingCycle: cycle,
          status,
          trialEndsAt,
          currentPeriodEnd: periodEnd,
          price,
          currency: 'SAR',
        },
        message: isTrialEligible
          ? `Trial started! Your ${tierInfo.trialDays}-day free trial ends on ${trialEndsAt}`
          : `Subscribed to ${tierInfo.name} (${cycle})`,
      });
    } finally {
      db.close();
    }
  }

  // POST /api/subscription/cancel
  if (path === '/api/subscription/cancel' && req.method === 'POST') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const db = getDb();
    initAuthSchema(db);
    try {
      db.prepare(`
        UPDATE subscriptions
        SET tier = 'free', status = 'cancelled', updated_at = datetime('now')
        WHERE user_id = ?
      `).run(user.id);

      return json(res, {
        subscription: { tier: 'free', status: 'cancelled' },
        message: 'Subscription cancelled. You now have free access.',
      });
    } finally {
      db.close();
    }
  }

  // GET /api/subscription/status
  if (path === '/api/subscription/status' && req.method === 'GET') {
    const user = getAuthUser(req);
    if (!user) return json(res, { error: 'Authentication required' }, 401);

    const effectiveTier = getEffectiveTier(user);
    const tierInfo = TIERS[effectiveTier];
    const sub = user.subscription;

    return json(res, {
      tier: effectiveTier,
      tierInfo: {
        name: tierInfo.name,
        nameAr: tierInfo.nameAr,
        features: tierInfo.features,
      },
      billing: sub ? {
        billingCycle: sub.billing_cycle,
        status: sub.status,
        trialEndsAt: sub.trial_ends_at,
        currentPeriodStart: sub.current_period_start,
        currentPeriodEnd: sub.current_period_end,
      } : null,
    });
  }

  return false; // not handled
}

// Content gating: filter stock data based on subscription tier
function gateContent(data, tier) {
  if (tier === 'enterprise' || tier === 'advanced') {
    return data; // full access
  }

  if (tier === 'basic') {
    // Basic: no AI analysis
    if (data.stocks) {
      data.stocks = data.stocks.map(s => ({ ...s, ai_score: null, ai_reasoning: null }));
    }
    if (data.score) {
      data.score = { ...data.score, ai_score: null, ai_reasoning: null };
    }
    return data;
  }

  // Free tier: delayed recommendations, no AI, limited data
  if (data.stocks) {
    data.stocks = data.stocks.map(s => ({
      ...s,
      ai_score: null,
      ai_reasoning: null,
      entry_reasoning: 'Upgrade to Basic or higher to see entry reasoning',
    }));
  }
  if (data.score) {
    data.score = {
      ...data.score,
      ai_score: null,
      ai_reasoning: null,
      entry_reasoning: 'Upgrade to Basic or higher to see entry reasoning',
    };
  }
  if (data.rankings) {
    // Free users see top 5 only
    data.rankings = data.rankings.slice(0, 5).map(r => ({
      ...r,
      ai_score: null,
      entry_reasoning: 'Upgrade to Basic or higher to see entry reasoning',
    }));
    data.limited = true;
    data.upgradeMessage = 'Upgrade to see all rankings and detailed analysis';
  }
  if (data.signals) {
    // Free users see counts only, not full stock details
    for (const signal of Object.keys(data.signals)) {
      data.signals[signal] = data.signals[signal].map(s => ({
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        overall_score: s.overall_score,
        entry_reasoning: 'Upgrade for full analysis',
      }));
    }
  }
  return data;
}

module.exports = { handleSubscriptionRoutes, gateContent };
