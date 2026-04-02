import { promises as fs } from "fs";
import path from "path";
import { list, put } from "@vercel/blob";
import { FinalizedPortfolio } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const PORTFOLIOS_FILE = path.join(DATA_DIR, "portfolios.json");
const BLOB_PATHNAME = "state/portfolios.json";
let writeQueue = Promise.resolve();

function useBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlobPortfolios() {
  const result = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === BLOB_PATHNAME) || result.blobs[0];

  if (!blob) {
    return [];
  }

  const response = await fetch(blob.downloadUrl || blob.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to read portfolio storage blob: ${response.status}`);
  }

  return (await response.json()) as FinalizedPortfolio[];
}

async function writeBlobPortfolios(portfolios: FinalizedPortfolio[]) {
  await put(BLOB_PATHNAME, JSON.stringify(portfolios, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    addRandomSuffix: false
  });
}

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(PORTFOLIOS_FILE);
  } catch {
    await fs.writeFile(PORTFOLIOS_FILE, "[]", "utf8");
  }
}

export async function readFinalizedPortfolios() {
  if (useBlobStorage()) {
    return readBlobPortfolios();
  }

  await ensureStorage();
  const content = await fs.readFile(PORTFOLIOS_FILE, "utf8");
  return JSON.parse(content) as FinalizedPortfolio[];
}

export async function writeFinalizedPortfolios(portfolios: FinalizedPortfolio[]) {
  if (useBlobStorage()) {
    await writeBlobPortfolios(portfolios);
    return;
  }

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
