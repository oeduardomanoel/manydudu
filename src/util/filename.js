export function safeFilename(value, fallback = "arquivo") {
  const cleaned = String(value || "").replace(/[^\w\-. ]/g, "_").slice(0, 100).trim();
  return cleaned || fallback;
}
