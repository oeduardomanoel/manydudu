import test from "node:test";
import assert from "node:assert/strict";
import { processComments, processMessages } from "../src/app.js";

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

test("never answers the account's own comment, even when its public reply contains the keyword", async () => {
  const { MetaClient } = await import("../src/meta/client.js");
  const calls = [];
  const claimed = [];
  const rule = { id: "r", name: "MÁQUINA", keyword: "MÁQUINA", match: "contains", enabled: true, responseMode: "both",
    reply: "Oi {nome}!", publicReplies: ["Te mandei o MÁQUINA na DM 👊"] };
  const store = {
    claimEvent: async (id) => { claimed.push(id); return true; }, recordContactEvent: async () => {}, isContactPaused: async () => false,
    getContact: async () => null, read: async () => ({ rules: [rule], activity: [] }), setPendingDelivery: async () => {}, log: async () => {}
  };
  const meta = new MetaClient({ accessToken: "IG-x", instagramAccountId: "17841474095084362", fetcher: async () => ({}) });
  meta.reply = async (_id, text, mode) => { calls.push({ text, mode }); return mode === "private" ? { recipient_id: "p" } : { id: "x" }; };
  await processComments([
    { id: "own-1", authorId: "17841474095084362", username: "eduardosantos.ia", text: "Te mandei o MÁQUINA na DM 👊", mediaId: "m" },
    { id: "fan-1", authorId: "999", username: "fa", text: "MÁQUINA", mediaId: "m" },
  ], store, meta);
  assert.deepEqual(claimed, ["fan-1"]);
  assert.deepEqual(calls.map((call) => call.mode), ["private", "public"]);
});

test("isOwnAccount matches every id the account uses and its @, case-insensitively", async () => {
  const { MetaClient } = await import("../src/meta/client.js");
  const meta = new MetaClient({ accessToken: "IG-x", instagramAccountId: "17841",
    fetcher: async () => ({ ok: true, json: async () => ({ id: "25168", user_id: "17841", username: "EduardoSantos.IA" }) }) });
  assert.equal(meta.isOwnAccount({ id: "17841" }), true);
  assert.equal(meta.isOwnAccount({ id: "25168" }), false);
  await meta.loadOwnIdentity();
  assert.equal(meta.isOwnAccount({ id: "25168" }), true);
  assert.equal(meta.isOwnAccount({ username: "@eduardosantos.ia" }), true);
  assert.equal(meta.isOwnAccount({ id: "999", username: "outra" }), false);
});

test("a DM coming from the account itself never triggers a link delivery", async () => {
  const sent = [];
  const store = {
    claimEvent: async () => true, getContact: async () => ({ username: "x" }), recordContactEvent: async () => {}, isContactPaused: async () => false,
    getPendingDelivery: async () => ({ ruleId: "r", text: "Aqui", url: "https://x.com", deliveryStyle: "text" }), consumePendingDelivery: async () => {}, log: async () => {}
  };
  const meta = { isOwnAccount: ({ id }) => id === "own", sendDirect: async (id) => { sent.push(id); }, getUserProfile: async () => ({}) };
  await processMessages([{ id: "m1", senderId: "own", text: "oi", timestamp: Date.now() }, { id: "m2", senderId: "fan", text: "sim", timestamp: Date.now() }], store, meta);
  assert.deepEqual(sent, ["fan"]);
});
