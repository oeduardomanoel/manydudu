import { AppError } from "../util/errors.js";

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateSettings(input = {}) {
  const outboundWebhookUrl = String(input.outboundWebhookUrl ?? "").trim();
  if (outboundWebhookUrl && !isHttpsUrl(outboundWebhookUrl)) throw new AppError("A URL do webhook de saída precisa usar https://.");
  return { outboundWebhookUrl };
}
