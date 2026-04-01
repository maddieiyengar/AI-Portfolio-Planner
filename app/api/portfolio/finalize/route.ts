import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { captureDailySnapshot } from "@/lib/monitor";
import { estimateHoldingsFromPlan, generatePortfolioPlan } from "@/lib/portfolio-engine";
import { upsertFinalizedPortfolio } from "@/lib/storage";
import { PortfolioPlan } from "@/lib/types";
import { parseClientProfile } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireApiSession(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { plan } = (await request.json()) as { plan: PortfolioPlan };
    const serverClient = parseClientProfile(plan?.client);
    const serverPlan = await generatePortfolioPlan(serverClient);
    const holdings = await estimateHoldingsFromPlan(serverPlan);
    const finalized = await captureDailySnapshot({
      portfolioId: serverPlan.id,
      portfolioName: serverPlan.portfolioName,
      finalizedAt: new Date().toISOString(),
      client: serverPlan.client,
      holdings,
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
