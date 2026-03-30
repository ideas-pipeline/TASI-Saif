const cron = require('node-cron');
const { ingest } = require('./ingest');
const { dispatchDailySummary, dispatchRebalanceAlerts } = require('./notifications/dispatcher');

/**
 * Schedule daily ingestion after Saudi market close.
 * Saudi market closes at 3:00 PM AST (UTC+3) = 12:00 PM UTC.
 * We run at 12:30 PM UTC (3:30 PM AST) to allow for settlement.
 */
function startScheduler() {
  console.log('TASI Data Pipeline Scheduler started');
  console.log('Scheduled: Daily at 12:30 UTC (3:30 PM AST) after market close');

  // Cron: minute 30, hour 12, every day, Mon-Thu + Sun (Saudi trading days)
  // Saudi market trades Sun-Thu
  cron.schedule('30 12 * * 0,1,2,3,4', async () => {
    console.log(`\n[${new Date().toISOString()}] Running scheduled daily ingestion...`);

    // Fetch only yesterday's and today's data for daily update
    const today = new Date().toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

    try {
      const result = await ingest({
        startDate: twoDaysAgo,
        endDate: today,
        skipFundamentals: false,
      });
      console.log(`Daily ingestion finished: ${result.totalRows} rows updated`);
    } catch (err) {
      console.error(`Daily ingestion failed: ${err.message}`);
    }
  });

  // Daily summary emails at 1:00 PM UTC (4:00 PM AST) — after analysis completes
  cron.schedule('0 13 * * 0,1,2,3,4', async () => {
    console.log(`\n[${new Date().toISOString()}] Sending daily summary emails...`);
    try {
      const result = await dispatchDailySummary();
      console.log(`Daily summary: ${result.sent} sent, ${result.skipped} skipped`);
    } catch (err) {
      console.error(`Daily summary failed: ${err.message}`);
    }
  });

  // Weekly portfolio rebalance — Thursdays at 13:30 UTC (4:30 PM AST)
  // Runs after daily analysis to ensure fresh scores
  cron.schedule('30 13 * * 4', async () => {
    console.log(`\n[${new Date().toISOString()}] Running weekly portfolio rebalance...`);
    try {
      const { buildModelPortfolio } = require('./analysis/portfolio');
      const result = await buildModelPortfolio({ useAi: !!process.env.ANTHROPIC_API_KEY });
      if (result) {
        console.log(`Portfolio rebalanced: ${result.holdings.length} stocks, diversification ${result.diversificationScore?.toFixed(1)}/10`);
        // Dispatch rebalance notifications
        const notifyResult = await dispatchRebalanceAlerts(result);
        console.log(`Rebalance alerts: ${notifyResult.sent} sent, ${notifyResult.skipped} skipped`);
      }
    } catch (err) {
      console.error(`Portfolio rebalance failed: ${err.message}`);
    }
  });

  // Keep process alive
  console.log('Scheduler is running. Press Ctrl+C to stop.');
}

// Allow running directly
if (require.main === module) {
  startScheduler();
}

module.exports = { startScheduler };
