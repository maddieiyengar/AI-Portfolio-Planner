"use client";

import { useEffect, useState, useTransition } from "react";
import { PerformanceChart } from "@/components/performance-chart";
import { ClientProfile, FinalizedPortfolio, InstrumentChart, PortfolioPlan } from "@/lib/types";

const MARKET_CAP_OPTIONS = ["large-cap", "mid-cap", "small-cap"] as const;

const SECTOR_OPTIONS = [
  "Agriculture, Forestry, Fishing, and Hunting",
  "Manufacturing",
  "Technology & IT",
  "Healthcare & Social Assistance",
  "Finance & Insurance",
  "Retail & Wholesale Trade",
  "Construction & Real Estate",
  "Transportation & Warehousing",
  "Energy & Utilities",
  "Information & Communications",
  "Hospitality & Leisure",
  "Professional & Technical Services",
  "Education Services",
  "Government & Public Administration"
];

const initialProfile: ClientProfile = {
  name: "Taylor Client",
  portfolioName: "Taylor Income Shield",
  age: 38,
  riskLevel: "low",
  investmentAmount: 150000,
  timeHorizonYears: 7,
  monthlyContribution: 1500,
  liquidityNeed: "medium",
  needsIncome: true,
  goal: "capital_preservation",
  preferredMarketCaps: ["large-cap"],
  riskScore: 3,
  liquidityRatio: 0.2,
  targetDate: new Date().getFullYear() + 7,
  scenarios: {
    maxPrincipalLossPct: 5,
    targetAnnualOutperformancePct: 0,
    inflationHedgeOnly: false,
    requiredLiquidReserve: 20000,
    stagedWithdrawalAmount: 0,
    stagedWithdrawalYears: 2,
    allowFiveYearLockup: false,
    targetMonthlyIncome: 0,
    targetIncomeStartYear: 2030,
    targetPortfolioValue: 0,
    targetPortfolioYear: 2028,
    taxAwareTransition: false
  },
  preferredStockSectors: ["Healthcare & Social Assistance", "Finance & Insurance"],
  wantsManualPortfolioChanges: false,
  manualExcludedInstrumentIds: [],
  manualReplacementTarget: "",
  manualReplacementTicker: "",
  notes: "Prefers stable returns and wants a liquid emergency reserve."
};

const TRACKABLE_INSTRUMENTS = [
  ["hysa", "HYSA"],
  ["sgov", "SGOV"],
  ["shy", "SHY"],
  ["ief", "IEF"],
  ["tip", "TIP"],
  ["bnd", "BND"],
  ["vti", "VTI"],
  ["de", "DE"],
  ["msft", "MSFT"],
  ["jnj", "JNJ"],
  ["jpm", "JPM"],
  ["cost", "COST"],
  ["cat", "CAT"],
  ["ups", "UPS"],
  ["xom", "XOM"],
  ["nee", "NEE"],
  ["nvda", "NVDA"],
  ["dis", "DIS"],
  ["mar", "MAR"],
  ["acn", "ACN"],
  ["duol", "DUOL"],
  ["lmt", "LMT"],
  ["vxus", "VXUS"],
  ["vnq", "VNQ"],
  ["gld", "GLD"],
  ["qqq", "QQQ"]
];

const RANGE_PRESETS = [
  { label: "1D", days: 1 },
  { label: "1M", days: 30 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 365 * 5 },
  { label: "10Y", days: 365 * 10 }
] as const;

