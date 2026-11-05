import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyMetaSignature, extractComments, extractMessages, extractPostbacks, parseSignedRequest } from "../src/meta/webhook.js";

test("accepts a valid sha256 signature", () => {
  const body = Buffer.from('{"object":"instagram"}');
  const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(body, signature, "secret"), true);
});

test("rejects a malformed signature", () => {
  assert.equal(verifyMetaSignature(Buffer.from("{}"), "nope", "secret"), false);
});

function signRequest(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

test("parseSignedRequest returns the payload for a correctly signed request", () => {
  const payload = { algorithm: "HMAC-SHA256", user_id: "12345" };
  const result = parseSignedRequest(signRequest(payload, "app-secret"), "app-secret");
  assert.deepEqual(result, payload);
});

test("parseSignedRequest rejects a request signed with a different secret", () => {
  const signed = signRequest({ algorithm: "HMAC-SHA256", user_id: "12345" }, "wrong-secret");
  assert.equal(parseSignedRequest(signed, "app-secret"), null);
});

test("parseSignedRequest rejects a payload claiming a different algorithm", () => {
  const signed = signRequest({ algorithm: "none", user_id: "12345" }, "app-secret");
  assert.equal(parseSignedRequest(signed, "app-secret"), null);
});

test("parseSignedRequest rejects malformed input instead of throwing", () => {
  assert.equal(parseSignedRequest("not-a-signed-request", "app-secret"), null);
  assert.equal(parseSignedRequest("", "app-secret"), null);
  assert.equal(parseSignedRequest(undefined, "app-secret"), null);
  assert.equal(parseSignedRequest("sig.payload", ""), null);
});

test("extracts comment changes from Instagram webhook payload", () => {
  const payload = { entry: [{ changes: [{ field: "comments", value: {
    id: "comment-1", text: "Quero", from: { id: "user-1", username: "ana" },
    media: { id: "media-1" }
  } }] }] };
  assert.deepEqual(extractComments(payload), [{
    id: "comment-1", text: "Quero", authorId: "user-1", username: "ana", mediaId: "media-1"
  }]);
});

test("extracts a comment with a null username when Instagram doesn't send one", () => {
  const payload = { entry: [{ changes: [{ field: "comments", value: {
    id: "comment-2", text: "Quero", from: { id: "user-2" },
    media: { id: "media-1" }
  } }] }] };
  assert.deepEqual(extractComments(payload), [{
    id: "comment-2", text: "Quero", authorId: "user-2", username: null, mediaId: "media-1"
  }]);
});

test("extracts an inbound Instagram direct message", () => {
  const payload = { entry: [{ id: "ig-account", messaging: [{ sender: { id: "person-1" }, recipient: { id: "ig-account" },
    timestamp: 123, message: { mid: "message-1", text: "Pode mandar" } }] }] };
  assert.deepEqual(extractMessages(payload), [{ id: "message-1", senderId: "person-1", recipientId: "ig-account", text: "Pode mandar", timestamp: 123 }]);
});

test("ignores outbound message echoes", () => {
  const payload = { entry: [{ id: "ig-account", messaging: [{ sender: { id: "ig-account" }, recipient: { id: "person-1" },
    message: { mid: "message-2", text: "Olá", is_echo: true } }] }] };
  assert.deepEqual(extractMessages(payload), []);
});

test("extracts a follower confirmation postback", () => {
  const payload = { entry: [{ id: "ig-account", messaging: [{ sender: { id: "person-1" }, recipient: { id: "ig-account" },
    timestamp: 456, postback: { mid: "message-3", title: "JÁ SEGUI", payload: "CHECK_FOLLOW" } }] }] };
  const result = extractPostbacks(payload);
  assert.equal(result[0].senderId, "person-1");
  assert.equal(result[0].payload, "CHECK_FOLLOW");
});
