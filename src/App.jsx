import { useState, useEffect, useMemo, useCallback } from "react";
import { writeTrade, deleteTrade as fbDeleteTrade, subscribeTrades } from "./firebase.js";

// ═══════════════════════════════════════════════════
// KÄYTTÄJÄASETUKSET
// ═══════════════════════════════════════════════════
const USERS = [
  { id: "simo", name: "Simo", pin: "1111", color: "#10b981", icon: "◈" },
  { id: "veli", name: "Veli", pin: "2222", color: "#3b82f6", icon: "◇" },
];

// ═══════════════════════════════════════════════════
// TICKER-KARTTA: Yahoo Finance -symbolit
// Lisää tähän osakkeet jotka eivät ole US-pörssissä.
// US-osakkeet toimivat sellaisenaan (IREN, GROY jne.)
//
// Helsinki:  .HE  (esim. SOSI1.HE)
// Toronto:   .TO  (esim. LGO.TO)
// Stockholm: .ST  (esim. VOLV-B.ST)
// Frankfurt: .F   (esim. BMW.F)
// London:    .L   (esim. HSBA.L)
// ═══════════════════════════════════════════════════
const TICKER_MAP = {
  "SOSI1": "SOSI1.HE",
  "LGO": "LGO.TO",
  // Lisää tähän tarpeen mukaan:
  // "NOKIA": "NOKIA.HE",
  // "SAMPO": "SAMPO.HE",
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => Number(n).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n).toLocaleString("fi-FI");
const pctFmt = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const plColor = (n) => n > 0 ? "#10b981" : n < 0 ? "#ef4444" : "#94a3b8";

// ── Styles ──
const S = {
  inp: {
    width: "100%", padding: "9px 11px", background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#e2e8f0",
    fontSize: 13, outline: "none", boxSizing: "border-box",
  },
  lbl: { fontSize: 10, letterSpacing: 2, color: "#64748b", marginBottom: 4, display: "block", textTransform: "uppercase" },
  card: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: 16, marginBottom: 10 },
  btn: (bg = "#10b981") => ({
    padding: "9px 20px", background: bg, color: bg === "transparent" ? "#94a3b8" : "#0f172a",
    border: bg === "transparent" ? "1px solid rgba(255,255,255,0.1)" : "none",
    borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 1,
  }),
};

// ── Portfolio calc ──
function calcPortfolio(trades, userId) {
  const userTrades = trades.filter(t => t.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
  const holdings = {};
  let totalInvested = 0, totalSold = 0;

  userTrades.forEach(t => {
    const ticker = t.ticker.toUpperCase();
    if (!holdings[ticker]) holdings[ticker] = { shares: 0, totalCost: 0, avgPrice: 0 };
    if (t.type === "buy") {
      holdings[ticker].totalCost += t.shares * t.price;
      holdings[ticker].shares += t.shares;
      holdings[ticker].avgPrice = holdings[ticker].shares > 0 ? holdings[ticker].totalCost / holdings[ticker].shares : 0;
      totalInvested += t.shares * t.price;
    } else {
      holdings[ticker].shares -= t.shares;
      holdings[ticker].totalCost = holdings[ticker].shares * holdings[ticker].avgPrice;
      totalSold += t.shares * t.price;
    }
  });

  Object.keys(holdings).forEach(k => { if (holdings[k].shares <= 0.0001) delete holdings[k]; });
  const costBasis = Object.values(holdings).reduce((s, h) => s + h.totalCost, 0);
  return { holdings, totalInvested, totalSold, costBasis, tradeCount: userTrades.length, userTrades };
}

// ── Price fetcher ──
function usePrices(holdings) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const tickers = useMemo(() => Object.keys(holdings), [holdings]);

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) return;
    setLoading(true);
    try {
      const yahooTickers = tickers.map(t => TICKER_MAP[t] || t).join(",");
      const res = await fetch(`/api/prices?tickers=${encodeURIComponent(yahooTickers)}`);
      const data = await res.json();
      if (data.prices) {
        // Mappi takaisin alkuperäisiin ticker-nimiin
        const mapped = {};
        tickers.forEach(t => {
          const yahooSymbol = TICKER_MAP[t] || t;
          if (data.prices[yahooSymbol]) {
            mapped[t] = data.prices[yahooSymbol];
          }
        });
        setPrices(mapped);
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error("Price fetch error:", e);
    }
    setLoading(false);
  }, [tickers]);

  // Hae hinnat kun positiot muuttuvat
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Automaattinen päivitys 2 min välein
  useEffect(() => {
    if (tickers.length === 0) return;
    const interval = setInterval(fetchPrices, 120000);
    return () => clearInterval(interval);
  }, [fetchPrices, tickers]);

  return { prices, loading, lastUpdate, refresh: fetchPrices };
}

