# Portfolio Agent

Portfolio Agent is a Next.js application that:

- recommends a client portfolio based on risk tolerance, horizon, liquidity needs, and income goals
- shows live instrument prices plus trailing performance for `1M`, `6M`, `1Y`, `5Y`, and `10Y`
- analyzes headline sentiment and past returns to produce a forward-looking outlook score
- tracks finalized portfolios every day and updates holdings only when a client says they want to buy or sell
- exports tracked portfolio history for a user-selected date range into an Excel-friendly spreadsheet
- never handles money, routes orders, or executes trades

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

Set `PORTFOLIO_AGENT_ACCESS_PASSWORD` in `.env.local` before you open the site. The app now requires a password-protected session for the dashboard and portfolio APIs.

## Monitoring model

- Finalized portfolios are stored in `data/portfolios.json`.
- `GET /api/portfolio/monitor` captures a daily snapshot for every finalized portfolio.
- `POST /api/portfolio/monitor` records a client-directed buy or sell intent and updates tracked holdings.
- For fully automated daily monitoring, call `GET /api/portfolio/monitor` from an external scheduler once per day.

## Security notes

- Set a strong `PORTFOLIO_AGENT_ACCESS_PASSWORD` everywhere you deploy this project.
- Portfolio APIs require an authenticated session cookie.
- Finalization regenerates the portfolio server-side from the submitted client profile instead of trusting browser-supplied allocations.

## Important compliance note

This project is an analysis and monitoring tool. It does **not**:

- custody assets
- transfer money
- place trades
- act as an investment adviser of record

Forecasts are heuristic estimates built from historical returns and headline sentiment. They should be treated as decision support, not guarantees.
