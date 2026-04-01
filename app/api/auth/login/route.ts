import { NextRequest, NextResponse } from "next/server";
import { applySessionCookie, createSessionCookieValue, isAuthConfigured, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  const isForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");

  let password = "";
  let nextPath = "/";

  if (isForm) {
    const formData = await request.formData();
    password = String(formData.get("password") || "");
    nextPath = String(formData.get("next") || "/");
  } else {
    const payload = (await request.json().catch(() => null)) as { password?: string; next?: string } | null;
    password = payload?.password || "";
    nextPath = payload?.next || "/";
  }

  const safeNext = nextPath.startsWith("/") ? nextPath : "/";

  if (!isAuthConfigured()) {
    return isForm
      ? NextResponse.redirect(new URL("/login?reason=setup", request.url), 303)
      : NextResponse.json(
          { error: "Set PORTFOLIO_AGENT_ACCESS_PASSWORD before using the app." },
          { status: 503 }
        );
  }

  if (!(await verifyPassword(password))) {
    return isForm
      ? NextResponse.redirect(new URL(`/login?error=invalid&next=${encodeURIComponent(safeNext)}`, request.url), 303)
      : NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const response = isForm
    ? NextResponse.redirect(new URL(safeNext, request.url), 303)
    : NextResponse.json({ ok: true, next: safeNext });
  applySessionCookie(response, await createSessionCookieValue());
  return response;
}
