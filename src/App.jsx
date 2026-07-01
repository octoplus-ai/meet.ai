import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Users, Sparkles, ClipboardList, FolderPlus, Folder, Calendar, Star,
  Presentation, Lightbulb, ShieldCheck, LayoutGrid, PlusCircle, Link2, Globe,
  Search, ChevronDown, RefreshCw, Upload, Lock, MoreHorizontal, ArrowDown,
  ArrowLeft, Send, Loader2, CheckCircle2, Circle, Clock, Video, Hash, Target,
  ListChecks, BarChart3, MessageSquareText, FileText, Quote, AlertTriangle,
  Zap, Activity, Rocket, ChevronLeft, Download, Share2, Play, Pause, Maximize2, Volume2, VolumeX, PictureInPicture2,
  Check, Mail, Plus, Trash2, CalendarCheck, PanelRightClose, Bell, Settings, Type, Copy, Pencil,
  HelpCircle, LogOut, ChevronRight, X, ThumbsUp, SlidersHorizontal, KeyRound,
  ChevronsDownUp, ChevronsUpDown, Eye, ChevronUp, MinusCircle, MoreVertical,
  Captions, AudioLines, ImagePlus, Paperclip,
} from "lucide-react";
import { THEME_LIST, getTheme, coerceDeck, deckHTML } from "./slides/deck.js";
import { exportPptx } from "./slides/pptx.js";
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Octomeet.ai - Meeting Intelligence (Read.ai-style clone - Phase 0) */
/* ------------------------------------------------------------------ */

const SPEAKER_COLORS = ["#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#F43F5E", "#14B8A6", "#8B5CF6", "#EC4899"];
const REF_TODAY = "2026-06-26";

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

const SEED_RECENT = [
  { bucket: "LAST WEEK", items: ["Which brands do they currently use?", "How is the sales vertical structured?", "Feedback recap - Acme & Vertex"] },
  { bucket: "LAST 30 DAYS", items: ["Which AI tools does he use?", "What are the two brands mentioned?", "What is the status of this deal?", "Maria Lopez"] },
  { bucket: "OLDER", items: ["Who participated? List names", "Northwind intro and next steps", "Pricing tiers discussed", "Pilot timeline"] },
];

/* ------------------------------ i18n ------------------------------- */
const LANGS = [
  { code: "en", label: "English" }, { code: "es", label: "Español" }, { code: "pt", label: "Português" },
  { code: "fr", label: "Français" }, { code: "hi", label: "हिन्दी" }, { code: "it", label: "Italiano" },
  { code: "ru", label: "Русский" }, { code: "de", label: "Deutsch" }, { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" }, { code: "nl", label: "Nederlands" }, { code: "da", label: "Dansk" },
  { code: "fi", label: "Suomi" }, { code: "sv", label: "Svenska" }, { code: "no", label: "Norsk" },
  { code: "ca", label: "Català" }, { code: "ko", label: "한국어" }, { code: "pl", label: "Polski" },
  { code: "uk", label: "Українська" }, { code: "he", label: "עברית", rtl: true },
];
const LCODE = { en: "EN", es: "ES", pt: "PT", fr: "FR", hi: "HI", it: "IT", ru: "RU", de: "DE", zh: "中", ja: "あ", nl: "NL", da: "DA", fi: "FI", sv: "SV", no: "NO", ca: "CA", ko: "한", pl: "PL", uk: "UK", he: "ע" };
const KEYS = ["addPeople","ask","reports","folders","calendar","forYou","coaching","recommendations","meetingPolicy","integrations","enterprise","manage","addToLive","smartScheduler","copyLink","copied","askAnything","reportsTab","incompleteTab","lastRefreshed","upload","filterByTitle","allReports","anytime","type","source","folder","owner","report","dateTime","today","thisWeek","thisMonth","earlier","plansPricing"];
const _t = {
  en: ["Add People","Ask Octo","Reports","Folders","Calendar","For You","Coaching","Recommendations","Meeting Policy","Integrations","Enterprise","Manage","Add to live meeting","Smart Scheduler Link","Copy link","Copied!","Ask Octo anything...","Reports","Incomplete","Last refreshed at 3:00 PM","Upload","Filter by report title...","All Reports","Anytime","Type","Source","Folder","Owner","Report","Date & Time","TODAY","THIS WEEK","THIS MONTH","EARLIER","Plans & Pricing"],
  es: ["Agregar personas","Preguntar a Octo","Reportes","Carpetas","Calendario","Para ti","Coaching","Recomendaciones","Política de reuniones","Integraciones","Enterprise","Gestionar","Agregar a reunión en vivo","Enlace Smart Scheduler","Copiar enlace","¡Copiado!","Pregúntale lo que sea a Octo...","Reportes","Incompletos","Actualizado a las 3:00 PM","Subir","Filtrar por título...","Todos los reportes","Cualquier fecha","Tipo","Origen","Carpeta","Dueño","Reporte","Fecha y hora","HOY","ESTA SEMANA","ESTE MES","ANTERIORES","Planes y precios"],
  pt: ["Adicionar pessoas","Perguntar ao Octo","Relatórios","Pastas","Calendário","Para você","Coaching","Recomendações","Política de reuniões","Integrações","Enterprise","Gerenciar","Adicionar à reunião ao vivo","Link do Smart Scheduler","Copiar link","Copiado!","Pergunte qualquer coisa ao Octo...","Relatórios","Incompletos","Atualizado às 15:00","Enviar","Filtrar por título...","Todos os relatórios","Qualquer data","Tipo","Origem","Pasta","Dono","Relatório","Data e hora","HOJE","ESTA SEMANA","ESTE MÊS","ANTERIORES","Planos e preços"],
  fr: ["Ajouter des personnes","Demander à Octo","Rapports","Dossiers","Calendrier","Pour vous","Coaching","Recommandations","Politique de réunion","Intégrations","Enterprise","Gérer","Ajouter à une réunion en direct","Lien Smart Scheduler","Copier le lien","Copié !","Demandez ce que vous voulez à Octo...","Rapports","Incomplets","Actualisé à 15:00","Importer","Filtrer par titre...","Tous les rapports","À tout moment","Type","Source","Dossier","Propriétaire","Rapport","Date et heure","AUJOURD'HUI","CETTE SEMAINE","CE MOIS-CI","PLUS ANCIENS","Forfaits et tarifs"],
  hi: ["लोग जोड़ें","Octo से पूछें","रिपोर्ट्स","फ़ोल्डर","कैलेंडर","आपके लिए","कोचिंग","सुझाव","मीटिंग नीति","इंटीग्रेशन","Enterprise","प्रबंधित करें","लाइव मीटिंग में जोड़ें","Smart Scheduler लिंक","लिंक कॉपी करें","कॉपी हो गया!","Octo से कुछ भी पूछें...","रिपोर्ट्स","अधूरी","3:00 PM पर अपडेट किया","अपलोड","शीर्षक से फ़िल्टर करें...","सभी रिपोर्ट्स","कभी भी","प्रकार","स्रोत","फ़ोल्डर","मालिक","रिपोर्ट","दिनांक और समय","आज","इस सप्ताह","इस महीने","पुराने","प्लान और कीमतें"],
  it: ["Aggiungi persone","Chiedi a Octo","Report","Cartelle","Calendario","Per te","Coaching","Raccomandazioni","Politica riunioni","Integrazioni","Enterprise","Gestisci","Aggiungi a riunione dal vivo","Link Smart Scheduler","Copia link","Copiato!","Chiedi qualsiasi cosa a Octo...","Report","Incompleti","Aggiornato alle 15:00","Carica","Filtra per titolo...","Tutti i report","Sempre","Tipo","Origine","Cartella","Proprietario","Report","Data e ora","OGGI","QUESTA SETTIMANA","QUESTO MESE","PRECEDENTI","Piani e prezzi"],
  ru: ["Добавить людей","Спросить Octo","Отчёты","Папки","Календарь","Для вас","Коучинг","Рекомендации","Политика встреч","Интеграции","Enterprise","Управление","Добавить к встрече","Ссылка Smart Scheduler","Копировать ссылку","Скопировано!","Спросите Octo о чём угодно...","Отчёты","Незавершённые","Обновлено в 15:00","Загрузить","Фильтр по названию...","Все отчёты","Любое время","Тип","Источник","Папка","Владелец","Отчёт","Дата и время","СЕГОДНЯ","НА ЭТОЙ НЕДЕЛЕ","В ЭТОМ МЕСЯЦЕ","РАНЕЕ","Тарифы и цены"],
  de: ["Personen hinzufügen","Octo fragen","Berichte","Ordner","Kalender","Für dich","Coaching","Empfehlungen","Meeting-Richtlinie","Integrationen","Enterprise","Verwalten","Zu Live-Meeting hinzufügen","Smart-Scheduler-Link","Link kopieren","Kopiert!","Frag Octo alles...","Berichte","Unvollständig","Aktualisiert um 15:00","Hochladen","Nach Titel filtern...","Alle Berichte","Jederzeit","Typ","Quelle","Ordner","Besitzer","Bericht","Datum & Uhrzeit","HEUTE","DIESE WOCHE","DIESEN MONAT","FRÜHER","Pläne & Preise"],
  zh: ["添加成员","问 Octo","报告","文件夹","日历","为你推荐","辅导","建议","会议政策","集成","Enterprise","管理","添加到实时会议","Smart Scheduler 链接","复制链接","已复制！","向 Octo 提任何问题...","报告","未完成","更新于 15:00","上传","按标题筛选...","所有报告","任何时间","类型","来源","文件夹","所有者","报告","日期和时间","今天","本周","本月","更早","套餐与价格"],
  ja: ["メンバーを追加","Octoに聞く","レポート","フォルダ","カレンダー","あなたへ","コーチング","おすすめ","会議ポリシー","連携","Enterprise","管理","ライブ会議に追加","Smart Schedulerリンク","リンクをコピー","コピーしました！","Octoに何でも聞いてください...","レポート","未完了","15:00 に更新","アップロード","タイトルで絞り込み...","すべてのレポート","いつでも","種類","ソース","フォルダ","オーナー","レポート","日時","今日","今週","今月","以前","プランと料金"],
  nl: ["Mensen toevoegen","Vraag Octo","Rapporten","Mappen","Agenda","Voor jou","Coaching","Aanbevelingen","Vergaderbeleid","Integraties","Enterprise","Beheren","Aan live-meeting toevoegen","Smart Scheduler-link","Link kopiëren","Gekopieerd!","Vraag Octo alles...","Rapporten","Onvolledig","Bijgewerkt om 15:00","Uploaden","Filter op titel...","Alle rapporten","Altijd","Type","Bron","Map","Eigenaar","Rapport","Datum en tijd","VANDAAG","DEZE WEEK","DEZE MAAND","EERDER","Abonnementen en prijzen"],
  da: ["Tilføj personer","Spørg Octo","Rapporter","Mapper","Kalender","Til dig","Coaching","Anbefalinger","Mødepolitik","Integrationer","Enterprise","Administrer","Føj til live-møde","Smart Scheduler-link","Kopiér link","Kopieret!","Spørg Octo om alt...","Rapporter","Ufuldstændige","Opdateret kl. 15:00","Upload","Filtrér efter titel...","Alle rapporter","Når som helst","Type","Kilde","Mappe","Ejer","Rapport","Dato og tid","I DAG","DENNE UGE","DENNE MÅNED","TIDLIGERE","Abonnementer og priser"],
  fi: ["Lisää henkilöitä","Kysy Octolta","Raportit","Kansiot","Kalenteri","Sinulle","Valmennus","Suositukset","Kokouskäytäntö","Integraatiot","Enterprise","Hallitse","Lisää live-kokoukseen","Smart Scheduler -linkki","Kopioi linkki","Kopioitu!","Kysy Octolta mitä vain...","Raportit","Keskeneräiset","Päivitetty klo 15:00","Lataa","Suodata otsikolla...","Kaikki raportit","Milloin tahansa","Tyyppi","Lähde","Kansio","Omistaja","Raportti","Päivä ja aika","TÄNÄÄN","TÄLLÄ VIIKOLLA","TÄSSÄ KUUSSA","AIEMMIN","Paketit ja hinnat"],
  sv: ["Lägg till personer","Fråga Octo","Rapporter","Mappar","Kalender","För dig","Coachning","Rekommendationer","Mötespolicy","Integrationer","Enterprise","Hantera","Lägg till i livemöte","Smart Scheduler-länk","Kopiera länk","Kopierad!","Fråga Octo vad som helst...","Rapporter","Ofullständiga","Uppdaterad 15:00","Ladda upp","Filtrera efter titel...","Alla rapporter","När som helst","Typ","Källa","Mapp","Ägare","Rapport","Datum och tid","IDAG","DENNA VECKA","DENNA MÅNAD","TIDIGARE","Planer och priser"],
  no: ["Legg til personer","Spør Octo","Rapporter","Mapper","Kalender","For deg","Coaching","Anbefalinger","Møtepolicy","Integrasjoner","Enterprise","Administrer","Legg til i direktemøte","Smart Scheduler-lenke","Kopier lenke","Kopiert!","Spør Octo om hva som helst...","Rapporter","Ufullstendige","Oppdatert 15:00","Last opp","Filtrer etter tittel...","Alle rapporter","Når som helst","Type","Kilde","Mappe","Eier","Rapport","Dato og tid","I DAG","DENNE UKEN","DENNE MÅNEDEN","TIDLIGERE","Planer og priser"],
  ca: ["Afegeix persones","Pregunta a Octo","Informes","Carpetes","Calendari","Per a tu","Coaching","Recomanacions","Política de reunions","Integracions","Enterprise","Gestiona","Afegeix a reunió en directe","Enllaç Smart Scheduler","Copia l'enllaç","Copiat!","Pregunta qualsevol cosa a Octo...","Informes","Incomplets","Actualitzat a les 15:00","Puja","Filtra per títol...","Tots els informes","Sempre","Tipus","Font","Carpeta","Propietari","Informe","Data i hora","AVUI","AQUESTA SETMANA","AQUEST MES","ANTERIORS","Plans i preus"],
  ko: ["사람 추가","Octo에게 질문","리포트","폴더","캘린더","회원님을 위한","코칭","추천","회의 정책","연동","Enterprise","관리","실시간 회의에 추가","Smart Scheduler 링크","링크 복사","복사됨!","Octo에게 무엇이든 물어보세요...","리포트","미완료","오후 3:00에 업데이트됨","업로드","제목으로 필터...","모든 리포트","언제든지","유형","소스","폴더","소유자","리포트","날짜 및 시간","오늘","이번 주","이번 달","이전","요금제 및 가격"],
  pl: ["Dodaj osoby","Zapytaj Octo","Raporty","Foldery","Kalendarz","Dla Ciebie","Coaching","Rekomendacje","Zasady spotkań","Integracje","Enterprise","Zarządzaj","Dodaj do spotkania na żywo","Link Smart Scheduler","Kopiuj link","Skopiowano!","Zapytaj Octo o cokolwiek...","Raporty","Niekompletne","Zaktualizowano o 15:00","Prześlij","Filtruj po tytule...","Wszystkie raporty","Kiedykolwiek","Typ","Źródło","Folder","Właściciel","Raport","Data i godzina","DZIŚ","W TYM TYGODNIU","W TYM MIESIĄCU","WCZEŚNIEJ","Plany i ceny"],
  uk: ["Додати людей","Запитати Octo","Звіти","Папки","Календар","Для вас","Коучинг","Рекомендації","Політика зустрічей","Інтеграції","Enterprise","Керувати","Додати до онлайн-зустрічі","Посилання Smart Scheduler","Копіювати посилання","Скопійовано!","Запитайте Octo про що завгодно...","Звіти","Незавершені","Оновлено о 15:00","Завантажити","Фільтр за назвою...","Усі звіти","Будь-коли","Тип","Джерело","Папка","Власник","Звіт","Дата й час","СЬОГОДНІ","ЦЬОГО ТИЖНЯ","ЦЬОГО МІСЯЦЯ","РАНІШЕ","Плани та ціни"],
  he: ["הוסף אנשים","שאל את Octo","דוחות","תיקיות","יומן","בשבילך","אימון","המלצות","מדיניות פגישות","אינטגרציות","Enterprise","ניהול","הוסף לפגישה חיה","קישור Smart Scheduler","העתק קישור","הועתק!","שאל את Octo כל דבר...","דוחות","לא הושלמו","עודכן ב-15:00","העלה","סנן לפי כותרת...","כל הדוחות","בכל זמן","סוג","מקור","תיקייה","בעלים","דוח","תאריך ושעה","היום","השבוע","החודש","קודם","תוכניות ומחירים"],
};
const TR = Object.fromEntries(Object.entries(_t).map(([lng, arr]) => [lng, Object.fromEntries(KEYS.map((k, i) => [k, arr[i]]))]));
const isRTL = (code) => !!(LANGS.find((l) => l.code === code) || {}).rtl;

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

const POLICY_KEY = "octomeet:meeting-policy:v1";
// Synchronous read of the configured notetaker display name (used when launching bots).
function notetakerName() {
  try { const v = JSON.parse(window.localStorage.getItem(POLICY_KEY) || "null"); return (v && v.notetakerName) || "OctoMeet AI"; } catch { return "OctoMeet AI"; }
}

/* ---------------------------- Claude API --------------------------- */
async function callClaude(messages, system) {
  const res = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, system, messages }),
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
// Does the text before a colon look like a speaker label (a name or "Speaker 1")?
// Accepts digits ("Speaker 1"), long/multi-part names, "(External)" tags - but rejects
// sentence colons ("the ratio is 3:1", "Note: ...") so transcript lines parse correctly.
function looksLikeSpeaker(s) {
  if (!s || s.length > 48) return false;
  if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\-]* ?\d{1,3}$/.test(s)) return true;            // "Speaker 1", "Guest2"
  if (/^[A-Za-zÀ-ÿ'.\-]+(?:[ ][A-Za-zÀ-ÿ'.()\-]+){0,6}$/.test(s)) return true;  // real names, incl. long/multi-part
  return false;
}

function parseTranscript(raw) {
  const lines = (raw || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const turns = [];
  for (const line of lines) {
    const tm = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
    let t = "", rest = line;
    if (tm) { t = tm[1]; rest = tm[2]; }
    // Anchor on the FIRST colon and validate the left side as a speaker label. This
    // handles "Speaker 1:" (Recall's fallback for unresolved guests) and long names,
    // which the old fixed-width letters-only regex silently dropped (collapsing the
    // whole transcript into one turn).
    const ci = rest.indexOf(":");
    let speaker = null, body = null;
    if (ci > 0) {
      const left = rest.slice(0, ci).trim();
      const right = rest.slice(ci + 1).trim();
      if (right && looksLikeSpeaker(left)) { speaker = left; body = right; }
    }
    if (speaker) turns.push({ t, at: tsToSeconds(t), speaker, text: body });
    else if (turns.length) turns[turns.length - 1].text += " " + rest;
    else turns.push({ t, at: tsToSeconds(t), speaker: "Speaker", text: rest });
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
      id: "m_vertex", title: "Vertex Retail - Partnership", date: "2026-06-25",
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
[00:21] Alex Carter: All good - I'm based in Florida, so we're in a similar time zone.
[01:22] Nicolas Benech: Great. So at a high level, we take the operations work teams were doing manually and use AI to improve all of it - prioritizing communication, task management, audits, inventory and KPI insights across mobile and desktop.
[02:55] Nicolas Benech: We work with more than a hundred locations across several regions, and now we're opening this market through partners.
[08:20] Alex Carter: And what would my role be - how would responsibilities be divided?
[08:24] Nicolas Benech: Local partners open doors and make introductions; we handle pitching, POCs, integrations and closing, and partners earn a share of the subscription revenue for the deals they introduce.
[17:28] Alex Carter: When can we schedule a demo?
[17:58] Nicolas Benech: Let's do a 30-minute demo Tuesday at 9 a.m. Eastern. I'll book it.
[18:52] Nicolas Benech: Perfect. Thanks a lot for the time and for connecting.`
      ),
    }),
    mk({
      id: "m_acme", title: "Acme Corp - Intro Call", date: "2026-06-26",
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
[01:20] Nicolas Benech: Perfect - we centralize operations with AI: communication, tasks, audits, inventory and KPIs. Partners open doors and we close.`
      ),
    }),
    mk({
      id: "m_northwind", title: "Northwind - Product Demo", date: "2026-06-26",
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
[00:45] Jordan Vela: Please do - I'm most interested in the audit workflows.
[01:10] Nicolas Benech: Great, that's one of our strongest features. Teams submit photos and AI scores compliance automatically.`
      ),
    }),
    mk({
      id: "m_daniela", title: "Candidate Interview - Daniela R.", date: "2026-06-25",
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
[00:30] Daniela R.: Sure - I've spent the last few years in operations and analytics.`
      ),
    }),
    mk({
      id: "m_daniel", title: "Weekly 1:1 - Daniel M.", date: "2026-06-25",
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
      transcript: parseTranscript(`[00:05] Nicolas Benech: Quick sync - what's top of your list this week?`),
    }),
    mk({
      id: "m_globex", title: "Globex - Sales Call", date: "2026-06-24",
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
      transcript: parseTranscript(`[00:10] Anita S.: Thanks everyone - let's start with your biggest operational headaches today.`),
    }),
    mk({
      id: "m_initech", title: "Initech - Partnership", date: "2026-06-24",
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
      transcript: parseTranscript(`[00:08] Sol L.: Gilbert, great to connect - let me explain how our partner program works.`),
    }),
    mk({
      id: "m_lumio", title: "Lumio - Partnership", date: "2026-06-24",
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
      transcript: parseTranscript(`[00:06] Sol L.: Hi Neliana, thanks for the time - let me walk you through the platform.`),
    }),
    mk({
      id: "m_samara", title: "Final Interview - Samara K.", date: "2026-06-24",
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
      transcript: parseTranscript(`[00:05] CEO: Samara, thanks for joining - tell me what drew you to the company.`),
    }),
  ];
  return list.map((m, i) => ({ ...m, video: VIDEOS[i % VIDEOS.length] }));
}

// Adapt a real meeting+report row from Supabase into the UI meeting shape.
const hhmm = (iso) => { try { return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""; } catch { return ""; } };
function statusSummary(status) {
  switch (status) {
    case "scheduled": return "🗓️ OctoMeet is scheduled to join this meeting and will start recording automatically at the start time.";
    case "joining": return "🔄 OctoMeet is joining the meeting now. Admit it from the waiting room to start recording.";
    case "in_call": return "🟡 OctoMeet is in the meeting. Recording will begin once allowed.";
    case "recording": return "🔴 OctoMeet is recording live. Your AI report will appear here automatically when the meeting ends.";
    case "processing": return "⏳ Meeting ended - generating your AI report from the transcript. This page updates automatically.";
    case "error": return "⚠️ The notetaker couldn't complete this meeting. Check the meeting link or permissions and try again.";
    default: return "";
  }
}
// Detect the meeting platform from its URL so the preview badge shows the real medium
// (Google Meet / Zoom / Teams) like Read.ai - not the generic OctoMeet icon.
function platformFromUrl(url) {
  if (!url) return null;
  if (/meet\.google\.com/i.test(url)) return "Google Meet";
  if (/zoom\.us|zoom\.com/i.test(url)) return "Zoom";
  if (/teams\.(microsoft|live)\.com|teams\.microsoft/i.test(url)) return "Microsoft Teams";
  return null;
}
// "mm:ss" / "h:mm:ss" → seconds (for seeking the video to a highlight's moment).
function tsToSeconds(t) {
  if (typeof t !== "string" || !t.trim()) return null;
  const p = t.trim().split(":").map((n) => parseInt(n, 10));
  if (p.some((n) => Number.isNaN(n))) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  if (p.length === 1) return p[0];
  return null;
}
function adaptReal(m) {
  // PostgREST may embed reports as an array (to-many) or a single object (to-one,
  // because reports.meeting_id is unique). Handle both so the report is never lost.
  const r = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
  const sc = r.scores || {};
  const done = m.status === "done";
  const engagement = sc.engagement || 0, sentiment = sc.sentiment || 0, clarity = sc.clarity || 0;
  let overall = r.read_score || sc.overall || 0;
  const start = m.start_time || m.created_at;
  const richParts = (Array.isArray(r.participants) && r.participants.length)
    ? r.participants
    : (Array.isArray(m.participants) ? m.participants.map((n) => ({ name: typeof n === "string" ? n : (n && n.name), talkPct: 0, role: "", sentiment: "Neutral" })) : []);
  const kq = (r.key_questions || []).map((k) => (typeof k === "string" ? { q: k, a: "", t: "", at: null } : { q: k.q || "", a: k.a || "", t: k.t || "", at: tsToSeconds(k.t) }));
  let balance = sc.balance || 0;
  // Only derive balance from talk-time when participation data is real (shares sum ~100),
  // so we never show a perfect "100" when there's no talk-time data at all.
  if (!balance && richParts.length > 1) {
    const pcts = richParts.map((p) => p.talkPct || 0);
    const sum = pcts.reduce((a, b) => a + b, 0);
    if (sum >= 90 && sum <= 110) {
      const avg = sum / pcts.length;
      const dev = Math.sqrt(pcts.reduce((a, b) => a + (b - avg) ** 2, 0) / pcts.length);
      balance = Math.max(0, Math.round(100 - dev * 1.5));
    }
  }
  // If the model returned no Read Score but other signals exist, derive one from them
  // so a real, transcribed meeting never shows a stark red 0.
  if (!overall) {
    const sig = [engagement, sentiment, balance, clarity].filter((n) => n > 0);
    if (sig.length) overall = Math.round(sig.reduce((a, b) => a + b, 0) / sig.length);
  }
  const hl = (r.highlights || []).map((h) => (typeof h === "string"
    ? { text: h, t: "", at: null }
    : { text: h.text || h.quote || "", t: h.t || "", at: tsToSeconds(h.t) }));
  // Cover frame: a moment likely to show people talking - the first highlight's timestamp,
  // else ~20% into the meeting (capped at 10 min), else 12s. Skips the black join intro.
  const durSec = (m.duration_min || 0) * 60;
  const firstHi = hl.find((h) => h.at != null);
  const coverAt = firstHi ? firstHi.at : (durSec ? Math.min(Math.round(durSec * 0.2), 600) : 12);
  // A meeting can live in MULTIPLE folders (multi-select). Fall back to the single manual
  // folder, then the AI category, then "Meetings".
  const mFolders = (Array.isArray(m.folders) && m.folders.length) ? m.folders : (m.folder ? [m.folder] : (r.category ? [r.category] : ["Meetings"]));
  return {
    id: m.id, title: m.title || "Meeting", source: platformFromUrl(m.meeting_url) || m.source || "Google Meet",
    date: String(start || REF_TODAY).slice(0, 10),
    timeStart: hhmm(start), timeEnd: hhmm(m.end_time), durationMin: m.duration_min || 0,
    folder: mFolders[0], folders: mFolders, folderLocked: false, owner: "NB", participantsCount: richParts.length,
    scores: { overall, engagement, sentiment, balance, clarity, charisma: sc.charisma || 0 },
    sentimentLabel: r.sentiment_label || "Neutral",
    sentimentTimeline: (Array.isArray(r.sentiment_timeline) && r.sentiment_timeline.length) ? r.sentiment_timeline : [],
    summary: r.summary || (done ? "" : statusSummary(m.status)),
    topics: r.topics || [],
    keyQuestions: kq.map((k) => k.q),
    keyQA: kq,
    actionItems: (r.action_items || []).map((a) => ({ owner: a.owner || "", task: a.task || "", due: a.due || "", t: a.t || "", at: tsToSeconds(a.t), done: false })),
    chapters: (r.chapters || []).map((c) => (typeof c === "string"
      ? { title: c, summary: "", t: "", at: null, points: [] }
      : { title: c.title || "", summary: c.summary || "", t: c.t || "", at: tsToSeconds(c.t), points: Array.isArray(c.points) ? c.points : [] })),
    highlights: hl,
    coverAt,
    coaching: r.coaching || null,
    nextSteps: r.next_steps || [],
    participants: richParts.map((p) => ({ name: p.name || "Speaker", role: p.role || "", talkPct: p.talkPct || 0, wpm: p.wpm || 0, sentiment: p.sentiment || "Neutral", isHost: !!p.isHost, initials: (p.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() })),
    transcript: r.transcript ? parseTranscript(r.transcript) : [],
    subtitles: (r.subtitles && typeof r.subtitles === "object") ? r.subtitles : {},
    video: (done && m.capture_mode === "inhouse_bot" && m.recording_url) ? m.recording_url
      : ((done && (m.source === "Recall") && m.bot_id) ? `/api/recall/media?botId=${encodeURIComponent(m.bot_id)}` : null),
    cover_url: m.cover_url || null,
    // Known emails for this meeting (calendar attendees + people it was shared with) - for
    // search, the participants popover and "copy emails".
    attendees: Array.isArray(m.attendees) ? m.attendees : [],
    contacts: (() => {
      const out = [];
      (Array.isArray(m.attendees) ? m.attendees : []).forEach((a) => { const e = typeof a === "string" ? a : (a && a.email); if (e) out.push({ email: String(e).toLowerCase(), name: (a && a.name) || "" }); });
      (Array.isArray(m.shares) ? m.shares : []).forEach((s) => { if (s && s.email && !s.revoked) out.push({ email: String(s.email).toLowerCase(), name: s.name || "" }); });
      const seen = {}; return out.filter((c) => (seen[c.email] ? false : (seen[c.email] = true)));
    })(),
    real: true, status: m.status, error: m.error || null, calendarEventId: m.calendar_event_id || null,
  };
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
const initialsOf = (name) => {
  const s = String(name || "?").trim();
  if (!s) return "?";
  if (s.includes("@")) {
    // Email: try first.last style, else the first two letters of the local part (so it's never lonely).
    const local = s.split("@")[0];
    const parts = local.split(/[.\-_+]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
};
// Score color tiers: 0-20 red, 20-40 orange, 40-70 yellow, 70-80 green-apple (lime), 80-100 green.
const scoreColor = (n) => (n >= 80 ? "#16A34A" : n >= 70 ? "#84CC16" : n >= 40 ? "#EAB308" : n >= 20 ? "#F97316" : "#EF4444");
const OWNER_COLORS = { NB: "#F472B6", AS: "#FB923C", SL: "#34D399" };
const ownerColor = (o) => OWNER_COLORS[o] || "#94A3B8";
// Deterministic, well-spread avatar color from any string (email preferred, else name) so every
// person gets their own stable color.
const AVATAR_PALETTE = ["#7C3AED", "#EC4899", "#F97316", "#10B981", "#3B82F6", "#8B5CF6", "#EF4444", "#06B6D4", "#F59E0B", "#22C55E", "#D946EF", "#0EA5E9"];
const avatarColor = (key) => { const s = String(key || "?"); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVATAR_PALETTE[h % AVATAR_PALETTE.length]; };
// Avatar: profile photo when we have one (e.g. the connected Google user), else colored initials.
function Avatar({ name, email, picture, size = 28, className = "" }) {
  const px = size + "px";
  if (picture) return <img src={picture} alt={name || ""} referrerPolicy="no-referrer" className={"shrink-0 rounded-full object-cover " + className} style={{ width: px, height: px }} />;
  return (
    <span className={"flex shrink-0 items-center justify-center rounded-full font-bold text-white " + className}
      style={{ width: px, height: px, background: avatarColor(email || name), fontSize: Math.round(size * 0.38) + "px" }}>
      {initialsOf(name || email)}
    </span>
  );
}

/* ------------------------------ toast ------------------------------ */
function toast(msg) { try { window.dispatchEvent(new CustomEvent("octo-toast", { detail: msg })); } catch (e) { /* ignore */ } }
function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const id = Math.random().toString(36).slice(2);
      setItems((x) => [...x, { id, msg: e.detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2400);
    };
    window.addEventListener("octo-toast", h);
    return () => window.removeEventListener("octo-toast", h);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl">
          <CheckCircle2 size={15} className="text-emerald-400" /> {i.msg}
        </div>
      ))}
    </div>
  );
}

/* --------------------------- small UI bits ------------------------- */
function PlatformBadge({ source, size = 22 }) {
  const brand = source === "Google Meet" ? "googleMeet" : source === "Zoom" ? "zoom" : source === "Microsoft Teams" ? "teams" : "extension";
  return (
    <span className="absolute -bottom-1.5 -right-1.5 flex items-center justify-center rounded-lg border border-slate-100 bg-white shadow-md" style={{ width: size, height: size }}>
      <BrandIcon name={brand} size={Math.round(size * 0.66)} />
    </span>
  );
}

function VideoThumb({ src, source, size = 40, rounded = "rounded-lg", showBadge = true, at = null, onClick = null, hoverPlay = true }) {
  const ref = useRef(null);
  // Show the frame at `at` seconds (a highlight's moment) - or ~8s in to skip the
  // black join intro. The media fragment "#t=" paints that frame reliably as the still;
  // the onLoadedMetadata seek is a backup. With hoverPlay=false the still frame is kept
  // on hover (no jump-to-black); onClick makes the whole thumb seek the main player.
  const seekT = at != null && at >= 0 ? at : 8;
  const posterSrc = src ? (src.includes("#") ? src : src + "#t=" + seekT) : null;
  const seek = () => { const v = ref.current; if (v) { try { v.currentTime = seekT; } catch (e) {} } };
  const onEnter = () => { if (!hoverPlay) return; const v = ref.current; if (v) { try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } };
  const onLeave = () => { if (!hoverPlay) return; const v = ref.current; if (v) { try { v.pause(); seek(); } catch (e) {} } };
  // Outer wrapper does NOT clip, so the platform badge can overlap the corner fully (like
  // Read.ai); only the inner video box is rounded/clipped.
  return (
    <div className={"relative shrink-0" + (onClick ? " cursor-pointer" : "")} style={{ width: size, height: size }} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick || undefined}>
      <div className={"relative h-full w-full overflow-hidden bg-slate-900 " + rounded}>
        {posterSrc
          ? <video ref={ref} src={posterSrc} muted loop playsInline preload="metadata" onLoadedMetadata={seek} className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-violet-400 to-violet-500" />}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15">
          <span className="flex items-center justify-center rounded-full bg-black/45" style={{ width: size * 0.4, height: size * 0.4 }}>
            <Play size={size * 0.22} className="ml-px text-white" fill="white" />
          </span>
        </span>
      </div>
      {showBadge && <PlatformBadge source={source} size={Math.max(16, Math.round(size * 0.42))} />}
    </div>
  );
}

function ScoreChip({ value }) {
  const has = Number.isFinite(value) && value > 0;
  const col = !has ? "#94A3B8" : scoreColor(value);
  return (
    <span className="group relative inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-1.5 py-0.5">
      <OctoLogo size={15} />
      <span className="text-[12px] font-bold" style={{ color: col }}>{has ? value : "-"}</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-snug text-white opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100">
        <span className="font-bold">OctoMeet Score</span> - how effective the meeting was, combining real-time sentiment and engagement.
        <span className="absolute left-1/2 top-full -ml-1 h-2 w-2 -translate-y-1/2 rotate-45 bg-slate-900" />
      </span>
    </span>
  );
}

const STATUS_META = {
  scheduled: { label: "Scheduled", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  joining: { label: "Joining…", cls: "bg-amber-100 text-amber-700", spin: true },
  in_call: { label: "In call", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500", pulse: true },
  recording: { label: "Recording", cls: "bg-rose-100 text-rose-700", dot: "bg-rose-500", pulse: true },
  processing: { label: "Processing report…", cls: "bg-violet-100 text-violet-700", spin: true },
  error: { label: "Failed", cls: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
};
function StatusBadge({ status }) {
  const m = STATUS_META[status];
  if (!m) return null;
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold " + m.cls}>
      {m.spin ? <Loader2 size={11} className="animate-spin" /> : <span className={"h-1.5 w-1.5 rounded-full " + (m.dot || "bg-slate-400") + (m.pulse ? " animate-pulse" : "")} />}
      {m.label}
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
  const has = Number.isFinite(value) && value > 0;
  const col = has ? scoreColor(value) : "#CBD5E1";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 flex items-end gap-1.5">
        <span className="text-xl font-bold" style={{ color: col }}>{has ? value : "-"}</span>
        <span className="mb-0.5 text-[10px] text-slate-300">/100</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: (has ? value : 0) + "%", background: col }} />
      </div>
    </div>
  );
}

/* ============================ MAIN APP ============================== */
const NAV = [
  { k: "add-people", tkey: "addPeople", icon: Users },
  { k: "ask", tkey: "ask", icon: Sparkles },
  { k: "reports", tkey: "reports", icon: ClipboardList },
  { k: "folders", tkey: "folders", icon: Folder, plus: true },
  { k: "calendar", tkey: "calendar", icon: Calendar },
  { k: "for-you", tkey: "forYou", icon: Star, gap: true },
  { k: "coaching", tkey: "coaching", icon: Presentation },
  { k: "recommendations", tkey: "recommendations", icon: Lightbulb },
  { k: "meeting-policy", tkey: "meetingPolicy", icon: ShieldCheck },
  { k: "integrations", tkey: "integrations", icon: LayoutGrid, gap: true },
];
const BUCKET_TKEY = { TODAY: "today", "THIS WEEK": "thisWeek", "THIS MONTH": "thisMonth", EARLIER: "earlier" };

