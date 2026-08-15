import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createLead, updateCampaign } from "../src/domain/campaigns.js";
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
  const input = { name: "Ana", whatsapp: "11999999999", email: "ana@x.com", niches: ["Outro"], automationInterest: "y" };
  assert.throws(() => createLead(input, "guia"), AppError);
  const lead = createLead({ ...input, nicheOther: "Pet shop" }, "guia");
  assert.equal(lead.nicheOther, "Pet shop");
});

test("createLead rejects an invalid email", () => {
  const input = { name: "Ana", whatsapp: "11999999999", email: "não-é-email", niches: ["Educação"], automationInterest: "y" };
  assert.throws(() => createLead(input, "guia"), AppError);
});

test("createLead ignores nicheOther when Outro isn't selected", () => {
  const lead = createLead({ name: "Ana", whatsapp: "11999999999", email: "ana@x.com", niches: ["Educação"], nicheOther: "ignorado", automationInterest: "y" }, "guia");
  assert.equal(lead.nicheOther, "");
});