function normalizeTicker(value: string) {
  return value.trim().toUpperCase();
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function percent(value: number | null) {
  if (value === null) {
    return "N/A";
  }
  return `${value.toFixed(2)}%`;
}

function portfolioStartDate(portfolio: FinalizedPortfolio) {
  return portfolio.finalizedAt.slice(0, 10);
}

function valueAtOrBefore(points: InstrumentChart["points"], date: string) {
  let match = points[0] || null;

  for (const point of points) {
    if (point.date > date) {
      break;
    }
    match = point;
  }

  return match;
}

function pointsForWindow(points: InstrumentChart["points"], start: string, end: string) {
  const filtered = points.filter((point) => point.date >= start && point.date <= end);

  if (filtered.length >= 2) {
    return filtered;
  }

  const startPoint = valueAtOrBefore(points, start);
  const endPoint = valueAtOrBefore(points, end);
  const synthetic = [startPoint && { ...startPoint, date: start }, endPoint && { ...endPoint, date: end }].filter(
    (point): point is NonNullable<typeof point> => Boolean(point)
  );

  return synthetic.filter(
    (point, index, array) => array.findIndex((candidate) => candidate.date === point.date) === index
  );
}

export function PortfolioAgent() {
  const today = new Date().toISOString().slice(0, 10);
  const [profile, setProfile] = useState<ClientProfile>(initialProfile);
  const [plan, setPlan] = useState<PortfolioPlan | null>(null);
  const [trackedPortfolios, setTrackedPortfolios] = useState<FinalizedPortfolio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [chartData, setChartData] = useState<{
    portfolio: InstrumentChart["points"];
    instruments: InstrumentChart[];
  } | null>(null);
  const [trackedChartData, setTrackedChartData] = useState<
    Record<
      string,
      {
        portfolio: InstrumentChart["points"];
        instruments: InstrumentChart[];
      }
    >
  >({});
  const [trackedDateWindows, setTrackedDateWindows] = useState<Record<string, { start: string; end: string }>>({});
  const [activeTrackedChartId, setActiveTrackedChartId] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [selectedRange, setSelectedRange] = useState<(typeof RANGE_PRESETS)[number]["label"]>("1Y");
  const [dateWindow, setDateWindow] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(end.getFullYear() - 1);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    };
  });
  const [tradeForm, setTradeForm] = useState({
    portfolioId: "",
    instrumentId: "",
    ticker: "",
    action: "buy" as "buy" | "sell",
    quantity: 10
  });

  const selectedTrackedPortfolio = trackedPortfolios.find(
    (portfolio) => portfolio.portfolioId === tradeForm.portfolioId
  );

  const selectedHolding = selectedTrackedPortfolio?.holdings.find(
    (holding) =>
      holding.instrumentId === tradeForm.instrumentId ||
      holding.ticker.toUpperCase() === normalizeTicker(tradeForm.ticker)
  );

  async function refreshTrackedPortfolios() {
    const response = await fetch("/api/portfolio/monitor");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to refresh monitored portfolios.");
    }
    setTrackedPortfolios(payload.portfolios);
    setRenameDrafts((current) => {
      const next = { ...current };
      for (const portfolio of payload.portfolios) {
        if (!next[portfolio.portfolioId]) {
          next[portfolio.portfolioId] = portfolio.portfolioName;
        }
      }
      return next;
    });
    if (!tradeForm.portfolioId && payload.portfolios?.[0]?.portfolioId) {
      const firstPortfolio = payload.portfolios[0];
      const firstHolding = firstPortfolio.holdings[0];
      setTradeForm((current) => ({
        ...current,
        portfolioId: firstPortfolio.portfolioId,
        instrumentId: firstHolding?.instrumentId || "",
        ticker: firstHolding?.ticker || ""
      }));
    }
  }

  useEffect(() => {
    refreshTrackedPortfolios().catch((issue) => {
      setError(issue instanceof Error ? issue.message : "Unable to load tracked portfolios.");
    });
  }, []);

  function updateProfile<K extends keyof ClientProfile>(key: K, value: ClientProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function toggleSector(sector: string) {
    const currentSectors = profile.preferredStockSectors || [];
    updateProfile(
      "preferredStockSectors",
      currentSectors.includes(sector)
        ? currentSectors.filter((item) => item !== sector)
        : [...currentSectors, sector]
    );
  }

  function toggleMarketCap(marketCap: (typeof MARKET_CAP_OPTIONS)[number]) {
    const currentMarketCaps = profile.preferredMarketCaps || [];
    updateProfile(
      "preferredMarketCaps",
      currentMarketCaps.includes(marketCap)
        ? currentMarketCaps.filter((item) => item !== marketCap)
        : [...currentMarketCaps, marketCap]
    );
  }

  function toggleManualExclusion(instrumentId: string) {
    const excludedIds = profile.manualExcludedInstrumentIds || [];
    updateProfile(
      "manualExcludedInstrumentIds",
      excludedIds.includes(instrumentId)
        ? excludedIds.filter((item) => item !== instrumentId)
        : [...excludedIds, instrumentId]
    );

    if (profile.manualReplacementTarget === instrumentId) {
      updateProfile("manualReplacementTarget", "");
      updateProfile("manualReplacementTicker", "");
    }
  }

  function updateScenario<K extends keyof NonNullable<ClientProfile["scenarios"]>>(
    key: K,
    value: NonNullable<ClientProfile["scenarios"]>[K]
  ) {
    setProfile((current) => ({
      ...current,
      scenarios: {
        ...(current.scenarios || {}),
        [key]: value
      }
    }));
  }

  function applyRangePreset(label: (typeof RANGE_PRESETS)[number]["label"], days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setSelectedRange(label);
    setDateWindow({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    });
  }

  function filterPoints(points: InstrumentChart["points"]) {
    return pointsForWindow(points, dateWindow.start, dateWindow.end);
  }

  function updateDateWindow(boundary: "start" | "end", value: string) {
    const safeValue = value > today ? today : value;
    setSelectedRange("1Y");
    setDateWindow((current) => {
      const next = { ...current, [boundary]: safeValue };
      if (next.start > next.end) {
        return boundary === "start"
          ? { start: safeValue, end: safeValue }
          : { start: safeValue, end: safeValue };
      }
      return next;
    });
  }

  function getTrackedDateWindow(portfolio: FinalizedPortfolio) {
    return (
      trackedDateWindows[portfolio.portfolioId] || {
        start: portfolioStartDate(portfolio),
        end: dateWindow.end
      }
    );
  }

  function filterTrackedPoints(portfolio: FinalizedPortfolio, points: InstrumentChart["points"]) {
    const window = getTrackedDateWindow(portfolio);
    return pointsForWindow(points, window.start, window.end);
  }

  function updateTrackedDateWindow(
    portfolio: FinalizedPortfolio,
    boundary: "start" | "end",
    value: string
  ) {
    const minStart = portfolioStartDate(portfolio);
    const safeValue = value > today ? today : value;
    setTrackedDateWindows((current) => {
      const existing = current[portfolio.portfolioId] || {
        start: minStart,
        end: dateWindow.end
      };
      const next = {
        ...existing,
        [boundary]: boundary === "start" && safeValue < minStart ? minStart : safeValue
      };
      if (next.start < minStart) {
        next.start = minStart;
      }
      return {
        ...current,
        [portfolio.portfolioId]:
          next.start > next.end
            ? {
                start: boundary === "start" ? next.start : minStart > safeValue ? minStart : safeValue,
                end: boundary === "start" ? next.start : minStart > safeValue ? minStart : safeValue
              }
            : next
      };
    });
  }

  async function generatePortfolio() {
    setError(null);
    const response = await fetch("/api/portfolio/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(profile)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to generate portfolio.");
    }
    setPlan(payload.plan);
    const chartsResponse = await fetch("/api/portfolio/charts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ plan: payload.plan })
    });
    const chartsPayload = await chartsResponse.json();
    if (!chartsResponse.ok) {
      throw new Error(chartsPayload.error || "Unable to load charts.");
    }
    setChartData(chartsPayload.charts);
  }

  async function finalizePortfolio() {
    if (!plan) {
      return;
    }
    const response = await fetch("/api/portfolio/finalize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ plan })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to finalize portfolio.");
    }
    await refreshTrackedPortfolios();
  }

  async function submitTradeIntent() {
    const response = await fetch("/api/portfolio/monitor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        portfolioId: tradeForm.portfolioId,
        trade: {
          action: tradeForm.action,
          instrumentId: tradeForm.instrumentId || undefined,
          ticker: normalizeTicker(tradeForm.ticker),
          quantity: Number(tradeForm.quantity)
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to update holding.");
    }
    await refreshTrackedPortfolios();
  }

  async function loadTrackedCharts(portfolio: FinalizedPortfolio) {
    const existing = trackedChartData[portfolio.portfolioId];
    if (existing) {
      setActiveTrackedChartId((current) => (current === portfolio.portfolioId ? null : portfolio.portfolioId));
      return;
    }

    const response = await fetch("/api/portfolio/charts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ trackedPortfolio: portfolio })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to load tracked portfolio charts.");
    }

    setTrackedChartData((current) => ({
      ...current,
      [portfolio.portfolioId]: payload.charts
    }));
    setTrackedDateWindows((current) => ({
      ...current,
      [portfolio.portfolioId]:
        current[portfolio.portfolioId] || {
          start: portfolioStartDate(portfolio),
          end: dateWindow.end
        }
    }));
    setActiveTrackedChartId(portfolio.portfolioId);
  }

  async function renameTrackedPortfolio(portfolioId: string) {
    const portfolioName = (renameDrafts[portfolioId] || "").trim();
    const response = await fetch("/api/portfolio/monitor", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ portfolioId, portfolioName })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to rename tracked portfolio.");
    }

    setTrackedChartData((current) => {
      if (!current[portfolioId]) {
        return current;
      }
      return { ...current };
    });
    await refreshTrackedPortfolios();
  }

  function exportTrackedPortfolio(portfolio: FinalizedPortfolio) {
    const trackedWindow = getTrackedDateWindow(portfolio);
    const searchParams = new URLSearchParams({
      portfolioId: portfolio.portfolioId,
      start: trackedWindow.start,
      end: trackedWindow.end
    });

    window.location.href = `/api/portfolio/export?${searchParams.toString()}`;
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">AI Portfolio Planning Desk</p>
          <h1>Design a risk-aware client portfolio, then track it every day.</h1>
          <p className="lede">
            This agent recommends allocations across Treasuries, bonds, cash, diversified market ETFs,
            and selected individual stocks, shows live prices with trailing returns, estimates forward
            scenarios from past performance and news sentiment, and keeps a daily watchlist after the
            client finalizes a plan.
          </p>
        </div>
        <div className="hero-card">
          <p>Compliance boundary</p>
          <strong>No money movement. No trade execution.</strong>
          <span>
            The system only analyzes, recommends, and records client-directed buy or sell intents for
            monitoring.
          </span>
          <span>
            Take financial advice at your own discretion. This agent is meant to guide your decisions,
            not replace professional judgment or personalized advice from a licensed financial expert.
          </span>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Client profile</h2>
          <div className="helper-box">
            <p className="caption">
              These inputs are preference settings, not guarantees. Risk fields describe how much short-term volatility
              and downside the client can tolerate. Liquidity fields describe how soon the client may need access to cash
              and how much of the portfolio should stay in liquid, low-volatility holdings.
            </p>
          </div>
          <div className="form-grid">
            <label>
              <span>Name</span>
              <input value={profile.name} onChange={(event) => updateProfile("name", event.target.value)} />
            </label>
            <label>
              <span>Portfolio name</span>
              <input
                value={profile.portfolioName || ""}
                onChange={(event) => updateProfile("portfolioName", event.target.value)}
              />
            </label>
            <label>
              <span>Age</span>
              <input
                type="number"
                value={profile.age}
                onChange={(event) => updateProfile("age", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Risk level</span>
              <select
                value={profile.riskLevel}
                onChange={(event) => updateProfile("riskLevel", event.target.value as ClientProfile["riskLevel"])}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <p className="field-help">
                Low favors capital preservation, medium balances stability and growth, and high accepts larger swings for
                more upside potential.
              </p>
            </label>
            <label>
              <span>Goal</span>
              <select
                value={profile.goal}
                onChange={(event) => updateProfile("goal", event.target.value as ClientProfile["goal"])}
              >
                <option value="capital_preservation">Capital preservation</option>
                <option value="income">Income</option>
                <option value="balanced_growth">Balanced growth</option>
                <option value="aggressive_growth">Aggressive growth</option>
              </select>
            </label>
            <label>
              <span>Investment amount</span>
              <input
                type="number"
                value={profile.investmentAmount}
                onChange={(event) => updateProfile("investmentAmount", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Monthly contribution</span>
              <input
                type="number"
                value={profile.monthlyContribution}
                onChange={(event) => updateProfile("monthlyContribution", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Time horizon (years)</span>
              <input
                type="number"
                value={profile.timeHorizonYears}
                onChange={(event) => updateProfile("timeHorizonYears", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Liquidity need</span>
              <select
                value={profile.liquidityNeed}
                onChange={(event) =>
                  updateProfile("liquidityNeed", event.target.value as ClientProfile["liquidityNeed"])
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <p className="field-help">
                Use high when funds may be needed soon, medium for moderate access needs, and low when the client can
                stay invested for longer periods.
              </p>
            </label>
            <div className="full">
              <span className="field-label">Preferred stock industries or sectors</span>
              <p className="caption">Pick multiple options. Only stocks from these sectors will be shown.</p>
              <div className="check-grid">
                {SECTOR_OPTIONS.map((sector) => (
                  <label key={sector} className="check-pill">
                    <input
                      type="checkbox"
                      checked={(profile.preferredStockSectors || []).includes(sector)}
                      onChange={() => toggleSector(sector)}
                    />
                    <span>{sector}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="full">
              <span className="field-label">Preferred market-cap mix</span>
              <p className="caption">Pick multiple options. The stock picker will prioritize these company sizes.</p>
              <div className="check-grid">
                {MARKET_CAP_OPTIONS.map((marketCap) => (
                  <label key={marketCap} className="check-pill">
                    <input
                      type="checkbox"
                      checked={(profile.preferredMarketCaps || []).includes(marketCap)}
                      onChange={() => toggleMarketCap(marketCap)}
                    />
                    <span>{marketCap}</span>
                  </label>
                ))}
              </div>
            </div>
            <label>
              <span>Risk score (1-10)</span>
              <input
                type="number"
                min={1}
                max={10}
                value={profile.riskScore || 1}
                onChange={(event) => updateProfile("riskScore", Number(event.target.value))}
              />
              <p className="field-help">
                A finer-grained volatility tolerance score. Lower values push the model toward more defensive allocations;
                higher values allow more equity and growth exposure.
              </p>
            </label>
            <label>
              <span>Liquidity ratio (0-1)</span>
              <input
                type="number"
                min={0}
                max={1}
                step="0.05"
                value={profile.liquidityRatio || 0}
                onChange={(event) => updateProfile("liquidityRatio", Number(event.target.value))}
              />
              <p className="field-help">
                The share of the portfolio that should remain readily accessible in cash or low-volatility instruments.
                Example: 0.20 means about 20% should stay liquid.
              </p>
            </label>
            <label>
              <span>Target date</span>
              <input
                type="number"
                value={profile.targetDate || new Date().getFullYear()}
                onChange={(event) => updateProfile("targetDate", Number(event.target.value))}
              />
            </label>
            <label className="toggle">
              <span>Needs income</span>
              <input
                type="checkbox"
                checked={profile.needsIncome}
                onChange={(event) => updateProfile("needsIncome", event.target.checked)}
              />
              <p className="field-help">
                Turn this on when the client wants the portfolio to emphasize income-producing holdings such as bonds,
                cash-like assets, REITs, or dividend-oriented stocks.
              </p>
            </label>
            <label className="toggle">
              <span>Modify portfolio manually</span>
              <input
                type="checkbox"
                checked={Boolean(profile.wantsManualPortfolioChanges)}
                onChange={(event) => updateProfile("wantsManualPortfolioChanges", event.target.checked)}
              />
            </label>
            <div className="full">
              <span className="field-label">Scenario constraints</span>
              <p className="caption">
                Capture safety-first, aggressive growth, inflation hedge, liquidity, retirement income, tax-aware,
                and target-outcome requests directly instead of relying only on notes.
              </p>
            </div>
            <label>
              <span>Max principal loss %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={profile.scenarios?.maxPrincipalLossPct || 0}
                onChange={(event) => updateScenario("maxPrincipalLossPct", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Target outperformance %</span>
              <input
                type="number"
                min={0}
                max={25}
                value={profile.scenarios?.targetAnnualOutperformancePct || 0}
                onChange={(event) => updateScenario("targetAnnualOutperformancePct", Number(event.target.value))}
              />
            </label>
            <label className="toggle">
              <span>Inflation hedge scenario</span>
              <input
                type="checkbox"
                checked={Boolean(profile.scenarios?.inflationHedgeOnly)}
                onChange={(event) => updateScenario("inflationHedgeOnly", event.target.checked)}
              />
            </label>
            <label>
              <span>Emergency liquid reserve</span>
              <input
                type="number"
                min={0}
                value={profile.scenarios?.requiredLiquidReserve || 0}
                onChange={(event) => updateScenario("requiredLiquidReserve", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Staged withdrawal amount</span>
              <input
                type="number"
                min={0}
                value={profile.scenarios?.stagedWithdrawalAmount || 0}
                onChange={(event) => updateScenario("stagedWithdrawalAmount", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Withdrawal in years</span>
              <input
                type="number"
                min={0}
                value={profile.scenarios?.stagedWithdrawalYears || 0}
                onChange={(event) => updateScenario("stagedWithdrawalYears", Number(event.target.value))}
              />
            </label>
            <label className="toggle">
              <span>Allow 5-year lock-up</span>
              <input
                type="checkbox"
                checked={Boolean(profile.scenarios?.allowFiveYearLockup)}
                onChange={(event) => updateScenario("allowFiveYearLockup", event.target.checked)}
              />
            </label>
            <label>
              <span>Target monthly income</span>
              <input
                type="number"
                min={0}
                value={profile.scenarios?.targetMonthlyIncome || 0}
                onChange={(event) => updateScenario("targetMonthlyIncome", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Income start year</span>
              <input
                type="number"
                value={profile.scenarios?.targetIncomeStartYear || new Date().getFullYear()}
                onChange={(event) => updateScenario("targetIncomeStartYear", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Target portfolio value</span>
              <input
                type="number"
                min={0}
                value={profile.scenarios?.targetPortfolioValue || 0}
                onChange={(event) => updateScenario("targetPortfolioValue", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Target value year</span>
              <input
                type="number"
                value={profile.scenarios?.targetPortfolioYear || new Date().getFullYear()}
                onChange={(event) => updateScenario("targetPortfolioYear", Number(event.target.value))}
              />
            </label>
            <label className="toggle">
              <span>Tax-aware transition</span>
              <input
                type="checkbox"
                checked={Boolean(profile.scenarios?.taxAwareTransition)}
                onChange={(event) => updateScenario("taxAwareTransition", event.target.checked)}
              />
            </label>
            <label className="full">
              <span>Client notes</span>
              <textarea
                value={profile.notes}
                onChange={(event) => updateProfile("notes", event.target.value)}
                rows={4}
              />
            </label>
          </div>
          <button
            className="primary"
            onClick={() =>
              startTransition(() => {
                generatePortfolio().catch((issue) => {
                  setError(issue instanceof Error ? issue.message : "Unable to generate portfolio.");
                });
              })
            }
            disabled={pending}
          >
            {pending ? "Working..." : "Generate optimal portfolio"}
          </button>
        </div>

        <div className="panel">
          <h2>Tracked portfolios</h2>
          <p className="caption">
            Every refresh captures today&apos;s snapshot if one does not exist yet. Connect the
            monitoring endpoint to a daily cron for hands-off tracking.
          </p>
          <div className="tracker-list">
            {trackedPortfolios.length === 0 ? (
              <p className="empty">No finalized portfolios yet.</p>
            ) : (
              trackedPortfolios.map((portfolio) => {
                const latest = portfolio.snapshots.at(-1);
                const charts = trackedChartData[portfolio.portfolioId];
                const showingCharts = activeTrackedChartId === portfolio.portfolioId && charts;
                    const trackedWindow = getTrackedDateWindow(portfolio);
                return (
                  <article key={portfolio.portfolioId} className="tracker-card">
                    <div className="tracker-head">
                      <div>
                        <p>{portfolio.portfolioName}</p>
                        <strong>{currency(latest?.portfolioValue || 0)}</strong>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          startTransition(() => {
                            loadTrackedCharts(portfolio).catch((issue) => {
                              setError(
                                issue instanceof Error ? issue.message : "Unable to load tracked portfolio charts."
                              );
                            });
                          })
                        }
                        disabled={pending}
                      >
                        {showingCharts ? "Hide charts" : "Show charts"}
                      </button>
                    </div>
                    <span>{latest?.date || "No snapshot yet"}</span>
                    <small>{portfolio.holdings.length} tracked positions</small>
                    <div className="mini-form">
                      <input
                        value={renameDrafts[portfolio.portfolioId] || portfolio.portfolioName}
                        onChange={(event) =>
                          setRenameDrafts((current) => ({
                            ...current,
                            [portfolio.portfolioId]: event.target.value
                          }))
                        }
                        aria-label={`Rename ${portfolio.portfolioName}`}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          startTransition(() => {
                            renameTrackedPortfolio(portfolio.portfolioId).catch((issue) => {
                              setError(
                                issue instanceof Error ? issue.message : "Unable to rename tracked portfolio."
                              );
                            });
                          })
                        }
                        disabled={pending || !(renameDrafts[portfolio.portfolioId] || "").trim()}
                      >
                        Save name
                      </button>
                    </div>
                    <div className="date-grid">
                          <label>
                            <span>Start date</span>
                            <input
                              type="date"
                              value={trackedWindow.start}
                              min={portfolioStartDate(portfolio)}
                              max={today}
                              onChange={(event) =>
                                updateTrackedDateWindow(portfolio, "start", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>End date</span>
                            <input
                              type="date"
                              value={trackedWindow.end}
                              min={trackedWindow.start}
                              max={today}
                              onChange={(event) =>
                                updateTrackedDateWindow(portfolio, "end", event.target.value)
                              }
                            />
                          </label>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => exportTrackedPortfolio(portfolio)}
                      disabled={pending}
                    >
                      Export to Excel
                    </button>
                    {showingCharts ? (
                      <div className="tracker-charts">
                        <PerformanceChart
                          title={`${portfolio.portfolioName} overall performance`}
                          points={filterTrackedPoints(portfolio, charts.portfolio)}
                          selectedStart={trackedWindow.start}
                          selectedEnd={trackedWindow.end}
                        />
                        <div className="cards">
                          {charts.instruments.map((chart) => (
                            <PerformanceChart
                              key={`${portfolio.portfolioId}-${chart.instrumentId}`}
                              title={`${chart.ticker} performance`}
                              points={filterTrackedPoints(portfolio, chart.points)}
                              height={210}
                              selectedStart={trackedWindow.start}
                              selectedEnd={trackedWindow.end}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          <div className="trade-box">
            <h3>Edit a tracked portfolio</h3>
            <p className="caption">
              Update holdings whenever the client buys, sells, or wants to add a new ticker for tracking.
            </p>
            <label>
              <span>Portfolio</span>
              <select
                value={tradeForm.portfolioId}
                onChange={(event) => {
                  const nextPortfolio = trackedPortfolios.find(
                    (portfolio) => portfolio.portfolioId === event.target.value
                  );
                  const firstHolding = nextPortfolio?.holdings[0];
                  setTradeForm((current) => ({
                    ...current,
                    portfolioId: event.target.value,
                    instrumentId: firstHolding?.instrumentId || "",
                    ticker: firstHolding?.ticker || ""
                  }));
                }}
              >
                <option value="">Select a finalized portfolio</option>
                {trackedPortfolios.map((portfolio) => (
                  <option key={portfolio.portfolioId} value={portfolio.portfolioId}>
                    {portfolio.portfolioName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Action</span>
              <select
                value={tradeForm.action}
                onChange={(event) =>
                  setTradeForm((current) => ({
                    ...current,
                    action: event.target.value as "buy" | "sell",
                    instrumentId:
                      event.target.value === "sell" ? selectedTrackedPortfolio?.holdings[0]?.instrumentId || "" : current.instrumentId,
                    ticker:
                      event.target.value === "sell"
                        ? selectedTrackedPortfolio?.holdings[0]?.ticker || current.ticker
                        : current.ticker
                  }))
                }
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>
            <label>
              <span>{tradeForm.action === "sell" ? "Existing holding" : "Ticker"}</span>
              {tradeForm.action === "sell" ? (
                <select
                  value={tradeForm.instrumentId}
                  onChange={(event) => {
                    const nextHolding = selectedTrackedPortfolio?.holdings.find(
                      (holding) => holding.instrumentId === event.target.value
                    );
                    setTradeForm((current) => ({
                      ...current,
                      instrumentId: event.target.value,
                      ticker: nextHolding?.ticker || current.ticker
                    }));
                  }}
                >
                  <option value="">Select a holding</option>
                  {(selectedTrackedPortfolio?.holdings || []).map((holding) => (
                    <option key={holding.instrumentId} value={holding.instrumentId}>
                      {holding.ticker} ({holding.quantity.toFixed(4)} units)
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    value={tradeForm.ticker}
                    placeholder="Examples: SGOV, AMD, SCHD"
                    onChange={(event) => {
                      const nextTicker = normalizeTicker(event.target.value);
                      const matchedUniverse = TRACKABLE_INSTRUMENTS.find(
                        ([, ticker]) => ticker === nextTicker
                      );
                      setTradeForm((current) => ({
                        ...current,
                        ticker: nextTicker,
                        instrumentId: matchedUniverse?.[0] || ""
                      }));
                    }}
                    list="trackable-tickers"
                  />
                  <datalist id="trackable-tickers">
                    {TRACKABLE_INSTRUMENTS.map(([id, ticker]) => (
                      <option key={id} value={ticker} />
                    ))}
                    {(selectedTrackedPortfolio?.holdings || []).map((holding) => (
                      <option key={holding.instrumentId} value={holding.ticker} />
                    ))}
                  </datalist>
                </>
              )}
            </label>
            <label>
              <span>Quantity</span>
              <input
                type="number"
                value={tradeForm.quantity}
                onChange={(event) =>
                  setTradeForm((current) => ({ ...current, quantity: Number(event.target.value) }))
                }
              />
            </label>
            <button
              className="secondary"
              onClick={() =>
                startTransition(() => {
                  submitTradeIntent().catch((issue) => {
                    setError(issue instanceof Error ? issue.message : "Unable to update holdings.");
                  });
                })
              }
              disabled={
                pending ||
                !tradeForm.portfolioId ||
                !tradeForm.quantity ||
                (tradeForm.action === "sell"
                  ? !tradeForm.instrumentId
                  : !normalizeTicker(tradeForm.ticker))
              }
            >
              Save tracked portfolio change
            </button>
            {selectedHolding ? (
              <p className="caption">
                Current tracked amount for {selectedHolding.ticker}: {selectedHolding.quantity.toFixed(4)} units
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}

      {plan ? (
        <section className="results">
          <div className="results-head">
            <div>
              <p className="eyebrow">Recommended portfolio</p>
              <h2>{plan.portfolioName}</h2>
            </div>
            <button
              className="primary"
              onClick={() =>
                startTransition(() => {
                  finalizePortfolio().catch((issue) => {
                    setError(issue instanceof Error ? issue.message : "Unable to finalize portfolio.");
                  });
                })
              }
              disabled={pending}
            >
              Finalize and start daily tracking
            </button>
          </div>

          <div className="summary-grid">
            <article className="summary-card">
              <span>1-year base case</span>
              <strong>{currency(plan.projectedRange.nextYearBase)}</strong>
            </article>
            <article className="summary-card">
              <span>Expected annual income</span>
              <strong>{currency(plan.estimatedAnnualIncome)}</strong>
            </article>
            <article className="summary-card">
              <span>Weighted expense ratio</span>
              <strong>{plan.weightedExpenseRatio.toFixed(2)}%</strong>
            </article>
          </div>

          <div className="narrative">
            <p>{plan.summary}</p>
            <p>{plan.riskExplanation}</p>
            <p>{plan.complianceNote}</p>
          </div>

          {chartData ? (
            <div className="chart-section">
              <div className="chart-controls">
                <div className="range-pills">
                  {RANGE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={selectedRange === preset.label ? "secondary active-pill" : "secondary"}
                      onClick={() => applyRangePreset(preset.label, preset.days)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="date-grid">
                  <label>
                    <span>Start date</span>
                    <input
                      type="date"
                      value={dateWindow.start}
                      max={today}
                      onChange={(event) => updateDateWindow("start", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>End date</span>
                    <input
                      type="date"
                      value={dateWindow.end}
                      max={today}
                      onChange={(event) => updateDateWindow("end", event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <PerformanceChart
                title="Overall portfolio performance"
                points={filterPoints(chartData.portfolio)}
                selectedStart={dateWindow.start}
                selectedEnd={dateWindow.end}
              />

              <div className="cards">
                {chartData.instruments.map((chart) => (
                  <PerformanceChart
                    key={chart.instrumentId}
                    title={`${chart.ticker} performance`}
                    points={filterPoints(chart.points)}
                    height={210}
                    selectedStart={dateWindow.start}
                    selectedEnd={dateWindow.end}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="panel override-panel">
            <h2>Manual changes</h2>
            <p className="caption">
              Ask the client whether they want to replace or remove any recommended instrument. If they know the
              exact ticker, enter it below. Otherwise, review the suggestions and trim the portfolio before regenerating.
            </p>
            <div className="form-grid compact-grid">
              <label className="toggle">
                <span>Replace an instrument</span>
                <input
                  type="checkbox"
                  checked={Boolean(profile.wantsManualPortfolioChanges)}
                  onChange={(event) =>
                    updateProfile("wantsManualPortfolioChanges", event.target.checked)
                  }
                />
              </label>
              <label>
                <span>Instrument to replace</span>
                <select
                  value={profile.manualReplacementTarget || ""}
                  onChange={(event) => updateProfile("manualReplacementTarget", event.target.value)}
                  disabled={!profile.wantsManualPortfolioChanges}
                >
                  <option value="">Choose a current position</option>
                  {plan.allocations
                    .filter(
                      (allocation) => !(profile.manualExcludedInstrumentIds || []).includes(allocation.instrumentId)
                    )
                    .map((allocation) => (
                    <option key={allocation.instrumentId} value={allocation.instrumentId}>
                      {allocation.ticker} - {allocation.name}
                    </option>
                    ))}
                </select>
              </label>
              <label>
                <span>Replacement ticker</span>
                <input
                  value={profile.manualReplacementTicker || ""}
                  placeholder="Examples: SCHD, AAPL, TLT"
                  onChange={(event) => updateProfile("manualReplacementTicker", event.target.value)}
                  disabled={!profile.wantsManualPortfolioChanges}
                />
              </label>
            </div>
            <div className="suggestion-box">
              <strong>Remove positions</strong>
              <div className="check-grid removal-grid">
                {plan.allocations.map((allocation) => {
                  const excluded = (profile.manualExcludedInstrumentIds || []).includes(allocation.instrumentId);
                  return (
                    <label key={`remove-${allocation.instrumentId}`} className="check-pill">
                      <input
                        type="checkbox"
                        checked={excluded}
                        onChange={() => toggleManualExclusion(allocation.instrumentId)}
                        disabled={
                          !excluded &&
                          (profile.manualExcludedInstrumentIds || []).length >= Math.max(plan.allocations.length - 1, 0)
                        }
                      />
                      <span>{excluded ? `Removed: ${allocation.ticker}` : `Keep ${allocation.ticker}`}</span>
                    </label>
                  );
                })}
              </div>
              <p className="caption">
                Remove any investment options the client does not want. At least one recommendation must remain.
              </p>
            </div>
            <button
              className="secondary"
              onClick={() =>
                startTransition(() => {
                  generatePortfolio().catch((issue) => {
                    setError(issue instanceof Error ? issue.message : "Unable to regenerate portfolio.");
                  });
                })
              }
              disabled={pending}
            >
              Regenerate with client changes
            </button>
            {plan.adjustmentSuggestions.length > 0 ? (
              <div className="suggestion-box">
                <strong>Suggestions</strong>
                <ul className="suggestion-list">
                  {plan.adjustmentSuggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Weight</th>
                  <th>Amount</th>
                  <th>Price</th>
                  <th>1M</th>
                  <th>6M</th>
                  <th>1Y</th>
                  <th>5Y</th>
                  <th>10Y</th>
                  <th>Sentiment</th>
                  <th>Outlook</th>
                </tr>
              </thead>
              <tbody>
                {plan.allocations.map((allocation) => (
                  <tr key={allocation.instrumentId}>
                    <td>
                      <strong>{allocation.ticker}</strong>
                      <span>{allocation.name}</span>
                    </td>
                    <td>{(allocation.weight * 100).toFixed(1)}%</td>
                    <td>{currency(allocation.amount)}</td>
                    <td>{currency(allocation.snapshot.currentPrice)}</td>
                    <td>{percent(allocation.snapshot.returns["1M"])}</td>
                    <td>{percent(allocation.snapshot.returns["6M"])}</td>
                    <td>{percent(allocation.snapshot.returns["1Y"])}</td>
                    <td>{percent(allocation.snapshot.returns["5Y"])}</td>
                    <td>{percent(allocation.snapshot.returns["10Y"])}</td>
                    <td>{allocation.snapshot.sentimentLabel}</td>
                    <td>{allocation.snapshot.outlookLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cards">
            {plan.allocations.map((allocation) => (
              <article className="asset-card" key={allocation.instrumentId}>
                <div className="asset-head">
                  <div>
                    <p>{allocation.ticker}</p>
                    <strong>{allocation.name}</strong>
                  </div>
                  <span>{(allocation.weight * 100).toFixed(1)}%</span>
                </div>
                <p>{allocation.rationale}</p>
                <small>{allocation.snapshot.latestHeadline}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
