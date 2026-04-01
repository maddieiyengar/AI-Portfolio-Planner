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

const MAX_SELECTED_STOCKS = 12;

function normalizeWeights(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  return Object.fromEntries(
    Object.entries(weights)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => [key, Number((value / total).toFixed(4))])
  );
}

function getSelectedStockIds(client: ClientProfile) {
  const selectedMarketCaps = new Set(client.preferredMarketCaps || []);
  const selectedSectors = client.preferredStockSectors || [];
  const sectorSet = new Set(selectedSectors.map((sector) => sector.toLowerCase()));

  return INSTRUMENT_UNIVERSE.filter((instrument) => {
    if (instrument.type !== "stock") {
      return false;
    }

    const marketCapMatch =
      selectedMarketCaps.size === 0 ||
      Array.from(selectedMarketCaps).some((marketCap) => instrument.tags.includes(marketCap));
    const sectorMatch =
      selectedSectors.length === 0 ||
      (instrument.sectors || []).some((sector) => sectorSet.has(sector.toLowerCase()));

    return marketCapMatch && sectorMatch;
  }).map((instrument) => instrument.id);
}

function getEligibleStocks(client: ClientProfile, minimumCount = 0) {
  const selectedStockIds = getSelectedStockIds(client);
  const stocks = INSTRUMENT_UNIVERSE.filter((instrument) => instrument.type === "stock");

  if (selectedStockIds.length === 0) {
    return stocks;
  }

  const selectedStocks = stocks.filter((instrument) => selectedStockIds.includes(instrument.id));
  if (selectedStocks.length >= minimumCount || minimumCount === 0) {
    return selectedStocks;
  }

  const fallbackStocks = stocks.filter((instrument) => !selectedStockIds.includes(instrument.id));
  return [...selectedStocks, ...fallbackStocks];
}

function getRankedCandidateStocks(client: ClientProfile, count = MAX_SELECTED_STOCKS) {
  return getEligibleStocks(client, count)
    .sort((left, right) => scoreStockForClient(client, right) - scoreStockForClient(client, left))
    .slice(0, count);
}

