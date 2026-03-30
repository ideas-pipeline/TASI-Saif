const Anthropic = require('@anthropic-ai/sdk');
const { getDb, initSchema } = require('../db/schema');
const { scoreFundamentals } = require('./fundamental');

const CMA_DISCLAIMER = `تنويه: هذا التحليل لأغراض تعليمية ومعلوماتية فقط وليس نصيحة استثمارية. يجب عليك استشارة مستشار مالي مرخص قبل اتخاذ أي قرارات استثمارية. لا يتحمل المؤلف أي مسؤولية عن أي خسائر ناتجة عن استخدام هذه المعلومات.
Disclaimer: This analysis is for educational and informational purposes only and does not constitute financial advice. Consult a licensed financial advisor before making any investment decisions. The author assumes no responsibility for any losses resulting from use of this information.`;

/**
 * Score technical indicators on a 1-10 scale.
 */
function scoreTechnical(indicators) {
  if (!indicators) return 5;

  let score = 5;

  // RSI scoring
  if (indicators.rsi_14 !== null) {
    if (indicators.rsi_14 < 30) score += 1.5; // oversold = opportunity
    else if (indicators.rsi_14 < 40) score += 0.5;
    else if (indicators.rsi_14 > 70) score -= 1.5; // overbought = caution
    else if (indicators.rsi_14 > 60) score -= 0.5;
  }

  // MACD scoring
  if (indicators.macd_hist !== null) {
    if (indicators.macd_hist > 0 && indicators.macd_line > 0) score += 1;
    else if (indicators.macd_hist > 0) score += 0.5;
    else if (indicators.macd_hist < 0 && indicators.macd_line < 0) score -= 1;
    else if (indicators.macd_hist < 0) score -= 0.5;
  }

  // Bollinger Band position
  if (indicators.bb_lower !== null && indicators.bb_upper !== null) {
    const latestClose = indicators._close;
    if (latestClose) {
      const bbRange = indicators.bb_upper - indicators.bb_lower;
      if (bbRange > 0) {
        const bbPosition = (latestClose - indicators.bb_lower) / bbRange;
        if (bbPosition < 0.2) score += 1; // near lower band = potential bounce
        else if (bbPosition > 0.8) score -= 0.5; // near upper band
      }
    }
  }

  // SMA trend
  if (indicators.sma_20 !== null && indicators.sma_50 !== null) {
    if (indicators.sma_20 > indicators.sma_50) score += 0.5; // bullish crossover
    else score -= 0.5;
  }
  if (indicators.sma_50 !== null && indicators.sma_200 !== null) {
    if (indicators.sma_50 > indicators.sma_200) score += 0.5; // golden cross
    else score -= 0.5;
  }

  // Volume ratio
  if (indicators.volume_ratio !== null) {
    if (indicators.volume_ratio > 2) score += 0.5; // high interest
    else if (indicators.volume_ratio < 0.5) score -= 0.3; // low interest
  }

  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Use Claude API to generate AI-powered stock analysis.
 */
async function getAiScore(stock, indicators, fundamentalScore, technicalScore, riskData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      score: Math.round((technicalScore + fundamentalScore) / 2 * 10) / 10,
      reasoning: 'AI scoring unavailable (no API key). Score is average of technical and fundamental.',
    };
  }

  const client = new Anthropic({ apiKey });

  const prompt = `You are a stock analyst assistant for the Saudi stock market (TASI/Tadawul).

Analyze this stock and provide an investment opportunity score from 1-10 (10 = strongest opportunity) with brief reasoning.

Stock: ${stock.name} (${stock.symbol})
Sector: ${stock.sector}

Fundamental Data:
- P/E Ratio: ${stock.pe_ratio ?? 'N/A'}
- EPS: ${stock.eps ?? 'N/A'}
- Dividend Yield: ${stock.dividend_yield ? (stock.dividend_yield * 100).toFixed(2) + '%' : 'N/A'}
- Market Cap: ${stock.market_cap ? (stock.market_cap / 1e9).toFixed(2) + 'B SAR' : 'N/A'}
- Fundamental Score: ${fundamentalScore}/10

Technical Indicators (latest):
- RSI(14): ${indicators?.rsi_14?.toFixed(1) ?? 'N/A'}
- MACD: ${indicators?.macd_line?.toFixed(3) ?? 'N/A'} / Signal: ${indicators?.macd_signal?.toFixed(3) ?? 'N/A'}
- SMA(20): ${indicators?.sma_20?.toFixed(2) ?? 'N/A'}, SMA(50): ${indicators?.sma_50?.toFixed(2) ?? 'N/A'}, SMA(200): ${indicators?.sma_200?.toFixed(2) ?? 'N/A'}
- Bollinger: ${indicators?.bb_lower?.toFixed(2) ?? 'N/A'} - ${indicators?.bb_upper?.toFixed(2) ?? 'N/A'}
- Volume Ratio (vs 20d avg): ${indicators?.volume_ratio?.toFixed(2) ?? 'N/A'}x
- Technical Score: ${technicalScore}/10

Risk:
- Volatility: ${riskData?.volatility?.toFixed(3) ?? 'N/A'}
- Beta: ${riskData?.beta?.toFixed(2) ?? 'N/A'}
- Risk Level: ${riskData?.riskLevel ?? 'N/A'}

Respond in JSON format: {"score": <number 1-10>, "reasoning": "<2-3 sentences in English>", "reasoning_ar": "<2-3 sentences in Arabic>"}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const json = JSON.parse(text);
    return {
      score: Math.max(1, Math.min(10, json.score)),
      reasoning: json.reasoning + (json.reasoning_ar ? `\n${json.reasoning_ar}` : ''),
    };
  } catch (err) {
    console.error(`  AI scoring failed for ${stock.symbol}: ${err.message}`);
    return {
      score: Math.round((technicalScore + fundamentalScore) / 2 * 10) / 10,
      reasoning: `AI scoring failed (${err.message}). Score is average of technical and fundamental.`,
    };
  }
}

/**
 * Compute and store scores for all stocks.
 */
async function scoreAllStocks({ useAi = false } = {}) {
  const db = getDb();
  initSchema(db);

  const stocks = db.prepare('SELECT * FROM stocks').all();
  const { computeAllRiskMetrics } = require('./risk');

  console.log('Computing risk metrics...');
  const riskMetrics = computeAllRiskMetrics();
  const riskMap = {};
  for (const r of riskMetrics) riskMap[r.symbol] = r;

  const latestDate = db.prepare(
    'SELECT MAX(date) as date FROM technical_indicators'
  ).get()?.date;

  if (!latestDate) {
    console.error('No technical indicators found. Run technical analysis first.');
    db.close();
    return [];
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO stock_scores
    (symbol, date, technical_score, fundamental_score, ai_score, overall_score,
     risk_level, volatility, beta, ai_reasoning, entry_signal, entry_reasoning)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const results = [];
  for (const stock of stocks) {
    const indicators = db.prepare(
      'SELECT * FROM technical_indicators WHERE symbol = ? AND date = ?'
    ).get(stock.symbol, latestDate);

    const latestPrice = db.prepare(
      'SELECT close FROM daily_prices WHERE symbol = ? ORDER BY date DESC LIMIT 1'
    ).get(stock.symbol);

    if (indicators && latestPrice) {
      indicators._close = latestPrice.close;
    }

    const techScore = scoreTechnical(indicators);
    const fundScore = scoreFundamentals(stock);
    const risk = riskMap[stock.symbol] || {};

    let aiResult;
    if (useAi) {
      console.log(`  AI scoring ${stock.symbol}...`);
      aiResult = await getAiScore(stock, indicators, fundScore, techScore, risk);
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    } else {
      aiResult = {
        score: Math.round((techScore + fundScore) / 2 * 10) / 10,
        reasoning: 'AI scoring not enabled. Score is weighted average of technical and fundamental.',
      };
    }

    // Overall: weighted average (tech 35%, fundamental 30%, AI 35%)
    const overall = Math.round(
      (techScore * 0.35 + fundScore * 0.30 + aiResult.score * 0.35) * 10
    ) / 10;

    // Entry signal based on overall score and technicals
    const { signal, signalReasoning } = determineEntrySignal(
      overall, techScore, indicators, risk.riskLevel
    );

    insert.run(
      stock.symbol, latestDate,
      techScore, fundScore, aiResult.score, overall,
      risk.riskLevel || 'medium',
      risk.volatility || null,
      risk.beta || null,
      aiResult.reasoning,
      signal,
      signalReasoning
    );

    results.push({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      technicalScore: techScore,
      fundamentalScore: fundScore,
      aiScore: aiResult.score,
      overallScore: overall,
      riskLevel: risk.riskLevel,
      entrySignal: signal,
    });

    console.log(`  ${stock.symbol}: tech=${techScore} fund=${fundScore} ai=${aiResult.score} overall=${overall} signal=${signal} risk=${risk.riskLevel}`);
  }

  db.close();
  return results;
}

/**
 * Determine entry signal based on scores and indicators.
 */
function determineEntrySignal(overallScore, techScore, indicators, riskLevel) {
  let signal;
  let reasons = [];

  if (overallScore >= 8) {
    signal = 'strong_buy';
    reasons.push('High overall score indicates strong opportunity');
  } else if (overallScore >= 6.5) {
    signal = 'buy';
    reasons.push('Above-average overall score');
  } else if (overallScore >= 4) {
    signal = 'hold';
    reasons.push('Neutral overall score');
  } else if (overallScore >= 2.5) {
    signal = 'sell';
    reasons.push('Below-average score');
  } else {
    signal = 'strong_sell';
    reasons.push('Low overall score indicates significant risk');
  }

  // Technical overrides
  if (indicators) {
    if (indicators.rsi_14 !== null && indicators.rsi_14 < 30) {
      reasons.push('RSI oversold — potential reversal opportunity');
      if (signal === 'hold') signal = 'buy';
    }
    if (indicators.rsi_14 !== null && indicators.rsi_14 > 70) {
      reasons.push('RSI overbought — potential pullback');
      if (signal === 'hold') signal = 'sell';
    }
    if (indicators.macd_hist !== null && indicators.macd_hist > 0 &&
        indicators.macd_line !== null && indicators.macd_line > 0) {
      reasons.push('MACD bullish momentum');
    }
    if (indicators.volume_ratio !== null && indicators.volume_ratio > 2) {
      reasons.push('Elevated volume suggests strong market interest');
    }
  }

  // Risk adjustment
  if (riskLevel === 'high' && (signal === 'strong_buy' || signal === 'buy')) {
    reasons.push('High risk — position sizing caution advised');
  }

  return { signal, signalReasoning: reasons.join('. ') + '.' };
}

module.exports = {
  scoreTechnical, getAiScore, scoreAllStocks,
  determineEntrySignal, CMA_DISCLAIMER
};
