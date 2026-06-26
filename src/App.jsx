import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Users, Sparkles, ClipboardList, FolderPlus, Folder, Calendar, Star,
  Presentation, Lightbulb, ShieldCheck, LayoutGrid, PlusCircle, Link2, Globe,
  Search, ChevronDown, RefreshCw, Upload, Lock, MoreHorizontal, ArrowDown,
  ArrowLeft, Send, Loader2, CheckCircle2, Circle, Clock, Video, Hash, Target,
  ListChecks, BarChart3, MessageSquareText, FileText, Quote, AlertTriangle,
  Zap, Activity, Rocket, ChevronLeft, Download, Share2, Play,
  Check, Mail, Plus, Trash2, CalendarCheck, PanelRightClose, Bell, Settings, Type,
  HelpCircle, LogOut, ChevronRight,
} from "lucide-react";
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Octomeet.ai — Meeting Intelligence (Read.ai-style clone — Phase 0) */
/* ------------------------------------------------------------------ */

const SPEAKER_COLORS = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#F43F5E", "#14B8A6", "#8B5CF6", "#EC4899"];
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
  { bucket: "LAST WEEK", items: ["Which brands do they currently use?", "How is the sales vertical structured?", "Feedback recap — Acme & Vertex"] },
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

export default function App() {
  const [meetings, setMeetings] = useState(null);
  const [view, setView] = useState("reports");
  const [activeId, setActiveId] = useState(null);
  const [askSeed, setAskSeed] = useState("");
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    (async () => {
      let m = await store.get("octomeet:meetings:v1", null);
      if (!m) { m = seedMeetings(); await store.set("octomeet:meetings:v1", m); }
      setMeetings(m);
      setLangState(await store.get("octomeet:lang", "en"));
    })();
  }, []);

  const setLang = (l) => { setLangState(l); store.set("octomeet:lang", l); };
  const t = (k) => (TR[lang] && TR[lang][k]) || TR.en[k] || k;
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
    <div dir={isRTL(lang) ? "rtl" : "ltr"} className="rai-body flex h-screen w-full overflow-hidden bg-[#F4F5FA] text-slate-800">
      <StyleInject />
      <Sidebar view={view} setView={setView} t={t} lang={lang} setLang={setLang} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {view === "reports" && <ReportsList meetings={meetings} onOpen={openMeeting} onUpload={() => setView("upload")} onAsk={goAsk} t={t} />}
        {view === "meeting" && active && <MeetingDetail meeting={active} onBack={() => setView("reports")} onUpdate={persist} meetings={meetings} />}
        {view === "ask" && <ChatView meetings={meetings} onOpen={openMeeting} seed={askSeed} />}
        {view === "upload" && <UploadView onSave={async (m) => { await persist([m, ...meetings]); openMeeting(m.id); }} onCancel={() => setView("reports")} />}
        {view === "add-people" && <CreateWorkspace onCancel={() => setView("reports")} onDone={() => setView("reports")} />}
        {view === "plans" && <PlansView onBack={() => setView("reports")} />}
        {view === "account" && <AccountSettings onBack={() => setView("reports")} lang={lang} setLang={setLang} />}
        {view === "support" && <SupportView onBack={() => setView("reports")} />}
        {view === "logout" && <LogoutView onCancel={() => setView("reports")} />}
        {["folders", "calendar", "for-you", "coaching", "recommendations", "meeting-policy", "integrations"].includes(view) && (
          <Placeholder section={NAV.find((n) => n.k === view)} onReports={() => setView("reports")} t={t} />
        )}
      </main>
    </div>
  );
}

