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

test("renderGatePage shows the subtitle and the benefits list, escaped", () => {
  const html = renderGatePage({ ...campaign, subtitle: "Leva <1 minuto>", benefits: ["10 prompts", "<b>bônus</b>"] }, {});
  assert.match(html, /Leva &lt;1 minuto&gt;/);
  assert.match(html, /O que você vai receber/);
  assert.match(html, /<li>&lt;b&gt;bônus&lt;\/b&gt;<\/li>/);
});

test("renderGatePage hides the benefits block when there are none and uses mobile-friendly inputs", () => {
  const html = renderGatePage(campaign, {});
  assert.equal(html.includes("gate-benefits"), false);
  assert.match(html, /name="whatsapp" type="tel" inputmode="tel"/);
  assert.match(html, /autocomplete="email"/);
  assert.equal((html.match(/class="gate-step/g) || []).length, 5);
});

test("renderGatePage marks the form as a preview only when asked", () => {
  assert.equal(renderGatePage(campaign, {}).includes("data-preview"), false);
  assert.match(renderGatePage(campaign, {}, { preview: true }), /data-preview="1"/);
});

test("renderContentPage builds a table of contents only with 3 or more H2 headings", () => {
  const three = renderContentPage({ ...campaign, contentHtml: "<h2>Um</h2><p>a</p><h2>Dois &amp; <b>três</b></h2><h2>Quatro</h2>" }, {});
  assert.match(three, /class="gate-toc"/);
  assert.match(three, /<h2 id="parte-2">Dois &amp; <b>três<\/b><\/h2>/);
  assert.match(three, /<a href="#parte-2">Dois &amp; três<\/a>/);
  const two = renderContentPage({ ...campaign, contentHtml: "<h2>Um</h2><h2>Dois</h2>" }, {});
  assert.equal(two.includes("gate-toc"), false);
});

test("renderContentPage renders the call-to-action only with an http(s) link", () => {
  const withCta = renderContentPage({ ...campaign, ctaLabel: "Falar no WhatsApp", ctaUrl: "https://wa.me/55119" }, {});
  assert.match(withCta, /class="primary gate-cta" href="https:\/\/wa\.me\/55119"/);
  const unsafe = renderContentPage({ ...campaign, ctaLabel: "Clique", ctaUrl: "javascript:alert(1)" }, {});
  assert.equal(unsafe.includes("gate-cta"), false);
});
