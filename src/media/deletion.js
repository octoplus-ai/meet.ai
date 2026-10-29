// A deletion request may be accepted before storage confirms erasure.
export function pendingDeletionItems(value) {
  return Array.isArray(value) ? [...new Set(value.filter(item => /^[a-f0-9-]{36}$/i.test(item?.id || "")).map(item => item.id))].map(id => ({ id })) : [];
}

export async function requestDeletion(path, body, fetcher = fetch) {
  const response = await fetcher(path, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error("deletion_failed");
  if (response.status === 202 && result.pending === true && result.deletion === "requested") return { pending: true };
  if (response.status === 200 && result.pending !== true) return { pending: false };
  throw new Error("deletion_failed");
}

export function deletionMessage(result, { lang = "en", account = false } = {}) {
  if (result.pending) return (lang === "es"
    ? "Eliminación solicitada. El contenido de Zoom ya no está disponible mientras se eliminan los archivos."
    : "Deletion requested. Zoom content is unavailable while files are being removed.") + (account
      ? (lang === "es" ? " Después, comprobá y completá la eliminación de tu cuenta." : " Then check and complete your account deletion.")
      : "");
  return account
    ? (lang === "es" ? "Se eliminaron tu cuenta y sus datos." : "Your account and its data were deleted.")
    : (lang === "es" ? "Reporte eliminado." : "Report deleted.");
}
