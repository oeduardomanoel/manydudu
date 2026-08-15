import test from "node:test";
import assert from "node:assert/strict";
import { buildHealthReport } from "../src/domain/health.js";

test("reports critical token when there is no metaToken at all", () => {
  const report = buildHealthReport({ webhookConfigured: true });
  assert.equal(report.token.status, "critical");
  assert.equal(report.token.configured, false);
});

test("reports ok token far from expiry, warn inside 2x threshold, critical inside the refresh threshold", () => {
  const now = Date.now();
  const ok = buildHealthReport({ metaToken: { accessToken: "x", expiresAt: now + 40 * 86400000 }, webhookConfigured: true });
  const warn = buildHealthReport({ metaToken: { accessToken: "x", expiresAt: now + 15 * 86400000 }, webhookConfigured: true });
  const critical = buildHealthReport({ metaToken: { accessToken: "x", expiresAt: now + 3 * 86400000 }, webhookConfigured: true });
  assert.equal(ok.token.status, "ok");
  assert.equal(warn.token.status, "warn");
  assert.equal(critical.token.status, "critical");
});

test("webhook status reflects whether Meta config is complete", () => {
  assert.equal(buildHealthReport({ webhookConfigured: false }).webhook.status, "critical");
  assert.equal(buildHealthReport({ webhookConfigured: true }).webhook.status, "ok");
});

test("api usage escalates from ok to warn to critical by percent", () => {
  assert.equal(buildHealthReport({ webhookConfigured: true, usage: { usage: 50 } }).apiUsage.status, "ok");
  assert.equal(buildHealthReport({ webhookConfigured: true, usage: { usage: 85 } }).apiUsage.status, "warn");
  assert.equal(buildHealthReport({ webhookConfigured: true, usage: { usage: 95 } }).apiUsage.status, "critical");
});

test("store failure is reported as critical without crashing the rest of the report", () => {
  const report = buildHealthReport({ webhookConfigured: true, storeStatus: { ok: false, backend: "supabase", error: "timeout" } });
  assert.equal(report.store.status, "critical");
  assert.equal(report.store.error, "timeout");
  assert.equal(report.overall, "critical");
});

test("overall is the worst of the four signals", () => {
  const report = buildHealthReport({ metaToken: { accessToken: "x", expiresAt: Date.now() + 40 * 86400000 }, webhookConfigured: true, usage: { usage: 85 }, storeStatus: { ok: true, backend: "local-json" } });
  assert.equal(report.overall, "warn");
});
