import { AppError } from "../util/errors.js";

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const BRAND_TEMPLATES = new Set(["laranja", "azul", "verde", "roxo"]);
const MAX_LOGO_BYTES = 200_000;
const SAFE_LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

function isSafeLogoUrl(value) {
  if (/^https:\/\//i.test(value)) return true;
  const match = /^data:([^;]+);base64,([a-z0-9+/=]+)$/i.exec(value);
  if (!match) return false;
  if (!SAFE_LOGO_MIME.has(match[1].toLowerCase())) return false;
  return match[2].length * 0.75 <= MAX_LOGO_BYTES;
}

const FIELD_VALIDATORS = {
  brandName(value) {
    return String(value ?? "").trim().slice(0, 60);
  },
  brandHandle(value) {
    return String(value ?? "").trim().replace(/^@/, "").slice(0, 60);
  },
  brandTagline(value) {
    return String(value ?? "").trim().slice(0, 140);
  },
  brandTemplate(value) {
    const trimmed = String(value ?? "").trim();
    if (trimmed && !BRAND_TEMPLATES.has(trimmed)) throw new AppError("Modelo de cor inválido.");
    return trimmed;
  },
  brandLogoUrl(value) {
    const trimmed = String(value ?? "").trim();
    if (trimmed && !isSafeLogoUrl(trimmed)) throw new AppError("Logo inválido — envie PNG, JPG, WEBP ou SVG de até 200KB.");
    return trimmed;
  },
  outboundWebhookUrl(value) {
    const trimmed = String(value ?? "").trim();
    if (trimmed && !isHttpsUrl(trimmed)) throw new AppError("A URL do webhook de saída precisa usar https://.");
    return trimmed;
  },
  metaPixelId(value) {
    const trimmed = String(value ?? "").trim();
    if (trimmed && !/^\d{5,20}$/.test(trimmed)) throw new AppError("O Pixel ID deve conter apenas números.");
    return trimmed;
  },
  metaCapiToken(value) {
    return String(value ?? "").trim();
  },
  // metas da visão geral — vazio/0 desliga a meta (o gráfico some com a linha tracejada)
  dmDailyGoal(value) {
    return parseGoal(value, 100_000, "A meta de DMs por dia");
  },
  leadMonthlyGoal(value) {
    return parseGoal(value, 1_000_000, "A meta de leads por mês");
  },
};

function parseGoal(value, max, label) {
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) throw new AppError(`${label} precisa ser um número inteiro entre 0 e ${max.toLocaleString("pt-BR")}.`);
  return number;
}

// Only keys actually present in `input` are validated and returned — settings are saved
// through separate small forms (webhook, Pixel/CAPI), so a partial PATCH must never wipe
// fields the caller didn't touch.
export function validateSettings(input = {}) {
  const result = {};
  for (const key of Object.keys(FIELD_VALIDATORS)) {
    if (key in input) result[key] = FIELD_VALIDATORS[key](input[key]);
  }
  return result;
}
