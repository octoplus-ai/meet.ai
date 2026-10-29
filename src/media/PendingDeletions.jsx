import React, { useState } from "react";
import { deletionMessage } from "./deletion.js";

export default function PendingDeletions({ items, onComplete, lang = "en" }) {
  const [busy, setBusy] = useState(null);
  const es = lang === "es";
  const complete = async id => {
    if (busy || !onComplete) return;
    setBusy(id);
    try { await onComplete(id); } finally { setBusy(null); }
  };
  return items.map(item => <section key={item.id} aria-label={es ? "Eliminación de Zoom pendiente" : "Zoom deletion pending"} className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <p className="text-sm font-semibold text-slate-800">{es ? "Eliminación de Zoom pendiente" : "Zoom deletion pending"}</p>
    <p className="mt-1 text-sm leading-relaxed text-slate-600">{deletionMessage({ pending: true }, { lang })}</p>
    <button type="button" disabled={!!busy || !onComplete} onClick={() => complete(item.id)} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-60">
      {busy === item.id ? (es ? "Comprobando…" : "Checking…") : (es ? "Comprobar y completar eliminación" : "Check and complete deletion")}
    </button>
  </section>);
}
