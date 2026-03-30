# Portfolio Agent

Portfolio Agent is a Next.js application that:

- recommends a client portfolio based on risk tolerance, horizon, liquidity needs, and income goals
- shows live instrument prices plus trailing performance for `1M`, `6M`, `1Y`, `5Y`, and `10Y`
- analyzes headline sentiment and past returns to produce a forward-looking outlook score
- tracks finalized portfolios every day and updates holdings only when a client says they want to buy or sell
- never handles money, routes orders, or executes trades

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Supabase setup

This app now expects Supabase for authentication and saved portfolio storage.

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Run the SQL in `supabase/schema.sql` in the Supabase SQL editor.
5. In Supabase Auth, enable email/password sign-in.
6. If email confirmation is enabled, set your site URL and redirect URL to include `/auth/confirm`.

After that, users can sign up, sign in, and save portfolios to their own account.

## Monitoring model

- Finalized portfolios are stored in `data/portfolios.json`.
- `GET /api/portfolio/monitor` captures a daily snapshot for every finalized portfolio.
- `POST /api/portfolio/monitor` records a client-directed buy or sell intent and updates tracked holdings.
- For fully automated daily monitoring, call `GET /api/portfolio/monitor` from an external scheduler once per day.

## Important compliance note

This project is an analysis and monitoring tool. It does **not**:

- custody assets
- transfer money
- place trades
- act as an investment adviser of record

Forecasts are heuristic estimates built from historical returns and headline sentiment. They should be treated as decision support, not guarantees.
