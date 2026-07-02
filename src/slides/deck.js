// Gamma-style slide deck: themes, schema coercion, and layout -> HTML rendering.
// Pure JS (browser + node safe). Used by the presentation composer, preview and exports.

export const THEMES = {
  "sleek-dark": {
    name: "Sleek Dark", mode: "dark",
    bg: "#0E1116", surface: "#171B22", heading: "#F5F7FA", body: "#A8B0BD",
    accent: "#7C3AED", accentText: "#FFFFFF", border: "#262B33", muted: "#6B7280",
    fontHead: `'Poppins','Inter',system-ui,sans-serif`, fontBody: `'Inter',system-ui,sans-serif`,
  },
  "rich-purple": {
    name: "Rich Purple", mode: "dark",
    bg: "#1B1233", surface: "#241845", heading: "#FBF7FF", body: "#BCA8E0",
    accent: "#C084FC", accentText: "#1B1233", border: "#33245C", muted: "#8B7BB0",
    fontHead: `'Poppins','Inter',system-ui,sans-serif`, fontBody: `'Inter',system-ui,sans-serif`,
  },
  "clean-light": {
    name: "Clean Light", mode: "light",
    bg: "#FFFFFF", surface: "#F6F8FA", heading: "#0B1220", body: "#475467",
    accent: "#7C3AED", accentText: "#FFFFFF", border: "#E5E9F0", muted: "#94A3B8",
    fontHead: `'Inter','Inter Tight',system-ui,sans-serif`, fontBody: `'Inter',system-ui,sans-serif`,
  },
  "warm-dark": {
    name: "Warm Dark", mode: "dark",
    bg: "#1A1614", surface: "#241F1B", heading: "#F7F2EC", body: "#B7AC9F",
    accent: "#E8743B", accentText: "#1A1614", border: "#332C26", muted: "#8A7E70",
    fontHead: `'Poppins','Inter',system-ui,sans-serif`, fontBody: `'Inter',system-ui,sans-serif`,
  },
};
export const THEME_LIST = Object.entries(THEMES).map(([id, t]) => ({ id, ...t }));
export const getTheme = (id) => THEMES[id] || THEMES["sleek-dark"];

