import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Users, Sparkles, ClipboardList, FolderPlus, Folder, Calendar, Star,
  Presentation, Lightbulb, ShieldCheck, LayoutGrid, PlusCircle, Link2, Globe,
  Search, ChevronDown, RefreshCw, Upload, Lock, MoreHorizontal, ArrowDown,
  ArrowLeft, Send, Loader2, CheckCircle2, Circle, Clock, Video, Hash, Target,
  ListChecks, BarChart3, MessageSquareText, FileText, Quote, AlertTriangle,
  Zap, Activity, Rocket, ChevronLeft, Download, Share2, Play,
} from "lucide-react";
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Octomeet.ai — Meeting Intelligence (Read.ai-style clone — Phase 0) */
/* ------------------------------------------------------------------ */

const SPEAKER_COLORS = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#F43F5E", "#14B8A6", "#8B5CF6", "#EC4899"];
const REF_TODAY = "2026-06-26"; // ancla para agrupar reportes igual que la captura

// Videos de muestra (inventados, solo para preview de las llamadas)
const VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
];

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
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system, messages }),
  });
  if (!res.ok) throw new Error("API request failed (" + res.status + ")");
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
function extractJSON(text) {
  let t = (text || "").trim();
  t = t.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

/* ------------------------- transcript parsing ---------------------- */
function parseTranscript(raw) {
  const lines = (raw || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const turns = [];
  for (const line of lines) {
    const tm = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
    let t = "", rest = line;
    if (tm) { t = tm[1]; rest = tm[2]; }
    const sm = rest.match(/^([A-Za-zÀ-ÿ'.\- ]{1,32}):\s*(.+)$/);
    if (sm) turns.push({ t, speaker: sm[1].trim(), text: sm[2].trim() });
    else if (turns.length) turns[turns.length - 1].text += " " + rest;
    else turns.push({ t, speaker: "Speaker", text: rest });
  }
  return turns;
}

/* ------------------------------ seed ------------------------------- */
function mk(o) {
  const rs = o.readScore ?? 85;
  return {
    durationMin: 30, source: "Google Meet", folder: "Sales Call", folderLocked: true,
    owner: "NB", topics: [], keyQuestions: [], actionItems: [], nextSteps: [],
    summary: "", sentimentLabel: "Positive", video: VIDEOS[0],
    sentimentTimeline: [0.2, 0.4, 0.5, 0.4, 0.6, 0.7, 0.7, 0.8],
    scores: { overall: rs, engagement: Math.min(99, rs + 7), sentiment: Math.max(40, rs - 7), balance: 80, clarity: 82 },
    participants: [], transcript: [],
    ...o,
  };
}

function seedMeetings() {
  const list = [
    mk({
      id: "m_vertex", title: "Vertex Retail — Partnership", date: "2026-06-25",
      timeStart: "2:06 PM", timeEnd: "2:25 PM", durationMin: 19, source: "Google Meet",
      folder: "Partnership Alignment", owner: "NB", readScore: 89, participantsCount: 3,
      scores: { overall: 89, engagement: 96, sentiment: 82, balance: 78, clarity: 86 },
      sentimentLabel: "Positive", sentimentTimeline: [0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.75, 0.8],
      summary:
        "Intro and alignment call exploring a partner-led go-to-market for a new region. The call covered the platform's core capabilities, current traction and reference customers, the ideal customer profile, and the commercial model. Both sides agreed on a partner-led approach: local partners introduce prospects and open doors while the vendor handles demos, proofs of concept and closing, with partners earning a share of the monthly subscription revenue for deals they introduce. A 30-minute product demo was scheduled for Tuesday at 9:00 a.m. Eastern.",
      topics: ["Company & product overview", "Market traction & references", "Ideal customer profile", "Partnership model & economics", "Next steps & demo"],
      keyQuestions: [
        "Which markets is the product strongest in today?",
        "How are responsibilities split between the vendor and the partner?",
        "When can we schedule the demo?",
      ],
      actionItems: [
        { owner: "Alex Carter", task: "Present identified opportunities to the leadership team after the demo", due: "After demo", done: false },
        { owner: "Nicolas Benech", task: "Book a 30-minute product demo for Tuesday at 9:00 a.m. Eastern", due: "Tue", done: false },
        { owner: "Alex Carter", task: "Prepare a short list of target accounts to discuss during the demo", due: "Before demo", done: false },
      ],
      nextSteps: ["Run the 30-minute demo Tuesday 9:00 a.m. ET", "Partner prepares the target-account list"],
      participants: [
        { name: "Nicolas Benech", role: "Octomeet (You)", talkPct: 84, sentiment: "Positive" },
        { name: "Alex Carter", role: "Regional Partner", talkPct: 12, sentiment: "Positive" },
        { name: "Guest", role: "Guest", talkPct: 4, sentiment: "Neutral" },
      ],
      transcript: parseTranscript(
`[00:09] Nicolas Benech: Hi Alex, how are you? Thanks for rescheduling.
[00:21] Alex Carter: All good — I'm based in Florida, so we're in a similar time zone.
[01:22] Nicolas Benech: Great. So at a high level, we take the operations work teams were doing manually and use AI to improve all of it — prioritizing communication, task management, audits, inventory and KPI insights across mobile and desktop.
[02:55] Nicolas Benech: We work with more than a hundred locations across several regions, and now we're opening this market through partners.
[08:20] Alex Carter: And what would my role be — how would responsibilities be divided?
[08:24] Nicolas Benech: Local partners open doors and make introductions; we handle pitching, POCs, integrations and closing, and partners earn a share of the subscription revenue for the deals they introduce.
[17:28] Alex Carter: When can we schedule a demo?
[17:58] Nicolas Benech: Let's do a 30-minute demo Tuesday at 9 a.m. Eastern. I'll book it.
[18:52] Nicolas Benech: Perfect. Thanks a lot for the time and for connecting.`
      ),
    }),
    mk({
      id: "m_acme", title: "Acme Corp — Intro Call", date: "2026-06-26",
      timeStart: "12:00 PM", timeEnd: "12:37 PM", durationMin: 37, source: "Google Meet",
      folder: "Partnership Alignment", owner: "AS", readScore: 88, participantsCount: 3,
      summary: "Intro call with Acme Corp exploring a partnership to bring the platform to new accounts. Covered product capabilities, the ideal customer profile, and the partner revenue-share model. Agreed to align on a target list and a follow-up demo.",
      topics: ["Intro & context", "Product overview", "Ideal customer profile", "Partner economics"],
      keyQuestions: ["Which segments are the best fit?", "How does partner onboarding work?"],
      actionItems: [
        { owner: "Maria Lopez", task: "Share 3-5 target accounts", due: "This week", done: false },
        { owner: "Nicolas Benech", task: "Send partner one-pager and demo link", due: "Jun 27", done: false },
      ],
      nextSteps: ["Align on target accounts", "Schedule product demo"],
      participants: [
        { name: "Nicolas Benech", role: "Octomeet (You)", talkPct: 58, sentiment: "Positive" },
        { name: "Maria Lopez", role: "Partner Prospect", talkPct: 34, sentiment: "Positive" },
        { name: "Guest", role: "Guest", talkPct: 8, sentiment: "Neutral" },
      ],
      transcript: parseTranscript(
`[00:10] Nicolas Benech: Thanks for joining, Maria. Let me give you a quick overview of the platform and how the partnership works.
[00:40] Maria Lopez: Sounds great. I work with several groups here, so I'm curious about the fit.
[01:20] Nicolas Benech: Perfect — we centralize operations with AI: communication, tasks, audits, inventory and KPIs. Partners open doors and we close.`
      ),
    }),
    mk({
      id: "m_northwind", title: "Northwind — Product Demo", date: "2026-06-26",
      timeStart: "10:00 AM", timeEnd: "10:58 AM", durationMin: 58, source: "Google Meet",
      folder: "Partnership Alignment", owner: "NB", readScore: 89, participantsCount: 2,
      summary: "Full product demo for Northwind covering the mobile and desktop experience: AI-prioritized communication, task auditing, image audits, and KPI dashboards. Strong interest; discussed a pilot scope and pricing.",
      topics: ["Live demo", "Image audits", "KPI dashboards", "Pilot scope", "Pricing"],
      keyQuestions: ["What does a pilot rollout look like?", "How is pricing structured?"],
      actionItems: [
        { owner: "Nicolas Benech", task: "Send pilot proposal and pricing", due: "Jun 27", done: false },
        { owner: "Jordan Vela", task: "Confirm pilot group internally", due: "Jul 1", done: false },
      ],
      nextSteps: ["Send pilot proposal", "Confirm pilot group"],
      participants: [
        { name: "Nicolas Benech", role: "Octomeet (You)", talkPct: 63, sentiment: "Positive" },
        { name: "Jordan Vela", role: "Ops Lead", talkPct: 37, sentiment: "Positive" },
      ],
      transcript: parseTranscript(
`[00:12] Nicolas Benech: Let me share my screen and walk you through the platform end to end.
[00:45] Jordan Vela: Please do — I'm most interested in the audit workflows.
[01:10] Nicolas Benech: Great, that's one of our strongest features. Teams submit photos and AI scores compliance automatically.`
      ),
    }),
    mk({
      id: "m_daniela", title: "Candidate Interview — Daniela R.", date: "2026-06-25",
      timeStart: "10:30 AM", timeEnd: "11:10 AM", durationMin: 40, source: "Google Meet",
      folder: "Job Interview", owner: "NB", readScore: 87, participantsCount: 3,
      summary: "Interview conversation covering background, experience and role expectations. Positive rapport; next round to be scheduled.",
      topics: ["Background", "Experience", "Role expectations", "Next steps"],
      keyQuestions: ["What is the candidate's availability?", "Which strengths fit the role best?"],
      actionItems: [{ owner: "Asaf B.", task: "Schedule second-round interview", due: "This week", done: false }],
      nextSteps: ["Schedule next round"],
      participants: [
        { name: "Asaf B.", role: "Interviewer", talkPct: 52, sentiment: "Positive" },
        { name: "Daniela R.", role: "Candidate", talkPct: 48, sentiment: "Positive" },
      ],
      transcript: parseTranscript(
`[00:08] Asaf B.: Thanks for coming in, Daniela. Tell me a bit about your background.
[00:30] Daniela R.: Sure — I've spent the last few years in operations and analytics.`
      ),
    }),
    mk({
      id: "m_daniel", title: "Weekly 1:1 — Daniel M.", date: "2026-06-25",
      timeStart: "10:00 AM", timeEnd: "10:07 AM", durationMin: 7, source: "Google Meet",
      folder: "One-on-One", owner: "NB", readScore: 89, participantsCount: 2,
      summary: "Quick one-on-one sync to align on the week's priorities and outstanding follow-ups.",
      topics: ["Weekly priorities", "Follow-ups"],
      keyQuestions: ["What are the top priorities this week?"],
      actionItems: [{ owner: "Daniel M.", task: "Send updated account list", due: "Today", done: false }],
      nextSteps: ["Sync again Friday"],
      participants: [
        { name: "Nicolas Benech", role: "Octomeet (You)", talkPct: 55, sentiment: "Positive" },
        { name: "Daniel M.", role: "Teammate", talkPct: 45, sentiment: "Positive" },
      ],
      transcript: parseTranscript(`[00:05] Nicolas Benech: Quick sync — what's top of your list this week?`),
    }),
    mk({
      id: "m_globex", title: "Globex — Sales Call", date: "2026-06-24",
      timeStart: "4:30 PM", timeEnd: "5:27 PM", durationMin: 57, source: "Google Meet",
      folder: "Sales Call", owner: "AS", readScore: 85, participantsCount: 4,
      summary: "Sales conversation with the Globex team covering operational challenges and how the AI platform addresses communication, task management and compliance at scale.",
      topics: ["Operations challenges", "Task management", "Compliance", "Scale & rollout"],
      keyQuestions: ["How does the platform scale across many locations?", "What is the rollout timeline?"],
      actionItems: [
        { owner: "Anita S.", task: "Send recap and next-steps email", due: "Jun 25", done: false },
        { owner: "Globex team", task: "Identify pilot region", due: "Jul 1", done: false },
      ],
      nextSteps: ["Recap email", "Identify pilot region"],
      participants: [
        { name: "Anita S.", role: "Octomeet", talkPct: 40, sentiment: "Positive" },
        { name: "Globex Ops", role: "Prospect", talkPct: 35, sentiment: "Neutral" },
        { name: "Globex IT", role: "Prospect", talkPct: 15, sentiment: "Neutral" },
        { name: "Guest", role: "Guest", talkPct: 10, sentiment: "Neutral" },
      ],
      transcript: parseTranscript(`[00:10] Anita S.: Thanks everyone — let's start with your biggest operational headaches today.`),
    }),
    mk({
      id: "m_initech", title: "Initech — Partnership", date: "2026-06-24",
      timeStart: "3:00 PM", timeEnd: "3:23 PM", durationMin: 23, source: "Read",
      folder: "Partnership Alignment", owner: "SL", readScore: 84, participantsCount: 2,
      summary: "Partnership discussion about introducing the platform to a network of accounts and the revenue-share model for introduced deals.",
      topics: ["Partnership model", "Network introductions", "Revenue share"],
      keyQuestions: ["Which accounts can be introduced first?"],
      actionItems: [{ owner: "Gilbert P.", task: "Shortlist initial introductions", due: "This week", done: false }],
      nextSteps: ["Shortlist introductions"],
      participants: [
        { name: "Sol L.", role: "Octomeet", talkPct: 60, sentiment: "Positive" },
        { name: "Gilbert P.", role: "Partner Prospect", talkPct: 40, sentiment: "Positive" },
      ],
      transcript: parseTranscript(`[00:08] Sol L.: Gilbert, great to connect — let me explain how our partner program works.`),
    }),
    mk({
      id: "m_lumio", title: "Lumio — Partnership", date: "2026-06-24",
      timeStart: "2:00 PM", timeEnd: "2:31 PM", durationMin: 31, source: "Read",
      folder: "Partnership Alignment", owner: "SL", readScore: 86, participantsCount: 2,
      summary: "Intro and alignment call about the platform and a potential partnership across the contact's network.",
      topics: ["Intro", "Platform overview", "Partnership fit"],
      keyQuestions: ["What support do partners get during deals?"],
      actionItems: [{ owner: "Nicolas Benech", task: "Send partnership deck", due: "Jun 25", done: false }],
      nextSteps: ["Send deck", "Book follow-up"],
      participants: [
        { name: "Sol L.", role: "Octomeet", talkPct: 57, sentiment: "Positive" },
        { name: "Neliana V.", role: "Partner Prospect", talkPct: 43, sentiment: "Positive" },
      ],
      transcript: parseTranscript(`[00:06] Sol L.: Hi Neliana, thanks for the time — let me walk you through the platform.`),
    }),
    mk({
      id: "m_samara", title: "Final Interview — Samara K.", date: "2026-06-24",
      timeStart: "1:30 PM", timeEnd: "1:39 PM", durationMin: 9, source: "Google Meet",
      folder: "Job Interview", owner: "NB", readScore: 91, participantsCount: 2,
      summary: "Short final interview covering motivation, fit and expectations for the role. Very positive tone.",
      topics: ["Motivation", "Role fit", "Expectations"],
      keyQuestions: ["Why does the candidate want this role?"],
      actionItems: [{ owner: "CEO", task: "Share decision by end of week", due: "Fri", done: false }],
      nextSteps: ["Decision by Friday"],
      participants: [
        { name: "CEO", role: "Interviewer", talkPct: 45, sentiment: "Positive" },
        { name: "Samara K.", role: "Candidate", talkPct: 55, sentiment: "Positive" },
      ],
      transcript: parseTranscript(`[00:05] CEO: Samara, thanks for joining — tell me what drew you to the company.`),
    }),
  ];
  return list.map((m, i) => ({ ...m, video: VIDEOS[i % VIDEOS.length] }));
}

/* ----------------------------- helpers ----------------------------- */
const daysAgo = (iso) => {
  const a = new Date(iso + "T00:00:00"), b = new Date(REF_TODAY + "T00:00:00");
  return Math.round((b - a) / 86400000);
};
const bucketOf = (iso) => {
  const d = daysAgo(iso);
  if (d <= 0) return "TODAY";
  if (d <= 7) return "THIS WEEK";
  if (d <= 31) return "THIS MONTH";
  return "EARLIER";
};
const fmtDateFull = (iso) => {
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
};
const fmtDateShort = (iso) => {
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
};
const initialsOf = (name) => (name || "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const scoreColor = (n) => (n >= 80 ? "#10B981" : n >= 70 ? "#F59E0B" : "#F43F5E");
const OWNER_COLORS = { NB: "#F472B6", AS: "#FB923C", SL: "#34D399" };
const ownerColor = (o) => OWNER_COLORS[o] || "#94A3B8";

/* --------------------------- small UI bits ------------------------- */
function PlatformBadge({ source }) {
  const map = {
    "Google Meet": { c: "#00AC47", letter: "M" },
    "Zoom": { c: "#2D8CFF", letter: "Z" },
    "Microsoft Teams": { c: "#6264A7", letter: "T" },
    "Read": { c: "#6366F1", letter: "●" },
  };
  const p = map[source] || map["Read"];
  return (
    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-[5px] border border-white bg-white shadow-sm">
      <span className="flex h-full w-full items-center justify-center rounded-[4px] text-[8px] font-bold text-white" style={{ background: p.c }}>{p.letter}</span>
    </span>
  );
}

// Preview de video con play-on-hover (inventado)
function VideoThumb({ src, source, size = 40, rounded = "rounded-lg", showBadge = true }) {
  const ref = useRef(null);
  const onEnter = () => { const v = ref.current; if (v) { try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } };
  const onLeave = () => { const v = ref.current; if (v) { try { v.pause(); } catch (e) {} } };
  return (
    <div className={"relative shrink-0 overflow-hidden bg-slate-900 " + rounded} style={{ width: size, height: size }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <video ref={ref} src={src} muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15">
        <span className="flex items-center justify-center rounded-full bg-black/45" style={{ width: size * 0.4, height: size * 0.4 }}>
          <Play size={size * 0.22} className="ml-px text-white" fill="white" />
        </span>
      </span>
      {showBadge && <PlatformBadge source={source} />}
    </div>
  );
}

function ScoreChip({ value }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5">
      <span className="relative flex h-3.5 w-3.5 items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="6" fill="none" stroke="#E2E8F0" strokeWidth="2" />
          <circle cx="7" cy="7" r="6" fill="none" stroke={scoreColor(value)} strokeWidth="2"
            strokeDasharray={2 * Math.PI * 6} strokeDashoffset={(1 - value / 100) * 2 * Math.PI * 6}
            strokeLinecap="round" transform="rotate(-90 7 7)" />
        </svg>
      </span>
      <span className="text-[11px] font-semibold text-slate-600">{value}</span>
    </span>
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
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 flex items-end gap-1.5">
        <span className="text-xl font-bold" style={{ color: scoreColor(value) }}>{value}</span>
        <span className="mb-0.5 text-[10px] text-slate-300">/100</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: value + "%", background: scoreColor(value) }} />
      </div>
    </div>
  );
}

/* ============================ MAIN APP ============================== */
const NAV = [
  { k: "add-people", label: "Add People", icon: Users },
  { k: "ask", label: "Ask Octo", icon: Sparkles },
  { k: "reports", label: "Reports", icon: ClipboardList },
  { k: "folders", label: "Folders", icon: Folder, plus: true },
  { k: "calendar", label: "Calendar", icon: Calendar },
  { k: "for-you", label: "For You", icon: Star, gap: true },
  { k: "coaching", label: "Coaching", icon: Presentation },
  { k: "recommendations", label: "Recommendations", icon: Lightbulb },
  { k: "meeting-policy", label: "Meeting Policy", icon: ShieldCheck },
  { k: "integrations", label: "Integrations", icon: LayoutGrid, gap: true },
];

export default function App() {
  const [meetings, setMeetings] = useState(null);
  const [view, setView] = useState("reports");
  const [activeId, setActiveId] = useState(null);
  const [askSeed, setAskSeed] = useState("");

  useEffect(() => {
    (async () => {
      let m = await store.get("octomeet:meetings:v1", null);
      if (!m) { m = seedMeetings(); await store.set("octomeet:meetings:v1", m); }
      setMeetings(m);
    })();
  }, []);

  const persist = async (next) => { setMeetings(next); await store.set("octomeet:meetings:v1", next); };
  const active = useMemo(() => (meetings || []).find((m) => m.id === activeId), [meetings, activeId]);
  const openMeeting = (id) => { setActiveId(id); setView("meeting"); };
  const goAsk = (q) => { setAskSeed(q || ""); setView("ask"); };

  if (!meetings) {
    return (
      <div className="rai-body flex h-screen items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="mr-2 animate-spin" size={18} /> Loading Octomeet.ai…
      </div>
    );
  }

  return (
    <div className="rai-body flex h-screen w-full overflow-hidden bg-[#F4F5FA] text-slate-800">
      <StyleInject />
      <Sidebar view={view} setView={setView} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {view === "reports" && <ReportsList meetings={meetings} onOpen={openMeeting} onUpload={() => setView("upload")} onAsk={goAsk} />}
        {view === "meeting" && active && <MeetingDetail meeting={active} onBack={() => setView("reports")} onUpdate={persist} meetings={meetings} />}
        {view === "ask" && <ChatView meetings={meetings} onOpen={openMeeting} seed={askSeed} />}
        {view === "upload" && <UploadView onSave={async (m) => { await persist([m, ...meetings]); openMeeting(m.id); }} onCancel={() => setView("reports")} />}
        {["add-people", "folders", "calendar", "for-you", "coaching", "recommendations", "meeting-policy", "integrations"].includes(view) && (
          <Placeholder section={NAV.find((n) => n.k === view)} onReports={() => setView("reports")} />
        )}
      </main>
    </div>
  );
}

/* ============================ SIDEBAR ============================== */
function Sidebar({ view, setView }) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText("https://meet-ai-three-beige.vercel.app/s/nicolas"); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };
  return (
    <aside className="flex w-60 shrink-0 flex-col rai-sidebar text-slate-300">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500">
          <span className="text-sm font-black text-white">O</span>
        </div>
        <span className="text-[16px] font-bold text-white">Octomeet.ai</span>
        <span className="ml-auto text-[11px] font-medium text-slate-500">EN</span>
      </div>
      <div className="mx-3 mb-3 flex items-center justify-between rounded-lg px-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-white"><Rocket size={13} className="text-indigo-300" /> Enterprise</span>
        <button className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200">Manage</button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {NAV.map((n) => (
          <React.Fragment key={n.k}>
            {n.gap && <div className="my-2 border-t border-white/5" />}
            <button onClick={() => setView(n.k)}
              className={"group mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition " +
                (view === n.k ? "bg-indigo-600 text-white shadow" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
              <n.icon size={16} className="shrink-0" />
              <span className="flex-1 text-left">{n.label}</span>
              {n.plus && <FolderPlus size={14} className="text-slate-500 group-hover:text-slate-300" />}
            </button>
          </React.Fragment>
        ))}
      </nav>

      <div className="border-t border-white/5 px-3 py-3">
        <button className="mb-3 flex w-full items-center gap-2 text-[13px] font-medium text-slate-300 hover:text-white">
          <PlusCircle size={16} /> Add to live meeting
        </button>
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Smart Scheduler Link <span className="text-slate-600">ⓘ</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={copyLink} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500">
              <Link2 size={12} /> {copied ? "Copied!" : "Copy link"}
            </button>
            <button className="rounded-md bg-white/10 px-2.5 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-white/15">Manage</button>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg px-1 py-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: ownerColor("NB") }}>NB</div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-medium text-white">Nicolas Benech</div>
            <div className="truncate text-[11px] text-slate-500">nicolas@octomeet.ai</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ============================ REPORTS LIST ========================= */
function FilterBtn({ label, icon: Icon }) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50">
      {Icon && <Icon size={14} className="text-slate-400" />}{label}<ChevronDown size={14} className="text-slate-400" />
    </button>
  );
}

