import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaSignature(body, header, secret) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const received = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function extractComments(payload) {
  const comments = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" || !change.value?.id) continue;
      comments.push({ id: String(change.value.id), text: String(change.value.text ?? ""),
        authorId: String(change.value.from?.id ?? ""), username: String(change.value.from?.username ?? "Instagram"),
        mediaId: String(change.value.media?.id ?? "") });
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
