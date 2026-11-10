import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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

async function withUploadServer(run) {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-uploads-"));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  const kicks = [];
  const config = { verifyToken: "", appSecret: APP_SECRET, configured: false, adminUser: "eduardo", adminPassword: ADMIN_PASSWORD, sessionSecret: SECRET, uploadsDir: join(directory, "uploads") };
  const scheduler = { kick: () => kicks.push(1) };
  const server = createServer(createApp({ store, meta: {}, config, scheduler, serveStatic: (_req, res) => { res.writeHead(404); res.end(); } }));
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    await run({ baseUrl: `http://127.0.0.1:${server.address().port}`, store, kicks, uploadsDir: config.uploadsDir });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

const jsonHeaders = () => ({ ...authedHeaders(), "Content-Type": "application/json" });

test("video upload + post creation queues a Reel and wakes the scheduler", async () => {
  await withUploadServer(async ({ baseUrl, store, kicks }) => {
    const upload = await fetch(`${baseUrl}/api/posts/upload`, { method: "POST", headers: { ...authedHeaders(), "Content-Type": "video/mp4" }, body: Buffer.from("fake-video") });
    assert.equal(upload.status, 201);
    const { uploadId, size } = await upload.json();
    assert.match(uploadId, /\.mp4$/);
    assert.equal(size, 10);
    const created = await fetch(`${baseUrl}/api/posts`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ uploadId, fileName: "reel.mp4", kind: "trial", graduationStrategy: "MANUAL", caption: "oi" }) });
    assert.equal(created.status, 201);
    assert.equal(kicks.length, 1);
    const [post] = await store.listPosts();
    assert.equal(post.kind, "trial");
    assert.equal(post.size, 10);
  });
});

test("video upload rejects non-video content, anonymous requests and unknown upload ids", async () => {
  await withUploadServer(async ({ baseUrl }) => {
    const wrongType = await fetch(`${baseUrl}/api/posts/upload`, { method: "POST", headers: { ...authedHeaders(), "Content-Type": "text/html" }, body: "<script>" });
    assert.equal(wrongType.status, 400);
    const anonymous = await fetch(`${baseUrl}/api/posts/upload`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: "x" });
    assert.equal(anonymous.status, 401);
    const missing = await fetch(`${baseUrl}/api/posts`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ uploadId: "0b9f6c2e-1d3a-4c5b-9e8f-7a6b5c4d3e2f.mp4", kind: "reel" }) });
    assert.equal(missing.status, 400);
  });
});

test("the public /reel-media link serves the video (with Range) only while its post is publishing", async () => {
  await withUploadServer(async ({ baseUrl, store }) => {
    const { uploadId } = await (await fetch(`${baseUrl}/api/posts/upload`, { method: "POST", headers: { ...authedHeaders(), "Content-Type": "video/mp4" }, body: "0123456789" })).json();
    const post = await (await fetch(`${baseUrl}/api/posts`, { method: "POST", headers: { ...jsonHeaders(), "X-Forwarded-Proto": "https", "X-Forwarded-Host": "painel.exemplo.com" },
      body: JSON.stringify({ uploadId, kind: "reel", publishAt: new Date(Date.now() + 3_600_000).toISOString() }) })).json();
    assert.equal(post.mediaBaseUrl, "https://painel.exemplo.com");
    assert.equal((await fetch(`${baseUrl}/reel-media/${uploadId}`)).status, 404);
    await store.updatePost(post.id, { status: "publishing" });
    const full = await fetch(`${baseUrl}/reel-media/${uploadId}`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("content-type"), "video/mp4");
    assert.equal(await full.text(), "0123456789");
    const partial = await fetch(`${baseUrl}/reel-media/${uploadId}`, { headers: { Range: "bytes=2-5" } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await partial.text(), "2345");
    assert.equal((await fetch(`${baseUrl}/reel-media/..%2Fdb.json`)).status, 404);
  });
});

test("cancelling a scheduled Reel removes it and its video; retry only works for failed posts", async () => {
  await withUploadServer(async ({ baseUrl, store, uploadsDir }) => {
    const { uploadId } = await (await fetch(`${baseUrl}/api/posts/upload`, { method: "POST", headers: { ...authedHeaders(), "Content-Type": "video/quicktime" }, body: "v" })).json();
    const post = await (await fetch(`${baseUrl}/api/posts`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ uploadId, kind: "reel", publishAt: new Date(Date.now() + 3_600_000).toISOString() }) })).json();
    const retryScheduled = await fetch(`${baseUrl}/api/posts/${post.id}/retry`, { method: "POST", headers: authedHeaders() });
    assert.equal(retryScheduled.status, 400);
    await store.updatePost(post.id, { status: "failed", error: "x" });
    const retry = await fetch(`${baseUrl}/api/posts/${post.id}/retry`, { method: "POST", headers: authedHeaders() });
    assert.equal(retry.status, 200);
    assert.equal((await store.getPost(post.id)).status, "scheduled");
    const cancel = await fetch(`${baseUrl}/api/posts/${post.id}`, { method: "DELETE", headers: authedHeaders() });
    assert.equal(cancel.status, 200);
    assert.deepEqual(await store.listPosts(), []);
    assert.deepEqual(await readdir(uploadsDir), []);
  });
});