function ReportsList({ meetings, onOpen, onUpload, onAsk }) {
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState("");
  const [tab, setTab] = useState("reports");
  const [showCrm, setShowCrm] = useState(true);

  const filtered = useMemo(
    () => [...meetings].filter((m) => !q || m.title.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.date + b.timeStart).localeCompare(a.date + a.timeStart)),
    [meetings, q]
  );
  const groups = useMemo(() => {
    const order = ["TODAY", "THIS WEEK", "THIS MONTH", "EARLIER"];
    const by = {};
    filtered.forEach((m) => { const b = bucketOf(m.date); (by[b] = by[b] || []).push(m); });
    return order.filter((o) => by[o]).map((o) => ({ label: o, items: by[o] }));
  }, [filtered]);

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-6 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <ChevronLeft size={18} className="text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900">Reports</h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) onAsk(ask.trim()); }}
          className="mb-3 flex items-center gap-2 rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 focus-within:border-indigo-400">
          <button type="button" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-400"><Globe size={15} /><ChevronDown size={13} /></button>
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask Octo anything..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          <button type="submit" className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40" disabled={!ask.trim()}>
            <Send size={15} />
          </button>
        </form>
        <div className="flex items-center justify-between">
          <div className="flex gap-5">
            {[{ k: "reports", l: "Reports" }, { k: "incomplete", l: "Incomplete" }].map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={"border-b-2 pb-2.5 text-sm font-semibold transition " + (tab === t.k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {t.l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 pb-1.5">
            <span className="flex items-center gap-1.5 text-[13px] text-slate-400"><RefreshCw size={13} /> Last refreshed at 2:52 PM</span>
            <button onClick={onUpload} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-indigo-500">
              <Upload size={15} /> Upload
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "incomplete" ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
            <ClipboardList size={36} className="mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No incomplete reports</p>
            <p className="text-xs">Meetings still processing will show up here.</p>
          </div>
        ) : (
          <>
            {showCrm && (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-indigo-50 px-4 py-3">
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">✨ NEW!</span>
                <span className="flex-1 text-sm text-slate-700">Connect your CRM to receive smart recommendations on when to advance your deals to the next stage.</span>
                <button className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-semibold text-white hover:bg-slate-800"><span className="text-orange-400">◆</span> Add Hubspot</button>
                <button className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-semibold text-white hover:bg-slate-800"><span className="text-sky-400">☁</span> Add Salesforce</button>
                <button onClick={() => setShowCrm(false)} className="text-[13px] font-medium text-slate-500 hover:text-slate-700">Dismiss</button>
              </div>
            )}

            <div className="mb-1 flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by report title..."
                  className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-indigo-400" />
              </div>
              <FilterBtn label="All Reports" icon={ClipboardList} />
              <FilterBtn label="Anytime" icon={Calendar} />
              <FilterBtn label="Type" />
              <FilterBtn label="Source" />
              <FilterBtn label="Folder" />
            </div>

            <div className="mt-4 overflow-hidden">
              <div className="grid grid-cols-[1.4fr_1.1fr_1fr_0.5fr_40px] items-center border-b border-slate-200 px-3 pb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                <div className="flex items-center gap-6"><span>Source</span><span>Report</span></div>
                <div className="flex items-center gap-1">Date &amp; Time <ArrowDown size={12} /></div>
                <div>Folders</div>
                <div>Owner</div>
                <div></div>
              </div>

              {groups.map((g) => (
                <div key={g.label}>
                  <div className="bg-slate-50/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>
                  {g.items.map((m) => (
                    <button key={m.id} onClick={() => onOpen(m.id)}
                      className="grid w-full grid-cols-[1.4fr_1.1fr_1fr_0.5fr_40px] items-center border-b border-slate-100 px-3 py-3 text-left transition hover:bg-indigo-50/40">
                      <div className="flex min-w-0 items-center gap-4">
                        <VideoThumb src={m.video} source={m.source} size={44} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">{m.title}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[12px] text-slate-400"><Users size={12} /> {m.participantsCount ?? m.participants.length}</span>
                            <ScoreChip value={m.scores.overall} />
                          </div>
                        </div>
                      </div>
                      <div className="leading-tight">
                        <div className="text-[13px] text-slate-700">{fmtDateFull(m.date)}</div>
                        <div className="text-[12px] text-slate-400">{m.timeStart} - {m.timeEnd}</div>
                      </div>
                      <div>
                        <span className="inline-flex max-w-[90%] items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[12px] text-slate-600">
                          <Folder size={12} className="shrink-0 text-indigo-400" />
                          <span className="truncate">{m.folder}</span>
                          {m.folderLocked && <Lock size={10} className="shrink-0 text-slate-400" />}
                        </span>
                      </div>
                      <div>
                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: ownerColor(m.owner) }}>{m.owner}</span>
                      </div>
                      <div className="flex justify-center"><MoreHorizontal size={16} className="text-slate-300" /></div>
                    </button>
                  ))}
                </div>
              ))}
              {!filtered.length && <div className="py-16 text-center text-sm text-slate-400">No reports match “{q}”.</div>}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ============================ PLACEHOLDER ========================== */
function Placeholder({ section, onReports }) {
  const Icon = section?.icon || ClipboardList;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500"><Icon size={26} /></div>
      <h2 className="text-xl font-bold text-slate-800">{section?.label}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        Esta sección llega en una fase próxima. Por ahora, la pantalla de <b>Reports</b> ya está funcionando.
      </p>
      <button onClick={onReports} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Ir a Reports</button>
    </div>
  );
}

/* ========================= MEETING DETAIL ========================== */
function MeetingDetail({ meeting, onBack, onUpdate, meetings }) {
  const [tab, setTab] = useState("notes");
  const [q, setQ] = useState("");

  const toggleItem = (idx) => {
    const next = meetings.map((m) => m.id === meeting.id
      ? { ...m, actionItems: m.actionItems.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)) } : m);
    onUpdate(next);
  };
  const filteredTurns = meeting.transcript.filter((t) => !q || (t.text + " " + t.speaker).toLowerCase().includes(q.toLowerCase()));
  const speakerIdx = {};
  meeting.participants.forEach((p, i) => (speakerIdx[p.name] = i));

  const TABS = [
    { k: "notes", label: "Notes", icon: FileText },
    { k: "transcript", label: "Transcript", icon: MessageSquareText },
    { k: "deepdive", label: "Deep Dive", icon: BarChart3 },
    { k: "coaching", label: "Coaching", icon: Presentation },
    { k: "highlights", label: "Highlights", icon: Sparkles },
    { k: "chapters", label: "Chapters", icon: ListChecks },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> {meeting.title}</button>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"><Download size={14} /> Download</button>
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"><Share2 size={14} /> Push to…</button>
            <button className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500"><Share2 size={14} /> Share</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-400">
          <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDateShort(meeting.date)}</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {meeting.timeStart} - {meeting.timeEnd}</span>
          <span className="flex items-center gap-1"><Video size={12} /> {meeting.source}</span>
          <span className="flex items-center gap-1"><Users size={12} /> {meeting.participants.map((p) => p.name).join(", ")}</span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-5">
        {/* video player */}
        <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm">
          <video key={meeting.id} src={meeting.video} poster="" controls preload="metadata" className="aspect-video w-full bg-black" />
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          {[{ l: "Read Score", v: meeting.scores.overall }, { l: "Engagement", v: meeting.scores.engagement }, { l: "Sentiment", v: meeting.scores.sentiment }].map((s) => (
            <div key={s.l} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.l}</div>
              <div className="mt-0.5 flex items-end gap-2">
                <span className="text-2xl font-bold text-slate-900">{s.v}</span>
                <span className="mb-1 text-[11px] font-semibold uppercase" style={{ color: scoreColor(s.v) }}>{s.v >= 80 ? "Good" : s.v >= 70 ? "Avg" : "Low"}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={"flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition " +
                (tab === t.k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {tab === "notes" && (
          <div className="space-y-5">
            <Card title="Summary" icon={Sparkles}><p className="text-sm leading-relaxed text-slate-600">{meeting.summary}</p></Card>
            <Card title="Action Items" icon={ListChecks}>
              <div className="space-y-2">
                {meeting.actionItems.map((it, i) => (
                  <div key={i} className={"flex items-center gap-3 rounded-xl border p-3 " + (it.done ? "border-slate-100 bg-slate-50" : "border-slate-200 bg-white")}>
                    <button onClick={() => toggleItem(i)} className="shrink-0">
                      {it.done ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} className="text-slate-300 hover:text-indigo-400" />}
                    </button>
                    <div className="flex-1">
                      <div className={"text-sm " + (it.done ? "text-slate-400 line-through" : "text-slate-700")}>{it.task}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{it.owner}{it.due ? " · " + it.due : ""}</div>
                    </div>
                  </div>
                ))}
                {!meeting.actionItems.length && <p className="text-sm text-slate-400">No action items detected.</p>}
              </div>
            </Card>
            <Card title="Key Questions" icon={Quote}>
              <ul className="space-y-2">
                {meeting.keyQuestions.map((qq, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600"><span className="text-indigo-400">{String(i + 1).padStart(2, "0")}</span>{qq}</li>
                ))}
                {!meeting.keyQuestions.length && <p className="text-sm text-slate-400">No key questions detected.</p>}
              </ul>
            </Card>
            <Card title="Topics" icon={Hash}>
              <div className="flex flex-wrap gap-2">
                {meeting.topics.map((t, i) => (<span key={i} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">{t}</span>))}
              </div>
            </Card>
          </div>
        )}

        {tab === "transcript" && (
          <div>
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the transcript…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div className="space-y-3">
              {filteredTurns.map((t, i) => {
                const ci = speakerIdx[t.speaker] ?? 0;
                return (
                  <div key={i} className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: SPEAKER_COLORS[ci % SPEAKER_COLORS.length] }}>{initialsOf(t.speaker)}</span>
                    <div className="flex-1 rounded-xl border border-slate-100 bg-white p-3">
                      <div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold text-slate-700">{t.speaker}</span>{t.t && <span className="text-[10px] text-slate-300">{t.t}</span>}</div>
                      <p className="text-sm leading-relaxed text-slate-600">{t.text}</p>
                    </div>
                  </div>
                );
              })}
              {!filteredTurns.length && <div className="py-10 text-center text-sm text-slate-400">No lines match “{q}”.</div>}
            </div>
          </div>
        )}

        {tab === "deepdive" && (
          <div className="space-y-5">
            <Card title="Participation (talk time)" icon={Users}>
              <TalkRibbon participants={meeting.participants} />
              <div className="mt-4 space-y-2">
                {meeting.participants.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-3 w-3 rounded-sm" style={{ background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }} />
                    <span className="flex-1 text-slate-600">{p.name}</span>
                    <span className="text-slate-400">{p.talkPct}%</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Scores" icon={BarChart3}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <ScorePill label="Read Score" value={meeting.scores.overall} />
                <ScorePill label="Engagement" value={meeting.scores.engagement} />
                <ScorePill label="Sentiment" value={meeting.scores.sentiment} />
                <ScorePill label="Balance" value={meeting.scores.balance} />
                <ScorePill label="Clarity" value={meeting.scores.clarity} />
              </div>
            </Card>
            <Card title="Read Score over time" icon={Activity}>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={meeting.sentimentTimeline.map((v, i) => ({ i, v: Math.round(50 + v * 45) }))} margin={{ left: -20, right: 6, top: 6 }}>
                  <defs><linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366F1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366F1" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="i" hide /><YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#CBD5E1" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
                  <Area type="monotone" dataKey="v" stroke="#6366F1" strokeWidth={2.5} fill="url(#gScore)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {tab === "coaching" && (
          <div className="space-y-5">
            <Card title="Talking Pace" icon={Activity}>
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold text-slate-900">{140 + (meeting.scores.overall % 30)}</span>
                <span className="text-sm text-slate-400">wpm · recommended range 130–175</span>
              </div>
            </Card>
            <div className="grid gap-5 md:grid-cols-2">
              <Card title="Clarity" icon={Sparkles}>
                <Metric label="Filler words" value={(meeting.scores.overall % 5) + "%"} ok />
                <Metric label="Talking pace" value="In range" ok />
              </Card>
              <Card title="Impact" icon={Target}>
                <Metric label="Charisma" value={meeting.scores.engagement} ok={meeting.scores.engagement >= 80} />
                <Metric label="Bias" value={meeting.scores.sentiment} ok={meeting.scores.sentiment >= 80} />
                <Metric label="Questions asked" value={meeting.keyQuestions.length} ok />
              </Card>
            </div>
            <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">
              💡 El coaching detallado (clarity / inclusion / impact por hablante, con histórico para training de empleados) llega en una fase próxima.
            </div>
          </div>
        )}

        {tab === "highlights" && (
          <div className="space-y-3">
            {meeting.actionItems.map((it, i) => (
              <div key={"a" + i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <VideoThumb src={meeting.video} source={meeting.source} size={56} showBadge={false} />
                <div className="flex-1">
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Action Item</span>
                  <p className="mt-1 text-sm text-slate-700">{it.task}</p>
                </div>
              </div>
            ))}
            {meeting.keyQuestions.map((qq, i) => (
              <div key={"q" + i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <VideoThumb src={meeting.video} source={meeting.source} size={56} showBadge={false} />
                <div className="flex-1">
                  <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Key Question</span>
                  <p className="mt-1 text-sm text-slate-700">{qq}</p>
                </div>
              </div>
            ))}
            {meeting.topics.map((t, i) => (
              <div key={"t" + i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <VideoThumb src={meeting.video} source={meeting.source} size={56} showBadge={false} />
                <div className="flex-1">
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">Topic</span>
                  <p className="mt-1 text-sm text-slate-700">{t}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "chapters" && (
          <div className="space-y-2">
            {meeting.topics.length ? meeting.topics.map((t, i) => (
              <button key={i} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-200">
                <VideoThumb src={meeting.video} source={meeting.source} size={48} showBadge={false} />
                <span className="text-[12px] font-mono text-indigo-500">{String(i).padStart(2, "0")}:{String((i * 7) % 60).padStart(2, "0")}</span>
                <span className="text-sm font-medium text-slate-700">{t}</span>
              </button>
            )) : <p className="text-sm text-slate-400">No chapters detected.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={"flex items-center gap-1.5 text-sm font-semibold " + (ok ? "text-emerald-600" : "text-amber-600")}>
        {value} {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      </span>
    </div>
  );
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">{Icon && <Icon size={15} className="text-indigo-500" />}<h3 className="text-sm font-bold text-slate-900">{title}</h3></div>
      {children}
    </div>
  );
}

/* ============================ ASK OCTO (chat) ===================== */
function ChatView({ meetings, onOpen, seed }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "Hi — I've read every meeting in your workspace. Ask me anything across all your reports: action items, what someone said, risks, decisions, who committed to what.", refs: [] }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const sentSeed = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const buildContext = (question) => {
    const kw = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const scored = meetings.map((m) => {
      const hay = (m.title + " " + m.summary + " " + m.topics.join(" ") + " " + m.transcript.map((t) => t.text).join(" ")).toLowerCase();
      return { m, score: kw.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0) };
    });
    const top = scored.sort((a, b) => b.score - a.score).slice(0, 2).map((s) => s.m.id);
    return meetings.map((m) => {
      const ai = m.actionItems.map((i) => `- [${i.done ? "x" : " "}] ${i.task} (${i.owner})`).join("\n");
      let block = `### ${m.title} — ${fmtDateShort(m.date)} (${m.source})\nSummary: ${m.summary}\nRead Score: ${m.scores.overall}.\nAction items:\n${ai}`;
      if (top.includes(m.id)) block += `\nTranscript:\n` + m.transcript.map((t) => `${t.speaker}: ${t.text}`).join("\n").slice(0, 2200);
      return block;
    }).join("\n\n");
  };

  const send = async (textArg) => {
    const question = (textArg ?? input).trim();
    if (!question || busy) return;
    setInput("");
    const history = [...msgs, { role: "user", text: question }];
    setMsgs(history); setBusy(true);
    try {
      const ctx = buildContext(question);
      const sys = "You are Octomeet.ai, a meeting-intelligence assistant. Answer ONLY from the meeting data below. Be concise, specific and actionable. When you use a meeting, mention its name. If the answer isn't in the data, say so plainly.\n\n=== MEETING DATA ===\n" + ctx;
      const apiMsgs = history.filter((m) => m.role === "user" || m.role === "assistant").slice(-6).map((m) => ({ role: m.role, content: m.text }));
      const ans = await callClaude(apiMsgs, sys);
      const refs = meetings.filter((m) => ans.toLowerCase().includes(m.title.toLowerCase())).map((m) => m.id);
      setMsgs((p) => [...p, { role: "assistant", text: ans, refs }]);
    } catch (e) {
      setMsgs((p) => [...p, { role: "assistant", text: "I couldn't reach the analysis engine. Make sure ANTHROPIC_API_KEY is set, then try again.", refs: [] }]);
    } finally { setBusy(false); }
  };

  useEffect(() => { if (seed && !sentSeed.current) { sentSeed.current = true; send(seed); } /* eslint-disable-next-line */ }, [seed]);

  const suggestions = ["What are all my open action items?", "Summarize the Vertex Retail meeting", "Who am I meeting about partnerships?", "When is the product demo scheduled?"];

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-6">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500"><Sparkles size={17} className="text-white" /></div>
        <div><h1 className="text-lg font-bold text-slate-900">Ask Octo</h1><p className="text-[11px] uppercase tracking-wide text-slate-400">Across {meetings.length} reports</p></div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {msgs.map((m, i) => (
          <div key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={"max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed " + (m.role === "user" ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700 shadow-sm")}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.refs && m.refs.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                  {m.refs.map((id) => { const mt = meetings.find((x) => x.id === id); return mt ? (
                    <button key={id} onClick={() => onOpen(id)} className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"><FileText size={11} /> {mt.title}</button>
                  ) : null; })}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 shadow-sm"><Loader2 size={14} className="animate-spin text-indigo-500" /> Reading your meetings…</div></div>}
        <div ref={endRef} />
      </div>
      {msgs.length <= 1 && !busy && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (<button key={s} onClick={() => send(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700">{s}</button>))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask Octo anything…" className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none" />
        <button onClick={() => send()} disabled={busy || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white transition disabled:opacity-40"><Send size={16} /></button>
      </div>
    </div>
  );
}

/* ============================ UPLOAD ============================== */
const EXAMPLE_TRANSCRIPT =
`[00:09] Nicolas Benech: Thanks for joining. What's the biggest manual task slowing your team down right now?
[00:24] Jordan Vela: Honestly, support ticket triage. Every email comes in raw and someone has to read it, tag it, and route it.
[00:48] Nicolas Benech: That's a perfect candidate. We can have AI classify each ticket, set priority, and auto-route — humans only touch the edge cases.
[01:25] Nicolas Benech: We'd train on your historical tickets and start in suggest-only mode until trust is high, then flip to auto.
[02:05] Jordan Vela: I like the phased approach. I'll export a month of tickets by Friday. Let's get a proposal moving.`;

function UploadView({ onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(REF_TODAY);
  const [source, setSource] = useState("Google Meet");
  const [folder, setFolder] = useState("Sales Call");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const analyze = async () => {
    if (!raw.trim()) { setErr("Paste a transcript first."); return; }
    setErr(""); setBusy(true);
    try {
      const sys = "You are a meeting-intelligence analyst. Read the transcript and return ONLY a JSON object (no markdown) with this shape:\n" +
        `{"summary": string (2-3 sentences), "topics": string[] (max 5), "keyQuestions": string[] (max 4), "actionItems": [{"owner": string, "task": string, "due": string}] (max 6), "nextSteps": string[] (max 3), "participants": [{"name": string, "role": string, "talkPct": integer, "sentiment": "Positive"|"Neutral"|"Negative"}], "scores": {"overall": int, "engagement": int, "sentiment": int, "balance": int, "clarity": int} (0-100), "sentimentLabel": "Positive"|"Neutral"|"Negative", "sentimentTimeline": number[] (8 values -1..1)}.\n` +
        "Infer speaker names from the transcript. Keep strings short.";
      const out = await callClaude([{ role: "user", content: "Title: " + (title || "Untitled meeting") + "\n\nTranscript:\n" + raw }], sys);
      const parsed = extractJSON(out);
      const turns = parseTranscript(raw);
      const meeting = mk({
        id: "m" + Date.now(), title: title || "Untitled meeting", date, source, folder,
        timeStart: "—", timeEnd: "—", owner: "NB", readScore: parsed.scores?.overall ?? 80,
        video: VIDEOS[Math.floor(Math.random() * VIDEOS.length)],
        participantsCount: (parsed.participants || []).length || 2,
        summary: parsed.summary || "", topics: parsed.topics || [], keyQuestions: parsed.keyQuestions || [],
        actionItems: (parsed.actionItems || []).map((a) => ({ ...a, done: false })), nextSteps: parsed.nextSteps || [],
        participants: parsed.participants || [], scores: parsed.scores || { overall: 75, engagement: 75, sentiment: 75, balance: 75, clarity: 75 },
        sentimentLabel: parsed.sentimentLabel || "Neutral", sentimentTimeline: parsed.sentimentTimeline || [0, 0, 0, 0, 0, 0, 0, 0],
        transcript: turns,
      });
      onSave(meeting);
    } catch (e) { setErr("Couldn't analyze that transcript. Check ANTHROPIC_API_KEY and try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-7">
        <button onClick={onCancel} className="mb-5 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={15} /> Back to Reports</button>
        <h1 className="text-2xl font-bold text-slate-900">Upload a meeting</h1>
        <p className="mt-1 text-sm text-slate-500">Paste a transcript and Octomeet.ai will generate the report — summary, action items, key questions, scores — with AI.</p>
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-slate-400">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Acme Corp — Discovery" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-slate-400">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-slate-400">Source</label>
              <div className="flex flex-wrap gap-2">{["Google Meet", "Zoom", "Microsoft Teams", "Read"].map((p) => (
                <button key={p} onClick={() => setSource(p)} className={"rounded-xl border px-3 py-2 text-sm transition " + (source === p ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>{p}</button>))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-slate-400">Folder</label>
              <div className="flex flex-wrap gap-2">{["Sales Call", "Partnership Alignment", "Job Interview", "One-on-One"].map((p) => (
                <button key={p} onClick={() => setFolder(p)} className={"rounded-xl border px-3 py-2 text-sm transition " + (folder === p ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>{p}</button>))}
              </div>
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-[10px] uppercase tracking-wider text-slate-400">Transcript</label>
              <button onClick={() => { setRaw(EXAMPLE_TRANSCRIPT); setTitle(title || "Vela Support — Discovery"); }} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800">Load example</button>
            </div>
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={9} placeholder={"Format:\n[00:12] Name: what they said\n[00:30] Other Name: their reply"} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-xs leading-relaxed outline-none focus:border-indigo-400" />
          </div>
          {err && <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700"><AlertTriangle size={15} /> {err}</div>}
          <button onClick={analyze} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-50">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Analyzing with AI…</> : <><Zap size={16} /> Generate report</>}
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
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      .rai-body, .rai-body * { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
      .rai-sidebar { background: #161531; }
      *::-webkit-scrollbar { width: 8px; height: 8px; }
      *::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
      *::-webkit-scrollbar-track { background: transparent; }
    `}</style>
  );
}
