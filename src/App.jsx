import { useState, useEffect, useMemo } from "react";
import { writeTrade, deleteTrade as fbDeleteTrade, subscribeTrades } from "./firebase.js";

// ═══════════════════════════════════════════════════
// KÄYTTÄJÄASETUKSET — Muokkaa nimet ja PIN-koodit!
// ═══════════════════════════════════════════════════
const USERS = [
  { id: "simo", name: "Simo", pin: "1111", color: "#10b981", icon: "◈" },
  { id: "veli", name: "Veli", pin: "2222", color: "#3b82f6", icon: "◇" },
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => Number(n).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n).toLocaleString("fi-FI");

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
  const currentValue = Object.values(holdings).reduce((s, h) => s + h.totalCost, 0);
  return { holdings, totalInvested, totalSold, currentValue, tradeCount: userTrades.length, userTrades };
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
    } catch (e) {
      console.error("Save error:", e);
    }
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
        <div>
          <span style={S.lbl}>TICKER</span>
          <input style={S.inp} value={form.ticker} onChange={e => set("ticker", e.target.value)} placeholder="IREN" onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <div>
          <span style={S.lbl}>PVM</span>
          <input style={S.inp} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
        </div>
        <div>
          <span style={S.lbl}>MÄÄRÄ (KPL)</span>
          <input style={S.inp} type="number" value={form.shares} onChange={e => set("shares", e.target.value)} placeholder="100" onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <div>
          <span style={S.lbl}>HINTA / KPL</span>
          <input style={S.inp} type="number" step="0.01" value={form.price} onChange={e => set("price", e.target.value)} placeholder="12.50" onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span style={S.lbl}>MUISTIINPANO</span>
          <input style={S.inp} value={form.note} onChange={e => set("note", e.target.value)} placeholder="Dippiosto, tulokset jne." onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
      </div>
      <button onClick={submit} disabled={saving} style={{ ...S.btn("#10b981"), width: "100%", marginTop: 12, padding: 12, opacity: saving ? 0.5 : 1 }}>
        {saving ? "TALLENNETAAN..." : form.type === "buy" ? "＋ LISÄÄ OSTO" : "＋ LISÄÄ MYYNTI"}
      </button>
    </div>
  );
}

