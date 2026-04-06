import { ClientProfile, Instrument, InstrumentSnapshot } from "@/lib/types";

type OptimizerResult = {
  weights: Record<string, number>;
  methodSummary: string;
  methodHighlights: string[];
};

const TAU_BY_RISK = {
  low: 0.08,
  medium: 0.12,
  high: 0.18
} as const;

const RISK_AVERSION_BY_RISK = {
  low: 3.8,
  medium: 3.1,
  high: 2.4
} as const;

const BLEND_BY_RISK = {
  low: 0.22,
  medium: 0.35,
  high: 0.45
} as const;

const MAX_SHIFT_BY_RISK = {
  low: 0.04,
  medium: 0.07,
  high: 0.1
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function normalizeVector(values: number[]) {
  const safe = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = safe.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return safe.map(() => (safe.length > 0 ? 1 / safe.length : 0));
  }

  return safe.map((value) => value / total);
}

function annualizedReturn(totalReturnPct: number | null, years: number) {
  if (totalReturnPct === null || totalReturnPct <= -100) {
    return null;
  }

  return Math.pow(1 + totalReturnPct / 100, 1 / years) - 1;
}

function riskBandVolatility(instrument: Instrument) {
  if (instrument.type === "cash") {
    return 0.01;
  }

  if (instrument.type === "treasury") {
    return instrument.id === "ief" ? 0.06 : 0.03;
  }

  if (instrument.type === "bond") {
    return 0.05;
  }

  if (instrument.type === "real_estate") {
    return 0.16;
  }

  if (instrument.type === "inflation_hedge") {
    return 0.18;
  }

  if (instrument.type === "international_equity") {
    return 0.2;
  }

  if (instrument.type === "equity") {
    return instrument.id === "qqq" ? 0.24 : 0.17;
  }

  if (instrument.type === "stock") {
    return instrument.riskBand === "low" ? 0.12 : instrument.riskBand === "medium" ? 0.18 : 0.26;
  }

  return instrument.riskBand === "low" ? 0.04 : instrument.riskBand === "medium" ? 0.12 : 0.22;
}

function pairCorrelation(left: Instrument, right: Instrument) {
  if (left.id === right.id) {
    return 1;
  }

  if (left.type === "cash" || right.type === "cash") {
    return 0.08;
  }

  const pair = [left.type, right.type];
  const includes = (type: Instrument["type"]) => pair[0] === type || pair[1] === type;

  if (includes("treasury") && includes("bond")) {
    return 0.7;
  }

  if (includes("treasury") && (includes("equity") || includes("stock") || includes("international_equity"))) {
    return 0.2;
  }

  if (includes("bond") && (includes("equity") || includes("stock") || includes("international_equity"))) {
    return 0.3;
  }

  if (includes("inflation_hedge") && includes("real_estate")) {
    return 0.35;
  }

  if (includes("inflation_hedge") && (includes("equity") || includes("stock") || includes("international_equity"))) {
    return 0.22;
  }

  if (includes("real_estate") && (includes("equity") || includes("stock") || includes("international_equity"))) {
    return 0.58;
  }

  if (includes("international_equity") && (includes("equity") || includes("stock"))) {
    return 0.76;
  }

  if (
    (left.type === "equity" || left.type === "stock" || left.type === "international_equity") &&
    (right.type === "equity" || right.type === "stock" || right.type === "international_equity")
  ) {
    const sameSector =
      (left.sectors || []).some((sector) => (right.sectors || []).includes(sector)) ||
      left.tags.some((tag) => right.tags.includes(tag));
    return sameSector ? 0.88 : 0.8;
  }

  return 0.35;
}

function buildCovarianceMatrix(instruments: Instrument[]) {
  return instruments.map((left) =>
    instruments.map((right) => {
      const leftVol = riskBandVolatility(left);
      const rightVol = riskBandVolatility(right);
      return leftVol * rightVol * pairCorrelation(left, right);
    })
  );
}

function buildPriorVector(instruments: Instrument[], priorWeights: Record<string, number>) {
  return normalizeVector(instruments.map((instrument) => priorWeights[instrument.id] || 0));
}

function createIdentityMatrix(size: number) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0))
  );
}

function matrixAdd(left: number[][], right: number[][]) {
  return left.map((row, rowIndex) => row.map((value, columnIndex) => value + right[rowIndex][columnIndex]));
}

function matrixScale(matrix: number[][], scalar: number) {
  return matrix.map((row) => row.map((value) => value * scalar));
}

function matrixVectorMultiply(matrix: number[][], vector: number[]) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function invertMatrix(matrix: number[][]) {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [
    ...row.map((value) => value),
    ...createIdentityMatrix(size)[rowIndex]
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    const pivot = augmented[pivotRow][column];
    if (Math.abs(pivot) < 1e-10) {
      throw new Error("Matrix is singular.");
    }

    if (pivotRow !== column) {
      [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    }

    for (let currentColumn = 0; currentColumn < size * 2; currentColumn += 1) {
      augmented[column][currentColumn] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];
      if (factor === 0) {
        continue;
      }

      for (let currentColumn = 0; currentColumn < size * 2; currentColumn += 1) {
        augmented[row][currentColumn] -= factor * augmented[column][currentColumn];
      }
    }
  }

  return augmented.map((row) => row.slice(size));
}

