import { promises as fs } from "fs";
import path from "path";
import { FinalizedPortfolio } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const PORTFOLIOS_FILE = path.join(DATA_DIR, "portfolios.json");
let writeQueue = Promise.resolve();

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(PORTFOLIOS_FILE);
  } catch {
    await fs.writeFile(PORTFOLIOS_FILE, "[]", "utf8");
  }
}

export async function readFinalizedPortfolios() {
  await ensureStorage();
  const content = await fs.readFile(PORTFOLIOS_FILE, "utf8");
  return JSON.parse(content) as FinalizedPortfolio[];
}

export async function writeFinalizedPortfolios(portfolios: FinalizedPortfolio[]) {
  writeQueue = writeQueue.then(async () => {
    await ensureStorage();
    const tempFile = `${PORTFOLIOS_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(portfolios, null, 2), "utf8");
    await fs.rename(tempFile, PORTFOLIOS_FILE);
  });

  await writeQueue;
}

export async function upsertFinalizedPortfolio(portfolio: FinalizedPortfolio) {
  const portfolios = await readFinalizedPortfolios();
  const next = portfolios.filter((item) => item.portfolioId !== portfolio.portfolioId);
  next.push(portfolio);
  await writeFinalizedPortfolios(next);
  return portfolio;
}

export async function getFinalizedPortfolioById(portfolioId: string) {
  const portfolios = await readFinalizedPortfolios();
  return portfolios.find((portfolio) => portfolio.portfolioId === portfolioId) || null;
}
