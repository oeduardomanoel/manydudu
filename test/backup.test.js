import test from "node:test";
import assert from "node:assert/strict";
import { applyBackup, exportState, validateBackup } from "../src/domain/backup.js";
import { AppError } from "../src/util/errors.js";

const fullState = {
  rules: [{ id: "r1", keyword: "quero" }],
  events: { "evt-1": 123 },
  activity: [{ id: "a1", status: "sent" }],
  pendingDeliveries: { "user-1": { ruleId: "r1" } },
  contacts: { "user-1": { id: "user-1", tags: [] } },
  campaigns: [{ id: "c1", slug: "guia" }],
  leads: [{ id: "l1", name: "Ana" }],
  metaToken: { accessToken: "IGAALsecret", expiresAt: 123456789 },
};

test("exportState never includes metaToken", () => {
  const backup = exportState(fullState);
  assert.equal(backup.state.metaToken, undefined);
  assert.equal(JSON.stringify(backup).includes("IGAALsecret"), false);
});

test("exportState carries every other collection", () => {
  const backup = exportState(fullState);
  assert.deepEqual(backup.state.rules, fullState.rules);
  assert.deepEqual(backup.state.contacts, fullState.contacts);
  assert.deepEqual(backup.state.leads, fullState.leads);
});

test("validateBackup round-trips a valid exported backup", () => {
  const backup = exportState(fullState);
  const sanitized = validateBackup(JSON.stringify(backup));
  assert.deepEqual(sanitized.rules, fullState.rules);
  assert.deepEqual(sanitized.campaigns, fullState.campaigns);
});

test("validateBackup rejects malformed JSON", () => {
  assert.throws(() => validateBackup("{not json"), AppError);
});

test("validateBackup rejects an unknown format", () => {
  assert.throws(() => validateBackup(JSON.stringify({ format: "something-else", state: {} })), AppError);
});

test("validateBackup drops array items without a string id instead of trusting them", () => {
  const sanitized = validateBackup(JSON.stringify({ format: "manydudu-backup", state: { rules: [{ keyword: "no id" }, { id: "r2", keyword: "ok" }] } }));
  assert.deepEqual(sanitized.rules, [{ id: "r2", keyword: "ok" }]);
});

test("validateBackup rejects a wrong-typed field instead of silently coercing it", () => {
  assert.throws(() => validateBackup(JSON.stringify({ format: "manydudu-backup", state: { rules: "not an array" } })), AppError);
  assert.throws(() => validateBackup(JSON.stringify({ format: "manydudu-backup", state: { contacts: [] } })), AppError);
});

test("validateBackup sanitizes contentHtml on restored campaigns", () => {
  const sanitized = validateBackup(JSON.stringify({
    format: "manydudu-backup",
    state: { campaigns: [{ id: "c1", slug: "guia", contentHtml: '<img src=x onerror="alert(1)"><script>alert(2)</script>Oi' }] },
  }));
  assert.equal(sanitized.campaigns[0].contentHtml.includes("onerror"), false);
  assert.equal(sanitized.campaigns[0].contentHtml.includes("<script"), false);
  assert.equal(sanitized.campaigns[0].contentHtml.includes("Oi"), true);
});

test("validateBackup caps an oversized contentHtml on restored campaigns", () => {
  const sanitized = validateBackup(JSON.stringify({
    format: "manydudu-backup",
    state: { campaigns: [{ id: "c1", slug: "guia", contentHtml: "a".repeat(60_000) }] },
  }));
  assert.equal(sanitized.campaigns[0].contentHtml.length <= 50_000, true);
});

test("applyBackup replaces the state but preserves the live metaToken, ignoring any in the file", () => {
  const state = { ...structuredClone(fullState) };
  const sanitized = { rules: [{ id: "new", keyword: "novo" }], events: {}, activity: [], pendingDeliveries: {}, contacts: {}, campaigns: [], leads: [] };
  applyBackup(state, sanitized);
  assert.deepEqual(state.rules, [{ id: "new", keyword: "novo" }]);
  assert.deepEqual(state.metaToken, fullState.metaToken);
});

test("exportState carries settings (regression: restore used to wipe branding/webhook/CAPI silently)", () => {
  const stateWithSettings = { ...fullState, settings: { brandName: "Estúdio Ana", outboundWebhookUrl: "https://n8n.example.com/hook" } };
  const backup = exportState(stateWithSettings);
  assert.deepEqual(backup.state.settings, { brandName: "Estúdio Ana", outboundWebhookUrl: "https://n8n.example.com/hook" });
});

test("validateBackup runs settings through the same allowlist as PATCH /api/settings, dropping unknown keys", () => {
  const sanitized = validateBackup(JSON.stringify({
    format: "manydudu-backup",
    state: { settings: { brandName: "  Estúdio Ana  ", notARealSetting: "x" } },
  }));
  assert.equal(sanitized.settings.brandName, "Estúdio Ana");
  assert.equal("notARealSetting" in sanitized.settings, false);
});

test("validateBackup rejects a restored settings field that fails its own validation (e.g. non-https webhook)", () => {
  assert.throws(() => validateBackup(JSON.stringify({
    format: "manydudu-backup",
    state: { settings: { outboundWebhookUrl: "http://not-https.example.com" } },
  })), AppError);
});

test("applyBackup preserves settings not present in the restored file instead of wiping them", () => {
  const state = { ...structuredClone(fullState), settings: { brandName: "Nome Atual", outboundWebhookUrl: "https://ainda-configurado.example.com" } };
  const sanitized = { rules: [], events: {}, activity: [], pendingDeliveries: {}, contacts: {}, campaigns: [], leads: [], settings: { brandName: "Nome do Backup" } };
  applyBackup(state, sanitized);
  assert.equal(state.settings.brandName, "Nome do Backup");
  assert.equal(state.settings.outboundWebhookUrl, "https://ainda-configurado.example.com");
});
