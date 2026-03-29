import { NextResponse } from "next/server";
import { captureDailySnapshot } from "@/lib/monitor";
import { estimateHoldingsFromPlan } from "@/lib/portfolio-engine";
import { upsertFinalizedPortfolio } from "@/lib/storage";
import { PortfolioPlan } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { plan } = (await request.json()) as { plan: PortfolioPlan };
    const finalized = await captureDailySnapshot({
      portfolioId: plan.id,
      portfolioName: plan.portfolioName,
      finalizedAt: new Date().toISOString(),
      client: plan.client,
      holdings: estimateHoldingsFromPlan(plan),
      snapshots: [],
      notes: [
        `${new Date().toISOString()}: Portfolio finalized for tracking. This system tracks performance only and does not place trades.`
      ]
    });

    await upsertFinalizedPortfolio(finalized);
    return NextResponse.json({ portfolio: finalized });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to finalize portfolio." },
      { status: 500 }
    );
  }
}
