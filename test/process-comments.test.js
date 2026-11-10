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

test("resolves a real username from the Meta API when the webhook payload has none", async () => {
  const recorded = [];
  let profileCalls = 0;
  const store = {
    claimEvent: async () => true,
    recordContactEvent: async (event) => recorded.push(event),
    isContactPaused: async () => false,
    getContact: async () => null,
    read: async () => ({ rules: [], activity: [] }),
    log: async () => {},
  };
  const meta = { getUserProfile: async () => { profileCalls++; return { username: "resolvida" }; } };

  await processComments([{ id: "comment-3", authorId: "person-2", username: null, text: "oi", mediaId: "reel-1" }], store, meta);

  assert.equal(profileCalls, 1);
  assert.equal(recorded[0].username, "resolvida");
});

test("reuses the already-known contact username instead of calling the Meta API again", async () => {
  const recorded = [];
  let profileCalls = 0;
  const store = {
    claimEvent: async () => true,
    recordContactEvent: async (event) => recorded.push(event),
    isContactPaused: async () => false,
    getContact: async () => ({ username: "ja-conhecido", history: [] }),
    read: async () => ({ rules: [], activity: [] }),
    log: async () => {},
  };
  const meta = { getUserProfile: async () => { profileCalls++; return { username: "nunca-deveria-vir" }; } };

  await processComments([{ id: "comment-4", authorId: "person-3", username: null, text: "oi", mediaId: "reel-1" }], store, meta);

  assert.equal(profileCalls, 0);
  assert.equal(recorded[0].username, "ja-conhecido");
});

test("falls back to a null username when the Meta API lookup fails", async () => {
  const recorded = [];
  const store = {
    claimEvent: async () => true,
    recordContactEvent: async (event) => recorded.push(event),
    isContactPaused: async () => false,
    getContact: async () => null,
    read: async () => ({ rules: [], activity: [] }),
    log: async () => {},
  };
  const meta = { getUserProfile: async () => { throw new Error("sem permissão"); } };

  await processComments([{ id: "comment-5", authorId: "person-4", username: null, text: "oi", mediaId: "reel-1" }], store, meta);

  assert.equal(recorded[0].username, null);
});

test("fills {nome} and {palavra} in the private reply, the public reply and the stored delivery", async () => {
  const calls = [];
  let pending = null;
  const rule = { id: "rule-1", name: "CRM", keyword: "crm", match: "contains", enabled: true, responseMode: "both",
    reply: "Oi {nome}! Me responde SIM que eu te mando o {palavra}", publicReplies: ["{nome}, te mandei o {palavra} na DM"],
    followUpEnabled: true, followUpText: "Aqui está o {palavra}, {nome} 👇", followUpUrl: "https://example.com" };
  const store = {
    claimEvent: async () => true, recordContactEvent: async () => {}, isContactPaused: async () => false, getContact: async () => null,
    read: async () => ({ rules: [rule], activity: [] }),
    setPendingDelivery: async (id, delivery) => { pending = delivery; }, log: async () => {}
  };
  const meta = { reply: async (_id, text, mode) => { calls.push(text); return mode === "private" ? { recipient_id: "p1" } : { id: "x" }; } };
  await processComments([{ id: "c1", authorId: "p1", username: "ana.silva", text: "quero o CRM", mediaId: "m" }], store, meta);
  assert.deepEqual(calls, ["Oi @ana.silva! Me responde SIM que eu te mando o crm", "@ana.silva, te mandei o crm na DM"]);
  assert.equal(pending.text, "Aqui está o crm, @ana.silva 👇");
});
