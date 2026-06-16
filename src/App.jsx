import { useState, useEffect } from "react";

const STORAGE_KEY = "bet_tracker_data";
const PREDICTIONS_KEY = "bet_predictions_cache";
const SUPABASE_URL = "https://nactfzfejjmgiavlvtdm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hY3RmemZlamptZ2lhdmx2dGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NzY2NDQsImV4cCI6MjA5NzE1MjY0NH0.tUY-cRHWoKTWiCBBcCBuuUCBgP7fTx6VgMJ-9gMOHXM";

const markets = ["1X2", "BTTS", "Over/Under", "Correct Score", "Handicap", "Bet Builder", "Both Teams Score", "Draw No Bet", "Other"];
const leagues = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "MLS", "Champions League", "Europa League", "World Cup", "Other"];
const statuses = ["Pending", "Won", "Lost", "Void"];

function formatCurrency(amount) {
  return `$${parseFloat(amount || 0).toFixed(2)}`;
}
function calcReturn(stake, odds) {
  return parseFloat(stake || 0) * parseFloat(odds || 1);
}
function getStatusColor(status) {
  switch (status) {
    case "Won": return "#00e676";
    case "Lost": return "#ff1744";
    case "Void": return "#ffab00";
    default: return "#90caf9";
  }
}

async function callAI(prompt, type = "analysis") {
") {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-bets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ prompt, type })
  });
  const data = await res.json();
  return data.result || "";
}

