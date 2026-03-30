import { NextResponse } from "next/server";

export async function requireRouteSession() {
  return {
    response: NextResponse.next()
  };
}
