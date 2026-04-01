import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { buildChartsForFinalizedPortfolio, buildChartsForPlan } from "@/lib/charting";
import { FinalizedPortfolio, PortfolioPlan } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireApiSession(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { plan, trackedPortfolio } = (await request.json()) as {
      plan?: PortfolioPlan;
      trackedPortfolio?: FinalizedPortfolio;
    };
    const charts = plan
      ? await buildChartsForPlan(plan)
      : trackedPortfolio
        ? await buildChartsForFinalizedPortfolio(trackedPortfolio)
        : null;

    if (!charts) {
      return NextResponse.json({ error: "A plan or tracked portfolio is required." }, { status: 400 });
    }

    return NextResponse.json({ charts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build chart data." },
      { status: 500 }
    );
  }
}