export default function BetTracker() {
  const [bets, setBets] = useState([]);
  const [view, setView] = useState("dashboard");
  const [form, setForm] = useState({ match: "", league: "Premier League", market: "1X2", pick: "", odds: "", stake: "", status: "Pending", reasoning: "", date: new Date().toISOString().split("T")[0] });
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [editId, setEditId] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predDate, setPredDate] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setBets(JSON.parse(saved));
    const cached = localStorage.getItem(PREDICTIONS_KEY);
    if (cached) {
      const { date, data } = JSON.parse(cached);
      const today = new Date().toDateString();
      if (date === today) { setPredictions(data); setPredDate(date); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
  }, [bets]);

  const stats = (() => {
    const settled = bets.filter(b => b.status !== "Pending" && b.status !== "Void");
    const won = bets.filter(b => b.status === "Won");
    const lost = bets.filter(b => b.status === "Lost");
    const totalStaked = settled.reduce((s, b) => s + parseFloat(b.stake || 0), 0);
    const totalReturns = won.reduce((s, b) => s + calcReturn(b.stake, b.odds), 0);
    const profit = totalReturns - totalStaked;
    const winRate = settled.length ? ((won.length / settled.length) * 100).toFixed(1) : 0;
    const roi = totalStaked ? ((profit / totalStaked) * 100).toFixed(1) : 0;
    return { won: won.length, lost: lost.length, pending: bets.filter(b => b.status === "Pending").length, totalStaked, totalReturns, profit, winRate, roi, settled: settled.length };
  })();

  function handleFormChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function saveBet() {
    if (!form.match || !form.pick || !form.odds || !form.stake) return alert("Fill in all required fields.");
    if (editId !== null) {
      setBets(bets => bets.map(b => b.id === editId ? { ...form, id: editId } : b));
      setEditId(null);
    } else {
      setBets(bets => [...bets, { ...form, id: Date.now() }]);
    }
    setForm({ match: "", league: "Premier League", market: "1X2", pick: "", odds: "", stake: "", status: "Pending", reasoning: "", date: new Date().toISOString().split("T")[0] });
    setView("history");
  }

  function deleteBet(id) {
    if (confirm("Delete this bet?")) setBets(bets => bets.filter(b => b.id !== id));
  }

  function editBet(bet) {
    setForm({ ...bet });
    setEditId(bet.id);
    setView("add");
  }

  function updateStatus(id, status) {
    setBets(bets => bets.map(b => b.id === id ? { ...b, status } : b));
  }

  async function runAIAnalysis() {
    setAiLoading(true);
    setAiAnalysis("");
    setView("analyze");
    const summary = bets.map(b =>
      `${b.date} | ${b.match} (${b.league}) | ${b.market}: ${b.pick} @ ${b.odds} | Stake: $${b.stake} | ${b.status}${b.reasoning ? ` | Reasoning: ${b.reasoning}` : ""}`
    ).join("\n");
    const prompt = `You are a professional sports betting analyst. Analyze this bettor's history and give sharp, actionable feedback.\n\nBET HISTORY:\n${summary || "No bets yet."}\n\nSTATS:\n- Win Rate: ${stats.winRate}%\n- ROI: ${stats.roi}%\n- Total Profit/Loss: $${stats.profit.toFixed(2)}\n- Total Bets Settled: ${stats.settled}\n\nGive a concise analysis covering:\n1. Strengths (what markets/leagues they're profitable in)\n2. Weaknesses (where they're losing money)\n3. Betting patterns (chasing losses, poor value, etc.)\n4. 3 specific actionable tips to improve their ROI\n5. Overall grade (A-F) with one sentence verdict\n\nBe direct, specific, and honest. No fluff.`;
    try {
      const result = await callAI(prompt);
      setAiAnalysis(result || "No response received.");
    } catch (e) {
      setAiAnalysis("Error running analysis. Please try again.");
    }
    setAiLoading(false);
  }

  async function getPredictions(refresh = false) {
    setPredLoading(true);
    setView("predict");
    const today = new Date().toDateString();
    if (!refresh && predictions && predDate === today) { setPredLoading(false); return; }
    const todayStr = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const prompt = `You are an expert football betting analyst. Today is ${todayStr}.

Generate exactly 3 high-confidence football betting predictions for today. These should be real matches likely being played today across any league worldwide (Premier League, La Liga, Serie A, Bundesliga, Champions League, World Cup, MLS, etc).

For each prediction respond in this EXACT format:
---
MATCH: [Home Team] vs [Away Team]
LEAGUE: [League Name]
PICK: [Your betting pick]
ODDS: [Estimated odds e.g. 1.75]
CONFIDENCE: [High/Medium]
REASONING: [2-3 sentences explaining why]
---

Make sure combined odds across all 3 picks equals at least 3.0 (so it qualifies as a 3-odd accumulator).
Focus on value picks, not just favourites. Be specific and analytical.`;
    try {
     const result = await callAI(prompt, "predictions");
      const parsed = parsePredictions(result);
      setPredictions(parsed);
      setPredDate(today);
      localStorage.setItem(PREDICTIONS_KEY, JSON.stringify({ date: today, data: parsed }));
    } catch (e) {
      setPredictions([{ error: "Could not load predictions. Try again." }]);
    }
    setPredLoading(false);
  }

  function parsePredictions(text) {
    const blocks = text.split("---").filter(b => b.trim().length > 20);
    return blocks.map(block => {
      const get = (key) => {
        const match = block.match(new RegExp(`${key}:\\s*(.+)`));
        return match ? match[1].trim() : "";
      };
      return {
        match: get("MATCH"),
        league: get("LEAGUE"),
        pick: get("PICK"),
        odds: get("ODDS"),
        confidence: get("CONFIDENCE"),
        reasoning: get("REASONING"),
      };
    }).filter(p => p.match);
  }

  function addPredictionAsBet(pred) {
    setForm({
      match: pred.match,
      league: pred.league || "Other",
      market: "1X2",
      pick: pred.pick,
      odds: pred.odds.replace(/[^0-9.]/g, ""),
      stake: "",
      status: "Pending",
      reasoning: pred.reasoning,
      date: new Date().toISOString().split("T")[0]
    });
    setView("add");
  }

  const filteredBets = filterStatus === "All" ? bets : bets.filter(b => b.status === filterStatus);

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", color: "#e0e6f0", fontFamily: "'Inter', sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #0d47a1, #1565c0)", padding: "20px 16px 16px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>⚽ BetIQ</div>
            <div style={{ fontSize: 11, color: "#90caf9", marginTop: 2 }}>Your personal betting analyst</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: stats.profit >= 0 ? "#00e676" : "#ff1744" }}>
              {stats.profit >= 0 ? "+" : ""}{formatCurrency(stats.profit)}
            </div>
            <div style={{ fontSize: 11, color: "#90caf9" }}>Total P&L</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 14 }}>
          {[["dashboard", "📊"], ["predict", "🎯"], ["add", "➕"], ["history", "📋"], ["analyze", "🧠"]].map(([v, icon]) => (
            <button key={v} onClick={() => {
              if (v === "analyze") runAIAnalysis();
              else if (v === "predict") getPredictions();
              else setView(v);
            }}
              style={{ flex: 1, padding: "8px 2px", background: view === v ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 10, color: "#fff", fontSize: 16, cursor: "pointer", fontWeight: view === v ? 700 : 400 }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Win Rate", value: `${stats.winRate}%`, color: "#00e676" },
                { label: "ROI", value: `${stats.roi}%`, color: stats.roi >= 0 ? "#00e676" : "#ff1744" },
                { label: "Won", value: stats.won, color: "#00e676" },
                { label: "Lost", value: stats.lost, color: "#ff1744" },
                { label: "Pending", value: stats.pending, color: "#90caf9" },
                { label: "Total Staked", value: formatCurrency(stats.totalStaked), color: "#ffab00" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#111827", borderRadius: 14, padding: "14px 12px" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {bets.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No bets tracked yet</div>
                <div style={{ fontSize: 13 }}>Tap ➕ to add your first bet or 🎯 for today's predictions</div>
              </div>
            )}
            {bets.filter(b => b.status === "Pending").length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Live / Pending</div>
                {bets.filter(b => b.status === "Pending").map(bet => (
                  <BetCard key={bet.id} bet={bet} onEdit={editBet} onDelete={deleteBet} onStatus={updateStatus} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* PREDICTIONS */}
        {view === "predict" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#90caf9" }}>🎯 Today's Predictions</div>
              <button onClick={() => getPredictions(true)}
                style={{ padding: "6px 12px", background: "#0d47a1", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, cursor: "pointer" }}>
                🔄 Refresh
              </button>
            </div>
            {predLoading ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
                <div style={{ fontSize: 14, color: "#64748b" }}>Generating today's predictions...</div>
              </div>
            ) : predictions && predictions.length > 0 ? (
              <div>
                <div style={{ background: "#0d1f3c", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#90caf9" }}>
                  💡 Tap <strong>"Add to Tracker"</strong> on any prediction to log it as a bet
                </div>
                {predictions.map((pred, i) => pred.error ? (
                  <div key={i} style={{ background: "#111827", borderRadius: 14, padding: 16, color: "#ff1744" }}>{pred.error}</div>
                ) : (
                  <div key={i} style={{ background: "#111827", borderRadius: 14, marginBottom: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{pred.match}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>🏆 {pred.league}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#00e676" }}>@{pred.odds}</div>
                          <div style={{ fontSize: 10, padding: "2px 6px", borderRadius: 10, background: pred.confidence === "High" ? "#00391a" : "#1a1200", color: pred.confidence === "High" ? "#00e676" : "#ffab00", display: "inline-block" }}>
                            {pred.confidence}
                          </div>
                        </div>
                      </div>
                      <div style={{ background: "#0a0e1a", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                        <div style={{ fontSize: 12, color: "#90caf9", fontWeight: 600, marginBottom: 3 }}>Pick: {pred.pick}</div>
                        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{pred.reasoning}</div>
                      </div>
                      <button onClick={() => addPredictionAsBet(pred)}
                        style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg, #0d47a1, #1565c0)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        ➕ Add to Tracker
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
                <div>Tap 🎯 to get today's predictions</div>
              </div>
            )}
          </div>
        )}

        {/* ADD BET */}
        {view === "add" && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#90caf9" }}>{editId ? "✏️ Edit Bet" : "➕ Add New Bet"}</div>
            {[
              { label: "Match *", name: "match", placeholder: "e.g. Arsenal vs Chelsea" },
              { label: "Your Pick *", name: "pick", placeholder: "e.g. Arsenal Win / Over 2.5" },
            ].map(({ label, name, placeholder }) => (
              <div key={name} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>{label}</label>
                <input name={name} value={form[name]} onChange={handleFormChange} placeholder={placeholder}
                  style={{ width: "100%", background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px", color: "#e0e6f0", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Odds *</label>
                <input name="odds" type="number" value={form.odds} onChange={handleFormChange} placeholder="e.g. 1.85"
                  style={{ width: "100%", background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px", color: "#e0e6f0", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Stake ($) *</label>
                <input name="stake" type="number" value={form.stake} onChange={handleFormChange} placeholder="e.g. 20"
                  style={{ width: "100%", background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px", color: "#e0e6f0", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>
            {form.odds && form.stake && (
              <div style={{ background: "#0d1f3c", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13, color: "#90caf9" }}>
                Potential return: <strong style={{ color: "#00e676" }}>{formatCurrency(calcReturn(form.stake, form.odds))}</strong> (profit: {formatCurrency(calcReturn(form.stake, form.odds) - form.stake)})
              </div>
            )}
            {[
              { label: "League", name: "league", options: leagues },
              { label: "Market", name: "market", options: markets },
              { label: "Status", name: "status", options: statuses },
            ].map(({ label, name, options }) => (
              <div key={name} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>{label}</label>
                <select name={name} value={form[name]} onChange={handleFormChange}
                  style={{ width: "100%", background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px", color: "#e0e6f0", fontSize: 14, boxSizing: "border-box" }}>
                  {options.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Date</label>
              <input name="date" type="date" value={form.date} onChange={handleFormChange}
                style={{ width: "100%", background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px", color: "#e0e6f0", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Reasoning (helps AI analysis)</label>
              <textarea name="reasoning" value={form.reasoning} onChange={handleFormChange} placeholder="Why are you placing this bet?"
                rows={3} style={{ width: "100%", background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px", color: "#e0e6f0", fontSize: 14, boxSizing: "border-box", resize: "none" }} />
            </div>
            <button onClick={saveBet}
              style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #0d47a1, #1565c0)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {editId ? "Update Bet" : "Save Bet"}
            </button>
            {editId && (
              <button onClick={() => { setEditId(null); setForm({ match: "", league: "Premier League", market: "1X2", pick: "", odds: "", stake: "", status: "Pending", reasoning: "", date: new Date().toISOString().split("T")[0] }); setView("history"); }}
                style={{ width: "100%", padding: "12px", background: "transparent", border: "1px solid #1e293b", borderRadius: 12, color: "#64748b", fontSize: 14, cursor: "pointer", marginTop: 8 }}>
                Cancel Edit
              </button>
            )}
          </div>
        )}

        {/* HISTORY */}
        {view === "history" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {["All", ...statuses].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  style={{ padding: "6px 12px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", background: filterStatus === s ? "#1565c0" : "#111827", color: filterStatus === s ? "#fff" : "#64748b" }}>
                  {s}
                </button>
              ))}
            </div>
            {filteredBets.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>No bets found</div>
            ) : (
              filteredBets.slice().reverse().map(bet => (
                <BetCard key={bet.id} bet={bet} onEdit={editBet} onDelete={deleteBet} onStatus={updateStatus} />
              ))
            )}
          </div>
        )}

        {/* AI ANALYSIS */}
        {view === "analyze" && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#90caf9" }}>🧠 AI Betting Analysis</div>
            {aiLoading ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
                <div style={{ fontSize: 14, color: "#64748b" }}>Analyzing your betting patterns...</div>
              </div>
            ) : aiAnalysis ? (
              <div style={{ background: "#111827", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "#cbd5e1", whiteSpace: "pre-wrap" }}>{aiAnalysis}</div>
                <button onClick={runAIAnalysis}
                  style={{ marginTop: 16, width: "100%", padding: "12px", background: "#0d47a1", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  🔄 Re-analyze
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🧠</div>
                <div>Tap the brain icon to analyze your bets</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BetCard({ bet, onEdit, onDelete, onStatus }) {
  const [expanded, setExpanded] = useState(false);
  const potReturn = calcReturn(bet.stake, bet.odds);
  const profit = potReturn - parseFloat(bet.stake || 0);
  return (
    <div style={{ background: "#111827", borderRadius: 14, marginBottom: 10, overflow: "hidden", border: `1px solid ${bet.status === "Won" ? "#00391a" : bet.status === "Lost" ? "#3d0007" : "#1e293b"}` }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, marginRight: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{bet.match}</div>
            <div style={{ fontSize: 12, color: "#90caf9" }}>{bet.pick} · <span style={{ color: "#64748b" }}>{bet.market}</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: bet.status === "Won" ? "#00e676" : bet.status === "Lost" ? "#ff1744" : "#90caf9" }}>
              {bet.status === "Won" ? `+$${profit.toFixed(2)}` : bet.status === "Lost" ? `-$${parseFloat(bet.stake).toFixed(2)}` : `$${parseFloat(bet.stake).toFixed(2)}`}
            </div>
            <div style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.07)", color: getStatusColor(bet.status), display: "inline-block", marginTop: 3 }}>
              {bet.status}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 11, color: "#64748b" }}>
          <span>📅 {bet.date}</span>
          <span>🏆 {bet.league}</span>
          <span>📈 @{bet.odds}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid #1e293b", padding: "12px 14px" }}>
          {bet.reasoning && (
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5, background: "#0a0e1a", padding: 10, borderRadius: 8 }}>
              💭 {bet.reasoning}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
            Potential return: <strong style={{ color: "#e0e6f0" }}>${potReturn.toFixed(2)}</strong> · Stake: <strong style={{ color: "#e0e6f0" }}>${parseFloat(bet.stake).toFixed(2)}</strong>
          </div>
          {bet.status === "Pending" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {["Won", "Lost", "Void"].map(s => (
                <button key={s} onClick={() => onStatus(bet.id, s)}
                  style={{ flex: 1, padding: "8px 4px", background: s === "Won" ? "#00391a" : s === "Lost" ? "#3d0007" : "#1a1200", border: `1px solid ${getStatusColor(s)}22`, borderRadius: 8, color: getStatusColor(s), fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onEdit(bet)}
              style={{ flex: 1, padding: "8px", background: "#0d1f3c", border: "1px solid #1565c0", borderRadius: 8, color: "#90caf9", fontSize: 12, cursor: "pointer" }}>
              ✏️ Edit
            </button>
            <button onClick={() => onDelete(bet.id)}
              style={{ flex: 1, padding: "8px", background: "#1a0005", border: "1px solid #ff174422", borderRadius: 8, color: "#ff1744", fontSize: 12, cursor: "pointer" }}>
              🗑️ Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
