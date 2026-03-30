import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export async function requireRouteSession() {
  if (!hasSupabaseEnv()) {
    return {
      response: NextResponse.json(
        { error: "Supabase is not configured. Add the required environment variables first." },
        { status: 503 }
      )
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Please sign in to continue." }, { status: 401 })
    };
  }

  return {
    supabase,
    user
  };
}