/* ============================ SIDEBAR ============================== */
function MenuItem({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50">
      <Icon size={17} className="text-slate-500" /> {label}
    </button>
  );
}
function Sidebar({ view, setView, t, lang, setLang }) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText("https://meet-ai-three-beige.vercel.app/s/nicolas"); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };

  return (
    <aside className={"relative flex shrink-0 flex-col rai-sidebar text-slate-300 transition-all duration-200 " + (collapsed ? "w-[68px]" : "w-60")}>
      {/* header */}
      <div className={"flex items-center px-3 pt-4 pb-3 " + (collapsed ? "justify-center" : "gap-2")}>
        <button onClick={() => collapsed && setCollapsed(false)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500">
          <span className="text-sm font-black text-white">O</span>
        </button>
        {!collapsed && <span className="text-[16px] font-bold text-white">Octomeet.ai</span>}
        {!collapsed && (
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setLangOpen((v) => !v)} className="flex items-center gap-1 rounded px-1 text-[11px] font-semibold text-slate-300 hover:text-white"><span className="text-[13px]">文A</span>{LCODE[lang]}<ChevronDown size={11} /></button>
            <button onClick={() => setCollapsed(true)} title="Collapse"><PanelRightClose size={16} className="text-slate-400 hover:text-white" /></button>
          </div>
        )}
      </div>
      {collapsed && (
        <button onClick={() => setCollapsed(false)} title="Expand" className="mx-auto mb-2 text-slate-400 hover:text-white"><PanelRightClose size={16} className="rotate-180" /></button>
      )}

      {/* language dropdown */}
      {langOpen && !collapsed && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
          <div className="absolute left-3 top-14 z-50 max-h-[70vh] w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => { setLang(l.code); setLangOpen(false); }}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                <span>{l.label}</span>{lang === l.code && <Check size={15} className="text-indigo-600" />}
              </button>
            ))}
          </div>
        </>
      )}

      {/* enterprise */}
      <div className={"mx-3 mb-3 flex items-center rounded-lg px-1 " + (collapsed ? "justify-center" : "justify-between")}>
        {collapsed ? (
          <button onClick={() => setView("plans")} title={t("enterprise")}><Rocket size={16} className="text-indigo-300 hover:text-indigo-200" /></button>
        ) : (
          <>
            <button onClick={() => setView("plans")} className="flex items-center gap-1.5 text-xs font-semibold text-white hover:text-indigo-200"><Rocket size={13} className="text-indigo-300" /> {t("enterprise")}</button>
            <button onClick={() => setView("plans")} className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200">{t("manage")}</button>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {NAV.map((n) => (
          <React.Fragment key={n.k}>
            {n.gap && <div className="my-2 border-t border-white/5" />}
            <button onClick={() => setView(n.k)} title={t(n.tkey)}
              className={"group mb-0.5 flex w-full items-center rounded-lg px-3 py-2 text-[13px] font-medium transition " +
                (collapsed ? "justify-center" : "gap-2.5") + " " +
                (view === n.k ? "bg-indigo-600 text-white shadow" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
              <n.icon size={16} className="shrink-0" />
              {!collapsed && <span className="flex-1 text-left">{t(n.tkey)}</span>}
              {!collapsed && n.plus && <FolderPlus size={14} className="text-slate-500 group-hover:text-slate-300" />}
            </button>
          </React.Fragment>
        ))}
      </nav>

      <div className="relative border-t border-white/5 px-3 py-3">
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-full left-3 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-2xl">
              <MenuItem icon={Settings} label="Account Settings" onClick={() => { setView("account"); setMenuOpen(false); }} />
              <MenuItem icon={Rocket} label="Plan & Billing" onClick={() => { setView("plans"); setMenuOpen(false); }} />
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
            <button title={t("addToLive")} className="text-slate-300 hover:text-white"><PlusCircle size={18} /></button>
            <button onClick={copyLink} title={t("smartScheduler")} className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-500"><Link2 size={14} /></button>
            <button onClick={() => setMenuOpen((v) => !v)} title="Account" className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: ownerColor("NB") }}>NB</button>
          </div>
        ) : (
          <>
            <button className="mb-3 flex w-full items-center gap-2 text-[13px] font-medium text-slate-300 hover:text-white">
              <PlusCircle size={16} /> {t("addToLive")}
            </button>
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("smartScheduler")} <span className="text-slate-600">ⓘ</span>
              </div>
              <div className="flex gap-1.5">
                <button onClick={copyLink} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500">
                  <Link2 size={12} /> {copied ? t("copied") : t("copyLink")}
                </button>
                <button className="rounded-md bg-white/10 px-2.5 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-white/15">{t("manage")}</button>
              </div>
            </div>
            <button onClick={() => setMenuOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: ownerColor("NB") }}>NB</div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px] font-medium text-white">Nicolas Benech</div>
                <div className="truncate text-[11px] text-slate-500">nicolas@octomeet.ai</div>
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
function FilterBtn({ label, icon: Icon }) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50">
      {Icon && <Icon size={14} className="text-slate-400" />}{label}<ChevronDown size={14} className="text-slate-400" />
    </button>
  );
}

