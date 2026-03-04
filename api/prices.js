// Vercel Serverless Function — hakee osakkeiden hinnat Yahoo Financesta
// Tämä tiedosto menee projektin juureen: api/prices.js

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { tickers } = req.query;

  if (!tickers) {
    return res.status(400).json({ error: "Missing tickers parameter" });
  }

  const tickerList = tickers.split(",").map(t => t.trim()).filter(Boolean);

  if (tickerList.length === 0) {
    return res.status(400).json({ error: "No valid tickers" });
  }

  try {
    // Yahoo Finance API - hakee useita osakkeita kerralla
    const symbols = tickerList.join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo API returned ${response.status}`);
    }

    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];

    const prices = {};
    quotes.forEach(q => {
      prices[q.symbol] = {
        price: q.regularMarketPrice || null,
        change: q.regularMarketChange || 0,
        changePercent: q.regularMarketChangePercent || 0,
        currency: q.currency || "USD",
        name: q.shortName || q.longName || q.symbol,
        marketState: q.marketState || "CLOSED",
        previousClose: q.regularMarketPreviousClose || null,
      };
    });

    // Lisää puuttuvat tickerit null-arvoilla
    tickerList.forEach(t => {
      if (!prices[t]) {
        prices[t] = { price: null, change: 0, changePercent: 0, currency: null, name: t, marketState: "UNKNOWN" };
      }
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(200).json({ prices, updatedAt: new Date().toISOString() });

  } catch (error) {
    console.error("Price fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch prices", details: error.message });
  }
}
