/**
 * Arabic RTL email templates for TASI Platform notifications.
 * All templates produce self-contained HTML with inline styles for email client compatibility.
 */

const SIGNAL_LABELS = {
  strong_buy: { ar: 'شراء قوي', en: 'Strong Buy', color: '#22c55e', bg: '#f0fdf4' },
  buy: { ar: 'شراء', en: 'Buy', color: '#4ade80', bg: '#f0fdf4' },
  hold: { ar: 'احتفاظ', en: 'Hold', color: '#f59e0b', bg: '#fffbeb' },
  sell: { ar: 'بيع', en: 'Sell', color: '#f87171', bg: '#fef2f2' },
  strong_sell: { ar: 'بيع قوي', en: 'Strong Sell', color: '#ef4444', bg: '#fef2f2' },
};

const RISK_LABELS = {
  low: { ar: 'منخفض', en: 'Low', color: '#22c55e' },
  medium: { ar: 'متوسط', en: 'Medium', color: '#f59e0b' },
  high: { ar: 'مرتفع', en: 'High', color: '#ef4444' },
};

function baseLayout(content, lang = 'ar') {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const fontFamily = lang === 'ar'
    ? "'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif"
    : "'Segoe UI', Tahoma, sans-serif";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TASI Platform</title>
</head>
<body style="margin:0;padding:0;background:#111827;font-family:${fontFamily};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#1f2937;border-radius:12px;overflow:hidden;border:1px solid #374151;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#d4a843,#b8922e);padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#111827;font-size:24px;font-weight:700;">
                ${lang === 'ar' ? 'منصة تحليل تداول' : 'TASI Analysis Platform'}
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#e5e7eb;font-size:15px;line-height:1.6;direction:${dir};">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#111827;border-top:1px solid #374151;text-align:center;color:#6b7280;font-size:12px;">
              <p style="margin:0 0 8px 0;">
                ${lang === 'ar'
                  ? 'تنبيه: التوصيات المقدمة هي لأغراض تعليمية فقط ولا تمثل نصيحة استثمارية.'
                  : 'Disclaimer: Recommendations are for educational purposes only and do not constitute investment advice.'}
              </p>
              <p style="margin:0;color:#4b5563;">
                ${lang === 'ar'
                  ? 'لا تعتبر هذه المعلومات توصية من هيئة السوق المالية (CMA).'
                  : 'This information is not a recommendation from the Capital Market Authority (CMA).'}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function stockRow(stock, lang = 'ar') {
  const signal = SIGNAL_LABELS[stock.entry_signal] || SIGNAL_LABELS.hold;
  const risk = RISK_LABELS[stock.risk_level] || RISK_LABELS.medium;
  const signalLabel = lang === 'ar' ? signal.ar : signal.en;
  const riskLabel = lang === 'ar' ? risk.ar : risk.en;
  const score = stock.overall_score != null ? stock.overall_score.toFixed(1) : 'N/A';
  const price = stock.latest_price != null ? `${stock.latest_price.toFixed(2)} SAR` : '-';

  return `
    <tr style="border-bottom:1px solid #374151;">
      <td style="padding:12px 8px;color:#f9fafb;font-weight:600;">${stock.symbol.replace('.SR', '')}</td>
      <td style="padding:12px 8px;color:#d1d5db;">${stock.name}</td>
      <td style="padding:12px 8px;text-align:center;">
        <span style="display:inline-block;padding:4px 12px;border-radius:12px;background:${signal.bg};color:${signal.color};font-size:13px;font-weight:600;">
          ${signalLabel}
        </span>
      </td>
      <td style="padding:12px 8px;text-align:center;color:#d4a843;font-weight:700;">${score}</td>
      <td style="padding:12px 8px;text-align:center;color:${risk.color};">${riskLabel}</td>
      <td style="padding:12px 8px;text-align:center;color:#d1d5db;">${price}</td>
    </tr>`;
}

/**
 * Instant alert email — sent when new buy/sell signals are detected.
 */
function instantAlertTemplate(stocks, lang = 'ar') {
  const isAr = lang === 'ar';
  const title = isAr ? 'تنبيه توصيات جديدة' : 'New Recommendation Alert';
  const subtitle = isAr
    ? `تم رصد ${stocks.length} ${stocks.length === 1 ? 'توصية جديدة' : 'توصيات جديدة'}`
    : `${stocks.length} new recommendation${stocks.length !== 1 ? 's' : ''} detected`;

  const tableHeaders = isAr
    ? ['الرمز', 'الاسم', 'الإشارة', 'التقييم', 'المخاطر', 'السعر']
    : ['Symbol', 'Name', 'Signal', 'Score', 'Risk', 'Price'];

  const content = `
    <h2 style="margin:0 0 8px 0;color:#d4a843;font-size:20px;">${title}</h2>
    <p style="margin:0 0 24px 0;color:#9ca3af;">${subtitle}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#111827;">
          ${tableHeaders.map(h => `<th style="padding:10px 8px;color:#9ca3af;font-size:12px;text-transform:uppercase;text-align:${h === tableHeaders[0] ? (isAr ? 'right' : 'left') : 'center'};border-bottom:2px solid #374151;">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${stocks.map(s => stockRow(s, lang)).join('')}
      </tbody>
    </table>

    ${stocks.filter(s => s.entry_reasoning).map(s => `
      <div style="margin-top:20px;padding:16px;background:#111827;border-radius:8px;border-${isAr ? 'right' : 'left'}:4px solid #d4a843;">
        <p style="margin:0 0 4px 0;color:#d4a843;font-weight:700;">${s.symbol.replace('.SR', '')} — ${s.name}</p>
        <p style="margin:0;color:#d1d5db;font-size:14px;">${s.entry_reasoning}</p>
      </div>
    `).join('')}

    <p style="margin:24px 0 0 0;text-align:center;">
      <a href="${process.env.TASI_DASHBOARD_URL || 'http://localhost:3001'}/recommendations" style="display:inline-block;padding:12px 32px;background:#d4a843;color:#111827;text-decoration:none;border-radius:8px;font-weight:700;">
        ${isAr ? 'عرض جميع التوصيات' : 'View All Recommendations'}
      </a>
    </p>`;

  return {
    subject: isAr
      ? `تنبيه: ${stocks.length} توصيات جديدة — منصة تداول`
      : `Alert: ${stocks.length} New Recommendations — TASI Platform`,
    html: baseLayout(content, lang),
    text: stocks.map(s => `${s.symbol} (${s.name}): ${s.entry_signal} — Score: ${s.overall_score}`).join('\n'),
  };
}

/**
 * Daily market summary email.
 * Includes: TASI index performance, top gainers/losers, volume leaders,
 * top recommendations with rationale, and sector performance.
 */
function dailySummaryTemplate({ date, topStocks, sectorSummary, signalCounts, marketStats, topGainers, topLosers, volumeLeaders }, lang = 'ar') {
  const isAr = lang === 'ar';
  const title = isAr ? 'ملخص السوق اليومي' : 'Daily Market Summary';

  // TASI Index overview section
  const tasiIndex = marketStats?.tasiIndex;
  const indexSection = tasiIndex ? (() => {
    const changeColor = (tasiIndex.change || 0) >= 0 ? '#22c55e' : '#ef4444';
    const changeSign = (tasiIndex.change || 0) >= 0 ? '+' : '';
    const changeArrow = (tasiIndex.change || 0) >= 0 ? '▲' : '▼';
    const volumeFormatted = tasiIndex.volume ? formatVolume(tasiIndex.volume) : '-';
    return `
      <div style="margin-bottom:24px;padding:20px;background:#111827;border-radius:12px;border:1px solid #374151;">
        <div style="text-align:center;margin-bottom:12px;">
          <span style="color:#9ca3af;font-size:13px;text-transform:uppercase;">${isAr ? 'مؤشر تاسي' : 'TASI Index'}</span>
        </div>
        <div style="text-align:center;margin-bottom:8px;">
          <span style="color:#f9fafb;font-size:32px;font-weight:700;">${tasiIndex.indexValue != null ? tasiIndex.indexValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span>
        </div>
        <div style="text-align:center;">
          <span style="color:${changeColor};font-size:16px;font-weight:600;">
            ${changeArrow} ${changeSign}${tasiIndex.change != null ? tasiIndex.change.toFixed(2) : '0.00'}
            (${changeSign}${tasiIndex.changePercent != null ? tasiIndex.changePercent.toFixed(2) : '0.00'}%)
          </span>
          <span style="color:#6b7280;margin:0 12px;">|</span>
          <span style="color:#9ca3af;font-size:14px;">${isAr ? 'حجم التداول' : 'Volume'}: ${volumeFormatted}</span>
        </div>
      </div>`;
  })() : '';

  const signalSummary = Object.entries(signalCounts || {})
    .filter(([, count]) => count > 0)
    .map(([signal, count]) => {
      const label = SIGNAL_LABELS[signal] || { ar: signal, en: signal, color: '#9ca3af' };
      return `<span style="display:inline-block;margin:4px;padding:6px 14px;border-radius:16px;background:#111827;color:${label.color};font-size:13px;">
        ${isAr ? label.ar : label.en}: ${count}
      </span>`;
    }).join('');

  // Top gainers/losers section
  const moversSection = buildMoversSection(topGainers, topLosers, isAr);

  // Volume leaders section
  const volumeSection = buildVolumeSection(volumeLeaders, isAr);

  const sectorRows = (sectorSummary || []).map(s => {
    const trendColor = s.trend === 'bullish' ? '#22c55e' : s.trend === 'bearish' ? '#ef4444' : '#f59e0b';
    const trendLabel = isAr
      ? (s.trend === 'bullish' ? 'صاعد' : s.trend === 'bearish' ? 'هابط' : 'محايد')
      : s.trend;
    return `
      <tr style="border-bottom:1px solid #374151;">
        <td style="padding:10px 8px;color:#f9fafb;">${s.sector}</td>
        <td style="padding:10px 8px;text-align:center;color:#d4a843;">${s.avg_score != null ? s.avg_score.toFixed(1) : '-'}</td>
        <td style="padding:10px 8px;text-align:center;color:${trendColor};">${trendLabel}</td>
        <td style="padding:10px 8px;text-align:center;color:#d1d5db;">${s.stock_count || '-'}</td>
      </tr>`;
  }).join('');

  const tableHeaders = isAr
    ? ['الرمز', 'الاسم', 'الإشارة', 'التقييم', 'المخاطر', 'السعر']
    : ['Symbol', 'Name', 'Signal', 'Score', 'Risk', 'Price'];

  const sectorHeaders = isAr
    ? ['القطاع', 'التقييم', 'الاتجاه', 'الأسهم']
    : ['Sector', 'Score', 'Trend', 'Stocks'];

  // Recommendation rationale cards for top stocks
  const rationaleCards = (topStocks || [])
    .filter(s => s.entry_reasoning)
    .slice(0, 5)
    .map(s => {
      const signal = SIGNAL_LABELS[s.entry_signal] || SIGNAL_LABELS.hold;
      return `
      <div style="margin-top:12px;padding:14px;background:#111827;border-radius:8px;border-${isAr ? 'right' : 'left'}:4px solid ${signal.color};">
        <div style="margin-bottom:6px;">
          <span style="color:#f9fafb;font-weight:700;">${s.symbol.replace('.SR', '')}</span>
          <span style="color:#9ca3af;"> — ${s.name}</span>
          <span style="display:inline-block;margin-${isAr ? 'right' : 'left'}:8px;padding:2px 10px;border-radius:10px;background:${signal.bg};color:${signal.color};font-size:12px;font-weight:600;">
            ${isAr ? signal.ar : signal.en}
          </span>
        </div>
        <p style="margin:0;color:#d1d5db;font-size:13px;line-height:1.5;">${s.entry_reasoning}</p>
      </div>`;
    }).join('');

  const content = `
    <h2 style="margin:0 0 8px 0;color:#d4a843;font-size:20px;">${title}</h2>
    <p style="margin:0 0 24px 0;color:#9ca3af;">${date}</p>

    <!-- TASI Index Performance -->
    ${indexSection}

    <!-- Signal distribution -->
    <div style="margin-bottom:24px;text-align:center;">
      ${signalSummary}
    </div>

    <!-- Market movers: Gainers & Losers -->
    ${moversSection}

    <!-- Volume leaders -->
    ${volumeSection}

    <!-- Top recommendations -->
    <h3 style="margin:0 0 12px 0;color:#e5e7eb;font-size:16px;">
      ${isAr ? 'أفضل الفرص اليوم' : "Today's Top Opportunities"}
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#111827;">
          ${tableHeaders.map(h => `<th style="padding:10px 8px;color:#9ca3af;font-size:12px;text-transform:uppercase;border-bottom:2px solid #374151;">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${(topStocks || []).map(s => stockRow(s, lang)).join('')}
      </tbody>
    </table>

    <!-- Recommendation rationale -->
    ${rationaleCards ? `
    <h3 style="margin:24px 0 8px 0;color:#e5e7eb;font-size:16px;">
      ${isAr ? 'تفاصيل التوصيات' : 'Recommendation Rationale'}
    </h3>
    ${rationaleCards}
    ` : ''}

    <!-- Sector summary -->
    <h3 style="margin:32px 0 12px 0;color:#e5e7eb;font-size:16px;">
      ${isAr ? 'أداء القطاعات' : 'Sector Performance'}
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="background:#111827;">
          ${sectorHeaders.map(h => `<th style="padding:10px 8px;color:#9ca3af;font-size:12px;text-transform:uppercase;border-bottom:2px solid #374151;">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${sectorRows}
      </tbody>
    </table>

    <p style="margin:24px 0 0 0;text-align:center;">
      <a href="${process.env.TASI_DASHBOARD_URL || 'http://localhost:3001'}" style="display:inline-block;padding:12px 32px;background:#d4a843;color:#111827;text-decoration:none;border-radius:8px;font-weight:700;">
        ${isAr ? 'فتح لوحة التحكم' : 'Open Dashboard'}
      </a>
    </p>`;

  // Build rich plain-text version
  const textParts = [`${title} — ${date}\n`];
  if (tasiIndex) {
    const sign = (tasiIndex.change || 0) >= 0 ? '+' : '';
    textParts.push(`TASI: ${tasiIndex.indexValue} (${sign}${tasiIndex.change} / ${sign}${tasiIndex.changePercent}%)\n`);
  }
  if (topGainers?.length) {
    textParts.push(`\n${isAr ? 'الأكثر ارتفاعاً' : 'Top Gainers'}:`);
    topGainers.forEach(g => textParts.push(`  ${g.symbol.replace('.SR', '')} ${g.name}: +${g.change_pct}%`));
  }
  if (topLosers?.length) {
    textParts.push(`\n${isAr ? 'الأكثر انخفاضاً' : 'Top Losers'}:`);
    topLosers.forEach(l => textParts.push(`  ${l.symbol.replace('.SR', '')} ${l.name}: ${l.change_pct}%`));
  }
  textParts.push(`\n${isAr ? 'أفضل الفرص' : 'Top Opportunities'}:`);
  (topStocks || []).forEach(s => textParts.push(`  ${s.symbol} (${s.name}): ${s.entry_signal} — Score: ${s.overall_score}`));

  return {
    subject: isAr
      ? `ملخص السوق — ${date} — منصة تداول`
      : `Market Summary — ${date} — TASI Platform`,
    html: baseLayout(content, lang),
    text: textParts.join('\n'),
  };
}

/**
 * Format large volume numbers for display.
 */
function formatVolume(volume) {
  if (volume >= 1e9) return (volume / 1e9).toFixed(2) + 'B';
  if (volume >= 1e6) return (volume / 1e6).toFixed(2) + 'M';
  if (volume >= 1e3) return (volume / 1e3).toFixed(1) + 'K';
  return String(volume);
}

/**
 * Build top gainers / losers HTML section.
 */
function buildMoversSection(topGainers, topLosers, isAr) {
  if ((!topGainers || topGainers.length === 0) && (!topLosers || topLosers.length === 0)) return '';

  function moverRow(stock, isGainer) {
    const color = isGainer ? '#22c55e' : '#ef4444';
    const sign = isGainer ? '+' : '';
    return `
      <tr style="border-bottom:1px solid #374151;">
        <td style="padding:8px;color:#f9fafb;font-weight:600;">${stock.symbol.replace('.SR', '')}</td>
        <td style="padding:8px;color:#d1d5db;">${stock.name}</td>
        <td style="padding:8px;text-align:center;color:#d1d5db;">${stock.close_price != null ? stock.close_price.toFixed(2) : '-'}</td>
        <td style="padding:8px;text-align:center;color:${color};font-weight:700;">${sign}${stock.change_pct}%</td>
      </tr>`;
  }

  const moverHeaders = isAr
    ? ['الرمز', 'الاسم', 'السعر', 'التغيير']
    : ['Symbol', 'Name', 'Price', 'Change'];

  const headerCells = moverHeaders.map(h =>
    `<th style="padding:8px;color:#9ca3af;font-size:12px;text-transform:uppercase;border-bottom:2px solid #374151;">${h}</th>`
  ).join('');

  let html = '';

  if (topGainers && topGainers.length > 0) {
    html += `
    <h3 style="margin:0 0 8px 0;color:#22c55e;font-size:16px;">
      ${isAr ? '▲ الأكثر ارتفاعاً' : '▲ Top Gainers'}
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
      <thead><tr style="background:#111827;">${headerCells}</tr></thead>
      <tbody>${topGainers.map(s => moverRow(s, true)).join('')}</tbody>
    </table>`;
  }

  if (topLosers && topLosers.length > 0) {
    html += `
    <h3 style="margin:0 0 8px 0;color:#ef4444;font-size:16px;">
      ${isAr ? '▼ الأكثر انخفاضاً' : '▼ Top Losers'}
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <thead><tr style="background:#111827;">${headerCells}</tr></thead>
      <tbody>${topLosers.map(s => moverRow(s, false)).join('')}</tbody>
    </table>`;
  }

  return html;
}

/**
 * Build volume leaders HTML section.
 */
function buildVolumeSection(volumeLeaders, isAr) {
  if (!volumeLeaders || volumeLeaders.length === 0) return '';

  const volHeaders = isAr
    ? ['الرمز', 'الاسم', 'السعر', 'حجم التداول']
    : ['Symbol', 'Name', 'Price', 'Volume'];

  const headerCells = volHeaders.map(h =>
    `<th style="padding:8px;color:#9ca3af;font-size:12px;text-transform:uppercase;border-bottom:2px solid #374151;">${h}</th>`
  ).join('');

  const rows = volumeLeaders.map(s => `
    <tr style="border-bottom:1px solid #374151;">
      <td style="padding:8px;color:#f9fafb;font-weight:600;">${s.symbol.replace('.SR', '')}</td>
      <td style="padding:8px;color:#d1d5db;">${s.name}</td>
      <td style="padding:8px;text-align:center;color:#d1d5db;">${s.close_price != null ? s.close_price.toFixed(2) : '-'}</td>
      <td style="padding:8px;text-align:center;color:#d4a843;font-weight:600;">${formatVolume(s.volume)}</td>
    </tr>`).join('');

  return `
    <h3 style="margin:0 0 8px 0;color:#e5e7eb;font-size:16px;">
      ${isAr ? 'الأكثر تداولاً' : 'Volume Leaders'}
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <thead><tr style="background:#111827;">${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

module.exports = {
  instantAlertTemplate,
  dailySummaryTemplate,
  SIGNAL_LABELS,
  RISK_LABELS,
  formatVolume,
};
