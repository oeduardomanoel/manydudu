import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { verifyPasswordHash } from "../src/auth.js";

function startTestServer(config) {
  const server = createServer(createApp({ store: { getSettings: async () => ({}) }, meta: {}, config, serveStatic: (_req, res) => { res.writeHead(404); res.end(); } }));
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function withServer(config, run) {
  const { server, baseUrl } = await startTestServer(config);
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function startFakeSupabase(status) {
  const server = createServer((_req, res) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end("{}"); });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function baseConfig(overrides = {}) {
  return {
    verifyToken: "", appSecret: "", configured: false, adminUser: "eduardo", adminPassword: "",
    sessionSecret: "test-secret-with-plenty-of-entropy-for-hmac", setupToken: randomBytes(24).toString("hex"),
    envPath: join(tmpdir(), `manydudu-setup-test-${randomUUID()}.env`),
    ...overrides,
  };
}

test("GET /setup is reachable with the correct token when no admin password is set", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/setup?token=${config.setupToken}`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Configuração inicial/);
  });
});

test("GET /setup returns 404 with a wrong token", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/setup?token=wrong`);
    assert.equal(res.status, 404);
  });
});

test("GET /setup returns 404 with no token at all", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/setup`);
    assert.equal(res.status, 404);
  });
});

test("/setup always returns 404 once an admin password exists, even if a stale token from before it was set is reused", async () => {
  const staleToken = randomBytes(24).toString("hex");
  const config = baseConfig({ adminPassword: "already-set", setupToken: staleToken });
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/setup?token=${staleToken}`);
    assert.equal(res.status, 404);
    const apiRes = await fetch(`${baseUrl}/api/setup/complete?token=${staleToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(apiRes.status, 404);
  });
});

test("POST /api/setup/complete writes the env file and returns a fresh verify token", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const body = { adminUser: "eduardo", adminPassword: "senha-forte-123", metaAccessToken: "IGAALtest", metaAppId: "999888777", metaAppSecret: "secret", instagramAccountId: "12345" };
    const res = await fetch(`${baseUrl}/api/setup/complete?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.ok, true);
    assert.equal(typeof result.metaVerifyToken, "string");
    const written = await readFile(config.envPath, "utf8");
    assert.match(written, /^ADMIN_USER=eduardo$/m);
    // the wizard must never write the plaintext password to disk — only a scrypt hash
    assert.doesNotMatch(written, /^ADMIN_PASSWORD=senha-forte-123$/m);
    const [, storedHash] = /^ADMIN_PASSWORD=(scrypt:[0-9a-f]+:[0-9a-f]+)$/m.exec(written) ?? [];
    assert.ok(storedHash, `expected a scrypt hash in .env, got: ${written}`);
    assert.equal(verifyPasswordHash("senha-forte-123", storedHash), true);
    assert.equal(verifyPasswordHash("senha-errada", storedHash), false);
    assert.match(written, /^SESSION_SECRET=[0-9a-f]{64}$/m);
    assert.match(written, /^META_ACCESS_TOKEN=IGAALtest$/m);
    assert.match(written, /^META_APP_ID=999888777$/m);
    await rm(config.envPath);
  });
});

test("POST /api/setup/complete rejects a short password without writing anything", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const body = { adminUser: "eduardo", adminPassword: "short", metaAccessToken: "x", metaAppId: "1", metaAppSecret: "y", instagramAccountId: "1" };
    const res = await fetch(`${baseUrl}/api/setup/complete?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(res.status, 400);
    await assert.rejects(readFile(config.envPath));
  });
});

test("POST /api/setup/complete uses the admin's own verify token instead of generating a new one", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const body = { adminUser: "eduardo", adminPassword: "senha-forte-123", metaAccessToken: "IGAALtest", metaAppId: "1", metaAppSecret: "secret", instagramAccountId: "12345", metaVerifyToken: "meu-token-escolhido" };
    const res = await fetch(`${baseUrl}/api/setup/complete?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.metaVerifyToken, "meu-token-escolhido");
    const written = await readFile(config.envPath, "utf8");
    assert.match(written, /^META_VERIFY_TOKEN=meu-token-escolhido$/m);
    await rm(config.envPath);
  });
});