function ReportsList({ meetings, onOpen, onUpload, onAsk, t }) {
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
          <h1 className="text-lg font-bold text-slate-900">{t("reports")}</h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) onAsk(ask.trim()); }}
          className="mb-3 flex items-center gap-2 rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 focus-within:border-indigo-400">
          <button type="button" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-400"><Globe size={15} /><ChevronDown size={13} /></button>
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={t("askAnything")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          <button type="submit" className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40" disabled={!ask.trim()}>
            <Send size={15} />
          </button>
        </form>
        <div className="flex items-center justify-between">
          <div className="flex gap-5">
            {[{ k: "reports", key: "reportsTab" }, { k: "incomplete", key: "incompleteTab" }].map((tb) => (
              <button key={tb.k} onClick={() => setTab(tb.k)}
                className={"border-b-2 pb-2.5 text-sm font-semibold transition " + (tab === tb.k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {t(tb.key)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 pb-1.5">
            <span className="flex items-center gap-1.5 text-[13px] text-slate-400"><RefreshCw size={13} /> {t("lastRefreshed")}</span>
            <button onClick={onUpload} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-indigo-500">
              <Upload size={15} /> {t("upload")}
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
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("filterByTitle")}
                  className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-indigo-400" />
              </div>
              <FilterBtn label={t("allReports")} icon={ClipboardList} />
              <FilterBtn label={t("anytime")} icon={Calendar} />
              <FilterBtn label={t("type")} />
              <FilterBtn label={t("source")} />
              <FilterBtn label={t("folder")} />
              <button className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:bg-slate-50"><PanelRightClose size={16} /></button>
            </div>

            <div className="mt-4 overflow-hidden">
              <div className="grid grid-cols-[1.4fr_1.1fr_1fr_0.5fr_40px] items-center border-b border-slate-200 px-3 pb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                <div className="flex items-center gap-6"><span>{t("source")}</span><span>{t("report")}</span></div>
                <div className="flex items-center gap-1">{t("dateTime")} <ArrowDown size={12} /></div>
                <div>{t("folders")}</div>
                <div>{t("owner")}</div>
                <div></div>
              </div>

              {groups.map((g) => (
                <div key={g.label}>
                  <div className="bg-slate-50/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(BUCKET_TKEY[g.label] || "today")}</div>
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
function Placeholder({ section, onReports, t }) {
  const Icon = section?.icon || ClipboardList;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500"><Icon size={26} /></div>
      <h2 className="text-xl font-bold text-slate-800">{section ? t(section.tkey) : ""}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        Esta sección llega en una fase próxima. Por ahora, la pantalla de <b>Reports</b> ya está funcionando.
      </p>
      <button onClick={onReports} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Ir a Reports</button>
    </div>
  );
}

/* ===================== CREATE WORKSPACE (Add People) =============== */
function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={"relative h-6 w-11 shrink-0 rounded-full transition " + (on ? "bg-indigo-600" : "bg-slate-200")}>
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
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400" />
            <button onClick={() => setAgreed(!agreed)} className="mt-5 flex items-center gap-2.5 text-left text-sm text-slate-600">
              <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded border " + (agreed ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white")}>{agreed && <Check size={13} />}</span>
              <span>I have read and agree to the <span className="font-medium text-indigo-600">Data Processing Agreement</span></span>
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
                      className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
                  </div>
                  <select value={iv.role} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                    className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600 outline-none">
                    <option>Member</option><option>Admin</option><option>Viewer</option>
                  </select>
                  {invites.length > 1 && <button onClick={() => setInvites(invites.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>}
                </div>
              ))}
            </div>
            <button onClick={() => setInvites([...invites, { email: "", role: "Member" }])} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"><Plus size={15} /> Add another</button>
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
              {["Google Calendar", "Outlook Calendar"].map((c) => (
                <button key={c} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-500"><CalendarCheck size={18} /></div>
                  <div><div className="text-sm font-medium text-slate-700">{c}</div><div className="text-xs text-slate-400">Connect</div></div>
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
              <div className="flex justify-between"><span className="text-slate-400">Workspace</span><span className="font-medium text-slate-700">{name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Invites</span><span className="font-medium text-slate-700">{invites.filter((i) => i.email.trim()).length}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Share by default</span><span className="font-medium text-slate-700">{perms.shareDefault ? "On" : "Off"}</span></div>
            </div>
          </>
        )}

        <div className="mt-8 flex items-center gap-3">
          <button onClick={next} disabled={!canNext}
            className={"rounded-lg px-5 py-2.5 text-sm font-semibold transition " + (canNext ? "bg-indigo-600 text-white hover:bg-indigo-500" : "cursor-not-allowed bg-slate-200 text-slate-400")}>
            {step >= total ? "Finish" : "Next Step"}
          </button>
          <button onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">Cancel</button>
        </div>
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
        <p className="mt-1 text-sm text-slate-500">Find answers, contact us, or send feedback. (Pantalla base — la ajusto con tu captura.)</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <button key={c.title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-indigo-300 hover:shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500"><c.icon size={18} /></div>
              <div><div className="text-sm font-semibold text-slate-800">{c.title}</div><div className="text-[13px] text-slate-500">{c.desc}</div></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function LogoutView({ onCancel }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500"><LogOut size={26} /></div>
      <h2 className="text-xl font-bold text-slate-800">Log out of Octomeet?</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">You'll need to sign in again with Google to access your meetings and reports.</p>
      <div className="mt-5 flex gap-3">
        <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={onCancel} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Log out</button>
      </div>
    </div>
  );
}

/* ============================ PLANS / PRICING ===================== */
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
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700">Your current plan: Enterprise</span>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">Choose the plan that fits your team</h2>
          <div className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 text-sm">
            <button onClick={() => setAnnual(true)} className={"rounded-md px-3 py-1.5 font-medium transition " + (annual ? "bg-indigo-600 text-white" : "text-slate-500")}>Annual <span className="text-[11px] opacity-80">-25%</span></button>
            <button onClick={() => setAnnual(false)} className={"rounded-md px-3 py-1.5 font-medium transition " + (!annual ? "bg-indigo-600 text-white" : "text-slate-500")}>Monthly</button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => (
            <div key={p.name} className={"relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm " + (p.popular ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200")}>
              {p.popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Most Popular</span>}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">{p.name}</h3>
                {p.current && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Current</span>}
              </div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-3xl font-extrabold text-slate-900">{annual ? p.annual : p.monthly}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{p.note}{annual && p.name !== "Free" ? " · billed annually" : ""}</p>
              <button disabled={p.disabled} className={"mt-4 rounded-lg py-2.5 text-sm font-semibold transition " +
                (p.disabled ? "cursor-default bg-slate-100 text-slate-400" : "bg-indigo-600 text-white hover:bg-indigo-500")}>{p.cta}</button>
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
function IntegRow({ name, icon, connectedAs, onConnect }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-base">{icon}</div>
        <div>
          <div className="text-sm font-semibold text-slate-800">{name}</div>
          {connectedAs && <div className="text-[12px] text-emerald-600">{connectedAs} is connected</div>}
        </div>
      </div>
      {connectedAs
        ? <button className="rounded-lg border border-indigo-300 px-4 py-1.5 text-[13px] font-semibold text-indigo-700 hover:bg-indigo-50">Manage</button>
        : <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500">Connect</button>}
    </div>
  );
}

function AccountSettings({ onBack, lang, setLang }) {
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
  const set1 = (k, v) => setTg((p) => ({ ...p, [k]: v }));

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
              className={"block w-full px-5 py-2.5 text-left text-[14px] transition " + (sec === i ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-50")}>
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
                <div className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: ownerColor("NB") }}>NB</div>
                <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Upload photo</button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white">
                <Field label="Name" value="Nicolas Benech" edit />
                <Field label="Job title" value="Not provided" muted edit />
                <Field label="Role level" value="Not provided" muted />
                <Field label="Department" value="Not provided" muted />
                <div className="border-t border-slate-100 p-4">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> Your primary email cannot be changed because it is connected to an SSO account. To update it, you must first add a password below.
                  </div>
                </div>
                <Field label="Primary Email" value="nicolas@octomeet.ai" edit />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <label className="text-sm font-semibold text-slate-800">Default Language</label>
                <p className="mb-2 text-[13px] text-slate-500">Set your default language for the Octomeet dashboard</p>
                <select value={lang} onChange={(e) => setLang(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-sm font-semibold text-slate-800">Sign-In Methods</div>
                <p className="mb-3 text-[13px] text-slate-500">Connect your accounts to sign in to Octomeet using your credentials from these providers.</p>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3"><span className="text-lg">🇬</span> <span className="text-sm font-medium text-slate-700">Google</span><Check size={15} className="ml-auto text-emerald-500" /></div>
                <div className="mt-3 flex gap-2">
                  <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Add Sign-In Method</button>
                  <button className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Add Account Password</button>
                </div>
              </div>
            </>)}

            {sec === 1 && (<>
              <SecHead icon={LayoutGrid} title="Integrations" desc="Manage and connect external tools and services to Octomeet." />
              <div>
                <div className="mb-2 text-sm font-bold text-slate-800">Calendar & Meetings</div>
                <p className="mb-3 text-[13px] text-slate-500">Allow Octomeet to join your meetings and automatically generate meeting summaries</p>
                <div className="rounded-xl border border-slate-200 bg-white">
                  <IntegRow name="Google Calendar" icon="📅" connectedAs="nicolas@octomeet.ai" />
                  <IntegRow name="Google Meet" icon="🎥" connectedAs="nicolas@octomeet.ai" />
                  <IntegRow name="Outlook Calendar" icon="📧" />
                  <IntegRow name="Zoom Calendar" icon="🎦" />
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-bold text-slate-800">Apps</div>
                <div className="rounded-xl border border-slate-200 bg-white">
                  <IntegRow name="Octomeet Web Extension" icon="🧩" connectedAs="nicolas@octomeet.ai" />
                  <IntegRow name="Slack" icon="💬" />
                  <IntegRow name="HubSpot" icon="🟠" />
                  <IntegRow name="Salesforce" icon="☁️" />
                </div>
              </div>
            </>)}

            {sec === 2 && (<>
              <SecHead icon={Video} title="Meeting Recording" desc="Manage how your Octomeet Assistant joins and appears in meetings." />
              <div className="text-sm font-bold text-slate-800">Auto-Join Preferences</div>
              <ToggleRow title="Auto-Join Calendar Events" desc="Auto-joins scheduled meetings from your connected calendar(s)." on={tg.autoJoinCal} onChange={(v) => set1("autoJoinCal", v)}>
                {tg.autoJoinCal && (
                  <div className="mt-3 space-y-3">
                    <div className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-700">📅 Google Calendar ✓</div>
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
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
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
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"><option>Auto-Detected (Default)</option>{LANGS.map((l) => <option key={l.code}>{l.label}</option>)}</select>
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
                <button className="mt-3 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">Delete All Chat History</button>
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
                  <div className="mt-1 flex items-center gap-2"><span className="text-sm text-slate-500">cal.octomeet.ai/</span><input defaultValue="nicolas-82n88" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" /><button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Copy</button></div>
                </div>
              </div>
              <ToggleRow title="Available hours" desc="Restrict scheduling to the hours you've designated as available (Mon–Fri, 9:00 AM – 5:00 PM)." on={tg.availHours} onChange={(v) => set1("availHours", v)} />
              <ToggleRow title="Minimum notice" desc="Enforce minimum notice for scheduling meetings (4 hours before event start time)." on={tg.minNotice} onChange={(v) => set1("minNotice", v)} />
            </>)}

            {sec === 8 && (<>
              <SecHead icon={Folder} title="Folders" desc="Control how meeting reports are sorted and displayed in folders." />
              <div><div className="mb-1 text-sm font-bold text-slate-800">Custom Folders</div><p className="mb-3 text-[13px] text-slate-500">Create and manage your own folders to organize meeting reports your way.</p><button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"><FolderPlus size={16} /> Add New Folder</button></div>
              <div>
                <div className="mb-1 text-sm font-bold text-slate-800">Smart Folders</div>
                <p className="mb-3 text-[13px] text-slate-500">Auto-organize reports by topic. Show or hide folders that aren't relevant to you.</p>
                <div className="flex flex-wrap gap-2">
                  {["Account Review","Business Review","Coaching Session","Customer Feedback","Customer Success","Educational","Investor Pitch","Job Interview","One-on-One","Partnership Alignment","Planning Meeting","Sales Call","Sales Strategy","Status Update","Training"].map((f) => (
                    <span key={f} className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5 text-[12px] text-slate-600"><Folder size={12} className="text-indigo-400" /> {f}</span>
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
                <div className="flex gap-2"><button className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">🇬 Connect Google</button><button className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">⊞ Connect Microsoft</button></div>
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No contact groups created<br /><span className="text-[13px]">Create a new group for easier sharing</span></div>
            </>)}

            {sec === 10 && (<>
              <SecHead icon={Type} title="Custom Vocabulary" desc="Boost words for better transcript accuracy." />
              <div className="rounded-lg bg-indigo-50 p-3 text-[13px] text-indigo-700">Maximum 100 entries.</div>
              <div className="text-sm font-semibold text-slate-700">0 custom words</div>
              <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"><Plus size={16} /> Add new</button>
            </>)}

            {sec === 11 && (<>
              <SecHead icon={Settings} title="Advanced" desc="Manage additional controls for your account, security, and preferences." />
              <ToggleRow title="Customer Experience Program" desc="Participate in a voluntary program that stores meeting data to help improve the features in our service." on={tg.cxp} onChange={(v) => set1("cxp", v)} />
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800">Active Sessions</div>
                <p className="mb-3 text-[13px] text-slate-500">See where your account is signed in.</p>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"><div><div className="text-sm font-medium text-slate-700">Chrome Browser (Current)</div><div className="text-[12px] text-slate-400">BR · Active just now</div></div><button className="text-[13px] font-semibold text-indigo-600">Log out</button></div>
                <button className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Log out of all sessions</button>
              </div>
              <div className="rounded-xl border border-rose-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800">Delete Account</div>
                <p className="mb-3 text-[13px] text-slate-500">This action is permanent and cannot be undone.</p>
                <button className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Delete my account</button>
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
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500"><Icon size={20} /></div>
      <div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="text-[13px] text-slate-500">{desc}</p></div>
    </div>
  );
}
function Field({ label, value, muted, edit }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-0">
      <div><span className="text-sm font-medium text-slate-700">{label}</span></div>
      <div className="flex items-center gap-3"><span className={"text-sm " + (muted ? "italic text-slate-400" : "text-slate-700")}>{value}</span>{edit && <button className="text-slate-300 hover:text-indigo-500">✎</button>}</div>
    </div>
  );
}
function Radio({ label, desc, def, checked, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 py-1.5 text-left">
      <span className={"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 " + (checked ? "border-indigo-600" : "border-slate-300")}>{checked && <span className="h-2 w-2 rounded-full bg-indigo-600" />}</span>
      <span><span className="text-[13px] font-medium text-slate-700">{label}</span>{def && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Default</span>}<span className="block text-[12px] text-slate-400">{desc}</span></span>
    </button>
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
        <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm">
          <video key={meeting.id} src={meeting.video} controls preload="metadata" className="aspect-video w-full bg-black" />
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
function RecentSearches({ groups, onPick }) {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-slate-200 bg-white xl:flex">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5">
        <ClipboardList size={16} className="text-indigo-500" />
        <h2 className="text-sm font-bold text-slate-800">Recent Searches</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.bucket}>
            <div className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.bucket}</div>
            {g.items.map((qq, i) => (
              <button key={i} onClick={() => onPick(qq)} className="block w-full truncate px-4 py-2.5 text-left text-[13px] text-slate-600 transition hover:bg-indigo-50/50">{qq}</button>
            ))}
          </div>
        ))}
      </div>
      <button className="flex items-center justify-center gap-2 border-t border-slate-200 py-3 text-[13px] font-semibold text-indigo-600 hover:bg-indigo-50/50"><Clock size={14} /> All Search History</button>
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
    setInput(""); addRecent(question);
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

  const suggestions = [
    "What are the major takeaways from last week's meetings?",
    "What is the {team name} team working on right now?",
    "What are my next steps on the {project name} project?",
    "What tasks are currently at risk or overdue?",
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3.5">
          <ChevronLeft size={18} className="text-slate-400" />
          <Sparkles size={16} className="text-indigo-500" />
          <h1 className="text-lg font-bold text-slate-900">Ask Octo</h1>
        </div>

        {!started ? (
          <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-10">
            <div className="mt-8 w-full max-w-3xl">
              <h2 className="mb-7 text-center text-3xl font-bold text-slate-900">What can I help you discover?</h2>
              <form onSubmit={(e) => { e.preventDefault(); send(); }}
                className="flex items-center gap-2 rounded-2xl border-2 border-indigo-200 bg-white px-3 py-2.5 shadow-sm focus-within:border-indigo-400">
                <button type="button" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400"><Globe size={16} /><ChevronDown size={13} /></button>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Octo anything..." className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400" />
                <button type="submit" disabled={!input.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40"><Send size={16} /></button>
              </form>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="flex items-center gap-2 rounded-xl bg-indigo-50/70 px-4 py-2.5 text-sm text-indigo-700 transition hover:bg-indigo-100">
                    <Sparkles size={14} className="text-indigo-400" /> {s}
                  </button>
                ))}
              </div>
              <div className="mt-12 text-center">
                <div className="mb-2.5 text-xs font-bold text-slate-500">Your sources</div>
                <div className="flex items-center justify-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm"><Calendar size={18} className="text-sky-500" /></div>
                  <div className="h-10 w-10 rounded-lg border border-dashed border-slate-200 bg-white" />
                  <div className="h-10 w-10 rounded-lg border border-dashed border-slate-200 bg-white" />
                  <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50"><Plus size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-6 py-5">
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
            <div className="border-t border-slate-200 bg-white px-6 py-3">
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask Octo anything…" className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none" />
                <button onClick={() => send()} disabled={busy || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white transition disabled:opacity-40"><Send size={16} /></button>
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
        video: VIDEOS[Math.floor((title || "x").length) % VIDEOS.length],
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
