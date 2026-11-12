import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicMaterials, renderMaterialsPage } from "../src/pages/materials.js";
import { createApp } from "../src/app.js";
import { JsonStore } from "../src/storage/json-store.js";

const secretCampaign = {
  id: "id-interno-123", slug: "prompt-crm", title: "Prompt pro <CRM>", subtitle: "3 prompts", active: true, createdAt: "2026-11-10T12:00:00Z",
  benefits: ["Diagnóstico", "Follow-up", "Checklist", "Quarto item"], contentHtml: "<p>CONTEUDO-SECRETO-LIBERADO</p>",
  visits: 999, niches: ["Estética"], interestLabel: "Pergunta interna", ctaUrl: "https://wa.me/5511999999999",
};

test("publicMaterials keeps only active campaigns and only public fields, newest first", () => {
  const list = publicMaterials([
    secretCampaign,
    { slug: "rascunho", title: "Pausada", active: false, createdAt: "2026-11-11T12:00:00Z" },
    { slug: "antiga", title: "Antiga", active: true, createdAt: "2026-10-01T12:00:00Z" },
    { slug: "../../admin", title: "Slug ruim", active: true },
  ]);
  assert.deepEqual(list.map((item) => item.slug), ["prompt-crm", "antiga"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["benefits", "createdAt", "slug", "subtitle", "title"]);
  assert.equal(list[0].benefits.length, 3);
});

test("the rendered page never contains gated content, ids, visits, leads or private settings, and escapes text", () => {
  const html = renderMaterialsPage([secretCampaign], { brandName: "Eduardo", brandHandle: "eduardosantos.ia", metaCapiToken: "TOKEN-CAPI-SECRETO", outboundWebhookUrl: "https://n8n.interno/x" });
  for (const secret of ["CONTEUDO-SECRETO-LIBERADO", "id-interno-123", "999", "Pergunta interna", "wa.me", "TOKEN-CAPI-SECRETO", "n8n.interno"]) {
    assert.equal(html.includes(secret), false, secret);
  }
  assert.match(html, /Prompt pro &lt;CRM&gt;/);
  assert.match(html, /href="\/c\/prompt-crm"/);
  assert.match(html, /@eduardosantos\.ia/);
});

test("GET /materiais and /blog are public, cached briefly, and list only what is active", async () => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-materials-"));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  await store.addCampaign(secretCampaign);
  await store.addCampaign({ ...secretCampaign, slug: "pausada", title: "Campanha pausada", active: false });
  const config = { verifyToken: "", appSecret: "x", configured: false, adminUser: "a", adminPassword: "b", sessionSecret: "test-secret-with-plenty-of-entropy-for-hmac" };
  const server = createServer(createApp({ store, meta: {}, config, serveStatic: (_req, res) => { res.writeHead(404); res.end(); } }));
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ["/materiais", "/blog", "/materiais/"]) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get("cache-control"), /max-age=60/);
      assert.match(res.headers.get("content-security-policy"), /script-src 'self'/);
      const body = await res.text();
      assert.match(body, /Prompt pro &lt;CRM&gt;/);
      assert.equal(body.includes("Campanha pausada"), false);
      assert.equal(body.includes("CONTEUDO-SECRETO-LIBERADO"), false);
    }
    assert.equal((await fetch(`${baseUrl}/materiais/qualquer-coisa`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
