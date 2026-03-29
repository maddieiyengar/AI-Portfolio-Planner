export type RiskLevel = "low" | "medium" | "high";
export type GoalType = "capital_preservation" | "income" | "balanced_growth" | "aggressive_growth";
export type LiquidityNeed = "low" | "medium" | "high";

export type ClientProfile = {
  name: string;
  portfolioName?: string;
  age: number;
  riskLevel: RiskLevel;
  investmentAmount: number;
  timeHorizonYears: number;
  monthlyContribution: number;
  liquidityNeed: LiquidityNeed;
  needsIncome: boolean;
  goal: GoalType;
  preferredStockSectors?: string[];
  wantsManualPortfolioChanges?: boolean;
  manualReplacementTarget?: string;
  manualReplacementTicker?: string;
  notes?: string;
};

export type InstrumentType =
  | "stock"
  | "equity"
  | "bond"
  | "treasury"
  | "cash"
  | "real_estate"
  | "inflation_hedge"
  | "international_equity";

export type Instrument = {
  id: string;
  ticker: string;
  name: string;
  type: InstrumentType;
  issuer?: string;
  description: string;
  riskBand: RiskLevel;
  expenseRatio?: number;
  defaultYield?: number;
  tags: string[];
  sectors?: string[];
};

export type ReturnWindow = "1M" | "6M" | "1Y" | "5Y" | "10Y";

export type InstrumentSnapshot = {
  instrumentId: string;
  ticker: string;
  name: string;
  currentPrice: number;
  returns: Record<ReturnWindow, number | null>;
  sentimentScore: number;
  sentimentLabel: "positive" | "neutral" | "negative";
  outlookScore: number;
  outlookLabel: "bullish" | "steady" | "cautious";
  latestHeadline?: string;
  dataAsOf: string;
  source: string;
};

export type ChartPoint = {
  date: string;
  value: number;
  kind: "historical" | "forecast";
};

export type InstrumentChart = {
  instrumentId: string;
  ticker: string;
  name: string;
  points: ChartPoint[];
};

export type Allocation = {
  instrumentId: string;
  ticker: string;
  name: string;
  weight: number;
  rationale: string;
  amount: number;
  snapshot: InstrumentSnapshot;
};

export type PortfolioPlan = {
  id: string;
  portfolioName: string;
  createdAt: string;
  client: ClientProfile;
  summary: string;
  riskExplanation: string;
  complianceNote: string;
  estimatedAnnualIncome: number;
  weightedExpenseRatio: number;
  projectedRange: {
    nextYearLow: number;
    nextYearBase: number;
    nextYearHigh: number;
  };
  allocations: Allocation[];
  charts?: {
    instruments: InstrumentChart[];
    portfolio: ChartPoint[];
  };
  adjustmentSuggestions: string[];
  rebalanceGuidance: string[];
};

export type Holding = {
  instrumentId: string;
  ticker: string;
  quantity: number;
  costBasis: number;
};

export type TradeIntent = {
  action: "buy" | "sell";
  instrumentId?: string;
  ticker?: string;
  quantity: number;
  price?: number;
};

export type DailySnapshot = {
  date: string;
  portfolioValue: number;
  positions: Array<{
    instrumentId: string;
    ticker: string;
    marketValue: number;
    price: number;
    dailyChangePct: number | null;
  }>;
};

export type FinalizedPortfolio = {
  portfolioId: string;
  portfolioName: string;
  finalizedAt: string;
  client: ClientProfile;
  holdings: Holding[];
  snapshots: DailySnapshot[];
  notes: string[];
};
