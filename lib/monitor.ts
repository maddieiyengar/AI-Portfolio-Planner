import { resolveInstrument } from "@/lib/universe";
import { getInstrumentSnapshot } from "@/lib/market-data";
import { FinalizedPortfolio, TradeIntent } from "@/lib/types";

function isoDateOnly(input = new Date()) {
  return input.toISOString().slice(0, 10);
}

export async function captureDailySnapshot(portfolio: FinalizedPortfolio) {
  const today = isoDateOnly();
  const existing = portfolio.snapshots.find((snapshot) => snapshot.date === today);
  if (existing) {
    return portfolio;
  }

  const positions = await Promise.all(
    portfolio.holdings.map(async (holding) => {
      const instrument = resolveInstrument({ instrumentId: holding.instrumentId, ticker: holding.ticker });
      if (!instrument) {
        return null;
      }

      const snapshot = await getInstrumentSnapshot(instrument);
      return {
        instrumentId: holding.instrumentId,
        ticker: holding.ticker,
        marketValue: Number((holding.quantity * snapshot.currentPrice).toFixed(2)),
        price: snapshot.currentPrice,
        dailyChangePct: snapshot.dailyChangePct ?? null
      };
    })
  );

  const validPositions = positions.filter((position): position is NonNullable<typeof position> => Boolean(position));
  portfolio.snapshots.push({
    date: today,
    portfolioValue: Number(validPositions.reduce((sum, position) => sum + position.marketValue, 0).toFixed(2)),
    positions: validPositions
  });

  return portfolio;
}

export async function applyTradeIntent(portfolio: FinalizedPortfolio, trade: TradeIntent) {
  const normalizedTicker = trade.ticker?.trim().toUpperCase() || "";
  const holding = portfolio.holdings.find((item) => {
    if (trade.instrumentId && item.instrumentId === trade.instrumentId) {
      return true;
    }
    return normalizedTicker ? item.ticker.toUpperCase() === normalizedTicker : false;
  });
  const instrument = resolveInstrument({
    instrumentId: trade.instrumentId || holding?.instrumentId,
    ticker: normalizedTicker || holding?.ticker
  });

  if (!instrument) {
    throw new Error("Choose an existing holding or enter a ticker.");
  }

  const liveSnapshot = await getInstrumentSnapshot(instrument);
  const tradePrice = trade.price || liveSnapshot.currentPrice;

  if (trade.action === "buy") {
    if (holding) {
      const totalCost = holding.quantity * holding.costBasis + trade.quantity * tradePrice;
      holding.quantity = Number((holding.quantity + trade.quantity).toFixed(4));
      holding.costBasis = Number((totalCost / holding.quantity).toFixed(4));
    } else {
      portfolio.holdings.push({
        instrumentId: instrument.id,
        ticker: instrument.ticker,
        quantity: trade.quantity,
        costBasis: tradePrice
      });
    }
  } else {
    if (!holding || holding.quantity < trade.quantity) {
      throw new Error("Cannot sell more than the tracked quantity.");
    }
    holding.quantity = Number((holding.quantity - trade.quantity).toFixed(4));
    if (holding.quantity === 0) {
      portfolio.holdings = portfolio.holdings.filter((item) => item.instrumentId !== instrument.id);
    }
  }

  portfolio.notes.unshift(
    `${new Date().toISOString()}: Recorded a ${trade.action.toUpperCase()} intent for ${instrument.ticker} at approximately $${tradePrice.toFixed(2)} per unit.`
  );

  return captureDailySnapshot(portfolio);
}
