import { createHash } from "node:crypto";
import { AppError } from "../util/errors.js";

const MAX_VALUE = 1_000_000;

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

// Meta's Conversions API needs no App Review — the access token is generated directly
// in Events Manager (Conversions API settings), separate from Instagram Messaging
// permissions. `action_source: "business_messaging"` is Meta's dedicated value for
// conversions that happened inside a chat (Instagram/WhatsApp/Messenger), as opposed to
// a website pixel firing in a browser.
export function buildPurchaseEvent({ contactId, value, currency = "BRL", now = Date.now }) {
  if (!contactId) throw new AppError("Contato inválido.");
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_VALUE) throw new AppError("Informe um valor de venda válido.");
  return {
    event_name: "Purchase",
    event_time: Math.floor(now() / 1000),
    action_source: "business_messaging",
    messaging_channel: "instagram",
    user_data: { external_id: sha256(contactId) },
    custom_data: { value: Math.round(amount * 100) / 100, currency: String(currency || "BRL").trim().toUpperCase().slice(0, 3) },
  };
}
