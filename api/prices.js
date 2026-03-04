// Vercel Serverless Function — osakehinnat + valuuttakurssit

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { tickers } = req.query;
  if (!tickers) return res.status(400).json({ error: "Missing tickers parameter" });

  const tickerList = tickers.split(",").map(t => t.trim()).filter(Boolean);
  if (tickerList.length === 0) return res.status(400).json({ error: "No valid tickers" });

  const fxPairs = ["USDEUR=X", "CADEUR=X", "AUDEUR=X", "GBPEUR=X", "SEKEUR=X", "NOKEUR=X", "DKKEUR=X"];

  try {
    const pricePromises = tickerList.map(async (symbol) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        if (!response.ok) return [symbol, null];
        const data = await response.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) return [symbol, null];

        let price = meta.regularMarketPrice || null;
        let prevClose = meta.chartPreviousClose || meta.previousClose || null;
        let currency = meta.currency || "USD";

        // GBp (pence) → muunna GBP:ksi
        if (currency === "GBp" || currency === "GBX") {
          if (price) price = price / 100;
          if (prevClose) prevClose = prevClose / 100;
          currency = "GBP";
        }

        return [symbol, {
          price,
          previousClose: prevClose,
          change: price && prevClose ? price - prevClose : 0,
          changePercent: price && prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
          currency,
          name: meta.shortName || meta.longName || symbol,
          marketState: meta.marketState || "CLOSED",
        }];
      } catch (e) {
        return [symbol, null];
      }
    });

    const fxPromises = fxPairs.map(async (pair) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair)}?range=1d&interval=1d`;
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        if (!response.ok) return [pair, null];
        const data = await response.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) return [pair, null];
        return [pair, meta.regularMarketPrice || null];
      } catch (e) {
        return [pair, null];
      }
    });

    const [priceResults, fxResults] = await Promise.all([
      Promise.all(pricePromises),
      Promise.all(fxPromises),
    ]);

    const prices = {};
    priceResults.forEach(([symbol, data]) => {
      prices[symbol] = data || {
        price: null, change: 0, changePercent: 0,
        currency: null, name: symbol, marketState: "UNKNOWN",
      };
    });

    const rates = { EUR: 1 };
    fxResults.forEach(([pair, rate]) => {
      if (rate) {
        const currency = pair.replace("EUR=X", "");
        rates[currency] = rate;
      }
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(200).json({ prices, rates, updatedAt: new Date().toISOString() });

  } catch (error) {
    console.error("Price fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch prices", details: error.message });
  }
}
