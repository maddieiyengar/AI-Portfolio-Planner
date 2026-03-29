import { buildOutlook, getSentimentForInstrument } from "@/lib/sentiment";
import { getInstrumentSnapshot } from "@/lib/market-data";
import { ClientProfile, Instrument, PortfolioPlan, RiskLevel } from "@/lib/types";
import { createCustomInstrument, getInstrumentById, INSTRUMENT_UNIVERSE } from "@/lib/universe";

const BASE_ALLOCATIONS: Record<RiskLevel, Record<string, number>> = {
  low: {
    hysa: 0.2,
    sgov: 0.2,
    shy: 0.15,
    ief: 0.15,
    tip: 0.1,
    bnd: 0.15,
    jnj: 0.03,
    vti: 0.03,
    vxus: 0.02,
    msft: 0.02
  },
  medium: {
    hysa: 0.08,
    sgov: 0.07,
    shy: 0.1,
    ief: 0.1,
    tip: 0.08,
    bnd: 0.17,
    vti: 0.18,
    vxus: 0.1,
    vnq: 0.05,
    gld: 0.03,
    msft: 0.06,
    jnj: 0.04,
    xom: 0.04
  },
  high: {
    hysa: 0.03,
    sgov: 0.03,
    bnd: 0.09,
    tip: 0.05,
    vti: 0.24,
    vxus: 0.12,
    vnq: 0.1,
    gld: 0.05,
    qqq: 0.12,
    msft: 0.07,
    nvda: 0.06,
    xom: 0.04
  }
};

function normalizeWeights(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  return Object.fromEntries(
    Object.entries(weights)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => [key, Number((value / total).toFixed(4))])
  );
}

function getSelectedStockIds(client: ClientProfile) {
  const selectedSectors = client.preferredStockSectors || [];
  if (selectedSectors.length === 0) {
    return INSTRUMENT_UNIVERSE.filter((instrument) => instrument.type === "stock").map((instrument) => instrument.id);
  }

  const sectorSet = new Set(selectedSectors.map((sector) => sector.toLowerCase()));
  return INSTRUMENT_UNIVERSE.filter(
    (instrument) =>
      instrument.type === "stock" &&
      (instrument.sectors || []).some((sector) => sectorSet.has(sector.toLowerCase()))
  ).map((instrument) => instrument.id);
}

function applySectorPreference(client: ClientProfile, weights: Record<string, number>) {
  const selectedStockIds = getSelectedStockIds(client);
  if ((client.preferredStockSectors || []).length === 0) {
    return weights;
  }

  const adjusted = { ...weights };
  const stockIds = INSTRUMENT_UNIVERSE.filter((instrument) => instrument.type === "stock").map((instrument) => instrument.id);
  let removedWeight = 0;

  for (const stockId of stockIds) {
    if (!selectedStockIds.includes(stockId)) {
      removedWeight += adjusted[stockId] || 0;
      adjusted[stockId] = 0;
    }
  }

  if (selectedStockIds.length === 0) {
    adjusted.vti = (adjusted.vti || 0) + removedWeight * 0.7;
    adjusted.vxus = (adjusted.vxus || 0) + removedWeight * 0.3;
    return adjusted;
  }

  const weightPerSelectedStock = removedWeight / selectedStockIds.length;
  for (const stockId of selectedStockIds) {
    adjusted[stockId] = (adjusted[stockId] || 0) + weightPerSelectedStock;
  }

  return adjusted;
}

function applyManualReplacement(
  client: ClientProfile,
  weights: Record<string, number>,
  selectedInstruments: Instrument[]
) {
  const targetId = client.manualReplacementTarget;
  const replacementTicker = client.manualReplacementTicker?.trim();

  if (!client.wantsManualPortfolioChanges || !targetId) {
    return selectedInstruments;
  }

  const targetWeight = weights[targetId];
  if (!targetWeight) {
    return selectedInstruments;
  }

  if (!replacementTicker) {
    return selectedInstruments;
  }

  const selectedWithoutTarget = selectedInstruments.filter((instrument) => instrument.id !== targetId);
  const existingUniverseMatch = INSTRUMENT_UNIVERSE.find(
    (instrument) => instrument.ticker.toLowerCase() === replacementTicker.toLowerCase()
  );
  const replacement = existingUniverseMatch || createCustomInstrument(replacementTicker);

  weights[targetId] = 0;
  weights[replacement.id] = (weights[replacement.id] || 0) + targetWeight;

  const withoutDuplicate = selectedWithoutTarget.filter((instrument) => instrument.id !== replacement.id);
  return [...withoutDuplicate, replacement];
}