// Email-OTP gate: the invited person verifies the code we email them before the report loads.
// Restricted-report access gate (Read.ai style): primary path is "Continue with Google" via
// Google Identity Services (id_token only, no scopes - works for any external Google user) with
// One Tap auto-detect when the visitor is already signed into Google. Email-code is the fallback.
function ShareSignInGate({ token, emailHint, onVerified }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [hint, setHint] = useState(emailHint || "");
  const [mode, setMode] = useState("google"); // "google" | "code"
  const [denied, setDenied] = useState(null);  // { account, invited }
  const btnRef = useRef(null);

  const onGoogle = useCallback(async (credential) => {
    if (!credential) return;
    setBusy(true); setMsg(""); setDenied(null);
    try {
      const r = await fetch("/api/share-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, credential }) });
      if (r.ok) { onVerified(); return; }
      const d = await r.json().catch(() => ({}));
      if (d.error === "no_access") setDenied({ account: d.account, invited: d.invited });
      else setMsg("Couldn't verify that account - try the email code instead.");
    } catch (e) { setMsg("Couldn't verify - try the email code instead."); }
    setBusy(false);
  }, [token, onVerified]);

  // Load Google Identity Services, render the button + try One Tap (silent auto-detect).
  useEffect(() => {
    let cancelled = false;
    const init = (clientId) => {
      if (cancelled || !window.google || !window.google.accounts || !clientId) return;
      try {
        window.google.accounts.id.initialize({ client_id: clientId, callback: (resp) => onGoogle(resp.credential), auto_select: true, cancel_on_tap_outside: false });
        if (btnRef.current) window.google.accounts.id.renderButton(btnRef.current, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", logo_alignment: "center", width: 280 });
        window.google.accounts.id.prompt(); // One Tap: signs the visitor in automatically if already in their Google account
      } catch (e) {}
    };
    (async () => {
      let clientId = "";
      try { const r = await fetch("/api/share-auth"); const d = await r.json(); clientId = d.clientId; } catch (e) {}
      if (window.google && window.google.accounts) return init(clientId);
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
      s.onload = () => init(clientId);
      document.head.appendChild(s);
    })();
    return () => { cancelled = true; };
  }, [onGoogle]);

  const request = async () => { setBusy(true); setMsg(""); try { const r = await fetch("/api/share-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "request" }) }); const d = await r.json(); if (r.ok) { if (d.emailHint) setHint(d.emailHint); setMsg("We sent a 6-digit code to " + (d.emailHint || hint)); } else setMsg("Couldn't send the code - try again"); } catch (e) { setMsg("Couldn't send the code"); } setBusy(false); };
  const verify = async () => { if (!/^\d{6}$/.test(code)) { setMsg("Enter the 6-digit code"); return; } setBusy(true); setMsg(""); try { const r = await fetch("/api/share-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "verify", code }) }); if (r.ok) { onVerified(); return; } const d = await r.json().catch(() => ({})); setMsg(d.error === "expired" ? "Code expired - tap Resend" : "Incorrect code"); } catch (e) { setMsg("Something went wrong"); } setBusy(false); };

  return (
    <div className="rai-body flex h-screen items-center justify-center bg-[#F4F5FA] p-4">
      <StyleInject />
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
        <OctoLogo size={40} />
        <h2 className="mt-3 text-lg font-bold text-slate-900">Sign in to view this report</h2>
        <p className="mt-1 text-[13px] text-slate-500">This report is restricted. Continue with the account it was shared with{hint ? <> (<b className="text-slate-700">{hint}</b>)</> : ""}.</p>
        {denied && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-left text-[12px] text-amber-700"><b>{denied.account}</b> doesn't have access. This report was shared with {denied.invited}. Switch accounts or use the email code below.</div>}
        {mode === "google" ? (
          <>
            <div ref={btnRef} className="mt-4 flex min-h-[44px] justify-center" />
            {busy && <p className="mt-2 text-[12px] text-slate-400">Checking access…</p>}
            <div className="my-4 flex items-center gap-3 text-[11px] text-slate-300"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
            <button onClick={() => { setMode("code"); setMsg(""); setDenied(null); request(); }} disabled={busy} className="text-[13px] font-medium text-violet-600 hover:text-violet-700">Email me a code instead</button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px] text-slate-500">Enter the 6-digit code we emailed to <b className="text-slate-700">{hint || "your email"}</b>.</p>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && verify()} inputMode="numeric" placeholder="••••••" autoFocus className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-center text-xl font-bold tracking-[0.4em] outline-none focus:border-violet-400" />
            <button onClick={verify} disabled={busy} className="mt-3 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60">View report</button>
            <div className="mt-2 flex justify-center gap-4 text-[13px]"><button onClick={request} disabled={busy} className="font-medium text-violet-600 hover:text-violet-700">Resend code</button><button onClick={() => { setMode("google"); setMsg(""); }} className="font-medium text-slate-500 hover:text-slate-700">Back to Google</button></div>
          </>
        )}
        {msg && <p className="mt-3 text-[12px] text-slate-500">{msg}</p>}
      </div>
    </div>
  );
}

// PUBLIC read-only report view (opened via ?share=token). No login, no sidebar - shows
// ONLY the one shared report. Restricted (per-person) links require an email code first.
function SharedReportView({ token }) {
  const [meeting, setMeeting] = useState(null);
  const [role, setRole] = useState("Viewer");
  const [err, setErr] = useState(false);
  const [otp, setOtp] = useState(null); // { emailHint } when a code is required
  const loadReport = () => {
    setOtp(null);
    fetch("/api/shared-report?token=" + encodeURIComponent(token))
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          const m = adaptReal(d.meeting);
          if (m.video) m.video += (m.video.includes("?") ? "&" : "?") + "share=" + encodeURIComponent(token);
          setRole(d.role === "Editor" ? "Editor" : "Viewer");
          setMeeting(m);
          return;
        }
        if (r.status === 403) { const d = await r.json().catch(() => ({})); if (d.needOtp) { setOtp({ emailHint: d.emailHint || "" }); return; } }
        setErr(true);
      })
      .catch(() => setErr(true));
  };
  useEffect(() => { loadReport(); /* eslint-disable-next-line */ }, [token]);

  if (otp) return <ShareSignInGate token={token} emailHint={otp.emailHint} onVerified={() => { setMeeting(null); loadReport(); }} />;
  if (err) return (
    <div className="rai-body flex h-screen flex-col items-center justify-center gap-3 bg-[#F4F5FA] text-center text-slate-500">
      <StyleInject /><OctoLogo size={40} />
      <div className="text-lg font-semibold text-slate-700">This shared report link is no longer available</div>
      <div className="text-sm">The link may be invalid or was revoked by the owner.</div>
    </div>
  );
  if (!meeting) return (
    <div className="rai-body flex h-screen items-center justify-center bg-[#F4F5FA] text-slate-400">
      <StyleInject /><Loader2 className="mr-2 animate-spin" size={18} /> Loading shared report…
    </div>
  );
  return (
    <div className="rai-body flex h-screen w-full flex-col overflow-hidden bg-[#F4F5FA] text-slate-800">
      <StyleInject />
      <Toaster />
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-2.5">
        <OctoLogo size={26} />
        <span className="text-[15px] font-bold text-slate-900">OctoMeet</span>
        <span className="ml-3 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">Shared report · {role === "Editor" ? "Editor" : "view only"}</span>
        <a href="https://meet-ai-three-beige.vercel.app/" target="_blank" rel="noreferrer" className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-violet-500">Get OctoMeet</a>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <MeetingDetail meeting={meeting} meetings={[meeting]} shared role={role} shareTok={token} onBack={null} onUpdate={() => {}} />
      </div>
    </div>
  );
}

export default function App() {
  const [meetings, setMeetings] = useState(null);
  const [view, setView] = useState("reports");
  const [activeId, setActiveId] = useState(null);
  const [askSeed, setAskSeed] = useState("");
  const [lang, setLangState] = useState("en");
  const [calTab, setCalTab] = useState("upcoming");
  const [authed, setAuthed] = useState(null);
  const [user, setUser] = useState(null);
  const [realMeetings, setRealMeetings] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderFilter, setFolderFilter] = useState(null);

  const loadReal = useCallback(async () => {
    try {
      const mr = await fetch("/api/meetings", { cache: "no-store" });
      if (mr.ok) { const md = await mr.json(); setRealMeetings((md.meetings || []).map(adaptReal)); }
    } catch (e) { /* not connected */ }
  }, []);

  // Retro-apply analysis improvements to ALL past meetings: re-analyze any report whose
  // version is behind, from its stored transcript (no re-recording). Loops until caught up.
  const catchUpStale = useCallback(async () => {
    try {
      for (let i = 0; i < 12; i++) {
        const r = await fetch("/api/reprocess-stale", { method: "POST", cache: "no-store" });
        if (!r.ok) break;
        const d = await r.json();
        if (d.updated > 0) loadReal();
        if (!d.remaining) break;
      }
    } catch (e) { /* best-effort */ }
  }, [loadReal]);

  useEffect(() => {
    (async () => {
      let m = await store.get("octomeet:meetings:v1", null);
      if (!m) { m = seedMeetings(); await store.set("octomeet:meetings:v1", m); }
      setMeetings(m);
      setLangState(await store.get("octomeet:lang", "en"));
      const localAuthed = await store.get("octomeet:authed", false);
      // Check for a real backend session (Google login).
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const d = await r.json();
        if (d && d.user) { setUser(d.user); setAuthed(true); store.set("octomeet:authed", true); loadReal(); catchUpStale(); return; }
      } catch (e) { /* backend not configured yet */ }
      setAuthed(localAuthed);
    })();
  }, []);

  // Browser tab: OctoMeet favicon + dynamic title "OctoMeet - <section>" (default Reports).
  useEffect(() => {
    const NAMES = { reports: "Reports", meeting: "Report", ask: "Ask Octo", folders: "Folders", calendar: "Calendar", "for-you": "For You", coaching: "Coaching", recommendations: "Recommendations", "meeting-policy": "Meeting Policy", integrations: "Integrations", "plan-billing": "Plan & Billing", "add-people": "Add People" };
    document.title = "OctoMeet - " + (NAMES[view] || "Reports");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#A855F7"/><stop offset="100%" stop-color="#7C3AED"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"><path d="M15 23V18Q15 15 18 15H23"/><path d="M41 15H46Q49 15 49 18V23"/><path d="M15 41V46Q15 49 18 49H23"/><path d="M41 49H46Q49 49 49 46V41"/></g><g transform="translate(13 17) scale(0.52)"><path d="M44 19L58 12Q61 10.5 61 14.5V37.5Q61 41.5 58 40L44 33Z" fill="#fff"/><path d="M10 27C10 16 19 8 28 8C37 8 46 16 46 27L46 40Q43.5 46 41 46Q38.5 46 36.5 40Q34 46 32 46Q29.5 46 27.5 40Q25 46 23 46Q20.5 46 18.5 40Q16 46 14 46Q11 46 10 40Z" fill="#fff"/><rect x="25" y="16" width="6" height="20" rx="3" fill="url(#g)"/><rect x="18" y="23" width="20" height="6" rx="3" fill="url(#g)"/></g></svg>';
    try {
      let link = document.querySelector("link[rel='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.type = "image/svg+xml";
      link.href = "data:image/svg+xml," + encodeURIComponent(svg);
    } catch (e) { /* ignore */ }
  }, [view]);

  // Live polling: keep real meetings fresh so recording/processing states and the
  // finished AI report appear automatically, the way Read.ai updates in place.
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => { loadReal(); }, 12000);
    const onFocus = () => loadReal();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [authed, loadReal]);

  // Read.ai-style auto-join: on sign-in AND periodically, arm a Recall bot for every
  // upcoming calendar meeting. Recall joins each at its exact start time and waits in
  // the lobby until admitted - even after the app is closed. Re-arming catches meetings
  // you create while the app is open.
  useEffect(() => {
    if (!authed) return;
    let stopped = false;
    // Connect the calendar to Recall (V2) so Recall auto-schedules bots in real time.
    // arm-all is the fallback and becomes a no-op once Recall is connected.
    const run = (announce) => fetch("/api/calendar/connect-recall", { method: "POST" })
      .catch(() => {})
      .then(() => fetch("/api/calendar/arm-all", { method: "POST" }))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((d) => { if (!stopped && d && d.armed > 0) { if (announce) toast(`OctoMeet will auto-join ${d.armed} upcoming meeting${d.armed > 1 ? "s" : ""} 🗓️`); loadReal(); } })
      .catch(() => {});
    run(true);
    const id = setInterval(() => run(false), 150000);
    return () => { stopped = true; clearInterval(id); };
  }, [authed, loadReal]);

  const login = () => { setAuthed(true); store.set("octomeet:authed", true); loadReal(); };
  const loginGoogle = () => { window.location.href = "/api/auth/google/start"; };
  const logout = async () => {
    try { await fetch("/api/auth/logout"); } catch (e) { /* ignore */ }
    setAuthed(false); setUser(null); store.set("octomeet:authed", false); setView("reports");
  };
  const setLang = (l) => { setLangState(l); store.set("octomeet:lang", l); };
  const t = (k) => (TR[lang] && TR[lang][k]) || TR.en[k] || k;
  const persist = async (next) => {
    const demo = next.filter((m) => !m.real);
    const real = next.filter((m) => m.real);
    setMeetings(demo); await store.set("octomeet:meetings:v1", demo);
    setRealMeetings(real);
  };
  // Real Google user (Santiago) sees ONLY their real measured meetings - no demo/seed clutter.
  // The demo/email login still sees seeded meetings so the app isn't empty for previews.
  const allMeetings = useMemo(() => (user ? realMeetings : [...realMeetings, ...(meetings || [])]), [realMeetings, meetings, user]);
  const active = useMemo(() => allMeetings.find((m) => m.id === activeId), [allMeetings, activeId]);
  const [shareIntent, setShareIntent] = useState(false);
  const [gmailNudge, setGmailNudge] = useState(true);
  const openMeeting = (id, opts) => { setActiveId(id); setShareIntent(!!(opts && opts.share)); setView("meeting"); };
  const renameMeeting = async (m, title) => {
    persist(allMeetings.map((x) => (x.id === m.id ? { ...x, title } : x)));
    if (m.real) { try { await fetch("/api/meeting-rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: m.id, title }) }); } catch (e) { /* ignore */ } }
  };
  const deleteMeeting = async (m) => {
    persist(allMeetings.filter((x) => x.id !== m.id));
    if (m.real) { try { await fetch("/api/meeting-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: m.id }) }); } catch (e) { /* ignore */ } }
  };
  const goAsk = (q) => { setAskSeed(q || ""); setView("ask"); };
  const handleUploadSave = useCallback(async (m) => {
    await persist([m, ...meetings]); setUploadOpen(false); setActiveId(m.id); setView("meeting");
  }, [meetings]);

  // Public shared-report link (?share=token): a login-free, read-only view of ONE report.
  // Bypasses the auth gate entirely so invited people never hit Google sign-in.
  const shareToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("share") : null;
  if (shareToken) return <SharedReportView token={shareToken} />;

  if (authed === null || !meetings) {
    return (
      <div className="rai-body flex h-screen items-center justify-center bg-slate-50 text-slate-400">
        <StyleInject /><Loader2 className="mr-2 animate-spin" size={18} /> Loading OctoMeet AI…
      </div>
    );
  }
  if (!authed) return <LoginView onLogin={login} onGoogle={loginGoogle} />;

  return (
    <div dir={isRTL(lang) ? "rtl" : "ltr"} className="rai-body relative flex h-screen w-full overflow-hidden bg-[#F4F5FA] text-slate-800">
      <StyleInject />
      <Toaster />
      <Sidebar view={view} setView={setView} t={t} lang={lang} setLang={setLang} user={user} openScheduling={() => { setCalTab("scheduling"); setView("calendar"); }} />
      <main className="flex flex-1 flex-col overflow-hidden pl-[68px]">
        {user && user.gmailReady === false && gmailNudge && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-[13px] text-amber-900">
            <Mail size={15} className="shrink-0 text-amber-600" />
            <span className="flex-1">Activá el envío de reportes por email: reconectá tu cuenta de Google para conceder el permiso de Gmail (un solo click).</span>
            <button onClick={() => { window.location.href = "/api/auth/google/start"; }} className="rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-violet-500">Reconectar Google</button>
            <button onClick={() => setGmailNudge(false)} className="text-amber-500 transition hover:text-amber-700"><X size={16} /></button>
          </div>
        )}
        {view === "reports" && <ReportsList meetings={allMeetings} onOpen={openMeeting} onUpload={() => setUploadOpen(true)} onAsk={goAsk} t={t} onRefresh={loadReal} folderFilter={folderFilter} onClearFolder={() => setFolderFilter(null)} user={user} onRename={renameMeeting} onDelete={deleteMeeting} />}
        {view === "meeting" && active && <MeetingDetail meeting={active} onBack={() => setView("reports")} onUpdate={persist} meetings={allMeetings} initialShare={shareIntent} onRename={renameMeeting} onDelete={(m) => { deleteMeeting(m); setView("reports"); }} user={user} />}
        {view === "ask" && <ChatView meetings={allMeetings} onOpen={openMeeting} seed={askSeed} />}
        {view === "add-people" && <CreateWorkspace onCancel={() => setView("reports")} onDone={() => setView("reports")} />}
        {view === "plans" && <PlansView onBack={() => setView("plan-billing")} />}
        {view === "plan-billing" && <PlanBillingView onBack={() => setView("reports")} onComparePlans={() => setView("plans")} user={user} />}
        {view === "account" && <AccountSettings onBack={() => setView("reports")} lang={lang} setLang={setLang} user={user} />}
        {view === "support" && <SupportView onBack={() => setView("reports")} />}
        {view === "logout" && <LogoutView onCancel={() => setView("reports")} onLogout={logout} />}
        {view === "folders" && <FoldersView onAsk={goAsk} meetings={allMeetings} onOpenFolder={(name) => { setFolderFilter(name); setView("reports"); }} user={user} />}
        {view === "calendar" && <CalendarView onAsk={goAsk} initialTab={calTab} meetings={allMeetings} onOpen={openMeeting} />}
        {view === "for-you" && <ForYouView meetings={allMeetings} onOpen={openMeeting} onAsk={goAsk} user={user} />}
        {view === "coaching" && <CoachingView onAsk={goAsk} />}
        {view === "recommendations" && <RecommendationsView onAsk={goAsk} />}
        {view === "integrations" && <IntegrationsView onAsk={goAsk} />}
        {view === "meeting-policy" && <MeetingPolicyView onAsk={goAsk} />}
      </main>
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onSave={handleUploadSave} />}
    </div>
  );
}

/* ============================ SIDEBAR ============================== */
// OctoMeet brand mark: purple gradient square, white octopus (head + plus + tentacles +
// camera nub) framed by white scan-corner brackets. Used everywhere (sidebar, badges,
// score chip, favicon) so the brand is consistent.
function OctoLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs><linearGradient id="octoLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#A855F7" /><stop offset="100%" stopColor="#7C3AED" /></linearGradient></defs>
      <rect x="0" y="0" width="64" height="64" rx="15" fill="url(#octoLogo)" />
      {/* scan-frame corner brackets */}
      <g fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round">
        <path d="M15 23 V18 Q15 15 18 15 H23" />
        <path d="M41 15 H46 Q49 15 49 18 V23" />
        <path d="M15 41 V46 Q15 49 18 49 H23" />
        <path d="M41 49 H46 Q49 49 49 46 V41" />
      </g>
      {/* octopus (white) + camera nub + purple plus, centered inside the frame */}
      <g transform="translate(13 17) scale(0.52)">
        <path d="M44 19 L58 12 Q61 10.5 61 14.5 V37.5 Q61 41.5 58 40 L44 33 Z" fill="#fff" />
        <path d="M10 27 C10 16 19 8 28 8 C37 8 46 16 46 27 L46 40 Q43.5 46 41 46 Q38.5 46 36.5 40 Q34 46 32 46 Q29.5 46 27.5 40 Q25 46 23 46 Q20.5 46 18.5 40 Q16 46 14 46 Q11 46 10 40 Z" fill="#fff" />
        <rect x="25" y="16" width="6" height="20" rx="3" fill="url(#octoLogo)" />
        <rect x="18" y="23" width="20" height="6" rx="3" fill="url(#octoLogo)" />
      </g>
    </svg>
  );
}
function MenuItem({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50">
      <Icon size={17} className="text-slate-500" /> {label}
    </button>
  );
}
function Sidebar({ view, setView, t, lang, setLang, openScheduling, user }) {
  const uName = user?.name || user?.email || "You";
  const uEmail = user?.email || "nicolas@octomeet.ai";
  const uInit = initialsOf(uName);
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(false);   // user toggled it open (stays open)
  const [hovered, setHovered] = useState(false);  // mouse over → temporary expand
  const [langOpen, setLangOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [durOpen, setDurOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveUrl, setLiveUrl] = useState("");
  // Collapsed by default; expands on hover or when pinned, and stays open while any popup is active.
  const collapsed = !(pinned || hovered || langOpen || menuOpen || durOpen || liveOpen);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText("https://cal.octomeet.ai/nicolas-82n88"); } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const copyDur = async (d) => {
    const slug = d === "Any duration" ? "" : "/" + d.split("-")[0] + "-min";
    try { await navigator.clipboard.writeText("https://cal.octomeet.ai/nicolas-82n88" + slug); } catch {}
    setCopied(true); setDurOpen(false); setTimeout(() => setCopied(false), 1600);
  };

  return (
    <aside onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className={"absolute inset-y-0 left-0 z-30 flex shrink-0 flex-col rai-sidebar text-slate-300 shadow-xl transition-all duration-200 " + (collapsed ? "w-[68px]" : "w-60")}>
      {/* header */}
      <div className={"flex items-center px-3 pt-4 pb-3 " + (collapsed ? "justify-center" : "gap-2")}>
        <button onClick={() => setView("reports")} title="OctoMeet - all reports" className="flex h-8 w-8 shrink-0 items-center justify-center">
          <OctoLogo size={32} />
        </button>
        {!collapsed && <span className="whitespace-nowrap text-[15px] font-bold text-white">OctoMeet AI</span>}
        {!collapsed && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button onClick={() => setLangOpen((v) => !v)} className="flex items-center gap-0.5 rounded px-1 text-[11px] font-semibold text-slate-300 hover:text-white">{LCODE[lang]}<ChevronDown size={11} /></button>
            <button onClick={() => setPinned((v) => !v)} title={pinned ? "Unpin (auto-collapse)" : "Keep open"}><PanelRightClose size={16} className={"hover:text-white " + (pinned ? "text-violet-300" : "text-slate-400")} /></button>
          </div>
        )}
      </div>

      {/* language dropdown */}
      {langOpen && !collapsed && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
          <div className="absolute left-3 top-14 z-50 max-h-[70vh] w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => { setLang(l.code); setLangOpen(false); }}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                <span>{l.label}</span>{lang === l.code && <Check size={15} className="text-violet-600" />}
              </button>
            ))}
          </div>
        </>
      )}

      {/* enterprise */}
      <div className={"mx-3 mb-3 flex items-center rounded-lg px-1 " + (collapsed ? "justify-center" : "justify-between")}>
        {collapsed ? (
          <button onClick={() => setView("plan-billing")} title={t("enterprise")}><Rocket size={16} className="text-violet-300 hover:text-violet-200" /></button>
        ) : (
          <>
            <button onClick={() => setView("plan-billing")} className="flex items-center gap-1.5 text-xs font-semibold text-white hover:text-violet-200"><Rocket size={13} className="text-violet-300" /> {t("enterprise")}</button>
            <button onClick={() => setView("plan-billing")} className="text-[11px] font-semibold text-violet-300 hover:text-violet-200">{t("manage")}</button>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {NAV.map((n) => (
          <React.Fragment key={n.k}>
            {n.gap && <div className="my-2 border-t border-white/5" />}
            <button onClick={() => setView(n.k)} title={n.label || t(n.tkey)}
              className={"group mb-0.5 flex w-full items-center rounded-lg px-3 py-2 text-[13px] font-medium transition " +
                (collapsed ? "justify-center" : "gap-2.5") + " " +
                (view === n.k ? "bg-violet-600 text-white shadow" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
              <n.icon size={16} className="shrink-0" />
              {!collapsed && <span className="flex-1 text-left">{n.label || t(n.tkey)}</span>}
              {!collapsed && n.plus && <FolderPlus size={14} className="text-slate-500 group-hover:text-slate-300" />}
            </button>
          </React.Fragment>
        ))}
      </nav>

      <div className="relative border-t border-white/5 px-3 py-3">
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-1 left-full z-50 ml-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-2xl">
              <MenuItem icon={SlidersHorizontal} label="Account Settings" onClick={() => { setView("account"); setMenuOpen(false); }} />
              <MenuItem icon={Rocket} label="Plan & Billing" onClick={() => { setView("plan-billing"); setMenuOpen(false); }} />
              <MenuItem icon={Users} label="Add People" onClick={() => { setView("add-people"); setMenuOpen(false); }} />
              <div className="my-1 border-t border-slate-100" />
              <MenuItem icon={HelpCircle} label="Support" onClick={() => { setView("support"); setMenuOpen(false); }} />
              <div className="my-1 border-t border-slate-100" />
              <MenuItem icon={LogOut} label="Log Out" onClick={() => { setView("logout"); setMenuOpen(false); }} />
            </div>
          </>
        )}
        {collapsed ? (
          <div className="flex flex-col items-center gap-3">
            <button onClick={() => { setPinned(true); setLiveOpen(true); }} title={t("addToLive")} className="text-slate-300 hover:text-white"><PlusCircle size={18} /></button>
            <button onClick={copyLink} title={t("smartScheduler")} className={"flex h-8 w-8 items-center justify-center rounded-md text-white " + (copied ? "bg-emerald-500" : "bg-violet-600 hover:bg-violet-500")}>{copied ? <Check size={14} /> : <Link2 size={14} />}</button>
            <button onClick={() => setMenuOpen((v) => !v)} title="Account" className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white" style={{ background: ownerColor(uInit) }}>{user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : uInit}</button>
          </div>
        ) : (
          <>
            {liveOpen ? (
              <input autoFocus value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Escape") { setLiveOpen(false); setLiveUrl(""); }
                  if (e.key === "Enter" && liveUrl.trim()) {
                    const url = liveUrl.trim(); setLiveOpen(false); setLiveUrl("");
                    toast("Sending OctoMeet to the meeting…");
                    try {
                      const r = await fetch("/api/recall/start-bot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingUrl: url, botName: notetakerName() }) });
                      const d = await r.json();
                      toast(r.ok ? "OctoMeet is joining the meeting 🎥" : ("Error: " + (d.error || "failed")));
                    } catch (er) { toast("Network error"); }
                  }
                }}
                placeholder="Paste meeting URL + Enter" className="mb-3 w-full rounded-md border border-violet-400 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-slate-500 outline-none" />
            ) : (
              <button onClick={() => setLiveOpen(true)} className="mb-3 flex w-full items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[13px] font-medium text-slate-300 hover:bg-white/5 hover:text-white">
                <PlusCircle size={16} /> {t("addToLive")}
              </button>
            )}
            <div className="relative mb-3">
              <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("smartScheduler")} <span className="text-slate-600">ⓘ</span>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setDurOpen((v) => !v)} className={"flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold text-white transition " + (copied ? "bg-emerald-500" : "bg-violet-600 hover:bg-violet-500")}>
                  {copied ? <><Check size={12} /> {t("copied")}</> : <><Link2 size={12} /> {t("copyLink")}</>}
                </button>
                <button onClick={openScheduling} className="rounded-md bg-white/10 px-2.5 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-white/15">{t("manage")}</button>
              </div>
              {durOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDurOpen(false)} />
                  <div className="absolute bottom-full left-0 z-50 mb-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl">
                    {["Any duration", "15-minute", "30-minute", "60-minute", "90-minute"].map((d) => (
                      <button key={d} onClick={() => copyDur(d)} className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">{d}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setMenuOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/5">
              <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white" style={{ background: ownerColor(uInit) }}>{user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : uInit}</div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px] font-medium text-white">{uName}</div>
                <div className="truncate text-[11px] text-slate-500">{uEmail}</div>
              </div>
              <ChevronRight size={16} className="ml-auto text-slate-500" />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

/* ============================ REPORTS LIST ========================= */
function FilterBtn({ label, icon: Icon, onClick }) {
  return (
    <button onClick={onClick || (() => toast(label + " filter - coming soon"))} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50">
      {Icon && <Icon size={14} className="text-slate-400" />}{label}<ChevronDown size={14} className="text-slate-400" />
    </button>
  );
}
// Working filter dropdown used in Reports.
function FilterDropdown({ label, icon: Icon, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const active = value && value !== "all";
  const cur = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={"flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition " + (active ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
        {Icon && <Icon size={14} className={active ? "text-violet-500" : "text-slate-400"} />}{active ? cur?.label : label}<ChevronDown size={14} className={active ? "text-violet-400" : "text-slate-400"} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 max-h-72 min-w-[190px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {options.map((o) => (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} className={"flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-slate-50 " + (o.value === value ? "font-semibold text-violet-700" : "text-slate-600")}>
                {o.label}{o.value === value && <Check size={14} className="text-violet-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Base folder catalog (meeting types) — the system auto-files meetings into these via AI,
// and the user can pick/create more. Mirrors Read.ai's folder set.
const BASE_FOLDERS = ["Sales Call", "Sales Strategy", "Customer Success", "Customer Support", "Customer Feedback", "Onboarding", "One-on-One", "Planning Meeting", "Partnership Alignment", "Product Demo", "Job Interview", "Program Interview", "Professional Consultation", "Technical Troubleshooting", "Training", "Educational", "Standup", "Kickoff", "Team Meeting", "Meetings"];

// "Smart folder" glyph: a folder with a small AI sparkle (matches Read.ai's folder icon).
function SmartFolderIcon({ size = 16 }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <Folder size={size} className="text-violet-400" />
      <Sparkles size={Math.round(size * 0.5)} className="absolute -bottom-0.5 -right-1 text-violet-500" fill="currentColor" />
    </span>
  );
}

// Per-row folder picker: MULTI-select (a meeting can live in several folders, like Read.ai).
// Checkboxes + Save/Cancel; search; create a new folder; positioned FIXED so the scrolling
// list never clips it. Selection persists via onSave (manual override of AI auto-foldering).
function FolderPicker({ meeting, folders, onSave, onCreate }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(null);
  const [sel, setSel] = useState([]);
  const btnRef = useRef(null);
  const current = (meeting.folders && meeting.folders.length) ? meeting.folders : (meeting.folder ? [meeting.folder] : []);
  const list = folders.filter((f) => !q || f.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.trim() && !folders.some((f) => f.toLowerCase() === q.trim().toLowerCase());
  const dirty = JSON.stringify([...sel].sort()) !== JSON.stringify([...current].sort());
  const openMenu = () => {
    const r = btnRef.current && btnRef.current.getBoundingClientRect();
    if (r) { const W = 288, below = window.innerHeight - r.bottom; setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), top: below > 380 ? r.bottom + 4 : null, bottom: below > 380 ? null : window.innerHeight - r.top + 4 }); }
    setSel(current); setQ(""); setOpen(true);
  };
  const toggle = (f) => setSel((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));
  const createAndCheck = () => { const name = q.trim(); if (!name) return; onCreate(name); setSel((s) => (s.includes(name) ? s : [...s, name])); setQ(""); };
  const save = () => { onSave(meeting.id, sel); setOpen(false); };
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      {current.length ? (
        <button ref={btnRef} onClick={() => (open ? setOpen(false) : openMenu())} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[12px] text-slate-600 transition hover:bg-slate-200">
          <SmartFolderIcon size={13} />
          <span className="truncate">{current[0]}{current.length > 1 ? ` +${current.length - 1}` : ""}</span>
          <Lock size={10} className="shrink-0 text-slate-400" />
          <ChevronDown size={12} className="shrink-0 text-slate-400" />
        </button>
      ) : (
        <button ref={btnRef} onClick={() => (open ? setOpen(false) : openMenu())} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-500 transition hover:bg-slate-50">
          <Folder size={12} className="shrink-0 text-slate-400" /> Add to Folder <ChevronDown size={12} className="shrink-0 text-slate-400" />
        </button>
      )}
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="fixed z-[56] flex w-72 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl" style={{ left: pos.left, top: pos.top != null ? pos.top : undefined, bottom: pos.bottom != null ? pos.bottom : undefined }}>
            <div className="flex items-center gap-2 p-2.5">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-violet-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search folders..." autoFocus className="w-full rounded-lg border border-violet-200 py-2 pl-8 pr-2 text-[13px] outline-none focus:border-violet-400" />
              </div>
              <button onClick={createAndCheck} title="Create folder" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"><FolderPlus size={16} /></button>
            </div>
            <div className="max-h-60 overflow-y-auto px-1.5">
              {list.map((f) => (
                <button key={f} onClick={() => toggle(f)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50">
                  <SmartFolderIcon size={16} />
                  <span className="flex flex-1 items-center gap-1.5 truncate text-[14px] text-slate-700">{f}<Lock size={11} className="shrink-0 text-slate-300" /></span>
                  <span className={"flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition " + (sel.includes(f) ? "border-violet-600 bg-violet-600" : "border-slate-300")}>{sel.includes(f) && <Check size={12} className="text-white" />}</span>
                </button>
              ))}
              {canCreate && (
                <button onClick={createAndCheck} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium text-violet-600 transition hover:bg-violet-50"><FolderPlus size={14} /> Create &ldquo;{q.trim()}&rdquo;</button>
              )}
              {!list.length && !canCreate && <p className="px-2 py-3 text-center text-[13px] text-slate-400">No folders yet - type to create one.</p>}
            </div>
            <div className="flex items-center justify-end gap-1 border-t border-slate-100 p-2.5">
              <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-violet-600 transition hover:bg-violet-50">Cancel</button>
              <button onClick={save} disabled={!dirty} className="rounded-lg bg-violet-600 px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-violet-500 disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-400">Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Per-row "⋯" actions menu: Share / Download / Rename / Delete. Fixed-positioned so the
// scrolling list never clips it.
function RowMenu({ onShare, onDownload, onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const openMenu = () => {
    const r = btnRef.current && btnRef.current.getBoundingClientRect();
    if (r) { const W = 200, below = window.innerHeight - r.bottom; setPos({ left: Math.max(8, r.right - W), top: below > 220 ? r.bottom + 4 : null, bottom: below > 220 ? null : window.innerHeight - r.top + 4 }); }
    setOpen(true);
  };
  const act = (fn) => (e) => { e.stopPropagation(); setOpen(false); fn(); };
  return (
    <div className="relative flex justify-center" onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal size={16} /></button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="fixed z-[56] w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" style={{ left: pos.left, top: pos.top != null ? pos.top : undefined, bottom: pos.bottom != null ? pos.bottom : undefined }}>
            <button onClick={act(onShare)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"><Share2 size={15} className="text-slate-400" /> Share</button>
            <button onClick={act(onDownload)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"><Download size={15} className="text-slate-400" /> Download</button>
            <button onClick={act(onRename)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"><Pencil size={15} className="text-slate-400" /> Rename Report</button>
            <button onClick={act(onDelete)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-rose-600 hover:bg-rose-50"><Trash2 size={15} /> Delete Report</button>
          </div>
        </>
      )}
    </div>
  );
}

// Participant-count chip -> popover: THIS meeting's participants + their resolved emails + copy.
function PeoplePopover({ meeting, emailBook = {} }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const names = (meeting.participants || []).map((p) => p.name).filter(Boolean);
  const emailFor = (nm) => emailBook[String(nm).trim().toLowerCase()] || "";
  const emails = meetingParticipantEmails(meeting, emailBook);
  const count = meeting.participantsCount != null ? meeting.participantsCount : names.length;
  const openMenu = (e) => { e.stopPropagation(); const r = btnRef.current && btnRef.current.getBoundingClientRect(); if (r) { const below = window.innerHeight - r.bottom; setPos({ left: Math.max(8, r.left), top: below > 300 ? r.bottom + 4 : null, bottom: below > 300 ? null : window.innerHeight - r.top + 4 }); } setOpen(true); };
  const copyEmails = async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(emails.join(", ")); toast(emails.length ? `Copied ${emails.length} email${emails.length > 1 ? "s" : ""}` : "No emails on file for this meeting"); } catch (err) {} };
  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} onClick={(e) => (open ? setOpen(false) : openMenu(e))} className="flex items-center gap-1 text-[12px] text-slate-400 transition hover:text-violet-600"><Users size={12} /> {count}</button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="fixed z-[56] w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl" style={{ left: pos.left, top: pos.top != null ? pos.top : undefined, bottom: pos.bottom != null ? pos.bottom : undefined }}>
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Participants</span>
              {emails.length > 0 && <button onClick={copyEmails} className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700"><Copy size={11} /> Copy emails</button>}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {names.map((nm, i) => { const em = emailFor(nm); return (
                <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <Avatar name={nm} email={em || nm} size={22} />
                  <div className="min-w-0"><div className="truncate text-[13px] text-slate-700">{nm}</div>{em && <div className="truncate text-[11px] text-slate-400">{em}</div>}</div>
                </div>
              ); })}
              {!names.length && <div className="px-2 py-3 text-center text-[12px] text-slate-400">No participant data.</div>}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

// ALL emails associated with THIS meeting, deterministically (per-meeting, independent):
//  1) every email directly attached to the meeting (calendar attendees + people with access), and
//  2) participant NAMES resolved to emails via the directory (best-effort, tolerates missing ones).
// Union of both so "copy/send" always grabs the full known set (name-matching alone was flaky).
function meetingParticipantEmails(meeting, emailBook = {}) {
  const out = [];
  (meeting.contacts || []).forEach((c) => { if (c && c.email) out.push(String(c.email).toLowerCase()); });
  (meeting.attendees || []).forEach((a) => { const e = typeof a === "string" ? a : (a && a.email); if (e) out.push(String(e).toLowerCase()); });
  (meeting.participants || []).forEach((p) => { const e = p && p.name && emailBook[String(p.name).trim().toLowerCase()]; if (e) out.push(e); });
  return [...new Set(out.filter((e) => /^[^\s,<>"]+@[^\s,<>"]+\.[^\s,<>"]+$/.test(e)))];
}

// Reports "Participants" column: quick-copy guest emails + email guests (Gmail compose). Tooltips on hover.
function ParticipantsCell({ meeting, emailBook }) {
  const emails = meetingParticipantEmails(meeting, emailBook);
  const copy = (e) => { e.stopPropagation(); if (!emails.length) return toast("No participant emails on file"); navigator.clipboard.writeText(emails.join(", ")).then(() => toast(`Copied ${emails.length} email${emails.length > 1 ? "s" : ""}`)).catch(() => {}); };
  const mail = (e) => { e.stopPropagation(); if (!emails.length) return toast("No participant emails on file"); window.open("https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(emails.join(",")) + "&su=" + encodeURIComponent(meeting.title || "Meeting"), "_blank"); };
  const faded = emails.length ? "" : " opacity-40";
  const tip = "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100";
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="group relative">
        <button onClick={copy} className={"flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-violet-600" + faded}><Copy size={15} /></button>
        <span className={tip}>Copy guest emails</span>
      </div>
      <div className="group relative">
        <button onClick={mail} className={"flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-violet-600" + faded}><Mail size={15} /></button>
        <span className={tip}>Email guests</span>
      </div>
    </div>
  );
}

function ReportsList({ meetings, onOpen, onUpload, onAsk, t, onRefresh, folderFilter, onClearFolder, user, onRename, onDelete }) {
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState("");
  const [tab, setTab] = useState("reports");
  const [showCrm, setShowCrm] = useState(true);
  const [renaming, setRenaming] = useState(null);   // meeting being renamed
  const [renameVal, setRenameVal] = useState("");
  const [deleting, setDeleting] = useState(null);    // meeting pending delete confirm
  const [fOwner, setFOwner] = useState("all");
  const [fDate, setFDate] = useState("all");
  const [fType, setFType] = useState("all");
  const [fSource, setFSource] = useState("all");
  const [fFolder, setFFolder] = useState("all");
  const [sel, setSel] = useState(() => new Set()); // selected meeting ids for bulk actions
  const [showAnalytics, setShowAnalytics] = useState(false); // inline analytics over the selection
  const [bulkBusy, setBulkBusy] = useState("");     // "" | "doc" | "deck"
  const [bulkDoc, setBulkDoc] = useState(null);     // { doc, meta }
  const [bulkDeck, setBulkDeck] = useState(null);   // { deck, theme, imgUrls, meta }
  const toggleSel = (id) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const genBulkDoc = async (regenerate) => {
    if (bulkBusy) return; setBulkBusy("doc");
    try {
      const r = await fetch("/api/document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingIds: [...sel], regenerate: !!regenerate }) });
      const d = await r.json();
      if (r.status === 429) { toast("You've reached this month's limit for AI documents."); return; }
      if (!r.ok || !d.doc) { toast("Couldn't generate the document"); return; }
      setBulkDoc({ doc: d.doc, meta: d.meta });
    } catch (e) { toast("Network error"); } finally { setBulkBusy(""); }
  };
  const genBulkDeck = async (regenerate) => {
    if (bulkBusy) return; setBulkBusy("deck");
    try {
      const r = await fetch("/api/slides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingIds: [...sel], slideCount: 10, themeId: "sleek-dark", regenerate: !!regenerate }) });
      const d = await r.json();
      if (r.status === 429) { toast("You've reached this month's limit for presentations."); return; }
      if (!r.ok || !d.deck) { toast("Couldn't generate the deck"); return; }
      const deck = coerceDeck(d.deck, { wantN: 10, imageCount: (d.genImages || []).length });
      setBulkDeck({ deck, theme: getTheme(d.themeId || "sleek-dark"), imgUrls: d.genImages || [], meta: d.meta });
    } catch (e) { toast("Network error"); } finally { setBulkBusy(""); }
  };
  const [manualFolders, setManualFolders] = useState([]);
  useEffect(() => { store.get("octomeet:folders", []).then((f) => setManualFolders(Array.isArray(f) ? f : [])); }, []);
  // Only folders actually in use (AI-assigned across meetings) + ones you created manually.
  // The BASE_FOLDERS catalog is just the AI's classification vocabulary, NOT the UI list -
  // a folder appears here once a meeting actually uses it (or you create it).
  const allFolders = useMemo(() => [...new Set([...meetings.flatMap((m) => m.folders || (m.folder ? [m.folder] : [])).filter(Boolean), ...manualFolders])].sort(), [meetings, manualFolders]);
  const saveFolders = async (meetingId, folders) => {
    try { await fetch("/api/meeting-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId, folders }) }); } catch (e) { /* ignore */ }
    toast(folders.length ? "Saved to " + folders.length + (folders.length > 1 ? " folders" : " folder") : "Removed from folders"); if (onRefresh) onRefresh();
  };
  const createFolder = (name) => setManualFolders((prev) => { const next = [...new Set([...prev, name])]; store.set("octomeet:folders", next); return next; });

  // Quick download of a single report as Markdown (from "⋯ → Download").
  const downloadMeeting = (m) => {
    const L = [`# ${m.title}`, "", `${fmtDateFull(m.date)} · ${m.timeStart} - ${m.timeEnd}`, `OctoMeet Score: ${m.scores?.overall ?? "-"}`, ""];
    if (m.summary) L.push("## Summary", m.summary, "");
    if (m.keyQA?.length) { L.push("## Key Questions"); m.keyQA.forEach((k) => L.push(`- **${k.q}**${k.a ? `\n  ${k.a}` : ""}`)); L.push(""); }
    if (m.actionItems?.length) { L.push("## Action Items"); m.actionItems.forEach((a) => L.push(`- [ ] ${a.task}${a.owner ? ` (${a.owner})` : ""}${a.due ? ` - due ${a.due}` : ""}`)); L.push(""); }
    if (m.nextSteps?.length) { L.push("## Next Steps"); m.nextSteps.forEach((n) => L.push(`- ${typeof n === "string" ? n : n.task || ""}`)); L.push(""); }
    if (m.chapters?.length) { L.push("## Chapters & Topics"); m.chapters.forEach((c) => L.push(`### ${c.title}${c.t ? ` (${c.t})` : ""}${c.summary ? `\n${c.summary}` : ""}`)); L.push(""); }
    const blob = new Blob([L.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${m.title.replace(/[^\w\s-]/g, "").trim() || "report"}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000); toast("Downloaded");
  };
  const submitRename = () => { if (renaming && renameVal.trim()) { onRename && onRename(renaming, renameVal.trim()); toast("Renamed"); } setRenaming(null); };
  const confirmDelete = () => { if (deleting) { onDelete && onDelete(deleting); toast("Report deleted"); } setDeleting(null); };

  // "error" is intentionally excluded: a failed capture never shows anywhere -
  // it's either a real report (recorded) or nothing at all.
  const INCOMPLETE = ["scheduled", "joining", "in_call", "recording", "processing"];
  const sourceOpts = useMemo(() => [{ value: "all", label: "All sources" }, ...[...new Set(meetings.map((m) => m.source).filter(Boolean))].map((s) => ({ value: s, label: s }))], [meetings]);
  const folderOpts = useMemo(() => [{ value: "all", label: "All folders" }, ...[...new Set(meetings.flatMap((m) => m.folders || (m.folder ? [m.folder] : [])).filter(Boolean))].map((s) => ({ value: s, label: s }))], [meetings]);
  const typeOpts = [{ value: "all", label: "All types" }, { value: "completed", label: "Completed" }, { value: "processing", label: "In progress" }];
  const dateOpts = [{ value: "all", label: "Anytime" }, { value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }];
  const ownerOpts = [{ value: "all", label: "All Reports" }, { value: "mine", label: "My reports" }, { value: "real", label: "Recorded by OctoMeet" }];

  const filtered = useMemo(
    () => (tab === "incomplete"
      ? meetings.filter((m) => m.real && INCOMPLETE.includes(m.status))
      // Reports tab: only finished reports (or demo rows). Never failed, never in-progress.
      : meetings.filter((m) => !m.real || m.status === "done"))
      .filter((m) => !folderFilter || (m.folders || (m.folder ? [m.folder] : [])).includes(folderFilter))
      .filter((m) => fOwner === "all" || (fOwner === "mine" ? !m.shared : m.real))
      .filter((m) => fSource === "all" || m.source === fSource)
      .filter((m) => fFolder === "all" || (m.folders || (m.folder ? [m.folder] : [])).includes(fFolder))
      .filter((m) => fType === "all" || (fType === "completed" ? (!m.real || m.status === "done") : (m.real && INCOMPLETE.includes(m.status))))
      .filter((m) => { if (fDate === "all") return true; const d = daysAgo(m.date); return fDate === "today" ? d <= 0 : fDate === "week" ? d <= 7 : d <= 31; })
      .filter((m) => {
        if (!q) return true;
        const s = q.toLowerCase();
        const hay = (m.title + " " + (m.summary || "") + " " + (m.participants || []).map((p) => p.name).join(" ") + " " + (m.contacts || []).map((c) => c.name + " " + c.email).join(" ")).toLowerCase();
        return hay.includes(s);
      })
      .sort((a, b) => (b.date + b.timeStart).localeCompare(a.date + a.timeStart)),
    [meetings, q, tab, folderFilter, fOwner, fDate, fType, fSource, fFolder]
  );
  const groups = useMemo(() => {
    const order = ["TODAY", "THIS WEEK", "THIS MONTH", "EARLIER"];
    const by = {};
    filtered.forEach((m) => { const b = bucketOf(m.date); (by[b] = by[b] || []).push(m); });
    return order.filter((o) => by[o]).map((o) => ({ label: o, items: by[o] }));
  }, [filtered]);
  const live = useMemo(() => meetings.filter((m) => m.real && ["joining", "in_call", "recording"].includes(m.status)), [meetings]);
  const proc = useMemo(() => meetings.filter((m) => m.real && m.status === "processing"), [meetings]);
  const selectedMeetings = filtered.filter((m) => sel.has(m.id));
  const allSelected = filtered.length > 0 && filtered.every((m) => sel.has(m.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(filtered.map((m) => m.id)));
  // Directory of name -> email built from every known contact (calendar attendees + shared people)
  // + the owner. Used to resolve each meeting's participant NAMES to emails.
  const emailBook = useMemo(() => {
    const b = {};
    const add = (name, email) => { if (name && email) b[String(name).trim().toLowerCase()] = String(email).toLowerCase(); };
    if (user && user.name && user.email) add(user.name, user.email);
    meetings.forEach((mm) => (mm.contacts || []).forEach((c) => add(c.name, c.email)));
    return b;
  }, [meetings, user]);

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-6 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900">{t("reports")}</h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) onAsk(ask.trim()); }}
          className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white shadow-sm px-3 py-2 focus-within:border-violet-400">
          <button type="button" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-400"><Globe size={15} /><ChevronDown size={13} /></button>
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={t("askAnything")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          <button type="submit" className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-500 disabled:opacity-40" disabled={!ask.trim()}>
            <Send size={15} />
          </button>
        </form>
        <div className="flex items-center justify-between">
          <div className="flex gap-5">
            {[{ k: "reports", key: "reportsTab" }, { k: "incomplete", key: "incompleteTab" }].map((tb) => (
              <button key={tb.k} onClick={() => setTab(tb.k)}
                className={"border-b-2 pb-2.5 text-sm font-semibold transition " + (tab === tb.k ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {t(tb.key)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 pb-1.5">
            <button onClick={() => { if (onRefresh) onRefresh(); toast("Refreshed"); }} className="flex items-center gap-1.5 text-[13px] text-slate-400 transition hover:text-slate-600"><RefreshCw size={13} /> {t("lastRefreshed")}</button>
            <button onClick={onUpload} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-violet-500">
              <Upload size={15} /> {t("upload")}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
          <>
            {(live.length > 0 || proc.length > 0) && (
              <div className={"mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 " + (live.length ? "border-rose-200 bg-rose-50" : "border-violet-200 bg-violet-50")}>
                {live.length ? (
                  <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" /></span>
                ) : <Loader2 size={15} className="animate-spin text-violet-600" />}
                <span className="flex-1 text-sm font-medium text-slate-700">
                  {live.length
                    ? <>OctoMeet is <b className="text-rose-700">recording live</b>: “{live[0].title}”{live.length > 1 ? ` +${live.length - 1} more` : ""} - the AI report will appear here automatically.</>
                    : <>Generating <b className="text-violet-700">{proc.length}</b> AI report{proc.length > 1 ? "s" : ""} from your meeting{proc.length > 1 ? "s" : ""}… this updates automatically.</>}
                </span>
                <button onClick={() => { if (onRefresh) onRefresh(); }} className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50"><RefreshCw size={12} /> Refresh</button>
              </div>
            )}
            {tab === "reports" && showCrm && (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-violet-50 px-4 py-3">
                <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">✨ NEW!</span>
                <span className="flex-1 text-sm text-slate-700">Connect your CRM to receive smart recommendations on when to advance your deals to the next stage.</span>
                <button onClick={() => toast("Connect HubSpot - coming soon")} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-semibold text-white hover:bg-slate-800"><span className="rounded bg-white p-0.5"><BrandIcon name="hubspot" size={14} /></span> Add Hubspot</button>
                <button onClick={() => toast("Connect Salesforce - coming soon")} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-semibold text-white hover:bg-slate-800"><span className="rounded bg-white p-0.5"><BrandIcon name="salesforce" size={14} /></span> Add Salesforce</button>
                <button onClick={() => setShowCrm(false)} className="text-[13px] font-medium text-slate-500 hover:text-slate-700">Dismiss</button>
              </div>
            )}

            <div className="mb-1 flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meeting, company or person…"
                  className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-violet-400" />
              </div>
              {folderFilter && (
                <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-[13px] font-semibold text-violet-700"><Folder size={13} /> {folderFilter}<button onClick={onClearFolder} className="ml-1 text-violet-400 hover:text-violet-700"><X size={13} /></button></span>
              )}
              <FilterDropdown label={t("allReports")} icon={ClipboardList} value={fOwner} onChange={setFOwner} options={ownerOpts} />
              <FilterDropdown label={t("anytime")} icon={Calendar} value={fDate} onChange={setFDate} options={dateOpts} />
              <FilterDropdown label={t("type")} value={fType} onChange={setFType} options={typeOpts} />
              <FilterDropdown label={t("source")} value={fSource} onChange={setFSource} options={sourceOpts} />
              <FilterDropdown label={t("folder")} value={fFolder} onChange={setFFolder} options={folderOpts} />
              {(fOwner !== "all" || fDate !== "all" || fType !== "all" || fSource !== "all" || fFolder !== "all") && (
                <button onClick={() => { setFOwner("all"); setFDate("all"); setFType("all"); setFSource("all"); setFFolder("all"); }} className="text-[12px] font-semibold text-slate-400 hover:text-slate-600">Clear filters</button>
              )}
              <div className="flex-1" />
              {/* Bulk actions: always visible + active-looking. Hover shows a hint until a selection is made. */}
              <div className="group relative">
                <button onClick={() => (sel.size ? setShowAnalytics((v) => !v) : toast("Select one or more meetings first"))}
                  className={"flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold transition " + (showAnalytics && sel.size ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}><BarChart3 size={14} /> Analytics</button>
                {sel.size === 0 && <span className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11.5px] font-normal leading-snug text-white opacity-0 shadow-xl transition group-hover:opacity-100">Select one or more meetings to see analytics.</span>}
              </div>
              <div className="group relative">
                <button onClick={() => (sel.size ? genBulkDoc() : toast("Select one or more meetings first"))} disabled={!!bulkBusy}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60">{bulkBusy === "doc" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} AI Doc</button>
                {sel.size === 0 && <span className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11.5px] font-normal leading-snug text-white opacity-0 shadow-xl transition group-hover:opacity-100">Select one or more meetings to generate a document.</span>}
              </div>
              <div className="group relative">
                <button onClick={() => (sel.size ? genBulkDeck() : toast("Select one or more meetings first"))} disabled={!!bulkBusy}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-2 text-[13px] font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-60">{bulkBusy === "deck" ? <Loader2 size={14} className="animate-spin" /> : <Presentation size={14} />} Presentation</button>
                {sel.size === 0 && <span className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11.5px] font-normal leading-snug text-white opacity-0 shadow-xl transition group-hover:opacity-100">Select one or more meetings to generate a presentation.</span>}
              </div>
            </div>
            {/* Select all — right under the search/filters row */}
            {filtered.length > 0 && (
              <div className="mb-1 flex items-center gap-3">
                <button onClick={toggleAll} className="flex items-center gap-1.5 text-[13px] font-medium text-slate-600 transition hover:text-violet-700">
                  <span className={"flex h-4 w-4 items-center justify-center rounded border " + (allSelected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 text-transparent")}><Check size={11} /></span>
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
                {sel.size > 0 && <span className="text-[12px] font-semibold text-violet-600">{sel.size} selected</span>}
              </div>
            )}

            {showAnalytics ? (
              <AnalyticsPanel meetings={selectedMeetings} onOpen={onOpen} onClose={() => setShowAnalytics(false)} />
            ) : (
            <div className="mt-4 overflow-hidden">
              <div className="grid grid-cols-[1.4fr_1fr_0.9fr_0.8fr_0.5fr_40px] items-center border-b border-slate-200 px-3 pb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                <div className="flex items-center gap-6"><span>{t("source")}</span><span>{t("report")}</span></div>
                <div className="flex items-center gap-1">{t("dateTime")} <ArrowDown size={12} /></div>
                <div>{t("folders")}</div>
                <div>Participants</div>
                <div>{t("owner")}</div>
                <div></div>
              </div>

              {groups.map((g) => (
                <div key={g.label}>
                  <div className="bg-slate-50/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(BUCKET_TKEY[g.label] || "today")}</div>
                  {g.items.map((m) => (
                    <div key={m.id} onClick={() => onOpen(m.id)} role="button" tabIndex={0}
                      className="grid w-full cursor-pointer grid-cols-[1.4fr_1fr_0.9fr_0.8fr_0.5fr_40px] items-center border-b border-slate-100 px-3 py-3 text-left transition hover:bg-violet-50/40">
                      <div className="flex min-w-0 items-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); toggleSel(m.id); }} title="Select" className={"flex h-5 w-5 shrink-0 items-center justify-center rounded border transition " + (sel.has(m.id) ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 text-transparent hover:border-violet-400")}><Check size={13} /></button>
                        <VideoThumb src={m.video} source={m.source} size={44} at={m.coverAt} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">{m.title}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <PeoplePopover meeting={m} emailBook={emailBook} />
                            {m.real && m.status && m.status !== "done" ? <StatusBadge status={m.status} /> : <ScoreChip value={m.scores.overall} />}
                          </div>
                        </div>
                      </div>
                      <div className="leading-tight">
                        <div className="text-[13px] text-slate-700">{fmtDateFull(m.date)}</div>
                        <div className="text-[12px] text-slate-400">{m.timeStart} - {m.timeEnd}</div>
                      </div>
                      <div>
                        <FolderPicker meeting={m} folders={allFolders} onSave={saveFolders} onCreate={createFolder} />
                      </div>
                      <ParticipantsCell meeting={m} emailBook={emailBook} />
                      <div>
                        {(() => {
                          // Owner = the connected Google user (responsible for the subscription).
                          const ownerName = user?.name || user?.email || "You";
                          return (
                            <span className="group relative inline-flex">
                              <Avatar name={ownerName} email={user?.email} picture={user?.picture} size={28} />
                              <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100">{ownerName}</span>
                            </span>
                          );
                        })()}
                      </div>
                      <RowMenu onShare={() => onOpen(m.id, { share: true })} onDownload={() => downloadMeeting(m)} onRename={() => { setRenaming(m); setRenameVal(m.title); }} onDelete={() => setDeleting(m)} />
                    </div>
                  ))}
                </div>
              ))}
              {!filtered.length && <div className="py-16 text-center text-sm text-slate-400">{tab === "incomplete" ? (q ? `No in-progress meetings match “${q}”.` : "No meetings in progress. Live & processing meetings will appear here.") : (q ? `No reports match “${q}”.` : "No reports yet.")}</div>}
            </div>
            )}
          </>
      </div>

      {renaming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setRenaming(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-bold text-slate-900">Rename Report</h3>
            <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitRename()} autoFocus className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRenaming(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={submitRename} disabled={!renameVal.trim()} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:bg-slate-200 disabled:text-slate-400">Save</button>
            </div>
          </div>
        </div>
      )}
      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600"><Trash2 size={18} /></span><h3 className="text-base font-bold text-slate-900">Delete Report</h3></div>
            <p className="text-[13px] leading-relaxed text-slate-500">Delete <b className="text-slate-700">“{deleting.title}”</b>? This permanently removes the report and its analysis. This can't be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDelete} className="rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-rose-500">Delete Report</button>
            </div>
          </div>
        </div>
      )}
      {bulkDoc && <DocModal doc={bulkDoc.doc} meta={bulkDoc.meta} onClose={() => setBulkDoc(null)} onRegenerate={() => genBulkDoc(true)} regenerating={bulkBusy === "doc"} />}
      {bulkDeck && <SlidesModal deck={bulkDeck.deck} theme={bulkDeck.theme} imgUrls={bulkDeck.imgUrls} meta={bulkDeck.meta} onClose={() => setBulkDeck(null)} onRegenerate={() => genBulkDeck(true)} regenerating={bulkBusy === "deck"} />}
    </>
  );
}

/* ============================ PLACEHOLDER ========================== */
function Placeholder({ section, onReports, t }) {
  const Icon = section?.icon || ClipboardList;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-500"><Icon size={26} /></div>
      <h2 className="text-xl font-bold text-slate-800">{section ? t(section.tkey) : ""}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        This section is coming soon. For now, the <b>Reports</b> screen is fully working.
      </p>
      <button onClick={onReports} className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">Go to Reports</button>
    </div>
  );
}

/* ===================== CREATE WORKSPACE (Add People) =============== */
function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={"relative h-6 w-11 shrink-0 rounded-full transition " + (on ? "bg-violet-600" : "bg-slate-200")}>
      <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function CreateWorkspace({ onCancel, onDone }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [invites, setInvites] = useState([{ email: "", role: "Member" }]);
  const [perms, setPerms] = useState({ viewMetrics: true, shareDefault: false, approveJoin: true });
  const total = 5;
  const canNext = step === 1 ? !!(name.trim() && agreed) : true;
  const back = () => (step === 1 ? onCancel() : setStep(step - 1));
  const next = () => (step >= total ? onDone() : setStep(step + 1));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3">
        <button onClick={onCancel}><ChevronLeft size={18} className="text-slate-400" /></button>
        <h1 className="text-lg font-bold text-slate-900">Create Workspace</h1>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6 flex items-center gap-3 text-sm text-slate-500">
          <button onClick={back} className="text-slate-400 hover:text-slate-700"><ArrowLeft size={18} /></button>
          <span className="h-4 w-px bg-slate-200" /> Step {step} of {total}
        </div>

        {step === 1 && (
          <>
            <h2 className="text-3xl font-bold text-slate-900">Create a Workspace</h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">Workspaces allow companies to build holistic views of meeting metrics, and allow for custom permissions across teams and individuals.</p>
            <label className="mt-7 block text-sm font-medium text-slate-600">Name your new organization</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your workspace name, e.g., Acme Inc..."
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400" />
            <button onClick={() => setAgreed(!agreed)} className="mt-5 flex items-center gap-2.5 text-left text-sm text-slate-600">
              <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded border " + (agreed ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white")}>{agreed && <Check size={13} />}</span>
              <span>I have read and agree to the <span className="font-medium text-violet-600">Data Processing Agreement</span></span>
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-3xl font-bold text-slate-900">Invite your team</h2>
            <p className="mt-3 text-[15px] text-slate-500">Add the people you want in this workspace. You can skip and do this later.</p>
            <div className="mt-6 space-y-3">
              {invites.map((iv, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input value={iv.email} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} placeholder="name@company.com"
                      className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-400" />
                  </div>
                  <select value={iv.role} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                    className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600 outline-none">
                    <option>Member</option><option>Admin</option><option>Viewer</option>
                  </select>
                  {invites.length > 1 && <button onClick={() => setInvites(invites.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>}
                </div>
              ))}
            </div>
            <button onClick={() => setInvites([...invites, { email: "", role: "Member" }])} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-800"><Plus size={15} /> Add another</button>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-3xl font-bold text-slate-900">Set permissions</h2>
            <p className="mt-3 text-[15px] text-slate-500">Choose the defaults for this workspace. You can change these anytime.</p>
            <div className="mt-6 space-y-3">
              {[
                { k: "viewMetrics", label: "Allow members to view team metrics", desc: "Everyone can see aggregated meeting metrics." },
                { k: "shareDefault", label: "Share reports by default", desc: "New reports are shared with the workspace automatically." },
                { k: "approveJoin", label: "Require approval to join", desc: "Admins must approve new members." },
              ].map((p) => (
                <div key={p.k} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                  <div className="pr-4"><div className="text-sm font-medium text-slate-700">{p.label}</div><div className="text-xs text-slate-400">{p.desc}</div></div>
                  <Toggle on={perms[p.k]} onChange={(v) => setPerms({ ...perms, [p.k]: v })} />
                </div>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-3xl font-bold text-slate-900">Connect a calendar</h2>
            <p className="mt-3 text-[15px] text-slate-500">Connect a calendar so Octomeet can auto-join your meetings. Optional.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[{ label: "Google Calendar", brand: "googleCalendar" }, { label: "Outlook Calendar", brand: "outlook" }].map((c) => (
                <button key={c.label} onClick={() => toast("Connecting " + c.label + "…")} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-300">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white"><BrandIcon name={c.brand} size={20} /></div>
                  <div><div className="text-sm font-medium text-slate-700">{c.label}</div><div className="text-xs text-slate-400">Connect</div></div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500"><Check size={24} /></div>
            <h2 className="mt-4 text-3xl font-bold text-slate-900">You're all set</h2>
            <p className="mt-3 text-[15px] text-slate-500">Review your workspace before finishing.</p>
            <div className="mt-6 space-y-2 rounded-xl border border-slate-200 bg-white p-5 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Workspace</span><span className="font-medium text-slate-700">{name || "-"}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Invites</span><span className="font-medium text-slate-700">{invites.filter((i) => i.email.trim()).length}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Share by default</span><span className="font-medium text-slate-700">{perms.shareDefault ? "On" : "Off"}</span></div>
            </div>
          </>
        )}

        <div className="mt-8 flex items-center gap-3">
          <button onClick={next} disabled={!canNext}
            className={"rounded-lg px-5 py-2.5 text-sm font-semibold transition " + (canNext ? "bg-violet-600 text-white hover:bg-violet-500" : "cursor-not-allowed bg-slate-200 text-slate-400")}>
            {step >= total ? "Finish" : "Next Step"}
          </button>
          <button onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm font-medium text-violet-600 hover:bg-violet-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== shared section header (ask bar) ============ */
function SectionTop({ title, onAsk, right }) {
  const [ask, setAsk] = useState("");
  return (
    <div className="border-b border-slate-200 bg-white px-6 pt-3 pb-3">
      <div className="mb-3 flex items-center gap-2">
        <ChevronLeft size={18} className="text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) onAsk(ask.trim()); }}
          className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white shadow-sm px-3 py-2 focus-within:border-violet-400">
          <button type="button" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-400"><Globe size={15} /><ChevronDown size={13} /></button>
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask Octo anything..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          <button type="submit" disabled={!ask.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-500 disabled:opacity-40"><Send size={15} /></button>
        </form>
        {right}
      </div>
    </div>
  );
}

/* ============================ FOLDERS ============================= */
const FOLDERS_KEY = "octomeet:folders:v1";
const FOLDER_DESCS = {
  "Partnership Alignment": "Discussions aimed at strengthening collaboration and alignment with partners.",
  "Job Interview": "Interviews evaluating candidates for open roles.",
  "One-on-One": "Two-person meetings for feedback, mentorship, or alignment.",
  "Sales Call": "Conversations with prospects focused on pitching or selling.",
  "Meetings": "Your recorded meetings.",
};
function FoldersView({ onAsk, meetings, onOpenFolder, user }) {
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState([]);
  useEffect(() => { (async () => setCustom((await store.get(FOLDERS_KEY, [])) || []))(); }, []);

  const counts = {}; const lastDate = {};
  (meetings || []).forEach((m) => { const f = m.folder || "Meetings"; counts[f] = (counts[f] || 0) + 1; if (!lastDate[f] || m.date > lastDate[f]) lastDate[f] = m.date; });
  const names = [...new Set([...Object.keys(counts), ...custom])];
  const folders = names.map((name) => ({ name, reports: counts[name] || 0, date: lastDate[name] || "", desc: FOLDER_DESCS[name] || "Custom folder." }))
    .filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.reports - a.reports);

  const newFolder = async () => {
    const name = window.prompt("New folder name");
    if (!name || !name.trim()) return;
    const n = name.trim();
    const next = [...new Set([...custom, n])];
    setCustom(next); await store.set(FOLDERS_KEY, next);
    toast("Folder created: " + n);
  };
  return (
    <>
      <SectionTop title="Folders" onAsk={onAsk} />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by folder title..." className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-violet-400" />
            </div>
          </div>
          <button onClick={newFolder} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-violet-500"><FolderPlus size={15} /> New Folder</button>
        </div>
        <div className="grid grid-cols-[1fr_120px_90px_140px] items-center border-b border-slate-200 px-3 pb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
          <div>Folder</div><div>Members</div><div>Reports</div><div>Last Updated</div>
        </div>
        {folders.map((f) => (
          <button key={f.name} onClick={() => onOpenFolder && onOpenFolder(f.name)} className="grid w-full grid-cols-[1fr_120px_90px_140px] items-center border-b border-slate-100 px-3 py-3.5 text-left transition hover:bg-violet-50/40">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-500"><Folder size={18} /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">{f.name}</div>
                <div className="truncate text-[12px] text-slate-500">{f.desc}</div>
              </div>
            </div>
            <div><Avatar name={user?.name || user?.email || "You"} email={user?.email} picture={user?.picture} size={28} /></div>
            <div className="text-sm text-slate-600">{f.reports}</div>
            <div className="text-[13px] text-slate-500">{f.date ? fmtDateFull(f.date) : "-"}</div>
          </button>
        ))}
        {!folders.length && <div className="py-16 text-center text-sm text-slate-400">No folders yet. Create one with “New Folder”.</div>}
      </div>
    </>
  );
}

/* ============================ CALENDAR ============================ */
const CAL_ARMED_KEY = "octomeet:calendar-armed:v1";
function CalendarView({ onAsk, initialTab, meetings, onOpen }) {
  const [tab, setTab] = useState(initialTab || "upcoming");
  const [realEvents, setRealEvents] = useState(null);
  const [armed, setArmed] = useState({});
  const [autoJoin, setAutoJoin] = useState(true);
  const [recallConnected, setRecallConnected] = useState(false);
  const loadEvents = async () => {
    try { const r = await fetch("/api/calendar/events"); if (r.ok) { const d = await r.json(); if (Array.isArray(d.events)) setRealEvents(d.events); } } catch (e) { /* not connected */ }
  };
  useEffect(() => {
    (async () => {
      await loadEvents();
      setArmed((await store.get(CAL_ARMED_KEY, {})) || {});
      let on = true;
      try { const s = await fetch("/api/settings"); if (s.ok) { const sd = await s.json(); on = sd.auto_join !== false; setAutoJoin(on); setRecallConnected(!!sd.recall_connected); } } catch (e) { /* default on */ }
      // Opening the Calendar immediately arms any new meetings (real-time auto-join).
      if (on) {
        try { const a = await fetch("/api/calendar/arm-all", { method: "POST" }); if (a.ok) { const ad = await a.json(); if (ad.armed > 0) { toast(`OctoMeet armed ${ad.armed} meeting${ad.armed > 1 ? "s" : ""} 🗓️`); await loadEvents(); } } } catch (e) { /* ignore */ }
      }
    })();
  }, []);
  // Cross-reference: calendar event id -> the processed meeting (status, score, report).
  const byEvent = {};
  (meetings || []).forEach((m) => { if (m.calendarEventId) byEvent[m.calendarEventId] = m; });

  const startBot = async (url, title, joinAt, calendarEventId) => {
    if (!url) { toast("This event has no meeting link"); return; }
    const future = joinAt && new Date(joinAt).getTime() > Date.now() + 30 * 1000;
    toast(future ? "Scheduling OctoMeet…" : "Sending OctoMeet to the meeting…");
    try {
      const r = await fetch("/api/recall/start-bot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingUrl: url, title, joinAt, calendarEventId, botName: notetakerName() }) });
      const d = await r.json();
      toast(r.ok ? (d.already ? "OctoMeet is already set for this meeting ✓" : future ? "OctoMeet will join automatically at the start time 🗓️" : "OctoMeet is joining 🎥") : ("Error: " + (d.error || "failed")));
    } catch (e) { toast("Network error"); }
  };
  const arm = (e, key, val) => {
    setArmed((s) => { const next = { ...s, [key]: val }; store.set(CAL_ARMED_KEY, next); return next; });
    if (val) startBot(e.url, e.name, e.startIso, e.eventId);
    else toast("OctoMeet won't join this one.");
  };
  const toggleAutoJoin = async (val) => {
    setAutoJoin(val);
    try { await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto_join: val }) }); } catch (e) { /* ignore */ }
    if (val) {
      toast("Auto-join ON - arming your meetings…");
      fetch("/api/calendar/arm-all", { method: "POST" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.armed > 0) toast(`OctoMeet will join ${d.armed} meeting${d.armed > 1 ? "s" : ""} 🗓️`); }).catch(() => {});
    } else toast("Auto-join OFF - toggle meetings individually.");
  };
  const events = [
    { name: "Morning Meeting", ppl: 39, date: "Sun, Jun 28", time: "3:30 AM - 4:30 AM", add: false, role: null },
    { name: "Acme Corp - Sync", ppl: 6, date: "Mon, Jun 29", time: "10:00 AM - 11:00 AM", add: true, role: "Report Owner" },
    { name: "Northwind - Demo", ppl: 3, date: "Tue, Jun 30", time: "10:00 AM - 11:00 AM", add: true, role: "Report Owner" },
    { name: "Vertex - 2nd Meeting", ppl: 4, date: "Fri, Jul 3", time: "12:00 PM - 1:00 PM", add: true, role: "Report Owner" },
  ];
  const links = [{ m: 15 }, { m: 30 }, { m: 60 }, { m: 90 }];
  const fmtEv = (iso) => {
    try { const d = new Date(iso); return { date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) }; }
    catch { return { date: iso, time: "" }; }
  };
  const totalTime = (startIso, endIso, guests) => {
    try {
      const mins = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
      if (!mins || mins < 0) return null;
      const g = Math.max(1, guests || 1);
      const each = mins >= 60 ? `${Math.round((mins / 60) * 10) / 10} hr` : `${mins} min`;
      const totMin = mins * g;
      const tot = totMin >= 60 ? `${Math.round((totMin / 60) * 10) / 10} hours` : `${totMin} minutes`;
      return `${each} × ${g} guest${g > 1 ? "s" : ""} = ${tot} total time`;
    } catch { return null; }
  };
  const display = realEvents && realEvents.length
    ? realEvents.map((e) => { const s = fmtEv(e.start); const en = fmtEv(e.end); return { name: e.title, ppl: e.attendees, date: s.date, time: `${s.time} - ${en.time}`, add: false, role: null, url: e.meetingUrl, startIso: e.start, endIso: e.end, eventId: e.id }; })
    : events;
  return (
    <>
      <SectionTop title="Calendar" onAsk={onAsk} right={<button onClick={async () => { try { await navigator.clipboard.writeText("https://cal.octomeet.ai/nicolas-82n88"); } catch (e) {} toast("Scheduling link copied"); }} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-violet-500"><Link2 size={15} /> Scheduling Link</button>} />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-5 flex items-center gap-5 border-b border-slate-200">
          {[{ k: "upcoming", l: "Upcoming" }, { k: "schedule", l: "Schedule" }, { k: "scheduling", l: "Scheduling" }].map((tb) => (
            <button key={tb.k} onClick={() => setTab(tb.k)} className={"border-b-2 pb-2.5 text-sm font-semibold transition " + (tab === tb.k ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700")}>{tb.l}</button>
          ))}
        </div>

        {tab === "upcoming" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
              <OctoLogo size={22} />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">Auto-join your meetings {recallConnected && autoJoin && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Calendar connected</span>}</div>
                <div className="text-[12px] text-slate-500">{recallConnected ? "Your Google Calendar is synced with OctoMeet - every meeting is recorded & analyzed automatically, in real time, even with the app closed." : "When on, OctoMeet automatically joins, records and analyzes every meeting on your calendar - you don't have to do anything."}</div>
              </div>
              <CalToggle on={autoJoin} onChange={toggleAutoJoin} />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-2"><FilterBtn label="Has video conferencing" /></div>
              <span className="flex items-center gap-2 text-[13px] text-slate-400"><RefreshCw size={13} /> {display.length} event{display.length === 1 ? "" : "s"}{realEvents && realEvents.length ? " · your Google Calendar" : " · demo"}</span>
            </div>
            <div className="grid grid-cols-[1.7fr_1fr_1.2fr_90px] items-center border-b border-slate-200 px-3 pb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              <div>Meeting</div><div>Date &amp; Time</div><div>OctoMeet</div><div>Join</div>
            </div>
            {display.map((e, i) => {
              const key = e.eventId || (e.name + "|" + e.date);
              const mtg = e.eventId ? byEvent[e.eventId] : null;
              const isArmed = mtg ? mtg.status !== "error" : (armed[key] ?? (autoJoin && !!e.url));
              const tt = e.startIso ? totalTime(e.startIso, e.endIso, e.ppl) : null;
              return (
                <div key={i} className="grid grid-cols-[1.7fr_1fr_1.2fr_90px] items-center border-b border-slate-100 px-3 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm"><Video size={18} className="text-emerald-500" /></div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{e.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400"><Users size={12} /> {tt || `${e.ppl} guests`}</div>
                    </div>
                  </div>
                  <div className="leading-tight"><div className="text-[13px] text-slate-700">{e.date}</div><div className="text-[12px] text-slate-400">{e.time}</div></div>
                  <div>
                    {mtg && mtg.status === "done" ? (
                      <button onClick={() => onOpen(mtg.id)} className="flex items-center gap-2 text-left">
                        <span className="flex h-7 items-center rounded-md px-2 text-[12px] font-bold text-white" style={{ background: scoreColor(mtg.scores.engagement || mtg.scores.overall) }}>{mtg.scores.engagement || mtg.scores.overall}</span>
                        <span className="text-[12px] font-semibold text-violet-600 hover:text-violet-800">View report ↗</span>
                      </button>
                    ) : mtg && mtg.status && mtg.status !== "scheduled" ? (
                      <StatusBadge status={mtg.status} />
                    ) : isArmed ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600"><CalendarCheck size={13} /> Will auto-join</span>
                    ) : (
                      <span className="text-[12px] text-slate-400">Off</span>
                    )}
                  </div>
                  <div><CalToggle on={isArmed} onChange={(val) => arm(e, key, val)} /></div>
                </div>
              );
            })}
            {!display.length && <div className="py-16 text-center text-sm text-slate-400">No upcoming meetings on your calendar.</div>}
          </>
        ) : tab === "schedule" ? (
          <ScheduleMeeting onCreated={loadEvents} />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <span className="flex items-center gap-1.5 text-slate-600"><BrandIcon name="googleCalendar" size={16} /> Scheduling based on: <b>nicolas@octomeet.ai</b> (Google Calendar)</span>
              <span className="flex gap-4 text-[13px] font-semibold text-violet-600"><button onClick={() => toast("Change calendar - coming soon")}>Change Calendar</button><button onClick={() => toast("Scheduling settings - coming soon")}>Scheduling Settings</button></span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Default scheduling links</h3>
              <p className="mb-4 text-sm text-slate-500">Allows others to schedule a meeting with you. <span className="text-violet-600">cal.octomeet.ai/nicolas-82n88</span></p>
              <div className="space-y-3">
                {links.map((l) => (
                  <div key={l.m} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-3">
                      <CalToggle on={true} />
                      <div><div className="text-sm font-semibold text-slate-800">{l.m}-minute Meeting</div><div className="text-[12px] text-violet-600">cal.octomeet.ai/nicolas-82n88/{l.m}-min</div></div>
                    </div>
                    <Link2 size={16} className="text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
// Smart Scheduler (internal): find free slots in Google Calendar, pick one, create the event
// with a Meet link + invites, and auto-arm the OctoMeet bot for it.
function ScheduleMeeting({ onCreated }) {
  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState("");
  const [durationMin, setDuration] = useState(30);
  const [slots, setSlots] = useState(null);
  const [picked, setPicked] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const findSlots = async () => {
    setLoading(true); setSlots(null); setPicked(null);
    try {
      const r = await fetch("/api/calendar/free-slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationMin, days: 7, timeZone: tz }) });
      const d = await r.json();
      if (!r.ok) { toast(d.error === "google_disconnected" ? "Reconnect Google to schedule" : "Couldn't load free times"); setSlots([]); }
      else setSlots(d.slots || []);
    } catch (e) { toast("Network error"); setSlots([]); } finally { setLoading(false); }
  };
  const create = async () => {
    if (!picked) return toast("Pick a time slot first");
    if (!title.trim()) return toast("Add a meeting title");
    setCreating(true);
    try {
      const emails = attendees.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const r = await fetch("/api/calendar/create-meeting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), start: picked.start, durationMin, attendees: emails, timeZone: tz }) });
      const d = await r.json();
      if (!r.ok) { toast(d.error === "google_disconnected" ? "Reconnect Google to schedule" : "Error: " + (d.error || "failed")); return; }
      toast(d.armed && d.armed.ok ? "Meeting created - OctoMeet will join & record 🗓️" : (d.armed && d.armed.skippedAutoJoinOff) ? "Meeting created (auto-join is off)" : "Meeting created ✓");
      setTitle(""); setAttendees(""); setPicked(null); setSlots(null);
      onCreated && onCreated();
    } catch (e) { toast("Network error"); } finally { setCreating(false); }
  };

  const dayKey = (iso) => new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const groups = {};
  (slots || []).forEach((s) => { const k = dayKey(s.start); (groups[k] = groups[k] || []).push(s); });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
        <OctoLogo size={22} />
        <div className="text-[13px] text-slate-600">Pick a free time from your Google Calendar. OctoMeet creates the event with a Meet link, invites everyone, and joins to record automatically.</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-[12px] font-semibold text-slate-500">Meeting title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product sync with Acme" className="mt-1 mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
        <label className="text-[12px] font-semibold text-slate-500">Invite (emails, comma or space separated)</label>
        <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="alex@acme.com, maria@acme.com" className="mt-1 mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
        <label className="text-[12px] font-semibold text-slate-500">Duration</label>
        <div className="mt-1.5 flex gap-2">
          {[15, 30, 45, 60].map((m) => (
            <button key={m} onClick={() => { setDuration(m); setSlots(null); setPicked(null); }} className={"rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition " + (durationMin === m ? "bg-violet-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>{m} min</button>
          ))}
          <div className="flex-1" />
          <button onClick={findSlots} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:opacity-60">{loading ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />} Find free times</button>
        </div>
      </div>

      {slots !== null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {slots.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No free slots in the next 7 days for a {durationMin}-min meeting. Try a shorter duration.</div>
          ) : (
            <>
              <div className="mb-3 text-[13px] font-semibold text-slate-700">Free times (next 7 days)</div>
              <div className="space-y-4">
                {Object.entries(groups).map(([day, items]) => (
                  <div key={day}>
                    <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{day}</div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((s) => (
                        <button key={s.start} onClick={() => setPicked(s)} className={"rounded-lg px-3 py-1.5 text-[13px] font-medium transition " + (picked && picked.start === s.start ? "bg-violet-600 text-white" : "border border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50")}>{hhmm(s.start)}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <div className="text-[12px] text-slate-500">{picked ? <>Selected: <b className="text-slate-700">{dayKey(picked.start)} · {hhmm(picked.start)}</b></> : "Pick a time above"}</div>
                <button onClick={create} disabled={creating || !picked || !title.trim()} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{creating ? <Loader2 size={15} className="animate-spin" /> : <Video size={15} />} Create meeting + Meet link</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function CalToggle({ on, onChange }) {
  const [v, setV] = useState(on);
  useEffect(() => { setV(on); }, [on]);
  const toggle = () => { const n = !v; setV(n); if (onChange) onChange(n); };
  return <button onClick={toggle} className={"relative h-6 w-11 shrink-0 rounded-full transition " + (v ? "bg-emerald-500" : "bg-slate-200")}><span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (v ? "left-[22px]" : "left-0.5")} /></button>;
}

/* ============================ ANALYTICS ============================= */
// Inline analytics over a chosen set of meetings (the selection in Reports).
function AnalyticsPanel({ meetings, onOpen, onClose }) {
  const RATE = 50; // assumed $/hour/participant for cost estimates
  const M = meetings || [];
  const n = M.length;
  const partCount = (m) => (m.participantsCount != null ? m.participantsCount : (m.participants ? m.participants.length : 0));
  const totalMin = M.reduce((a, m) => a + (m.durationMin || 0), 0);
  const avgMin = n ? Math.round(totalMin / n) : 0;
  const cost = Math.round(M.reduce((a, m) => a + ((m.durationMin || 0) / 60) * Math.max(1, partCount(m)) * RATE, 0));
  const avg = (f) => (n ? Math.round(M.reduce((a, m) => a + (f(m) || 0), 0) / n) : 0);
  const avgScore = avg((m) => m.scores && m.scores.overall);
  const avgEng = avg((m) => m.scores && m.scores.engagement);
  const avgPart = n ? (M.reduce((a, m) => a + partCount(m), 0) / n).toFixed(1) : "0";

  const allAI = M.flatMap((m) => m.actionItems || []);
  const aiTotal = allAI.length;
  const aiOwner = allAI.filter((a) => a.owner && String(a.owner).trim()).length;
  const aiDue = allAI.filter((a) => a.due && String(a.due).trim()).length;
  const execScore = aiTotal ? Math.round(100 * ((aiOwner / aiTotal) * 0.5 + (aiDue / aiTotal) * 0.5)) : 0;
  const withAgendaFollow = M.filter((m) => (m.actionItems || []).length || (m.nextSteps || []).length).length;
  const followRate = n ? Math.round((withAgendaFollow / n) * 100) : 0;

  const speakerAgg = {};
  M.forEach((m) => (m.participants || []).forEach((p) => { const k = p.name || "Speaker"; (speakerAgg[k] = speakerAgg[k] || { name: k, talk: 0, meets: 0 }); speakerAgg[k].talk += p.talkPct || 0; speakerAgg[k].meets++; }));
  const speakers = Object.values(speakerAgg).map((s) => ({ name: s.name, avgTalk: Math.round(s.talk / Math.max(1, s.meets)), meets: s.meets })).sort((a, b) => b.meets - a.meets).slice(0, 8);
  const silent = M.reduce((a, m) => a + (m.participants || []).filter((p) => (p.talkPct || 0) === 0).length, 0);

  const sent = { Positive: 0, Neutral: 0, Negative: 0 };
  M.forEach((m) => { const l = m.sentimentLabel || "Neutral"; sent[l] = (sent[l] || 0) + 1; });
  const topicCount = {}; M.forEach((m) => (m.topics || []).forEach((t) => (topicCount[t] = (topicCount[t] || 0) + 1)));
  const topTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const srcCount = {}; M.forEach((m) => { const s = m.source || "Other"; srcCount[s] = (srcCount[s] || 0) + 1; });

  const couldBeEmail = M.filter((m) => (m.actionItems || []).length === 0 && (m.scores && m.scores.engagement || 0) < 40);
  const longMeetings = M.filter((m) => (m.durationMin || 0) > 60);

  const Kpi = ({ label, value, sub, color }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[12px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: color || "#1e293b" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
  const Gauge = ({ label, value }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold text-slate-700">{label}</span><span className="text-lg font-bold" style={{ color: scoreColor(value) }}>{value}</span></div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: value + "%", background: scoreColor(value) }} /></div>
    </div>
  );
  const Bars = ({ title, rows, max, fmt }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 text-sm font-bold text-slate-800">{title}</div>
      {rows.length ? (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-40 shrink-0 truncate text-[13px] text-slate-600">{r.label}</div>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: (max ? Math.round((r.value / max) * 100) : r.value) + "%" }} /></div>
              <div className="w-14 shrink-0 text-right text-[12px] font-semibold text-slate-700">{fmt ? fmt(r.value) : r.value}</div>
            </div>
          ))}
        </div>
      ) : <div className="py-6 text-center text-[13px] text-slate-400">No data yet.</div>}
    </div>
  );
  const H = ({ children }) => <div className="mt-2 mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-400">{children}</div>;
  const maxTopic = Math.max(1, ...topTopics.map((t) => t[1]));
  const maxSrc = Math.max(1, ...Object.values(srcCount));

  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onClose} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-violet-500"><ArrowLeft size={15} /> Back to reports</button>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><BarChart3 size={16} className="text-violet-600" /> Analytics · {n} meeting{n === 1 ? "" : "s"} selected</div>
      </div>
      {n === 0 ? (
        <div className="py-24 text-center text-sm text-slate-400">Select meetings to see analytics.</div>
      ) : (
          <div className="space-y-6">
            <H>Overview</H>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Meetings" value={n} />
              <Kpi label="Total hours" value={(totalMin / 60).toFixed(1)} />
              <Kpi label="Avg duration" value={avgMin + "m"} />
              <Kpi label="Avg participants" value={avgPart} />
              <Kpi label="Est. cost" value={"$" + cost.toLocaleString()} sub={"~$" + RATE + "/h/person"} />
              <Kpi label="Avg Read Score" value={avgScore} color={scoreColor(avgScore)} />
            </div>

            <H>Scores</H>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Gauge label="Meeting Quality" value={avgScore} />
              <Gauge label="Engagement" value={avgEng} />
              <Gauge label="Execution" value={execScore} />
            </div>

            <H>People & Participation</H>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Bars title="Most active people (avg talk-time)" rows={speakers.map((s) => ({ label: s.name, value: s.avgTalk }))} max={100} fmt={(v) => v + "%"} />
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Silent participants" value={silent} sub="never spoke" color={silent ? "#F97316" : "#16A34A"} />
                <Kpi label="Balanced talk-time" value={avg((m) => m.scores && m.scores.balance)} color={scoreColor(avg((m) => m.scores && m.scores.balance))} />
                <Kpi label="Positive sentiment" value={sent.Positive} sub="meetings" color="#16A34A" />
                <Kpi label="Negative sentiment" value={sent.Negative} sub="meetings" color={sent.Negative ? "#EF4444" : "#94A3B8"} />
              </div>
            </div>

            <H>Meeting Effectiveness & Execution</H>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Action items" value={aiTotal} />
              <Kpi label="With owner" value={aiTotal ? Math.round((aiOwner / aiTotal) * 100) + "%" : "-"} color={scoreColor(aiTotal ? (aiOwner / aiTotal) * 100 : 0)} />
              <Kpi label="With deadline" value={aiTotal ? Math.round((aiDue / aiTotal) * 100) + "%" : "-"} color={scoreColor(aiTotal ? (aiDue / aiTotal) * 100 : 0)} />
              <Kpi label="With follow-up" value={followRate + "%"} sub="have next steps" color={scoreColor(followRate)} />
            </div>

            <H>Meeting Intelligence</H>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Bars title="Top topics" rows={topTopics.map(([t, c]) => ({ label: t, value: c }))} max={maxTopic} />
              <Bars title="Meetings by source" rows={Object.entries(srcCount).map(([s, c]) => ({ label: s, value: c }))} max={maxSrc} />
            </div>

            <H>Improvement Opportunities</H>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><div className="text-2xl font-bold text-amber-700">{couldBeEmail.length}</div><div className="text-[12px] text-slate-600">Could have been an email <span className="text-slate-400">(no action items, low engagement)</span></div></div>
                <div><div className="text-2xl font-bold text-amber-700">{longMeetings.length}</div><div className="text-[12px] text-slate-600">Long meetings <span className="text-slate-400">(over 60 min)</span></div></div>
                <div><div className="text-2xl font-bold text-amber-700">{silent}</div><div className="text-[12px] text-slate-600">Silent participants <span className="text-slate-400">(consider not inviting)</span></div></div>
              </div>
              {(couldBeEmail.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {couldBeEmail.slice(0, 6).map((m) => (
                    <button key={m.id} onClick={() => onOpen(m.id)} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:border-amber-300">{m.title}</button>
                  ))}
                </div>
              )}
            </div>

            <p className="pt-2 text-center text-[11px] leading-relaxed text-slate-400">
              Computed from the selected meetings. Deeper KPIs (punctuality, invited-vs-attended, camera/mic, technical audio quality, agenda adherence) arrive with the in-house capture bot, which surfaces that data.
            </p>
          </div>
      )}
    </div>
  );
}

/* ============================ FOR YOU ============================= */
function ForYouView({ meetings, onOpen, onAsk, user }) {
  const [aiFilter, setAiFilter] = useState("all");
  const uName = ((user && user.name) || (user && user.email) || "there").split(" ")[0];
  const meRe = new RegExp(uName.replace(/[^a-z0-9]/gi, ""), "i");
  const allActions = meetings.flatMap((m) => (m.actionItems || []).map((a) => ({ ...a, meeting: m.title, id: m.id, date: m.date })));
  const actions = (aiFilter === "me" ? allActions.filter((a) => meRe.test(a.owner || "")) : allActions).slice(0, 8);
  const topicCount = {};
  meetings.forEach((m) => (m.topics || []).forEach((t) => { topicCount[t] = (topicCount[t] || 0) + 1; }));
  const topTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const summaries = meetings.filter((m) => m.summary && m.summary.length > 30);
  const lead = summaries[0];
  const hi = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; })();
  return (
    <>
      <SectionTop title="For You" onAsk={onAsk} right={<span className="flex items-center gap-2 rounded-lg bg-slate-100 px-3.5 py-2 text-[13px] font-medium text-slate-600"><Calendar size={14} className="text-slate-400" /> {meetings.length} meeting{meetings.length === 1 ? "" : "s"}</span>} />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
              <h2 className="text-2xl font-bold text-violet-700">{hi}, {uName}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">A digest from your {meetings.length} most recent meeting{meetings.length === 1 ? "" : "s"}</p>
              <div className="mt-3 flex gap-4">
                <p className="flex-1 text-sm leading-relaxed text-slate-600">{lead ? lead.summary : "Once your meetings are analyzed, your personalized digest - top topics, summaries and action items across meetings - will appear here."}</p>
                <VideoThumb src={(lead && lead.video) || VIDEOS[0]} source={(lead && lead.source) || "Google Meet"} size={120} rounded="rounded-xl" showBadge={false} />
              </div>
            </div>
            <Card title="Topics" icon={MessageSquareText}>
              <p className="mb-3 text-[13px] text-slate-400">Topic progression across your meetings</p>
              {topTopics.length ? <div className="space-y-2">
                {topTopics.map(([t, n], i) => (
                  <div key={i} className="rounded-xl bg-violet-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-800">{t}</h4>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-violet-600">{Math.round((n / meetings.length) * 100)}% of meetings</span>
                    </div>
                    <div className="mt-1 text-[12px] text-slate-400">From {n} meeting{n === 1 ? "" : "s"}</div>
                  </div>
                ))}
              </div> : <p className="text-sm text-slate-400">No topics yet - analyze a meeting to see topic trends.</p>}
            </Card>
            <Card title="Summary" icon={Sparkles}>
              {summaries.length ? <div className="space-y-3">
                {summaries.slice(0, 3).map((m, i) => (
                  <button key={i} onClick={() => onOpen(m.id)} className="block w-full text-left">
                    <div className="text-[13px] font-semibold text-slate-700">{m.title}</div>
                    <p className="text-sm leading-relaxed text-slate-600">{m.summary}</p>
                  </button>
                ))}
              </div> : <p className="text-sm text-slate-400">No summaries yet.</p>}
            </Card>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl bg-violet-900 p-5 text-white">
              <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-base font-bold">Daily Read <span className="rounded bg-violet-500 px-1.5 py-0.5 text-[10px]">✨ beta</span></h3><Link2 size={15} className="text-violet-300" /></div>
              <p className="mt-0.5 text-sm text-violet-200">June 26, 2026</p>
              <div className="mt-3 h-1 w-full rounded-full bg-violet-700"><div className="h-1 w-0 rounded-full bg-white" /></div>
              <div className="mt-2 flex items-center gap-3"><Play size={18} fill="white" /><span className="text-[12px] text-violet-300">--:-- / --:--</span></div>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-violet-800 p-2.5 text-[12px] text-violet-200">ℹ The text-to-speech voice you are hearing is AI-generated and not a human voice.</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><CheckCircle2 size={16} className="text-violet-500" /> Action Items</h3><div className="flex rounded-lg bg-slate-100 p-0.5 text-[12px]"><button onClick={() => setAiFilter("me")} className={"rounded-md px-2 py-0.5 font-semibold " + (aiFilter === "me" ? "bg-violet-600 text-white" : "text-slate-500")}>For me</button><button onClick={() => setAiFilter("all")} className={"rounded-md px-2 py-0.5 font-semibold " + (aiFilter === "all" ? "bg-violet-600 text-white" : "text-slate-500")}>All</button></div></div>
              <div className="space-y-3">
                {actions.map((a, i) => (
                  <button key={i} onClick={() => onOpen(a.id)} className="block w-full border-b border-slate-100 pb-3 text-left last:border-0">
                    <div className="text-[13px] text-slate-700">{a.task} <span className="font-semibold text-violet-600">Ask Octo</span></div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400"><Calendar size={11} /> {a.date ? fmtDateFull(a.date) : ""} · <FileText size={11} /> {a.meeting}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================ COACHING ============================ */
function CoachingView({ onAsk }) {
  const moments = [{ w: 223, m: "Vertex Retail" }, { w: 225, m: "Vertex Retail" }, { w: 244, m: "Acme - Outreach" }, { w: 224, m: "Northwind" }];
  return (
    <>
      <SectionTop title="Coaching" onAsk={onAsk} right={<span className="flex items-center gap-2 rounded-lg bg-slate-100 px-3.5 py-2 text-[13px] font-medium text-slate-600"><Calendar size={14} className="text-slate-400" /> May 27 - Jun 26, 2026</span>} />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2"><h3 className="text-base font-bold text-slate-900">Clarity</h3><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">GOOD</span></div>
              <div className="space-y-2">
                <CoachMetric icon={Activity} label="Talking pace" value="130 wpm" ok active />
                <CoachMetric icon={MessageSquareText} label="Filler words" value="1% of speech" ok />
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-base font-bold text-slate-900">Inclusion</h3>
              <CoachMetric icon={X} label="Non-inclusive terms" value="<1 per meeting" ok />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2"><h3 className="text-base font-bold text-slate-900">Impact</h3><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">GOOD</span></div>
              <div className="space-y-2">
                <CoachMetric icon={Target} label="Bias" value="80" ok />
                <CoachMetric icon={Sparkles} label="Charisma" value="80" ok />
                <CoachMetric icon={HelpCircle} label="Questions asked" value="<1 per meeting" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-slate-900">Talking pace</h3><span className="flex items-center gap-1 text-lg font-bold text-slate-900">130 wpm <CheckCircle2 size={16} className="text-emerald-500" /></span></div>
              <p className="mt-1 text-sm text-slate-500">Your average rate of speech in words per minute. <b>You speak at 130 WPM, within the recommended range of 130-175 WPM. Keep it up!</b></p>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between text-[12px] text-slate-400"><span>Range</span><span>Your pace</span></div>
                <div className="relative mt-2 h-2 rounded-full" style={{ background: "linear-gradient(90deg,#10B981,#F59E0B,#F43F5E)" }}><span className="absolute -top-1 h-4 w-4 rounded-full border-2 border-violet-600 bg-white" style={{ left: "0%" }} /></div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>130</span><span>270</span></div>
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Moments</h3>
              <p className="mb-3 text-sm text-slate-500">Review your moments with talking speed outside of the target zone.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {moments.map((mm, i) => (
                  <div key={i}>
                    <VideoThumb src={VIDEOS[i]} source="Google Meet" size={150} rounded="rounded-xl" showBadge={false} />
                    <div className="mt-1 text-[12px] font-medium text-slate-700">Very fast ({mm.w} wpm)</div>
                    <div className="text-[11px] text-slate-400">{mm.m}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Meetings</h3>
              <p className="mb-2 text-sm text-slate-500">Review meeting reports where your talking speed was outside the target zone.</p>
              <div className="grid grid-cols-[1.6fr_1fr_90px_70px_70px] border-b border-slate-200 px-3 pb-2 text-[12px] font-semibold uppercase text-slate-400"><div>Meeting</div><div>Date &amp; Time</div><div>Talk Time</div><div>WPM</div><div>% Filler</div></div>
              <div className="grid grid-cols-[1.6fr_1fr_90px_70px_70px] items-center border-b border-slate-100 px-3 py-3 text-[13px]">
                <div><div className="font-semibold text-slate-800">Vertex Retail</div><div className="text-[12px] text-slate-400">2 participants</div></div>
                <div className="text-slate-500">Tue 6/16/26<br />12:02 - 12:11 PM</div><div className="text-slate-600">23%</div><div className="flex items-center gap-1 text-slate-600">181 <AlertTriangle size={12} className="text-amber-500" /></div><div className="text-slate-600">1%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
function CoachMetric({ icon: Icon, label, value, ok, active }) {
  return (
    <div className={"flex items-center justify-between rounded-xl border bg-white p-3.5 " + (active ? "border-violet-300 ring-1 ring-violet-200" : "border-slate-200")}>
      <span className="flex items-center gap-2 text-sm text-slate-700"><Icon size={15} className="text-violet-400" /> {label}</span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">{value} {ok && <CheckCircle2 size={15} className="text-emerald-500" />}</span>
    </div>
  );
}

/* ======================== RECOMMENDATIONS ========================= */
function RecommendationsView({ onAsk }) {
  const list = [
    { name: "Acme - Growth Review", n: 4, date: "Mon 6/15 · 11:00 AM - 12:00 PM" },
    { name: "Globex & Octo", n: 1, date: "Mon 6/15 · 1:00 PM - 2:00 PM" },
    { name: "Northwind & Octo", n: 2, date: "Tue 6/16 · 12:00 PM - 1:00 PM" },
    { name: "Vertex - Sync", n: 6, date: "Thu 6/18 · 3:00 PM - 4:00 PM" },
    { name: "Initech & Octo", n: 2, date: "Fri 6/19 · 10:00 AM - 10:45 AM" },
    { name: "Lumio - 1st Intro", n: 1, date: "Mon 6/22 · 9:00 AM - 9:30 AM" },
  ];
  const [sel, setSel] = useState(0);
  const [recTab, setRecTab] = useState("new");
  const [items, setItems] = useState([
    { text: "Nicolas Benech will send an email with the company's organizational structure and operational details to start implementation.", quote: "Yeah, the basic thing we need to start is the structure of the company with the organization.", who: "Nicolas Benech" },
    { text: "Nicolas Benech will arrange a meeting with the customer's IT team to discuss sales and data integration.", quote: "If you want to see all the sales and everything, we can do a meeting with the IT and everything.", who: "Nicolas Benech" },
    { text: "Tony Cola will send an email to arrange a follow-up meeting.", quote: "Send us an email and we meet up together and everything.", who: "Daniel Lopez" },
  ]);
  const resolve = (i, kind) => { setItems((arr) => arr.filter((_, j) => j !== i)); toast(kind); };
  return (
    <>
      <SectionTop title="Recommendations" onAsk={onAsk} right={<span className="flex items-center gap-2 rounded-lg bg-slate-100 px-3.5 py-2 text-[13px] font-medium text-slate-600"><Calendar size={14} className="text-slate-400" /> Apr 26 - Jun 26, 2026</span>} />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-200">
          <div className="flex items-center gap-4 border-b border-slate-200 px-4 py-3 text-sm font-semibold">
            <button onClick={() => setRecTab("new")} className={"flex items-center gap-1 " + (recTab === "new" ? "text-violet-700" : "text-slate-400")}>New <span className="rounded-full bg-violet-600 px-1.5 text-[11px] text-white">19</span></button>
            <button onClick={() => setRecTab("reviewed")} className={recTab === "reviewed" ? "text-violet-700" : "text-slate-400"}>Reviewed</button>
            <button onClick={() => toast("Filters - coming soon")} className="ml-auto text-[13px] font-medium text-violet-600">Show filters</button>
          </div>
          {recTab === "reviewed" && <div className="px-4 py-16 text-center text-sm text-slate-400">No reviewed recommendations yet.</div>}
          {recTab === "new" && list.map((r, i) => (
            <button key={i} onClick={() => setSel(i)} className={"block w-full border-b border-slate-100 px-4 py-3 text-left transition " + (sel === i ? "bg-violet-50/60" : "hover:bg-slate-50")}>
              <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-800">{r.name}</span><span className="flex items-center gap-1 text-[12px] text-slate-500"><Zap size={12} className="text-violet-400" /> {r.n}</span></div>
              <div className="mt-1 flex items-center gap-1 text-[12px] text-slate-400"><Calendar size={11} /> {r.date}</div>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 flex items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{list[sel].name}</h2><span className="flex items-center gap-1 rounded bg-violet-50 px-2 py-0.5 text-[12px] font-semibold text-violet-700"><Zap size={12} /> {list[sel].n}</span></div>
          <div className="space-y-4">
            {!items.length && <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">All recommendations handled 🎉</div>}
            {items.map((it, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CheckCircle2 size={16} className="text-violet-500" /> Action item for you</span>
                  <div className="flex gap-2">
                    <button onClick={() => resolve(i, "Acknowledged")} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"><ThumbsUp size={14} /> Acknowledge</button>
                    <button onClick={() => resolve(i, "Ignored")} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-rose-600 hover:bg-rose-50"><X size={14} /> Ignore</button>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">{it.text}</p>
                    <p className="mt-2 text-[12px] font-semibold text-slate-500">More Details</p>
                    <p className="text-[13px] text-slate-500">{it.who}: "{it.quote}"</p>
                  </div>
                  <VideoThumb src={VIDEOS[i]} source="Google Meet" size={120} rounded="rounded-xl" showBadge={false} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================ INTEGRATIONS ======================= */
// Reusable connect form for a webhook/Notion-token integration -> POST /api/integrations.
function ConnectIntegrationModal({ item, onClose, onSaved }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [auto, setAuto] = useState(true); const [busy, setBusy] = useState(false);
  const kind = item.kind;
  const save = async () => {
    const config = kind === "notion" ? { token: a.trim(), parent: b.trim(), autoPush: auto } : { url: a.trim(), autoPush: auto };
    if (!(config.url || config.token)) { toast("Pegá la URL / token primero"); return; }
    setBusy(true);
    try { const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: item.key, config }) }); if (!r.ok) throw 0; toast(item.name + " connected"); onSaved(item.key); onClose(); }
    catch (e) { toast("No se pudo conectar"); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">{item.icon}</span><h3 className="text-base font-bold text-slate-900">Connect {item.name}</h3><button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700"><X size={18} /></button></div>
        {kind === "notion" ? (
          <>
            <label className="text-[12px] font-medium text-slate-500">Notion integration token</label>
            <input value={a} onChange={(e) => setA(e.target.value)} placeholder="secret_…" className="mb-3 mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
            <label className="text-[12px] font-medium text-slate-500">Parent page ID</label>
            <input value={b} onChange={(e) => setB(e.target.value)} placeholder="32-char page id" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Free: create an integration at notion.so/my-integrations, share a page with it, paste the token + page ID.</p>
          </>
        ) : (
          <>
            <label className="text-[12px] font-medium text-slate-500">{kind === "slack" ? "Slack Incoming Webhook URL" : "Webhook URL"}</label>
            <input value={a} onChange={(e) => setA(e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{kind === "slack" ? "Free Slack Incoming Webhook (api.slack.com/messaging/webhooks)." : item.key === "webhooks" ? "Any endpoint that accepts a POST (Discord, your server)." : `Free Zapier/Make webhook that creates the ${item.name} record.`}</p>
          </>
        )}
        <button onClick={() => setAuto((v) => !v)} className="mt-3 flex items-center gap-2 text-[13px] text-slate-600">
          <span className={"flex h-4 w-4 items-center justify-center rounded border " + (auto ? "border-violet-600 bg-violet-600" : "border-slate-300")}>{auto && <Check size={11} className="text-white" />}</span> Auto-send new reports here when they're ready
        </button>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:opacity-60">Connect</button>
        </div>
      </div>
    </div>
  );
}

function IntegrationsView({ onAsk }) {
  const [conn, setConn] = useState({});   // backend connection state per key
  const [cfg, setCfg] = useState(null);    // integration being configured
  const load = () => fetch("/api/integrations").then((r) => (r.ok ? r.json() : {})).then((d) => setConn(d.connected || {})).catch(() => {});
  useEffect(() => { load(); }, []);
  const disconnect = async (it) => { try { await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: it.key, config: null }) }); } catch (e) {} setConn((c) => ({ ...c, [it.key]: false })); toast(it.name + " disconnected"); };
  const Group = ({ title, desc, items }) => (
    <div>
      <div className="text-sm font-bold text-slate-800">{title}</div>
      {desc && <p className="mb-2 text-[13px] text-slate-500">{desc}</p>}
      <div className="mt-2 rounded-xl border border-slate-200 bg-white">
        {items.map((it) => {
          const isOn = it.oauth ? true : !!conn[it.key];
          return (
            <div key={it.name} className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-base">{it.icon}</div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">{it.name}{it.soon && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">SOON</span>}</div>
                  {isOn ? <div className="text-[12px] font-medium text-emerald-600">Connected</div> : <div className="text-[12px] text-slate-400">{it.desc}</div>}
                </div>
              </div>
              {it.soon ? <span className="text-[12px] text-slate-300">Coming soon</span>
                : it.oauth ? <span className="rounded-lg border border-slate-200 px-4 py-1.5 text-[13px] font-medium text-slate-400">Connected</span>
                : isOn ? <button onClick={() => disconnect(it)} className="rounded-lg border border-violet-300 px-4 py-1.5 text-[13px] font-semibold text-violet-700 hover:bg-violet-50">Disconnect</button>
                : <button onClick={() => setCfg(it)} className="rounded-lg bg-violet-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-500">Connect</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <>
      <SectionTop title="Integrations" onAsk={onAsk} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <SecHead icon={LayoutGrid} title="Integrations" desc="Manage and connect external tools and services to OctoMeet." />
          <Group title="Calendar & Meetings" desc="Allow OctoMeet to join your meetings and automatically generate summaries." items={[
            { name: "Google Calendar", icon: <BrandIcon name="googleCalendar" />, oauth: true },
            { name: "Google Meet", icon: <BrandIcon name="googleMeet" />, oauth: true },
            { name: "Outlook Calendar", icon: <BrandIcon name="outlook" />, desc: "Connect your calendar", soon: true },
            { name: "Zoom", icon: <BrandIcon name="zoom" />, desc: "Auto-join Zoom calls", soon: true },
          ]} />
          <Group title="Apps" desc="Push your reports + action items into the tools you use. Free via incoming webhooks / Notion token." items={[
            { name: "Octomeet Web Extension", icon: <BrandIcon name="extension" />, oauth: true },
            { name: "Slack", icon: <BrandIcon name="slack" />, key: "slack", kind: "slack", desc: "Push reports to a channel" },
            { name: "Notion", icon: <BrandIcon name="notion" />, key: "notion", kind: "notion", desc: "Send reports to a Notion page" },
            { name: "Webhooks", icon: <BrandIcon name="mcp" />, key: "webhooks", kind: "webhook", desc: "POST reports to any endpoint" },
            { name: "Confluence", icon: <LayoutGrid size={16} className="text-sky-600" />, key: "confluence", kind: "webhook", desc: "Via a Zapier/Make webhook" },
            { name: "Asana", icon: <BrandIcon name="asana" />, desc: "Create tasks from action items", soon: true },
          ]} />
          <Group title="CRM" desc="Sync meeting context to your CRM (via a free Zapier/Make webhook)." items={[
            { name: "HubSpot", icon: <BrandIcon name="hubspot" />, key: "hubspot", kind: "webhook", desc: "Log meetings to HubSpot" },
            { name: "Salesforce", icon: <BrandIcon name="salesforce" />, key: "salesforce", kind: "webhook", desc: "Log meetings to Salesforce" },
          ]} />
          <Group title="AI" desc="Programmatically access meeting context." items={[
            { name: "Anthropic Claude", icon: <BrandIcon name="claude" />, desc: "Powering your reports", oauth: true },
            { name: "OpenAI ChatGPT", icon: <BrandIcon name="openai" />, desc: "Connect ChatGPT", soon: true },
            { name: "MCP Server", icon: <BrandIcon name="mcp" />, desc: "Model Context Protocol", soon: true },
            { name: "API", icon: <BrandIcon name="api" />, desc: "Build with the OctoMeet API", soon: true },
          ]} />
        </div>
      </div>
      {cfg && <ConnectIntegrationModal item={cfg} onClose={() => setCfg(null)} onSaved={() => load()} />}
    </>
  );
}

/* ============================ MEETING POLICY ===================== */
const DEFAULT_POLICY = { autoJoin: true, recording: true, consent: true, affective: true, externalShare: false, lockMembers: false, which: "all", who: "any", retention: "90", notetakerName: "OctoMeet AI" };
function MeetingPolicyView({ onAsk }) {
  const [p, setP] = useState(DEFAULT_POLICY);
  // Single source of truth = the DB (so the auto-join cron + bot honor it). Falls back to the
  // local copy while the request is in flight.
  useEffect(() => {
    (async () => { const saved = await store.get(POLICY_KEY, null); if (saved) setP((s) => ({ ...s, ...saved })); })();
    fetch("/api/settings").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.policy && Object.keys(d.policy).length) setP((s) => ({ ...DEFAULT_POLICY, ...s, ...d.policy })); else if (d) setP((s) => ({ ...s, autoJoin: d.auto_join !== false, notetakerName: d.notetaker_name || s.notetakerName })); }).catch(() => {});
  }, []);
  const set1 = (k, v) => setP((s) => {
    const next = { ...s, [k]: v };
    store.set(POLICY_KEY, next);
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policy: next }) }).then(() => toast("Policy saved")).catch(() => toast("Policy saved locally"));
    return next;
  });
  const which = p.which, who = p.who, retention = p.retention;
  return (
    <>
      <SectionTop title="Meeting Policy" onAsk={onAsk} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          <SecHead icon={ShieldCheck} title="Meeting Policy" desc="Set organization-wide rules for how Octomeet joins, records, and shares meetings." />
          <div className="rounded-lg bg-violet-50 p-3 text-[13px] text-violet-700">These defaults apply to everyone in your workspace (octomeet.ai). Members can be allowed to override them below.</div>

          <div className="text-sm font-bold text-slate-800">Auto-Join</div>
          <ToggleRow title="Auto-Join meetings" desc="Octomeet automatically joins scheduled meetings from connected calendars." on={p.autoJoin} onChange={(v) => set1("autoJoin", v)}>
            {p.autoJoin && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-[13px] font-semibold text-slate-700">Which meetings</div>
                  <Radio label="All calendar events" desc="Join every meeting on members' calendars" def checked={which === "all"} onClick={() => set1("which", "all")} />
                  <Radio label="Events the member is hosting" desc="Only join meetings the member created or owns" checked={which === "host"} onClick={() => set1("which", "host")} />
                </div>
                <div>
                  <div className="mb-1 text-[13px] font-semibold text-slate-700">Who's invited</div>
                  <Radio label="Any participants" desc="Join regardless of who is invited" def checked={who === "any"} onClick={() => set1("who", "any")} />
                  <Radio label="Internal only" desc="Only when all invitees are @octomeet.ai" checked={who === "internal"} onClick={() => set1("who", "internal")} />
                </div>
              </div>
            )}
          </ToggleRow>

          <div className="text-sm font-bold text-slate-800">Recording & Data</div>
          <ToggleRow title="Allow recording & transcription" desc="Let Octomeet record and transcribe meetings for reports." on={p.recording} onChange={(v) => set1("recording", v)} />
          <ToggleRow title="Require participant consent" desc="Announce and require consent before recording starts." on={p.consent} onChange={(v) => set1("consent", v)} />
          <ToggleRow title="Affective metrics" desc="Allow engagement, sentiment, charisma and bias scoring across the org." on={p.affective} onChange={(v) => set1("affective", v)} />
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-800">Data retention</div>
            <p className="mb-2 text-[13px] text-slate-500">How long meeting data is kept before automatic deletion.</p>
            <select value={retention} onChange={(e) => set1("retention", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400">
              <option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="forever">Keep forever</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-800">Notetaker display name</div>
            <p className="mb-2 text-[13px] text-slate-500">The name the bot shows as when it joins your meetings.</p>
            <input value={p.notetakerName} onChange={(e) => set1("notetakerName", e.target.value)} placeholder="OctoMeet AI" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
          </div>

          <div className="text-sm font-bold text-slate-800">Permissions</div>
          <ToggleRow title="Allow external report sharing" desc="Members can share reports with people outside octomeet.ai." on={p.externalShare} onChange={(v) => set1("externalShare", v)} />
          <ToggleRow title="Lock settings for members" desc="Members cannot override these workspace defaults." on={p.lockMembers} onChange={(v) => set1("lockMembers", v)} />
        </div>
      </div>
    </>
  );
}

/* ============================ LOGIN / AUTH ======================= */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 24 24" fill="#000" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
// Official-style brand logos (inline SVG) for integrations.
function BrandIcon({ name, size = 20 }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true };
  switch (name) {
    case "google": return <span style={{ display: "inline-flex" }}><GoogleIcon /></span>;
    case "microsoft": return <span style={{ display: "inline-flex" }}><MicrosoftIcon /></span>;
    case "apple": return <span style={{ display: "inline-flex" }}><AppleIcon /></span>;
    case "googleCalendar": return (
      <svg {...s}><rect x="4.5" y="4.5" width="15" height="15" rx="2.5" fill="#fff" stroke="#DADCE0" /><path d="M4.5 7a2.5 2.5 0 0 1 2.5-2.5h1.5v15H7A2.5 2.5 0 0 1 4.5 17z" fill="#4285F4" opacity=".12" /><text x="12.2" y="15.6" textAnchor="middle" fontFamily="Arial" fontSize="8.5" fontWeight="700" fill="#4285F4">31</text></svg>
    );
    case "googleMeet": return (
      <svg width={size} height={size} viewBox="0 0 87 72" aria-hidden style={{ display: "block" }}>
        <path fill="#00832d" d="M49.5 36l8.53 9.75 11.47 7.33 2-17.02L69.5 19.42 58 25.65z" />
        <path fill="#0066da" d="M0 51.5V66c0 3.315 2.685 6 6 6h14.5l3-10.96-3-9.54-9.95-3z" />
        <path fill="#e94235" d="M20.5 0L0 20.5l10.55 2.96 9.95-2.96 2.96-9.41z" />
        <path fill="#2684fc" d="M20.5 20.5H0v31h20.5z" />
        <path fill="#00ac47" d="M82.6 8.68L69.5 19.42v33.66l13.13 10.73c1.96 1.6 4.87.2 4.87-2.3V10.98c0-2.5-2.91-3.9-4.9-2.3z" />
        <path fill="#00ac47" d="M49.5 36v15.5h-29V72h43c3.315 0 6-2.685 6-6V53.08z" />
        <path fill="#ffba00" d="M63.5 0h-43v20.5h29V36l20-16.58V6c0-3.315-2.685-6-6-6z" />
      </svg>
    );
    case "outlook": return (
      <svg {...s}><rect x="3" y="5" width="18" height="14" rx="2.5" fill="#0F6CBD" /><path d="M11 8h8v8h-8z" fill="#fff" opacity=".25" /><ellipse cx="8" cy="12" rx="3.2" ry="3.6" fill="#fff" /><ellipse cx="8" cy="12" rx="1.4" ry="1.7" fill="#0F6CBD" /></svg>
    );
    case "zoom": return (
      <svg {...s}><rect width="24" height="24" rx="6" fill="#2D8CFF" /><path d="M6 9.5A1.5 1.5 0 0 1 7.5 8h5A1.5 1.5 0 0 1 14 9.5v5A1.5 1.5 0 0 1 12.5 16h-5A1.5 1.5 0 0 1 6 14.5zM15 10.5l3-2v7l-3-2z" fill="#fff" /></svg>
    );
    case "teams": return (
      <svg {...s}><rect width="24" height="24" rx="6" fill="#5059C9" /><circle cx="16" cy="8" r="2.2" fill="#fff" opacity=".85" /><rect x="6" y="8" width="9" height="9" rx="1.5" fill="#fff" /><text x="10.5" y="15" textAnchor="middle" fontFamily="Arial" fontSize="7" fontWeight="700" fill="#5059C9">T</text></svg>
    );
    case "slack": return (
      <svg {...s}><path d="M9 13.5a1.6 1.6 0 1 1-1.6-1.6H9z" fill="#E01E5A" /><path d="M9.8 13.5a1.6 1.6 0 0 1 3.2 0v4a1.6 1.6 0 1 1-3.2 0z" fill="#E01E5A" /><path d="M10.5 9a1.6 1.6 0 1 1 1.6-1.6V9z" fill="#36C5F0" /><path d="M10.5 9.8a1.6 1.6 0 0 1 0 3.2h-4a1.6 1.6 0 1 1 0-3.2z" fill="#36C5F0" /><path d="M15 10.5a1.6 1.6 0 1 1 1.6 1.6H15z" fill="#2EB67D" /><path d="M14.2 10.5a1.6 1.6 0 0 1-3.2 0v-4a1.6 1.6 0 1 1 3.2 0z" fill="#2EB67D" /><path d="M13.5 15a1.6 1.6 0 1 1-1.6 1.6V15z" fill="#ECB22E" /><path d="M13.5 14.2a1.6 1.6 0 0 1 0-3.2h4a1.6 1.6 0 1 1 0 3.2z" fill="#ECB22E" /></svg>
    );
    case "hubspot": return (
      <svg {...s} fill="#FF7A59"><circle cx="10" cy="14.5" r="4.3" fill="none" stroke="#FF7A59" strokeWidth="2.2" /><circle cx="17" cy="7" r="2.2" /><path d="M15.4 8.4 12 11.5" stroke="#FF7A59" strokeWidth="2.2" /><circle cx="17" cy="7" r="0.1" /></svg>
    );
    case "salesforce": return (
      <svg {...s}><path d="M10 7.5a3 3 0 0 1 5.4-.6 3.2 3.2 0 0 1 4 3.4 3 3 0 0 1-1.4 5.7H7.5A3.5 3.5 0 0 1 6.6 9 3 3 0 0 1 10 7.5z" fill="#00A1E0" /></svg>
    );
    case "notion": return (
      <svg {...s}><rect x="4" y="4" width="16" height="16" rx="3" fill="#fff" stroke="#111" strokeWidth="1.3" /><path d="M9 16V9l6 7V9" stroke="#111" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    );
    case "asana": return (
      <svg {...s} fill="#F06A6A"><circle cx="12" cy="7.5" r="3" /><circle cx="7.5" cy="15" r="3" /><circle cx="16.5" cy="15" r="3" /></svg>
    );
    case "zapier": return (
      <svg {...s}><g stroke="#FF4F00" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14M7 7l10 10M17 7 7 17" /></g></svg>
    );
    case "claude": return (
      <svg {...s}><rect width="24" height="24" rx="6" fill="#D97757" /><g stroke="#fff" strokeWidth="1.7" strokeLinecap="round"><path d="M12 6.5v11M6.5 9l11 6M17.5 9l-11 6" /></g></svg>
    );
    case "openai": return (
      <svg {...s}><rect width="24" height="24" rx="6" fill="#111" /><path d="M12 7.5a3 3 0 0 1 3 3v3a3 3 0 0 1-6 0v-3a3 3 0 0 1 3-3z" fill="none" stroke="#fff" strokeWidth="1.4" /></svg>
    );
    case "mcp": return <span style={{ display: "inline-flex" }}><Link2 size={size - 2} className="text-violet-500" /></span>;
    case "api": return <span className="text-[12px] font-bold text-slate-600">{"{ }"}</span>;
    case "extension": return <span style={{ display: "inline-flex" }}><OctoLogo size={size} /></span>;
    default: return <span style={{ display: "inline-flex" }}><LayoutGrid size={size - 2} className="text-slate-400" /></span>;
  }
}

function LoginView({ onLogin, onGoogle }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [tip, setTip] = useState(false);
  const signup = mode === "signup";
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    try {
      const e = new URLSearchParams(window.location.search).get("auth_error");
      if (e) { setAuthError(e); window.history.replaceState({}, "", window.location.pathname); }
    } catch (er) { /* ignore */ }
  }, []);
  const providers = [
    { label: "Continue with Google", icon: <GoogleIcon />, real: true },
    { label: "Continue with Microsoft", icon: <MicrosoftIcon /> },
    { label: "Continue with Apple", icon: <AppleIcon /> },
    { label: "Continue with SSO", icon: <KeyRound size={17} className="text-slate-500" /> },
  ];
  return (
    <div className="rai-body flex min-h-screen w-full items-center justify-center bg-[#F4F5FA] px-4">
      <StyleInject />
      <div className="w-full max-w-sm py-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3"><OctoLogo size={56} /></div>
          <h1 className="text-2xl font-bold text-slate-900">{signup ? "Create your OctoMeet AI account" : "Sign in to OctoMeet AI"}</h1>
          <p className="mt-1 text-sm text-slate-500">{signup ? "It's free to get started - no credit card required." : "Welcome back. Choose how to continue."}</p>
        </div>
        {authError && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span><b>No se pudo iniciar sesión:</b> {authError}</span>
          </div>
        )}
        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {providers.map((p) => (
            <button key={p.label} onClick={p.real ? onGoogle : onLogin} className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:shadow-sm">
              <span className="flex w-5 justify-center">{p.icon}</span> {p.label}
            </button>
          ))}
          <div className="flex items-center gap-3 py-1 text-[12px] text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" /></div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
          <button onClick={onLogin} className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">{signup ? "Create account" : "Continue with email"}</button>
        </div>

        <div className="mt-4 text-center text-[13px] text-slate-500">
          {signup
            ? <>Already have an account? <button onClick={() => setMode("signin")} className="font-semibold text-violet-600">Sign in</button></>
            : <>New to Octomeet? <button onClick={() => setMode("signup")} className="font-semibold text-violet-600">Create an account</button></>}
        </div>

        <div className="relative mt-6 flex justify-center">
          <button onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} className="text-[13px] font-medium text-violet-600 underline">Why does Octomeet need calendar access?</button>
          {tip && (
            <div className="absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-2xl">
              <div className="text-sm font-bold text-slate-800">Effortless meeting notes.</div>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">Octomeet syncs your calendar events so you can choose which meetings to join and summarize automatically. Works with Zoom, Microsoft Teams, and Google Meet.</p>
            </div>
          )}
        </div>

        {signup && (
          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
            By creating an account, I agree to Octomeet's <a href="https://octomeet.ai/termsofservice" target="_blank" rel="noreferrer" className="text-violet-500 underline">Terms of Service</a> and acknowledge I have read the <a href="https://octomeet.ai/privacy-policy" target="_blank" rel="noreferrer" className="text-violet-500 underline">Privacy Policy</a>.
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================ SUPPORT / LOGOUT ==================== */
function SupportView({ onBack }) {
  const cards = [
    { icon: FileText, title: "Help Center", desc: "Browse guides and articles." },
    { icon: MessageSquareText, title: "Chat with us", desc: "Get help from our support team." },
    { icon: Mail, title: "Email support", desc: "support@octomeet.ai" },
    { icon: Sparkles, title: "What's new", desc: "Latest features and updates." },
  ];
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3.5">
        <button onClick={onBack}><ChevronLeft size={18} className="text-slate-400" /></button>
        <h1 className="text-lg font-bold text-slate-900">Support</h1>
      </div>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h2 className="text-xl font-bold text-slate-900">How can we help?</h2>
        <p className="mt-1 text-sm text-slate-500">Find answers, contact us, or send feedback.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <button key={c.title} onClick={() => { if (c.title === "Email support") { window.location.href = "mailto:support@octomeet.ai"; } else { toast(c.title + " - coming soon"); } }} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-violet-300 hover:shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-500"><c.icon size={18} /></div>
              <div><div className="text-sm font-semibold text-slate-800">{c.title}</div><div className="text-[13px] text-slate-500">{c.desc}</div></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function LogoutView({ onCancel, onLogout }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500"><LogOut size={26} /></div>
      <h2 className="text-xl font-bold text-slate-800">Log out of Octomeet?</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">You'll need to sign in again with Google to access your meetings and reports.</p>
      <div className="mt-5 flex gap-3">
        <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={onLogout} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Log out</button>
      </div>
    </div>
  );
}

/* ============================ PLANS / PRICING ===================== */
function PlanBillingView({ onBack, onComparePlans, user }) {
  const planName = (user && user.plan && user.plan[0] ? user.plan[0].toUpperCase() + user.plan.slice(1) : "Enterprise");
  const history = [
    { date: "Jun 4, 2026", period: "Jun 4 - Jul 4, 2026" },
    { date: "May 4, 2026", period: "May 4 - Jun 4, 2026" },
    { date: "Apr 4, 2026", period: "Apr 4 - May 4, 2026" },
    { date: "Mar 4, 2026", period: "Mar 4 - Apr 4, 2026" },
  ];
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3.5">
        <button onClick={onBack}><ChevronLeft size={18} className="text-slate-400" /></button>
        <h1 className="text-lg font-bold text-slate-900">Plan &amp; Billing</h1>
      </div>
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Current Plan */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Current Plan</h2>
              <button onClick={onComparePlans} className="flex items-center gap-1 text-[13px] font-semibold text-violet-600 hover:text-violet-800">Compare plans <ArrowDown size={13} className="-rotate-90" /></button>
            </div>
            <div className="flex items-center gap-2"><span className="text-xl font-bold text-slate-900">{planName}</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Monthly</span></div>
            <p className="mt-1 text-[13px] text-slate-500">Next invoice July 4, 2026. ($29.75)</p>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button onClick={onComparePlans} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">Change plan</button>
              <button onClick={() => toast("Create a Workspace - coming soon")} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">Create a Workspace</button>
              <button onClick={() => { if (window.confirm("Cancel your plan? You'll keep access until the end of the billing period.")) toast("Plan cancellation requested"); }} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-rose-600 hover:bg-rose-50">Cancel plan</button>
            </div>
          </div>
          {/* License Usage */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-slate-900">License Usage</h2>
            <p className="text-sm text-slate-600">1 of 1 license is in use</p>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full bg-violet-600" style={{ width: "100%" }} /></div>
            <button onClick={() => toast("Add licenses - coming soon")} className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">Add licenses</button>
          </div>
          {/* File Upload Credits */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-slate-900">File Upload Credits</h2>
            <div className="flex gap-8">
              <div><div className="text-[12px] text-slate-400">Monthly credits</div><div className="text-xl font-bold text-slate-900">200 minutes</div></div>
              <div><div className="text-[12px] text-slate-400">Purchased credits</div><div className="text-xl font-bold text-slate-900">0 minutes</div></div>
            </div>
            <p className="mt-1 text-[12px] text-slate-400">Resets Jul 1, 2026</p>
            <button onClick={() => toast("Buy file upload credits - coming soon")} className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">Buy file upload credits</button>
          </div>
          {/* Payment Method */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-slate-900">Payment Method</h2>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
              <span className="flex items-center gap-2 text-sm text-slate-700">Visa ending in 9878 <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Default</span></span>
              <span className="text-[13px] text-slate-400">Expires 1/2030</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={() => toast("Update payment method - coming soon")} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">Update payment method</button>
              <button onClick={() => toast("Add Tax ID - coming soon")} className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-semibold text-violet-600 hover:bg-slate-50"><Plus size={14} /> Add Tax ID</button>
            </div>
          </div>
        </div>
        {/* Billing History */}
        <h2 className="mb-2 mt-7 text-base font-bold text-slate-900">Billing History</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[1fr_1.4fr_0.6fr_1fr_40px] border-b border-slate-200 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            <div>Invoice Date</div><div>Description</div><div>Qty</div><div>Billing Period</div><div></div>
          </div>
          {history.map((h) => (
            <div key={h.date} className="grid grid-cols-[1fr_1.4fr_0.6fr_1fr_40px] items-center border-b border-slate-100 px-4 py-3 text-[13px] text-slate-600 last:border-0">
              <div>{h.date}</div><div>{planName} Plan</div><div>1</div><div>{h.period}</div>
              <div className="flex justify-end gap-2 text-[12px] font-semibold text-violet-600">
                <button onClick={() => toast("Opening invoice…")}>Invoice</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlansView({ onBack }) {
  const [annual, setAnnual] = useState(true);
  const plans = [
    {
      name: "Free", monthly: "$0", annual: "$0", note: "Always free, no credit card",
      current: false, popular: false, cta: "Included", disabled: true,
      features: ["5 meeting transcripts / month", "30 meetings measured / month", "1-hour max meetings", "Summary, transcription & action items", "Meeting Coach", "Ask Octo (AI search)", "Recommendations & Meeting Policy", "Basic integrations", "16+ languages", "Mobile & desktop apps"],
    },
    {
      name: "Pro", monthly: "$19.75", annual: "$15", note: "per user / month",
      current: false, popular: false, cta: "Switch to Pro", disabled: false,
      features: ["Everything in Free", "Unlimited meeting transcripts", "100 upload credits / month", "4-hour max meetings", "LLM access (Claude / GPT)", "Workspaces", "Premium integrations", "For You insights", "Custom assistant branding"],
    },
    {
      name: "Enterprise", monthly: "$29.75", annual: "$22.50", note: "per user / month",
      current: true, popular: true, cta: "Current plan", disabled: true,
      features: ["Everything in Pro", "Audio & video playback", "200 upload credits / month", "Dedicated support"],
    },
    {
      name: "Enterprise+", monthly: "$39.75", annual: "$29.75", note: "per user / month · 5+ licenses",
      current: false, popular: false, cta: "Contact sales", disabled: false,
      features: ["Everything in Enterprise", "300 upload credits / month", "8-hour max meetings", "Enterprise SSO + SAML", "SCIM provisioning", "Custom data retention", "HIPAA compliance", "Domain capture", "Workspace onboarding"],
    },
  ];
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3.5">
        <button onClick={onBack}><ChevronLeft size={18} className="text-slate-400" /></button>
        <h1 className="text-lg font-bold text-slate-900">Plans &amp; Pricing</h1>
      </div>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="rounded-full bg-violet-50 px-3 py-1 text-[12px] font-semibold text-violet-700">Your current plan: Enterprise</span>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">Choose the plan that fits your team</h2>
          <div className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 text-sm">
            <button onClick={() => setAnnual(true)} className={"rounded-md px-3 py-1.5 font-medium transition " + (annual ? "bg-violet-600 text-white" : "text-slate-500")}>Annual <span className="text-[11px] opacity-80">-25%</span></button>
            <button onClick={() => setAnnual(false)} className={"rounded-md px-3 py-1.5 font-medium transition " + (!annual ? "bg-violet-600 text-white" : "text-slate-500")}>Monthly</button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => (
            <div key={p.name} className={"relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm " + (p.popular ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200")}>
              {p.popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Most Popular</span>}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">{p.name}</h3>
                {p.current && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Current</span>}
              </div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-3xl font-extrabold text-slate-900">{annual ? p.annual : p.monthly}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{p.note}{annual && p.name !== "Free" ? " · billed annually" : ""}</p>
              <button disabled={p.disabled} onClick={() => toast(p.cta + " - coming soon")} className={"mt-4 rounded-lg py-2.5 text-sm font-semibold transition " +
                (p.disabled ? "cursor-default bg-slate-100 text-slate-400" : "bg-violet-600 text-white hover:bg-violet-500")}>{p.cta}</button>
              <ul className="mt-5 space-y-2">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-slate-600">
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-500">
          <span className="font-semibold text-slate-600">Volume discounts (annual):</span> 100+ licenses −10% · 500+ −15% · 1,000+ −20%. Education pricing available. All workspace licenses must be the same tier.
        </div>
      </div>
    </div>
  );
}

/* ========================= ACCOUNT SETTINGS ======================= */
function ToggleRow({ title, desc, on, onChange, children }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        {desc && <div className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{desc}</div>}
        {children}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
function IntegRow({ name, brand, connectedAs }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white"><BrandIcon name={brand} size={20} /></div>
        <div>
          <div className="text-sm font-semibold text-slate-800">{name}</div>
          {connectedAs && <div className="text-[12px] text-emerald-600">{connectedAs} is connected</div>}
        </div>
      </div>
      {connectedAs
        ? <button onClick={() => toast("Manage " + name)} className="rounded-lg border border-violet-300 px-4 py-1.5 text-[13px] font-semibold text-violet-700 hover:bg-violet-50">Manage</button>
        : <button onClick={() => toast("Connecting " + name + "…")} className="rounded-lg bg-violet-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-500">Connect</button>}
    </div>
  );
}

function EditableField({ label, value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value || "");
  useEffect(() => { setV(value || ""); }, [value]);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
      <span className="shrink-0 text-sm font-medium text-slate-700">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") { onSave(v); setEditing(false); toast("Saved"); } if (e.key === "Escape") setEditing(false); }}
            className="w-56 rounded-lg border border-violet-300 px-2.5 py-1.5 text-sm outline-none focus:border-violet-500" />
          <button onClick={() => { onSave(v); setEditing(false); toast("Saved"); }} className="rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">Save</button>
          <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className={"text-sm " + (value ? "text-slate-700" : "italic text-slate-400")}>{value || placeholder || "Not provided"}</span>
          <button onClick={() => setEditing(true)} className="text-slate-300 transition hover:text-violet-500" title="Edit">✎</button>
        </div>
      )}
    </div>
  );
}

function AccountSettings({ onBack, lang, setLang, user }) {
  // Default from the real signed-in Google account (name / email / profile photo).
  const [profile, setProfile] = useState(() => ({ name: user?.name || "Your Name", jobTitle: "", roleLevel: "", department: "", email: user?.email || "you@company.com", photo: user?.picture || null }));
  // Keep in sync if the user object loads after this view mounts (and the user hasn't edited yet).
  useEffect(() => { if (user) setProfile((p) => ({ ...p, name: p.name === "Your Name" ? (user.name || p.name) : p.name, email: p.email === "you@company.com" ? (user.email || p.email) : p.email, photo: p.photo || user.picture || null })); }, [user]);
  const [vocab, setVocab] = useState([]);
  const [newWord, setNewWord] = useState("");
  const [slug, setSlug] = useState(((user?.email || "user").split("@")[0]) + "-82n88");
  const fileRef = useRef(null);
  const onPhoto = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setProfile((p) => ({ ...p, photo: reader.result })); toast("Photo updated"); };
    reader.readAsDataURL(f);
  };
  const setP = (k, val) => setProfile((p) => ({ ...p, [k]: val }));
  const SUBNAV = ["Profile & Account", "Integrations", "Meeting Recording", "Report Content", "Report Sharing", "Notifications", "Ask Octo", "Smart Scheduler", "Folders", "Contacts & Groups", "Custom Vocabulary", "Advanced"];
  const [sec, setSec] = useState(0);
  const [tg, setTg] = useState({
    autoJoinCal: true, autoJoinUnsched: true, autoNotes: true, transcription: true, playback: true, affective: true,
    internalAccess: true, externalAccess: false, oneClick: true, mtgReports: true, preReads: false, updateCal: false, thumb: true, liveDash: false,
    daily: false, topicReadouts: true, weeklyRecaps: true, recs: true, productUpdates: true, accountInfo: true,
    chatHistory: true, smartLinks: true, availHours: true, minNotice: true, domainDiscovery: true, cxp: false,
  });
  const [whichEvents, setWhichEvents] = useState("all");
  const [whoInvited, setWhoInvited] = useState("any");
  // Report Sharing toggles that persist server-side (Report Distribution + access).
  const PREF_MAP = { mtgReports: "autoRecap", internalAccess: "internalAccess", externalAccess: "externalAccess", oneClick: "oneClick", updateCal: "updateCalendar" };
  const set1 = (k, v) => {
    setTg((p) => ({ ...p, [k]: v }));
    if (PREF_MAP[k]) { fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sharing_prefs: { [PREF_MAP[k]]: v } }) }).then(() => toast("Saved")).catch(() => {}); }
  };
  // Load persisted sharing preferences on mount.
  useEffect(() => { fetch("/api/settings").then((r) => (r.ok ? r.json() : null)).then((d) => { const p = d && d.sharing_prefs; if (p) setTg((t) => ({ ...t, mtgReports: p.autoRecap !== false, internalAccess: p.internalAccess !== false, externalAccess: !!p.externalAccess, oneClick: p.oneClick !== false, updateCal: !!p.updateCalendar })); }).catch(() => {}); }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3.5">
        <button onClick={onBack}><ChevronLeft size={18} className="text-slate-400" /></button>
        <h1 className="text-lg font-bold text-slate-900">Account Settings</h1>
      </div>

      <div className="flex">
        {/* sub-nav */}
        <div className="w-56 shrink-0 border-r border-slate-200 bg-white py-3">
          {SUBNAV.map((s, i) => (
            <button key={s} onClick={() => setSec(i)}
              className={"block w-full px-5 py-2.5 text-left text-[14px] transition " + (sec === i ? "bg-violet-50 font-semibold text-violet-700" : "text-slate-600 hover:bg-slate-50")}>
              {s}
            </button>
          ))}
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <div className="mx-auto max-w-2xl space-y-5">

            {sec === 0 && (<>
              <SecHead icon={Users} title="Profile & Account" desc="Manage name, role, email, password, and SSO settings." />
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-xl font-bold text-white" style={{ background: ownerColor(initialsOf(profile.name)) }}>
                  {profile.photo ? <img src={profile.photo} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : initialsOf(profile.name)}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                <button onClick={() => fileRef.current && fileRef.current.click()} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Upload photo</button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white">
                <EditableField label="Name" value={profile.name} onSave={(v) => setP("name", v)} />
                <EditableField label="Job title" value={profile.jobTitle} placeholder="Not provided" onSave={(v) => setP("jobTitle", v)} />
                <EditableField label="Role level" value={profile.roleLevel} placeholder="Not provided" onSave={(v) => setP("roleLevel", v)} />
                <EditableField label="Department" value={profile.department} placeholder="Not provided" onSave={(v) => setP("department", v)} />
                <div className="border-t border-slate-100 p-4">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> Your primary email cannot be changed because it is connected to an SSO account. To update it, you must first add a password below.
                  </div>
                </div>
                <EditableField label="Primary Email" value={profile.email} onSave={(v) => setP("email", v)} />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <label className="text-sm font-semibold text-slate-800">Default Language</label>
                <p className="mb-2 text-[13px] text-slate-500">Set your default language for the Octomeet dashboard</p>
                <select value={lang} onChange={(e) => setLang(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400">
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-sm font-semibold text-slate-800">Sign-In Methods</div>
                <p className="mb-3 text-[13px] text-slate-500">Connect your accounts to sign in to Octomeet using your credentials from these providers.</p>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3"><BrandIcon name="google" size={18} /> <span className="text-sm font-medium text-slate-700">Google</span><Check size={15} className="ml-auto text-emerald-500" /></div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => toast("Sign-in method - coming soon")} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">Add Sign-In Method</button>
                  <button onClick={() => toast("Add password - coming soon")} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Add Account Password</button>
                </div>
              </div>
            </>)}

            {sec === 1 && (<>
              <SecHead icon={LayoutGrid} title="Integrations" desc="Manage and connect external tools and services to Octomeet." />
              <div>
                <div className="mb-2 text-sm font-bold text-slate-800">Calendar & Meetings</div>
                <p className="mb-3 text-[13px] text-slate-500">Allow Octomeet to join your meetings and automatically generate meeting summaries</p>
                <div className="rounded-xl border border-slate-200 bg-white">
                  <IntegRow name="Google Calendar" brand="googleCalendar" connectedAs="nicolas@octomeet.ai" />
                  <IntegRow name="Google Meet" brand="googleMeet" connectedAs="nicolas@octomeet.ai" />
                  <IntegRow name="Outlook Calendar" brand="outlook" />
                  <IntegRow name="Zoom Calendar" brand="zoom" />
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-bold text-slate-800">Apps</div>
                <div className="rounded-xl border border-slate-200 bg-white">
                  <IntegRow name="Octomeet Web Extension" brand="extension" connectedAs="nicolas@octomeet.ai" />
                  <IntegRow name="Slack" brand="slack" />
                  <IntegRow name="HubSpot" brand="hubspot" />
                  <IntegRow name="Salesforce" brand="salesforce" />
                </div>
              </div>
            </>)}

            {sec === 2 && (<>
              <SecHead icon={Video} title="Meeting Recording" desc="Manage how your Octomeet Assistant joins and appears in meetings." />
              <div className="text-sm font-bold text-slate-800">Auto-Join Preferences</div>
              <ToggleRow title="Auto-Join Calendar Events" desc="Auto-joins scheduled meetings from your connected calendar(s)." on={tg.autoJoinCal} onChange={(v) => set1("autoJoinCal", v)}>
                {tg.autoJoinCal && (
                  <div className="mt-3 space-y-3">
                    <div className="inline-flex items-center gap-1.5 rounded bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-700"><BrandIcon name="googleCalendar" size={13} /> Google Calendar <Check size={12} /></div>
                    <div>
                      <div className="mb-1 text-[13px] font-semibold text-slate-700">Which Calendar Events</div>
                      <Radio label="All calendar events" desc="Octomeet joins every meeting on your calendar" def checked={whichEvents === "all"} onClick={() => setWhichEvents("all")} />
                      <Radio label="Calendar events I'm hosting" desc="Octomeet only joins meetings you created or own" checked={whichEvents === "host"} onClick={() => setWhichEvents("host")} />
                    </div>
                    <div>
                      <div className="mb-1 text-[13px] font-semibold text-slate-700">Who's Invited</div>
                      <Radio label="Any participants" desc="Join regardless of who is on the calendar invite" def checked={whoInvited === "any"} onClick={() => setWhoInvited("any")} />
                      <Radio label="Internal participants only" desc="Only join when all invitees are from your domain (@octomeet.ai)" checked={whoInvited === "internal"} onClick={() => setWhoInvited("internal")} />
                    </div>
                  </div>
                )}
              </ToggleRow>
              <ToggleRow title="Auto-Join Unscheduled Meetings" desc="Octomeet automatically joins unscheduled calls started in Google Meet or Zoom." on={tg.autoJoinUnsched} onChange={(v) => set1("autoJoinUnsched", v)} />
              <div className="text-sm font-bold text-slate-800">Assistant Appearance</div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800">Assistant Name</div>
                <p className="mb-2 text-[13px] text-slate-500">Choose the name your Assistant will show when it joins a meeting.</p>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400">
                  <option>octomeet.ai meeting notes</option><option>Meeting Analytics from Octomeet</option><option>Nicolas's Assistant</option><option>Nicolas's Notetaker</option>
                </select>
              </div>
            </>)}

            {sec === 3 && (<>
              <SecHead icon={Sparkles} title="Report Content" desc="Manage what's captured in your reports and how it's presented." />
              <ToggleRow title="Automatic Meeting Notes" desc="Automatically generate AI-powered summaries, chapters, action items, and key questions, even when transcripts or recordings are disabled." on={tg.autoNotes} onChange={(v) => set1("autoNotes", v)} />
              <ToggleRow title="Transcription" desc="Enable transcription for meeting reports you own." on={tg.transcription} onChange={(v) => set1("transcription", v)} />
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800">Output Language</div>
                <p className="mb-2 text-[13px] text-slate-500">Octomeet generates transcripts and notes in the meeting's primary language. You can override this.</p>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400"><option>Auto-Detected (Default)</option>{LANGS.map((l) => <option key={l.code}>{l.label}</option>)}</select>
              </div>
              <ToggleRow title="Audio & Video Playback" desc="Enable playback for meeting reports you own. Only available with an Enterprise or Enterprise+ plan." on={tg.playback} onChange={(v) => set1("playback", v)} />
              <ToggleRow title="Affective metrics" desc="Include metrics that calculate engagement, sentiment, charisma, and bias in reports." on={tg.affective} onChange={(v) => set1("affective", v)} />
            </>)}

            {sec === 4 && (<>
              <SecHead icon={Share2} title="Report Sharing" desc="Manage how reports are shared with meeting participants." />
              <div className="text-sm font-bold text-slate-800">Sharing Preferences</div>
              <ToggleRow title="Internal Participant Access" desc="Automatically grant report access for internal (octomeet.ai) meeting participants" on={tg.internalAccess} onChange={(v) => set1("internalAccess", v)} />
              <ToggleRow title="External Participant Access" desc="Automatically grant report access for external (not octomeet.ai) meeting participants" on={tg.externalAccess} onChange={(v) => set1("externalAccess", v)} />
              <ToggleRow title="One-Click Sharing" desc="Share reports instantly with a single click for quicker collaboration." on={tg.oneClick} onChange={(v) => set1("oneClick", v)} />
              <div className="text-sm font-bold text-slate-800">Report Distribution</div>
              <ToggleRow title="Meeting Reports" desc="Send meeting notes, transcript, and more after a meeting ends" on={tg.mtgReports} onChange={(v) => set1("mtgReports", v)} />
              <ToggleRow title="Meeting Pre-Reads" desc="Send a recap of the previous meeting before an upcoming meeting" on={tg.preReads} onChange={(v) => set1("preReads", v)} />
              <ToggleRow title="Update Calendar Event" desc="After a meeting, update the calendar event description with a summary and report link" on={tg.updateCal} onChange={(v) => set1("updateCal", v)} />
              <ToggleRow title="Display Meeting Thumbnail" desc="Display thumbnail images in Meeting Recap and Pre-Read emails for reports you own." on={tg.thumb} onChange={(v) => set1("thumb", v)} />
              <div className="text-sm font-bold text-slate-800">Live Meeting Dashboard Access</div>
              <ToggleRow title="Automatically share the Live Meeting Dashboard" desc="Post a link to the live dashboard in the meeting chat." on={tg.liveDash} onChange={(v) => set1("liveDash", v)} />
            </>)}

            {sec === 5 && (<>
              <SecHead icon={Bell} title="Notifications" desc="Manage notifications preferences and email subscriptions." />
              <ToggleRow title="Daily Summaries" desc="Receive daily summaries that highlight the most important updates that may require a response." on={tg.daily} onChange={(v) => set1("daily", v)} />
              <ToggleRow title="Topic Readouts" desc="When Octomeet generates a new Readout from email or messaging, automatically notify me." on={tg.topicReadouts} onChange={(v) => set1("topicReadouts", v)} />
              <ToggleRow title="Weekly Recaps" desc="Receive a Monday summary of last week's meetings and a Thursday wrap-up of remaining action items." on={tg.weeklyRecaps} onChange={(v) => set1("weeklyRecaps", v)} />
              <ToggleRow title="Recommendations" desc="Notify me when Octomeet generates personalized suggestions and action items" on={tg.recs} onChange={(v) => set1("recs", v)} />
              <div className="text-sm font-bold text-slate-800">Your Email Preferences</div>
              <ToggleRow title="Product Updates" desc="Get product updates and announcements from Octomeet" on={tg.productUpdates} onChange={(v) => set1("productUpdates", v)} />
              <ToggleRow title="Account Info" desc="Receive information from Octomeet about your account" on={tg.accountInfo} onChange={(v) => set1("accountInfo", v)} />
            </>)}

            {sec === 6 && (<>
              <SecHead icon={Sparkles} title="Ask Octo" desc="Manage Ask Octo settings and chat history." />
              <ToggleRow title="Chat History" desc="Automatically save your past chats so you can revisit them later. Only visible to you." on={tg.chatHistory} onChange={(v) => set1("chatHistory", v)}>
                <button onClick={() => toast("Chat history deleted")} className="mt-3 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">Delete All Chat History</button>
              </ToggleRow>
            </>)}

            {sec === 7 && (<>
              <SecHead icon={Calendar} title="Smart Scheduler" desc="Configure scheduling links, calendar, conference platform, URL, and availability." />
              <ToggleRow title="Smart Scheduler Links" desc="Smart Scheduler links allow others to find a time to meet with you via a scheduling link." on={tg.smartLinks} onChange={(v) => set1("smartLinks", v)} />
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div><div className="text-sm font-semibold text-slate-800">Scheduling Calendar</div><select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none"><option>Google Calendar</option></select></div>
                <div><div className="text-sm font-semibold text-slate-800">Default conferencing platform</div><select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-500 outline-none"><option>Select one</option><option>Google Meet</option><option>Zoom</option><option>Microsoft Teams</option></select></div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Custom URL</div>
                  <div className="mt-1 flex items-center gap-2"><span className="text-sm text-slate-500">cal.octomeet.ai/</span><input value={slug} onChange={(e) => setSlug(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" /><button onClick={async () => { try { await navigator.clipboard.writeText("https://cal.octomeet.ai/" + slug); } catch (e) {} toast("Link copied"); }} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Copy</button></div>
                </div>
              </div>
              <ToggleRow title="Available hours" desc="Restrict scheduling to the hours you've designated as available (Mon-Fri, 9:00 AM - 5:00 PM)." on={tg.availHours} onChange={(v) => set1("availHours", v)} />
              <ToggleRow title="Minimum notice" desc="Enforce minimum notice for scheduling meetings (4 hours before event start time)." on={tg.minNotice} onChange={(v) => set1("minNotice", v)} />
            </>)}

            {sec === 8 && (<>
              <SecHead icon={Folder} title="Folders" desc="Control how meeting reports are sorted and displayed in folders." />
              <div><div className="mb-1 text-sm font-bold text-slate-800">Custom Folders</div><p className="mb-3 text-[13px] text-slate-500">Create and manage your own folders to organize meeting reports your way.</p><button onClick={() => toast("New folder - coming soon")} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"><FolderPlus size={16} /> Add New Folder</button></div>
              <div>
                <div className="mb-1 text-sm font-bold text-slate-800">Smart Folders</div>
                <p className="mb-3 text-[13px] text-slate-500">Auto-organize reports by topic. Show or hide folders that aren't relevant to you.</p>
                <div className="flex flex-wrap gap-2">
                  {["Account Review","Business Review","Coaching Session","Customer Feedback","Customer Success","Educational","Investor Pitch","Job Interview","One-on-One","Partnership Alignment","Planning Meeting","Sales Call","Sales Strategy","Status Update","Training"].map((f) => (
                    <span key={f} className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5 text-[12px] text-slate-600"><Folder size={12} className="text-violet-400" /> {f}</span>
                  ))}
                </div>
              </div>
            </>)}

            {sec === 9 && (<>
              <SecHead icon={Users} title="Contacts & Groups" desc="Manage your contact preferences and groups." />
              <ToggleRow title="Domain Discovery" desc="Improve sharing by making yourself discoverable within your domain." on={tg.domainDiscovery} onChange={(v) => set1("domainDiscovery", v)} />
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-sm font-semibold text-slate-800">Sync Contacts</div>
                <p className="mb-3 text-[13px] text-slate-500">Sync your contacts from Google or Microsoft to simplify sharing.</p>
                <div className="flex gap-2"><button onClick={() => toast("Connect Google contacts - coming soon")} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><BrandIcon name="google" size={16} /> Connect Google</button><button onClick={() => toast("Connect Microsoft contacts - coming soon")} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><BrandIcon name="microsoft" size={16} /> Connect Microsoft</button></div>
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No contact groups created<br /><span className="text-[13px]">Create a new group for easier sharing</span></div>
            </>)}

            {sec === 10 && (<>
              <SecHead icon={Type} title="Custom Vocabulary" desc="Boost words for better transcript accuracy." />
              <div className="rounded-lg bg-violet-50 p-3 text-[13px] text-violet-700">Maximum 100 entries.</div>
              <div className="text-sm font-semibold text-slate-700">{vocab.length} custom words</div>
              <div className="flex gap-2">
                <input value={newWord} onChange={(e) => setNewWord(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newWord.trim()) { setVocab((v) => [...v, newWord.trim()]); setNewWord(""); toast("Word added"); } }} placeholder="Add a word, name or term…" className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
                <button onClick={() => { if (newWord.trim()) { setVocab((v) => [...v, newWord.trim()]); setNewWord(""); toast("Word added"); } }} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"><Plus size={16} /> Add new</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {vocab.map((w, i) => (<span key={i} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{w}<button onClick={() => setVocab((v) => v.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500"><X size={13} /></button></span>))}
              </div>
            </>)}

            {sec === 11 && (<>
              <SecHead icon={Settings} title="Advanced" desc="Manage additional controls for your account, security, and preferences." />
              <ToggleRow title="Customer Experience Program" desc="Participate in a voluntary program that stores meeting data to help improve the features in our service." on={tg.cxp} onChange={(v) => set1("cxp", v)} />
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800">Active Sessions</div>
                <p className="mb-3 text-[13px] text-slate-500">See where your account is signed in.</p>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"><div><div className="text-sm font-medium text-slate-700">Chrome Browser (Current)</div><div className="text-[12px] text-slate-400">BR · Active just now</div></div><button onClick={() => toast("Session logged out")} className="text-[13px] font-semibold text-violet-600">Log out</button></div>
                <button onClick={() => toast("Logged out of all sessions")} className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Log out of all sessions</button>
              </div>
              <div className="rounded-xl border border-rose-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800">Delete Account</div>
                <p className="mb-3 text-[13px] text-slate-500">This action is permanent and cannot be undone.</p>
                <button onClick={() => toast("Account deletion requested")} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Delete my account</button>
              </div>
            </>)}

          </div>
        </div>
      </div>
    </div>
  );
}
function SecHead({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-500"><Icon size={20} /></div>
      <div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="text-[13px] text-slate-500">{desc}</p></div>
    </div>
  );
}
function Field({ label, value, muted, edit }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-0">
      <div><span className="text-sm font-medium text-slate-700">{label}</span></div>
      <div className="flex items-center gap-3"><span className={"text-sm " + (muted ? "italic text-slate-400" : "text-slate-700")}>{value}</span>{edit && <button className="text-slate-300 hover:text-violet-500">✎</button>}</div>
    </div>
  );
}
function Radio({ label, desc, def, checked, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 py-1.5 text-left">
      <span className={"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 " + (checked ? "border-violet-600" : "border-slate-300")}>{checked && <span className="h-2 w-2 rounded-full bg-violet-600" />}</span>
      <span><span className="text-[13px] font-medium text-slate-700">{label}</span>{def && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Default</span>}<span className="block text-[12px] text-slate-400">{desc}</span></span>
    </button>
  );
}

/* ========================= MEETING DETAIL ========================== */
// Build a REAL per-metric time series for the sparkline, derived from the actual meeting:
//  - engagement: speaking activity over time (turns + word density + questions per time bucket)
//  - sentiment:  the real sentiment timeline from the AI analysis
//  - readScore:  a blend of the engagement + sentiment curves
// Each metric gets a DISTINCT, data-grounded shape (no more identical fake curves).
function metricSeries(kind, meeting) {
  const N = 10;
  const turns = (meeting.transcript || []).filter((t) => t && t.at != null && t.at >= 0);
  let durSec = (meeting.durationMin || 0) * 60;
  if (!durSec && turns.length) durSec = Math.max(...turns.map((t) => t.at)) || 0;
  const sentRaw = (Array.isArray(meeting.sentimentTimeline) && meeting.sentimentTimeline.length) ? meeting.sentimentTimeline : null;
  const sc = meeting.scores || {};
  const resample = (a, n) => { if (!a || !a.length) return new Array(n).fill(0.5); if (a.length === 1) return new Array(n).fill(a[0]); const out = []; for (let i = 0; i < n; i++) { const idx = (i / (n - 1)) * (a.length - 1); const lo = Math.floor(idx), hi = Math.ceil(idx), f = idx - lo; out.push(a[lo] * (1 - f) + a[hi] * f); } return out; };
  const norm = (arr) => { const mn = Math.min(...arr), mx = Math.max(...arr); const r = (mx - mn) || 1; return arr.map((x) => (x - mn) / r); };

  // Real engagement signal: per-bucket talking activity.
  let engShape = null;
  if (durSec > 0 && turns.length) {
    const act = new Array(N).fill(0);
    for (const t of turns) { const b = Math.min(N - 1, Math.max(0, Math.floor((t.at / durSec) * N))); const words = (t.text || "").split(/\s+/).filter(Boolean).length; act[b] += 1 + words / 35 + ((t.text || "").includes("?") ? 2 : 0); }
    if (act.some((x) => x > 0)) engShape = norm(act);
  }
  const sentShape = sentRaw ? resample(sentRaw.map((x) => (x + 1) / 2), N) : null; // [-1..1] -> [0..1]

  let shape;
  if (kind === "sentiment") shape = sentShape || engShape || new Array(N).fill(0.5);
  else if (kind === "engagement") shape = engShape || sentShape || new Array(N).fill(0.5);
  else { const e = engShape || sentShape || new Array(N).fill(0.5); const s = sentShape || e; shape = e.map((x, i) => 0.6 * x + 0.4 * s[i]); }

  const v = Number.isFinite(sc[kind === "readScore" ? "overall" : kind]) ? sc[kind === "readScore" ? "overall" : kind] : 60;
  const mean = shape.reduce((a, b) => a + b, 0) / shape.length;
  return shape.map((x) => Math.max(2, Math.min(100, v + (x - mean) * 22))); // center on the value, real swing
}

// Lightweight inline sparkline (line + soft gradient fill) that stretches to its container.
function Sparkline({ data, color = "#7C3AED", className = "h-9 w-full" }) {
  const vals = (Array.isArray(data) && data.length > 1) ? data : [50, 52, 51, 53, 52, 54, 53, 55];
  const n = vals.length, W = 100, H = 30, pad = 3;
  const min = Math.min(...vals), max = Math.max(...vals), range = (max - min) || 1;
  const pts = vals.map((v, i) => [(i / (n - 1)) * W, H - pad - ((v - min) / range) * (H - pad * 2)]);
  const line = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const gid = "spk_" + color.replace(/[^a-z0-9]/gi, "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function fmtClock(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0");
}
const MARKER_STYLE = {
  chapter: { color: "#7C3AED", label: "Chapter" },
  question: { color: "#0EA5E9", label: "Key Question" },
  action: { color: "#F59E0B", label: "Action Item" },
  highlight: { color: "#8B5CF6", label: "Highlight" },
};

// Custom video player with a marker timeline (chapters / questions / action items /
// highlights as colored dots) AND smart playback modes on hover, like Read.ai:
//  - Recording: the full video.
//  - Highlights: the SAME video (dots visible) but plays only the highlight scenes.
//  - Trailer: a clean 5-6 scene teaser of the most important moments, with fade
//    transitions and a single continuous progress line (no dots) - looks like one video.
// Scenes snap to transcript turn boundaries so messages are never cut mid-sentence.
// Split a transcript turn into short, readable, sentence-style phrases (Netflix-style captions):
// break on sentence enders, wrap long sentences to <=84 chars, capitalize each phrase.
function splitPhrases(text) {
  const t = String(text || "").replace(/[—–]/g, "-").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const sentences = t.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [t];
  const out = [];
  for (let s of sentences) {
    s = s.trim(); if (!s) continue;
    if (s.length <= 84) { out.push(s); continue; }
    let cur = "";
    for (const w of s.split(" ")) { if ((cur + " " + w).trim().length > 84) { if (cur) out.push(cur.trim()); cur = w; } else cur = (cur + " " + w).trim(); }
    if (cur) out.push(cur.trim());
  }
  return out.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

function MeetingVideo({ videoRef, src, coverAt, markers, turns, subtitles, meetingId, shareTok, coverDone }) {
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [everPlayed, setEverPlayed] = useState(false); // until the user hits play, show 0:00 (poster sits at the cover frame)
  const [hover, setHover] = useState(null);
  const [hovering, setHovering] = useState(false);
  const [mode, setMode] = useState(null);
  const [fading, setFading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showHighlights, setShowHighlights] = useState(true);
  const [autoplayClick, setAutoplayClick] = useState(true);
  const [volume, setVolume] = useState(1);
  const [volOpen, setVolOpen] = useState(false);
  const [subLang, setSubLang] = useState("off"); // subtitles language - OFF by default
  const [subMenu, setSubMenu] = useState(false);
  const [dubMenu, setDubMenu] = useState(false);
  const [dubUrl, setDubUrl] = useState(null);       // media proxy URL when a dubbed version is active
  const [dubLang, setDubLang] = useState(null);
  const [dubStatus, setDubStatus] = useState("idle"); // idle | dubbing | ready | error
  const dubPollRef = useRef(null);
  const [subCache, setSubCache] = useState(() => (subtitles && typeof subtitles === "object") ? subtitles : {}); // { lang: [translated text per turn] }, pre-loaded from the report
  const [subBusy, setSubBusy] = useState(false);
  const cc = subLang !== "off";
  const barRef = useRef(null), wrapRef = useRef(null), volRef = useRef(null), volDragRef = useRef(false), startedRef = useRef(false);
  const segsRef = useRef([]), segIdxRef = useRef(0), modeRef = useRef(null), transRef = useRef(false);

  // Capture a real video frame (owner only, once) and store it as the report cover, so
  // share/recap emails show the actual recording still. Uses the same-origin /frame proxy so
  // the canvas isn't CORS-tainted; if it still taints, we silently keep the branded fallback.
  useEffect(() => {
    if (shareTok || coverDone) return;
    const bid = ((src || "").match(/botId=([^&]+)/) || [])[1];
    if (!bid) return;
    let done = false;
    const hv = document.createElement("video");
    hv.crossOrigin = "anonymous"; hv.muted = true; hv.preload = "auto"; hv.playsInline = true;
    hv.src = "/api/recall/frame?botId=" + bid;
    const cleanup = () => { try { hv.removeAttribute("src"); hv.load(); } catch (e) {} };
    hv.addEventListener("loadedmetadata", () => { try { hv.currentTime = Math.min(Math.max(1, coverAt || 1), (hv.duration || 2) - 0.1); } catch (e) {} });
    hv.addEventListener("seeked", () => {
      if (done) return; done = true;
      try {
        const c = document.createElement("canvas");
        const vw = hv.videoWidth || 640, vh = hv.videoHeight || 360;
        c.width = 640; c.height = Math.round((640 * vh) / vw);
        c.getContext("2d").drawImage(hv, 0, 0, c.width, c.height);
        const data = c.toDataURL("image/jpeg", 0.72); // throws if tainted -> caught below
        fetch("/api/recall/cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ botId: bid, image: data }) }).catch(() => {});
      } catch (e) { /* tainted/decode fail: branded cover stays */ }
      cleanup();
    });
    hv.addEventListener("error", cleanup);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, shareTok, coverDone]);

  const uniqAts = [...new Set((markers || []).map((m) => m.at).filter((a) => a != null && a >= 0).map((s) => Math.round(s)))].sort((a, b) => a - b);
  const tns = (turns || []).filter((t) => t && t.at != null).sort((a, b) => a.at - b.at);

  // Snap an anchor to natural boundaries: start at the turn it falls in, end at a later
  // turn boundary so the spoken message finishes (never cut mid-sentence). Min ~6s.
  const snapScene = (anchor, cap) => {
    const minLen = 6;
    if (!tns.length) { const st = Math.max(0, anchor); return { start: st, end: cap ? Math.min(cap, st + 9) : st + 9 }; }
    let i = 0; for (let k = 0; k < tns.length; k++) { if (tns[k].at <= anchor) i = k; else break; }
    const start = tns[i].at;
    let j = i, end = tns[j + 1] ? tns[j + 1].at : (cap || start + minLen);
    while (end - start < minLen && j + 1 < tns.length) { j++; end = tns[j + 1] ? tns[j + 1].at : (cap || start + minLen); }
    if (cap) end = Math.min(end, cap);
    if (end <= start) end = cap ? Math.min(cap, start + minLen) : start + minLen;
    return { start, end };
  };
  const mergeScenes = (scs) => { scs.sort((a, b) => a.start - b.start); const out = []; for (const s of scs) { const last = out[out.length - 1]; if (last && s.start <= last.end + 0.5) last.end = Math.max(last.end, s.end); else out.push({ ...s }); } return out; };

  const buildSegments = (kind, total) => {
    const cap = total && isFinite(total) && total > 0 ? total : 0;
    const hiAts = [...new Set((markers || []).filter((m) => m.type === "highlight" && m.at != null).map((m) => Math.round(m.at)))].filter((s) => !cap || s < cap - 0.5).sort((a, b) => a - b);
    if (kind === "highlights") {
      const ats = hiAts.length ? hiAts : uniqAts.filter((s) => !cap || s < cap - 0.5);
      if (!ats.length) return [];
      return mergeScenes(ats.map((a) => snapScene(a, cap)));
    }
    // trailer: 5-6 high-engagement scenes (prefer highlights), spread across the meeting.
    let srcA = hiAts.length >= 3 ? hiAts : uniqAts.filter((s) => !cap || s < cap - 0.5);
    if (srcA.length < 3 && cap) { const want = 6; const extra = Array.from({ length: want }, (_, i) => Math.round((cap * (i + 0.6)) / (want + 0.2))); srcA = [...new Set([...srcA, ...extra])].filter((s) => s < cap - 0.5).sort((a, b) => a - b); }
    const anchors = srcA.length <= 6 ? srcA : Array.from({ length: 6 }, (_, i) => srcA[Math.floor((i * srcA.length) / 6)]);
    return mergeScenes(anchors.map((a) => snapScene(a, cap))).slice(0, 6);
  };
  const segTotal = (segs) => segs.reduce((a, s) => a + (s.end - s.start), 0);
  const mins = (s) => (!s || s < 60 ? "<1m" : Math.round(s / 60) + "m");

  const startMode = (kind) => {
    const v = videoRef.current; if (!v) return;
    const total = isFinite(v.duration) && v.duration > 0 ? v.duration : (dur || 0);
    const segs = kind === "full" ? [] : buildSegments(kind, total);
    if (kind !== "full" && !segs.length) kind = "full";
    segsRef.current = segs; segIdxRef.current = 0; modeRef.current = kind; transRef.current = false; setFading(false); setMode(kind);
    try { v.currentTime = segs.length ? segs[0].start : 0; } catch (e) {}
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  };
  const clearMode = () => { modeRef.current = null; segsRef.current = []; transRef.current = false; setFading(false); setMode(null); };
  const resumePlay = () => { const v = videoRef.current; if (!v) return; clearMode(); startedRef.current = true; v.play().catch(() => {}); };

  // Advance to the next scene. Trailer fades out/in; Highlights jumps instantly.
  const advance = (v) => {
    transRef.current = true;
    const fade = modeRef.current === "trailer";
    const doSeek = () => {
      const segs = segsRef.current, next = segIdxRef.current + 1;
      if (next >= segs.length) { v.pause(); clearMode(); return; }
      segIdxRef.current = next; try { v.currentTime = segs[next].start; } catch (e) {}
      const p = v.play(); if (p && p.catch) p.catch(() => {});
      if (fade) setTimeout(() => { setFading(false); transRef.current = false; }, 160);
      else transRef.current = false;
    };
    if (fade) { setFading(true); setTimeout(doSeek, 300); } else doSeek();
  };

  const onTime = (e) => {
    const v = e.currentTarget; setCur(v.currentTime);
    if ((modeRef.current === "highlights" || modeRef.current === "trailer") && segsRef.current.length && !transRef.current) {
      const seg = segsRef.current[segIdxRef.current];
      if (seg && v.currentTime >= seg.end - 0.08) advance(v);
    }
  };

  const toggle = () => { const v = videoRef.current; if (!v) return; if (v.paused) { if (!startedRef.current && (!mode || mode === "full")) { v.currentTime = 0; } startedRef.current = true; v.play().catch(() => {}); } else v.pause(); };
  const onBar = (e) => { const b = barRef.current, v = videoRef.current; if (!b || !v || !dur) return; const r = b.getBoundingClientRect(); clearMode(); v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur; };
  const fs = () => { const w = wrapRef.current; if (!w) return; try { document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen(); } catch (e) {} };
  const setD = (e) => { const d = e.currentTarget.duration; if (isFinite(d)) setDur(d); };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); };
  const cycleRate = () => { const v = videoRef.current; if (!v) return; const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; v.playbackRate = next; setRate(next); };
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const setRateTo = (r) => { const v = videoRef.current; if (v) v.playbackRate = r; setRate(r); };
  const applyVol = (val) => { const x = Math.min(1, Math.max(0, val)); setVolume(x); const v = videoRef.current; if (v) { v.volume = x; v.muted = x === 0; } setMuted(x === 0); };
  const volFromEvent = (e) => { const t = volRef.current; if (!t) return; const r = t.getBoundingClientRect(); applyVol(1 - (e.clientY - r.top) / r.height); };
  const startVolDrag = (e) => { e.preventDefault(); volDragRef.current = true; volFromEvent(e); const mv = (ev) => volFromEvent(ev); const up = () => { volDragRef.current = false; window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }; window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up); };
  const SUB_LANGS = ["English", "Español (Latinoamérica)", "Português (Brasil)", "Français", "Deutsch", "Italiano", "한국어", "日本語"];
  // ElevenLabs video dubbing (keeps each participant's voice). Estimated cost by duration.
  const DUB_LANGS = [["es", "Español"], ["en", "English"], ["pt", "Português"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"], ["ja", "日本語"], ["ko", "한국어"], ["zh", "中文"], ["hi", "हिन्दी"], ["ru", "Русский"], ["ar", "العربية"]];
  const DUB_USD_PER_MIN = 0.33;
  const dubCost = "$" + (Math.max((dur || (meetingId ? 60 : 0)) / 60, 1) * DUB_USD_PER_MIN).toFixed(2);
  const startDub = async (lang) => {
    setDubMenu(false);
    if (dubPollRef.current) { clearInterval(dubPollRef.current); dubPollRef.current = null; }
    if (lang === "original") { setDubUrl(null); setDubLang(null); setDubStatus("idle"); return; }
    setDubLang(lang); setDubStatus("dubbing"); setDubUrl(null);
    try {
      const r = await fetch("/api/dub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", meetingId, lang }) });
      const d = await r.json();
      if (!r.ok) { setDubStatus("error"); toast(d.error === "no_elevenlabs_key" ? "Dubbing not configured yet" : d.error === "no_recording" ? "This meeting has no recording to dub" : "Couldn't start dubbing"); return; }
      dubPollRef.current = setInterval(async () => {
        try {
          const sr = await fetch("/api/dub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", meetingId, lang }) });
          const sd = await sr.json();
          if (sd.ready) { clearInterval(dubPollRef.current); dubPollRef.current = null; setDubUrl(`/api/dub?meetingId=${encodeURIComponent(meetingId)}&lang=${encodeURIComponent(lang)}${shareTok ? `&share=${encodeURIComponent(shareTok)}` : ""}`); setDubStatus("ready"); startedRef.current = false; setEverPlayed(false); toast("Dubbed video ready"); }
          else if (sd.status === "failed") { clearInterval(dubPollRef.current); dubPollRef.current = null; setDubStatus("error"); toast("Dubbing failed - try again"); }
        } catch (e) {}
      }, 6000);
    } catch (e) { setDubStatus("error"); toast("Network error"); }
  };
  useEffect(() => () => { if (dubPollRef.current) clearInterval(dubPollRef.current); }, []);
  // Translate (once) via the server, which caches into reports.subtitles so it is instant next time.
  const fetchLang = async (k) => {
    const texts = (turns || []).map((t) => t.text || "");
    if (!texts.length || !meetingId) return null;
    try {
      const r = await fetch("/api/pretranslate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId, lang: k, texts, shareToken: shareTok || undefined }) });
      const d = await r.json();
      if (r.ok && Array.isArray(d.lines)) { setSubCache((c) => ({ ...c, [k]: d.lines })); return d.lines; }
    } catch (e) {}
    return null;
  };
  const chooseLang = async (k) => {
    setSubLang(k); setSubMenu(false);
    if (k === "off" || subCache[k]) return;
    setSubBusy(true);
    await fetchLang(k);
    setSubBusy(false);
  };
  // On-demand translation: we DON'T pre-translate all languages (that cost ~8x). Subtitles are
  // translated only when a language is selected (chooseLang), then cached in the report so the
  // next time is instant + free. Any languages already cached load immediately.
  // The active subtitle phrase (and a stable key) for a language at a given time: split the turn
  // into phrases and advance through them across the turn's duration (Netflix-style).
  const phraseAt = (lang, time) => {
    const tns = turns || [];
    let idx = -1;
    for (let i = 0; i < tns.length; i++) { const tn = tns[i]; if (tn && tn.at != null && tn.at <= time + 0.3) idx = i; else if (tn && tn.at != null) break; }
    if (idx < 0) return { text: "" };
    const raw = (subCache[lang] && subCache[lang][idx]) || (tns[idx] && tns[idx].text) || "";
    const phrases = splitPhrases(raw);
    if (!phrases.length) return { text: "" };
    const at = tns[idx].at || 0;
    const nextAt = (tns[idx + 1] && tns[idx + 1].at != null) ? tns[idx + 1].at : at + Math.max(2.5, phrases.length * 2.5);
    const span = Math.max(0.6, nextAt - at);
    const pi = Math.min(phrases.length - 1, Math.floor(Math.min(0.999, Math.max(0, (time - at) / span)) * phrases.length));
    return { text: phrases[pi] };
  };

  const pip = async () => { const v = videoRef.current; if (!v) return; try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await v.requestPictureInPicture(); } catch (e) {} };

  // Chapter-segmented progress track + current chapter name (Read.ai-style).
  const chapAts = dur ? [...new Set((markers || []).filter((m) => m.type === "chapter" && m.at != null && m.at < dur).map((m) => Math.round(m.at)))].sort((a, b) => a - b) : [];
  const bounds = [0, ...chapAts, dur];
  const segs2 = []; for (let i = 0; i < bounds.length - 1; i++) if (bounds[i + 1] > bounds[i]) segs2.push({ start: bounds[i], end: bounds[i + 1] });
  let curChapter = ""; if (everPlayed) { const cm = (markers || []).filter((m) => m.type === "chapter" && m.at != null).sort((a, b) => a.at - b.at); for (const c of cm) { if (c.at <= cur) curChapter = c.label; else break; } }
  // Current subtitle line (the latest transcript turn whose timestamp has passed), in the
  // chosen language (translated cache when available, else the original text).
  // Netflix-style subtitle: the active phrase for the chosen language (same logic the dub uses).
  const capText = cc ? phraseAt(subLang, cur).text : "";

  // "started" = the user actually pressed play (NOT just the poster frame seeked to coverAt).
  // So a freshly opened report shows "Recording" and plays from 0; only after real playback
  // does it offer "Play (Xm left)" to resume.
  const started = startedRef.current && dur > 0 && cur > 2;
  const MENU = [
    started
      ? { k: "full", label: "Play", sub: mins(Math.max(0, dur - cur)) + " left", primary: true, resume: true }
      : { k: "full", label: "Recording", sub: dur ? mins(dur) : "", primary: true },
    { k: "trailer", label: "Trailer", sub: dur ? mins(segTotal(buildSegments("trailer", dur))) : "<1m" },
    { k: "highlights", label: "Highlights", sub: uniqAts.length ? mins(segTotal(buildSegments("highlights", dur))) : "-" },
  ];

  // Trailer plays as ONE continuous clip: hide the dots and show montage progress/time.
  const isTrailer = mode === "trailer";
  // Until the user actually starts playback, the timeline reads 0:00 with an empty bar even
  // though the poster frame sits at the cover moment - so opening a report always shows 0:00.
  const shownCur = everPlayed ? cur : 0;
  let barPct, tLeft, tRight;
  if (isTrailer && segsRef.current.length) {
    const segs = segsRef.current, i = Math.min(segIdxRef.current, segs.length - 1);
    const tot = segTotal(segs) || 1;
    const done = segs.slice(0, i).reduce((a, s) => a + (s.end - s.start), 0);
    const within = Math.min(Math.max(cur - segs[i].start, 0), segs[i].end - segs[i].start);
    barPct = ((done + within) / tot) * 100; tLeft = fmtClock(done + within); tRight = fmtClock(tot);
  } else { barPct = dur ? (shownCur / dur) * 100 : 0; tLeft = fmtClock(shownCur); tRight = fmtClock(dur); }

  return (
    <div ref={wrapRef} onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm">
      <video ref={videoRef} src={dubUrl || (src + "#t=" + (coverAt || 8))} preload="auto" playsInline
        onClick={() => { if (autoplayClick && !collapsed) toggle(); }}
        onLoadedMetadata={setD} onDurationChange={setD} onTimeUpdate={onTime}
        onSeeking={(e) => setCur(e.currentTarget.currentTime)} onSeeked={(e) => setCur(e.currentTarget.currentTime)}
        onPlay={() => { setPlaying(true); setEverPlayed(true); startedRef.current = true; }} onPause={() => setPlaying(false)} className={"aspect-video w-full bg-black" + (collapsed ? " hidden" : "")} />
      {/* Fade-to-black overlay for seamless trailer scene transitions. */}
      {!collapsed && <div className="pointer-events-none absolute inset-0 z-20 bg-black transition-opacity duration-300" style={{ opacity: fading ? 1 : 0 }} />}
      {/* Collapse the video to just its control bar (toggle is in the bar when collapsed). */}
      {!collapsed && (
        <button onClick={() => setCollapsed(true)} title="Collapse video"
          className="absolute right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-violet-700 shadow transition hover:bg-white">
          <ChevronsDownUp size={18} />
        </button>
      )}
      {/* Dubbing in progress indicator */}
      {!collapsed && dubStatus === "dubbing" && (
        <div className="absolute left-3 top-3 z-40 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur"><Loader2 size={13} className="animate-spin" /> Dubbing to {dubLang}… (a few minutes)</div>
      )}
      {/* Subtitles overlay (off by default; language chosen via the CC menu). */}
      {!collapsed && cc && (capText || subBusy) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-30 flex justify-center px-6">
          <span className="line-clamp-2 max-w-[70%] rounded-lg bg-black/85 px-3 py-1.5 text-center text-[15px] font-medium leading-snug text-white shadow-lg backdrop-blur-md" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{subBusy && !subCache[subLang] ? "Translating subtitles…" : capText}</span>
        </div>
      )}
      {/* Hover menu: smart playback modes (only when paused so it doesn't block viewing). */}
      {!collapsed && !playing && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2.5 bg-black/30">
          {MENU.map((mi) => (
            <button key={mi.k} onClick={(e) => { e.stopPropagation(); mi.resume ? resumePlay() : startMode(mi.k); }}
              className={"flex w-60 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold backdrop-blur-sm transition " + (mi.primary ? "bg-violet-600 text-white shadow-lg hover:bg-violet-500" : "bg-white/15 text-white hover:bg-white/25")}>
              {mi.label} <span className="font-normal text-white/75">{mi.sub}</span>
            </button>
          ))}
        </div>
      )}
      <div className={collapsed ? "relative z-30 bg-neutral-900 px-4 pb-3 pt-3" : "absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10"}>
        {/* Settings popover (metrics / highlights / autoplay + playback speed). */}
        {showSettings && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
            <div className="absolute bottom-12 right-2 z-50 w-72 rounded-2xl border border-white/10 bg-neutral-900/95 p-2 text-white shadow-2xl backdrop-blur-md">
              <div className="px-2 py-2 text-center text-[14px] font-bold tracking-wide">Settings</div>
              {[
                { label: "Show metrics on screen", v: showMetrics, set: setShowMetrics },
                { label: "Show highlights on screen", v: showHighlights, set: setShowHighlights },
                { label: "Auto-play video on click", v: autoplayClick, set: setAutoplayClick },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-3 py-2">
                  <span className="text-[13px] text-white/90">{row.label}</span>
                  <button onClick={() => row.set((x) => !x)} className={"relative h-5 w-9 shrink-0 rounded-full transition " + (row.v ? "bg-violet-500" : "bg-white/25")}>
                    <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all " + (row.v ? "left-[18px]" : "left-0.5")} />
                  </button>
                </div>
              ))}
              <div className="mt-1 px-3 text-[13px] text-white/90">Playback speed</div>
              <div className="relative mx-4 mb-1 mt-3 flex items-center justify-between">
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20" />
                {RATES.map((r) => (
                  <button key={r} onClick={() => setRateTo(r)} title={r + "x"}
                    className={"relative h-3 w-3 rounded-full transition " + (rate === r ? "bg-violet-400 ring-4 ring-violet-400/30" : "bg-white/40 hover:bg-white/70")} />
                ))}
              </div>
              <div className="mx-3 mb-1 flex justify-between text-[10px] text-white/40"><span>.5x</span><span>Normal</span><span>2x</span></div>
            </div>
          </>
        )}
        {showMetrics && hover && dur > 0 && !isTrailer && (
          <div className="pointer-events-none absolute bottom-12 z-10 max-w-[260px] -translate-x-1/2 rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg" style={{ left: `${(hover.at / dur) * 100}%` }}>
            <span className="font-semibold" style={{ color: MARKER_STYLE[hover.type].color }}>{MARKER_STYLE[hover.type].label}</span>
            <span className="text-white/85"> · {hover.label}</span>
          </div>
        )}
        {isTrailer ? (
          /* Trailer: one continuous clean line, no dots. */
          <div ref={barRef} onClick={onBar} className="relative h-3 cursor-pointer">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/30" />
            <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-violet-500" style={{ width: barPct + "%" }} />
          </div>
        ) : (
          /* Recording / Highlights: chapter-segmented track with colored dots ABOVE it. */
          <div ref={barRef} onClick={onBar} className="relative h-4 cursor-pointer">
            {showHighlights && dur > 0 && markers.map((mk, i) => (
              <button key={i} onMouseEnter={() => setHover(mk)} onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); clearMode(); const v = videoRef.current; if (v) { v.currentTime = mk.at; v.play().catch(() => {}); } }}
                className="absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full border border-white/70 transition hover:scale-150"
                style={{ left: `${(mk.at / dur) * 100}%`, background: MARKER_STYLE[mk.type].color }} aria-label={mk.label} />
            ))}
            {(dur > 0 ? (segs2.length ? segs2 : [{ start: 0, end: dur }]) : []).map((sg, i) => {
              const f = Math.min(1, Math.max(0, (shownCur - sg.start) / Math.max(0.5, sg.end - sg.start)));
              return (
                <div key={i} className="absolute bottom-0.5 h-1 overflow-hidden rounded-full bg-white/30" style={{ left: `calc(${(sg.start / dur) * 100}% + 1.5px)`, width: `calc(${((sg.end - sg.start) / dur) * 100}% - 3px)` }}>
                  <div className="h-full rounded-full bg-violet-500" style={{ width: f * 100 + "%" }} />
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-white">
          <button onClick={toggle} className="hover:text-violet-300">{playing ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}</button>
          <span className="whitespace-nowrap font-mono text-[12px] text-white/90">{tLeft} / {tRight}</span>
          {showMetrics && !isTrailer && curChapter && <span className="truncate text-[12px] text-white/70">• {curChapter}</span>}
          {mode && mode !== "full" && <span className="shrink-0 rounded bg-violet-500/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{mode === "trailer" ? "Trailer" : "Highlights"}</span>}
          <div className="flex-1" />
          {/* Volume (Prime Video style): hover the speaker -> vertical slider appears; it stays
              while the cursor is over the button OR the slider (they overlap a few px so there is
              NO gap) and while dragging; it disappears as soon as you move away. No clicking. */}
          <div className="relative" onMouseEnter={() => setVolOpen(true)} onMouseLeave={() => { if (!volDragRef.current) setVolOpen(false); }}>
            {volOpen && (
              <div className="absolute bottom-full left-1/2 z-50 -translate-x-1/2 pb-2">{/* pb-2 = transparent hover bridge so the card sits above the icon without breaking hover */}
                <div className="flex flex-col items-center rounded-full border border-white/10 bg-neutral-900/95 px-3 py-3.5 shadow-xl">
                  <div ref={volRef} onMouseDown={startVolDrag} className="relative h-20 w-2 cursor-pointer rounded-full bg-white/20">
                    <div className="absolute bottom-0 left-0 w-full rounded-full bg-violet-500" style={{ height: (muted ? 0 : volume) * 100 + "%" }} />
                    <div className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/10" style={{ bottom: (muted ? 0 : volume) * 100 + "%" }} />
                  </div>
                </div>
              </div>
            )}
            <button onClick={toggleMute} title="Mute / volume" className="hover:text-violet-300">{muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
          </div>
          {/* Subtitles: own button + language menu (off by default). */}
          <div className="relative">
            {subMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSubMenu(false)} />
                <div className="absolute bottom-9 right-0 z-50 max-h-[19rem] w-64 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/95 p-2 text-white shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-center gap-2 px-3 py-2 text-[14px] font-bold">Subtitles {subBusy && <Loader2 size={13} className="animate-spin text-white/60" />}</div>
                  {["off", ...SUB_LANGS].map((k) => (
                    <button key={k} onClick={() => chooseLang(k)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] hover:bg-white/10">
                      <span className="w-4">{subLang === k && <Check size={15} className="text-violet-300" />}</span>
                      <span className={subLang === k ? "font-semibold" : "text-white/85"}>{k === "off" ? "Off" : k}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setSubMenu((s) => !s)} title="Subtitles"
              className={"flex h-5 items-center rounded px-1 text-[11px] font-bold transition hover:text-violet-300 " + (cc ? "bg-white text-neutral-900" : "")}>CC</button>
          </div>
          {/* Dub video (ElevenLabs) - keeps each participant's voice. Owner only. */}
          {!shareTok && meetingId && (
            <div className="relative">
              {dubMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDubMenu(false)} />
                  <div className="absolute bottom-9 right-0 z-50 max-h-[20rem] w-64 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/95 p-2 text-white shadow-2xl backdrop-blur-md">
                    <div className="px-3 pt-2 text-center text-[13px] font-bold">Dub video</div>
                    <div className="px-3 pb-2 text-center text-[11px] text-white/50">AI voices, keeps each speaker · ~{dubCost}</div>
                    <button onClick={() => startDub("original")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] hover:bg-white/10"><span className="w-4">{!dubUrl && <Check size={15} className="text-violet-300" />}</span>Original</button>
                    {DUB_LANGS.map(([code, label]) => (
                      <button key={code} onClick={() => startDub(code)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] hover:bg-white/10">
                        <span className="w-4">{dubLang === code && dubUrl && <Check size={15} className="text-violet-300" />}</span>
                        <span className={dubLang === code ? "font-semibold" : "text-white/85"}>{label}</span>
                        {dubLang === code && dubStatus === "dubbing" && <Loader2 size={13} className="ml-auto animate-spin text-white/60" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button onClick={() => setDubMenu((s) => !s)} title="Dub the video into another language (AI, keeps each voice)" className={"hover:text-violet-300 " + (dubUrl ? "text-violet-300" : "")}><Globe size={16} /></button>
            </div>
          )}
          <button onClick={() => setShowSettings((s) => !s)} title="Settings (playback speed & overlays)" className="flex items-center gap-0.5 hover:text-violet-300"><Settings size={16} />{rate !== 1 && <span className="text-[10px] font-semibold">{rate}x</span>}</button>
          <button onClick={pip} title="Picture in picture (click the screen or this button to go back)" className="hover:text-violet-300"><PictureInPicture2 size={16} /></button>
          <button onClick={fs} title="Fullscreen" className="hover:text-violet-300"><Maximize2 size={16} /></button>
          {collapsed && <button onClick={() => setCollapsed(false)} title="Expand Video" className="hover:text-violet-300"><ChevronsUpDown size={16} /></button>}
        </div>
      </div>
    </div>
  );
}

// Clickable timestamp pill - jumps the meeting video to that moment.
function TimeChip({ t, onClick, className = "" }) {
  if (!t) return null;
  return (
    <button onClick={onClick} title="Jump to this moment in the video"
      className={"inline-flex shrink-0 items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-violet-600 transition hover:bg-violet-100 " + className}>
      <Play size={9} fill="currentColor" />{t}
    </button>
  );
}

// Side chat - answers questions about THIS meeting from its transcript + report.
function AskPanel({ meeting, shared, shareTok }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  // Presentation composer
  const [showComposer, setShowComposer] = useState(false);
  const [slideCount, setSlideCount] = useState(8);
  const [themeId, setThemeId] = useState("sleek-dark");
  const [withImages, setWithImages] = useState(false); // generate AI images based on the meeting
  const [atts, setAtts] = useState([]); // [{kind:'image'|'file', name, mediaType, data, text}]
  const [genBusy, setGenBusy] = useState(false);
  const [deckState, setDeckState] = useState(null); // {deck, theme, imgUrls, meta}
  const canPresent = !!(meeting.summary || (meeting.actionItems && meeting.actionItems.length) || (meeting.transcript && meeting.transcript.length));
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const onFiles = async (fileList) => {
    const out = [];
    for (const f of Array.from(fileList || []).slice(0, 6)) {
      if (f.type.startsWith("image/")) { try { out.push(await downscaleImage(f)); } catch (e) {} }
      else if (/\.(txt|md|csv)$/i.test(f.name) || f.type.startsWith("text/")) out.push({ kind: "file", name: f.name, text: await f.text() });
      else toast("Unsupported file: " + f.name);
    }
    setAtts((a) => [...a, ...out].slice(0, 6));
  };
  const generate = async (regenerate) => {
    if (genBusy) return;
    setGenBusy(true); setShowComposer(false);
    const images = atts.filter((a) => a.kind === "image").map((a) => ({ mediaType: a.mediaType, data: a.data }));
    const files = atts.filter((a) => a.kind === "file").map((a) => ({ name: a.name, text: a.text }));
    try {
      const r = await fetch("/api/slides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, shareToken: shared ? shareTok : undefined, slideCount, themeId, withImages, images, files, regenerate: !!regenerate }) });
      const d = await r.json();
      if (r.status === 429) { toast(withImages ? "You've reached this month's limit for presentations with images." : "You've reached this month's limit for presentations."); return; }
      if (!r.ok || !d.deck) { toast("Couldn't generate the deck - try again"); return; }
      const genImages = Array.isArray(d.genImages) ? d.genImages : [];
      const imgUrls = images.map((im) => `data:${im.mediaType};base64,${im.data}`).concat(genImages);
      const deck = coerceDeck(d.deck, { wantN: slideCount, imageCount: imgUrls.length });
      setDeckState({ deck, theme: getTheme(d.themeId || themeId), imgUrls, meta: d.meta });
      setAtts([]);
    } catch (e) { toast("Network error"); } finally { setGenBusy(false); }
  };

  const suggested = (meeting.keyQA || []).map((q) => q.q).filter(Boolean).slice(0, 4);
  const sug = suggested.length ? suggested : ["Summarize the key decisions", "What are the action items and who owns them?", "What are the next steps?", "What questions were left open?"];

  const buildContext = () => {
    const tr = (meeting.transcript || []).map((t) => `${t.speaker}: ${t.text}`).join("\n").slice(0, 70000);
    const ai = (meeting.actionItems || []).map((a) => `- ${a.task} (${a.owner})`).join("\n");
    return `Meeting: ${meeting.title}\nSummary: ${meeting.summary || ""}\nAction items:\n${ai}\n\nTranscript:\n${tr || "(no transcript)"}`;
  };

  const ask = async (textArg) => {
    const question = (textArg ?? input).trim();
    if (!question || busy) return;
    const history = [...msgs, { role: "user", text: question }];
    setInput(""); setMsgs(history); setBusy(true);
    try {
      const sys = "You are Octo, answering questions about ONE meeting. Use ONLY the meeting data below. Be concise and specific; mention who said what when useful. Reply in the SAME language as the question. If the answer isn't in the meeting, say you couldn't find it in this meeting.\n\n=== MEETING ===\n" + buildContext();
      const apiMsgs = history.filter((m) => m.role === "user" || m.role === "assistant").slice(-8).map((m) => ({ role: m.role, content: m.text }));
      const ans = await callClaude(apiMsgs, sys);
      setMsgs((m) => [...m, { role: "assistant", text: ans || "-" }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: "I couldn't analyze the meeting right now - make sure the report finished, then try again." }]);
    } finally { setBusy(false); }
  };

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-l border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><Sparkles size={16} className="text-violet-500" /><span className="text-sm font-bold text-slate-900">Ask Octo</span></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.length === 0 && <p className="text-[13px] leading-relaxed text-slate-400">Ask anything about this meeting - Octo answers from the transcript & report.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user"
            ? "ml-auto max-w-[88%] rounded-2xl bg-violet-600 px-3 py-2 text-sm text-white"
            : "mr-auto max-w-[92%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-700"}>{m.text}</div>
        ))}
        {busy && <div className="mr-auto flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" />Octo is thinking…</div>}
        <div ref={endRef} />
      </div>
      {msgs.length === 0 && (
        <div className="space-y-2 px-4 pb-1">
          {sug.map((q, i) => (
            <button key={i} onClick={() => ask(q)} className="flex w-full items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-[13px] text-slate-600 transition hover:border-violet-300 hover:bg-violet-50/50"><Sparkles size={13} className="mt-0.5 shrink-0 text-violet-400" />{q}</button>
          ))}
        </div>
      )}
      <div className="relative border-t border-slate-200 p-3">
        {showComposer && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowComposer(false)} />
            <div className="absolute bottom-16 left-3 right-3 z-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
              <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-slate-800"><Presentation size={14} className="text-violet-600" /> Presentation</div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Slides</div>
              <div className="mb-3 flex gap-1.5">
                {[5, 8, 10, 12].map((n) => (
                  <button key={n} onClick={() => setSlideCount(n)} className={"flex-1 rounded-lg border py-1.5 text-[13px] font-semibold " + (slideCount === n ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600")}>{n}</button>
                ))}
              </div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Theme</div>
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {THEME_LIST.map((t) => (
                  <button key={t.id} onClick={() => setThemeId(t.id)} className={"flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left " + (themeId === t.id ? "border-violet-500" : "border-slate-200")}>
                    <span className="flex h-5 w-5 overflow-hidden rounded-full ring-1 ring-black/10"><span className="h-full w-1/2" style={{ background: t.bg }} /><span className="h-full w-1/2" style={{ background: t.accent }} /></span>
                    <span className="text-[12px] font-medium text-slate-700">{t.name}</span>
                  </button>
                ))}
              </div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Images</div>
              <div className="mb-3 flex gap-1.5">
                <button onClick={() => setWithImages(false)} className={"flex-1 rounded-lg border py-1.5 text-[12px] font-semibold " + (!withImages ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600")}>No images</button>
                <button onClick={() => setWithImages(true)} className={"flex-1 rounded-lg border py-1.5 text-[12px] font-semibold " + (withImages ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600")}>✨ AI images</button>
              </div>
              {withImages && <div className="mb-3 -mt-1 text-[11px] leading-snug text-slate-400">Generates a few images based on the meeting (slower, ~30s).</div>}
              {atts.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {atts.map((a, i) => (<span key={i} className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{a.kind === "image" ? <ImagePlus size={11} /> : <Paperclip size={11} />}{(a.name || "image").slice(0, 18)}<button onClick={() => setAtts((x) => x.filter((_, j) => j !== i))}><X size={11} /></button></span>))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50">
                  <Paperclip size={13} /> Attach
                  <input type="file" multiple accept="image/*,.txt,.md,.csv,text/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />
                </label>
                <button onClick={generate} disabled={genBusy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:opacity-70">{genBusy ? <><Loader2 size={13} className="animate-spin" /> Generating…</> : <><Sparkles size={13} /> Generate</>}</button>
              </div>
            </div>
          </>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-violet-400">
          <button onClick={() => canPresent ? setShowComposer((v) => !v) : toast("Available once the report is ready")} disabled={genBusy} title="Generate a presentation from this meeting" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 transition hover:bg-violet-200 disabled:opacity-50">{genBusy ? <Loader2 size={18} className="animate-spin" /> : <Presentation size={18} />}</button>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} placeholder="Ask Octo anything…" className="flex-1 bg-transparent text-sm outline-none" />
          <button onClick={() => ask()} disabled={busy} className="text-violet-600 transition disabled:text-slate-300"><Send size={16} /></button>
        </div>
      </div>
      {deckState && <SlidesModal deck={deckState.deck} theme={deckState.theme} imgUrls={deckState.imgUrls} meta={deckState.meta} onClose={() => setDeckState(null)} onRegenerate={() => generate(true)} regenerating={genBusy} />}
    </aside>
  );
}

// Per-person access role chooser (Viewer / Editor / Remove Access) - matches Read.ai.
// Menu is FIXED-positioned so the share modal's scroll/overflow never clips it.
function RoleDropdown({ role, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const openMenu = () => {
    const r = btnRef.current && btnRef.current.getBoundingClientRect();
    if (r) { const W = 288, below = window.innerHeight - r.bottom; setPos({ left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)), top: below > 250 ? r.bottom + 6 : null, bottom: below > 250 ? null : window.innerHeight - r.top + 6 }); }
    setOpen(true);
  };
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} onClick={() => (open ? setOpen(false) : openMenu())} className={"flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 " + (open ? "border-violet-400" : "border-slate-200")}>{role} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div className="fixed z-[71] w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" style={{ left: pos.left, top: pos.top != null ? pos.top : undefined, bottom: pos.bottom != null ? pos.bottom : undefined }}>
            {[{ k: "Viewer", icon: <Eye size={16} />, d: "Can view and download the detailed meeting report and metrics" }, { k: "Editor", icon: <Pencil size={16} />, d: "Can view the full report, edit the notes and transcript, download, and share" }].map((o) => (
              <button key={o.k} onClick={() => { onChange(o.k); setOpen(false); }} className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50">
                <span className="mt-0.5 text-slate-500">{o.icon}</span>
                <span className="flex-1">
                  <span className="flex items-center justify-between text-[14px] font-semibold text-slate-800">{o.k}{role === o.k && <Check size={15} className="text-violet-600" />}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{o.d}</span>
                </span>
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button onClick={() => { onRemove(); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] font-medium text-rose-600 hover:bg-rose-50"><MinusCircle size={16} /> Remove Access</button>
          </div>
        </>
      )}
    </div>
  );
}

// ===== AI Smart Document (Gamma-style rich doc) =====
const escD = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DOC_CSS = `*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e1b2e;line-height:1.65;max-width:760px;margin:0 auto;padding:40px 36px;background:#fff}
.title{font-size:30px;font-weight:800;color:#5b21b6;margin:0 0 2px;line-height:1.2}
.subtitle{color:#64748b;font-size:14.5px;margin-top:2px}
.tags{margin:14px 0 4px}
.tag{display:inline-block;background:#ede9fe;color:#6d28d9;font-size:12px;font-weight:700;border-radius:999px;padding:3px 11px;margin:0 5px 5px 0}
.tldr{background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:10px;padding:14px 16px;margin:20px 0;font-size:15px}
.tldr b{color:#6d28d9;text-transform:uppercase;font-size:11px;letter-spacing:.06em}
h2{font-size:19px;color:#4c1d95;margin:28px 0 8px;font-weight:800}
p{margin:8px 0}ul{margin:8px 0;padding-left:22px}li{margin:5px 0}
.ai li b{color:#1e1b2e}
.quote{font-style:italic;color:#475569;border-left:3px solid #c4b5fd;padding:4px 0 4px 16px;margin:22px 0;font-size:15.5px}
.foot{margin-top:36px;color:#a78bfa;font-size:12px;font-weight:600;border-top:1px solid #eee;padding-top:14px}
@media print{body{padding:0}}`;
function docHTML(doc, meta) {
  doc = doc || {}; meta = meta || {};
  const tags = (doc.tags || []).map((t) => `<span class="tag">${escD(t)}</span>`).join("");
  const sections = (doc.sections || []).map((s) =>
    `<h2>${escD(s.emoji || "")} ${escD(s.heading || "")}</h2>`
    + (s.paragraphs || []).map((p) => `<p>${escD(p)}</p>`).join("")
    + ((s.bullets && s.bullets.length) ? `<ul>${s.bullets.map((b) => `<li>${escD(b)}</li>`).join("")}</ul>` : "")
  ).join("");
  const decisions = (doc.decisions && doc.decisions.length) ? `<h2>✅ Decisions</h2><ul>${doc.decisions.map((d) => `<li>${escD(d)}</li>`).join("")}</ul>` : "";
  const aitems = (doc.actionItems && doc.actionItems.length) ? `<h2>📋 Action Items</h2><ul class="ai">${doc.actionItems.map((a) => `<li><b>${escD(a.task)}</b>${a.owner ? ` — ${escD(a.owner)}` : ""}${a.due ? ` <span style="color:#7c3aed;font-weight:600">(${escD(a.due)})</span>` : ""}</li>`).join("")}</ul>` : "";
  const next = (doc.nextSteps && doc.nextSteps.length) ? `<h2>➡️ Next Steps</h2><ul>${doc.nextSteps.map((n) => `<li>${escD(n)}</li>`).join("")}</ul>` : "";
  const quote = (doc.quote && doc.quote.text) ? `<div class="quote">“${escD(doc.quote.text)}”${doc.quote.who ? `<br><span style="font-style:normal;font-weight:700;color:#7c3aed">— ${escD(doc.quote.who)}</span>` : ""}</div>` : "";
  let dateStr = ""; try { if (meta.date) dateStr = new Date(meta.date).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }); } catch (e) {}
  const body = `<div class="title">${escD(doc.title || meta.title || "Meeting")}</div>`
    + (doc.subtitle ? `<div class="subtitle">${escD(doc.subtitle)}</div>` : "")
    + (dateStr ? `<div class="subtitle">${escD(dateStr)}</div>` : "")
    + (tags ? `<div class="tags">${tags}</div>` : "")
    + (doc.tldr ? `<div class="tldr"><b>${escD(doc.summaryLabel || "Resumen")}</b><br>${escD(doc.tldr)}</div>` : "")
    + sections + decisions + aitems + next + quote
    + `<div class="foot">Generated by OctoMeet AI 🐙</div>`;
  const title = escD(doc.title || meta.title || "Meeting Document");
  const full = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${DOC_CSS}</style></head><body>${body}</body></html>`;
  return { full, title: doc.title || meta.title || "Meeting" };
}
function DocModal({ loading, doc, meta, onClose, onRegenerate, regenerating }) {
  const built = loading ? null : docHTML(doc, meta);
  const full = built ? built.full : "";
  const title = built ? built.title : "Meeting";
  const base = (title || "meeting").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "meeting";
  const dlPDF = () => { const w = window.open("", "_blank"); if (w) { w.document.write(full); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 350); } toast("Opening printable doc - choose 'Save as PDF'"); };
  const dlWord = () => { const url = URL.createObjectURL(new Blob([full], { type: "application/msword" })); const a = document.createElement("a"); a.href = url; a.download = base + ".doc"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); toast("Word document downloaded"); };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 sm:p-6" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Sparkles size={16} className="text-violet-600" /> AI Document</div>
          <div className="flex items-center gap-2">
            {onRegenerate && <button onClick={onRegenerate} disabled={loading || regenerating} title="Generate a fresh version" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">{regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Regenerate</button>}
            <button onClick={dlPDF} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"><Download size={14} /> PDF</button>
            <button onClick={dlWord} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Download size={14} /> Word</button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 size={30} className="animate-spin text-violet-600" />
            <div className="text-sm font-medium">Generating your document…</div>
            <div className="text-[12px] text-slate-400">Analyzing the meeting and structuring it</div>
          </div>
        ) : (
          <iframe title="document" srcDoc={full} className="w-full flex-1 bg-white" />
        )}
      </div>
    </div>
  );
}

// Downscale + re-encode an image to JPEG before sending (keeps the request small/fast).
async function downscaleImage(file, max = 1280, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  const dataUrl = cv.toDataURL("image/jpeg", quality);
  return { kind: "image", name: file.name, mediaType: "image/jpeg", data: dataUrl.split(",")[1] };
}

// Full-screen Gamma-style deck preview (thumbnail rail + slide viewer) + PDF / PPTX export.
function SlidesModal({ deck, theme, imgUrls, meta, onClose, onRegenerate, regenerating }) {
  const [idx, setIdx] = useState(0);
  const full = useMemo(() => deckHTML(deck, theme, imgUrls), [deck, theme, imgUrls]);
  const one = useMemo(() => deckHTML({ ...deck, slides: [deck.slides[idx]] }, theme, imgUrls, { fit: true }), [deck, theme, imgUrls, idx]);
  useEffect(() => {
    const k = (e) => { if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, deck.slides.length - 1)); if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0)); if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.slides.length]);
  const dlPDF = () => { const w = window.open("", "_blank"); if (w) { w.document.write(full); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400); } toast("Opening printable deck - choose 'Save as PDF' (landscape)"); };
  const dlPPTX = async () => { try { await exportPptx(deck, theme, imgUrls); toast("PowerPoint downloaded"); } catch (e) { toast("Couldn't export PPTX"); } };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2 truncate text-sm font-bold text-slate-800"><Presentation size={16} className="text-violet-600" /> {deck.title}</div>
          <div className="flex items-center gap-2">
            {onRegenerate && <button onClick={onRegenerate} disabled={regenerating} title="Generate a fresh version" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">{regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Regenerate</button>}
            <button onClick={dlPDF} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> PDF</button>
            <button onClick={dlPPTX} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-500"><Download size={14} /> PowerPoint</button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 shrink-0 space-y-2 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3">
            {deck.slides.map((s, i) => (
              <button key={i} onClick={() => setIdx(i)} className={"block w-full overflow-hidden rounded-lg border text-left " + (i === idx ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200")}>
                <div className="aspect-video w-full" style={{ background: theme.bg }}>
                  <div className="p-2 text-[8px] font-bold leading-tight" style={{ color: theme.heading, fontFamily: theme.fontHead }}>{i + 1}. {(s.title || s.headline || "").slice(0, 60)}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-auto bg-slate-100 p-6">
            <iframe title="slide" srcDoc={one} className="aspect-video w-full max-w-3xl rounded-lg bg-white shadow-lg" style={{ border: "none" }} />
            <button onClick={() => setIdx((i) => Math.max(i - 1, 0))} className="absolute left-3 rounded-full bg-white/90 p-2 shadow disabled:opacity-30" disabled={idx === 0}><ChevronLeft size={18} /></button>
            <button onClick={() => setIdx((i) => Math.min(i + 1, deck.slides.length - 1))} className="absolute right-3 rounded-full bg-white/90 p-2 shadow disabled:opacity-30" disabled={idx === deck.slides.length - 1}><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Review + send (or copy) an AI-drafted follow-up email.
function FollowupModal({ data, meetingId, onClose }) {
  const [subject, setSubject] = useState(data.subject || "");
  const [bodyTxt, setBodyTxt] = useState(data.body || "");
  const [to, setTo] = useState((data.to || []).join(", "));
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const emails = to.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) return toast("Add at least one recipient");
    setBusy(true);
    try {
      const r = await fetch("/api/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", meetingId, subject, body: bodyTxt, to: emails }) });
      const d = await r.json();
      if (r.ok) { toast(`Follow-up sent to ${d.sent} recipient${d.sent === 1 ? "" : "s"}`); onClose(); }
      else toast(d.error === "needScope" ? "Reconnect Google to send email" : "Couldn't send - try again");
    } catch (e) { toast("Network error"); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${bodyTxt}`); toast("Copied to clipboard"); } catch (e) {} };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Mail size={16} className="text-violet-600" /> Follow-up email</div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <div><label className="text-[12px] font-semibold text-slate-500">To</label><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="emails, comma separated" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" /></div>
          <div><label className="text-[12px] font-semibold text-slate-500">Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" /></div>
          <div><label className="text-[12px] font-semibold text-slate-500">Message</label><textarea value={bodyTxt} onChange={(e) => setBodyTxt(e.target.value)} rows={12} className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm leading-relaxed outline-none focus:border-violet-400" /></div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <button onClick={copy} className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700"><Copy size={14} /> Copy</button>
          <button onClick={send} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send from my Gmail</button>
        </div>
      </div>
    </div>
  );
}

function MeetingDetail({ meeting, onBack, onUpdate, meetings, initialShare, shared, onRename, onDelete, role, shareTok, user }) {
  // Capability matrix (Read.ai parity): Owner (not shared) = all; Editor token = edit+share+manage; Viewer = read-only.
  const canEdit = !shared || role === "Editor";
  const canShare = !shared || role === "Editor";
  const canManage = !shared || role === "Editor";
  const canDelete = !shared; // delete-for-everyone is owner-only
  const [tab, setTab] = useState("notes");
  const [q, setQ] = useState("");
  const [showDesc, setShowDesc] = useState(true);

  // Jump the meeting video to a given second (used by clickable timestamps on action
  // items, highlights, etc.) and scroll it into view.
  const videoRef = useRef(null);
  const seekTo = (sec) => {
    if (sec == null || !Number.isFinite(sec)) return;
    const v = videoRef.current;
    if (!v) return;
    try { v.currentTime = sec; const p = v.play(); if (p && p.catch) p.catch(() => {}); v.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
  };

  const [summaryMode, setSummaryMode] = useState("standard");
  const [menu, setMenu] = useState(null); // header dropdown: "download" | "push" | "more" | null
  const [docBusy, setDocBusy] = useState(false); // generating in the background (button spinner)
  const [docData, setDocData] = useState(null); // { doc, meta } -> opens the modal when ready
  const [fupBusy, setFupBusy] = useState(false);
  const [fupData, setFupData] = useState(null); // { subject, body, to } -> opens the follow-up modal
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [access, setAccess] = useState([]); // per-person shares [{email,role,name}]
  const [shareOpen, setShareOpen] = useState(false);
  // Opened via the list "⋯ → Share": jump straight into the share modal.
  useEffect(() => { if (initialShare) setShareOpen(true); }, [initialShare, meeting.id]);
  // Load the persisted per-person access list when the share modal opens.
  useEffect(() => { if (shareOpen && canManage) { fetch("/api/report-access?meetingId=" + encodeURIComponent(meeting.id) + (shared ? "&shareToken=" + encodeURIComponent(shareTok || "") : "")).then((r) => (r.ok ? r.json() : { shares: [] })).then((d) => setAccess(d.shares || [])).catch(() => {}); } }, [shareOpen, canManage, shared, meeting.id]);
  const setAccessRole = (email, role) => { setAccess((a) => a.map((s) => (s.email === email ? { ...s, role } : s))); fetch("/api/report-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, email, role, shareToken: shared ? shareTok : undefined }) }).catch(() => {}); };
  const removeAccess = (email) => { setAccess((a) => a.filter((s) => s.email !== email)); fetch("/api/report-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, email, remove: true, shareToken: shared ? shareTok : undefined }) }).catch(() => {}); };
  const [addPeople, setAddPeople] = useState([]); // people invited via the Share modal
  const [shareQuery, setShareQuery] = useState("");
  const [linkAccess, setLinkAccess] = useState("restricted"); // "restricted" | "public"
  const [accessOpen, setAccessOpen] = useState(false);
  const [shareStep, setShareStep] = useState(1);
  const [shareMsg, setShareMsg] = useState("");
  const [shareRole, setShareRole] = useState("Viewer");
  const [roleOpen, setRoleOpen] = useState(false);
  const [notify, setNotify] = useState(true);
  const addPerson = (v) => { const x = (v || "").trim().replace(/,$/, ""); if (!x) return; setAddPeople((p) => (p.includes(x) ? p : [...p, x])); setShareQuery(""); };
  const closeShare = () => { setShareOpen(false); setShareStep(1); setShareQuery(""); setShareMsg(""); setAccessOpen(false); setRoleOpen(false); setAddPeople([]); };
  const doShare = async () => {
    const emails = addPeople.filter((p) => /.+@.+\..+/.test(p));
    const n = addPeople.length, msg = shareMsg;
    // Persist each added email into the per-person access list with the chosen role.
    emails.forEach((em) => { fetch("/api/report-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, email: em, role: shareRole || "Viewer", shareToken: shared ? shareTok : undefined }) }).catch(() => {}); });
    closeShare();
    if (notify && emails.length) {
      toast("Sending email…");
      try {
        const r = await fetch("/api/send-share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, to: emails, message: msg, role: shareRole, shareToken: shared ? shareTok : undefined }) });
        const d = await r.json();
        if (r.ok && d.sent) toast(`Report emailed to ${d.sent} ${d.sent > 1 ? "people" : "person"} ✓`);
        else if (d.error === "needScope") toast("Reconectá Google (permiso de email): Log out e iniciá sesión de nuevo");
        else toast("No se pudo enviar el email: " + (d.detail || d.error || ""));
      } catch (e) { toast("No se pudo enviar el email"); }
    } else {
      toast(n ? `Report shared with ${n} ${n > 1 ? "people" : "person"}` : "Report shared");
    }
  };

  // Push-to integrations (free: webhooks + Notion token).
  const [conn, setConn] = useState({});
  const [cfg, setCfg] = useState(null); // integration being configured
  const [cfgA, setCfgA] = useState(""); // webhook URL or Notion token
  const [cfgB, setCfgB] = useState(""); // Notion parent page id
  useEffect(() => { fetch("/api/integrations").then((r) => (r.ok ? r.json() : {})).then((d) => setConn(d.connected || {})).catch(() => {}); }, []);
  const doPush = async (target) => {
    setMenu(null); toast("Pushing…");
    try {
      const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, target }) });
      const d = await r.json();
      toast(r.ok ? "Sent ✓" : (d.error === "not_connected" ? "Connect it first" : "Push failed - check the URL/token"));
    } catch (e) { toast("Push failed"); }
  };
  const saveIntegration = async () => {
    if (!cfg) return;
    const config = cfg.kind === "notion" ? { token: cfgA.trim(), parent: cfgB.trim() } : { url: cfgA.trim() };
    if (!(config.url || config.token)) { toast("Paste the URL / token first"); return; }
    try { await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: cfg.key, config }) }); } catch (e) {}
    setConn((c) => ({ ...c, [cfg.key]: true }));
    const k = cfg.key, name = cfg.name; setCfg(null); setCfgA(""); setCfgB("");
    toast(name + " connected"); doPush(k);
  };
  const shortSummary = (meeting.summary || "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  // People you can share with: meeting participants + a few company teammates.
  const COMPANY = ["santiago@octoplusteam.com", "nicolas@octoplusteam.com", "team@octoplusteam.com"];
  const shareCandidates = [...new Set([...meeting.participants.map((p) => p.name), ...COMPANY])].filter((n) => !addPeople.includes(n));
  const shareMatches = shareQuery.trim() ? shareCandidates.filter((n) => n.toLowerCase().includes(shareQuery.trim().toLowerCase())) : [];

  // Persist a manual edit to a report section (one item per line) + optimistic UI update.
  const editField = async (field, raw) => {
    const lines = (typeof raw === "string" ? raw.split("\n") : (raw || [])).map((s) => String(s).trim()).filter(Boolean);
    let value, local;
    if (field === "summary") { value = (typeof raw === "string" ? raw : lines.join("\n")).trim(); local = { summary: value }; }
    else if (field === "next_steps") { value = lines; local = { nextSteps: lines }; }
    else if (field === "action_items") { value = lines.map((task, i) => ({ owner: (meeting.actionItems[i] || {}).owner || "", task, due: (meeting.actionItems[i] || {}).due || "", t: (meeting.actionItems[i] || {}).t || "" })); local = { actionItems: value.map((a) => ({ ...a, at: tsToSeconds(a.t), done: false })) }; }
    else if (field === "key_questions") { value = lines.map((qq, i) => ({ q: qq, a: (meeting.keyQA[i] || {}).a || "", t: (meeting.keyQA[i] || {}).t || "" })); local = { keyQA: value.map((k) => ({ ...k, at: tsToSeconds(k.t) })), keyQuestions: value.map((k) => k.q) }; }
    else return;
    try { await fetch("/api/report-field", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, field, value, shareToken: shared ? shareTok : undefined }) }); } catch (e) {}
    if (onUpdate) onUpdate(meetings.map((m) => (m.id === meeting.id ? { ...m, ...local } : m)));
    toast("Saved");
  };

  // Colored markers for the video timeline - chapters, key questions, action items, highlights.
  const markers = useMemo(() => [
    ...(meeting.chapters || []).filter((c) => c.at != null).map((c) => ({ at: c.at, type: "chapter", label: c.title })),
    ...(meeting.keyQA || []).filter((q2) => q2.at != null).map((q2) => ({ at: q2.at, type: "question", label: q2.q })),
    ...(meeting.actionItems || []).filter((a) => a.at != null).map((a) => ({ at: a.at, type: "action", label: a.task })),
    ...(meeting.highlights || []).filter((h) => h.at != null).map((h) => ({ at: h.at, type: "highlight", label: h.text })),
  ].sort((a, b) => a.at - b.at), [meeting]);

  const toggleItem = (idx) => {
    const next = meetings.map((m) => m.id === meeting.id
      ? { ...m, actionItems: m.actionItems.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)) } : m);
    onUpdate(next);
  };
  const filteredTurns = meeting.transcript.filter((t) => !q || (t.text + " " + t.speaker).toLowerCase().includes(q.toLowerCase()));
  const speakerIdx = {};
  meeting.participants.forEach((p, i) => (speakerIdx[p.name] = i));

  // Deterministic coaching metrics from the real transcript.
  const transcriptText = meeting.transcript.map((t) => t.text).join(" ");
  const totalWords = transcriptText.split(/\s+/).filter(Boolean).length;
  // Only genuine disfluencies (dropped ambiguous content words like "like/actually").
  const fillerCount = (transcriptText.match(/\b(um+|uh+|er+|mm+|hmm+|you know|i mean)\b/gi) || []).length;
  const fillerPct = totalWords ? Math.round((fillerCount / totalWords) * 1000) / 10 : 0;
  // Count real questions: sentences ending in "?" OR starting with an interrogative word
  // (works even when ASR omits "?"). No silent fallback to keyQuestions.
  const qLead = /^(who|what|when|where|why|how|do|does|did|are|is|was|were|can|could|would|should|will|shall|may|might|have|has|had|am|quién|qué|cuándo|dónde|por qué|cómo|cuál|puede|podría)\b/i;
  const questionsAsked = transcriptText
    ? transcriptText.split(/(?<=[.?!])\s+|\n+/).filter((s) => /\?/.test(s) || qLead.test(s.trim())).length
    : 0;
  const wpmParts = meeting.participants.filter((p) => p.wpm);
  const avgWpm = wpmParts.length ? Math.round(wpmParts.reduce((s, p) => s + p.wpm, 0) / wpmParts.length) : null;

  const TABS = [
    { k: "notes", label: "Notes", icon: FileText },
    { k: "transcript", label: "Transcript", icon: MessageSquareText },
    { k: "deepdive", label: "Deep Dive", icon: BarChart3 },
    { k: "coaching", label: "Coaching", icon: Presentation },
    { k: "highlights", label: "Highlights", icon: Sparkles },
    { k: "chapters", label: "Chapters & Topics", icon: ListChecks },
  ];

  const fileBase = () => meeting.title.replace(/[^a-z0-9]+/gi, "_");
  const reportLines = () => [
    `# ${meeting.title}`,
    `${fmtDateShort(meeting.date)} · ${meeting.timeStart} - ${meeting.timeEnd} · ${meeting.source}`,
    `Read Score ${meeting.scores.overall} · Engagement ${meeting.scores.engagement} · Sentiment ${meeting.scores.sentiment}`,
    "", "## Summary", meeting.summary,
    "", "## Action Items", ...meeting.actionItems.map((a) => `- ${a.task}${a.owner ? " (" + a.owner + ")" : ""}`),
    "", "## Key Questions", ...meeting.keyQuestions.map((q) => `- ${q}`),
    "", "## Transcript", ...meeting.transcript.map((tt) => `[${tt.t}] ${tt.speaker}: ${tt.text}`),
  ].join("\n");
  const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const reportHtml = () => `<html><head><meta charset="utf-8"><title>${esc(meeting.title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#1e1b2e;max-width:760px;margin:28px auto;line-height:1.55;padding:0 16px}h1{color:#5b21b6;margin-bottom:2px}h2{color:#6d28d9;border-bottom:1px solid #eee;padding-bottom:4px;margin-top:22px}.meta{color:#666;font-size:13px}li{margin:3px 0}</style></head><body>`
    + `<h1>${esc(meeting.title)}</h1><div class="meta">${esc(fmtDateShort(meeting.date))} · ${esc(meeting.timeStart)} - ${esc(meeting.timeEnd)} · ${esc(meeting.source)} · Read Score ${meeting.scores.overall}</div>`
    + `<h2>Summary</h2><p>${esc(meeting.summary).replace(/\n/g, "<br>")}</p>`
    + `<h2>Action Items</h2><ul>${meeting.actionItems.map((a) => `<li>${esc(a.task)}${a.owner ? " (" + esc(a.owner) + ")" : ""}</li>`).join("")}</ul>`
    + `<h2>Key Questions</h2><ul>${meeting.keyQuestions.map((qq) => `<li>${esc(qq)}</li>`).join("")}</ul>`
    + `<h2>Transcript</h2>${meeting.transcript.map((tt) => `<p><b>${esc(tt.speaker)}</b> <span class="meta">${esc(tt.t)}</span><br>${esc(tt.text)}</p>`).join("")}`
    + `</body></html>`;
  const dl = (name, content, mime) => { const url = URL.createObjectURL(new Blob([content], { type: mime })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  // AI Smart Document: Claude builds a polished, well-structured doc (PDF + Word) from the meeting.
  const genDoc = async (regenerate) => {
    setMenu(null);
    if (docBusy) return;
    setDocBusy(true); // generate in the background - the button shows "Generating…", you can keep working
    try {
      const r = await fetch("/api/document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, shareToken: shared ? shareTok : undefined, regenerate: !!regenerate }) });
      const d = await r.json();
      if (r.status === 429) { toast("You've reached this month's limit for AI documents."); return; }
      if (!r.ok || !d.doc) { toast("Couldn't generate the document - try again"); return; }
      setDocData({ doc: d.doc, meta: d.meta || { title: meeting.title, date: meeting.date } }); // opens the modal (saved or fresh)
    } catch (e) { toast("Network error"); } finally { setDocBusy(false); }
  };
  const genFollowup = async () => {
    if (fupBusy) return;
    setFupBusy(true);
    try {
      const r = await fetch("/api/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", meetingId: meeting.id }) });
      const d = await r.json();
      if (!r.ok) { toast("Couldn't draft the email - try again"); return; }
      setFupData({ subject: d.subject || "", body: d.body || "", to: d.to || [] });
    } catch (e) { toast("Network error"); } finally { setFupBusy(false); }
  };
  const doDownload = (kind) => {
    setMenu(null);
    const base = fileBase();
    if (kind === "md") dl(base + ".md", reportLines(), "text/markdown");
    else if (kind === "txt") dl(base + ".txt", reportLines(), "text/plain");
    else if (kind === "doc") dl(base + ".doc", reportHtml(), "application/msword");
    else if (kind === "transcript") dl(base + "_transcript.txt", meeting.transcript.map((tt) => `[${tt.t}] ${tt.speaker}: ${tt.text}`).join("\n"), "text/plain");
    else if (kind === "video") { if (meeting.video) { const a = document.createElement("a"); a.href = meeting.video; a.download = base + ".mp4"; a.target = "_blank"; a.click(); } else toast("No recording to download"); return; }
    else if (kind === "pdf") { const w = window.open("", "_blank"); if (w) { w.document.write(reportHtml()); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 350); } toast("Opening printable report - choose 'Save as PDF'"); return; }
    toast("Downloaded");
  };
  const DOWNLOAD_OPTS = [
    { k: "pdf", label: "PDF (print / save)" }, { k: "doc", label: "Word (.doc)" }, { k: "md", label: "Markdown (.md)" },
    { k: "txt", label: "Plain text (.txt)" }, { k: "transcript", label: "Transcript (.txt)" }, { k: "video", label: "Video (.mp4)" },
  ];
  const PUSH_OPTS = [
    { key: "confluence", name: "Confluence", brand: "confluence", kind: "webhook" },
    { key: "hubspot", name: "HubSpot", brand: "hubspot", kind: "webhook" },
    { key: "notion", name: "Notion", brand: "notion", kind: "notion" },
    { key: "salesforce", name: "Salesforce", brand: "salesforce", kind: "webhook" },
    { key: "slack", name: "Slack", brand: "slack", kind: "slack" },
    { key: "webhooks", name: "Webhooks", brand: "zapier", kind: "webhook" },
  ];
  const shareReport = async () => {
    let url = window.location.href;
    try { const r = await fetch("/api/share-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id }) }); const d = await r.json(); if (r.ok && d.url) url = d.url; } catch (e) {}
    try { await navigator.clipboard.writeText(url); toast("Public report link copied"); } catch (e) { toast("Couldn't copy the link"); }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          {shared
            ? <span className="text-sm font-semibold text-slate-700">{meeting.title}</span>
            : <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> {meeting.title}</button>}
          <div className="flex items-center gap-2">
            {/* AI Document - Claude builds a polished, well-structured doc (PDF + Word) */}
            <div className="group relative">
              <button onClick={genDoc} disabled={docBusy} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:opacity-70">{docBusy ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> AI Doc</>}</button>
              <div className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11.5px] font-normal leading-snug text-white opacity-0 shadow-xl transition group-hover:opacity-100">
                Turns this meeting into a polished, well-structured document (summary, decisions, action items) - download as <b>PDF</b> or <b>Word</b>.
              </div>
            </div>
            {/* Write a follow-up email (owner only - sends from their Gmail) */}
            {!shared && <button onClick={genFollowup} disabled={fupBusy} title="Draft a follow-up email from this meeting" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">{fupBusy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Follow-up</button>}
            {/* Download dropdown - everyone with access (incl. Viewer) can download */}
            <div className="relative">
              <button onClick={() => setMenu(menu === "download" ? null : "download")} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"><Download size={14} /> Download <ChevronDown size={13} /></button>
              {menu === "download" && (<>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                  {DOWNLOAD_OPTS.map((o) => <button key={o.k} onClick={() => doDownload(o.k)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"><Download size={13} className="text-violet-400" /> {o.label}</button>)}
                </div></>)}
            </div>
            {/* Push to dropdown - Owner only */}
            {!shared && <div className="relative">
              <button onClick={() => setMenu(menu === "push" ? null : "push")} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"><Send size={14} /> Push to… <ChevronDown size={13} /></button>
              {menu === "push" && (<>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute right-0 z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
                  {PUSH_OPTS.map((o) => (
                    <div key={o.key} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50">{o.brand === "confluence" ? <LayoutGrid size={16} className="text-sky-600" /> : o.brand === "zapier" ? <Zap size={16} className="text-orange-500" /> : <BrandIcon name={o.brand} size={18} />}</span>
                      <span className="flex-1 text-[13px] font-medium text-slate-700">{o.name}{conn[o.key] && <span className="ml-1.5 text-[10px] font-semibold text-emerald-600">connected</span>}</span>
                      {conn[o.key]
                        ? <button onClick={() => doPush(o.key)} className="rounded-lg bg-violet-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-violet-500">Push</button>
                        : <button onClick={() => { setMenu(null); setCfg(o); setCfgA(""); setCfgB(""); }} className="rounded-lg border border-slate-200 px-3 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">Add</button>}
                    </div>
                  ))}
                </div></>)}
            </div>}
            {canShare && <button onClick={() => { setShareOpen(true); setShareStep(1); }} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-500"><Share2 size={14} /> Share</button>}
            {/* 3-dots: Rename / Remove Report - Owner only */}
            {!shared && <div className="relative">
              <button onClick={() => setMenu(menu === "more" ? null : "more")} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><MoreVertical size={18} /></button>
              {menu === "more" && (<>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                  <button onClick={() => { setMenu(null); setRenameVal(meeting.title); setRenaming(true); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"><Pencil size={15} className="text-slate-400" /> Rename Report</button>
                  {canDelete && <button onClick={() => { setMenu(null); if (window.confirm("Delete this report? This cannot be undone.")) onDelete && onDelete(meeting); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-rose-600 hover:bg-rose-50"><Trash2 size={15} /> Remove Report</button>}
                </div></>)}
            </div>}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-400">
          <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDateShort(meeting.date)}</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {meeting.timeStart} - {meeting.timeEnd}</span>
          <span className="flex items-center gap-1"><Video size={12} /> {meeting.source}</span>
          <span className="flex items-center gap-1"><Users size={12} /> {meeting.participants.map((p) => p.name).join(", ")}</span>
        </div>
      </div>

      {shareOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={closeShare}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              {shareStep === 2 && <button onClick={() => setShareStep(1)} className="text-slate-400 hover:text-slate-700"><ArrowLeft size={18} /></button>}
              <h3 className="text-base font-bold text-slate-900">Share Report</h3>
              <button onClick={closeShare} className="ml-auto text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            {shareStep === 1 ? (
              <>
                <div className="relative mb-3">
                  {/* combined input: selected chips + free text — add ANY email/name */}
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-300 px-2 py-2">
                    {addPeople.map((n) => <span key={n} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[12px] font-medium text-slate-700">{n}<button onClick={() => setAddPeople((p) => p.filter((x) => x !== n))}><X size={12} /></button></span>)}
                    <input value={shareQuery} onChange={(e) => setShareQuery(e.target.value)}
                      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && shareQuery.trim()) { e.preventDefault(); addPerson(shareQuery); } else if (e.key === "Backspace" && !shareQuery && addPeople.length) { setAddPeople((p) => p.slice(0, -1)); } }}
                      placeholder={addPeople.length ? "Add more…" : "Add people by name or email…"} className="min-w-[160px] flex-1 bg-transparent py-0.5 text-sm outline-none" autoFocus />
                  </div>
                  {shareQuery.trim() && (
                    <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                      {!addPeople.includes(shareQuery.trim()) && (
                        <button onClick={() => addPerson(shareQuery)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"><Plus size={14} className="text-violet-500" /> Share with: <span className="font-medium">{shareQuery.trim()}</span></button>
                      )}
                      {shareMatches.map((n) => <button key={n} onClick={() => addPerson(n)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">{initialsOf(n)}</span>{n}</button>)}
                    </div>
                  )}
                </div>
                {!shareQuery.trim() && shareCandidates.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {shareCandidates.slice(0, 6).map((n) => <button key={n} onClick={() => addPerson(n)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">{initialsOf(n)}</span><span className="max-w-[120px] truncate">{n}</span><Plus size={13} className="text-slate-400" /></button>)}
                  </div>
                )}
                {false && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {addPeople.map((n) => <span key={n} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[12px] font-medium text-violet-700">{n}<button onClick={() => setAddPeople((p) => p.filter((x) => x !== n))}><X size={12} /></button></span>)}
                  </div>
                )}
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Who has access</div>
                <div className="mb-4 max-h-40 space-y-1 overflow-y-auto">
                  <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <Avatar name={user?.name || user?.email || "You"} email={user?.email} picture={user?.picture} size={28} />
                    <div className="flex-1"><div className="text-[13px] font-medium text-slate-700">{user?.name || "You"}</div><div className="text-[11px] text-slate-400">Owner</div></div>
                    <span className="text-[12px] text-slate-400">Owner</span>
                  </div>
                  {(() => {
                    // Individuals = meeting participants (default Viewer) merged with the
                    // explicitly-shared people (persisted roles override). The owner (connected user)
                    // is already shown above, so skip them here. Each gets a role dropdown.
                    const map = {};
                    (meeting.participants || []).forEach((p) => { if (p.name && p.name !== (user && user.name)) map[p.name] = { key: p.name, name: p.name, sub: "Participant", role: "Viewer", token: null }; });
                    (access || []).forEach((s) => { map[s.email] = { key: s.email, name: s.name || s.email, email: s.email, picture: s.picture || "", sub: s.name ? s.email : "", role: s.role || "Viewer", token: s.token }; });
                    const list = Object.values(map);
                    if (!list.length) return null;
                    return (
                      <>
                        <div className="px-2 pt-1.5 text-[11px] font-semibold text-slate-400">Individuals</div>
                        {list.map((s) => (
                          <div key={s.key} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                            <Avatar name={s.name} email={s.email || s.key} picture={s.picture || ((user && s.email && s.email === user.email) ? user.picture : undefined)} size={28} />
                            <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium text-slate-700">{s.name}</div>{s.sub && <div className="truncate text-[11px] text-slate-400">{s.sub}</div>}</div>
                            {s.token && <button onClick={() => { try { navigator.clipboard.writeText(window.location.origin + "/?share=" + s.token); toast(s.role + " link copied"); } catch (e) {} }} title={"Copy this person's " + s.role + " link"} className="shrink-0 text-slate-400 transition hover:text-violet-600"><Link2 size={15} /></button>}
                            <RoleDropdown role={s.role} onChange={(r) => setAccessRole(s.key, r)} onRemove={() => removeAccess(s.key)} />
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Link Access</div>
                <div className="relative">
                  <button onClick={() => setAccessOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50">
                    {linkAccess === "restricted" ? <Lock size={15} className="text-slate-500" /> : <Globe size={15} className="text-emerald-600" />}
                    <div className="flex-1"><div className="text-[13px] font-medium text-slate-700">{linkAccess === "restricted" ? "Restricted access" : "Anyone with the link"}</div><div className="text-[11px] text-slate-400">{linkAccess === "restricted" ? "Only people with access can view via link" : "Public to anyone with the link"}</div></div>
                    <ChevronDown size={15} className="text-slate-400" />
                  </button>
                  {accessOpen && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                      {[{ k: "restricted", t: "Restricted access", d: "Only people with access", ic: <Lock size={15} className="text-slate-500" /> }, { k: "public", t: "Anyone with the link", d: "Public to anyone with the link", ic: <Globe size={15} className="text-emerald-600" /> }].map((o) => (
                        <button key={o.k} onClick={() => { setLinkAccess(o.k); setAccessOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                          {o.ic}<div className="flex-1"><div className="text-[13px] font-medium text-slate-700">{o.t}</div><div className="text-[11px] text-slate-400">{o.d}</div></div>{linkAccess === o.k && <Check size={15} className="text-violet-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <button onClick={shareReport} className="flex items-center gap-1.5 text-[13px] font-medium text-violet-600 hover:text-violet-700"><Link2 size={14} /> Copy link</button>
                  <button onClick={() => (addPeople.length ? setShareStep(2) : doShare())} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">{addPeople.length ? "Next" : "Done"}</button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-2">
                  {addPeople.length ? addPeople.map((n) => <span key={n} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-700">{n}<button onClick={() => setAddPeople((p) => p.filter((x) => x !== n))}><X size={12} /></button></span>) : <span className="px-1 text-[13px] text-slate-400">No one selected</span>}
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <div className="relative">
                    <button onClick={() => setRoleOpen((o) => !o)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50"><HelpCircle size={14} className="text-slate-400" />{shareRole} <ChevronDown size={13} /></button>
                    {roleOpen && (<div className="absolute z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">{["Viewer", "Commenter", "Editor"].map((r) => <button key={r} onClick={() => { setShareRole(r); setRoleOpen(false); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50">{r}{shareRole === r && <Check size={14} className="text-violet-600" />}</button>)}</div>)}
                  </div>
                  <button onClick={() => setNotify((v) => !v)} className="flex items-center gap-2 text-[13px] text-slate-600">
                    <span className={"flex h-4 w-4 items-center justify-center rounded border " + (notify ? "border-violet-600 bg-violet-600" : "border-slate-300")}>{notify && <Check size={11} className="text-white" />}</span> Notify via email
                  </button>
                </div>
                <textarea value={shareMsg} onChange={(e) => setShareMsg(e.target.value)} placeholder="Add a message (optional)" rows={3} className="mb-4 w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-violet-400" />
                {shareCandidates.length > 0 && (
                  <>
                    <div className="mb-2 border-t border-slate-100 pt-3 text-[13px] font-bold text-slate-800">More Sharing Suggestions</div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {shareCandidates.slice(0, 6).map((n) => (
                        <button key={n} onClick={() => setAddPeople((p) => [...p, n])} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">{initialsOf(n)}</span><span className="max-w-[130px] truncate">{n}</span><Plus size={13} className="text-slate-400" /></button>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                  <button onClick={doShare} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">Share Report</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {renaming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setRenaming(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-bold text-slate-900">Rename Report</h3>
            <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && renameVal.trim()) { onRename && onRename(meeting, renameVal.trim()); setRenaming(false); toast("Renamed"); } }} autoFocus className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRenaming(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { if (renameVal.trim()) { onRename && onRename(meeting, renameVal.trim()); setRenaming(false); toast("Renamed"); } }} disabled={!renameVal.trim()} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:bg-slate-200 disabled:text-slate-400">Save</button>
            </div>
          </div>
        </div>
      )}
      {cfg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setCfg(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">{cfg.brand === "confluence" ? <LayoutGrid size={18} className="text-sky-600" /> : cfg.brand === "zapier" ? <Zap size={18} className="text-orange-500" /> : <BrandIcon name={cfg.brand} size={20} />}</span>
              <h3 className="text-base font-bold text-slate-900">Connect {cfg.name}</h3>
              <button onClick={() => setCfg(null)} className="ml-auto text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            {cfg.kind === "notion" ? (
              <>
                <label className="text-[12px] font-medium text-slate-500">Notion integration token</label>
                <input value={cfgA} onChange={(e) => setCfgA(e.target.value)} placeholder="secret_…" className="mb-3 mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
                <label className="text-[12px] font-medium text-slate-500">Parent page ID</label>
                <input value={cfgB} onChange={(e) => setCfgB(e.target.value)} placeholder="paste the 32-char page id" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Free: create an integration at notion.so/my-integrations, share a page with it, and paste the token + that page's ID. OctoMeet will add a report sub-page.</p>
              </>
            ) : (
              <>
                <label className="text-[12px] font-medium text-slate-500">{cfg.kind === "slack" ? "Slack Incoming Webhook URL" : "Webhook URL"}</label>
                <input value={cfgA} onChange={(e) => setCfgA(e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{cfg.kind === "slack" ? "Free: create a Slack Incoming Webhook (api.slack.com/messaging/webhooks) and paste it here." : cfg.key === "webhooks" ? "Any endpoint that accepts a POST (Discord webhook, your server, etc.). The report is sent as JSON." : `Free: paste a Zapier/Make webhook that creates the ${cfg.name} record. The report is POSTed as JSON.`}</p>
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setCfg(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveIntegration} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">Connect &amp; push</button>
            </div>
          </div>
        </div>
      )}

      {meeting.status && meeting.status !== "done" && (
        <div className={"flex items-center gap-3 border-b px-6 py-3 " + (["recording", "error"].includes(meeting.status) ? "border-rose-200 bg-rose-50" : "border-violet-200 bg-violet-50")}>
          {meeting.status === "recording"
            ? <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" /></span>
            : <StatusBadge status={meeting.status} />}
          <span className="text-sm font-medium text-slate-700">{statusSummary(meeting.status)}</span>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-6 py-5">
        {meeting.video ? (
          <div className="mb-5">
            <MeetingVideo videoRef={videoRef} src={meeting.video} coverAt={meeting.coverAt} markers={markers} turns={meeting.transcript} subtitles={meeting.subtitles} meetingId={meeting.id} shareTok={shared ? shareTok : null} coverDone={!!meeting.cover_url} />
          </div>
        ) : (
          <div className="mb-5 flex aspect-video w-full items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50 to-violet-50 text-center text-sm text-slate-500">
            <div className="px-6">{meeting.status && meeting.status !== "done" ? <span className="inline-flex items-center gap-2"><StatusBadge status={meeting.status} /> {statusSummary(meeting.status)}</span> : <><Video size={28} className="mx-auto mb-2 text-violet-300" />Recording will appear here once processed.</>}</div>
          </div>
        )}

        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { l: "Read Score", v: meeting.scores.overall, series: metricSeries("readScore", meeting) },
            { l: "Engagement", v: meeting.scores.engagement, series: metricSeries("engagement", meeting) },
            { l: "Sentiment", v: meeting.scores.sentiment, series: metricSeries("sentiment", meeting) },
          ].map((s) => {
            const has = Number.isFinite(s.v) && s.v > 0;
            const lab = s.v >= 70 ? "GOOD" : s.v >= 40 ? "OKAY" : s.v >= 20 ? "FAIR" : "LOW";
            const col = scoreColor(s.v);
            return (
            <div key={s.l} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.l}</div>
              <div className="mt-1 flex items-center gap-3">
                <div className="flex shrink-0 items-end gap-1.5">
                  <span className="text-2xl font-bold leading-none" style={{ color: has ? col : "#0f172a" }}>{has ? s.v : "-"}</span>
                  {has && <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: col }}>{lab}</span>}
                </div>
                {has && <div className="min-w-0 flex-1"><Sparkline data={s.series} /></div>}
              </div>
            </div>
            );
          })}
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={"flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition " +
                (tab === t.k ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {tab === "notes" && (
          <div className="space-y-5">
            <Card title="Summary" icon={Sparkles}
              copyText={meeting.summary} editText={meeting.summary} onSaveEdit={canEdit ? (v) => editField("summary", v) : undefined}
              right={meeting.summary ? (
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-[12px]">
                  {["standard", "short"].map((m) => <button key={m} onClick={() => setSummaryMode(m)} className={"rounded-md px-2 py-0.5 capitalize transition " + (summaryMode === m ? "bg-white font-semibold text-violet-700 shadow-sm" : "text-slate-500")}>{m}</button>)}
                </div>) : null}>
              {meeting.summary ? <p className="text-sm leading-relaxed text-slate-600">{summaryMode === "short" ? shortSummary : meeting.summary}</p> : <p className="text-sm text-slate-400">No summary available for this meeting.</p>}
            </Card>
            <Card title="Action Items" icon={ListChecks}
              copyText={meeting.actionItems.map((a) => `- ${a.task}${a.owner ? " (" + a.owner + ")" : ""}`).join("\n")}
              editText={meeting.actionItems.map((a) => a.task).join("\n")} onSaveEdit={canEdit ? (v) => editField("action_items", v) : undefined}>
              <div className="space-y-2">
                {meeting.actionItems.map((it, i) => (
                  <div key={i} className={"flex items-center gap-3 rounded-xl border p-3 " + (it.done ? "border-slate-100 bg-slate-50" : "border-slate-200 bg-white")}>
                    <button onClick={() => toggleItem(i)} className="shrink-0">
                      {it.done ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} className="text-slate-300 hover:text-violet-400" />}
                    </button>
                    <div className="flex-1">
                      <div className={"text-sm " + (it.done ? "text-slate-400 line-through" : "text-slate-700")}>{it.task}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{it.owner}{it.due ? " · " + it.due : ""}</span>
                        {it.at != null && <TimeChip t={it.t} onClick={() => seekTo(it.at)} />}
                      </div>
                    </div>
                  </div>
                ))}
                {!meeting.actionItems.length && <p className="text-sm text-slate-400">No action items detected.</p>}
              </div>
            </Card>
            <Card title="Next Steps" icon={Target}
              copyText={(meeting.nextSteps || []).join("\n")} editText={(meeting.nextSteps || []).join("\n")} onSaveEdit={canEdit ? (v) => editField("next_steps", v) : undefined}>
              <ul className="space-y-2">
                {(meeting.nextSteps || []).map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600"><ChevronRight size={16} className="mt-0.5 shrink-0 text-violet-400" />{s}</li>
                ))}
                {!(meeting.nextSteps && meeting.nextSteps.length) && <p className="text-sm text-slate-400">No next steps detected.</p>}
              </ul>
            </Card>
            <Card title="Key Questions" icon={Quote}
              copyText={meeting.keyQuestions.join("\n")} editText={meeting.keyQuestions.join("\n")} onSaveEdit={canEdit ? (v) => editField("key_questions", v) : undefined}>
              <ul className="space-y-3">
                {(meeting.keyQA && meeting.keyQA.length ? meeting.keyQA : meeting.keyQuestions.map((q) => ({ q, a: "" }))).map((qq, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    {qq.at != null
                      ? <TimeChip t={qq.t} onClick={() => seekTo(qq.at)} className="mt-0.5" />
                      : <span className="mt-0.5 font-mono text-[12px] text-violet-400">{String(i + 1).padStart(2, "0")}</span>}
                    <div className="flex-1">
                      <div className="font-medium text-slate-700">{qq.q}</div>
                      {qq.a && <div className="mt-0.5 text-[13px] text-slate-500"><span className="font-semibold text-emerald-600">Suggested answer:</span> {qq.a}</div>}
                    </div>
                  </li>
                ))}
                {!meeting.keyQuestions.length && <p className="text-sm text-slate-400">No key questions detected.</p>}
              </ul>
            </Card>
          </div>
        )}

        {tab === "transcript" && (
          meeting.transcript.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">{meeting.status && meeting.status !== "done" ? "Transcript is still being processed…" : "No transcript available for this meeting."}</div>
          ) : (
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
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: SPEAKER_COLORS[ci % SPEAKER_COLORS.length] }}>{initialsOf(t.speaker)}</span>
                    <div className="flex-1 rounded-xl border border-slate-100 bg-white p-3">
                      <div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold text-slate-700">{t.speaker}</span>{t.at != null ? <TimeChip t={t.t} onClick={() => seekTo(t.at)} /> : (t.t && <span className="text-[10px] text-slate-300">{t.t}</span>)}</div>
                      <p className="text-sm leading-relaxed text-slate-600">{t.text}</p>
                    </div>
                  </div>
                );
              })}
              {!filteredTurns.length && q && <div className="py-10 text-center text-sm text-slate-400">No lines match “{q}”.</div>}
            </div>
          </div>
          )
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
            <Card title="Sentiment over time" icon={Activity}>
              {meeting.sentimentTimeline.length ? (
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={meeting.sentimentTimeline.map((v, i) => ({ i, v }))} margin={{ left: -20, right: 6, top: 6 }}>
                  <defs><linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7C3AED" stopOpacity={0.35} /><stop offset="100%" stopColor="#7C3AED" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="i" hide /><YAxis domain={[-1, 1]} tick={{ fontSize: 10, fill: "#CBD5E1" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
                  <Area type="monotone" dataKey="v" stroke="#7C3AED" strokeWidth={2.5} fill="url(#gScore)" />
                </AreaChart>
              </ResponsiveContainer>
              ) : <p className="py-8 text-center text-sm text-slate-400">Not enough data for a sentiment timeline.</p>}
            </Card>
          </div>
        )}

        {tab === "coaching" && (
          <div className="space-y-5">
            {meeting.coaching && (meeting.coaching.strengths?.length || meeting.coaching.improvements?.length || meeting.coaching.tips?.length) && (
              <div className="grid gap-5 md:grid-cols-3">
                <Card title="Strengths" icon={ThumbsUp}>
                  <ul className="space-y-1.5 text-sm text-slate-600">{(meeting.coaching.strengths || []).map((x, i) => <li key={i} className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />{x}</li>)}</ul>
                </Card>
                <Card title="Areas to improve" icon={Target}>
                  <ul className="space-y-1.5 text-sm text-slate-600">{(meeting.coaching.improvements || []).map((x, i) => <li key={i} className="flex gap-2"><Circle size={15} className="mt-0.5 shrink-0 text-amber-500" />{x}</li>)}</ul>
                </Card>
                <Card title="Tips" icon={Lightbulb}>
                  <ul className="space-y-1.5 text-sm text-slate-600">{(meeting.coaching.tips || []).map((x, i) => <li key={i} className="flex gap-2"><Sparkles size={15} className="mt-0.5 shrink-0 text-violet-500" />{x}</li>)}</ul>
                </Card>
              </div>
            )}
            <Card title="Talking Pace" icon={Activity}>
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold text-slate-900">{avgWpm != null ? avgWpm : "-"}</span>
                <span className="text-sm text-slate-400">{avgWpm != null ? "wpm · recommended range 130-175" : "No pace data for this meeting"}</span>
              </div>
            </Card>
            <div className="grid gap-5 md:grid-cols-2">
              <Card title="Clarity" icon={Sparkles}>
                <Metric label="Filler words" value={fillerPct + "%"} ok={fillerPct < 5} />
                <Metric label="Talking pace" value={avgWpm != null ? avgWpm + " wpm" : "-"} ok={avgWpm != null && avgWpm >= 130 && avgWpm <= 175} />
                <Metric label="Clarity score" value={meeting.scores.clarity || "-"} ok={meeting.scores.clarity >= 80} />
              </Card>
              <Card title="Impact" icon={Target}>
                <Metric label="Charisma" value={meeting.scores.charisma || "-"} ok={meeting.scores.charisma >= 80} />
                <Metric label="Sentiment" value={meeting.scores.sentiment || "-"} ok={meeting.scores.sentiment >= 70} />
                <Metric label="Questions asked" value={questionsAsked} ok={questionsAsked > 0} />
                <Metric label="Talk-time balance" value={meeting.scores.balance} ok={meeting.scores.balance >= 60} />
              </Card>
            </div>
            {meeting.participants && meeting.participants.length > 0 && (
              <Card title="Per-speaker breakdown" icon={Users}>
                <div className="space-y-2">
                  {meeting.participants.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}>{p.initials || initialsOf(p.name)}</span>
                      <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-700">{p.name}</div><div className="text-[11px] text-slate-400">{p.role || "Participant"}</div></div>
                      <div className="flex gap-4 text-right text-[12px]">
                        <div><div className="font-semibold text-slate-700">{p.talkPct}%</div><div className="text-[10px] text-slate-400">talk</div></div>
                        <div><div className="font-semibold text-slate-700">{p.wpm || "-"}</div><div className="text-[10px] text-slate-400">wpm</div></div>
                        <div><div className="font-semibold" style={{ color: p.sentiment === "Positive" ? "#10B981" : p.sentiment === "Negative" ? "#F43F5E" : "#64748B" }}>{p.sentiment || "Neutral"}</div><div className="text-[10px] text-slate-400">tone</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "highlights" && (
          <div className="space-y-3">
            {(meeting.highlights || []).map((h, i) => (
              <div key={"h" + i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <VideoThumb src={meeting.video} source={meeting.source} size={56} showBadge={false} at={h.at} hoverPlay={false} onClick={h.at != null ? () => seekTo(h.at) : undefined} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Highlight</span>
                    {h.at != null ? <TimeChip t={h.t} onClick={() => seekTo(h.at)} /> : (h.t && <span className="font-mono text-[11px] text-slate-400">{h.t}</span>)}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{h.text}</p>
                </div>
              </div>
            ))}
            {!(meeting.highlights && meeting.highlights.length) && <p className="text-sm text-slate-400">No highlights detected for this meeting.</p>}
          </div>
        )}

        {tab === "chapters" && (
          <Card title="Chapters & Topics" icon={ListChecks} right={
            (meeting.chapters && meeting.chapters.some((c) => c.summary)) ? (
              <button onClick={() => setShowDesc((v) => !v)} className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
                Descriptions
                <span className={"relative h-4 w-7 rounded-full transition " + (showDesc ? "bg-emerald-500" : "bg-slate-300")}>
                  <span className={"absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all " + (showDesc ? "left-3.5" : "left-0.5")} />
                </span>
              </button>
            ) : null
          }>
            {meeting.chapters && meeting.chapters.length ? (
              <div className="space-y-4">
                {meeting.chapters.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      {c.at != null ? <TimeChip t={c.t} onClick={() => seekTo(c.at)} /> : <span className="font-mono text-[12px] text-violet-500">{String(i + 1).padStart(2, "0")}</span>}
                      <span className="text-[15px] font-semibold text-slate-800">{c.title}</span>
                    </div>
                    {showDesc && c.summary && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{c.summary}</p>}
                    {c.points && c.points.length > 0 && (
                      <ul className="mt-2 space-y-1.5 pl-1">
                        {c.points.map((p, j) => (
                          <li key={j} className="flex gap-2 text-[13px] text-slate-600"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : meeting.topics && meeting.topics.length ? (
              <div className="flex flex-wrap gap-2">
                {meeting.topics.map((t, i) => (<span key={i} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">{t}</span>))}
              </div>
            ) : <p className="text-sm text-slate-400">No chapters detected.</p>}
          </Card>
        )}
      </div>
      </div>
      {!shared && <AskPanel meeting={meeting} shared={shared} shareTok={shareTok} />}
      {docData && <DocModal loading={docData.loading} doc={docData.doc} meta={docData.meta} onClose={() => setDocData(null)} onRegenerate={() => genDoc(true)} regenerating={docBusy} />}
      {fupData && <FollowupModal data={fupData} meetingId={meeting.id} onClose={() => setFupData(null)} />}
    </div>
  );
}

function Metric({ label, value, ok }) {
  const num = Number(value);
  const col = (Number.isFinite(num) && num > 0) ? scoreColor(num) : (ok ? "#16A34A" : "#D97706");
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: col }}>
        {value} {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      </span>
    </div>
  );
}

function Card({ title, icon: Icon, children, right, copyText, editText, onSaveEdit }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const copy = () => { try { navigator.clipboard.writeText(copyText || ""); toast("Copied"); } catch (e) {} };
  const start = () => { setVal(editText || ""); setEditing(true); };
  const save = () => { if (onSaveEdit) onSaveEdit(val); setEditing(false); };
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon size={15} className="text-violet-500" />}
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {!editing && (copyText != null || onSaveEdit) && (
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {copyText != null && <button onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-slate-500 hover:bg-slate-100"><Copy size={12} /> Copy</button>}
            {onSaveEdit && <button onClick={start} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-slate-500 hover:bg-slate-100"><Pencil size={12} /> Edit</button>}
          </div>
        )}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {editing ? (
        <div>
          <textarea value={val} onChange={(e) => setVal(e.target.value)} autoFocus rows={Math.min(16, Math.max(3, val.split("\n").length + 1))}
            className="w-full rounded-lg border border-slate-200 p-2.5 text-sm leading-relaxed text-slate-700 outline-none focus:border-violet-400" />
          <div className="mt-2 flex gap-2">
            <button onClick={save} className="rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-500">Save</button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
          {onSaveEdit && <p className="mt-1.5 text-[11px] text-slate-400">One item per line.</p>}
        </div>
      ) : children}
    </div>
  );
}

/* ============================ ASK OCTO (chat) ===================== */
function RecentSearches({ groups, onPick }) {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-slate-200 bg-white xl:flex">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5">
        <ClipboardList size={16} className="text-violet-500" />
        <h2 className="text-sm font-bold text-slate-800">Recent Searches</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.bucket}>
            <div className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.bucket}</div>
            {g.items.map((qq, i) => (
              <button key={i} onClick={() => onPick(qq)} className="block w-full truncate px-4 py-2.5 text-left text-[13px] text-slate-600 transition hover:bg-violet-50/50">{qq}</button>
            ))}
          </div>
        ))}
      </div>
      <button onClick={() => toast("Search history - coming soon")} className="flex items-center justify-center gap-2 border-t border-slate-200 py-3 text-[13px] font-semibold text-violet-600 hover:bg-violet-50/50"><Clock size={14} /> All Search History</button>
    </aside>
  );
}

function ChatView({ meetings, onOpen, seed }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState(SEED_RECENT);
  const endRef = useRef(null);
  const sentSeed = useRef(false);
  const started = msgs.length > 0;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const addRecent = (qstr) => setRecent((r) => {
    const copy = r.map((g) => ({ ...g, items: [...g.items] }));
    let lw = copy.find((g) => g.bucket === "LAST WEEK");
    if (!lw) { lw = { bucket: "LAST WEEK", items: [] }; copy.unshift(lw); }
    lw.items = [qstr, ...lw.items.filter((x) => x !== qstr)].slice(0, 8);
    return copy;
  });

  const send = async (textArg) => {
    const question = (textArg ?? input).trim();
    if (!question || busy) return;
    setInput(""); addRecent(question);
    const history = [...msgs, { role: "user", text: question }];
    // Show the user message + an empty assistant bubble we stream into.
    setMsgs([...history, { role: "assistant", text: "", refs: [] }]);
    setBusy(true);
    try {
      const apiMsgs = history.filter((m) => m.role === "user" || m.role === "assistant").slice(-8).map((m) => ({ role: m.role, content: m.text }));
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, messages: apiMsgs }) });
      if (!res.ok || !res.body) {
        let msg = "I couldn't reach the analysis engine. Make sure you're signed in, then try again.";
        try { const j = await res.json(); if (j && j.error === "not authenticated") msg = "Please sign in to ask across your meetings."; } catch (e) {}
        setMsgs((p) => { const c = [...p]; c[c.length - 1] = { role: "assistant", text: msg, refs: [] }; return c; });
        return;
      }
      // Stream the answer; a trailing <<<OCTO_REFS>>>[ids] line carries cited meeting ids.
      const reader = res.body.getReader(); const dec = new TextDecoder();
      const MARK = "<<<OCTO_REFS>>>"; let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        let text = acc, refs = [];
        const i = acc.indexOf(MARK);
        if (i >= 0) { text = acc.slice(0, i).replace(/\n+$/, ""); try { refs = JSON.parse(acc.slice(i + MARK.length)); } catch (e) {} }
        setMsgs((p) => { const c = [...p]; c[c.length - 1] = { role: "assistant", text, refs: Array.isArray(refs) ? refs : [] }; return c; });
      }
    } catch (e) {
      setMsgs((p) => { const c = [...p]; c[c.length - 1] = { role: "assistant", text: "I couldn't reach the analysis engine. Please try again.", refs: [] }; return c; });
    } finally { setBusy(false); }
  };

  useEffect(() => { if (seed && !sentSeed.current) { sentSeed.current = true; send(seed); } /* eslint-disable-next-line */ }, [seed]);

  const suggestions = [
    "What are the major takeaways from last week's meetings?",
    "What is my team working on right now?",
    "What are my next steps across recent meetings?",
    "What tasks are currently at risk or overdue?",
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3.5">
          <ChevronLeft size={18} className="text-slate-400" />
          <Sparkles size={16} className="text-violet-500" />
          <h1 className="text-lg font-bold text-slate-900">Ask Octo</h1>
        </div>

        {!started ? (
          <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-10">
            <div className="mt-8 w-full max-w-3xl">
              <h2 className="mb-7 text-center text-3xl font-bold text-slate-900">What can I help you discover?</h2>
              <form onSubmit={(e) => { e.preventDefault(); send(); }}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white shadow-sm px-3 py-2.5 shadow-sm focus-within:border-violet-400">
                <button type="button" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400"><Globe size={16} /><ChevronDown size={13} /></button>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Octo anything..." className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400" />
                <button type="submit" disabled={!input.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-500 disabled:opacity-40"><Send size={16} /></button>
              </form>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="flex items-center gap-2 rounded-xl bg-violet-50/70 px-4 py-2.5 text-sm text-violet-700 transition hover:bg-violet-100">
                    <Sparkles size={14} className="text-violet-400" /> {s}
                  </button>
                ))}
              </div>
              <div className="mt-12 text-center">
                <div className="mb-1 text-xs font-bold text-slate-500">Your sources</div>
                <div className="mb-2.5 text-[11px] text-slate-400">{(() => { const rc = meetings.filter((m) => m.real).length; return rc ? `Searching ${meetings.length} meetings · ${rc} from your account` : `Searching ${meetings.length} meetings`; })()}</div>
                <div className="flex items-center justify-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm"><Calendar size={18} className="text-sky-500" /></div>
                  <div className="h-10 w-10 rounded-lg border border-dashed border-slate-200 bg-white" />
                  <div className="h-10 w-10 rounded-lg border border-dashed border-slate-200 bg-white" />
                  <button onClick={() => toast("Add a source - coming soon")} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50"><Plus size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {msgs.map((m, i) => (
                <div key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={"max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed " + (m.role === "user" ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-slate-700 shadow-sm")}>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.refs && m.refs.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                        {m.refs.map((id) => { const mt = meetings.find((x) => x.id === id); return mt ? (
                          <button key={id} onClick={() => onOpen(id)} className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-100"><FileText size={11} /> {mt.title}</button>
                        ) : null; })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 shadow-sm"><Loader2 size={14} className="animate-spin text-violet-500" /> Reading your meetings…</div></div>}
              <div ref={endRef} />
            </div>
            <div className="border-t border-slate-200 bg-white px-6 py-3">
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask Octo anything…" className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none" />
                <button onClick={() => send()} disabled={busy || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white transition disabled:opacity-40"><Send size={16} /></button>
              </div>
            </div>
          </>
        )}
      </div>
      <RecentSearches groups={recent} onPick={(qq) => send(qq)} />
    </div>
  );
}

/* ============================ UPLOAD ============================== */
const EXAMPLE_TRANSCRIPT =
`[00:09] Nicolas Benech: Thanks for joining. What's the biggest manual task slowing your team down right now?
[00:24] Jordan Vela: Honestly, support ticket triage. Every email comes in raw and someone has to read it, tag it, and route it.
[00:48] Nicolas Benech: That's a perfect candidate. We can have AI classify each ticket, set priority, and auto-route - humans only touch the edge cases.
[01:25] Nicolas Benech: We'd train on your historical tickets and start in suggest-only mode until trust is high, then flip to auto.
[02:05] Jordan Vela: I like the phased approach. I'll export a month of tickets by Friday. Let's get a proposal moving.`;

function UploadModal({ onClose, onSave }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notify, setNotify] = useState(true);
  const [fileName, setFileName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    const f = files && files[0];
    if (!f) return;
    setFileName(f.name); setErr("");
    const isText = /\.(txt|vtt|srt|md|json)$/i.test(f.name) || (f.type && f.type.startsWith("text"));
    if (isText) {
      try { setTranscript(await f.text()); } catch { setErr("Couldn't read that file."); }
    } else {
      setTranscript("");
      setErr("Audio/video transcription via upload is coming soon. For now, drop a transcript file (.txt/.vtt/.srt) or paste the transcript below - or use “Add to live meeting” to capture a live call.");
      setShowPaste(true);
    }
  };

  const generate = async () => {
    if (!transcript.trim()) {
      setShowPaste(true);
      setErr("Drop a transcript file or paste the transcript below to generate a report.");
      return;
    }
    setBusy(true); setErr("");
    try {
      const sys = "You are a meeting-intelligence analyst. Read the transcript and return ONLY a JSON object (no markdown) with this shape:\n" +
        `{"summary": string (2-3 sentences), "topics": string[] (max 5), "keyQuestions": string[] (max 4), "actionItems": [{"owner": string, "task": string, "due": string}] (max 6), "nextSteps": string[] (max 3), "participants": [{"name": string, "role": string, "talkPct": integer, "sentiment": "Positive"|"Neutral"|"Negative"}], "scores": {"overall": int, "engagement": int, "sentiment": int, "balance": int, "clarity": int} (0-100), "sentimentLabel": "Positive"|"Neutral"|"Negative", "sentimentTimeline": number[] (8 values -1..1)}.\n` +
        "Infer speaker names from the transcript. Keep strings short.";
      const baseTitle = (fileName || "Uploaded meeting").replace(/\.[^.]+$/, "");
      const out = await callClaude([{ role: "user", content: "Title: " + baseTitle + "\n\nTranscript:\n" + transcript }], sys);
      const parsed = extractJSON(out);
      const turns = parseTranscript(transcript);
      const meeting = mk({
        id: "m" + Date.now(), title: baseTitle, date: REF_TODAY, source: "Upload", folder: "Meetings",
        timeStart: "-", timeEnd: "-", owner: "NB", readScore: parsed.scores?.overall ?? 80,
        video: VIDEOS[(baseTitle.length) % VIDEOS.length],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-xl font-bold text-slate-900">Upload files</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="mb-4 flex items-center gap-3 text-sm">
          <span className="text-slate-500">You have <b className="text-slate-700">200 minutes</b> remaining.</span>
          <button onClick={() => toast("Get more credits - coming soon")} className="font-semibold text-violet-600 hover:text-violet-800">Get more credits</button>
          <button onClick={() => toast("Upload supports transcript files today; video transcription is coming soon")} className="font-semibold text-violet-600 hover:text-violet-800">Learn more</button>
        </div>

        <input ref={inputRef} type="file" accept=".txt,.vtt,.srt,.md,.json,audio/*,video/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current && inputRef.current.click()}
          className={"flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition " + (drag ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-slate-50 hover:border-violet-300")}>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm"><Upload size={20} className="text-violet-500" /></div>
          {fileName ? (
            <div className="text-sm font-semibold text-slate-700">{fileName}{transcript ? " ✓" : ""}</div>
          ) : (
            <div className="text-[15px] text-slate-600">Drop a file here, or <span className="font-semibold text-violet-600">browse files</span></div>
          )}
          <div className="mt-1 text-[12px] text-slate-400">MP4 or M4A, maximum 5GB each - or a transcript (.txt/.vtt/.srt)</div>
        </div>

        {showPaste && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Or paste a transcript</label>
              <button onClick={() => { setTranscript(EXAMPLE_TRANSCRIPT); setFileName(fileName || "Pasted transcript"); }} className="text-[11px] font-medium text-violet-600 hover:text-violet-800">Load example</button>
            </div>
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5} placeholder={"[00:12] Name: what they said\n[00:30] Other Name: their reply"} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs leading-relaxed outline-none focus:border-violet-400" />
          </div>
        )}
        {!showPaste && (
          <button onClick={() => setShowPaste(true)} className="mt-2 text-[12px] font-medium text-violet-600 hover:text-violet-800">…or paste a transcript instead</button>
        )}

        {err && <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}</div>}

        <label className="mt-4 flex items-center gap-2.5 text-sm text-slate-600">
          <button type="button" onClick={() => setNotify((v) => !v)} className={"flex h-5 w-5 items-center justify-center rounded border transition " + (notify ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white")}>{notify && <Check size={13} />}</button>
          Notify me by email when my reports are ready
        </label>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-violet-600 hover:text-violet-800">Cancel</button>
          <button onClick={generate} disabled={busy} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:opacity-50">
            {busy ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : "Generate Reports"}
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
