import { Instrument } from "@/lib/types";

export const INSTRUMENT_UNIVERSE: Instrument[] = [
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
    id: "msft",
    ticker: "MSFT",
    name: "Microsoft Corp.",
    type: "stock",
    description: "Large-cap technology stock with durable cash flows and broad AI and software exposure.",
    riskBand: "medium",
    tags: ["stock", "technology", "quality growth"],
    sectors: ["Technology & IT", "Information & Communications"]
  },
  {
    id: "jnj",
    ticker: "JNJ",
    name: "Johnson & Johnson",
    type: "stock",
    description: "Defensive healthcare stock with diversified earnings and a history of stability.",
    riskBand: "medium",
    tags: ["stock", "healthcare", "defensive"],
    sectors: ["Healthcare & Social Assistance"]
  },
  {
    id: "xom",
    ticker: "XOM",
    name: "Exxon Mobil Corp.",
    type: "stock",
    description: "Energy stock that can add dividend income and commodity sensitivity to a portfolio.",
    riskBand: "high",
    tags: ["stock", "energy", "income"],
    sectors: ["Energy & Utilities"]
  },
  {
    id: "nvda",
    ticker: "NVDA",
    name: "NVIDIA Corp.",
    type: "stock",
    description: "High-growth semiconductor stock with strong AI infrastructure exposure and higher volatility.",
    riskBand: "high",
    tags: ["stock", "semiconductors", "ai", "growth"],
    sectors: ["Technology & IT", "Manufacturing"]
  },
  {
    id: "de",
    ticker: "DE",
    name: "Deere & Co.",
    type: "stock",
    description: "Industrial equipment company tied to farm machinery and precision agriculture demand.",
    riskBand: "medium",
    tags: ["stock", "agriculture", "machinery"],
    sectors: ["Agriculture, Forestry, Fishing, and Hunting", "Manufacturing"]
  },
  {
    id: "jpm",
    ticker: "JPM",
    name: "JPMorgan Chase & Co.",
    type: "stock",
    description: "Diversified banking and investment services company with broad finance exposure.",
    riskBand: "medium",
    tags: ["stock", "banking", "finance"],
    sectors: ["Finance & Insurance"]
  },
  {
    id: "cost",
    ticker: "COST",
    name: "Costco Wholesale Corp.",
    type: "stock",
    description: "Retail and wholesale operator with resilient consumer and membership-driven cash flows.",
    riskBand: "medium",
    tags: ["stock", "retail", "wholesale"],
    sectors: ["Retail & Wholesale Trade"]
  },
  {
    id: "cat",
    ticker: "CAT",
    name: "Caterpillar Inc.",
    type: "stock",
    description: "Heavy equipment manufacturer with strong links to infrastructure, construction, and industrial demand.",
    riskBand: "medium",
    tags: ["stock", "construction", "industrial"],
    sectors: ["Construction & Real Estate", "Manufacturing"]
  },
  {
    id: "ups",
    ticker: "UPS",
    name: "United Parcel Service Inc.",
    type: "stock",
    description: "Global shipping and logistics company tied to transportation and warehousing demand.",
    riskBand: "medium",
    tags: ["stock", "transportation", "logistics"],
    sectors: ["Transportation & Warehousing"]
  },
  {
    id: "nee",
    ticker: "NEE",
    name: "NextEra Energy Inc.",
    type: "stock",
    description: "Utility and renewable energy operator that adds regulated income and clean energy exposure.",
    riskBand: "medium",
    tags: ["stock", "utility", "renewables"],
    sectors: ["Energy & Utilities"]
  },
  {
    id: "dis",
    ticker: "DIS",
    name: "Walt Disney Co.",
    type: "stock",
    description: "Media and entertainment company with exposure to streaming, film, parks, and communications.",
    riskBand: "medium",
    tags: ["stock", "media", "communications"],
    sectors: ["Information & Communications", "Hospitality & Leisure"]
  },
  {
    id: "mar",
    ticker: "MAR",
    name: "Marriott International Inc.",
    type: "stock",
    description: "Hospitality company tied to hotel demand, tourism, and global travel trends.",
    riskBand: "medium",
    tags: ["stock", "hotels", "travel"],
    sectors: ["Hospitality & Leisure"]
  },
  {
    id: "acn",
    ticker: "ACN",
    name: "Accenture plc",
    type: "stock",
    description: "Consulting and technical services firm with enterprise technology and advisory exposure.",
    riskBand: "medium",
    tags: ["stock", "consulting", "technical services"],
    sectors: ["Professional & Technical Services", "Technology & IT"]
  },
  {
    id: "duol",
    ticker: "DUOL",
    name: "Duolingo Inc.",
    type: "stock",
    description: "Education technology company with exposure to digital learning and training demand.",
    riskBand: "high",
    tags: ["stock", "education", "training"],
    sectors: ["Education Services", "Technology & IT"]
  },
  {
    id: "lmt",
    ticker: "LMT",
    name: "Lockheed Martin Corp.",
    type: "stock",
    description: "Defense contractor with aerospace and government spending exposure.",
    riskBand: "medium",
    tags: ["stock", "defense", "government"],
    sectors: ["Government & Public Administration", "Manufacturing"]
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
    expenseRatio: 0.40,
    tags: ["gold", "hedge", "inflation"]
  },
  {
    id: "qqq",
    ticker: "QQQ",
    name: "Invesco QQQ Trust",
    type: "equity",
    description: "Growth-heavy Nasdaq 100 exposure with higher upside and volatility.",
    riskBand: "high",
    expenseRatio: 0.20,
    tags: ["equity", "technology", "growth", "diversified"]
  }
];

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
