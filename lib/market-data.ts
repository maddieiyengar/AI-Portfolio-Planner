import { ChartPoint, Instrument, InstrumentChart, InstrumentSnapshot, ReturnWindow } from "@/lib/types";

const WINDOW_MAP: Record<ReturnWindow, number> = {
  "1M": 30,
  "6M": 182,
  "1Y": 365,
  "5Y": 365 * 5,
  "10Y": 365 * 10
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      description?: string;
    };
  };
};

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function annualizedYieldReturn(annualYieldPct: number, months: number) {
  const annualRate = annualYieldPct / 100;
  return (Math.pow(1 + annualRate, months / 12) - 1) * 100;
}

function nearestHistoricalPrice(points: Array<{ time: number; close: number }>, targetDate: Date) {
  const target = targetDate.getTime() / 1000;
  const eligible = points.filter((point) => point.time <= target);
  return eligible.length ? eligible[eligible.length - 1].close : null;
}

async function fetchYahooHistory(ticker: string) {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=10y`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 portfolio-agent"
      },
      next: { revalidate: 3600 }
    }
  );

  if (!response.ok) {
    throw new Error(`Market data lookup failed for ${ticker}: ${response.status}`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  const result = payload.chart?.result?.[0];
  if (!result) {
    throw new Error(payload.chart?.error?.description || `No chart data for ${ticker}`);
  }

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const points = timestamps
    .map((time, index) => ({ time, close: closes[index] }))
    .filter((point): point is { time: number; close: number } => typeof point.close === "number");

  return {
    currentPrice: result.meta?.regularMarketPrice || result.meta?.previousClose || points.at(-1)?.close || 0,
    previousClose: result.meta?.previousClose || null,
    points
  };
}

function isoDate(input: Date) {
  return input.toISOString().slice(0, 10);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildForecastPoints(lastValue: number, annualReturnPct: number, yearsForward: number) {
  const points: ChartPoint[] = [];
  const today = new Date();
  const annualRate = clampNumber(annualReturnPct / 100, -0.2, 0.25);

  for (let month = 1; month <= yearsForward * 12; month += 1) {
    const projectedDate = new Date(today);
    projectedDate.setMonth(projectedDate.getMonth() + month);
    const value = lastValue * Math.pow(1 + annualRate, month / 12);
    points.push({
      date: isoDate(projectedDate),
      value: round(value),
      kind: "forecast"
    });
  }

  return points;
}

export async function getInstrumentChart(
  instrument: Instrument,
  annualReturnPct?: number,
  yearsForward = 10
): Promise<InstrumentChart> {
  if (instrument.type === "cash") {
    const annualYield = instrument.defaultYield || 4;
    const today = new Date();
    const historical: ChartPoint[] = [];

    for (let month = 120; month >= 0; month -= 1) {
      const pointDate = new Date(today);
      pointDate.setMonth(pointDate.getMonth() - month);
      const value = Math.pow(1 + annualYield / 100, (120 - month) / 12);
      historical.push({
        date: isoDate(pointDate),
        value: round(value),
        kind: "historical"
      });
    }

    return {
      instrumentId: instrument.id,
      ticker: instrument.ticker,
      name: instrument.name,
      points: [...historical, ...buildForecastPoints(historical.at(-1)?.value || 1, annualYield, yearsForward)]
    };
  }

  const history = await fetchYahooHistory(instrument.ticker);
  const historical = history.points.map((point) => ({
    date: isoDate(new Date(point.time * 1000)),
    value: round(point.close),
    kind: "historical" as const
  }));
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearHistorical = history.points.filter((point) => point.time * 1000 >= oneYearAgo.getTime());
  const baseAnnualReturn =
    annualReturnPct ??
    (oneYearHistorical.length > 1
      ? ((oneYearHistorical.at(-1)!.close - oneYearHistorical[0].close) / oneYearHistorical[0].close) * 100
      : 6);

  return {
    instrumentId: instrument.id,
    ticker: instrument.ticker,
    name: instrument.name,
    points: [...historical, ...buildForecastPoints(round(history.currentPrice), baseAnnualReturn, yearsForward)]
  };
}

function buildCashSnapshot(instrument: Instrument): InstrumentSnapshot {
  const annualYield = instrument.defaultYield || 4;
  return {
    instrumentId: instrument.id,
    ticker: instrument.ticker,
    name: instrument.name,
    currentPrice: 1,
    dailyChangePct: null,
    returns: {
      "1M": round(annualizedYieldReturn(annualYield, 1)),
      "6M": round(annualizedYieldReturn(annualYield, 6)),
      "1Y": round(annualizedYieldReturn(annualYield, 12)),
      "5Y": round((Math.pow(1 + annualYield / 100, 5) - 1) * 100),
      "10Y": round((Math.pow(1 + annualYield / 100, 10) - 1) * 100)
    },
    sentimentScore: 0.2,
    sentimentLabel: "neutral",
    outlookScore: annualYield / 10,
    outlookLabel: "steady",
    latestHeadline: "Cash proxy uses configured APY assumptions instead of live market quotes.",
    dataAsOf: new Date().toISOString(),
    source: "Configured HYSA assumption"
  };
}

export async function getInstrumentSnapshot(instrument: Instrument): Promise<InstrumentSnapshot> {
  if (instrument.type === "cash") {
    return buildCashSnapshot(instrument);
  }

  const history = await fetchYahooHistory(instrument.ticker);
  const now = new Date();

  const returns = (Object.entries(WINDOW_MAP) as Array<[ReturnWindow, number]>).reduce(
    (accumulator, [label, days]) => {
      const pastDate = new Date(now);
      pastDate.setDate(pastDate.getDate() - days);
      const pastPrice = nearestHistoricalPrice(history.points, pastDate);
      accumulator[label] =
        pastPrice && pastPrice > 0 ? round(((history.currentPrice - pastPrice) / pastPrice) * 100) : null;
      return accumulator;
    },
    {} as Record<ReturnWindow, number | null>
  );

  return {
    instrumentId: instrument.id,
    ticker: instrument.ticker,
    name: instrument.name,
    currentPrice: round(history.currentPrice),
    dailyChangePct:
      history.previousClose && history.previousClose > 0
        ? round(((history.currentPrice - history.previousClose) / history.previousClose) * 100)
        : null,
    returns,
    sentimentScore: 0,
    sentimentLabel: "neutral",
    outlookScore: 0,
    outlookLabel: "steady",
    dataAsOf: new Date().toISOString(),
    source: "Yahoo Finance chart endpoint"
  };
}
