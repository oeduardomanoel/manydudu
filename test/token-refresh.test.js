import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramLoginToken, needsRefresh, maybeRefreshToken } from "../src/meta/token-refresh.js";

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