// Build a full theme from a single user-picked accent color + light/dark mode.
function hexToRgb(h) { h = String(h || "").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h || "7c3aed", 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function relLum(h) { const { r, g, b } = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
export function customTheme(accent, mode = "dark") {
  const a = /^#?[0-9a-fA-F]{3,6}$/.test(String(accent || "")) ? (accent[0] === "#" ? accent : "#" + accent) : "#7C3AED";
  const accentText = relLum(a) > 0.6 ? "#0B1220" : "#FFFFFF"; // readable text on the accent
  const base = { name: "Custom", accent: a, accentText, fontHead: `'Poppins','Inter',system-ui,sans-serif`, fontBody: `'Inter',system-ui,sans-serif` };
  return mode === "light"
    ? { ...base, mode: "light", bg: "#FFFFFF", surface: "#F6F8FA", heading: "#0B1220", body: "#475467", border: "#E5E9F0", muted: "#94A3B8" }
    : { ...base, mode: "dark", bg: "#0E1116", surface: "#171B22", heading: "#F5F7FA", body: "#A8B0BD", border: "#262B33", muted: "#6B7280" };
}

const LAYOUTS = ["cover", "agenda", "bullets", "twoColumn", "bigStat", "quote", "imageText", "timeline", "closing"];
const arr = (v, n = 99) => (Array.isArray(v) ? v : []).map((s) => String(s == null ? "" : s)).filter(Boolean).slice(0, n);

export function coerceDeck(raw, { wantN, imageCount = 0 } = {}) {
  const d = raw && typeof raw === "object" ? raw : {};
  let slides = Array.isArray(d.slides) ? d.slides : [];
  slides = slides.map((s) => {
    const layout = LAYOUTS.includes(s && s.layout) ? s.layout : "bullets";
    const o = { layout, title: String((s && s.title) || "").slice(0, 140), note: String((s && s.note) || "") };
    if (layout === "cover") { o.subtitle = String((s && s.subtitle) || ""); o.eyebrow = String((s && s.eyebrow) || ""); }
    if (layout === "agenda") o.items = arr(s && s.items, 6);
    if (layout === "bullets") o.bullets = arr(s && s.bullets, 6);
    if (layout === "twoColumn") {
      o.left = { heading: String((s && s.left && s.left.heading) || ""), bullets: arr(s && s.left && s.left.bullets, 6) };
      o.right = { heading: String((s && s.right && s.right.heading) || ""), bullets: arr(s && s.right && s.right.bullets, 6) };
    }
    if (layout === "bigStat") { o.stat = String((s && s.stat) || ""); o.statLabel = String((s && s.statLabel) || ""); o.caption = String((s && s.caption) || ""); }
    if (layout === "quote") { o.quote = String((s && s.quote) || ""); o.attribution = String((s && s.attribution) || ""); }
    if (layout === "imageText") {
      o.body = String((s && s.body) || ""); o.bullets = arr(s && s.bullets, 4);
      o.imageSide = (s && s.imageSide) === "left" ? "left" : "right";
      const m = /img_(\d+)/.exec((s && s.imageRef) || ""); if (m && +m[1] < imageCount) o.imageRef = +m[1];
    }
    if (layout === "timeline") o.events = (Array.isArray(s && s.events) ? s.events : []).slice(0, 5).map((e) => ({ when: String((e && e.when) || ""), what: String((e && e.what) || "") }));
    if (layout === "closing") { o.headline = String((s && (s.headline || s.title)) || ""); o.bullets = arr(s && s.bullets, 5); o.contact = String((s && s.contact) || ""); }
    if (s && typeof s.bgImage === "number" && s.bgImage < imageCount) o.bgImage = s.bgImage; // full-bleed background image index
    return o;
  });
  if (wantN) {
    if (slides.length > wantN) slides = slides.slice(0, wantN);
    while (slides.length < wantN) slides.push({ layout: "bullets", title: "…", bullets: [], note: "" });
  }
  return {
    lang: String(d.lang || "en"),
    title: String(d.title || "Presentation").slice(0, 140),
    subtitle: String(d.subtitle || ""),
    themeId: d.themeId,
    slides,
  };
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function slideInner(s, t, imgs) {
  const ul = (b) => (b && b.length ? `<ul>${b.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  switch (s.layout) {
    case "cover":
      return `<div class="cover"><div class="bar"></div>${s.eyebrow ? `<div class="eyebrow">${esc(s.eyebrow)}</div>` : ""}<h1 class="big">${esc(s.title)}</h1>${s.subtitle ? `<div class="sub">${esc(s.subtitle)}</div>` : ""}</div>`;
    case "agenda":
      return `<h2>${esc(s.title)}</h2><ol class="agenda">${(s.items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`;
    case "bullets":
      return `<h2>${esc(s.title)}</h2>${ul(s.bullets)}`;
    case "twoColumn":
      return `<h2>${esc(s.title)}</h2><div class="cols"><div class="col"><h3>${esc(s.left && s.left.heading)}</h3>${ul(s.left && s.left.bullets)}</div><div class="col"><h3>${esc(s.right && s.right.heading)}</h3>${ul(s.right && s.right.bullets)}</div></div>`;
    case "bigStat":
      return `<h2>${esc(s.title)}</h2><div class="statwrap"><div class="stat">${esc(s.stat)}</div><div class="statlabel">${esc(s.statLabel)}</div>${s.caption ? `<div class="caption">${esc(s.caption)}</div>` : ""}</div>`;
    case "quote":
      return `<div class="quotewrap"><div class="mark">&ldquo;</div><blockquote>${esc(s.quote)}</blockquote>${s.attribution ? `<div class="attr">— ${esc(s.attribution)}</div>` : ""}</div>`;
    case "imageText": {
      const src = (s.imageRef != null && imgs[s.imageRef]) ? imgs[s.imageRef] : null;
      const panel = src ? `<div class="imgpanel" style="background-image:url('${src}')"></div>` : `<div class="imgpanel accentpanel"></div>`;
      const txt = `<div class="txtpanel"><h2>${esc(s.title)}</h2>${s.body ? `<p>${esc(s.body)}</p>` : ""}${ul(s.bullets)}</div>`;
      return `<div class="split ${s.imageSide === "left" ? "imgleft" : ""}">${s.imageSide === "left" ? panel + txt : txt + panel}</div>`;
    }
    case "timeline":
      return `<h2>${esc(s.title)}</h2><div class="timeline">${(s.events || []).map((e) => `<div class="tl"><div class="tlwhen">${esc(e.when)}</div><div class="tldot"></div><div class="tlwhat">${esc(e.what)}</div></div>`).join("")}</div>`;
    case "closing":
      return `<div class="cover"><div class="bar"></div><h1 class="big">${esc(s.headline || s.title)}</h1>${ul(s.bullets)}${s.contact ? `<div class="sub">${esc(s.contact)}</div>` : ""}</div>`;
    default:
      return `<h2>${esc(s.title)}</h2>${ul(s.bullets)}`;
  }
}

export function deckCSS(t) {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@600;700&display=swap');
  *{box-sizing:border-box;margin:0}
  body{background:#0b0b0f;font-family:${t.fontBody};-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .slide{position:relative;width:1280px;height:720px;background:${t.bg};color:${t.body};padding:72px 88px;display:flex;flex-direction:column;justify-content:center;overflow:hidden;margin:0 auto 24px;border:1px solid ${t.border}}
  h1.big{font-family:${t.fontHead};color:${t.heading};font-size:64px;font-weight:700;line-height:1.08;letter-spacing:-.02em}
  h2{font-family:${t.fontHead};color:${t.heading};font-size:40px;font-weight:700;line-height:1.12;margin-bottom:28px;letter-spacing:-.01em}
  h3{font-family:${t.fontHead};color:${t.heading};font-size:22px;font-weight:600;margin-bottom:12px}
  p{font-size:22px;line-height:1.5;color:${t.body};max-width:60ch}
  ul,ol{padding-left:0;list-style:none}
  li{font-size:24px;line-height:1.45;color:${t.body};padding-left:34px;margin:14px 0;position:relative}
  ul li::before{content:"";position:absolute;left:6px;top:13px;width:10px;height:10px;border-radius:3px;background:${t.accent}}
  ol.agenda{counter-reset:a}
  ol.agenda li{counter-increment:a;font-size:26px}
  ol.agenda li::before{content:counter(a);position:absolute;left:0;top:0;width:30px;height:30px;border-radius:8px;background:${t.accent};color:${t.accentText};font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:center}
  .bar{width:72px;height:8px;border-radius:4px;background:${t.accent};margin-bottom:28px}
  .eyebrow{color:${t.accent};font-weight:700;font-size:15px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px}
  .sub{color:${t.muted};font-size:24px;margin-top:18px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:48px}
  .col{background:${t.surface};border:1px solid ${t.border};border-radius:16px;padding:28px 28px 8px}
  .statwrap{margin-top:8px}
  .stat{font-family:${t.fontHead};color:${t.accent};font-size:180px;font-weight:700;line-height:1;letter-spacing:-.03em}
  .statlabel{color:${t.heading};font-size:30px;font-weight:600;margin-top:6px}
  .caption{color:${t.muted};font-size:20px;margin-top:18px;max-width:48ch}
  .quotewrap{position:relative}
  .mark{color:${t.accent};font-family:${t.fontHead};font-size:140px;line-height:.6;opacity:.5}
  blockquote{font-family:${t.fontHead};color:${t.heading};font-size:40px;font-weight:600;line-height:1.25;max-width:22ch}
  .attr{color:${t.muted};font-size:22px;margin-top:22px;font-weight:600}
  .split{display:grid;grid-template-columns:1.1fr .9fr;gap:0;height:100%;margin:-72px -88px;overflow:hidden}
  .split.imgleft{grid-template-columns:.9fr 1.1fr}
  .txtpanel{padding:72px 64px;display:flex;flex-direction:column;justify-content:center}
  .imgpanel{background-size:cover;background-position:center}
  .accentpanel{background:linear-gradient(135deg,${t.accent},${t.surface})}
  .timeline{display:flex;flex-direction:column;gap:6px;border-left:3px solid ${t.border};padding-left:8px;margin-left:8px}
  .tl{display:grid;grid-template-columns:160px 24px 1fr;align-items:center;gap:8px;padding:10px 0}
  .tlwhen{color:${t.accent};font-weight:700;font-size:20px}
  .tldot{width:14px;height:14px;border-radius:50%;background:${t.accent};margin-left:-9px}
  .tlwhat{color:${t.body};font-size:22px}
  /* full-bleed background image + legibility scrim */
  .content{position:relative;z-index:2;width:100%}
  .bgimg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
  .scrim{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(0,0,0,.30),rgba(0,0,0,.72))}
  .hasbg h1,.hasbg h2,.hasbg h3,.hasbg p,.hasbg li,.hasbg blockquote,.hasbg .statlabel,.hasbg .sub,.hasbg .caption,.hasbg .attr,.hasbg .tlwhat{color:#fff !important}
  @page{size:1280px 720px;margin:0}
  @media print{.slide{margin:0;break-after:page;border:none}}
  `;
}

// imgs = array of data: URLs (base64 with prefix). opts.fit -> scale a single slide to fit the viewport (preview).
export function deckHTML(deck, theme, imgs = [], opts = {}) {
  const body = deck.slides.map((s) => {
    const hasBg = s.bgImage != null && imgs[s.bgImage];
    const bg = hasBg ? `<div class="bgimg" style="background-image:url('${imgs[s.bgImage]}')"></div><div class="scrim"></div>` : "";
    return `<section class="slide${hasBg ? " hasbg" : ""}">${bg}<div class="content">${slideInner(s, theme, imgs)}</div></section>`;
  }).join("");
  const fitCSS = opts.fit ? `html,body{width:100%;height:100%;overflow:hidden;background:transparent;display:flex;align-items:center;justify-content:center}.slide{margin:0;flex:none}` : "";
  const fitJS = opts.fit ? `<script>(function(){function f(){var s=document.querySelector('.slide');if(!s)return;var k=Math.min(innerWidth/1280,innerHeight/720);s.style.transform='scale('+k+')';s.style.transformOrigin='center center';}addEventListener('resize',f);f();setTimeout(f,60);})();</script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(deck.title)}</title><style>${deckCSS(theme)}${fitCSS}</style></head><body>${body}${fitJS}</body></html>`;
}
