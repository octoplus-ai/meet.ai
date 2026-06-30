// Export a deck to an EDITABLE PowerPoint (.pptx) with native objects (text/shapes/images),
// not screenshots. pptxgenjs is loaded from CDN at click time (no bundling).
const CDN = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
let _loaded;
function loadPptx() {
  if (typeof window !== "undefined" && window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  _loaded = _loaded || new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = CDN; s.onload = () => res(window.PptxGenJS); s.onerror = rej;
    document.head.appendChild(s);
  });
  return _loaded;
}
const hx = (c) => String(c || "").replace("#", ""); // pptxgenjs wants no '#'

// imgs = array of data: URLs (or null). 16:9 = 13.333in x 7.5in.
export async function exportPptx(deck, t, imgs = []) {
  const Pptx = await loadPptx();
  const p = new Pptx();
  p.defineLayout({ name: "OCTO169", width: 13.333, height: 7.5 });
  p.layout = "OCTO169";
  p.author = "OctoMeet"; p.title = deck.title;
  const W = 13.333, MX = 0.9;
  const head = { fontFace: "Poppins", color: hx(t.heading) };
  const bodyc = { fontFace: "Inter", color: hx(t.body) };
  const bullets = (a, opt) => (a || []).map((x) => ({ text: x, options: { bullet: { code: "2022" }, ...opt } }));

  for (const s of deck.slides) {
    const sl = p.addSlide();
    sl.background = { color: hx(t.bg) };

    if (s.layout === "cover" || s.layout === "closing") {
      sl.addShape(p.ShapeType.rect, { x: MX, y: 2.2, w: 0.75, h: 0.12, fill: { color: hx(t.accent) } });
      if (s.eyebrow) sl.addText(String(s.eyebrow).toUpperCase(), { x: MX, y: 1.7, w: 11, h: 0.4, fontSize: 13, charSpacing: 3, bold: true, color: hx(t.accent), fontFace: "Inter" });
      sl.addText(s.headline || s.title, { x: MX, y: 2.5, w: W - MX * 2, h: 1.8, fontSize: 44, bold: true, ...head, valign: "top" });
      if (s.subtitle || s.contact) sl.addText(s.subtitle || s.contact, { x: MX, y: 4.4, w: W - MX * 2, h: 0.6, fontSize: 18, color: hx(t.muted), fontFace: "Inter" });
      if (s.bullets && s.bullets.length) sl.addText(bullets(s.bullets, { fontSize: 18, ...bodyc, paraSpaceAfter: 6 }), { x: MX, y: 4.6, w: W - MX * 2, h: 2 });
      continue;
    }

    sl.addText(s.title, { x: MX, y: 0.55, w: W - MX * 2, h: 1.0, fontSize: 30, bold: true, ...head, valign: "top" });
    sl.addShape(p.ShapeType.line, { x: MX, y: 1.65, w: W - MX * 2, h: 0, line: { color: hx(t.accent), width: 2 } });
    const top = 2.0;

    if (s.layout === "agenda") {
      sl.addText((s.items || []).map((x, i) => ({ text: `${i + 1}.  ${x}`, options: { fontSize: 22, ...bodyc, paraSpaceAfter: 10 } })), { x: MX, y: top, w: W - MX * 2, h: 4.8 });
    } else if (s.layout === "bullets") {
      sl.addText(bullets(s.bullets, { fontSize: 22, ...bodyc, paraSpaceAfter: 12 }), { x: MX, y: top, w: W - MX * 2, h: 4.8, valign: "top" });
    } else if (s.layout === "twoColumn") {
      const cw = (W - MX * 2 - 0.5) / 2;
      [[MX, s.left], [MX + cw + 0.5, s.right]].forEach(([x, c]) => {
        sl.addShape(p.ShapeType.roundRect, { x, y: top, w: cw, h: 4.6, rectRadius: 0.12, fill: { color: hx(t.surface) }, line: { color: hx(t.border) } });
        sl.addText((c && c.heading) || "", { x: x + 0.3, y: top + 0.25, w: cw - 0.6, h: 0.6, fontSize: 18, bold: true, ...head });
        sl.addText(bullets(c && c.bullets, { fontSize: 16, ...bodyc, paraSpaceAfter: 8 }), { x: x + 0.3, y: top + 0.95, w: cw - 0.6, h: 3.4, valign: "top" });
      });
    } else if (s.layout === "bigStat") {
      sl.addText(s.stat, { x: MX, y: top, w: W - MX * 2, h: 2.6, fontSize: 130, bold: true, color: hx(t.accent), fontFace: "Poppins" });
      sl.addText(s.statLabel || "", { x: MX, y: top + 2.5, w: W - MX * 2, h: 0.7, fontSize: 26, bold: true, ...head });
      if (s.caption) sl.addText(s.caption, { x: MX, y: top + 3.3, w: 9, h: 1, fontSize: 18, color: hx(t.muted), fontFace: "Inter" });
    } else if (s.layout === "quote") {
      sl.addText('"' + (s.quote || "") + '"', { x: MX, y: top, w: W - MX * 2, h: 3.5, fontSize: 32, italic: true, bold: true, ...head, valign: "top" });
      if (s.attribution) sl.addText("— " + s.attribution, { x: MX, y: top + 3.4, w: 10, h: 0.6, fontSize: 20, color: hx(t.muted), fontFace: "Inter" });
    } else if (s.layout === "timeline") {
      sl.addText((s.events || []).map((e) => ({ text: `${e.when}    ${e.what}`, options: { fontSize: 20, ...bodyc, paraSpaceAfter: 14, bullet: { code: "25CF" } } })), { x: MX, y: top, w: W - MX * 2, h: 4.8, valign: "top" });
    } else if (s.layout === "imageText") {
      const half = (W - MX * 2) / 2;
      const imgX = s.imageSide === "left" ? MX : MX + half + 0.3;
      const txtX = s.imageSide === "left" ? MX + half + 0.3 : MX;
      const data = (s.imageRef != null && imgs[s.imageRef]) ? imgs[s.imageRef] : null;
      if (data) sl.addImage({ data, x: imgX, y: top, w: half - 0.3, h: 4.4, sizing: { type: "cover", w: half - 0.3, h: 4.4 } });
      else sl.addShape(p.ShapeType.roundRect, { x: imgX, y: top, w: half - 0.3, h: 4.4, rectRadius: 0.12, fill: { color: hx(t.accent) } });
      if (s.body) sl.addText(s.body, { x: txtX, y: top, w: half - 0.3, h: 1.6, fontSize: 18, ...bodyc, valign: "top" });
      if (s.bullets && s.bullets.length) sl.addText(bullets(s.bullets, { fontSize: 16, ...bodyc, paraSpaceAfter: 8 }), { x: txtX, y: top + 1.7, w: half - 0.3, h: 2.7, valign: "top" });
    } else {
      sl.addText(bullets(s.bullets, { fontSize: 22, ...bodyc, paraSpaceAfter: 12 }), { x: MX, y: top, w: W - MX * 2, h: 4.8, valign: "top" });
    }
  }
  await p.writeFile({ fileName: (deck.title || "deck").replace(/[^\w\s-]/g, "").trim().slice(0, 60) + ".pptx" });
}
