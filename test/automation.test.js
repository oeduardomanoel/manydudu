import test from "node:test";
import assert from "node:assert/strict";
import { createRule, findMatchingRule, personalize, selectPublicReply, suggestKeywords, updateRule } from "../src/domain/automation.js";

const rules = [
  { id: "1", keyword: "quero", match: "contains", enabled: true },
  { id: "2", keyword: "preco", match: "exact", enabled: true },
];

test("matches accents and casing", () => {
  assert.equal(findMatchingRule("Eu QUERO o catálogo", rules)?.id, "1");
});

test("exact rule does not match a sentence", () => {
  assert.equal(findMatchingRule("qual o preço?", rules)?.id, undefined);
});

test("ignores disabled rules", () => {
  assert.equal(findMatchingRule("oi", [{ id: "3", keyword: "oi", enabled: false }]), undefined);
});

test("matches a media-specific rule only on its Reel", () => {
  const mediaRules = [{ id: "4", keyword: "quero", match: "contains", enabled: true, mediaId: "reel-1" }];
  assert.equal(findMatchingRule("quero", mediaRules, "reel-1")?.id, "4");
  assert.equal(findMatchingRule("quero", mediaRules, "reel-2"), undefined);
});

test("global rule matches comments from any Reel", () => {
  const globalRules = [{ id: "5", keyword: "material", match: "contains", enabled: true, mediaId: null }];
  assert.equal(findMatchingRule("manda o material", globalRules, "reel-9")?.id, "5");
});

test("creates a private reply flow with a secure delivery link", () => {
  const rule = createRule({ keyword: "quero", reply: "Responda OK", match: "contains", responseMode: "private",
    followUpEnabled: true, followUpText: "Aqui está seu material:", followUpUrl: "https://example.com/guia" });
  assert.equal(rule.followUpUrl, "https://example.com/guia");
  assert.equal(rule.followUpEnabled, true);
});

test("rejects an insecure delivery link", () => {
  assert.throws(() => createRule({ keyword: "quero", reply: "Responda OK", match: "contains", responseMode: "private",
    followUpEnabled: true, followUpText: "Material", followUpUrl: "javascript:alert(1)" }), /HTTPS/);
});

test("creates a delivery flow that requires following the account", () => {
  const rule = createRule({ keyword: "quero", reply: "Responda OK", match: "contains", responseMode: "private",
    followUpEnabled: true, followUpText: "Seu material", followUpUrl: "https://example.com/guia",
    requireFollow: true, followPrompt: "Siga o perfil e responda novamente.", profileUrl: "https://instagram.com/example/",
    followButtonTitle: "SEGUIR PERFIL", confirmFollowTitle: "JÁ SEGUI" });
  assert.equal(rule.requireFollow, true);
  assert.equal(rule.followPrompt, "Siga o perfil e responda novamente.");
});

test("requires a follow prompt when the follower gate is enabled", () => {
  assert.throws(() => createRule({ keyword: "quero", reply: "Responda OK", match: "contains", responseMode: "private",
    followUpEnabled: true, followUpText: "Seu material", followUpUrl: "https://example.com/guia", requireFollow: true }), /siga/);
});

test("creates a link delivery using a button template", () => {
  const rule = createRule({ keyword: "quero", reply: "Responda OK", match: "contains", responseMode: "private",
    followUpEnabled: true, followUpText: "Aqui está seu material", followUpUrl: "https://example.com/guia",
    deliveryStyle: "button", buttonTitle: "ACESSAR MATERIAL" });
  assert.equal(rule.deliveryStyle, "button");
  assert.equal(rule.buttonTitle, "ACESSAR MATERIAL");
});

test("rejects a button without a title", () => {
  assert.throws(() => createRule({ keyword: "quero", reply: "Responda OK", match: "contains", responseMode: "private",
    followUpEnabled: true, followUpText: "Aqui está", followUpUrl: "https://example.com", deliveryStyle: "button" }), /botão/);
});

test("configures an opening quick reply and follower gate buttons", () => {
  const rule = createRule({ keyword: "quero", reply: "Quer receber?", match: "contains", responseMode: "private",
    followUpEnabled: true, followUpText: "Seu material", followUpUrl: "https://example.com", deliveryStyle: "button",
    buttonTitle: "ABRIR", initialQuickReplyEnabled: true, initialQuickReplyTitle: "SIM, QUERO",
    requireFollow: true, followPrompt: "Siga e confirme.", profileUrl: "https://www.instagram.com/example/",
    followButtonTitle: "SEGUIR PERFIL", confirmFollowTitle: "JÁ SEGUI" });
  assert.equal(rule.initialQuickReplyTitle, "SIM, QUERO");
  assert.equal(rule.profileUrl, "https://www.instagram.com/example/");
  assert.equal(rule.confirmFollowTitle, "JÁ SEGUI");
});

