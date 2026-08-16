import test from "node:test";
import assert from "node:assert/strict";
import { debugToken, isInstagramLoginToken, needsRefresh, maybeRefreshToken } from "../src/meta/token-refresh.js";

const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

function fakeMeta(accessToken) {
  return { accessToken, setAccessToken(token) { this.accessToken = token; } };
}

function fakeStore(initialToken = null) {
  const state = { token: initialToken, setCalls: 0 };
  return {
    state,
    async getMetaToken() { return state.token; },
    async setMetaToken(token) { state.token = token; state.setCalls += 1; },
  };
}

test("isInstagramLoginToken only accepts IG-prefixed tokens", () => {
  assert.equal(isInstagramLoginToken("IGAALSomeToken"), true);
  assert.equal(isInstagramLoginToken("EAAGSomeFacebookToken"), false);
  assert.equal(isInstagramLoginToken(""), false);
  assert.equal(isInstagramLoginToken(undefined), false);
});

test("needsRefresh is true with no known expiry and true when close to expiring", () => {
  assert.equal(needsRefresh(null), true);
  assert.equal(needsRefresh(Date.now() + 2 * 24 * 60 * 60 * 1000), true);
  assert.equal(needsRefresh(Date.now() + 30 * 24 * 60 * 60 * 1000), false);
});

test("debugToken surfaces the Meta error's code/subcode/fbtrace_id, not just the bare message", async () => {
  const fetcher = async () => jsonResponse({ error: { message: "An unknown error occurred", type: "OAuthException", code: 1, error_subcode: 99, fbtrace_id: "Abc123XYZ" } }, false, 400);
  await assert.rejects(
    debugToken("IGAALtest", "123", "secret", fetcher),
    /An unknown error occurred.*type=OAuthException.*code=1.*subcode=99.*trace=Abc123XYZ/,
  );
});

test("debugToken uses an app token (appId|appSecret) as access_token, never the inspected token itself", async () => {
  let capturedUrl;
  await debugToken("IGAALuserToken", "123456", "shh-secret", async (url) => { capturedUrl = url; return jsonResponse({ expires_at: 1 }); });
  const params = new URL(capturedUrl).searchParams;
  assert.equal(params.get("input_token"), "IGAALuserToken");
  assert.equal(params.get("access_token"), "123456|shh-secret");
});

test("maybeRefreshToken calls debugToken with appId/appSecret when there's no cached expiry yet", async () => {
  const meta = fakeMeta("IGAALcurrent");
  const store = fakeStore(null);
  let capturedUrl;
  const fetcher = async (url) => {
    capturedUrl = url;
    return jsonResponse({ expires_at: Math.floor((Date.now() + 40 * 24 * 60 * 60 * 1000) / 1000) });
  };
  await maybeRefreshToken({ meta, store, appId: "123456", appSecret: "shh-secret", fetcher });
  assert.match(capturedUrl, /debug_token/);
  assert.ok(new URL(capturedUrl).searchParams.get("access_token") === "123456|shh-secret");
});

test("maybeRefreshToken skips non-Instagram-login tokens entirely", async () => {
  const meta = fakeMeta("EAAGFacebookToken");
  const store = fakeStore();
  let fetchCalled = false;
  await maybeRefreshToken({ meta, store, fetcher: async () => { fetchCalled = true; return jsonResponse({}); } });
  assert.equal(fetchCalled, false);
  assert.equal(meta.accessToken, "EAAGFacebookToken");
});

test("maybeRefreshToken does nothing when the stored token is still fresh", async () => {
  const meta = fakeMeta("IGAALcurrent");
  const store = fakeStore({ accessToken: "IGAALcurrent", expiresAt: Date.now() + 40 * 24 * 60 * 60 * 1000 });
  let fetchCalled = false;
  await maybeRefreshToken({ meta, store, fetcher: async () => { fetchCalled = true; return jsonResponse({}); } });
  assert.equal(fetchCalled, false);
  assert.equal(meta.accessToken, "IGAALcurrent");
});

test("maybeRefreshToken refreshes and persists when close to expiry", async () => {
  const meta = fakeMeta("IGAALcurrent");
  const store = fakeStore({ accessToken: "IGAALcurrent", expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000 });
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return jsonResponse({ access_token: "IGAALrefreshed", expires_in: 5184000 });
  };
  await maybeRefreshToken({ meta, store, fetcher });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("refresh_access_token"));
  assert.equal(meta.accessToken, "IGAALrefreshed");
  assert.equal(store.state.token.accessToken, "IGAALrefreshed");
  assert.equal(store.state.setCalls, 1);
});

test("maybeRefreshToken swallows failures and keeps the old token", async () => {
  const meta = fakeMeta("IGAALcurrent");
  const store = fakeStore({ accessToken: "IGAALcurrent", expiresAt: Date.now() + 1000 });
  await maybeRefreshToken({ meta, store, fetcher: async () => jsonResponse({ error: { message: "boom" } }, false, 400), logError: () => {} });
  assert.equal(meta.accessToken, "IGAALcurrent");
  assert.equal(store.state.setCalls, 0);
});
