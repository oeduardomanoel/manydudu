import { AppError } from "../util/errors.js";

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const FIELD_VALIDATORS = {
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
};

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
