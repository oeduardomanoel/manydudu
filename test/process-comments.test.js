import test from "node:test";
import assert from "node:assert/strict";
import { processComments } from "../src/app.js";

test("combined automation sends a private reply and rotates a public reply", async () => {
  const calls = [];
  let pending = null;
  const rule = { id: "rule-1", name: "ICP", keyword: "icp", match: "contains", enabled: true, responseMode: "both",
    reply: "Responda SIM", publicReplies: ["Te chamei!", "Acabei de enviar!"], followUpEnabled: true,
    followUpText: "Aqui está", followUpUrl: "https://example.com" };
  const store = {
    claimEvent: async () => true,
    recordContactEvent: async () => {},
    isContactPaused: async () => false,
    getContact: async () => null,
    read: async () => ({ rules: [rule], activity: [{ ruleId: "rule-1", status: "sent" }] }),
    setPendingDelivery: async (id, delivery) => { pending = { id, delivery }; },
    log: async () => {}
  };
  const meta = { reply: async (_commentId, text, mode) => {
    calls.push({ text, mode });
    return mode === "private" ? { recipient_id: "person-1" } : { id: "public-1" };
  } };

  await processComments([{ id: "comment-1", authorId: "person-1", username: "ana", text: "ICP", mediaId: "reel-1" }], store, meta);

  assert.deepEqual(calls, [
    { text: "Responda SIM", mode: "private" },
    { text: "Acabei de enviar!", mode: "public" }
  ]);
  assert.equal(pending.id, "person-1");
});

test("does not resend the same message text to a contact within 24h, even from a different rule", async () => {
  const calls = [];
  const logs = [];
  const ruleA = { id: "rule-a", name: "A", keyword: "quero", match: "contains", enabled: true, responseMode: "private", reply: "Já te mando!" };
  const ruleB = { id: "rule-b", name: "B", keyword: "manda", match: "contains", enabled: true, responseMode: "private", reply: "Já te mando!" };
  const store = {
    claimEvent: async () => true,
    recordContactEvent: async () => {},
    isContactPaused: async () => false,
    getContact: async () => ({ history: [{ type: "outgoing_rule", text: "Já te mando!", at: new Date().toISOString() }] }),
    read: async () => ({ rules: [ruleA, ruleB], activity: [] }),
    setPendingDelivery: async () => {},
    log: async (entry) => { logs.push(entry); },
  };
  const meta = { reply: async (_commentId, text, mode) => { calls.push({ text, mode }); return { recipient_id: "person-1" }; } };

  await processComments([{ id: "comment-2", authorId: "person-1", username: "ana", text: "manda", mediaId: "reel-1" }], store, meta);

  assert.deepEqual(calls, []);
  assert.equal(logs[0].status, "ignored");
  assert.equal(logs[0].reason, "fatigue_guard");
});
