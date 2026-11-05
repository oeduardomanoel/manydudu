import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { JsonStore } from "../src/storage/json-store.js";
import { createSessionCookie, createCsrfCookie, parseCookies } from "../src/auth.js";

const SECRET = "test-secret-with-plenty-of-entropy-for-hmac";
const ADMIN_PASSWORD = "senha-forte-123";
const APP_SECRET = "app-secret-for-tests";

async function withServer(run) {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-routes-"));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  const config = { verifyToken: "", appSecret: APP_SECRET, configured: false, adminUser: "eduardo", adminPassword: ADMIN_PASSWORD, sessionSecret: SECRET };
  const server = createServer(createApp({ store, meta: {}, config, serveStatic: (_req, res) => { res.writeHead(404); res.end(); } }));
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

function authedHeaders() {
  const sessionToken = parseCookies(createSessionCookie("eduardo", SECRET, { headers: {} }, ADMIN_PASSWORD)).md_session;
  const csrfToken = parseCookies(createCsrfCookie({ headers: {} })).md_csrf;
  return { Cookie: `md_session=${sessionToken}; md_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken };
}

function signRequest(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

test("DELETE /api/contacts/:id actually removes the contact (data-deletion right)", async () => {
  await withServer(async ({ baseUrl, store }) => {
    await store.recordContactEvent({ contactId: "user-1", username: "ana", type: "message", text: "oi", at: new Date().toISOString() });
    const res = await fetch(`${baseUrl}/api/contacts/user-1`, { method: "DELETE", headers: authedHeaders() });
    assert.equal(res.status, 200);
    assert.equal(await store.getContact("user-1"), null);
  });
});

test("DELETE /api/leads/:id removes only the targeted lead", async () => {
  await withServer(async ({ baseUrl, store }) => {
    await store.addLead({ id: "lead-1", name: "Ana", campaignSlug: "x" });
    await store.addLead({ id: "lead-2", name: "Bea", campaignSlug: "x" });
    const res = await fetch(`${baseUrl}/api/leads/lead-1`, { method: "DELETE", headers: authedHeaders() });
    assert.equal(res.status, 200);
    const leads = await store.listLeads();
    assert.deepEqual(leads.map((lead) => lead.id), ["lead-2"]);
  });
});

test("DELETE routes require auth like every other admin route", async () => {
  await withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/contacts/user-1`, { method: "DELETE" });
    assert.equal(res.status, 401);
  });
});

test("POST /api/meta/data-deletion is reachable without a session (Meta calls it directly)", async () => {
  await withServer(async ({ baseUrl, store }) => {
    await store.recordContactEvent({ contactId: "77", username: "ana", type: "message", text: "oi", at: new Date().toISOString() });
    const signedRequest = signRequest({ algorithm: "HMAC-SHA256", user_id: "77" }, APP_SECRET);
    const res = await fetch(`${baseUrl}/api/meta/data-deletion`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ signed_request: signedRequest }).toString(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.confirmation_code, "string");
    assert.match(body.url, /^https:\/\//);
    assert.equal(await store.getContact("77"), null);
  });
});

test("POST /api/meta/data-deletion rejects a signed_request from a different app secret", async () => {
  await withServer(async ({ baseUrl }) => {
    const signedRequest = signRequest({ algorithm: "HMAC-SHA256", user_id: "77" }, "wrong-secret");
    const res = await fetch(`${baseUrl}/api/meta/data-deletion`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ signed_request: signedRequest }).toString(),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/campaigns/preview renders the unsaved form and content pages for the admin only", async () => {
  await withServer(async ({ baseUrl, store }) => {
    const body = JSON.stringify({ title: "Rascunho", contentHtml: "<p>conteúdo <script>x</script></p>", benefits: ["um"], view: "form" });
    const unauth = await fetch(`${baseUrl}/api/campaigns/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(unauth.status, 401);
    const form = await (await fetch(`${baseUrl}/api/campaigns/preview`, { method: "POST", headers: { ...authedHeaders(), "Content-Type": "application/json" }, body })).json();
    assert.match(form.html, /data-preview="1"/);
    assert.match(form.html, /Rascunho/);
    const content = await (await fetch(`${baseUrl}/api/campaigns/preview`, { method: "POST", headers: { ...authedHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ title: "", view: "content", contentHtml: "<p>conteúdo <script>x</script></p>" }) })).json();
    assert.match(content.html, /Título da campanha/);
    assert.match(content.html, /<p>conteúdo <\/p>/);
    assert.deepEqual(await store.listCampaigns(), []);
  });
});

test("POST /api/campaigns/preview reports validation errors instead of rendering", async () => {
  await withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/campaigns/preview`, { method: "POST", headers: { ...authedHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ title: "x", ctaLabel: "Ir" }) });
    assert.equal(res.status, 400);
  });
});
