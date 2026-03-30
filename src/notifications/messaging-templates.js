/**
 * Telegram and WhatsApp message templates for TASI Platform.
 * Telegram uses HTML parse mode. WhatsApp uses plain text.
 * Both support Arabic (RTL handled by clients natively).
 */

const { SIGNAL_LABELS, RISK_LABELS, formatVolume } = require('./templates');

// ── Telegram Templates (HTML parse mode) ──

/**
 * Telegram instant alert message.
 */
function telegramInstantAlert(stocks, lang = 'ar') {
  const isAr = lang === 'ar';
  const lines = [];

  lines.push(isAr
    ? `<b>🔔 تنبيه توصيات جديدة</b>`
    : `<b>🔔 New Recommendation Alert</b>`);
  lines.push(isAr
    ? `تم رصد ${stocks.length} ${stocks.length === 1 ? 'توصية جديدة' : 'توصيات جديدة'}`
    : `${stocks.length} new recommendation${stocks.length !== 1 ? 's' : ''} detected`);
  lines.push('');

  for (const s of stocks) {
    const signal = SIGNAL_LABELS[s.entry_signal] || SIGNAL_LABELS.hold;
    const signalLabel = isAr ? signal.ar : signal.en;
    const risk = RISK_LABELS[s.risk_level] || RISK_LABELS.medium;
    const riskLabel = isAr ? risk.ar : risk.en;
    const score = s.overall_score != null ? s.overall_score.toFixed(1) : '-';
    const price = s.latest_price != null ? `${s.latest_price.toFixed(2)} SAR` : '-';
    const symbol = s.symbol.replace('.SR', '');

    lines.push(`<b>${symbol}</b> — ${s.name}`);
    lines.push(isAr
      ? `  📊 ${signalLabel} | ${isAr ? 'التقييم' : 'Score'}: ${score} | ${isAr ? 'المخاطر' : 'Risk'}: ${riskLabel} | ${price}`
      : `  📊 ${signalLabel} | Score: ${score} | Risk: ${riskLabel} | ${price}`);

    if (s.entry_reasoning) {
      lines.push(`  💡 ${s.entry_reasoning}`);
    }
    lines.push('');
  }

  lines.push(isAr
    ? '<i>⚠️ التوصيات لأغراض تعليمية فقط ولا تمثل نصيحة استثمارية.</i>'
    : '<i>⚠️ For educational purposes only. Not investment advice.</i>');

  return lines.join('\n');
}

/**
 * Telegram daily summary message.
 */
function telegramDailySummary(data, lang = 'ar') {
  const isAr = lang === 'ar';
  const { date, topStocks, signalCounts, marketStats, topGainers, topLosers } = data;
  const lines = [];

  lines.push(isAr
    ? `<b>📈 ملخص السوق اليومي — ${date}</b>`
    : `<b>📈 Daily Market Summary — ${date}</b>`);
  lines.push('');

  // TASI index
  const tasi = marketStats?.tasiIndex;
  if (tasi) {
    const sign = (tasi.change || 0) >= 0 ? '+' : '';
    const arrow = (tasi.change || 0) >= 0 ? '▲' : '▼';
    lines.push(isAr ? '<b>مؤشر تاسي</b>' : '<b>TASI Index</b>');
    lines.push(`${arrow} ${tasi.indexValue != null ? tasi.indexValue.toLocaleString() : '-'} (${sign}${tasi.change != null ? tasi.change.toFixed(2) : '0'} / ${sign}${tasi.changePercent != null ? tasi.changePercent.toFixed(2) : '0'}%)`);
    lines.push('');
  }

  // Signal distribution
  const signalParts = Object.entries(signalCounts || {})
    .filter(([, count]) => count > 0)
    .map(([signal, count]) => {
      const label = SIGNAL_LABELS[signal] || { ar: signal, en: signal };
      return `${isAr ? label.ar : label.en}: ${count}`;
    });
  if (signalParts.length) {
    lines.push(signalParts.join(' | '));
    lines.push('');
  }

  // Top gainers
  if (topGainers?.length) {
    lines.push(isAr ? '<b>▲ الأكثر ارتفاعاً</b>' : '<b>▲ Top Gainers</b>');
    for (const g of topGainers.slice(0, 3)) {
      lines.push(`  ${g.symbol.replace('.SR', '')} ${g.name}: +${g.change_pct}%`);
    }
    lines.push('');
  }

  // Top losers
  if (topLosers?.length) {
    lines.push(isAr ? '<b>▼ الأكثر انخفاضاً</b>' : '<b>▼ Top Losers</b>');
    for (const l of topLosers.slice(0, 3)) {
      lines.push(`  ${l.symbol.replace('.SR', '')} ${l.name}: ${l.change_pct}%`);
    }
    lines.push('');
  }

  // Top opportunities
  if (topStocks?.length) {
    lines.push(isAr ? '<b>⭐ أفضل الفرص</b>' : '<b>⭐ Top Opportunities</b>');
    for (const s of topStocks.slice(0, 5)) {
      const signal = SIGNAL_LABELS[s.entry_signal] || SIGNAL_LABELS.hold;
      const signalLabel = isAr ? signal.ar : signal.en;
      const score = s.overall_score != null ? s.overall_score.toFixed(1) : '-';
      lines.push(`  <b>${s.symbol.replace('.SR', '')}</b> ${s.name} — ${signalLabel} (${score})`);
    }
    lines.push('');
  }

  lines.push(isAr
    ? '<i>⚠️ التوصيات لأغراض تعليمية فقط ولا تمثل نصيحة استثمارية.</i>'
    : '<i>⚠️ For educational purposes only. Not investment advice.</i>');

  return lines.join('\n');
}

