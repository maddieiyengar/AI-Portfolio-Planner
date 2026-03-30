export function hasSupabaseEnv() {
  return false;
}

export function getSupabaseEnv() {
  throw new Error("Supabase auth has been removed from this local-first app.");
}