function buildAdjustmentSuggestions(client: ClientProfile, selectedInstruments: Instrument[]) {
  if (!client.wantsManualPortfolioChanges) {
    return [];
  }

  if (client.manualReplacementTicker?.trim()) {
    return [
      `Manual replacement requested: swap ${client.manualReplacementTarget || "the selected instrument"} for ${client.manualReplacementTicker.toUpperCase()}.`
    ];
  }

  const targetInstrument = selectedInstruments.find((instrument) => instrument.id === client.manualReplacementTarget);
  if (!targetInstrument) {
    return [
      "If the client wants a different instrument, select one position from the portfolio and provide a ticker to replace it."
    ];
  }

  const sameTypeSuggestions = INSTRUMENT_UNIVERSE.filter(
    (instrument) => instrument.type === targetInstrument.type && instrument.id !== targetInstrument.id
  )
    .slice(0, 3)
    .map((instrument) => `${instrument.ticker} - ${instrument.name}`);

  if (targetInstrument.type === "stock" && (client.preferredStockSectors || []).length > 0) {
    const selectedSectors = new Set((client.preferredStockSectors || []).map((sector) => sector.toLowerCase()));
    const stockSuggestions = INSTRUMENT_UNIVERSE.filter(
      (instrument) =>
        instrument.type === "stock" &&
        instrument.id !== targetInstrument.id &&
        (instrument.sectors || []).some((sector) => selectedSectors.has(sector.toLowerCase()))
    )
      .slice(0, 3)
      .map((instrument) => `${instrument.ticker} - ${instrument.name}`);

    return stockSuggestions.length > 0
      ? stockSuggestions
      : ["No matching stock suggestion was found for the selected sectors. Try a specific ticker instead."];
  }

  return sameTypeSuggestions.length > 0
    ? sameTypeSuggestions
    : ["No close replacement suggestion found. Enter a specific ticker to swap in a client-requested instrument."];
}

function applyProfileAdjustments(client: ClientProfile) {
  const weights = { ...BASE_ALLOCATIONS[client.riskLevel] };

  if (client.liquidityNeed === "high") {
    weights.hysa = (weights.hysa || 0) + 0.08;
    weights.sgov = (weights.sgov || 0) + 0.05;
    weights.vti = Math.max(0, (weights.vti || 0) - 0.06);
    weights.qqq = Math.max(0, (weights.qqq || 0) - 0.03);
  }

  if (client.needsIncome) {
    weights.bnd = (weights.bnd || 0) + 0.05;
    weights.vnq = (weights.vnq || 0) + 0.03;
    weights.hysa = (weights.hysa || 0) + 0.02;
    weights.jnj = (weights.jnj || 0) + 0.02;
    weights.xom = (weights.xom || 0) + 0.02;
    weights.qqq = Math.max(0, (weights.qqq || 0) - 0.04);
    weights.nvda = Math.max(0, (weights.nvda || 0) - 0.02);
  }

  if (client.timeHorizonYears >= 10 && client.riskLevel !== "low") {
    weights.vti = (weights.vti || 0) + 0.03;
    weights.vxus = (weights.vxus || 0) + 0.02;
    weights.msft = (weights.msft || 0) + 0.02;
    weights.nvda = (weights.nvda || 0) + 0.01;
    weights.sgov = Math.max(0, (weights.sgov || 0) - 0.02);
  }

  if (client.goal === "capital_preservation") {
    weights.hysa = (weights.hysa || 0) + 0.08;
    weights.sgov = (weights.sgov || 0) + 0.06;
    weights.vti = Math.max(0, (weights.vti || 0) - 0.06);
    weights.qqq = Math.max(0, (weights.qqq || 0) - 0.04);
    weights.nvda = Math.max(0, (weights.nvda || 0) - 0.03);
    weights.xom = Math.max(0, (weights.xom || 0) - 0.02);
  }

  if (client.goal === "aggressive_growth") {
    weights.vti = (weights.vti || 0) + 0.05;
    weights.qqq = (weights.qqq || 0) + 0.04;
    weights.msft = (weights.msft || 0) + 0.03;
    weights.nvda = (weights.nvda || 0) + 0.03;
    weights.hysa = Math.max(0, (weights.hysa || 0) - 0.03);
    weights.sgov = Math.max(0, (weights.sgov || 0) - 0.03);
  }

  return normalizeWeights(applySectorPreference(client, weights));
}

function describePortfolio(client: ClientProfile) {
  if (client.riskLevel === "low") {
    return "This allocation prioritizes principal stability and income resilience through Treasuries, high-quality bonds, and cash-like reserves. Stock exposure is limited to a small sleeve of more defensive or high-quality names so month-to-month swings remain muted.";
  }

  if (client.riskLevel === "medium") {
    return "This allocation balances long-term growth with downside buffers. Bonds, Treasuries, and real assets reduce shock risk while diversified ETFs and selective individual stocks provide the growth engine.";
  }

  return "This allocation targets long-horizon growth with a larger equity sleeve, combining diversified ETFs with selective individual stocks while preserving some ballast in bonds, Treasuries, and hedges to limit concentration risk.";
}

