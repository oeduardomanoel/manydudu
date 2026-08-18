import test from "node:test";
import assert from "node:assert/strict";
import { renderContentPage, renderGatePage, renderNotFound } from "../src/pages/gate.js";

const campaign = { title: "Guia de Automação", slug: "guia", contentHtml: "<p>Conteúdo</p>", niches: [], interestLabel: "" };

test("renderGatePage falls back to a generic brand name and the default theme when settings are empty", () => {
  const html = renderGatePage(campaign, {});
  assert.match(html, /Minha Marca/);
  assert.match(html, /href="\/theme\.css"/);
  assert.equal(html.includes("gate-handle"), false);
});

test("renderGatePage uses the configured brand name, handle and template", () => {
  const html = renderGatePage(campaign, { brandName: "Estúdio Ana", brandHandle: "estudioana", brandTemplate: "azul" });
  assert.match(html, /Estúdio Ana/);
  assert.match(html, /@estudioana/);
  assert.match(html, /href="\/theme-azul\.css"/);
});

test("renderGatePage ignores an unknown template and falls back to the default theme file", () => {
  const html = renderGatePage(campaign, { brandTemplate: "inexistente" });
  assert.match(html, /href="\/theme\.css"/);
});

test("renderContentPage only shows the Instagram follow link when a handle is set", () => {
  const withHandle = renderContentPage(campaign, { brandHandle: "estudioana" });
  assert.match(withHandle, /Seguir @estudioana/);
  const withoutHandle = renderContentPage(campaign, {});
  assert.equal(withoutHandle.includes("Seguir @"), false);
});

test("renderNotFound never throws on empty settings", () => {
  assert.doesNotThrow(() => renderNotFound({}));
  assert.doesNotThrow(() => renderNotFound());
});
