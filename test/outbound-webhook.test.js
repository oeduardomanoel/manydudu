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

function fakeRequestImpl(onOptions) {
  return (options, callback) => {
    onOptions(options);
    const events = {};
    const request = {
      on: (event, handler) => { events[event] = handler; return request; },
      write: () => {},
      end: () => {
        const response = { statusCode: 200, resume: () => {}, on: (event, handler) => { if (event === "end") handler(); } };
        callback(response);
      },
      destroy: () => {},
    };
    return request;
  };
}

test("deliverStageChange resolves DNS only once (no second resolution the fetch layer could rebind)", async () => {
  let lookupCalls = 0;
  const lookupImpl = async () => { lookupCalls++; return { address: "192.168.1.10" }; };
  await deliverStageChange({
    url: "https://n8n.local/webhook/abc",
    payload: { a: 1 },
    lookupImpl,
    requestImpl: fakeRequestImpl(() => {}),
  });
  assert.equal(lookupCalls, 1);
});

test("deliverStageChange (default fetcher) connects to the resolved IP while keeping the original hostname for TLS SNI/Host", async () => {
  let captured;
  await deliverStageChange({
    url: "https://n8n.local/webhook/abc?x=1",
    payload: { hello: "world" },
    lookupImpl: async () => ({ address: "192.168.1.10" }),
    requestImpl: fakeRequestImpl((options) => { captured = options; }),
  });
  assert.equal(captured.host, "192.168.1.10");
  assert.equal(captured.servername, "n8n.local");
  assert.equal(captured.headers.Host, "n8n.local");
  assert.equal(captured.path, "/webhook/abc?x=1");
  assert.equal(captured.method, "POST");
});

test("deliverStageChange (default fetcher) rejects a target that resolves to the metadata range without ever sending the request", async () => {
  let requestCalled = false;
  await assert.rejects(
    deliverStageChange({
      url: "https://sneaky.example/hook",
      payload: {},
      lookupImpl: async () => ({ address: "169.254.169.254" }),
      requestImpl: fakeRequestImpl(() => { requestCalled = true; }),
    }),
    /bloqueado/,
  );
  assert.equal(requestCalled, false);
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
