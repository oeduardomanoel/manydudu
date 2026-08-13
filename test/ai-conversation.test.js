import test from "node:test";
import assert from "node:assert/strict";
import { processComments, processMessages } from "../src/app.js";

function makeStore(rule) {
  const state = { rules: [rule], activity: [], sessions: new Map(), contacts: new Map() };
  return {
    state,
    claimEvent: async () => true,
    read: async () => ({ rules: state.rules, activity: state.activity }),
    log: async (event) => state.activity.unshift(event),
    recordContactEvent: async (event) => state.contacts.set(event.contactId, event),
    isContactPaused: async () => false,
    startAiSession: async (contactId, session) => state.sessions.set(contactId, session),
    getAiSession: async (contactId) => state.sessions.get(contactId) ?? null,
    updateAiSession: async (contactId, changes) => state.sessions.set(contactId, { ...state.sessions.get(contactId), ...changes }),
    getPendingDelivery: async () => null,
  };
}

test("starts an AI session only for the person whose comment matched the Reel rule", async () => {
  const rule = { id: "rule-ai", name: "Diagnóstico", keyword: "sistema", match: "exact", enabled: true,
    responseMode: "private", reply: "Posso te fazer uma pergunta?", mediaId: "reel-1", aiEnabled: true,
    aiGoal: "Qualificar o processo manual", aiInstructions: "Uma pergunta por vez" };
  const store = makeStore(rule);
  const meta = { reply: async () => ({ recipient_id: "ig-user-1" }) };

  await processComments([{ id: "comment-1", authorId: "ig-user-1", username: "ana", text: "SISTEMA", mediaId: "reel-1" }], store, meta);

  assert.equal(store.state.sessions.get("ig-user-1").ruleId, "rule-ai");
  assert.equal(store.state.sessions.size, 1);
});

test("ignores a DM from a person who has no active AI session", async () => {
  const store = makeStore({});
  const sent = [];
  const agent = { respond: async () => { throw new Error("should not run"); } };
  const meta = { sendDirect: async (...args) => sent.push(args) };

  await processMessages([{ id: "dm-1", senderId: "stranger", text: "oi", timestamp: Date.now() }], store, meta, agent);

  assert.deepEqual(sent, []);
});

test("replies in separate messages and updates qualification for an active AI session", async () => {
  const rule = { id: "rule-ai", name: "Diagnóstico", aiEnabled: true };
  const store = makeStore(rule);
  store.state.sessions.set("ig-user-1", { ruleId: "rule-ai", status: "active", turnCount: 0, history: [], updatedAt: new Date().toISOString() });
  const sent = [];
  const meta = { sendDirect: async (_id, text) => sent.push(text) };
  const agent = { respond: async () => ({ messages: ["Entendi.", "Quantas vezes isso acontece por semana?"],
    qualification: { stage: "discovering", score: 25, summary: "Processo ainda sem volume informado" } }) };

  await processMessages([{ id: "dm-2", senderId: "ig-user-1", text: "Faço follow-up manual", timestamp: Date.now() }], store, meta, agent);

  assert.deepEqual(sent, ["Entendi.", "Quantas vezes isso acontece por semana?"]);
  assert.equal(store.state.sessions.get("ig-user-1").turnCount, 1);
  assert.equal(store.state.sessions.get("ig-user-1").qualification.score, 25);
});
