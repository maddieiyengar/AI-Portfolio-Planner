import { ClientProfile, ClientScenarioInputs, LiquidityNeed, MarketCapPreference, RiskLevel, TradeIntent } from "@/lib/types";

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];
const LIQUIDITY_LEVELS: LiquidityNeed[] = ["low", "medium", "high"];
const GOALS = ["capital_preservation", "income", "balanced_growth", "aggressive_growth"] as const;
const MARKET_CAPS: MarketCapPreference[] = ["large-cap", "mid-cap", "small-cap"];

function ensureObject(input: unknown, label: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object.`);
  }

  return input as Record<string, unknown>;
}

function readString(value: unknown, label: string, { required = true, max = 200 } = {}) {
  if (value == null || value === "") {
    if (required) {
      throw new Error(`${label} is required.`);
    }
    return "";
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed.slice(0, max);
}

function readNumber(
  value: unknown,
  label: string,
  { min, max, defaultValue }: { min?: number; max?: number; defaultValue?: number } = {}
) {
  if (value == null || value === "") {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`${label} is required.`);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a valid number.`);
  }

  if (min !== undefined && value < min) {
    throw new Error(`${label} must be at least ${min}.`);
  }

  if (max !== undefined && value > max) {
    throw new Error(`${label} must be at most ${max}.`);
  }

  return value;
}

function readOptionalNumber(value: unknown, label: string, min?: number, max?: number) {
  if (value == null || value === "") {
    return undefined;
  }

  return readNumber(value, label, { min, max });
}

function readBoolean(value: unknown, label: string, defaultValue = false) {
  if (value == null) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${label} must be true or false.`);
  }

  return value;
}

function readStringArray(value: unknown, label: string, maxItems = 20) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a list.`);
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function readEnum<T extends string>(value: unknown, label: string, options: readonly T[]) {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${label} is invalid.`);
  }

  return value as T;
}

function parseScenarios(value: unknown): ClientScenarioInputs | undefined {
  if (value == null) {
    return undefined;
  }

  const input = ensureObject(value, "scenarios");
  return {
    maxPrincipalLossPct: readOptionalNumber(input.maxPrincipalLossPct, "maxPrincipalLossPct", 0, 100),
    targetAnnualOutperformancePct: readOptionalNumber(
      input.targetAnnualOutperformancePct,
      "targetAnnualOutperformancePct",
      0,
      100
    ),
    inflationHedgeOnly: readBoolean(input.inflationHedgeOnly, "inflationHedgeOnly"),
    requiredLiquidReserve: readOptionalNumber(input.requiredLiquidReserve, "requiredLiquidReserve", 0),
    stagedWithdrawalAmount: readOptionalNumber(input.stagedWithdrawalAmount, "stagedWithdrawalAmount", 0),
    stagedWithdrawalYears: readOptionalNumber(input.stagedWithdrawalYears, "stagedWithdrawalYears", 0, 100),
    allowFiveYearLockup: readBoolean(input.allowFiveYearLockup, "allowFiveYearLockup"),
    targetMonthlyIncome: readOptionalNumber(input.targetMonthlyIncome, "targetMonthlyIncome", 0),
    targetIncomeStartYear: readOptionalNumber(input.targetIncomeStartYear, "targetIncomeStartYear", 1900, 3000),
    targetPortfolioValue: readOptionalNumber(input.targetPortfolioValue, "targetPortfolioValue", 0),
    targetPortfolioYear: readOptionalNumber(input.targetPortfolioYear, "targetPortfolioYear", 1900, 3000),
    taxAwareTransition: readBoolean(input.taxAwareTransition, "taxAwareTransition")
  };
}

export function parseClientProfile(input: unknown): ClientProfile {
  const profile = ensureObject(input, "client profile");

  return {
    name: readString(profile.name, "name", { max: 120 }),
    portfolioName: readString(profile.portfolioName, "portfolioName", { required: false, max: 120 }) || undefined,
    age: readNumber(profile.age, "age", { min: 18, max: 120 }),
    riskLevel: readEnum(profile.riskLevel, "riskLevel", RISK_LEVELS),
    investmentAmount: readNumber(profile.investmentAmount, "investmentAmount", { min: 1 }),
    timeHorizonYears: readNumber(profile.timeHorizonYears, "timeHorizonYears", { min: 1, max: 100 }),
    monthlyContribution: readNumber(profile.monthlyContribution, "monthlyContribution", { min: 0 }),
    liquidityNeed: readEnum(profile.liquidityNeed, "liquidityNeed", LIQUIDITY_LEVELS),
    needsIncome: readBoolean(profile.needsIncome, "needsIncome"),
    goal: readEnum(profile.goal, "goal", GOALS),
    preferredStockSectors: readStringArray(profile.preferredStockSectors, "preferredStockSectors"),
    preferredMarketCaps: readStringArray(profile.preferredMarketCaps, "preferredMarketCaps")
      .filter((value): value is MarketCapPreference => MARKET_CAPS.includes(value as MarketCapPreference))
      .slice(0, MARKET_CAPS.length),
    riskScore: readOptionalNumber(profile.riskScore, "riskScore", 0, 10),
    liquidityRatio: readOptionalNumber(profile.liquidityRatio, "liquidityRatio", 0, 1),
    targetDate: readOptionalNumber(profile.targetDate, "targetDate", 1900, 3000),
    scenarios: parseScenarios(profile.scenarios),
    wantsManualPortfolioChanges: readBoolean(profile.wantsManualPortfolioChanges, "wantsManualPortfolioChanges"),
    manualExcludedInstrumentIds: readStringArray(profile.manualExcludedInstrumentIds, "manualExcludedInstrumentIds"),
    manualReplacementTarget:
      readString(profile.manualReplacementTarget, "manualReplacementTarget", { required: false, max: 80 }) || undefined,
    manualReplacementTicker:
      readString(profile.manualReplacementTicker, "manualReplacementTicker", { required: false, max: 20 }) || undefined,
    notes: readString(profile.notes, "notes", { required: false, max: 1000 }) || undefined
  };
}

export function parseTradeIntent(input: unknown): TradeIntent {
  const trade = ensureObject(input, "trade");

  return {
    action: readEnum(trade.action, "action", ["buy", "sell"] as const),
    instrumentId: readString(trade.instrumentId, "instrumentId", { required: false, max: 80 }) || undefined,
    ticker: readString(trade.ticker, "ticker", { required: false, max: 20 }) || undefined,
    quantity: readNumber(trade.quantity, "quantity", { min: 0.0001 }),
    price: readOptionalNumber(trade.price, "price", 0.0001)
  };
}
