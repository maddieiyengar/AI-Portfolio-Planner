import { getInstrumentChart, getInstrumentSnapshot } from "@/lib/market-data";
import { ChartPoint, FinalizedPortfolio, InstrumentChart, PortfolioPlan } from "@/lib/types";
import { getInstrumentById, resolveInstrument } from "@/lib/universe";

function uniqueSortedDates(charts: InstrumentChart[]) {
  return [...new Set(charts.flatMap((chart) => chart.points.map((point) => point.date)))].sort();
}

function valueAtOrBefore(points: ChartPoint[], date: string) {
  let value = points[0]?.value ?? 0;
  let kind: ChartPoint["kind"] = points[0]?.kind ?? "historical";

  for (const point of points) {
    if (point.date > date) {
      break;
    }
    value = point.value;
    kind = point.kind;
  }

  return { value, kind };
}

export async function buildChartsForPlan(plan: PortfolioPlan) {
  const charts = await Promise.all(
    plan.allocations.map(async (allocation) => {
      const instrument = getInstrumentById(allocation.instrumentId) || {
        id: allocation.instrumentId,
        ticker: allocation.ticker,
        name: allocation.name,
        type: "equity" as const,
        description: allocation.rationale,
        riskBand: "high" as const,
        tags: ["custom"]
      };
      const annualReturnEstimate =
        (allocation.snapshot.returns["1Y"] || 0) * 0.65 +
        (allocation.snapshot.returns["5Y"] || 0) * 0.25 +
        allocation.snapshot.sentimentScore * 10;
      return getInstrumentChart(instrument, annualReturnEstimate);
    })
  );

  const portfolioDates = uniqueSortedDates(charts);
  const portfolioChart: ChartPoint[] = portfolioDates.map((date) => {
    let total = 0;
    let forecastWeight = 0;

    for (const allocation of plan.allocations) {
      const chart = charts.find((item) => item.instrumentId === allocation.instrumentId);
      if (!chart) {
        continue;
      }
      const point = valueAtOrBefore(chart.points, date);
      const baseValue = chart.points[0]?.value || 1;
      total += (allocation.amount / baseValue) * point.value;
      if (point.kind === "forecast") {
        forecastWeight += 1;
      }
    }

    return {
      date,
      value: Number(total.toFixed(2)),
      kind: forecastWeight > plan.allocations.length / 2 ? "forecast" : "historical"
    };
  });

  return {
    instruments: charts,
    portfolio: portfolioChart
  };
}

export async function buildChartsForFinalizedPortfolio(portfolio: FinalizedPortfolio) {
  const charts = await Promise.all(
    portfolio.holdings.map(async (holding) => {
      const instrument = resolveInstrument({ instrumentId: holding.instrumentId, ticker: holding.ticker });

      if (!instrument) {
        return null;
      }

      const snapshot = await getInstrumentSnapshot(instrument);
      const annualReturnEstimate =
        (snapshot.returns["1Y"] || 0) * 0.65 + (snapshot.returns["5Y"] || 0) * 0.25 + snapshot.sentimentScore * 10;

      return getInstrumentChart(instrument, annualReturnEstimate);
    })
  );

  const validCharts = charts.filter((chart): chart is InstrumentChart => Boolean(chart));
  const portfolioDates = uniqueSortedDates(validCharts);
  const portfolioChart: ChartPoint[] = portfolioDates.map((date) => {
    let total = 0;
    let forecastWeight = 0;

    for (const holding of portfolio.holdings) {
      const chart = validCharts.find((item) => item.instrumentId === holding.instrumentId);
      if (!chart) {
        continue;
      }

      const point = valueAtOrBefore(chart.points, date);
      total += holding.quantity * point.value;
      if (point.kind === "forecast") {
        forecastWeight += 1;
      }
    }

    return {
      date,
      value: Number(total.toFixed(2)),
      kind: forecastWeight > portfolio.holdings.length / 2 ? "forecast" : "historical"
    };
  });

  return {
    instruments: validCharts,
    portfolio: portfolioChart
  };
}
