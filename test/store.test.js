import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/storage/json-store.js";

test("deduplicates event ids", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  assert.equal(await store.claimEvent("comment-1"), true);
  assert.equal(await store.claimEvent("comment-1"), false);
});

test("consumes a pending delivery only once", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  await store.setPendingDelivery("person-1", { text: "Seu material", url: "https://example.com" });
  assert.equal((await store.consumePendingDelivery("person-1")).url, "https://example.com");
  assert.equal(await store.consumePendingDelivery("person-1"), null);
});

test("reads a pending delivery without consuming it", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  await store.setPendingDelivery("person-2", { requireFollow: true });
  assert.equal((await store.getPendingDelivery("person-2")).requireFollow, true);
  assert.equal((await store.getPendingDelivery("person-2")).requireFollow, true);
});

test("builds one contact history from comments and direct messages", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();

  await store.recordContactEvent({ contactId: "ig-42", username: "ana", type: "comment", text: "quero", at: "2026-08-01T10:00:00.000Z" });
  await store.recordContactEvent({ contactId: "ig-42", username: "ana.silva", type: "message", text: "sim", at: "2026-08-01T10:01:00.000Z" });

  const contacts = await store.listContacts();
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].username, "ana.silva");
  assert.equal(contacts[0].interactionCount, 2);
  assert.equal((await store.getContact("ig-42")).history.length, 2);
});

test("saves editable tags and notes on a known contact", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  await store.recordContactEvent({ contactId: "ig-7", username: "bia", type: "message", text: "oi", at: "2026-08-01T11:00:00.000Z" });

  await store.updateContact("ig-7", { tags: ["lead", "material"], note: "Pediu o guia de IA" });

  const contact = await store.getContact("ig-7");
  assert.deepEqual(contact.tags, ["lead", "material"]);
  assert.equal(contact.notes[0].text, "Pediu o guia de IA");
});

test("pauses and resumes automations for one contact", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  await store.recordContactEvent({ contactId: "ig-9", username: "leo", type: "message", text: "oi", at: "2026-08-01T12:00:00.000Z" });

  await store.setContactPaused("ig-9", true);
  assert.equal(await store.isContactPaused("ig-9"), true);
  await store.setContactPaused("ig-9", false);
  assert.equal(await store.isContactPaused("ig-9"), false);
});

test("persists an AI session and exposes qualification in the CRM contact", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "db.json");
  const store = new JsonStore(path);
  await store.initialize();
  await store.recordContactEvent({ contactId: "ig-ai", username: "maria", type: "comment", text: "sistema", at: "2026-08-01T12:00:00.000Z" });

  await store.startAiSession("ig-ai", { ruleId: "rule-ai", status: "active", turnCount: 0, history: [] });
  await store.updateAiSession("ig-ai", { turnCount: 1, qualification: { stage: "interested", score: 72, summary: "Quer reduzir trabalho manual." } });

  const reloaded = new JsonStore(path);
  await reloaded.initialize();
  assert.equal((await reloaded.getAiSession("ig-ai")).turnCount, 1);
  const contact = await reloaded.getContact("ig-ai");
  assert.equal(contact.aiSession.ruleId, "rule-ai");
  assert.deepEqual(contact.qualification, { stage: "interested", score: 72, summary: "Quer reduzir trabalho manual." });
});

test("replaces an existing rule and reports a missing id", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  await store.addRule({ id: "rule-1", keyword: "antes", enabled: true });

  assert.equal(await store.replaceRule("rule-1", { id: "rule-1", keyword: "depois", enabled: true }), true);
  assert.equal((await store.read()).rules[0].keyword, "depois");
  assert.equal(await store.replaceRule("missing", { id: "missing" }), false);
});
