import { NextResponse } from "next/server";
import { getFinalizedPortfolioById } from "@/lib/storage";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function workbookCell(value: string | number) {
  if (typeof value === "number") {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }

  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function buildWorkbookXml(
  portfolioName: string,
  rows: Array<{
    date: string;
    portfolioValue: number;
    ticker: string;
    price: number;
    marketValue: number;
    dailyChangePct: number | null;
  }>
) {
  const header = [
    "Snapshot Date",
    "Portfolio Value",
    "Ticker",
    "Price",
    "Market Value",
    "Daily Change %"
  ];

  const xmlRows = [
    `<Row>${header.map((label) => workbookCell(label)).join("")}</Row>`,
    ...rows.map(
      (row) =>
        `<Row>${[
          workbookCell(row.date),
          workbookCell(row.portfolioValue),
          workbookCell(row.ticker),
          workbookCell(row.price),
          workbookCell(row.marketValue),
          workbookCell(row.dailyChangePct ?? "")
        ].join("")}</Row>`
    )
  ].join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="${escapeXml(portfolioName.slice(0, 31) || "Portfolio Export")}">
  <Table>
   ${xmlRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("portfolioId") || "";
    const start = searchParams.get("start") || "";
    const end = searchParams.get("end") || "";

    if (!portfolioId || !start || !end) {
      return NextResponse.json(
        { error: "Portfolio, start date, and end date are required." },
        { status: 400 }
      );
    }

    if (start > end) {
      return NextResponse.json({ error: "Start date must be before end date." }, { status: 400 });
    }

    const portfolio = await getFinalizedPortfolioById(portfolioId);

    if (!portfolio) {
      return NextResponse.json({ error: "Tracked portfolio not found." }, { status: 404 });
    }

    const rows = portfolio.snapshots
      .filter((snapshot) => snapshot.date >= start && snapshot.date <= end)
      .flatMap((snapshot) =>
        snapshot.positions.map((position) => ({
          date: snapshot.date,
          portfolioValue: snapshot.portfolioValue,
          ticker: position.ticker,
          price: position.price,
          marketValue: position.marketValue,
          dailyChangePct: position.dailyChangePct
        }))
      );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No tracked portfolio data exists in the selected date range." },
        { status: 404 }
      );
    }

    const workbook = buildWorkbookXml(portfolio.portfolioName, rows);
    const fileName = `${portfolio.portfolioName.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "portfolio"}-${start}-to-${end}.xls`;

    return new NextResponse(workbook, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to export portfolio data." },
      { status: 500 }
    );
  }
}
