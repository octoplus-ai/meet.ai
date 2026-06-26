import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard, MessageSquareText, Plus, Settings, Search, Calendar, Clock,
  Users, CheckCircle2, Circle, ArrowLeft, Sparkles, Activity, FileText, ListChecks,
  BarChart3, Send, Loader2, Video, AlertTriangle, Target, Trash2, RotateCcw,
  Hash, X, Zap, Mic, ChevronRight, Quote
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Cadence — Meeting Intelligence  (Read.ai-style workflow clone)     */
/*  Record → Transcribe → Summarize → Score → Next steps + Ask chat    */
/* ------------------------------------------------------------------ */

const SPEAKER_COLORS = ["#7C3AED", "#4F46E5", "#0EA5E9", "#10B981", "#F59E0B", "#F43F5E", "#14B8A6", "#8B5CF6"];

/* ---------------------------- storage shim ------------------------- */
const mem = {};
const store = {
  async get(key, fallback) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const v = window.localStorage.getItem(key);
        return v != null ? JSON.parse(v) : fallback;
      }
    } catch (e) { /* unavailable */ }
    return key in mem ? mem[key] : fallback;
  },
  async set(key, val) {
    mem[key] = val;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(val));
      }
    } catch (e) { /* ignore */ }
  },
};

/* ---------------------------- Claude API --------------------------- */
async function callClaude(messages, system) {
  const res = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error("API request failed (" + res.status + ")");
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function extractJSON(text) {
  let t = (text || "").trim();
  t = t.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

/* ------------------------- transcript parsing ---------------------- */
function parseTranscript(raw) {
  const lines = (raw || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const turns = [];
  for (const line of lines) {
    // optional [00:42] timestamp + "Speaker: text"
    const tm = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
    let t = "";
    let rest = line;
    if (tm) { t = tm[1]; rest = tm[2]; }
    const sm = rest.match(/^([A-Za-zÀ-ÿ'.\- ]{1,32}):\s*(.+)$/);
    if (sm) turns.push({ t, speaker: sm[1].trim(), text: sm[2].trim() });
    else if (turns.length) turns[turns.length - 1].text += " " + rest;
    else turns.push({ t, speaker: "Speaker", text: rest });
  }
  return turns;
}

/* ------------------------------ seed ------------------------------- */
function seedMeetings() {
  return [
    {
      id: "m1",
      title: "Discovery Call — Northwind Logistics",
      date: "2026-06-18",
      durationMin: 34,
      platform: "Google Meet",
      summary:
        "Northwind processes ~4,000 supplier invoices per month manually across three staff, with frequent PO-matching errors. They want an AI system to read invoices, match them to purchase orders in SAP, and flag exceptions. Budget and timeline appetite are strong, and the next step is a tailored proposal plus a short demo on a sample batch.",
      topics: ["Invoice processing pain points", "PO matching in SAP", "Exception handling", "ROI & headcount", "Implementation timeline"],
      keyQuestions: [
        "Can the system reach 95%+ matching accuracy on Northwind's invoice formats?",
        "How does it integrate with their existing SAP instance?",
        "What does a realistic pilot timeline look like?",
      ],
      actionItems: [
        { owner: "Ana Reyes", task: "Send tailored automation proposal with pricing tiers", due: "Jun 23", done: false },
        { owner: "Ana Reyes", task: "Prepare demo on a 50-invoice sample batch", due: "Jun 25", done: false },
        { owner: "David Cho", task: "Share anonymised invoice + PO samples", due: "This week", done: true },
        { owner: "Mei Lin", task: "Confirm finance sign-off process for pilot budget", due: "Jul 1", done: false },
      ],
      nextSteps: [
        "Deliver proposal and book a 30-min demo review",
        "Scope a 4-week paid pilot on one supplier category",
      ],
      scores: { overall: 88, engagement: 84, sentiment: 90, balance: 76, clarity: 86 },
      sentimentLabel: "Positive",
      sentimentTimeline: [0.2, 0.4, 0.5, 0.3, 0.6, 0.7, 0.8, 0.7],
      participants: [
        { name: "Ana Reyes", role: "AI Consultant (You)", talkPct: 38, sentiment: "Positive" },
        { name: "David Cho", role: "Ops Director, Northwind", talkPct: 41, sentiment: "Positive" },
        { name: "Mei Lin", role: "Finance, Northwind", talkPct: 21, sentiment: "Neutral" },
      ],
      transcript: parseTranscript(
`[00:12] Ana Reyes: Thanks for the time today. To start, can you walk me through how invoices flow in right now?
[00:31] David Cho: Sure. We get around four thousand supplier invoices a month, all by email or PDF. Three people key them in and match them against purchase orders in SAP by hand.
[01:05] Mei Lin: And honestly that's where it breaks. The matching is manual, so we get errors, duplicate payments a few times a quarter, and month-end is brutal.
[01:40] Ana Reyes: That's exactly the kind of process we automate. We'd have an AI read each invoice, pull line items, and auto-match to the PO. Anything ambiguous gets flagged for a human instead of stopping the line.
[02:20] David Cho: What kind of accuracy are we talking about? Our formats are all over the place.
[02:35] Ana Reyes: On messy real-world formats we typically land mid-nineties after a short tuning period, and exceptions route to your team with the reason attached.
[03:10] Mei Lin: If we cut the manual matching we could redeploy at least two people to higher-value work.
[03:38] David Cho: SAP integration is the part I worry about. We can't rip anything out.
[03:55] Ana Reyes: Understood — we sit alongside SAP and write back through its API, no replacement. I'd suggest a four-week paid pilot on one supplier category to prove it on your data.
[04:30] David Cho: I like that. Send us a proposal and let's see a demo on a real batch.
[05:02] Mei Lin: I'll need to confirm the sign-off path on our side for the pilot budget.
[05:20] Ana Reyes: Perfect. If you share an anonymised batch of invoices and POs, I'll have a demo ready next week.`
      ),
    },
    {
      id: "m2",
      title: "Sprint Planning — Automation Platform v2",
      date: "2026-06-22",
      durationMin: 47,
      platform: "Microsoft Teams",
      summary:
        "The team planned the v2 sprint for the internal automation platform. OCR accuracy on handwritten fields is the top risk, webhook retries need a dead-letter queue, and the cross-meeting chat (RAG) feature is greenlit for this cycle. Scope was agreed but the OCR spike could push the timeline if accuracy stays below target.",
      topics: ["OCR accuracy spike", "Webhook retry / dead-letter queue", "Chat-RAG feature", "Sprint scope & capacity", "Release timeline"],
      keyQuestions: [
        "Can OCR handle handwritten amounts well enough to ship, or is a vendor swap needed?",
        "Do we have capacity for both the DLQ and the RAG feature this sprint?",
        "What is the hard release date for v2?",
      ],
      actionItems: [
        { owner: "Tomás", task: "Run a 2-day OCR accuracy spike on handwritten samples", due: "Jun 24", done: false },
        { owner: "Priya", task: "Design dead-letter queue for failed webhooks", due: "Jun 26", done: false },
        { owner: "Leo", task: "Build chat UI shell for the RAG feature", due: "Jun 30", done: false },
        { owner: "Tomás", task: "Confirm v2 release date with stakeholders", due: "Jun 24", done: false },
      ],
      nextSteps: [
        "Decide go/no-go on current OCR vendor after the spike",
        "Lock sprint scope once OCR risk is quantified",
      ],
      scores: { overall: 79, engagement: 81, sentiment: 68, balance: 88, clarity: 74 },
      sentimentLabel: "Neutral",
      sentimentTimeline: [0.3, 0.1, -0.1, 0.0, -0.2, 0.1, 0.2, 0.3],
      participants: [
        { name: "Ana Reyes", role: "AI Consultant (You)", talkPct: 22, sentiment: "Neutral" },
        { name: "Tomás", role: "Engineering Lead", talkPct: 34, sentiment: "Neutral" },
        { name: "Priya", role: "Backend Engineer", talkPct: 26, sentiment: "Neutral" },
        { name: "Leo", role: "Frontend Engineer", talkPct: 18, sentiment: "Positive" },
      ],
      transcript: parseTranscript(
`[00:08] Tomás: Main risk this sprint is OCR. Handwritten amounts on some invoices are still misreading and it's hurting match rates.
[00:30] Priya: We also have webhooks silently failing. We need a dead-letter queue so nothing gets dropped.
[00:52] Ana Reyes: Both matter, but if OCR accuracy is below target nothing downstream is trustworthy. Can we time-box a spike before committing?
[01:18] Tomás: Yes. Two days on a handwritten sample set, then we decide whether to tune or swap vendors.
[01:45] Leo: Where does the chat feature land? I can start the UI shell regardless of the backend.
[02:05] Ana Reyes: Good — the cross-meeting chat is greenlit. Build the shell now, wire it to retrieval once the index is ready.
[02:35] Priya: I'll take the dead-letter queue design. It's contained.
[03:00] Tomás: Capacity is tight for all three. The OCR spike result decides what we cut.
[03:25] Ana Reyes: Agreed. Let's not lock scope until we know the OCR number. Tomás, can you also confirm the hard release date?
[03:48] Tomás: I'll get the v2 date from stakeholders by tomorrow.`
      ),
    },
    {
      id: "m3",
      title: "Client Check-in — Lumio Retail (Chatbot rollout)",
      date: "2026-06-24",
      durationMin: 28,
      platform: "Zoom",
      summary:
        "Lumio's support chatbot is deflecting fewer tickets than the 60% target — currently around 44% — and CX is frustrated by escalations on returns and order-status questions. Root cause looks like thin intent coverage and missing live order data. There is real churn risk if numbers don't move within two weeks; a focused retraining sprint and an order-status integration were agreed.",
      topics: ["Deflection below target", "Escalation hotspots (returns, order status)", "Intent coverage gaps", "Live order-data integration", "Two-week recovery plan"],
      keyQuestions: [
        "Why is deflection stuck at ~44% versus the 60% target?",
        "Which intents drive the most escalations?",
        "Can we connect live order status to cut order-related tickets?",
      ],
      actionItems: [
        { owner: "Ana Reyes", task: "Retrain top 10 failing intents from last 30 days of chats", due: "Jun 30", done: false },
        { owner: "Ana Reyes", task: "Scope order-status API integration with Lumio eng", due: "Jun 27", done: false },
        { owner: "Sara", task: "Send export of escalated conversations", due: "Jun 26", done: false },
        { owner: "Mark", task: "Grant sandbox access to order-status endpoint", due: "Jun 27", done: false },
      ],
      nextSteps: [
        "Ship retrained intents and re-measure deflection in 2 weeks",
        "Flag account as at-risk internally and schedule a recovery review",
      ],
      scores: { overall: 71, engagement: 77, sentiment: 52, balance: 80, clarity: 78 },
      sentimentLabel: "Neutral",
      sentimentTimeline: [-0.1, -0.3, -0.4, -0.2, 0.0, 0.1, 0.3, 0.4],
      participants: [
        { name: "Ana Reyes", role: "AI Consultant (You)", talkPct: 30, sentiment: "Neutral" },
        { name: "Sara", role: "CX Lead, Lumio", talkPct: 45, sentiment: "Negative" },
        { name: "Mark", role: "CTO, Lumio", talkPct: 25, sentiment: "Neutral" },
      ],
      transcript: parseTranscript(
`[00:10] Sara: I'll be honest, we're disappointed. Deflection is sitting around forty-four percent and we were promised sixty.
[00:32] Ana Reyes: That's a fair concern and I want to fix it fast. Where are the escalations concentrated?
[00:50] Sara: Returns and order status. Customers ask "where is my order" and the bot just can't answer, so it bounces to a human.
[01:18] Mark: Part of that is on us — the bot doesn't have live access to order data yet.
[01:40] Ana Reyes: Right, that's a big lever. If we connect the order-status endpoint, a huge chunk of those tickets resolve themselves.
[02:05] Sara: And the returns flow keeps misunderstanding people. It feels like the intents are too thin.
[02:28] Ana Reyes: Agreed. I'll retrain the top ten failing intents from your last thirty days of real chats. That plus order data should move the number.
[02:55] Mark: We can give you sandbox access to the order endpoint this week.
[03:15] Sara: I need to see real improvement in two weeks, not promises.
[03:30] Ana Reyes: Understood. We ship the retraining and integration, then re-measure deflection in two weeks. I'll own that.`
      ),
    },
  ];
}

/* ----------------------------- helpers ----------------------------- */
const fmtDate = (iso) => {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
};
const sentimentTone = (label) => {
  if (label === "Positive") return { c: "#10B981", bg: "bg-emerald-50", t: "text-emerald-700", b: "border-emerald-200" };
  if (label === "Negative") return { c: "#F43F5E", bg: "bg-rose-50", t: "text-rose-700", b: "border-rose-200" };
  return { c: "#64748B", bg: "bg-slate-100", t: "text-slate-600", b: "border-slate-200" };
};
const scoreColor = (n) => (n >= 80 ? "#10B981" : n >= 65 ? "#F59E0B" : "#F43F5E");

/* --------------------------- small UI bits ------------------------- */
function ScoreRing({ value, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0">
      <defs>
        <linearGradient id={"ring" + value} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF2F7" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={`url(#ring${value})`} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        className="cad-display" style={{ fontSize: size * 0.3, fontWeight: 700, fill: "#1A1A24" }}>
        {value}
      </text>
    </svg>
  );
}

function TalkRibbon({ participants }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full">
      {participants.map((p, i) => (
        <div key={i} title={`${p.name} · ${p.talkPct}%`} style={{ width: p.talkPct + "%", background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }} />
      ))}
    </div>
  );
}

function ScorePill({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="cad-mono cad-t10 uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 flex items-end gap-1.5">
        <span className="cad-display text-xl font-bold" style={{ color: scoreColor(value) }}>{value}</span>
        <span className="cad-mono mb-0.5 cad-t10 text-slate-300">/100</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: value + "%", background: scoreColor(value) }} />
      </div>
    </div>
  );
}

/* ============================ MAIN APP ============================== */
export default function App() {
  const [meetings, setMeetings] = useState(null);
  const [view, setView] = useState("dashboard"); // dashboard | meeting | chat | add | settings
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    (async () => {
      let m = await store.get("cadence:meetings", null);
      if (!m) { m = seedMeetings(); await store.set("cadence:meetings", m); }
      setMeetings(m);
    })();
  }, []);

  const persist = async (next) => { setMeetings(next); await store.set("cadence:meetings", next); };
  const active = useMemo(() => (meetings || []).find((m) => m.id === activeId), [meetings, activeId]);

  const openMeeting = (id) => { setActiveId(id); setView("meeting"); };

  if (!meetings) {
    return (
      <div className="cad-body flex h-screen items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="mr-2 animate-spin" size={18} /> Loading Cadence…
      </div>
    );
  }

  return (
    <div className="cad-body flex h-screen w-full overflow-hidden bg-slate-50 text-slate-800">
      <StyleInject />
      {/* ---------------- sidebar ---------------- */}
      <aside className="flex w-16 shrink-0 flex-col items-center justify-between cad-ink py-5 sm:w-56 sm:items-stretch sm:px-3">
        <div>
          <div className="mb-8 flex items-center gap-2.5 px-0 sm:px-2">
            <div className="brand-grad flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
              <Mic size={18} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <div className="cad-display cad-t15 font-bold leading-none text-white">Cadence</div>
              <div className="cad-mono mt-1 cad-t9 uppercase tracking-widest text-slate-500">Meeting Intelligence</div>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            <NavItem icon={LayoutDashboard} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
            <NavItem icon={MessageSquareText} label="Ask Cadence" active={view === "chat"} onClick={() => setView("chat")} />
            <NavItem icon={Plus} label="Add meeting" active={view === "add"} onClick={() => setView("add")} />
            <NavItem icon={Settings} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
          </nav>
        </div>
        <div className="hidden rounded-xl bg-white/5 p-3 sm:block">
          <div className="flex items-center gap-2 text-slate-300">
            <div className="brand-grad flex h-7 w-7 items-center justify-center rounded-full cad-t11 font-bold text-white">AR</div>
            <div className="text-xs">
              <div className="font-medium text-slate-200">Ana Reyes</div>
              <div className="cad-mono cad-t9 text-slate-500">AI Consultant</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ---------------- main ---------------- */}
      <main className="flex-1 overflow-y-auto">
        {view === "dashboard" && <Dashboard meetings={meetings} onOpen={openMeeting} onAdd={() => setView("add")} onChat={() => setView("chat")} />}
        {view === "meeting" && active && <MeetingDetail meeting={active} onBack={() => setView("dashboard")} onUpdate={persist} meetings={meetings} />}
        {view === "chat" && <ChatView meetings={meetings} onOpen={openMeeting} />}
        {view === "add" && <AddMeeting onSave={async (m) => { await persist([m, ...meetings]); openMeeting(m.id); }} onCancel={() => setView("dashboard")} />}
        {view === "settings" && <SettingsView meetings={meetings} onReset={async () => { const s = seedMeetings(); await persist(s); }} onClear={async () => { await persist([]); }} />}
      </main>
    </div>
  );
}

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm transition-colors sm:px-3 " +
        (active ? "brand-grad text-white shadow-lg" : "text-slate-400 hover:bg-white/5 hover:text-slate-200")
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/* ============================ DASHBOARD ============================= */
function Dashboard({ meetings, onOpen, onAdd, onChat }) {
  const stats = useMemo(() => {
    const count = meetings.length;
    const avg = count ? Math.round(meetings.reduce((a, m) => a + m.scores.overall, 0) / count) : 0;
    const hours = (meetings.reduce((a, m) => a + m.durationMin, 0) / 60).toFixed(1);
    const open = meetings.reduce((a, m) => a + m.actionItems.filter((i) => !i.done).length, 0);
    return { count, avg, hours, open };
  }, [meetings]);

  const pulse = useMemo(
    () => [...meetings].sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({
      name: m.title.split("—")[0].trim().slice(0, 14),
      score: m.scores.overall, engagement: m.scores.engagement,
    })),
    [meetings]
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="cad-mono cad-t11 uppercase tracking-widest text-violet-500">Tuesday · Good morning</div>
          <h1 className="cad-display mt-1 text-3xl font-bold text-slate-900">Your meetings, decoded</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={onChat} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300">
            <Sparkles size={15} className="text-violet-500" /> Ask Cadence
          </button>
          <button onClick={onAdd} className="brand-grad flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:opacity-95">
            <Plus size={16} /> Add meeting
          </button>
        </div>
      </header>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Video} label="Meetings tracked" value={stats.count} tint="violet" />
        <Kpi icon={Target} label="Avg meeting score" value={stats.avg} tint="indigo" suffix="/100" />
        <Kpi icon={Clock} label="Hours captured" value={stats.hours} tint="sky" />
        <Kpi icon={ListChecks} label="Open action items" value={stats.open} tint="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* pulse chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-1 flex items-center gap-2">
            <Activity size={16} className="text-violet-500" />
            <h2 className="cad-display text-sm font-bold text-slate-900">Conversation pulse</h2>
          </div>
          <p className="mb-4 text-xs text-slate-400">Overall score & engagement across recent meetings</p>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={pulse} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#CBD5E1" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
              <Area type="monotone" dataKey="score" stroke="#7C3AED" strokeWidth={2.5} fill="url(#gScore)" />
              <Line type="monotone" dataKey="engagement" stroke="#0EA5E9" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* sentiment split */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="cad-display mb-4 text-sm font-bold text-slate-900">Sentiment mix</h2>
          {["Positive", "Neutral", "Negative"].map((s) => {
            const n = meetings.filter((m) => m.sentimentLabel === s).length;
            const pct = meetings.length ? Math.round((n / meetings.length) * 100) : 0;
            const tone = sentimentTone(s);
            return (
              <div key={s} className="mb-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-slate-600">{s}</span>
                  <span className="cad-mono text-slate-400">{n}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: pct + "%", background: tone.c }} />
                </div>
              </div>
            );
          })}
          <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <AlertTriangle size={13} className="mb-1 text-amber-500" />
            {meetings.filter((m) => m.nextSteps.some((n) => /risk|at-risk/i.test(n))).length} account(s) flagged at-risk in next steps.
          </div>
        </div>
      </div>

      {/* meeting list */}
      <div className="mt-7">
        <h2 className="cad-display mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Recent meetings</h2>
        <div className="space-y-3">
          {[...meetings].sort((a, b) => b.date.localeCompare(a.date)).map((m) => {
            const tone = sentimentTone(m.sentimentLabel);
            return (
              <button key={m.id} onClick={() => onOpen(m.id)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md">
                <ScoreRing value={m.scores.overall} size={56} stroke={5} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="cad-display truncate cad-t15 font-semibold text-slate-900">{m.title}</h3>
                    <span className={"shrink-0 rounded-full border px-2 py-0.5 cad-t10 font-medium " + tone.bg + " " + tone.t + " " + tone.b}>{m.sentimentLabel}</span>
                  </div>
                  <div className="cad-mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 cad-t11 text-slate-400">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(m.date)}</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {m.durationMin}m</span>
                    <span className="flex items-center gap-1"><Video size={11} /> {m.platform}</span>
                    <span className="flex items-center gap-1"><Users size={11} /> {m.participants.length}</span>
                  </div>
                  <div className="mt-2.5 max-w-md"><TalkRibbon participants={m.participants} /></div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tint, suffix }) {
  const tints = {
    violet: "bg-violet-50 text-violet-600", indigo: "bg-indigo-50 text-indigo-600",
    sky: "bg-sky-50 text-sky-600", amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={"mb-3 flex h-9 w-9 items-center justify-center rounded-lg " + tints[tint]}>
        <Icon size={17} />
      </div>
      <div className="cad-display text-2xl font-bold text-slate-900">
        {value}<span className="cad-mono text-xs font-normal text-slate-300">{suffix}</span>
      </div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
    </div>
  );
}

/* ========================= MEETING DETAIL ========================== */
function MeetingDetail({ meeting, onBack, onUpdate, meetings }) {
  const [tab, setTab] = useState("overview");
  const [q, setQ] = useState("");
  const tone = sentimentTone(meeting.sentimentLabel);

  const toggleItem = (idx) => {
    const next = meetings.map((m) =>
      m.id === meeting.id ? { ...m, actionItems: m.actionItems.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)) } : m
    );
    onUpdate(next);
  };

  const filteredTurns = meeting.transcript.filter((t) => !q || (t.text + " " + t.speaker).toLowerCase().includes(q.toLowerCase()));
  const speakerIdx = {};
  meeting.participants.forEach((p, i) => (speakerIdx[p.name] = i));

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
      <button onClick={onBack} className="mb-5 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-700">
        <ArrowLeft size={15} /> All meetings
      </button>

      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="min-w-0 flex-1">
          <h1 className="cad-display text-2xl font-bold text-slate-900">{meeting.title}</h1>
          <div className="cad-mono mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 cad-t11 text-slate-400">
            <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(meeting.date)}</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {meeting.durationMin} min</span>
            <span className="flex items-center gap-1"><Video size={12} /> {meeting.platform}</span>
            <span className={"rounded-full border px-2 py-0.5 " + tone.bg + " " + tone.t + " " + tone.b}>{meeting.sentimentLabel}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {meeting.participants.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-full bg-slate-50 py-1 pl-1 pr-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full cad-t10 font-bold text-white" style={{ background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}>
                  {p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
                <span className="text-xs text-slate-600">{p.name}</span>
                <span className="cad-mono cad-t10 text-slate-300">{p.talkPct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <ScoreRing value={meeting.scores.overall} size={76} stroke={7} />
          <span className="cad-mono mt-1 cad-t10 uppercase tracking-wider text-slate-400">Meeting score</span>
        </div>
      </div>

      {/* tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {[
          { k: "overview", label: "Overview", icon: FileText },
          { k: "transcript", label: "Transcript", icon: MessageSquareText },
          { k: "actions", label: "Action items", icon: ListChecks },
          { k: "analytics", label: "Analytics", icon: BarChart3 },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={"flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition " +
              (tab === t.k ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* overview */}
      {tab === "overview" && (
        <div className="space-y-5">
          <Card title="Summary" icon={Sparkles}>
            <p className="text-sm leading-relaxed text-slate-600">{meeting.summary}</p>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Topics discussed" icon={Hash}>
              <div className="flex flex-wrap gap-2">
                {meeting.topics.map((t, i) => (
                  <span key={i} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">{t}</span>
                ))}
              </div>
            </Card>
            <Card title="Key questions raised" icon={Quote}>
              <ul className="space-y-2">
                {meeting.keyQuestions.map((qq, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="cad-mono text-violet-400">{String(i + 1).padStart(2, "0")}</span>{qq}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card title="Recommended next steps" icon={Target}>
            <ul className="space-y-2.5">
              {meeting.nextSteps.map((n, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />{n}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* transcript */}
      {tab === "transcript" && (
        <div>
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the transcript…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-400" />
          </div>
          <div className="space-y-3">
            {filteredTurns.map((t, i) => {
              const ci = speakerIdx[t.speaker] ?? 0;
              return (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full cad-t10 font-bold text-white" style={{ background: SPEAKER_COLORS[ci % SPEAKER_COLORS.length] }}>
                      {t.speaker.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1 rounded-xl border border-slate-100 bg-white p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">{t.speaker}</span>
                      {t.t && <span className="cad-mono cad-t10 text-slate-300">{t.t}</span>}
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">{t.text}</p>
                  </div>
                </div>
              );
            })}
            {!filteredTurns.length && <div className="py-10 text-center text-sm text-slate-400">No lines match “{q}”.</div>}
          </div>
        </div>
      )}

      {/* actions */}
      {tab === "actions" && (
        <Card title="Action items" icon={ListChecks}>
          <div className="space-y-2">
            {meeting.actionItems.map((it, i) => (
              <div key={i} className={"flex items-center gap-3 rounded-xl border p-3 transition " + (it.done ? "border-slate-100 bg-slate-50" : "border-slate-200 bg-white")}>
                <button onClick={() => toggleItem(i)} className="shrink-0">
                  {it.done ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} className="text-slate-300 hover:text-violet-400" />}
                </button>
                <div className="flex-1">
                  <div className={"text-sm " + (it.done ? "text-slate-400 line-through" : "text-slate-700")}>{it.task}</div>
                  <div className="cad-mono mt-0.5 cad-t10 text-slate-400">{it.owner}{it.due ? " · due " + it.due : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* analytics */}
      {tab === "analytics" && (
        <div className="space-y-5">
          <Card title="Score breakdown" icon={BarChart3}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <ScorePill label="Overall" value={meeting.scores.overall} />
              <ScorePill label="Engagement" value={meeting.scores.engagement} />
              <ScorePill label="Sentiment" value={meeting.scores.sentiment} />
              <ScorePill label="Balance" value={meeting.scores.balance} />
              <ScorePill label="Clarity" value={meeting.scores.clarity} />
            </div>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Talk-time distribution" icon={Users}>
              <TalkRibbon participants={meeting.participants} />
              <div className="mt-4 space-y-2">
                {meeting.participants.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-3 w-3 rounded-sm" style={{ background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }} />
                    <span className="flex-1 text-slate-600">{p.name}</span>
                    <span className="cad-mono text-slate-400">{p.talkPct}%</span>
                    <span className={"rounded-full px-2 py-0.5 cad-t10 " + sentimentTone(p.sentiment).bg + " " + sentimentTone(p.sentiment).t}>{p.sentiment}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Sentiment over time" icon={Activity}>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={meeting.sentimentTimeline.map((v, i) => ({ i, v }))} margin={{ left: -30, right: 6, top: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="i" hide />
                  <YAxis domain={[-1, 1]} tick={{ fontSize: 9, fill: "#CBD5E1" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
                  <Area type="monotone" dataKey="v" stroke="#10B981" strokeWidth={2.5} fill="url(#gSent)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon size={15} className="text-violet-500" />}
        <h3 className="cad-display text-sm font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* ============================ CHAT VIEW ============================ */
function ChatView({ meetings, onOpen }) {
  const [msgs, setMsgs] = useState([
    { role: "assistant", text: "Hi Ana — I've read every meeting in your workspace. Ask me anything: open action items, what a client said, risks, decisions, who committed to what.", refs: [] },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const suggestions = [
    "What are all my open action items?",
    "What's the risk with the Lumio account?",
    "Summarize the Northwind opportunity",
    "Who committed to what this week?",
  ];

  const buildContext = (question) => {
    const kw = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const scored = meetings.map((m) => {
      const hay = (m.title + " " + m.summary + " " + m.topics.join(" ") + " " + m.transcript.map((t) => t.text).join(" ")).toLowerCase();
      return { m, score: kw.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0) };
    });
    const top = scored.sort((a, b) => b.score - a.score).slice(0, 2).map((s) => s.m.id);
    return meetings.map((m) => {
      const full = top.includes(m.id);
      const ai = m.actionItems.map((i) => `- [${i.done ? "x" : " "}] ${i.task} (${i.owner}${i.due ? ", due " + i.due : ""})`).join("\n");
      let block = `### ${m.title} — ${fmtDate(m.date)} (${m.platform})\nSummary: ${m.summary}\nSentiment: ${m.sentimentLabel}. Score: ${m.scores.overall}.\nAction items:\n${ai}\nNext steps: ${m.nextSteps.join("; ")}`;
      if (full) block += `\nTranscript:\n` + m.transcript.map((t) => `${t.speaker}: ${t.text}`).join("\n").slice(0, 2200);
      return block;
    }).join("\n\n");
  };

  const send = async (textArg) => {
    const question = (textArg ?? input).trim();
    if (!question || busy) return;
    setInput("");
    const history = [...msgs, { role: "user", text: question }];
    setMsgs(history);
    setBusy(true);
    try {
      const ctx = buildContext(question);
      const sys =
        "You are Cadence, a meeting-intelligence assistant for an AI consultancy. Answer ONLY from the meeting data below. " +
        "Be concise, specific, and actionable. When you use a meeting, mention its name. If the answer isn't in the data, say so plainly.\n\n=== MEETING DATA ===\n" + ctx;
      const apiMsgs = history.filter((m) => m.role === "user" || m.role === "assistant").slice(-6).map((m) => ({ role: m.role, content: m.text }));
      const ans = await callClaude(apiMsgs, sys);
      const refs = meetings.filter((m) => ans.toLowerCase().includes(m.title.split("—")[1]?.trim().toLowerCase() || m.title.toLowerCase())).map((m) => m.id);
      setMsgs((p) => [...p, { role: "assistant", text: ans, refs }]);
    } catch (e) {
      setMsgs((p) => [...p, { role: "assistant", text: "I couldn't reach the analysis engine just now. Check the connection and try again.", refs: [] }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-5 py-6 sm:px-8">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="brand-grad flex h-9 w-9 items-center justify-center rounded-xl"><Sparkles size={17} className="text-white" /></div>
        <div>
          <h1 className="cad-display text-lg font-bold text-slate-900">Ask Cadence</h1>
          <p className="cad-mono cad-t10 uppercase tracking-wider text-slate-400">Search across {meetings.length} meetings</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {msgs.map((m, i) => (
          <div key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={"cad-bubble rounded-2xl px-4 py-3 text-sm leading-relaxed " +
              (m.role === "user" ? "brand-grad text-white" : "border border-slate-200 bg-white text-slate-700 shadow-sm")}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.refs && m.refs.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                  {m.refs.map((id) => {
                    const mt = meetings.find((x) => x.id === id);
                    return mt ? (
                      <button key={id} onClick={() => onOpen(id)} className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 cad-t11 font-medium text-violet-700 hover:bg-violet-100">
                        <FileText size={11} /> {mt.title.split("—")[0].trim()}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 shadow-sm">
              <Loader2 size={14} className="animate-spin text-violet-500" /> Reading your meetings…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {msgs.length <= 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-violet-300 hover:text-violet-700">{s}</button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about any meeting…"
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none" />
        <button onClick={() => send()} disabled={busy || !input.trim()}
          className="brand-grad flex h-9 w-9 items-center justify-center rounded-xl text-white transition disabled:opacity-40">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

/* ============================ ADD MEETING ========================== */
const EXAMPLE_TRANSCRIPT =
`[00:09] Ana Reyes: Thanks for joining. What's the biggest manual task slowing your team down right now?
[00:24] Jordan Vela: Honestly, support ticket triage. Every email comes in raw and someone has to read it, tag it, and route it. It eats two people's mornings.
[00:48] Ana Reyes: That's a perfect candidate. We can have AI classify each ticket, set priority, and auto-route — humans only touch the edge cases.
[01:10] Jordan Vela: How accurate is that going to be? We can't misroute angry customers.
[01:25] Ana Reyes: We'd train on your historical tickets and start in suggest-only mode, so your team approves until trust is high, then flip to auto.
[01:52] Jordan Vela: I like the phased approach. What about cost?
[02:05] Ana Reyes: I'll put together pricing once I see ticket volume. Can you export a month of tickets for me?
[02:20] Jordan Vela: Yes, I'll send that over by Friday. Let's get a proposal moving.`;

function AddMeeting({ onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [platform, setPlatform] = useState("Google Meet");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const analyze = async () => {
    if (!raw.trim()) { setErr("Paste a transcript first."); return; }
    setErr(""); setBusy(true);
    try {
      const sys =
        "You are a meeting-intelligence analyst. Read the transcript and return ONLY a JSON object (no markdown, no prose) with this exact shape:\n" +
        `{"summary": string (2-3 sentences), "topics": string[] (max 5), "keyQuestions": string[] (max 4), "actionItems": [{"owner": string, "task": string, "due": string}] (max 6), "nextSteps": string[] (max 3), "participants": [{"name": string, "role": string, "talkPct": integer, "sentiment": "Positive"|"Neutral"|"Negative"}] (talkPct sums to ~100), "scores": {"overall": int, "engagement": int, "sentiment": int, "balance": int, "clarity": int} (0-100), "sentimentLabel": "Positive"|"Neutral"|"Negative", "sentimentTimeline": number[] (8 values from -1 to 1)}.\n` +
        "Infer speaker names from the transcript. Keep every string short.";
      const out = await callClaude([{ role: "user", content: "Title: " + (title || "Untitled meeting") + "\n\nTranscript:\n" + raw }], sys);
      const parsed = extractJSON(out);
      const turns = parseTranscript(raw);
      const lastT = turns[turns.length - 1]?.t;
      let durationMin = 30;
      if (lastT) { const parts = lastT.split(":").map(Number); durationMin = parts.length === 3 ? parts[0] * 60 + parts[1] : parts[0] + Math.round(parts[1] / 60) + 2; }
      const meeting = {
        id: "m" + Date.now(),
        title: title || "Untitled meeting",
        date, platform, durationMin: Math.max(5, durationMin),
        summary: parsed.summary || "",
        topics: parsed.topics || [],
        keyQuestions: parsed.keyQuestions || [],
        actionItems: (parsed.actionItems || []).map((a) => ({ ...a, done: false })),
        nextSteps: parsed.nextSteps || [],
        participants: parsed.participants || [],
        scores: parsed.scores || { overall: 70, engagement: 70, sentiment: 70, balance: 70, clarity: 70 },
        sentimentLabel: parsed.sentimentLabel || "Neutral",
        sentimentTimeline: parsed.sentimentTimeline || [0, 0, 0, 0, 0, 0, 0, 0],
        transcript: turns,
      };
      onSave(meeting);
    } catch (e) {
      setErr("Couldn't analyze that transcript. Try again, or check the connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-7 sm:px-8">
      <button onClick={onCancel} className="mb-5 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-700">
        <ArrowLeft size={15} /> Cancel
      </button>
      <h1 className="cad-display text-2xl font-bold text-slate-900">Add a meeting</h1>
      <p className="mt-1 text-sm text-slate-500">Paste a transcript and Cadence will summarize, score, and extract next steps — live.</p>

      <div className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="cad-mono mb-1.5 block cad-t10 uppercase tracking-wider text-slate-400">Meeting title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Discovery Call — Acme Co."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
          </div>
          <div>
            <label className="cad-mono mb-1.5 block cad-t10 uppercase tracking-wider text-slate-400">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
          </div>
        </div>
        <div>
          <label className="cad-mono mb-1.5 block cad-t10 uppercase tracking-wider text-slate-400">Platform</label>
          <div className="flex flex-wrap gap-2">
            {["Google Meet", "Zoom", "Microsoft Teams", "In person"].map((p) => (
              <button key={p} onClick={() => setPlatform(p)}
                className={"rounded-xl border px-3 py-2 text-sm transition " + (platform === p ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>{p}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="cad-mono block cad-t10 uppercase tracking-wider text-slate-400">Transcript</label>
            <button onClick={() => { setRaw(EXAMPLE_TRANSCRIPT); setTitle(title || "Discovery Call — Vela Support"); }}
              className="cad-t11 font-medium text-violet-600 hover:text-violet-800">Load example</button>
          </div>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={9}
            placeholder={"Format:\n[00:12] Name: what they said\n[00:30] Other Name: their reply"}
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-xs leading-relaxed outline-none focus:border-violet-400" />
        </div>
        {err && <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700"><AlertTriangle size={15} /> {err}</div>}
        <button onClick={analyze} disabled={busy}
          className="brand-grad flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Analyzing with AI…</> : <><Zap size={16} /> Analyze & save meeting</>}
        </button>
      </div>
    </div>
  );
}

/* ============================ SETTINGS ============================= */
function SettingsView({ meetings, onReset, onClear }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-7 sm:px-8">
      <h1 className="cad-display text-2xl font-bold text-slate-900">Settings</h1>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="cad-display mb-1 flex items-center gap-2 text-sm font-bold text-slate-900"><Mic size={15} className="text-violet-500" /> Recording & capture</h2>
        <p className="text-sm leading-relaxed text-slate-500">
          In this prototype you add meetings by pasting a transcript. In production, Cadence joins your live calls automatically (Zoom, Google Meet, Teams),
          records with consent, and transcribes in real time. That live-capture bot runs on a backend — see the build notes shared alongside this app.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Google Calendar", "Zoom", "Google Meet", "Microsoft Teams"].map((c) => (
            <span key={c} className="cad-mono rounded-full border border-dashed border-slate-300 px-3 py-1.5 cad-t11 text-slate-400">{c} · connect (backend)</span>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="cad-display mb-3 text-sm font-bold text-slate-900">Workspace data</h2>
        <p className="mb-4 text-sm text-slate-500">{meetings.length} meetings stored locally on this device.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={onReset} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300">
            <RotateCcw size={15} /> Reset demo data
          </button>
          <button onClick={onClear} className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-100">
            <Trash2 size={15} /> Clear all meetings
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ styles ============================== */
function StyleInject() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
      .cad-display { font-family: 'Space Grotesk', ui-sans-serif, sans-serif; }
      .cad-body, .cad-body * { font-family: 'Inter', ui-sans-serif, sans-serif; }
      .cad-body .cad-display { font-family: 'Space Grotesk', sans-serif; }
      .cad-body .cad-mono, .cad-mono { font-family: 'Space Mono', ui-monospace, monospace; }
      .cad-t9 { font-size: 9px; line-height: 1.35; }
      .cad-t10 { font-size: 10px; line-height: 1.4; }
      .cad-t11 { font-size: 11px; line-height: 1.45; }
      .cad-t15 { font-size: 15px; line-height: 1.4; }
      .cad-ink { background: #16161F; }
      .cad-bubble { max-width: 85%; }
      .brand-grad { background: linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%); }
      .brand-text { background: linear-gradient(135deg,#7C3AED,#4F46E5); -webkit-background-clip:text; background-clip:text; color:transparent; }
      *::-webkit-scrollbar { width: 8px; height: 8px; }
      *::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
      *::-webkit-scrollbar-track { background: transparent; }
    `}</style>
  );
}
