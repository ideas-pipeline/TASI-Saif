const API_BASE = '';

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface Stock {
  symbol: string;
  name: string;
  sector: string;
  pe_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;
  market_cap: number | null;
  overall_score: number | null;
  technical_score: number | null;
  fundamental_score: number | null;
  ai_score: number | null;
  risk_level: string | null;
  entry_signal: string | null;
  signal_reasoning: string | null;
}

export interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicator {
  date: string;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  ema_20: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  volume_avg_20: number | null;
}

export interface StockDetail {
  stock: Stock;
  prices: DailyPrice[];
  indicators: TechnicalIndicator[];
  disclaimer: string;
}

export interface SectorData {
  sector: string;
  avg_score: number | null;
  top_stock: string | null;
  trend: string | null;
  avg_rsi: number | null;
  avg_pe: number | null;
  stock_count: number;
  buy_signal_count: number | null;
  summary: string | null;
}

export interface SignalsData {
  strong_buy: Stock[];
  buy: Stock[];
  hold: Stock[];
  sell: Stock[];
  strong_sell: Stock[];
  disclaimer: string;
}

export interface StatsData {
  total_stocks: number;
  total_price_records: number;
  date_range: { min: string; max: string };
  sectors: number;
  last_ingestion: { completed_at: string; status: string } | null;
}

export async function getStocks(params?: { sector?: string; sort?: string; order?: string }): Promise<{ stocks: Stock[]; disclaimer: string }> {
  const qs = new URLSearchParams();
  if (params?.sector) qs.set('sector', params.sector);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.order) qs.set('order', params.order);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return fetchApi(`/api/stocks${query}`);
}

export async function getStock(symbol: string): Promise<StockDetail> {
  return fetchApi(`/api/stocks/${symbol}`);
}

export async function getRankings(limit?: number): Promise<{ rankings: Stock[]; disclaimer: string }> {
  const query = limit ? `?limit=${limit}` : '';
  return fetchApi(`/api/rankings${query}`);
}

export async function getSectors(): Promise<{ sectors: SectorData[]; disclaimer: string }> {
  return fetchApi('/api/sectors');
}

export async function getSignals(): Promise<SignalsData> {
  return fetchApi('/api/signals');
}

export async function getStats(): Promise<StatsData> {
  return fetchApi('/api/stats');
}

export interface FinancialReport {
  symbol: string;
  period_end: string;
  period_type: 'quarterly' | 'annual';
  total_revenue: number | null;
  cost_of_revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  ebitda: number | null;
  eps_basic: number | null;
  eps_diluted: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  total_debt: number | null;
  total_cash: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  operating_cash_flow: number | null;
  capital_expenditure: number | null;
  free_cash_flow: number | null;
  shares_outstanding: number | null;
  book_value_per_share: number | null;
}

export interface ValuationMetrics {
  pe: number | null;
  pb: number | null;
  ps: number | null;
  evToEbitda: number | null;
  dividendYield: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
}

export interface YoYComparison {
  periodEnd: string;
  yoy: {
    revenueGrowth: number | null;
    netIncomeGrowth: number | null;
    marginChange: number | null;
  } | null;
}

export interface FinancialsData {
  stock: { symbol: string; name: string; sector: string };
  reports: FinancialReport[];
  valuation: ValuationMetrics | null;
  yoyComparisons: YoYComparison[];
  disclaimer: string;
}

export async function getFinancials(symbol: string, period?: string): Promise<FinancialsData> {
  const query = period ? `?period=${period}` : '';
  return fetchApi(`/api/stocks/${symbol}/financials${query}`);
}

// ─── Risk Analysis Types ──────��───────────────────────────────────────

export interface VaRResult {
  confidence: number;
  var: number;
  cvar: number;
  horizon: number;
}

export interface StressTestResult {
  scenario: string;
  scenarioAr: string;
  description: string;
  projectedPrice: number;
  loss: number;
  lossPct: number;
  severity: 'low' | 'moderate' | 'high' | 'severe';
}

export interface MaxDrawdown {
  value: number;
  peakDate: string;
  troughDate: string;
}

export interface RiskAnalysis {
  symbol: string;
  name: string;
  sector: string;
  latestPrice: number;
  latestDate: string;
  volatility: number | null;
  beta: number | null;
  riskLevel: string;
  var: {
    daily: VaRResult[] | null;
    tenDay: VaRResult[] | null;
  };
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  maxDrawdown: MaxDrawdown | null;
  stressTests: StressTestResult[];
  disclaimer: string;
}

export interface SectorCorrelations {
  sectors: string[];
  matrix: Record<string, Record<string, number | null>>;
  disclaimer: string;
}

export async function getRiskAnalysis(symbol: string): Promise<RiskAnalysis> {
  return fetchApi(`/api/risk/${symbol}`);
}