function applySectorPreference(client: ClientProfile, weights: Record<string, number>) {
  const hasSectorFilter = (client.preferredStockSectors || []).length > 0;
  const hasMarketCapFilter = (client.preferredMarketCaps || []).length > 0;
  if (!hasSectorFilter && !hasMarketCapFilter) {
    return weights;
  }

  const selectedStockIds = getRankedCandidateStocks(client).map((instrument) => instrument.id);
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

function distributeWeightChange(
  weights: Record<string, number>,
  instrumentIds: string[],
  amount: number,
  mode: "increase" | "decrease"
) {
  if (amount <= 0 || instrumentIds.length === 0) {
    return;
  }

  if (mode === "increase") {
    const currentTotal = instrumentIds.reduce((sum, instrumentId) => sum + (weights[instrumentId] || 0), 0);

    if (currentTotal > 0) {
      for (const instrumentId of instrumentIds) {
        const share = (weights[instrumentId] || 0) / currentTotal;
        weights[instrumentId] = (weights[instrumentId] || 0) + amount * share;
      }
      return;
    }

    const evenShare = amount / instrumentIds.length;
    for (const instrumentId of instrumentIds) {
      weights[instrumentId] = (weights[instrumentId] || 0) + evenShare;
    }
    return;
  }

  let remaining = amount;
  const idsByWeight = [...instrumentIds].sort((left, right) => (weights[right] || 0) - (weights[left] || 0));

  for (const instrumentId of idsByWeight) {
    if (remaining <= 0) {
      break;
    }

    const available = weights[instrumentId] || 0;
    const reduction = Math.min(available, remaining);
    weights[instrumentId] = available - reduction;
    remaining -= reduction;
  }
}

function parseStockEtfPreference(notes?: string) {
  if (!notes?.trim()) {
    return null;
  }

  const normalizedNotes = notes.toLowerCase();
  const stockMatch = normalizedNotes.match(/(\d{1,3})\s*%\s*(?:individual\s+)?stocks?/);
  const etfMatch = normalizedNotes.match(/(\d{1,3})\s*%\s*etfs?/);

  if (stockMatch && etfMatch) {
    const stockPercent = Number(stockMatch[1]);
    const etfPercent = Number(etfMatch[1]);
    const total = stockPercent + etfPercent;

    if (stockPercent > 0 && etfPercent > 0 && total > 0) {
      return {
        stockTarget: stockPercent / total,
        etfTarget: etfPercent / total
      };
    }
  }

  if (/100\s*%\s*(?:individual\s+)?stocks?/.test(normalizedNotes)) {
    return {
      stockTarget: 1,
      etfTarget: 0
    };
  }

  if (/100\s*%\s*etfs?/.test(normalizedNotes)) {
    return {
      stockTarget: 0,
      etfTarget: 1
    };
  }

  if (/\ball\s+(?:individual\s+)?stocks?\b/.test(normalizedNotes) || /\bno\s+etfs?\b/.test(normalizedNotes)) {
    return {
      stockTarget: 1,
      etfTarget: 0
    };
  }

  if (/\ball\s+etfs?\b/.test(normalizedNotes) || /\bno\s+(?:individual\s+)?stocks?\b/.test(normalizedNotes)) {
    return {
      stockTarget: 0,
      etfTarget: 1
    };
  }

  if (/(?:individual\s+)?stock[-\s]?heavy/.test(normalizedNotes)) {
    return {
      stockTarget: 0.7,
      etfTarget: 0.3
    };
  }

  return null;
}

function scoreStockForClient(client: ClientProfile, instrument: Instrument) {
  let score = 0;
  const selectedMarketCaps = new Set(client.preferredMarketCaps || []);

  if (client.riskLevel === "low") {
    score += instrument.riskBand === "medium" ? 5 : -8;
    if (instrument.tags.includes("large-cap")) {
      score += 3;
    }
    if (instrument.tags.includes("small-cap")) {
      score -= 6;
    }
    if (
      instrument.tags.some((tag) =>
        ["defensive", "income", "utility", "healthcare", "banking", "government", "retail"].includes(tag)
      )
    ) {
      score += 3;
    }
  } else if (client.riskLevel === "medium") {
    score += instrument.riskBand === "medium" ? 5 : 1;
    if (instrument.tags.includes("large-cap")) {
      score += 1;
    }
    if (instrument.tags.includes("mid-cap")) {
      score += 2;
    }
    if (instrument.tags.some((tag) => ["quality growth", "defensive", "banking", "technology"].includes(tag))) {
      score += 2;
    }
  } else {
    score += instrument.riskBand === "high" ? 5 : 2;
    if (instrument.tags.includes("mid-cap")) {
      score += 2;
    }
    if (instrument.tags.includes("small-cap")) {
      score += 3;
    }
    if (instrument.tags.some((tag) => ["growth", "ai", "semiconductors", "technology"].includes(tag))) {
      score += 3;
    }
  }

  if (client.needsIncome && instrument.tags.some((tag) => ["income", "defensive", "utility", "banking"].includes(tag))) {
    score += 3;
  }

  if (selectedMarketCaps.size > 0) {
    for (const marketCap of selectedMarketCaps) {
      if (instrument.tags.includes(marketCap)) {
        score += 5;
      }
    }
  }

  if (client.scenarios?.inflationHedgeOnly && instrument.tags.some((tag) => ["energy", "utility"].includes(tag))) {
    score += 4;
  }

  if (
    client.scenarios?.targetAnnualOutperformancePct &&
    client.scenarios.targetAnnualOutperformancePct >= 5 &&
    instrument.tags.some((tag) => ["growth", "technology", "semiconductors", "small-cap", "mid-cap"].includes(tag))
  ) {
    score += 4;
  }

  if (client.goal === "capital_preservation") {
    if (instrument.tags.some((tag) => ["defensive", "healthcare", "utility", "government", "retail"].includes(tag))) {
      score += 4;
    }
    if (instrument.riskBand === "high") {
      score -= 6;
    }
  }

  if (client.goal === "income" && instrument.tags.some((tag) => ["income", "utility", "banking", "defensive"].includes(tag))) {
    score += 4;
  }

  if (
    (client.goal === "aggressive_growth" || client.timeHorizonYears >= 10) &&
    instrument.tags.some((tag) => ["growth", "ai", "semiconductors", "technology"].includes(tag))
  ) {
    score += 4;
  }

  return score;
}

function buildStockOnlyWeights(client: ClientProfile) {
  const targetCount = client.riskLevel === "low" ? 6 : client.riskLevel === "medium" ? 8 : 10;
  const candidates = getRankedCandidateStocks(client, targetCount);

  if (candidates.length === 0) {
    return null;
  }

  const rawTemplate =
    client.riskLevel === "low"
      ? [0.2, 0.18, 0.17, 0.16, 0.15, 0.14]
      : client.riskLevel === "medium"
        ? [0.16, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.09]
        : [0.14, 0.13, 0.12, 0.11, 0.1, 0.1, 0.09, 0.08, 0.07, 0.06];
  const template = rawTemplate.slice(0, candidates.length);
  const templateTotal = template.reduce((sum, value) => sum + value, 0);
  const weights: Record<string, number> = {};

  candidates.forEach((instrument, index) => {
    weights[instrument.id] = Number((template[index] / templateTotal).toFixed(4));
  });

  return weights;
}

async function safeInstrumentSnapshot(instrument: Instrument) {
  try {
    return await getInstrumentSnapshot(instrument);
  } catch {
    return {
      instrumentId: instrument.id,
      ticker: instrument.ticker,
      name: instrument.name,
      currentPrice: 0,
      returns: {
        "1M": null,
        "6M": null,
        "1Y": null,
        "5Y": null,
        "10Y": null
      },
      sentimentScore: 0,
      sentimentLabel: "neutral" as const,
      outlookScore: 0,
      outlookLabel: "steady" as const,
      latestHeadline: "Live market data timed out. Using a fallback snapshot.",
      dataAsOf: new Date().toISOString(),
      source: "Fallback snapshot"
    };
  }
}

function applyManualExclusions(
  client: ClientProfile,
  weights: Record<string, number>,
  selectedInstruments: Instrument[]
) {
  const excludedIds = new Set(client.manualExcludedInstrumentIds || []);
  if (!client.wantsManualPortfolioChanges || excludedIds.size === 0) {
    return selectedInstruments;
  }

  const remaining = selectedInstruments.filter((instrument) => !excludedIds.has(instrument.id));
  if (remaining.length === 0) {
    return selectedInstruments;
  }

  let removedWeight = 0;
  for (const instrument of selectedInstruments) {
    if (excludedIds.has(instrument.id)) {
      removedWeight += weights[instrument.id] || 0;
      weights[instrument.id] = 0;
    }
  }

  const remainingIds = remaining.map((instrument) => instrument.id);
  distributeWeightChange(weights, remainingIds, removedWeight, "increase");
  return remaining;
}

function reserveWeightForAmount(amount: number | undefined, investmentAmount: number, cap = 0.85) {
  if (!amount || amount <= 0 || investmentAmount <= 0) {
    return 0;
  }

  return Math.min(cap, amount / investmentAmount);
}

function applyScenarioAdjustments(client: ClientProfile, weights: Record<string, number>) {
  const adjusted = { ...weights };
  const scenarios = client.scenarios;

  if (!scenarios) {
    return adjusted;
  }

  if (scenarios.maxPrincipalLossPct && scenarios.maxPrincipalLossPct <= 5) {
    adjusted.hysa = (adjusted.hysa || 0) + 0.12;
    adjusted.sgov = (adjusted.sgov || 0) + 0.08;
    adjusted.bnd = (adjusted.bnd || 0) + 0.05;
    adjusted.vti = Math.max(0, (adjusted.vti || 0) - 0.08);
    adjusted.qqq = Math.max(0, (adjusted.qqq || 0) - 0.06);
    adjusted.nvda = Math.max(0, (adjusted.nvda || 0) - 0.05);
  }

  if (scenarios.targetAnnualOutperformancePct && scenarios.targetAnnualOutperformancePct >= 5) {
    adjusted.vti = (adjusted.vti || 0) + 0.04;
    adjusted.qqq = (adjusted.qqq || 0) + 0.05;
    adjusted.msft = (adjusted.msft || 0) + 0.03;
    adjusted.nvda = (adjusted.nvda || 0) + 0.03;
    adjusted.hysa = Math.max(0, (adjusted.hysa || 0) - 0.04);
    adjusted.sgov = Math.max(0, (adjusted.sgov || 0) - 0.03);
    adjusted.bnd = Math.max(0, (adjusted.bnd || 0) - 0.04);
  }

  if (scenarios.inflationHedgeOnly) {
    adjusted.tip = (adjusted.tip || 0) + 0.08;
    adjusted.gld = (adjusted.gld || 0) + 0.04;
    adjusted.vnq = (adjusted.vnq || 0) + 0.04;
    adjusted.bnd = Math.max(0, (adjusted.bnd || 0) - 0.04);
  }

  const liquidReserveWeight = reserveWeightForAmount(scenarios.requiredLiquidReserve, client.investmentAmount, 0.7);
  if (liquidReserveWeight > 0) {
    adjusted.hysa = Math.max(adjusted.hysa || 0, liquidReserveWeight * 0.6);
    adjusted.sgov = Math.max(adjusted.sgov || 0, liquidReserveWeight * 0.4);
  }

  if (
    scenarios.stagedWithdrawalAmount &&
    scenarios.stagedWithdrawalYears &&
    scenarios.stagedWithdrawalYears <= 3
  ) {
    const stagedWeight = reserveWeightForAmount(scenarios.stagedWithdrawalAmount, client.investmentAmount, 0.8);
    adjusted.hysa = Math.max(adjusted.hysa || 0, stagedWeight * 0.45);
    adjusted.sgov = Math.max(adjusted.sgov || 0, stagedWeight * 0.35);
    adjusted.shy = Math.max(adjusted.shy || 0, stagedWeight * 0.2);
  }

  if (scenarios.allowFiveYearLockup) {
    adjusted.vnq = (adjusted.vnq || 0) + 0.04;
    adjusted.vti = (adjusted.vti || 0) + 0.03;
    adjusted.hysa = Math.max(0, (adjusted.hysa || 0) - 0.03);
  }

  if (scenarios.targetMonthlyIncome && scenarios.targetMonthlyIncome > 0) {
    adjusted.bnd = (adjusted.bnd || 0) + 0.08;
    adjusted.vnq = (adjusted.vnq || 0) + 0.04;
    adjusted.jnj = (adjusted.jnj || 0) + 0.03;
    adjusted.xom = (adjusted.xom || 0) + 0.02;
    adjusted.vti = Math.max(0, (adjusted.vti || 0) - 0.04);
  }

  if (
    scenarios.targetPortfolioValue &&
    scenarios.targetPortfolioYear &&
    scenarios.targetPortfolioYear <= new Date().getFullYear() + 4
  ) {
    adjusted.vti = (adjusted.vti || 0) + 0.04;
    adjusted.qqq = (adjusted.qqq || 0) + 0.03;
    adjusted.msft = (adjusted.msft || 0) + 0.02;
  }

  if (scenarios.taxAwareTransition) {
    adjusted.bnd = (adjusted.bnd || 0) + 0.04;
    adjusted.sgov = (adjusted.sgov || 0) + 0.03;
    adjusted.qqq = Math.max(0, (adjusted.qqq || 0) - 0.03);
    adjusted.nvda = Math.max(0, (adjusted.nvda || 0) - 0.02);
  }

  return adjusted;
}

function describeScenarioOverlay(client: ClientProfile) {
  const scenarios = client.scenarios;
  if (!scenarios) {
    return null;
  }

  const lines: string[] = [];

  if (scenarios.maxPrincipalLossPct) {
    lines.push(`A safety-first overlay targets a max principal loss near ${scenarios.maxPrincipalLossPct}%.`);
  }
  if (scenarios.targetAnnualOutperformancePct) {
    lines.push(`The growth overlay seeks to beat the benchmark by about ${scenarios.targetAnnualOutperformancePct}% annually.`);
  }
  if (scenarios.inflationHedgeOnly) {
    lines.push("The portfolio adds explicit inflation-hedge exposure in case purchasing power remains under pressure.");
  }
  if (scenarios.requiredLiquidReserve) {
    lines.push(`It keeps about $${Math.round(scenarios.requiredLiquidReserve).toLocaleString()} in liquid reserves.`);
  }
  if (scenarios.stagedWithdrawalAmount && scenarios.stagedWithdrawalYears) {
    lines.push(
      `It earmarks roughly $${Math.round(scenarios.stagedWithdrawalAmount).toLocaleString()} for withdrawal in ${scenarios.stagedWithdrawalYears} years.`
    );
  }
  if (scenarios.targetMonthlyIncome && scenarios.targetIncomeStartYear) {
    lines.push(
      `The income sleeve is shaped around a target monthly distribution of $${Math.round(scenarios.targetMonthlyIncome).toLocaleString()} starting in ${scenarios.targetIncomeStartYear}.`
    );
  }

  return lines.length > 0 ? lines.join(" ") : null;
}

function applyNotesPreference(client: ClientProfile, weights: Record<string, number>) {
  const preference = parseStockEtfPreference(client.notes);
  if (!preference) {
    return weights;
  }

  if (preference.stockTarget === 1 && preference.etfTarget === 0) {
    return buildStockOnlyWeights(client) || weights;
  }

  const adjusted = { ...weights };
  const stockIds = getRankedCandidateStocks(client).map((instrument) => instrument.id);
  const fundIds = INSTRUMENT_UNIVERSE.filter((instrument) => instrument.type !== "stock").map(
    (instrument) => instrument.id
  );

  if (stockIds.length === 0 || fundIds.length === 0) {
    return adjusted;
  }

  const currentStockWeight = stockIds.reduce((sum, instrumentId) => sum + (adjusted[instrumentId] || 0), 0);
  const targetStockWeight = preference.stockTarget;

  if (currentStockWeight < targetStockWeight) {
    const shiftAmount = targetStockWeight - currentStockWeight;
    distributeWeightChange(adjusted, fundIds, shiftAmount, "decrease");
    distributeWeightChange(adjusted, stockIds, shiftAmount, "increase");
    return adjusted;
  }

  const targetFundWeight = preference.etfTarget;
  const currentFundWeight = fundIds.reduce((sum, instrumentId) => sum + (adjusted[instrumentId] || 0), 0);

  if (currentFundWeight < targetFundWeight) {
    const shiftAmount = targetFundWeight - currentFundWeight;
    distributeWeightChange(adjusted, stockIds, shiftAmount, "decrease");
    distributeWeightChange(adjusted, fundIds, shiftAmount, "increase");
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
  const scenarioSuggestions: string[] = [];
  if (client.preferredMarketCaps?.length) {
    scenarioSuggestions.push(`Market-cap focus applied: ${client.preferredMarketCaps.join(", ")}.`);
  }
  if (client.scenarios?.allowFiveYearLockup) {
    scenarioSuggestions.push("Client allows a multi-year lock-up, so the model can lean toward longer-duration or less-liquid growth sleeves.");
  }
  if (client.scenarios?.inflationHedgeOnly) {
    scenarioSuggestions.push("Inflation hedge preference applied through TIPS, real assets, and inflation-sensitive stocks.");
  }
  if (client.scenarios?.taxAwareTransition) {
    scenarioSuggestions.push("Tax-aware transition flag is on, so the engine softens high-growth concentration rather than forcing an abrupt shift.");
  }
  if ((client.manualExcludedInstrumentIds || []).length > 0) {
    scenarioSuggestions.push(
      `Excluded from the portfolio: ${(client.manualExcludedInstrumentIds || []).length} client-rejected position(s).`
    );
  }

  if (!client.wantsManualPortfolioChanges) {
    return scenarioSuggestions;
  }

  if (client.manualReplacementTicker?.trim()) {
    return [
      ...scenarioSuggestions,
      `Manual replacement requested: swap ${client.manualReplacementTarget || "the selected instrument"} for ${client.manualReplacementTicker.toUpperCase()}.`
    ];
  }

  const targetInstrument = selectedInstruments.find((instrument) => instrument.id === client.manualReplacementTarget);
  if (!targetInstrument) {
    return [
      ...scenarioSuggestions,
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
      ? [...scenarioSuggestions, ...stockSuggestions]
      : [...scenarioSuggestions, "No matching stock suggestion was found for the selected sectors. Try a specific ticker instead."];
  }

  return sameTypeSuggestions.length > 0
    ? [...scenarioSuggestions, ...sameTypeSuggestions]
    : [...scenarioSuggestions, "No close replacement suggestion found. Enter a specific ticker to swap in a client-requested instrument."];
}

function applyProfileAdjustments(client: ClientProfile) {
  const weights = { ...BASE_ALLOCATIONS[client.riskLevel] };

  if (client.riskScore !== undefined && client.riskScore <= 3) {
    weights.hysa = (weights.hysa || 0) + 0.05;
    weights.sgov = (weights.sgov || 0) + 0.04;
    weights.qqq = Math.max(0, (weights.qqq || 0) - 0.03);
  } else if (client.riskScore !== undefined && client.riskScore >= 8) {
    weights.vti = (weights.vti || 0) + 0.03;
    weights.qqq = (weights.qqq || 0) + 0.03;
    weights.hysa = Math.max(0, (weights.hysa || 0) - 0.02);
  }

  if (client.liquidityRatio !== undefined && client.liquidityRatio >= 0.3) {
    weights.hysa = (weights.hysa || 0) + 0.05;
    weights.sgov = (weights.sgov || 0) + 0.03;
  }

  if (client.targetDate !== undefined) {
    const yearsUntilTarget = client.targetDate - new Date().getFullYear();
    if (yearsUntilTarget <= 3) {
      weights.hysa = (weights.hysa || 0) + 0.05;
      weights.sgov = (weights.sgov || 0) + 0.04;
      weights.vti = Math.max(0, (weights.vti || 0) - 0.04);
    } else if (yearsUntilTarget >= 10) {
      weights.vti = (weights.vti || 0) + 0.03;
      weights.vxus = (weights.vxus || 0) + 0.02;
    }
  }

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

  const scenarioAdjusted = applyScenarioAdjustments(client, weights);
  const sectorAdjusted = applySectorPreference(client, scenarioAdjusted);
  return normalizeWeights(applyNotesPreference(client, sectorAdjusted));
}

function describePortfolio(client: ClientProfile) {
  const scenarioOverlay = describeScenarioOverlay(client);
  if (client.riskLevel === "low") {
    return [
      "This allocation prioritizes principal stability and income resilience through Treasuries, high-quality bonds, and cash-like reserves. Stock exposure is limited to a small sleeve of more defensive or high-quality names so month-to-month swings remain muted.",
      scenarioOverlay
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (client.riskLevel === "medium") {
    return [
      "This allocation balances long-term growth with downside buffers. Bonds, Treasuries, and real assets reduce shock risk while diversified ETFs and selective individual stocks provide the growth engine.",
      scenarioOverlay
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "This allocation targets long-horizon growth with a larger equity sleeve, combining diversified ETFs with selective individual stocks while preserving some ballast in bonds, Treasuries, and hedges to limit concentration risk.",
    scenarioOverlay
  ]
    .filter(Boolean)
    .join(" ");
}

function buildSectorSpecificityNote(client: ClientProfile, instrument: Instrument) {
  const selectedSectors = client.preferredStockSectors || [];
  const instrumentSectors = instrument.sectors || [];

  if (selectedSectors.length === 0) {
    if (instrument.tags.includes("diversified")) {
      return "keeps exposure spread across several industries.";
    }

    if (instrumentSectors.length === 1) {
      return `adds focused exposure to ${instrumentSectors[0]}.`;
    }

    if (instrumentSectors.length > 1) {
      return `spans several related industries, including ${instrumentSectors.join(", ")}.`;
    }

    return "adds diversification outside any single industry bucket.";
  }

  const selectedSectorSet = new Set(selectedSectors.map((sector) => sector.toLowerCase()));
  const overlappingSectors = instrumentSectors.filter((sector) => selectedSectorSet.has(sector.toLowerCase()));

  if (instrument.tags.includes("diversified")) {
    return "keeps diversification across several industries instead of concentrating in a single selected sector.";
  }

  if (overlappingSectors.length === 1 && instrumentSectors.length === 1) {
    return `gives direct exposure to the client's selected sector: ${overlappingSectors[0]}.`;
  }

  if (overlappingSectors.length > 0) {
    return `touches the client's selected sectors through a mixed-industry exposure: ${overlappingSectors.join(", ")}.`;
  }

  if (instrumentSectors.length === 1) {
    return `adds a distinct sleeve in ${instrumentSectors[0]} rather than duplicating the selected stock sectors.`;
  }

  return "adds diversification through asset-class exposure rather than a single-sector stock bet.";
}

export async function generatePortfolioPlan(client: ClientProfile): Promise<PortfolioPlan> {
  const weights = applyProfileAdjustments(client);
  const initialInstruments = Object.keys(weights)
    .map((id) => getInstrumentById(id))
    .filter((instrument): instrument is NonNullable<typeof instrument> => Boolean(instrument));
  const afterExclusions = applyManualExclusions(client, weights, initialInstruments);
  const selectedInstruments = applyManualReplacement(client, weights, afterExclusions);

  const enrichedAllocations = await Promise.all(
    selectedInstruments.map(async (instrument) => {
      const snapshot = await safeInstrumentSnapshot(instrument);
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
        rationale: `${instrument.description} Selected because it fits a ${client.riskLevel}-risk profile, supports a ${client.goal.replace("_", " ") } objective, and ${buildSectorSpecificityNote(client, instrument)}`,
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

export async function estimateHoldingsFromPlan(plan: PortfolioPlan) {
  return Promise.all(
    plan.allocations.map(async (allocation) => {
      let currentPrice = allocation.snapshot.currentPrice;

      if (allocation.snapshot.source === "Fallback snapshot" || currentPrice <= 0) {
        const instrument = getInstrumentById(allocation.instrumentId);
        if (!instrument) {
          throw new Error(`Unable to finalize ${allocation.ticker}: instrument metadata is unavailable.`);
        }

        const refreshedSnapshot = await getInstrumentSnapshot(instrument);
        currentPrice = refreshedSnapshot.currentPrice;
      }

      if (!currentPrice || currentPrice <= 0) {
        throw new Error(`Unable to finalize ${allocation.ticker}: live market pricing is unavailable right now.`);
      }

      return {
        instrumentId: allocation.instrumentId,
        ticker: allocation.ticker,
        quantity: Number((allocation.amount / currentPrice).toFixed(4)),
        costBasis: currentPrice
      };
    })
  );
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
