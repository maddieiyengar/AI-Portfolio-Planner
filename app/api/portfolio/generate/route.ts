import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { generatePortfolioPlan, getUniverseSummary } from "@/lib/portfolio-engine";
import { parseClientProfile } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireApiSession(request);
    if (unauthorized) {
      return unauthorized;
    }

    const client = parseClientProfile(await request.json());
    const plan = await generatePortfolioPlan(client);
    return NextResponse.json({ plan, universe: getUniverseSummary() });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate portfolio."
      },
      { status: 500 }
    );
  }
}
