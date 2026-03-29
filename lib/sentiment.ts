const POSITIVE_WORDS = [
  "beats",
  "growth",
  "surge",
  "rally",
  "upgrade",
  "strong",
  "record",
  "gain",
  "optimistic",
  "expand"
];

const NEGATIVE_WORDS = [
  "falls",
  "drop",
  "downgrade",
  "weak",
  "cuts",
  "risk",
  "miss",
  "warns",
  "slump",
  "recession"
];

function stripTags(input: string) {
  return input.replace(/<[^>]+>/g, "");
}

function parseTitles(xml: string) {
  const matches = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/gi)];
  return matches.map((match) => stripTags(match[1]).trim()).filter(Boolean).slice(1, 7);
}

function scoreHeadline(text: string) {
  const lower = text.toLowerCase();
  let score = 0;

  for (const token of POSITIVE_WORDS) {
    if (lower.includes(token)) {
      score += 1;
    }
  }

  for (const token of NEGATIVE_WORDS) {
    if (lower.includes(token)) {
      score -= 1;
    }
  }

  return score;
}

export async function getSentimentForInstrument(query: string) {
  try {
    const response = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query + " investing")}&hl=en-US&gl=US&ceid=US:en`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 portfolio-agent"
        },
        next: { revalidate: 3600 }
      }
    );

    if (!response.ok) {
      throw new Error("RSS unavailable");
    }

    const xml = await response.text();
    const headlines = parseTitles(xml);
    const totalScore = headlines.reduce((sum, headline) => sum + scoreHeadline(headline), 0);
    const normalized = Math.max(-1, Math.min(1, headlines.length ? totalScore / (headlines.length * 2) : 0));

    return {
      score: Number(normalized.toFixed(2)),
      label: normalized > 0.15 ? "positive" : normalized < -0.15 ? "negative" : "neutral",
      latestHeadline: headlines[0]
    } as const;
  } catch {
    return {
      score: 0,
      label: "neutral",
      latestHeadline: "Headline sentiment feed unavailable. Using neutral sentiment."
    } as const;
  }
}

export function buildOutlook(return1Y: number | null, return5Y: number | null, sentimentScore: number) {
  const momentum = ((return1Y || 0) * 0.55 + (return5Y || 0) * 0.45) / 100;
  const combined = momentum + sentimentScore * 0.18;

  return {
    score: Number(combined.toFixed(2)),
    label: combined > 0.12 ? "bullish" : combined < -0.05 ? "cautious" : "steady"
  } as const;
}