// ── Holdings Table ──
function HoldingsTable({ holdings, color }) {
  const entries = Object.entries(holdings).sort((a, b) => b[1].totalCost - a[1].totalCost);
  if (entries.length === 0) return <div style={{ color: "#475569", textAlign: "center", padding: 40, fontSize: 13 }}>Ei positioita vielä.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["TICKER", "KPL", "KESKIM. HINTA", "ARVO"].map(h => (
              <th key={h} style={{ ...S.lbl, padding: "8px 10px", textAlign: h === "TICKER" ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(([ticker, h]) => (
            <tr key={ticker} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "11px 10px", fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{ticker}</td>
              <td style={{ padding: "11px 10px", textAlign: "right", color: "#e2e8f0" }}>{fmtInt(h.shares)}</td>
              <td style={{ padding: "11px 10px", textAlign: "right", color: "#94a3b8" }}>{fmt(h.avgPrice)} €</td>
              <td style={{ padding: "11px 10px", textAlign: "right", color: "#e2e8f0", fontWeight: 700 }}>{fmt(h.totalCost)} €</td>
            </tr>
          ))}
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
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{fmtInt(t.shares)} × {fmt(t.price)} €</span>
          <span style={{ color: "#64748b", fontSize: 12, marginLeft: "auto" }}>{fmt(t.shares * t.price)} €</span>
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
function StatBox({ label: l, value, color = "#e2e8f0" }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>{l}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
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

  // Subscribe to Firebase
  useEffect(() => {
    const unsubscribe = subscribeTrades((trades) => {
      setAllTrades(trades);
      setLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  const addTrade = async (trade) => {
    await writeTrade(currentUser, trade);
  };
  const handleDeleteTrade = async (tradeId) => {
    await fbDeleteTrade(currentUser, tradeId);
  };

  const portfolios = useMemo(() => ({
    simo: calcPortfolio(allTrades, "simo"),
    veli: calcPortfolio(allTrades, "veli"),
  }), [allTrades]);

  const login = (userId) => {
    const user = USERS.find(u => u.id === userId);
    if (pinInput === user.pin) {
      setCurrentUser(userId);
      setViewUser(userId);
      setPinTarget(null);
      setPinInput("");
    } else {
      setPinInput("");
    }
  };

  // ── Loading ──
  if (!loaded) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 4, marginBottom: 8 }}>SALKKU</div>
        <div style={{ color: "#475569", fontSize: 12 }}>Yhdistetään...</div>
      </div>
    </div>
  );

  // ── Login Screen ──
  if (!currentUser) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>
        <div style={{ fontSize: 11, letterSpacing: 8, color: "#10b981", marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}>PORTFOLIO TRACKER</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, margin: "0 0 8px", color: "#e2e8f0", fontFamily: "'DM Sans', serif", letterSpacing: -1 }}>Salkku</h1>
        <p style={{ color: "#475569", fontSize: 13, marginBottom: 40 }}>Valitse käyttäjä</p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
          {USERS.map(u => (
            <button key={u.id} onClick={() => setPinTarget(u.id)} style={{
              width: 160, padding: "28px 20px", cursor: "pointer", transition: "all 0.2s",
              background: pinTarget === u.id ? `rgba(${u.color === "#10b981" ? "16,185,129" : "59,130,246"},0.1)` : "rgba(255,255,255,0.02)",
              border: `1px solid ${pinTarget === u.id ? u.color : "rgba(255,255,255,0.06)"}`, borderRadius: 8,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{u.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: u.color }}>{u.name}</div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>{portfolios[u.id].tradeCount} kauppaa</div>
            </button>
          ))}
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

  // ── Main View ──
  const me = USERS.find(u => u.id === currentUser);
  const viewing = USERS.find(u => u.id === viewUser);
  const portfolio = portfolios[viewUser];
  const isOwn = viewUser === currentUser;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px", minHeight: "100vh" }}>

      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: 6, color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>SALKKU</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: me.color, fontWeight: 700, fontSize: 13 }}>{me.icon} {me.name}</span>
          <button onClick={() => { setCurrentUser(null); setViewUser(null); setPinInput(""); }} style={{ ...S.btn("transparent"), padding: "5px 12px", fontSize: 10 }}>ULOS</button>
        </div>
      </header>

      {/* User toggle */}
      <div style={{ display: "flex", gap: 8, padding: "20px 0 16px" }}>
        {USERS.map(u => (
          <button key={u.id} onClick={() => { setViewUser(u.id); setViewTab("holdings"); }} style={{
            flex: 1, padding: "14px", textAlign: "center", cursor: "pointer", transition: "all 0.2s",
            background: viewUser === u.id ? `rgba(${u.color === "#10b981" ? "16,185,129" : "59,130,246"},0.08)` : "transparent",
            border: `1px solid ${viewUser === u.id ? u.color : "rgba(255,255,255,0.06)"}`, borderRadius: 6,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: viewUser === u.id ? u.color : "#64748b" }}>{u.icon} {u.name}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{Object.keys(portfolios[u.id].holdings).length} positiota</div>
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        <StatBox label="Salkun arvo" value={`${fmt(portfolio.currentValue)} €`} color={viewing.color} />
        <StatBox label="Sijoitettu yht." value={`${fmt(portfolio.totalInvested)} €`} />
        <StatBox label="Myyty yht." value={`${fmt(portfolio.totalSold)} €`} />
        <StatBox label="Kauppoja" value={portfolio.tradeCount} />
      </div>

      {/* Add trade */}
      {isOwn && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setShowForm(!showForm)} style={{ ...S.btn(showForm ? "transparent" : "#10b981"), width: "100%", padding: 12 }}>
            {showForm ? "PIILOTA LOMAKE ▲" : "＋ UUSI KAUPPA ▼"}
          </button>
          {showForm && <div style={{ marginTop: 10 }}><TradeForm onAdd={addTrade} userId={currentUser} /></div>}
        </div>
      )}

      {/* Tabs */}
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

      {viewTab === "holdings" && <HoldingsTable holdings={portfolio.holdings} color={viewing.color} />}
      {viewTab === "history" && <TradeHistory trades={portfolio.userTrades} onDelete={handleDeleteTrade} canDelete={isOwn} />}

      {/* Comparison */}
      <div style={{ marginTop: 32, padding: 20, background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#64748b", marginBottom: 16, textTransform: "uppercase" }}>Vertailu</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {USERS.map(u => {
            const p = portfolios[u.id];
            const tickers = Object.keys(p.holdings);
            return (
              <div key={u.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 6, borderTop: `2px solid ${u.color}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: u.color, marginBottom: 10 }}>{u.icon} {u.name}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(p.currentValue)} €</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{tickers.length > 0 ? tickers.join(", ") : "—"}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>{p.tradeCount} kauppaa · {tickers.length} positiota</div>
              </div>
            );
          })}
        </div>
      </div>

      <footer style={{ padding: "32px 0", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.04)", marginTop: 40 }}>
        <div style={{ fontSize: 10, color: "#1e293b", letterSpacing: 4 }}>SALKKU TRACKER © 2026</div>
      </footer>
    </div>
  );
}
