import test from "node:test";
import assert from "node:assert/strict";
import { deliverStageChange, isBlockedIp, isBlockedTarget } from "../src/domain/outbound-webhook.js";

test("isBlockedIp blocks the AWS/GCP/Azure/DigitalOcean metadata range", () => {
  assert.equal(isBlockedIp("169.254.169.254"), true);
  assert.equal(isBlockedIp("169.254.0.1"), true);
});

test("isBlockedIp blocks the AWS IMDSv2 IPv6 metadata address", () => {
  assert.equal(isBlockedIp("fd00:ec2::254"), true);
  assert.equal(isBlockedIp("FD00:EC2::254"), true);
});

test("isBlockedIp allows normal private and public IPs (self-hosted, single-admin threat model)", () => {
  assert.equal(isBlockedIp("192.168.1.50"), false);
  assert.equal(isBlockedIp("10.0.0.5"), false);
  assert.equal(isBlockedIp("127.0.0.1"), false);
  assert.equal(isBlockedIp("203.0.113.10"), false);
});

test("isBlockedTarget resolves the hostname and checks the real IP, not the string", async () => {
  const fakeLookup = async () => ({ address: "169.254.169.254" });
  assert.equal(await isBlockedTarget("metadata.internal.example", fakeLookup), true);
});

test("isBlockedTarget fails open (false) when DNS resolution itself fails — the fetch will fail on its own", async () => {
  const fakeLookup = async () => { throw new Error("ENOTFOUND"); };
  assert.equal(await isBlockedTarget("does-not-exist.example", fakeLookup), false);
});

test("deliverStageChange rejects a non-https URL before ever resolving DNS", async () => {
  let lookupCalled = false;
  await assert.rejects(
    deliverStageChange({ url: "http://example.com/hook", payload: {}, lookupImpl: async () => { lookupCalled = true; return { address: "1.2.3.4" }; } }),
    /https/,
  );
  assert.equal(lookupCalled, false);
});

test("deliverStageChange rejects a URL resolving to the cloud metadata range at send time", async () => {
  const fakeLookup = async () => ({ address: "169.254.169.254" });
  let fetchCalled = false;
  await assert.rejects(
    deliverStageChange({ url: "https://sneaky.example/hook", payload: {}, lookupImpl: fakeLookup, fetcher: async () => { fetchCalled = true; } }),
    /bloqueado/,
  );
  assert.equal(fetchCalled, false);
});

test("deliverStageChange sends a POST with redirect:manual and the JSON payload for a legitimate target", async () => {
  const fakeLookup = async () => ({ address: "192.168.1.10" });
  let captured;
  await deliverStageChange({
    url: "https://n8n.local/webhook/abc",
    payload: { event: "pipeline.stage_changed", stage: "cliente" },
    lookupImpl: fakeLookup,
    fetcher: async (url, options) => { captured = { url, options }; return { ok: true }; },
  });
  assert.equal(captured.url, "https://n8n.local/webhook/abc");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.redirect, "manual");
  assert.deepEqual(JSON.parse(captured.options.body), { event: "pipeline.stage_changed", stage: "cliente" });
});
