/**
 * Top 50+ TASI-listed stocks with .SR suffix for Yahoo Finance.
 * Organized by sector per Tadawul classification.
 */
const TASI_TICKERS = [
  // Energy
  { symbol: '2222.SR', name: 'Saudi Aramco', sector: 'Energy' },
  { symbol: '2030.SR', name: 'SARCO', sector: 'Energy' },
  { symbol: '4030.SR', name: 'BPCC', sector: 'Energy' },

  // Materials
  { symbol: '2010.SR', name: 'SABIC', sector: 'Materials' },
  { symbol: '2020.SR', name: 'SABIC Agri-Nutrients', sector: 'Materials' },
  { symbol: '1211.SR', name: 'Maaden', sector: 'Materials' },
  { symbol: '2060.SR', name: 'National Industrialization (Tasnee)', sector: 'Materials' },
  { symbol: '2290.SR', name: 'Yanbu National Petrochemical (Yansab)', sector: 'Materials' },
  { symbol: '2170.SR', name: 'Alujain', sector: 'Materials' },
  { symbol: '3010.SR', name: 'Arabian Cement', sector: 'Materials' },
  { symbol: '3020.SR', name: 'Yamama Cement', sector: 'Materials' },
  { symbol: '2300.SR', name: 'Saudi Paper Manufacturing', sector: 'Materials' },

  // Banking
  { symbol: '1120.SR', name: 'Al Rajhi Bank', sector: 'Banking' },
  { symbol: '1180.SR', name: 'Saudi National Bank (SNB)', sector: 'Banking' },
  { symbol: '1150.SR', name: 'Alinma Bank', sector: 'Banking' },
  { symbol: '1010.SR', name: 'Riyad Bank', sector: 'Banking' },
  { symbol: '1050.SR', name: 'Saudi British Bank (SABB)', sector: 'Banking' },
  { symbol: '1060.SR', name: 'Banque Saudi Fransi', sector: 'Banking' },
  { symbol: '1020.SR', name: 'Bank AlJazira', sector: 'Banking' },
  { symbol: '1030.SR', name: 'Saudi Investment Bank', sector: 'Banking' },
  { symbol: '1080.SR', name: 'Arab National Bank', sector: 'Banking' },
  { symbol: '1140.SR', name: 'Bank AlBilad', sector: 'Banking' },

  // Telecommunications
  { symbol: '7010.SR', name: 'STC (Saudi Telecom)', sector: 'Telecommunications' },
  { symbol: '7020.SR', name: 'Etihad Etisalat (Mobily)', sector: 'Telecommunications' },
  { symbol: '7030.SR', name: 'Zain KSA', sector: 'Telecommunications' },

  // Utilities
  { symbol: '5110.SR', name: 'Saudi Electricity Company (SEC)', sector: 'Utilities' },
  { symbol: '2082.SR', name: 'ACWA Power', sector: 'Utilities' },

  // Insurance
  { symbol: '8010.SR', name: 'Tawuniya', sector: 'Insurance' },
  { symbol: '8200.SR', name: 'Malath Insurance', sector: 'Insurance' },
  { symbol: '8030.SR', name: 'Medgulf', sector: 'Insurance' },
  { symbol: '8020.SR', name: 'Bupa Arabia', sector: 'Insurance' },

  // Real Estate
  { symbol: '4300.SR', name: 'Dar Al Arkan', sector: 'Real Estate' },
  { symbol: '4320.SR', name: 'Emaar The Economic City', sector: 'Real Estate' },
  { symbol: '4310.SR', name: 'Knowledge Economic City', sector: 'Real Estate' },

  // Retailing
  { symbol: '4190.SR', name: 'Jarir Marketing', sector: 'Retailing' },
  { symbol: '4003.SR', name: 'Extra (United Electronics)', sector: 'Retailing' },
  { symbol: '4001.SR', name: 'Abdullah Al Othaim Markets', sector: 'Retailing' },

  // Food & Beverages
  { symbol: '2280.SR', name: 'Almarai', sector: 'Food & Beverages' },
  { symbol: '6010.SR', name: 'Nadec', sector: 'Food & Beverages' },
  { symbol: '2050.SR', name: 'Savola Group', sector: 'Food & Beverages' },
  { symbol: '6001.SR', name: 'Halwani Bros', sector: 'Food & Beverages' },

  // Healthcare
  { symbol: '4002.SR', name: 'Mouwasat Medical Services', sector: 'Healthcare' },
  { symbol: '4004.SR', name: 'Dallah Healthcare', sector: 'Healthcare' },
  { symbol: '4005.SR', name: 'Care (National Medical Care)', sector: 'Healthcare' },

  // Capital Goods
  { symbol: '1303.SR', name: 'Electrical Industries (EIC)', sector: 'Capital Goods' },
  { symbol: '1304.SR', name: 'Zamil Industrial', sector: 'Capital Goods' },

  // Transportation
  { symbol: '4031.SR', name: 'Saudi Ground Services', sector: 'Transportation' },
  { symbol: '4040.SR', name: 'Saudi Public Transport (SAPTCO)', sector: 'Transportation' },
  { symbol: '4261.SR', name: 'Leejam Sports (Fitness Time)', sector: 'Transportation' },

  // Diversified Financials
  { symbol: '4280.SR', name: 'Kingdom Holding', sector: 'Diversified Financials' },
  { symbol: '1183.SR', name: 'Samba Financial Group', sector: 'Diversified Financials' },

  // Technology
  { symbol: '7203.SR', name: 'Elm Company', sector: 'Technology' },
  { symbol: '7204.SR', name: 'Tawasul (Arabian Internet)', sector: 'Technology' },
];

module.exports = { TASI_TICKERS };
