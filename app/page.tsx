import { AuthGate } from "@/components/auth-gate";
import { PortfolioAgent } from "@/components/portfolio-agent";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = {
  searchParams?: Promise<{
    auth?: string;
  }>;
};

export default async function Home({ searchParams }: Props) {
  const configured = hasSupabaseEnv();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const authMessage =
    resolvedSearchParams?.auth === "error" ? "The email confirmation link was invalid or expired." : null;

  if (!configured) {
    return <AuthGate isConfigured={false} initialMessage={authMessage} />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <AuthGate isConfigured initialMessage={authMessage} />;
  }

  return <PortfolioAgent userEmail={user.email || "Signed-in user"} />;
}
