import { NextResponse } from "next/server";
import { generatePortfolioPlan, getUniverseSummary } from "@/lib/portfolio-engine";
import { ClientProfile } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const client = (await request.json()) as ClientProfile;
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