export async function generatePortfolioPlan(client: ClientProfile): Promise<PortfolioPlan> {
  const weights = applyProfileAdjustments(client);
  const initialInstruments = Object.keys(weights)
    .map((id) => getInstrumentById(id))
    .filter((instrument): instrument is NonNullable<typeof instrument> => Boolean(instrument));
  const selectedInstruments = applyManualReplacement(client, weights, initialInstruments);

  const enrichedAllocations = await Promise.all(
    selectedInstruments.map(async (instrument) => {
      const snapshot = await getInstrumentSnapshot(instrument);
      const sentiment = await getSentimentForInstrument(`${instrument.name} ${instrument.ticker}`);
      const outlook = buildOutlook(snapshot.returns["1Y"], snapshot.returns["5Y"], sentiment.score);

      snapshot.sentimentScore = sentiment.score;
      snapshot.sentimentLabel = sentiment.label;
      snapshot.latestHeadline = sentiment.latestHeadline;
      snapshot.outlookScore = outlook.score;
      snapshot.outlookLabel = outlook.label;

      const weight = weights[instrument.id];

      return {
        instrumentId: instrument.id,
        ticker: instrument.ticker,
        name: instrument.name,
        weight,
        amount: Number((client.investmentAmount * weight).toFixed(2)),
        rationale: `${instrument.description} Selected because it fits a ${client.riskLevel}-risk profile, supports a ${client.goal.replace("_", " ")} objective, and ${
          (client.preferredStockSectors || []).length > 0
            ? `leans toward the client's selected stock sectors: ${(client.preferredStockSectors || []).join(", ")}.`
            : "keeps the allocation diversified across the broader opportunity set."
        }`,
        snapshot,
        expenseRatio: instrument.expenseRatio || 0,
        incomeYield: instrument.defaultYield || Math.max(0, (snapshot.returns["1Y"] || 0) / 4)
      };
    })
  );

  const weightedExpenseRatio = enrichedAllocations.reduce(
    (sum, allocation) => sum + allocation.weight * allocation.expenseRatio,
    0
  );
  const estimatedAnnualIncome = enrichedAllocations.reduce(
    (sum, allocation) => sum + allocation.amount * (allocation.incomeYield / 100),
    0
  );
  const weighted1Y = enrichedAllocations.reduce(
    (sum, allocation) => sum + allocation.weight * (allocation.snapshot.returns["1Y"] || 0),
    0
  );
  const weighted5Y = enrichedAllocations.reduce(
    (sum, allocation) => sum + allocation.weight * (allocation.snapshot.returns["5Y"] || 0),
    0
  );
  const weightedSentiment = enrichedAllocations.reduce(
    (sum, allocation) => sum + allocation.weight * allocation.snapshot.sentimentScore,
    0
  );

  const baseProjection = client.investmentAmount * (1 + (weighted1Y / 100 + weightedSentiment * 0.05));

  return {
    id: `plan_${Date.now()}`,
    portfolioName: client.portfolioName?.trim() || `${client.name}'s Portfolio`,
    createdAt: new Date().toISOString(),
    client,
    summary: describePortfolio(client),
    riskExplanation:
      client.riskLevel === "low"
        ? "Low-risk clients get a heavier allocation to cash, Treasuries, and broad bond exposure. Return expectations are steadier, but upside is intentionally capped."
        : client.riskLevel === "medium"
          ? "Medium-risk clients blend defensive assets with diversified equity exposure to seek smoother compounding over time."
          : "High-risk clients accept higher volatility in exchange for stronger long-run growth potential.",
    complianceNote:
      "This agent only analyzes data, proposes allocations, and tracks finalized portfolios. It does not custody assets, route trades, or move money on a client's behalf.",
    estimatedAnnualIncome: Number(estimatedAnnualIncome.toFixed(2)),
    weightedExpenseRatio: Number(weightedExpenseRatio.toFixed(2)),
    projectedRange: {
      nextYearLow: Number((baseProjection * 0.9).toFixed(2)),
      nextYearBase: Number(baseProjection.toFixed(2)),
      nextYearHigh: Number((baseProjection * (1 + Math.max(weighted5Y / 100, 0.05))).toFixed(2))
    },
    allocations: enrichedAllocations.map(({ expenseRatio: _expenseRatio, incomeYield: _incomeYield, ...rest }) => rest),
    adjustmentSuggestions: buildAdjustmentSuggestions(client, selectedInstruments),
    rebalanceGuidance: [
      "Review drift monthly and rebalance when any position is more than 5 percentage points away from target weight.",
      "Increase the cash and short-duration Treasury sleeve if the client needs liquidity inside 24 months.",
      "Treat sentiment and forecasts as decision support, not guarantees. Use them alongside client goals and risk tolerance."
    ]
  };
}

export function estimateHoldingsFromPlan(plan: PortfolioPlan) {
  return plan.allocations.map((allocation) => ({
    instrumentId: allocation.instrumentId,
    ticker: allocation.ticker,
    quantity: Number((allocation.amount / Math.max(allocation.snapshot.currentPrice, 1)).toFixed(4)),
    costBasis: allocation.snapshot.currentPrice
  }));
}

export function getUniverseSummary() {
  return INSTRUMENT_UNIVERSE.map((instrument) => ({
    id: instrument.id,
    ticker: instrument.ticker,
    name: instrument.name,
    type: instrument.type,
    riskBand: instrument.riskBand
  }));
}
