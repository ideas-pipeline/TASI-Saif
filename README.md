# TASI Analysis Platform

AI-powered stock analysis platform for the Saudi stock exchange (TASI/Tadawul). Combines technical analysis, fundamental data, and AI scoring to identify investment opportunities.

## Quick Start

```bash
npm install
node src/cli.js backfill       # Load 2 years of historical data
node src/cli.js analyze        # Run full analysis pipeline
node src/cli.js serve          # Start API server on port 3000
```

## Commands

### Data Pipeline
| Command | Description |
|---------|-------------|
| `backfill [years]` | Full historical data load (default: 2 years) |
| `daily` | Fetch last 3 days of data |
| `scheduler` | Start cron scheduler (runs daily at 3:30 PM AST) |
| `init-db` | Initialize database schema only |
| `enrich` | Enrich stocks with fundamental data from Yahoo Finance |
| `tickers` | List all 53 covered TASI tickers |
| `stats` | Show pipeline statistics |

### Analysis
| Command | Description |
|---------|-------------|
| `analyze` | Run full analysis (technical + fundamental + scoring + sectors) |
| `analyze --ai` | Run with AI scoring via Claude API (requires `ANTHROPIC_API_KEY`) |
| `analyze --skip-enrich` | Skip Yahoo Finance fundamental data enrichment |
| `rankings` | Show top 20 stocks ranked by overall score |

### API Server
| Command | Description |
|---------|-------------|
| `serve` | Start REST API server (default port 3000) |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/stocks` | All stocks with scores. Params: `sector`, `sort`, `order`, `limit` |
| `GET /api/stocks/:symbol` | Detailed stock analysis with indicators and recent prices |
| `GET /api/rankings` | Top opportunities ranked by score. Params: `limit`, `signal` |
| `GET /api/sectors` | Sector-level analysis and trends |
| `GET /api/sectors/:sector` | Sector detail with constituent stocks |
| `GET /api/signals` | Entry signals grouped by signal type |
| `GET /api/stats` | Pipeline statistics |

## Analysis Engine

### Technical Indicators
- **Moving Averages:** SMA/EMA (20, 50, 200)
- **RSI:** 14-period Relative Strength Index
- **MACD:** 12/26/9 Moving Average Convergence Divergence
- **Bollinger Bands:** 20-period, 2 standard deviations
- **Volume Analysis:** 20-day average volume, volume ratio

### Fundamental Analysis
- P/E ratio, EPS, dividend yield, market cap
- Fundamental scoring (1-10 scale)

### AI Scoring (Optional)
- Claude API integration for AI-powered opportunity scoring
- Generates investment scores with Arabic + English reasoning
- Set `ANTHROPIC_API_KEY` env var to enable

### Risk Model
- Per-stock annualized volatility (60-day window)
- Beta relative to TASI market average
- Risk classification: low / medium / high (based on volatility, beta, sector)

### Entry Signals
- `strong_buy`, `buy`, `hold`, `sell`, `strong_sell`
- Based on combined overall score + technical indicators + risk level

### Overall Score
Weighted composite: Technical (35%) + Fundamental (30%) + AI (35%)

## Coverage

53 TASI-listed stocks across 14 sectors:

- **Banking** (10): Al Rajhi, SNB, Alinma, Riyad Bank, SABB, BSF, AlJazira, SIB, ANB, AlBilad
- **Materials** (9): SABIC, SABIC Agri, Maaden, Tasnee, Yansab, Alujain, Arabian Cement, Yamama Cement, Saudi Paper
- **Food & Beverages** (4): Almarai, Nadec, Savola, Halwani Bros
- **Insurance** (4): Tawuniya, Malath, Medgulf, Bupa Arabia
- **Retailing** (3): Jarir, Extra, Al Othaim
- **Real Estate** (3): Dar Al Arkan, Emaar EC, Knowledge EC
- **Telecommunications** (3): STC, Mobily, Zain KSA
- **Energy** (3): Saudi Aramco, SARCO, BPCC
- **Healthcare** (3): Mouwasat, Dallah, Care
- **Transportation** (3): Saudi Ground Services, SAPTCO, Leejam Sports
- **Utilities** (2): SEC, ACWA Power
- **Capital Goods** (2): EIC, Zamil Industrial
- **Diversified Financials** (2): Kingdom Holding, Samba
- **Technology** (2): Elm, Tawasul

## Database Schema

**SQLite** (local, `data/tasi.db`):

- `stocks` - Master stock data (symbol, name, sector, fundamentals)
- `daily_prices` - Daily OHLCV time-series
- `technical_indicators` - Computed technical indicators per stock per day
- `stock_scores` - Analysis scores, risk levels, and entry signals
- `sector_analysis` - Sector-level aggregated analysis
- `ingestion_runs` - Audit log of pipeline runs

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TASI_DB_PATH` | `data/tasi.db` | SQLite database file path |
| `TASI_PORT` | `3000` | API server port |
| `ANTHROPIC_API_KEY` | _(none)_ | Claude API key for AI scoring |

## Disclaimer

تنويه: هذا التحليل لأغراض تعليمية ومعلوماتية فقط وليس نصيحة استثمارية.

This analysis is for educational and informational purposes only and does not constitute financial advice. Consult a licensed financial advisor before making any investment decisions.