function instrumentViewAdjustment(
  client: ClientProfile,
  instrument: Instrument,
  snapshot: InstrumentSnapshot
) {
  const oneYear = clamp((snapshot.returns["1Y"] || 0) / 100, -0.2, 0.2);
  const fiveYear = annualizedReturn(snapshot.returns["5Y"], 5) ?? oneYear * 0.7;
  const sentimentTilt = clamp(snapshot.sentimentScore * 0.035, -0.035, 0.035);
  const outlookTilt =
    snapshot.outlookLabel === "bullish" ? 0.01 : snapshot.outlookLabel === "cautious" ? -0.01 : 0;

  let clientTilt = 0;
  if (client.needsIncome && instrument.tags.some((tag) => ["income", "dividend", "utility", "banking"].includes(tag))) {
    clientTilt += 0.006;
  }
  if (client.goal === "capital_preservation" && instrument.riskBand === "high") {
    clientTilt -= 0.01;
  }
  if (
    client.goal === "aggressive_growth" &&
    instrument.tags.some((tag) => ["growth", "technology", "ai", "semiconductors"].includes(tag))
  ) {
    clientTilt += 0.01;
  }

  return clamp(oneYear * 0.45 + fiveYear * 0.35 + sentimentTilt + outlookTilt + clientTilt, -0.06, 0.06);
}

function instrumentViewConfidence(snapshot: InstrumentSnapshot) {
  const sentimentComponent = Math.min(Math.abs(snapshot.sentimentScore) * 0.25, 0.2);
  const returnCoverage =
    (snapshot.returns["1Y"] !== null ? 0.14 : 0) +
    (snapshot.returns["5Y"] !== null ? 0.12 : 0) +
    (snapshot.returns["10Y"] !== null ? 0.06 : 0);

  return clamp(0.35 + sentimentComponent + returnCoverage, 0.35, 0.82);
}

function capShiftedWeights(prior: number[], next: number[], maxShift: number) {
  const shifted = next.map((value, index) => clamp(value, Math.max(0, prior[index] - maxShift), prior[index] + maxShift));
  return normalizeVector(shifted);
}

export function optimizeWeightsWithBlackLitterman(
  client: ClientProfile,
  instruments: Instrument[],
  priorWeights: Record<string, number>,
  snapshots: InstrumentSnapshot[]
): OptimizerResult {
  if (instruments.length <= 1) {
    return {
      weights: priorWeights,
      methodSummary:
        "The portfolio keeps its original mix because there are not enough holdings for the balancing model to add useful diversification guidance.",
      methodHighlights: [
        "Client rules still shaped the recommendation.",
        "Manual exclusions and swaps stay in place.",
        "The model avoids adding complexity when the shortlist is very small."
      ]
    };
  }

  try {
    const prior = buildPriorVector(instruments, priorWeights);
    const covariance = buildCovarianceMatrix(instruments);
    const tau = TAU_BY_RISK[client.riskLevel];
    const riskAversion = RISK_AVERSION_BY_RISK[client.riskLevel];
    const blend = BLEND_BY_RISK[client.riskLevel];
    const maxShift = MAX_SHIFT_BY_RISK[client.riskLevel];

    const regularizedCovariance = covariance.map((row, rowIndex) =>
      row.map((value, columnIndex) => (rowIndex === columnIndex ? value + 0.0001 : value))
    );

    const impliedReturns = matrixVectorMultiply(matrixScale(regularizedCovariance, riskAversion), prior);
    const viewVector = instruments.map((instrument, index) => {
      const snapshot = snapshots[index];
      return impliedReturns[index] + instrumentViewAdjustment(client, instrument, snapshot);
    });
    const omega = instruments.map((instrument, index) => {
      const variance = regularizedCovariance[index][index];
      const confidence = instrumentViewConfidence(snapshots[index]);
      const viewVariance = (variance * tau * (1 - confidence)) / confidence;
      return instruments.map((_, columnIndex) => (index === columnIndex ? viewVariance + 0.0001 : 0));
    });

    const blendedViewMatrix = matrixAdd(matrixScale(regularizedCovariance, tau), omega);
    const viewDelta = viewVector.map((value, index) => value - impliedReturns[index]);
    const posteriorAdjustment = matrixVectorMultiply(
      matrixScale(regularizedCovariance, tau),
      matrixVectorMultiply(invertMatrix(blendedViewMatrix), viewDelta)
    );
    const posteriorReturns = impliedReturns.map((value, index) => value + posteriorAdjustment[index]);

    const optimizedRaw = matrixVectorMultiply(
      invertMatrix(matrixScale(regularizedCovariance, riskAversion)),
      posteriorReturns
    );
    const optimized = normalizeVector(optimizedRaw);
    const blended = prior.map((value, index) => value * (1 - blend) + optimized[index] * blend);
    const capped = capShiftedWeights(prior, blended, maxShift);

    return {
      weights: Object.fromEntries(instruments.map((instrument, index) => [instrument.id, round(capped[index])])),
      methodSummary:
        "The app starts with the client-friendly base mix, then a behind-the-scenes balancing model makes small weight changes using diversification, recent return trends, and confidence in the market signal.",
      methodHighlights: [
        "The starting mix still comes from the client's risk level, time horizon, liquidity needs, and income preferences.",
        "The balancing step is intentionally gentle, so the math does not overpower safety-first or cash-access needs.",
        "Manual removals, swaps, and client-specific constraints still override the optimizer."
      ]
    };
  } catch {
    return {
      weights: priorWeights,
      methodSummary:
        "The app kept the original mix because the balancing model did not have a stable enough input set for a safe adjustment.",
      methodHighlights: [
        "The current rule-based mix is still fully valid.",
        "Client safety, liquidity, and income settings remain applied.",
        "The app falls back to the simpler approach rather than forcing a noisy optimization."
      ]
    };
  }
}
