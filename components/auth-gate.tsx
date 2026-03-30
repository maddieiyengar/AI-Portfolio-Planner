"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Props = {
  isConfigured: boolean;
  initialMessage?: string | null;
};

export function AuthGate({ isConfigured, initialMessage = null }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!isConfigured) {
      setMessage("Add the Supabase environment variables before using authentication.");
      return;
    }

    const supabase = createSupabaseBrowserClient();

    startTransition(async () => {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        router.refresh();
        return;
      }

      const emailRedirectTo =
        typeof window === "undefined" ? undefined : `${window.location.origin}/auth/confirm?next=/`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo
        }
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!data.session) {
        setMessage("Check your email to confirm your account, then come back and sign in.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">AI Portfolio Planner</p>
        <h1>{mode === "sign-in" ? "Sign in to your planner" : "Create your planner account"}</h1>
        <p className="lede">
          Save portfolios to your own account, track holdings over time, and revisit client plans from
          any device.
        </p>
        {!isConfigured ? (
          <div className="error">
            Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then run the SQL
            in `supabase/schema.sql`.
          </div>
        ) : null}
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>
          <button className="primary" disabled={pending || !isConfigured}>
            {pending ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>
        {message ? <p className="auth-message">{message}</p> : null}
        <button
          type="button"
          className="secondary auth-toggle"
          onClick={() => {
            setMessage(null);
            setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
          }}
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