test("POST /api/setup/complete rejects missing App ID (needed to build the app token for debug_token)", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const body = { adminUser: "eduardo", adminPassword: "senha-forte-123", metaAccessToken: "x", metaAppSecret: "y", instagramAccountId: "1" };
    const res = await fetch(`${baseUrl}/api/setup/complete?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(res.status, 400);
    await assert.rejects(readFile(config.envPath));
  });
});

test("POST /api/setup/complete rejects mismatched Supabase fields (one filled, one empty)", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const body = { adminUser: "eduardo", adminPassword: "senha-forte-123", metaAccessToken: "x", metaAppId: "1", metaAppSecret: "y", instagramAccountId: "1", supabaseUrl: "https://x.supabase.co" };
    const res = await fetch(`${baseUrl}/api/setup/complete?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(res.status, 400);
  });
});

test("POST /api/setup/complete closes the setup window immediately, without waiting for a restart", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const body = { adminUser: "eduardo", adminPassword: "senha-forte-123", metaAccessToken: "x", metaAppId: "1", metaAppSecret: "y", instagramAccountId: "1" };
    const first = await fetch(`${baseUrl}/api/setup/complete?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(first.status, 200);
    const second = await fetch(`${baseUrl}/api/setup/complete?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(second.status, 404);
    await rm(config.envPath);
  });
});

test("POST /api/setup/test-meta requires the App ID and App Secret before attempting to validate the token", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/setup/test-meta?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metaAccessToken: "IGAALtest" }) });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /App ID e o App Secret/);
  });
});

test("setup API routes are unreachable (404) once adminPassword is already configured", async () => {
  const config = baseConfig({ adminPassword: "already-configured", setupToken: "" });
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/setup/test-meta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(res.status, 404);
  });
});

test("POST /api/setup/test-supabase confirms the table exists on a 200", async () => {
  const { server, url } = await startFakeSupabase(200);
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/setup/test-supabase?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supabaseUrl: url, supabaseSecretKey: "x" }) });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.match(body.message, /tabela encontrada/);
  });
  await new Promise((resolve) => server.close(resolve));
});

test("POST /api/setup/test-supabase tells the student to run the SQL when the table is missing (404)", async () => {
  const { server, url } = await startFakeSupabase(404);
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/setup/test-supabase?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supabaseUrl: url, supabaseSecretKey: "x" }) });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /rode o SQL/);
  });
  await new Promise((resolve) => server.close(resolve));
});

test("POST /api/setup/test-supabase reports bad credentials distinctly from a missing table", async () => {
  const { server, url } = await startFakeSupabase(401);
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/setup/test-supabase?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supabaseUrl: url, supabaseSecretKey: "x" }) });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /Credenciais recusadas/);
  });
  await new Promise((resolve) => server.close(resolve));
});

test("POST /api/setup/test-supabase rejects a URL resolving to the cloud metadata range", async () => {
  const config = baseConfig();
  await withServer(config, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/setup/test-supabase?token=${config.setupToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supabaseUrl: "https://169.254.169.254", supabaseSecretKey: "x" }) });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /bloqueado/);
  });
});

test("GET /api/branding is reachable without a session and returns the safe subset of settings", async () => {
  const config = baseConfig({ adminPassword: "already-configured", setupToken: "" });
  const server = createServer(createApp({
    store: { getSettings: async () => ({ brandName: "Estúdio Ana", brandHandle: "ana", outboundWebhookUrl: "https://should-not-leak.example" }) },
    meta: {}, config, serveStatic: (_req, res) => { res.writeHead(404); res.end(); },
  }));
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${baseUrl}/api/branding`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.brandName, "Estúdio Ana");
    assert.equal(body.brandHandle, "ana");
    assert.equal(body.outboundWebhookUrl, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
