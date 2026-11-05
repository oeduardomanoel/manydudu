import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createLead, DEFAULT_INTEREST_LABEL, DEFAULT_NICHES, updateCampaign } from "../src/domain/campaigns.js";
import { AppError } from "../src/util/errors.js";

test("createCampaign slugifies the title when no slug is given", () => {
  const campaign = createCampaign({ title: "Guia de Automação para Reels", contentHtml: "<p>x</p>" });
  assert.equal(campaign.slug, "guia-de-automacao-para-reels");
  assert.equal(campaign.active, true);
});

test("createCampaign rejects a missing title", () => {
  assert.throws(() => createCampaign({ contentHtml: "<p>x</p>" }), AppError);
});

test("createCampaign rejects missing content", () => {
  assert.throws(() => createCampaign({ title: "Guia" }), AppError);
});

test("createCampaign rejects an invalid custom slug", () => {
  assert.throws(() => createCampaign({ title: "Guia", slug: "a", contentHtml: "<p>x</p>" }), AppError);
});

test("createCampaign falls back to the default niches and interest label when not given", () => {
  const campaign = createCampaign({ title: "Guia", contentHtml: "<p>x</p>" });
  assert.deepEqual(campaign.niches, DEFAULT_NICHES);
  assert.equal(campaign.interestLabel, DEFAULT_INTEREST_LABEL);
});

test("createCampaign accepts a custom niche list and always keeps an Outro option", () => {
  const campaign = createCampaign({ title: "Guia", contentHtml: "<p>x</p>", niches: ["Imóveis", "Consórcio"] });
  assert.deepEqual(campaign.niches, ["Imóveis", "Consórcio", "Outro"]);
});

test("createCampaign doesn't duplicate Outro if the admin already included it", () => {
  const campaign = createCampaign({ title: "Guia", contentHtml: "<p>x</p>", niches: ["Fitness", "Outro"] });
  assert.deepEqual(campaign.niches, ["Fitness", "Outro"]);
});

test("createCampaign accepts a custom interest label", () => {
  const campaign = createCampaign({ title: "Guia", contentHtml: "<p>x</p>", interestLabel: "O que você mais precisa resolver agora?" });
  assert.equal(campaign.interestLabel, "O que você mais precisa resolver agora?");
});

test("createCampaign rejects an interest label that's too long", () => {
  assert.throws(() => createCampaign({ title: "Guia", contentHtml: "<p>x</p>", interestLabel: "a".repeat(201) }), AppError);
});

test("updateCampaign preserves a custom niche list and interest label", () => {
  const existing = createCampaign({ title: "Guia", contentHtml: "<p>x</p>", niches: ["Fitness"], interestLabel: "Qual seu objetivo?" });
  const updated = updateCampaign(existing, { title: "Guia", contentHtml: "<p>x</p>", niches: existing.niches, interestLabel: existing.interestLabel });
  assert.deepEqual(updated.niches, ["Fitness", "Outro"]);
  assert.equal(updated.interestLabel, "Qual seu objetivo?");
});

test("updateCampaign keeps the original slug and id", () => {
  const existing = createCampaign({ title: "Guia", contentHtml: "<p>x</p>" });
  const updated = updateCampaign(existing, { title: "Guia Atualizado", contentHtml: "<p>novo</p>", active: false });
  assert.equal(updated.slug, existing.slug);
  assert.equal(updated.id, existing.id);
  assert.equal(updated.title, "Guia Atualizado");
  assert.equal(updated.active, false);
});

test("createLead requires all core fields", () => {
  assert.throws(() => createLead({}, "guia"), AppError);
  assert.throws(() => createLead({ name: "Ana" }, "guia"), AppError);
});

test("createLead requires a description when niche is Outro", () => {
  const input = { name: "Ana", whatsapp: "11999999999", email: "ana@x.com", niches: ["Outro"], automationInterest: "y", consent: true };
  assert.throws(() => createLead(input, "guia"), AppError);
  const lead = createLead({ ...input, nicheOther: "Pet shop" }, "guia");
  assert.equal(lead.nicheOther, "Pet shop");
});