export async function getSectorCorrelations(): Promise<SectorCorrelations> {
  return fetchApi('/api/risk/sectors/correlations');
}

// ─── Portfolio Types ──────────────────────────────────────────────────

export interface PortfolioHolding {
  symbol: string;
  name: string;
  weight: number;
  shares_notional: number;
  entry_price: number;
  current_price: number;
  current_value: number;
  pnl: number;
  score_at_entry: number;
  sector: string;
  rationale: string;
}

export interface PortfolioPerformance {
  date: string;
  portfolio_value: number;
  daily_return: number;
  cumulative_return: number;
  tasi_value: number;
  tasi_return: number;
  excess_return: number;
}

export interface PortfolioRebalance {
  rebalance_date: string;
  additions: string[];
  removals: string[];
  weightChanges: { symbol: string; old_weight: number; new_weight: number }[];
  turnover: number;
  reasoning: string;
}

export interface PortfolioData {
  id: number;
  rebalanceDate: string;
  strategy: string;
  stockCount: number;
  diversificationScore: number | null;
  reasoning: string;
  holdings: PortfolioHolding[];
  performance: PortfolioPerformance[];
  rebalance: PortfolioRebalance | null;
  sectorAllocation: Record<string, number>;
  summary: {
    portfolioValue: number;
    cumulativeReturn: number;
    tasiReturn: number;
    excessReturn: number;
    latestDate: string;
  } | null;
  disclaimer: string;
}

export interface PortfolioBacktest {
  startDate: string;
  endDate: string;
  rebalances: number;
  portfolioFinalValue: number;
  tasiFinalValue: number;
  totalReturn: number;
  tasiTotalReturn: number;
  excessReturn: number;
  valueHistory: {
    date: string;
    portfolioValue: number;
    tasiValue: number;
    periodReturn: number;
    tasiPeriodReturn: number;
    excessReturn: number;
  }[];
  disclaimer: string;
}

export async function getPortfolio(): Promise<PortfolioData> {
  return fetchApi('/api/portfolio');
}

export async function getPortfolioBacktest(weeks?: number): Promise<PortfolioBacktest> {
  const query = weeks ? `?weeks=${weeks}` : '';
  return fetchApi(`/api/portfolio/backtest${query}`);
}

// ─── Sector Report Types ──────────────────────────────────────────────

export interface SectorTopBottom {
  symbol: string;
  name: string;
  score: number | null;
  signal: string | null;
  price: number | null;
  rsi: number | null;
}

export interface SectorHistoricalTrend {
  date: string;
  scoreChange: number | null;
  rsiChange: number | null;
  prevTrend: string | null;
  currentTrend: string | null;
}

export interface SectorPricePerformance {
  avgReturn: number | null;
  positiveRatio: number | null;
  stocksCovered: number;
}

export interface SectorQuarterlyEarnings {
  quarters: {
    periodEnd: string;
    revenue: number | null;
    netIncome: number | null;
    avgNetMargin: number | null;
    avgGrossMargin: number | null;
    reportingCompanies: number;
  }[];
  yoyGrowth: {
    revenueGrowth: number | null;
    netIncomeGrowth: number | null;
    marginChange: number | null;
  } | null;
}

export interface SectorReportStock {
  symbol: string;
  name: string;
  score: number | null;
  technical: number | null;
  fundamental: number | null;
  signal: string | null;
  risk: string | null;
  price: number | null;
  pe: number | null;
  rsi: number | null;
  volume: number | null;
  volumeRatio: number | null;
}

export interface SectorReport {
  sector: string;
  stockCount: number;
  trend: string;
  avgScore: number | null;
  avgTechnical: number | null;
  avgFundamental: number | null;
  avgRsi: number | null;
  avgPe: number | null;
  avgDividendYield: number | null;
  avgVolatility: number | null;
  totalMarketCap: number;
  topPerformers: SectorTopBottom[];
  bottomPerformers: SectorTopBottom[];
  signalDistribution: Record<string, number>;
  historicalTrend: Record<string, SectorHistoricalTrend | null>;
  pricePerformance: Record<string, SectorPricePerformance | null>;
  quarterlyEarnings: SectorQuarterlyEarnings;
  stocks: SectorReportStock[];
}

export interface RotationSignal {
  sector: string;
  signal: string;
  momentum: number;
  buyRatio: number;
  rsiMomentum: number;
  avgScore: number | null;
  trend: string;
  priceReturn1w: number | null;
  priceReturn1m: number | null;
}

export interface SectorReportsData {
  date: string | null;
  sectors: SectorReport[];
  rotation: RotationSignal[];
  disclaimer: string;
}

export async function getSectorReports(): Promise<SectorReportsData> {
  return fetchApi('/api/sectors/reports');
}

export async function getSectorReportDetail(sector: string): Promise<SectorReport & { date: string; disclaimer: string }> {
  return fetchApi(`/api/sectors/${encodeURIComponent(sector)}/report`);
}