// ── WhatsApp Templates (plain text — no HTML/markdown) ──

/**
 * WhatsApp instant alert message.
 */
function whatsappInstantAlert(stocks, lang = 'ar') {
  const isAr = lang === 'ar';
  const lines = [];

  lines.push(isAr
    ? `🔔 *تنبيه توصيات جديدة*`
    : `🔔 *New Recommendation Alert*`);
  lines.push(isAr
    ? `تم رصد ${stocks.length} ${stocks.length === 1 ? 'توصية جديدة' : 'توصيات جديدة'}`
    : `${stocks.length} new recommendation${stocks.length !== 1 ? 's' : ''} detected`);
  lines.push('');

  for (const s of stocks) {
    const signal = SIGNAL_LABELS[s.entry_signal] || SIGNAL_LABELS.hold;
    const signalLabel = isAr ? signal.ar : signal.en;
    const risk = RISK_LABELS[s.risk_level] || RISK_LABELS.medium;
    const riskLabel = isAr ? risk.ar : risk.en;
    const score = s.overall_score != null ? s.overall_score.toFixed(1) : '-';
    const price = s.latest_price != null ? `${s.latest_price.toFixed(2)} SAR` : '-';
    const symbol = s.symbol.replace('.SR', '');

    lines.push(`*${symbol}* — ${s.name}`);
    if (isAr) {
      lines.push(`  الإشارة: ${signalLabel} | التقييم: ${score} | المخاطر: ${riskLabel} | ${price}`);
    } else {
      lines.push(`  Signal: ${signalLabel} | Score: ${score} | Risk: ${riskLabel} | ${price}`);
    }
    if (s.entry_reasoning) {
      lines.push(`  ${s.entry_reasoning}`);
    }
    lines.push('');
  }

  lines.push(isAr
    ? '⚠️ التوصيات لأغراض تعليمية فقط ولا تمثل نصيحة استثمارية.'
    : '⚠️ For educational purposes only. Not investment advice.');

  return lines.join('\n');
}

/**
 * WhatsApp daily summary message.
 */
function whatsappDailySummary(data, lang = 'ar') {
  const isAr = lang === 'ar';
  const { date, topStocks, signalCounts, marketStats, topGainers, topLosers } = data;
  const lines = [];

  lines.push(isAr
    ? `📈 *ملخص السوق اليومي — ${date}*`
    : `📈 *Daily Market Summary — ${date}*`);
  lines.push('');

  const tasi = marketStats?.tasiIndex;
  if (tasi) {
    const sign = (tasi.change || 0) >= 0 ? '+' : '';
    const arrow = (tasi.change || 0) >= 0 ? '▲' : '▼';
    lines.push(isAr ? '*مؤشر تاسي*' : '*TASI Index*');
    lines.push(`${arrow} ${tasi.indexValue != null ? tasi.indexValue.toLocaleString() : '-'} (${sign}${tasi.change != null ? tasi.change.toFixed(2) : '0'} / ${sign}${tasi.changePercent != null ? tasi.changePercent.toFixed(2) : '0'}%)`);
    lines.push('');
  }

  // Signal counts
  const signalParts = Object.entries(signalCounts || {})
    .filter(([, count]) => count > 0)
    .map(([signal, count]) => {
      const label = SIGNAL_LABELS[signal] || { ar: signal, en: signal };
      return `${isAr ? label.ar : label.en}: ${count}`;
    });
  if (signalParts.length) {
    lines.push(signalParts.join(' | '));
    lines.push('');
  }

  if (topGainers?.length) {
    lines.push(isAr ? '*▲ الأكثر ارتفاعاً*' : '*▲ Top Gainers*');
    for (const g of topGainers.slice(0, 3)) {
      lines.push(`  ${g.symbol.replace('.SR', '')} ${g.name}: +${g.change_pct}%`);
    }
    lines.push('');
  }

  if (topLosers?.length) {
    lines.push(isAr ? '*▼ الأكثر انخفاضاً*' : '*▼ Top Losers*');
    for (const l of topLosers.slice(0, 3)) {
      lines.push(`  ${l.symbol.replace('.SR', '')} ${l.name}: ${l.change_pct}%`);
    }
    lines.push('');
  }

  if (topStocks?.length) {
    lines.push(isAr ? '*⭐ أفضل الفرص*' : '*⭐ Top Opportunities*');
    for (const s of topStocks.slice(0, 5)) {
      const signal = SIGNAL_LABELS[s.entry_signal] || SIGNAL_LABELS.hold;
      const signalLabel = isAr ? signal.ar : signal.en;
      const score = s.overall_score != null ? s.overall_score.toFixed(1) : '-';
      lines.push(`  *${s.symbol.replace('.SR', '')}* ${s.name} — ${signalLabel} (${score})`);
    }
    lines.push('');
  }

  lines.push(isAr
    ? '⚠️ التوصيات لأغراض تعليمية فقط ولا تمثل نصيحة استثمارية.'
    : '⚠️ For educational purposes only. Not investment advice.');

  return lines.join('\n');
}

module.exports = {
  telegramInstantAlert,
  telegramDailySummary,
  whatsappInstantAlert,
  whatsappDailySummary,
};
