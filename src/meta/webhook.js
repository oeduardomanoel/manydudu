import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaSignature(body, header, secret) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const received = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Meta's "signed_request" format (used for the Data Deletion Request callback):
// "<base64url signature>.<base64url JSON payload>", where the signature is an
// HMAC-SHA256 of the payload segment keyed by the app secret. Returns the parsed
// payload only once the signature verifies — never trust the payload otherwise.
export function parseSignedRequest(signedRequest, secret) {
  if (!secret) return null;
  const [encodedSignature, encodedPayload] = String(signedRequest ?? "").split(".");
  if (!encodedSignature || !encodedPayload) return null;
  let received;
  try { received = Buffer.from(encodedSignature, "base64url"); } catch { return null; }
  const expected = createHmac("sha256", secret).update(encodedPayload).digest();
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (payload.algorithm !== "HMAC-SHA256") return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractComments(payload) {
  const comments = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" || !change.value?.id) continue;
      comments.push({ id: String(change.value.id), text: String(change.value.text ?? ""),
        authorId: String(change.value.from?.id ?? ""), username: change.value.from?.username ? String(change.value.from.username) : null,
        mediaId: String(change.value.media?.id ?? ""),
        // comentário em anúncio (post impulsionado ou criado no Gerenciador): a Meta manda o anúncio
        // e o post de origem — a mídia comentada pode não ser o mesmo id do post
        adId: change.value.media?.ad_id ? String(change.value.media.ad_id) : null,
        adTitle: change.value.media?.ad_title ? String(change.value.media.ad_title).slice(0, 200) : null,
        originalMediaId: change.value.media?.original_media_id ? String(change.value.media.original_media_id) : null });
    }
  }
  return comments;
}

export function extractMessages(payload) {
  const messages = [];
  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!event.message?.mid || event.message.is_echo || event.sender?.id === entry.id) continue;
      messages.push({ id: String(event.message.mid), senderId: String(event.sender?.id ?? ""),
        recipientId: String(event.recipient?.id ?? ""), text: String(event.message.text ?? ""),
        timestamp: Number(event.timestamp ?? Date.now()) });
    }
  }
  return messages;
}

export function extractPostbacks(payload) {
  const postbacks = [];
  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!event.postback?.mid || event.sender?.id === entry.id || event.is_self) continue;
      postbacks.push({ id: `${event.postback.mid}:${event.sender?.id}:${event.timestamp}`, senderId: String(event.sender?.id ?? ""),
        recipientId: String(event.recipient?.id ?? ""), text: String(event.postback.title ?? ""),
        payload: String(event.postback.payload ?? ""), timestamp: Number(event.timestamp ?? Date.now()) });
    }
  }
  return postbacks;
}
