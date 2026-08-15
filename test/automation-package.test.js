import test from "node:test";
import assert from "node:assert/strict";
import { exportPackage, parsePackage } from "../src/domain/automation-package.js";
import { AppError } from "../src/util/errors.js";

const rule = { id: "r1", mediaId: "media-1", mediaTitle: "Reel X", name: "Enviar catálogo", keyword: "quero",
  match: "contains", reply: "Já te mando!", publicReplies: [], responseMode: "private", enabled: true,
  followUpEnabled: false, journey: [{ type: "trigger" }], createdAt: "2026-01-01T00:00:00.000Z" };

test("exportPackage strips id/mediaId/journey/timestamps, keeps portable fields", () => {
  const pkg = exportPackage(rule, null);
  assert.equal(pkg.format, "manydudu-automation-package");
  assert.equal(pkg.rule.keyword, "quero");
  assert.equal(pkg.rule.id, undefined);
  assert.equal(pkg.rule.mediaId, undefined);
  assert.equal(pkg.rule.journey, undefined);
  assert.equal(pkg.campaign, null);
});

test("exportPackage includes campaign when given", () => {
  const campaign = { id: "c1", slug: "guia-x", title: "Guia X", contentHtml: "<p>x</p>", active: true };
  const pkg = exportPackage(rule, campaign);
  assert.equal(pkg.campaign.title, "Guia X");
  assert.equal(pkg.campaign.slug, undefined);
  assert.equal(pkg.campaign.id, undefined);
});

test("parsePackage round-trips a valid exported package", () => {
  const pkg = exportPackage(rule, { title: "Guia", contentHtml: "<p>x</p>", active: true });
  const parsed = parsePackage(JSON.stringify(pkg));
  assert.equal(parsed.rule.keyword, "quero");
  assert.equal(parsed.campaign.title, "Guia");
});

test("parsePackage rejects malformed JSON", () => {
  assert.throws(() => parsePackage("{not json"), AppError);
});

test("parsePackage rejects an unknown format", () => {
  assert.throws(() => parsePackage(JSON.stringify({ format: "something-else", rule: {} })), AppError);
});

test("parsePackage rejects a package without a rule", () => {
  assert.throws(() => parsePackage(JSON.stringify({ format: "manydudu-automation-package" })), AppError);
});
