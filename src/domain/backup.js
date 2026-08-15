import { AppError } from "../util/errors.js";
import { sanitizeHtml } from "../util/html.js";

const FORMAT = "manydudu-backup";
const VERSION = 1;
const ARRAY_KEYS = ["rules", "activity", "campaigns", "leads"];
const OBJECT_KEYS = ["events", "pendingDeliveries", "contacts"];
const ALLOWED_KEYS = [...ARRAY_KEYS, ...OBJECT_KEYS];
const MAX_CONTENT_HTML_LENGTH = 50_000;

function sanitizeCampaignItem(item) {
  if (!("contentHtml" in item)) return item;
  return { ...item, contentHtml: sanitizeHtml(String(item.contentHtml ?? "").slice(0, MAX_CONTENT_HTML_LENGTH)) };
}

export function exportState(state) {
  const data = {};
  for (const key of ARRAY_KEYS) data[key] = Array.isArray(state[key]) ? state[key] : [];
  for (const key of OBJECT_KEYS) data[key] = state[key] && typeof state[key] === "object" ? state[key] : {};
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), state: data };
}

export function validateBackup(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new AppError("Arquivo inválido — não é um JSON legível.");
  }
  if (!parsed || typeof parsed !== "object") throw new AppError("Arquivo inválido.");
  if (parsed.format !== FORMAT) throw new AppError("Esse arquivo não é um backup do ManyDudu.");
  const source = parsed.state;
  if (!source || typeof source !== "object") throw new AppError("Backup sem dados.");

  const sanitized = {};
  for (const key of ARRAY_KEYS) {
    const value = source[key];
    if (value !== undefined && !Array.isArray(value)) throw new AppError(`Campo "${key}" inválido no backup.`);
    const items = Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && typeof item.id === "string") : [];
    sanitized[key] = key === "campaigns" ? items.map(sanitizeCampaignItem) : items;
  }
  for (const key of OBJECT_KEYS) {
    const value = source[key];
    if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) throw new AppError(`Campo "${key}" inválido no backup.`);
    sanitized[key] = value && typeof value === "object" ? value : {};
  }
  return sanitized;
}

export function applyBackup(state, sanitized) {
  const currentMetaToken = state.metaToken ?? null;
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, sanitized, { metaToken: currentMetaToken });
}
