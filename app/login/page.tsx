import { getViewerSession, isAuthConfigured } from "@/lib/auth";
import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    reason?: string;
  }>;
};

function messageFor(params: { error?: string; reason?: string }) {
  if (params.reason === "setup") {
    return "Set PORTFOLIO_AGENT_ACCESS_PASSWORD in your environment before using the app.";
  }

  if (params.error === "invalid") {
    return "The password was not accepted. Try again.";
  }

  return "Enter the site password to view and update tracked portfolios.";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const session = await getViewerSession();
  const next = params.next && params.next.startsWith("/") ? params.next : "/";

  if (session.authenticated && isAuthConfigured()) {
    redirect(next);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Private Access</p>
        <h1>Portfolio Agent</h1>
        <p className="auth-message">{messageFor(params)}</p>
        <form className="auth-form" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={next} />
          <label>
            <span>Password</span>
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button className="primary auth-toggle" type="submit" disabled={!isAuthConfigured()}>
            Unlock dashboard
          </button>
        </form>
      </section>
    </main>
  );
}
