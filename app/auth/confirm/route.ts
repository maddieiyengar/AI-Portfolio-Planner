import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next") || "/";
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "email" | "recovery" | "invite" | "email_change"
  });

  if (error) {
    return NextResponse.redirect(new URL("/?auth=error", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
