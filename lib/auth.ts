import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "portfolio_agent_session";

function encoder() {
  return new TextEncoder();
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function getAccessPassword() {
  const password = process.env.PORTFOLIO_AGENT_ACCESS_PASSWORD?.trim();
  return password ? password : null;
}

export function isAuthConfigured() {
  return Boolean(getAccessPassword());
}

async function expectedSessionValue() {
  const password = getAccessPassword();
  if (!password) {
    return null;
  }

  return sha256Hex(`portfolio-agent:${password}`);
}

export async function hasValidSessionCookie(request: NextRequest) {
  const expected = await expectedSessionValue();
  if (!expected) {
    return false;
  }

  return request.cookies.get(SESSION_COOKIE)?.value === expected;
}

export async function createSessionCookieValue() {
  const expected = await expectedSessionValue();
  if (!expected) {
    throw new Error("Set PORTFOLIO_AGENT_ACCESS_PASSWORD before starting the app.");
  }

  return expected;
}

export function applySessionCookie(response: NextResponse, value: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0)
  });
}

export async function verifyPassword(password: string) {
  const expectedPassword = getAccessPassword();
  if (!expectedPassword) {
    return false;
  }

  return password === expectedPassword;
}

export async function requireAppSession(request: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?reason=setup", request.url));
  }

  if (await hasValidSessionCookie(request)) {
    return null;
  }

  const loginUrl = new URL("/login", request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next && next !== "/login") {
    loginUrl.searchParams.set("next", next);
  }
  return NextResponse.redirect(loginUrl);
}

export async function requireApiSession(request: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Set PORTFOLIO_AGENT_ACCESS_PASSWORD before using portfolio APIs." },
      { status: 503 }
    );
  }

  if (await hasValidSessionCookie(request)) {
    return null;
  }

  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export async function getViewerSession() {
  const cookieStore = await cookies();
  const expected = await expectedSessionValue();
  if (!expected) {
    return { configured: false, authenticated: false } as const;
  }

  return {
    configured: true,
    authenticated: cookieStore.get(SESSION_COOKIE)?.value === expected
  } as const;
}
