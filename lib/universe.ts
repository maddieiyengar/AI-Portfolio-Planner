import stockCatalog from "@/data/us-stock-universe.json";
import { Instrument } from "@/lib/types";

type CatalogInstrument = Pick<
  Instrument,
  "id" | "ticker" | "name" | "type" | "description" | "riskBand" | "tags" | "sectors"
>;

const CORE_INSTRUMENT_UNIVERSE: Instrument[] = [
  {
    id: "hysa",
    ticker: "HYSA",
    name: "High-Yield Savings",
    type: "cash",
    description: "Cash reserve proxy with stable principal and competitive yield assumptions.",
    riskBand: "low",
    defaultYield: 4.35,
    tags: ["cash", "liquidity", "stability"]
  },
  {
    id: "sgov",
    ticker: "SGOV",
    name: "iShares 0-3 Month Treasury Bond ETF",
    type: "treasury",
    description: "Short-duration US Treasury exposure designed for low volatility.",
    riskBand: "low",
    expenseRatio: 0.09,
    tags: ["treasury", "liquidity", "capital preservation"]
  },
  {
    id: "shy",
    ticker: "SHY",
    name: "iShares 1-3 Year Treasury Bond ETF",
    type: "treasury",
    description: "Short-term Treasury allocation with modest rate sensitivity.",
    riskBand: "low",
    expenseRatio: 0.15,
    tags: ["treasury", "defense", "income"]
  },
  {
    id: "ief",
    ticker: "IEF",
    name: "iShares 7-10 Year Treasury Bond ETF",
    type: "treasury",
    description: "Intermediate Treasury exposure that can cushion equity drawdowns.",
    riskBand: "low",
    expenseRatio: 0.15,
    tags: ["treasury", "duration", "diversifier"]
  },
  {
    id: "tip",
    ticker: "TIP",
    name: "iShares TIPS Bond ETF",
    type: "bond",
    description: "Treasury Inflation-Protected Securities for inflation defense.",
    riskBand: "low",
    expenseRatio: 0.19,
    tags: ["inflation", "bond", "real yield"]
  },
  {
    id: "bnd",
    ticker: "BND",
    name: "Vanguard Total Bond Market ETF",
    type: "bond",
    description: "Core investment-grade bond exposure across US duration buckets.",
    riskBand: "low",
    expenseRatio: 0.03,
    tags: ["bond", "core", "income"]
  },
  {
    id: "vti",
    ticker: "VTI",
    name: "Vanguard Total Stock Market ETF",
    type: "equity",
    description: "Broad US equity market exposure for long-term growth.",
    riskBand: "medium",
    expenseRatio: 0.03,
    tags: ["equity", "growth", "broad market", "diversified"]
  },
  {
    id: "vxus",
    ticker: "VXUS",
    name: "Vanguard Total International Stock ETF",
    type: "international_equity",
    description: "Diversified non-US developed and emerging market equities.",
    riskBand: "medium",
    expenseRatio: 0.07,
    tags: ["equity", "international", "diversification", "diversified"]
  },
  {
    id: "vnq",
    ticker: "VNQ",
    name: "Vanguard Real Estate ETF",
    type: "real_estate",
    description: "US REIT exposure for income and real asset diversification.",
    riskBand: "medium",
    expenseRatio: 0.13,
    tags: ["real estate", "income", "inflation"],
    sectors: ["Construction & Real Estate"]
  },
  {
    id: "gld",
    ticker: "GLD",
    name: "SPDR Gold Shares",
    type: "inflation_hedge",
    description: "Gold exposure as a geopolitical and inflation hedge.",
    riskBand: "medium",
    expenseRatio: 0.4,
    tags: ["gold", "hedge", "inflation"]
  },
  {
    id: "qqq",
    ticker: "QQQ",
    name: "Invesco QQQ Trust",
    type: "equity",
    description: "Growth-heavy Nasdaq 100 exposure with higher upside and volatility.",
    riskBand: "high",
    expenseRatio: 0.2,
    tags: ["equity", "technology", "growth", "diversified"]
  }
];

const STOCK_UNIVERSE: Instrument[] = (stockCatalog as CatalogInstrument[]).map((instrument) => ({
  ...instrument,
  type: "stock"
}));

export const INSTRUMENT_UNIVERSE: Instrument[] = [...CORE_INSTRUMENT_UNIVERSE, ...STOCK_UNIVERSE];

export function getInstrumentById(id: string) {
  return INSTRUMENT_UNIVERSE.find((instrument) => instrument.id === id);
}

export function getInstrumentByTicker(ticker: string) {
  return INSTRUMENT_UNIVERSE.find(
    (instrument) => instrument.ticker.toLowerCase() === ticker.trim().toLowerCase()
  );
}

export function createCustomInstrument(tickerInput: string): Instrument {
  const ticker = tickerInput.trim().toUpperCase();
  return {
    id: `custom-${ticker.toLowerCase()}`,
    ticker,
    name: `${ticker} (Client Requested)`,
    type: "equity",
    description: "Client-requested instrument added manually to a tracked portfolio.",
    riskBand: "high",
    tags: ["custom", "manual override"]
  };
}

export function resolveInstrument(input: { instrumentId?: string; ticker?: string }) {
  if (input.instrumentId) {
    const byId = getInstrumentById(input.instrumentId);
    if (byId) {
      return byId;
    }
  }

  if (input.ticker?.trim()) {
    return getInstrumentByTicker(input.ticker) || createCustomInstrument(input.ticker);
  }

  return null;
}
