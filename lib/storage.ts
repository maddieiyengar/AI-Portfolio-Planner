import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import { FinalizedPortfolio } from "@/lib/types";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type PortfolioRow = {
  user_id: string;
  portfolio_id: string;
  portfolio_name: string;
  finalized_at: string;
  client: Json;
  holdings: Json;
  snapshots: Json;
  notes: Json;
};

const DATA_DIR = path.join(os.tmpdir(), "portfolio-agent-data");
const PORTFOLIOS_FILE = path.join(DATA_DIR, "portfolios.json");

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return Boolean(
    value &&
      typeof value === "object" &&
      "from" in value &&
      typeof (value as SupabaseClient).from === "function"
  );
}

async function ensureLegacyStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(PORTFOLIOS_FILE);
  } catch {
    await fs.writeFile(PORTFOLIOS_FILE, "[]", "utf8");
  }
}

async function readLegacyPortfolios() {
  await ensureLegacyStorage();
  const content = await fs.readFile(PORTFOLIOS_FILE, "utf8");
  return JSON.parse(content) as FinalizedPortfolio[];
}

async function writeLegacyPortfolios(portfolios: FinalizedPortfolio[]) {
  await ensureLegacyStorage();
  await fs.writeFile(PORTFOLIOS_FILE, JSON.stringify(portfolios, null, 2), "utf8");
}

function deserializePortfolio(row: PortfolioRow): FinalizedPortfolio {
  return {
    portfolioId: row.portfolio_id,
    portfolioName: row.portfolio_name,
    finalizedAt: row.finalized_at,
    client: row.client as FinalizedPortfolio["client"],
    holdings: row.holdings as FinalizedPortfolio["holdings"],
    snapshots: row.snapshots as FinalizedPortfolio["snapshots"],
    notes: row.notes as FinalizedPortfolio["notes"]
  };
}

function serializePortfolio(userId: string, portfolio: FinalizedPortfolio): PortfolioRow {
  return {
    user_id: userId,
    portfolio_id: portfolio.portfolioId,
    portfolio_name: portfolio.portfolioName,
    finalized_at: portfolio.finalizedAt,
    client: portfolio.client as unknown as Json,
    holdings: portfolio.holdings as unknown as Json,
    snapshots: portfolio.snapshots as unknown as Json,
    notes: portfolio.notes as unknown as Json
  };
}

function withPortfolioQuery(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("portfolios")
    .select("user_id, portfolio_id, portfolio_name, finalized_at, client, holdings, snapshots, notes")
    .eq("user_id", userId);
}

export async function readFinalizedPortfolios(): Promise<FinalizedPortfolio[]>;
export async function readFinalizedPortfolios(
  supabase: SupabaseClient,
  userId: string
): Promise<FinalizedPortfolio[]>;
export async function readFinalizedPortfolios(supabase?: SupabaseClient, userId?: string) {
  if (!isSupabaseClient(supabase) || !userId) {
    return readLegacyPortfolios();
  }

  const { data, error } = await withPortfolioQuery(supabase, userId).order("finalized_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row) => deserializePortfolio(row as PortfolioRow));
}

export async function writeFinalizedPortfolios(portfolios: FinalizedPortfolio[]) {
  await writeLegacyPortfolios(portfolios);
}

export async function upsertFinalizedPortfolio(portfolio: FinalizedPortfolio): Promise<FinalizedPortfolio>;
export async function upsertFinalizedPortfolio(
  supabase: SupabaseClient,
  userId: string,
  portfolio: FinalizedPortfolio
): Promise<FinalizedPortfolio>;
export async function upsertFinalizedPortfolio(
  supabaseOrPortfolio: SupabaseClient | FinalizedPortfolio,
  userId?: string,
  portfolioArg?: FinalizedPortfolio
) {
  if (!isSupabaseClient(supabaseOrPortfolio) || !userId || !portfolioArg) {
    const portfolio = supabaseOrPortfolio as FinalizedPortfolio;
    const portfolios = await readLegacyPortfolios();
    const next = portfolios.filter((item) => item.portfolioId !== portfolio.portfolioId);
    next.push(portfolio);
    await writeLegacyPortfolios(next);
    return portfolio;
  }

  const portfolio = portfolioArg;
  const supabase = supabaseOrPortfolio;
  const { error } = await supabase
    .from("portfolios")
    .upsert(serializePortfolio(userId, portfolio), { onConflict: "user_id,portfolio_id" });

  if (error) {
    throw new Error(error.message);
  }

  return portfolio;
}

export async function getFinalizedPortfolioById(portfolioId: string): Promise<FinalizedPortfolio | null>;
export async function getFinalizedPortfolioById(
  supabase: SupabaseClient,
  userId: string,
  portfolioId: string
): Promise<FinalizedPortfolio | null>;
export async function getFinalizedPortfolioById(
  supabaseOrPortfolioId: SupabaseClient | string,
  userId?: string,
  portfolioIdArg?: string
) {
  if (!isSupabaseClient(supabaseOrPortfolioId) || !userId || !portfolioIdArg) {
    const portfolios = await readLegacyPortfolios();
    const portfolioId = supabaseOrPortfolioId as string;
    return portfolios.find((portfolio) => portfolio.portfolioId === portfolioId) || null;
  }

  const portfolioId = portfolioIdArg;
  const supabase = supabaseOrPortfolioId;
  const { data, error } = await withPortfolioQuery(supabase, userId)
    .eq("portfolio_id", portfolioId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? deserializePortfolio(data as PortfolioRow) : null;
}