test("createLead rejects an invalid email", () => {
  const input = { name: "Ana", whatsapp: "11999999999", email: "não-é-email", niches: ["Educação"], automationInterest: "y", consent: true };
  assert.throws(() => createLead(input, "guia"), AppError);
});

test("createLead rejects a submission without consent", () => {
  const input = { name: "Ana", whatsapp: "11999999999", email: "ana@x.com", niches: ["Educação"], automationInterest: "y" };
  assert.throws(() => createLead(input, "guia"), AppError);
});

test("createLead ignores nicheOther when Outro isn't selected", () => {
  const lead = createLead({ name: "Ana", whatsapp: "11999999999", email: "ana@x.com", niches: ["Educação"], nicheOther: "ignorado", automationInterest: "y", consent: true }, "guia");
  assert.equal(lead.nicheOther, "");
});

test("createLead rejects a WhatsApp without enough digits and accepts a formatted one", () => {
  const input = { name: "Ana", email: "ana@x.com", niches: ["Educação"], automationInterest: "y", consent: true };
  assert.throws(() => createLead({ ...input, whatsapp: "12345" }, "guia"), AppError);
  assert.throws(() => createLead({ ...input, whatsapp: "meu zap" }, "guia"), AppError);
  assert.equal(createLead({ ...input, whatsapp: "(11) 91234-5678" }, "guia").whatsapp, "(11) 91234-5678");
  assert.equal(createLead({ ...input, whatsapp: "+351 912 345 678" }, "guia").whatsapp, "+351 912 345 678");
});

test("createCampaign keeps subtitle, benefits (from a list or one per line) and an https call-to-action", () => {
  const campaign = createCampaign({ title: "Guia", contentHtml: "<p>x</p>", subtitle: "  Leva 1 minuto  ", benefits: "10 prompts\n\n Passo a passo ",
    ctaLabel: "Falar no WhatsApp", ctaUrl: "https://wa.me/5511999999999" });
  assert.equal(campaign.subtitle, "Leva 1 minuto");
  assert.deepEqual(campaign.benefits, ["10 prompts", "Passo a passo"]);
  assert.equal(campaign.ctaLabel, "Falar no WhatsApp");
  assert.equal(campaign.ctaUrl, "https://wa.me/5511999999999");
  assert.deepEqual(createCampaign({ title: "Guia", contentHtml: "<p>x</p>", benefits: ["a", " ", "b"] }).benefits, ["a", "b"]);
});

test("createCampaign defaults the new optional fields to empty", () => {
  const campaign = createCampaign({ title: "Guia", contentHtml: "<p>x</p>" });
  assert.equal(campaign.subtitle, "");
  assert.deepEqual(campaign.benefits, []);
  assert.equal(campaign.ctaLabel, "");
  assert.equal(campaign.ctaUrl, "");
});

test("createCampaign rejects too many benefits, a half-filled call-to-action and a non-http link", () => {
  const base = { title: "Guia", contentHtml: "<p>x</p>" };
  assert.throws(() => createCampaign({ ...base, benefits: ["1", "2", "3", "4", "5", "6"] }), AppError);
  assert.throws(() => createCampaign({ ...base, ctaLabel: "Falar" }), AppError);
  assert.throws(() => createCampaign({ ...base, ctaUrl: "https://x.com" }), AppError);
  assert.throws(() => createCampaign({ ...base, ctaLabel: "Falar", ctaUrl: "javascript:alert(1)" }), AppError);
});

test("updateCampaign updates the new optional fields", () => {
  const existing = createCampaign({ title: "Guia", contentHtml: "<p>x</p>", subtitle: "antes" });
  const updated = updateCampaign(existing, { title: "Guia", contentHtml: "<p>x</p>", subtitle: "depois", benefits: ["um"], ctaLabel: "Ir", ctaUrl: "https://x.com" });
  assert.equal(updated.subtitle, "depois");
  assert.deepEqual(updated.benefits, ["um"]);
  assert.equal(updated.ctaUrl, "https://x.com");
});
