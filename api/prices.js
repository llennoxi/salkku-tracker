// Vercel Serverless Function — osakehinnat + valuuttakurssit Yahoo Financesta

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { tickers, currencies } = req.query;

  if (!tickers) {
    return res.status(400).json({ error: "Missing tickers parameter" });
  }

  const tickerList = tickers.split(",").map(t => t.trim()).filter(Boolean);

  // Valuuttaparit EUR:oon — lisää Yahoo Finance -symbolit
  const currencyPairs = (currencies || "USD,CAD,AUD,GBP,SEK,NOK,DKK")
    .split(",").map(c => c.trim()).filter(c => c !== "EUR");
  const fxSymbols = currencyPairs.map(c => `${c}EUR=X`);

  try {
    const allSymbols = [...tickerList, ...fxSymbols].join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(allSymbols)}`;

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) throw new Error(`Yahoo API returned ${response.status}`);

    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];

    // Osakehinnat
    const prices = {};
    quotes.forEach(q => {
      if (fxSymbols.includes(q.symbol)) return;
      prices[q.symbol] = {
        price: q.regularMarketPrice || null,
        change: q.regularMarketChange || 0,
        changePercent: q.regularMarketChangePercent || 0,
        currency: q.currency || "USD",
        name: q.shortName || q.longName || q.symbol,
        marketState: q.marketState || "CLOSED",
      };
    });

    tickerList.forEach(t => {
      if (!prices[t]) {
        prices[t] = { price: null, change: 0, changePercent: 0, currency: null, name: t, marketState: "UNKNOWN" };
      }
    });

    // Valuuttakurssit → EUR
    const rates = { EUR: 1 };
    quotes.forEach(q => {
      if (fxSymbols.includes(q.symbol)) {
        const currency = q.symbol.replace("EUR=X", "");
        rates[currency] = q.regularMarketPrice || null;
      }
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(200).json({ prices, rates, updatedAt: new Date().toISOString() });

  } catch (error) {
    console.error("Price fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch prices", details: error.message });
  }
}