// ── Trade Form ──
function TradeForm({ onAdd, userId }) {
  const [form, setForm] = useState({ ticker: "", shares: "", price: "", date: today(), type: "buy", note: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.ticker || !form.shares || !form.price || saving) return;
    setSaving(true);
    try {
      await onAdd({
        id: uid(), ticker: form.ticker.toUpperCase(),
        shares: parseFloat(form.shares), price: parseFloat(form.price),
        date: form.date, type: form.type, note: form.note, createdAt: Date.now(),
      });
      setForm({ ticker: "", shares: "", price: "", date: today(), type: "buy", note: "" });
    } catch (e) { console.error("Save error:", e); }
    setSaving(false);
  };

  return (
    <div style={{ ...S.card, borderColor: "rgba(16,185,129,0.2)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["buy", "sell"].map(t => (
          <button key={t} onClick={() => set("type", t)} style={{
            ...S.btn(form.type === t ? (t === "buy" ? "#10b981" : "#ef4444") : "transparent"), flex: 1, fontSize: 11,
          }}>{t === "buy" ? "OSTO" : "MYYNTI"}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><span style={S.lbl}>TICKER</span><input style={S.inp} value={form.ticker} onChange={e => set("ticker", e.target.value)} placeholder="IREN" onKeyDown={e => e.key === "Enter" && submit()} /></div>
        <div><span style={S.lbl}>PVM</span><input style={S.inp} type="date" value={form.date} onChange={e => set("date", e.target.value)} /></div>
        <div><span style={S.lbl}>MÄÄRÄ (KPL)</span><input style={S.inp} type="number" value={form.shares} onChange={e => set("shares", e.target.value)} placeholder="100" onKeyDown={e => e.key === "Enter" && submit()} /></div>
        <div><span style={S.lbl}>HINTA / KPL</span><input style={S.inp} type="number" step="0.01" value={form.price} onChange={e => set("price", e.target.value)} placeholder="12.50" onKeyDown={e => e.key === "Enter" && submit()} /></div>
        <div style={{ gridColumn: "1 / -1" }}><span style={S.lbl}>MUISTIINPANO</span><input style={S.inp} value={form.note} onChange={e => set("note", e.target.value)} placeholder="Dippiosto, tulokset jne." onKeyDown={e => e.key === "Enter" && submit()} /></div>
      </div>
      <button onClick={submit} disabled={saving} style={{ ...S.btn("#10b981"), width: "100%", marginTop: 12, padding: 12, opacity: saving ? 0.5 : 1 }}>
        {saving ? "TALLENNETAAN..." : form.type === "buy" ? "＋ LISÄÄ OSTO" : "＋ LISÄÄ MYYNTI"}
      </button>
    </div>
  );
}

// ── Holdings Table (with live prices) ──
function HoldingsTable({ holdings, color, prices, pricesLoading }) {
  const entries = Object.entries(holdings).sort((a, b) => {
    const aVal = prices[a[0]]?.price ? a[1].shares * prices[a[0]].price : a[1].totalCost;
    const bVal = prices[b[0]]?.price ? b[1].shares * prices[b[0]].price : b[1].totalCost;
    return bVal - aVal;
  });

  if (entries.length === 0) return <div style={{ color: "#475569", textAlign: "center", padding: 40, fontSize: 13 }}>Ei positioita vielä.</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["TICKER", "KPL", "KESKIM.", "NYTHINTA", "ARVO", "TUOTTO"].map(h => (
              <th key={h} style={{ ...S.lbl, padding: "8px 6px", textAlign: h === "TICKER" ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(([ticker, h]) => {
            const livePrice = prices[ticker]?.price;
            const currentValue = livePrice ? h.shares * livePrice : null;
            const costBasis = h.totalCost;
            const pl = currentValue !== null ? currentValue - costBasis : null;
            const plPct = costBasis > 0 && pl !== null ? (pl / costBasis) * 100 : null;
            const dayChange = prices[ticker]?.changePercent;

            return (
              <tr key={ticker} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "11px 6px" }}>
                  <div style={{ fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{ticker}</div>
                  {prices[ticker]?.name && ticker !== prices[ticker]?.name && (
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{prices[ticker].name}</div>
                  )}
                </td>
                <td style={{ padding: "11px 6px", textAlign: "right", color: "#e2e8f0" }}>{fmtInt(h.shares)}</td>
                <td style={{ padding: "11px 6px", textAlign: "right", color: "#94a3b8" }}>{fmt(h.avgPrice)}</td>
                <td style={{ padding: "11px 6px", textAlign: "right" }}>
                  {livePrice !== null && livePrice !== undefined ? (
                    <div>
                      <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{fmt(livePrice)}</div>
                      {dayChange !== undefined && dayChange !== 0 && (
                        <div style={{ fontSize: 10, color: plColor(dayChange) }}>{pctFmt(dayChange)}</div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "#334155" }}>{pricesLoading ? "..." : "—"}</span>
                  )}
                </td>
                <td style={{ padding: "11px 6px", textAlign: "right", color: "#e2e8f0", fontWeight: 700 }}>
                  {currentValue !== null ? fmt(currentValue) : fmt(costBasis)}
                  <div style={{ fontSize: 10, color: "#475569" }}>{prices[ticker]?.currency || ""}</div>
                </td>
                <td style={{ padding: "11px 6px", textAlign: "right" }}>
                  {pl !== null ? (
                    <div>
                      <div style={{ color: plColor(pl), fontWeight: 700 }}>{pl >= 0 ? "+" : ""}{fmt(pl)}</div>
                      <div style={{ fontSize: 10, color: plColor(plPct) }}>{pctFmt(plPct)}</div>
                    </div>
                  ) : (
                    <span style={{ color: "#334155" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Trade History ──
function TradeHistory({ trades, onDelete, canDelete }) {
  if (trades.length === 0) return <div style={{ color: "#475569", textAlign: "center", padding: 40, fontSize: 13 }}>Ei kauppoja vielä.</div>;
  const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map(t => (
        <div key={t.id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", flexWrap: "wrap",
          background: "rgba(255,255,255,0.02)", borderRadius: 4,
          borderLeft: `3px solid ${t.type === "buy" ? "#10b981" : "#ef4444"}`,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 2, padding: "3px 8px", borderRadius: 3,
            background: t.type === "buy" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
            color: t.type === "buy" ? "#10b981" : "#ef4444",
          }}>{t.type === "buy" ? "OSTO" : "MYYNTI"}</span>
          <span style={{ fontWeight: 700, color: "#e2e8f0", minWidth: 55, fontFamily: "'JetBrains Mono', monospace" }}>{t.ticker}</span>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{fmtInt(t.shares)} × {fmt(t.price)}</span>
          <span style={{ color: "#64748b", fontSize: 12, marginLeft: "auto" }}>{fmt(t.shares * t.price)}</span>
          <span style={{ color: "#475569", fontSize: 11 }}>{t.date}</span>
          {t.note && <div style={{ width: "100%", fontSize: 11, color: "#475569", fontStyle: "italic", paddingLeft: 60, marginTop: 2 }}>{t.note}</div>}
          {canDelete && (
            <button onClick={() => { if (confirm(`Poista ${t.type === "buy" ? "osto" : "myynti"}: ${t.ticker}?`)) onDelete(t.id); }}
              style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>✕</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Stat Box ──
function StatBox({ label: l, value, sub, color = "#e2e8f0" }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>{l}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: plColor(parseFloat(sub)), marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ══════════════════════════════
// MAIN APP
// ══════════════════════════════
export default function App() {
  const [allTrades, setAllTrades] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinTarget, setPinTarget] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [viewTab, setViewTab] = useState("holdings");

  useEffect(() => {
    const unsubscribe = subscribeTrades((trades) => {
      setAllTrades(trades);
      setLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  const addTrade = async (trade) => { await writeTrade(currentUser, trade); };
  const handleDeleteTrade = async (tradeId) => { await fbDeleteTrade(currentUser, tradeId); };

  const portfolios = useMemo(() => ({
    simo: calcPortfolio(allTrades, "simo"),
    veli: calcPortfolio(allTrades, "veli"),
  }), [allTrades]);

  // Kerää kaikki positiot hintojen hakua varten
  const allHoldings = useMemo(() => {
    const merged = {};
    Object.values(portfolios).forEach(p => {
      Object.entries(p.holdings).forEach(([t, h]) => {
        if (!merged[t]) merged[t] = h;
      });
    });
    return merged;
  }, [portfolios]);

  const { prices, loading: pricesLoading, lastUpdate, refresh: refreshPrices } = usePrices(allHoldings);

  // Laske salkun arvo reaalihinnoilla
  const calcLiveValue = (portfolio) => {
    let liveValue = 0;
    let hasAllPrices = true;
    Object.entries(portfolio.holdings).forEach(([ticker, h]) => {
      if (prices[ticker]?.price) {
        liveValue += h.shares * prices[ticker].price;
      } else {
        liveValue += h.totalCost;
        hasAllPrices = false;
      }
    });
    return { liveValue, hasAllPrices };
  };

  const login = (userId) => {
    const user = USERS.find(u => u.id === userId);
    if (pinInput === user.pin) {
      setCurrentUser(userId);
      setViewUser(userId);
      setPinTarget(null);
      setPinInput("");
    } else { setPinInput(""); }
  };

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: "#0b0f19", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 4, marginBottom: 8 }}>SALKKU</div>
        <div style={{ color: "#475569", fontSize: 12 }}>Yhdistetään...</div>
      </div>
    </div>
  );

  if (!currentUser) return (
    <div style={{ minHeight: "100vh", background: "#0b0f19", color: "#e2e8f0", fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ position: "fixed", inset: 0, opacity: 0.025, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(16,185,129,0.4) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 400, width: "100%" }}>
        <div style={{ fontSize: 11, letterSpacing: 8, color: "#10b981", marginBottom: 12 }}>PORTFOLIO TRACKER</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, margin: "0 0 8px", color: "#e2e8f0", fontFamily: "'DM Sans', serif", letterSpacing: -1 }}>Salkku</h1>
        <p style={{ color: "#475569", fontSize: 13, marginBottom: 40 }}>Valitse käyttäjä</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
          {USERS.map(u => {
            const { liveValue } = calcLiveValue(portfolios[u.id]);
            return (
              <button key={u.id} onClick={() => setPinTarget(u.id)} style={{
                width: 160, padding: "28px 20px", cursor: "pointer", transition: "all 0.2s",
                background: pinTarget === u.id ? `rgba(${u.color === "#10b981" ? "16,185,129" : "59,130,246"},0.1)` : "rgba(255,255,255,0.02)",
                border: `1px solid ${pinTarget === u.id ? u.color : "rgba(255,255,255,0.06)"}`, borderRadius: 8,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{u.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: u.color }}>{u.name}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>{portfolios[u.id].tradeCount} kauppaa</div>
              </button>
            );
          })}
        </div>
        {pinTarget && (
          <div style={{ marginTop: 20 }}>
            <input type="password" placeholder="PIN" autoFocus
              style={{ ...S.inp, maxWidth: 200, textAlign: "center", fontSize: 20, letterSpacing: 12, margin: "0 auto", display: "block" }}
              value={pinInput} onChange={e => setPinInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login(pinTarget)} />
            <div style={{ marginTop: 12 }}>
              <button onClick={() => login(pinTarget)} style={S.btn("#10b981")}>KIRJAUDU</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const me = USERS.find(u => u.id === currentUser);
  const viewing = USERS.find(u => u.id === viewUser);
  const portfolio = portfolios[viewUser];
  const isOwn = viewUser === currentUser;
  const { liveValue, hasAllPrices } = calcLiveValue(portfolio);
  const totalPL = liveValue - portfolio.costBasis;
  const totalPLpct = portfolio.costBasis > 0 ? (totalPL / portfolio.costBasis) * 100 : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f19", color: "#e2e8f0", fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace" }}>
      <div style={{ position: "fixed", inset: 0, opacity: 0.025, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(16,185,129,0.4) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", padding: "0 16px" }}>

        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, letterSpacing: 6, color: "#10b981" }}>SALKKU</span>
            {lastUpdate && (
              <span style={{ fontSize: 10, color: "#334155" }}>
                Hinnat: {lastUpdate.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button onClick={refreshPrices} disabled={pricesLoading} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4,
              color: pricesLoading ? "#334155" : "#64748b", cursor: "pointer", padding: "3px 8px", fontSize: 10,
            }}>{pricesLoading ? "..." : "↻"}</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: me.color, fontWeight: 700, fontSize: 13 }}>{me.icon} {me.name}</span>
            <button onClick={() => { setCurrentUser(null); setViewUser(null); setPinInput(""); }} style={{ ...S.btn("transparent"), padding: "5px 12px", fontSize: 10 }}>ULOS</button>
          </div>
        </header>

        <div style={{ display: "flex", gap: 8, padding: "20px 0 16px" }}>
          {USERS.map(u => {
            const uLive = calcLiveValue(portfolios[u.id]);
            return (
              <button key={u.id} onClick={() => { setViewUser(u.id); setViewTab("holdings"); }} style={{
                flex: 1, padding: "14px", textAlign: "center", cursor: "pointer", transition: "all 0.2s",
                background: viewUser === u.id ? `rgba(${u.color === "#10b981" ? "16,185,129" : "59,130,246"},0.08)` : "transparent",
                border: `1px solid ${viewUser === u.id ? u.color : "rgba(255,255,255,0.06)"}`, borderRadius: 6,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: viewUser === u.id ? u.color : "#64748b" }}>{u.icon} {u.name}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{Object.keys(portfolios[u.id].holdings).length} positiota</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
          <StatBox label="Salkun arvo" value={`${fmt(liveValue)}`} color={viewing.color} sub={hasAllPrices && portfolio.costBasis > 0 ? pctFmt(totalPLpct) : null} />
          <StatBox label="Tuotto" value={hasAllPrices ? `${totalPL >= 0 ? "+" : ""}${fmt(totalPL)}` : "—"} color={plColor(totalPL)} />
          <StatBox label="Sijoitettu" value={fmt(portfolio.totalInvested)} />
          <StatBox label="Myyty" value={fmt(portfolio.totalSold)} />
        </div>

        {isOwn && (
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => setShowForm(!showForm)} style={{ ...S.btn(showForm ? "transparent" : "#10b981"), width: "100%", padding: 12 }}>
              {showForm ? "PIILOTA LOMAKE ▲" : "＋ UUSI KAUPPA ▼"}
            </button>
            {showForm && <div style={{ marginTop: 10 }}><TradeForm onAdd={addTrade} userId={currentUser} /></div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {[["holdings", "POSITIOT"], ["history", "KAUPPAHISTORIA"]].map(([id, l]) => (
            <button key={id} onClick={() => setViewTab(id)} style={{
              flex: 1, padding: "12px", border: "none", cursor: "pointer", fontSize: 11, letterSpacing: 3,
              background: viewTab === id ? "rgba(255,255,255,0.04)" : "transparent",
              borderBottom: viewTab === id ? `2px solid ${viewing.color}` : "2px solid transparent",
              color: viewTab === id ? "#e2e8f0" : "#475569",
            }}>{l}</button>
          ))}
        </div>

        {viewTab === "holdings" && <HoldingsTable holdings={portfolio.holdings} color={viewing.color} prices={prices} pricesLoading={pricesLoading} />}
        {viewTab === "history" && <TradeHistory trades={portfolio.userTrades} onDelete={handleDeleteTrade} canDelete={isOwn} />}

        {/* Comparison */}
        <div style={{ marginTop: 32, padding: 20, background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#64748b", marginBottom: 16, textTransform: "uppercase" }}>Vertailu</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {USERS.map(u => {
              const p = portfolios[u.id];
              const uLive = calcLiveValue(p);
              const uPL = uLive.liveValue - p.costBasis;
              const uPLpct = p.costBasis > 0 ? (uPL / p.costBasis) * 100 : 0;
              const tickers = Object.keys(p.holdings);
              return (
                <div key={u.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 6, borderTop: `2px solid ${u.color}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: u.color, marginBottom: 10 }}>{u.icon} {u.name}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(uLive.liveValue)}</div>
                  {uLive.hasAllPrices && p.costBasis > 0 && (
                    <div style={{ fontSize: 12, color: plColor(uPL), marginTop: 4 }}>{uPL >= 0 ? "+" : ""}{fmt(uPL)} ({pctFmt(uPLpct)})</div>
                  )}
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>{tickers.length > 0 ? tickers.join(", ") : "—"}</div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{p.tradeCount} kauppaa · {tickers.length} positiota</div>
                </div>
              );
            })}
          </div>
        </div>

        <footer style={{ padding: "32px 0", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.04)", marginTop: 40 }}>
          <div style={{ fontSize: 10, color: "#1e293b", letterSpacing: 4 }}>SALKKU TRACKER © 2026</div>
        </footer>
      </div>
    </div>
  );
}
