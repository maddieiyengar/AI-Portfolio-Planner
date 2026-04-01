import { NextRequest, NextResponse } from "next/server";
import { applyTradeIntent, captureDailySnapshot } from "@/lib/monitor";
import { getFinalizedPortfolioById, readFinalizedPortfolios, upsertFinalizedPortfolio } from "@/lib/storage";
import { parseTradeIntent } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const portfolios = await readFinalizedPortfolios();
    const updated = await Promise.all(
      portfolios.map(async (portfolio) => {
        const next = await captureDailySnapshot(portfolio);
        await upsertFinalizedPortfolio(next);
        return next;
      })
    );

    return NextResponse.json({ portfolios: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to refresh monitoring." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { portfolioId?: string; trade?: unknown };
    const portfolioId = typeof payload.portfolioId === "string" ? payload.portfolioId.trim() : "";
    const trade = parseTradeIntent(payload.trade);

    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId is required." }, { status: 400 });
    }

    const portfolio = await getFinalizedPortfolioById(portfolioId);

    if (!portfolio) {
      return NextResponse.json({ error: "Tracked portfolio not found." }, { status: 404 });
    }

    const updated = await applyTradeIntent(portfolio, trade);
    await upsertFinalizedPortfolio(updated);
    return NextResponse.json({ portfolio: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update tracked holdings." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = (await request.json()) as { portfolioId?: string; portfolioName?: string };
    const portfolioId = typeof payload.portfolioId === "string" ? payload.portfolioId.trim() : "";
    const portfolioName = typeof payload.portfolioName === "string" ? payload.portfolioName : "";

    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId is required." }, { status: 400 });
    }

    const portfolio = await getFinalizedPortfolioById(portfolioId);

    if (!portfolio) {
      return NextResponse.json({ error: "Tracked portfolio not found." }, { status: 404 });
    }

    const trimmedName = portfolioName.trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "Portfolio name cannot be empty." }, { status: 400 });
    }

    portfolio.portfolioName = trimmedName;
    portfolio.client.portfolioName = trimmedName;
    portfolio.notes.unshift(`${new Date().toISOString()}: Renamed tracked portfolio to ${trimmedName}.`);

    await upsertFinalizedPortfolio(portfolio);
    return NextResponse.json({ portfolio });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to rename tracked portfolio." },
      { status: 500 }
    );
  }
}