test("updates a rule while preserving its identity and enabled state", () => {
  const existing = { id: "rule-42", createdAt: "2026-08-01T10:00:00.000Z", enabled: false, keyword: "antiga" };
  const updated = updateRule(existing, { name: "Novo nome", keyword: "nova", reply: "Nova resposta",
    match: "exact", responseMode: "public" });

  assert.equal(updated.id, "rule-42");
  assert.equal(updated.createdAt, "2026-08-01T10:00:00.000Z");
  assert.equal(updated.enabled, false);
  assert.equal(updated.keyword, "nova");
  assert.equal(updated.name, "Novo nome");
});

test("creates a combined public and private reply flow with up to ten public alternatives", () => {
  const rule = createRule({ keyword: "quero", reply: "Responda SIM para receber", match: "contains", responseMode: "both",
    publicReplies: ["Te chamei no direct.", "Acabei de enviar para você.", "Confere suas solicitações."],
    followUpEnabled: true, followUpText: "Aqui está", followUpUrl: "https://example.com/material" });

  assert.equal(rule.responseMode, "both");
  assert.deepEqual(rule.publicReplies, ["Te chamei no direct.", "Acabei de enviar para você.", "Confere suas solicitações."]);
  assert.deepEqual(rule.journey.map((step) => step.title).slice(1, 3), ["Resposta pública", "Mensagem privada"]);
});

test("rotates public replies without exceeding the configured alternatives", () => {
  const rule = { publicReplies: ["Resposta A", "Resposta B", "Resposta C"] };

  assert.equal(selectPublicReply(rule, 0), "Resposta A");
  assert.equal(selectPublicReply(rule, 1), "Resposta B");
  assert.equal(selectPublicReply(rule, 3), "Resposta A");
});

test("rejects combined mode without a public reply and more than ten alternatives", () => {
  assert.throws(() => createRule({ keyword: "quero", reply: "DM", match: "contains", responseMode: "both" }), /resposta pública/i);
  assert.throws(() => createRule({ keyword: "quero", reply: "DM", match: "contains", responseMode: "both",
    publicReplies: Array.from({ length: 11 }, (_, index) => `Resposta ${index + 1}`) }), /10/);
});

test("suggestKeywords groups repeated ignored comments and sorts by frequency", () => {
  const activity = [
    { text: "quanto custa?", status: "ignored", at: "2026-01-01T10:00:00.000Z" },
    { text: "Quanto Custa?", status: "ignored", at: "2026-01-01T11:00:00.000Z" },
    { text: "tem desconto", status: "ignored", at: "2026-01-01T09:00:00.000Z" },
    { text: "tem desconto", status: "ignored", at: "2026-01-01T12:00:00.000Z" },
    { text: "tem desconto", status: "ignored", at: "2026-01-01T13:00:00.000Z" },
  ];
  const suggestions = suggestKeywords(activity, { minCount: 2 });
  assert.deepEqual(suggestions.map((s) => s.text), ["tem desconto", "quanto custa?"]);
  assert.equal(suggestions[0].count, 3);
  assert.equal(suggestions[0].sample, "tem desconto");
});

test("suggestKeywords excludes human_takeover and non-ignored events", () => {
  const activity = [
    { text: "oi", status: "ignored", reason: "human_takeover", at: "2026-01-01T10:00:00.000Z" },
    { text: "oi", status: "ignored", reason: "human_takeover", at: "2026-01-01T11:00:00.000Z" },
    { text: "quero", status: "sent", at: "2026-01-01T10:00:00.000Z" },
  ];
  assert.deepEqual(suggestKeywords(activity, { minCount: 1 }), []);
});

test("suggestKeywords respects the limit option", () => {
  const activity = Array.from({ length: 5 }, (_, index) => ([
    { text: `palavra${index}`, status: "ignored", at: "2026-01-01T10:00:00.000Z" },
    { text: `palavra${index}`, status: "ignored", at: "2026-01-01T11:00:00.000Z" },
  ])).flat();
  assert.equal(suggestKeywords(activity, { minCount: 2, limit: 3 }).length, 3);
});

test("personalize fills {nome} with the @username and {palavra} with the keyword", () => {
  assert.equal(personalize("Oi {nome}, segue o {palavra}!", { username: "ana", keyword: "CRM" }), "Oi @ana, segue o CRM!");
  assert.equal(personalize("{NOME} {Palavra}", { username: "@bia", keyword: " ia " }), "@bia ia");
});

test("personalize drops {nome} cleanly when the username is unknown", () => {
  assert.equal(personalize("Oi {nome}! Te mandei", { keyword: "x" }), "Oi! Te mandei");
  assert.equal(personalize(undefined, {}), "");
});

test("multi-word keywords match regardless of spacing", () => {
  const rules = [{ id: "r", keyword: "reel pronto", match: "contains", enabled: true }];
  for (const text of ["REEL PRONTO", "reelpronto", "Reel  pronto!", "quero o réel prónto"]) assert.equal(findMatchingRule(text, rules)?.id, "r", text);
  assert.equal(findMatchingRule("pronto", rules), undefined);
  assert.equal(findMatchingRule("reel  pronto", [{ id: "e", keyword: "Reel Pronto", match: "exact", enabled: true }])?.id, "e");
});
