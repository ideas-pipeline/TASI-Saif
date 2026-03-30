export const sectorNames: Record<string, string> = {
  Banking: 'البنوك',
  Materials: 'المواد الأساسية',
  'Food & Beverages': 'الأغذية والمشروبات',
  Insurance: 'التأمين',
  Retailing: 'التجزئة',
  'Real Estate': 'العقارات',
  Telecommunications: 'الاتصالات',
  Energy: 'الطاقة',
  Healthcare: 'الرعاية الصحية',
  Transportation: 'النقل',
  Utilities: 'المرافق العامة',
  'Capital Goods': 'السلع الرأسمالية',
  'Diversified Financials': 'التمويل المتنوع',
  Technology: 'التقنية',
};

export const signalLabels: Record<string, string> = {
  strong_buy: 'شراء قوي',
  buy: 'شراء',
  hold: 'احتفاظ',
  sell: 'بيع',
  strong_sell: 'بيع قوي',
};

export const signalColors: Record<string, string> = {
  strong_buy: 'bg-emerald-500',
  buy: 'bg-green-500',
  hold: 'bg-yellow-500',
  sell: 'bg-orange-500',
  strong_sell: 'bg-red-500',
};

export const riskLabels: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'مرتفع',
};

export const riskColors: Record<string, string> = {
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-red-400',
};

export const trendLabels: Record<string, string> = {
  bullish: 'صاعد',
  neutral: 'محايد',
  bearish: 'هابط',
};

export const trendColors: Record<string, string> = {
  bullish: 'text-green-400',
  neutral: 'text-yellow-400',
  bearish: 'text-red-400',
};

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('ar-SA').format(n);
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(2)}٪`;
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatMarketCap(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} تريليون`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} مليار`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} مليون`;
  return formatNumber(n);
}

export function getSectorArabic(sector: string): string {
  return sectorNames[sector] || sector;
}

// Financial report labels (Arabic)
export const financialLabels: Record<string, string> = {
  total_revenue: 'إجمالي الإيرادات',
  cost_of_revenue: 'تكلفة الإيرادات',
  gross_profit: 'إجمالي الربح',
  operating_income: 'الدخل التشغيلي',
  net_income: 'صافي الدخل',
  ebitda: 'الأرباح قبل الفوائد والضرائب',
  eps_basic: 'ربحية السهم',
  gross_margin: 'هامش الربح الإجمالي',
  operating_margin: 'هامش الربح التشغيلي',
  net_margin: 'هامش صافي الربح',
  total_assets: 'إجمالي الأصول',
  total_liabilities: 'إجمالي الالتزامات',
  total_equity: 'حقوق المساهمين',
  total_debt: 'إجمالي الديون',
  total_cash: 'النقد والمعادلات',
  current_assets: 'الأصول المتداولة',
  current_liabilities: 'الالتزامات المتداولة',
  operating_cash_flow: 'التدفقات النقدية التشغيلية',
  capital_expenditure: 'الإنفاق الرأسمالي',
  free_cash_flow: 'التدفقات النقدية الحرة',
};

export const valuationLabels: Record<string, string> = {
  pe: 'مكرر الربحية (P/E)',
  pb: 'السعر إلى القيمة الدفترية (P/B)',
  ps: 'السعر إلى المبيعات (P/S)',
  evToEbitda: 'قيمة المنشأة / EBITDA',
  dividendYield: 'عائد التوزيعات',
  roe: 'العائد على حقوق المساهمين',
  roa: 'العائد على الأصول',
  debtToEquity: 'الديون إلى حقوق المساهمين',
  currentRatio: 'نسبة التداول',
};

export const periodLabels: Record<string, string> = {
  quarterly: 'ربع سنوي',
  annual: 'سنوي',
};

export function formatLargeNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)} تريليون`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} مليار`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} مليون`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} ألف`;
  return formatNumber(n);
}

export function formatRatio(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(2);
}

export function formatMarginPercent(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}٪`;
}

// Risk analysis labels (Arabic)
export const riskMetricLabels: Record<string, string> = {
  var_95: 'القيمة المعرضة للخطر (95٪)',
  var_99: 'القيمة المعرضة للخطر (99٪)',
  cvar_95: 'القيمة المعرضة للخطر المشروطة (95٪)',
  cvar_99: 'القيمة المعرضة للخطر المشروطة (99٪)',
  sharpe_ratio: 'نسبة شارب',
  sortino_ratio: 'نسبة سورتينو',
  max_drawdown: 'أقصى تراجع',
  volatility: 'التقلب السنوي',
  beta: 'معامل بيتا',
};

export const stressScenarioLabels: Record<string, string> = {
  market_crash: 'انهيار السوق',
  sector_downturn: 'تراجع القطاع',
  interest_rate_hike: 'رفع أسعار الفائدة',
  oil_price_crash: 'انهيار أسعار النفط',
  mild_correction: 'تصحيح بسيط',
  geopolitical_crisis: 'أزمة جيوسياسية',
};

export const severityLabels: Record<string, string> = {
  low: 'منخفض',
  moderate: 'معتدل',
  high: 'مرتفع',
  severe: 'شديد',
};

export const severityColors: Record<string, string> = {
  low: 'text-green-400',
  moderate: 'text-yellow-400',
  high: 'text-orange-400',
  severe: 'text-red-400',
};

export const diversificationLabels: Record<string, string> = {
  sectorDiversification: 'تنويع القطاعات',
  holdingCount: 'عدد الأسهم',
  marketCapMix: 'تنويع القيمة السوقية',
  correlationProxy: 'ارتباط القطاعات',
};

// Sector rotation signal labels (Arabic)
export const rotationSignalLabels: Record<string, string> = {
  rotate_in: 'دخول',
  rotate_out: 'خروج',
  overweight: 'زيادة الوزن',
  underweight: 'تقليل الوزن',
  neutral: 'محايد',
};

export const rotationSignalColors: Record<string, string> = {
  rotate_in: 'text-emerald-400 bg-emerald-500/20',
  rotate_out: 'text-red-400 bg-red-500/20',
  overweight: 'text-green-400 bg-green-500/20',
  underweight: 'text-orange-400 bg-orange-500/20',
  neutral: 'text-gray-400 bg-gray-500/20',
};

export const periodArabicLabels: Record<string, string> = {
  '1w': 'أسبوع',
  '2w': 'أسبوعان',
  '1m': 'شهر',
  '3m': '3 أشهر',
};
