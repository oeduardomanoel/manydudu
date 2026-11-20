import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SupabaseStore } from "../src/storage/supabase-store.js";
import { createStore } from "../src/storage/create-store.js";
import { JsonStore } from "../src/storage/json-store.js";

function fakeSupabase(initialState = null) {
  let state = initialState;
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if ((options.method ?? "GET") === "GET") {
      return new Response(JSON.stringify(state ? [{ state }] : []), { status: 200 });
    }
    const body = JSON.parse(options.body);
    state = body.state;
    return new Response(null, { status: 204 });
  };
  return { fetchImpl, requests, getState: () => state };
}

test("creates the Supabase state and persists store operations", async () => {
  const remote = fakeSupabase();
  const store = new SupabaseStore({ url: "https://project.supabase.co", serviceRoleKey: "secret", fetchImpl: remote.fetchImpl });

  await store.initialize();
  await store.addRule({ id: "rule-1", keyword: "ICP", enabled: true });

  assert.equal(remote.getState().rules[0].keyword, "ICP");
  assert.equal(remote.requests[0].options.headers.apikey, "secret");
  assert.match(remote.requests[0].url, /manydudu_state/);
});

test("imports the existing JSON file only when the remote state is empty", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-seed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const seedPath = join(directory, "db.json");
  await writeFile(seedPath, JSON.stringify({ rules: [{ id: "old-rule" }], events: {}, activity: [], pendingDeliveries: {}, contacts: {} }));
  const remote = fakeSupabase();
  const store = new SupabaseStore({ url: "https://project.supabase.co", serviceRoleKey: "secret", seedPath, fetchImpl: remote.fetchImpl });

  await store.initialize();

  assert.equal(remote.getState().rules[0].id, "old-rule");
});

test("reads Supabase only once at boot and serves later reads from memory", async () => {
  const remote = fakeSupabase({ rules: [], events: {}, activity: [], pendingDeliveries: {}, contacts: {} });
  const store = new SupabaseStore({ url: "https://project.supabase.co", serviceRoleKey: "secret", fetchImpl: remote.fetchImpl });
  await store.initialize();
  await store.addRule({ id: "rule-1", keyword: "ICP", enabled: true });
  await store.claimEvent("event-1");
  await store.read();
  await store.read();
  const gets = remote.requests.filter((request) => (request.options.method ?? "GET") === "GET");
  assert.equal(gets.length, 1);
  assert.equal(remote.getState().events["event-1"] > 0, true);
  assert.equal((await store.read()).rules[0].id, "rule-1");
});

test("keeps a local copy and keeps running on it when Supabase is blocked", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-mirror-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const seedPath = join(directory, "db.json");
  const remote = fakeSupabase({ rules: [{ id: "rule-1" }], events: {}, activity: [], pendingDeliveries: {}, contacts: {} });
  const first = new SupabaseStore({ url: "https://project.supabase.co", serviceRoleKey: "secret", seedPath, fetchImpl: remote.fetchImpl });
  await first.initialize();
  assert.equal(JSON.parse(await readFile(seedPath, "utf8")).rules[0].id, "rule-1");

  const blocked = async () => new Response('{"message":"exceed_egress_quota"}', { status: 402 });
  const store = new SupabaseStore({ url: "https://project.supabase.co", serviceRoleKey: "secret", seedPath, fetchImpl: blocked });
  await store.initialize();
  await store.addRule({ id: "rule-2" });
  assert.deepEqual((await store.read()).rules.map((rule) => rule.id), ["rule-2", "rule-1"]);
  assert.match(store.syncError, /402/);
  assert.equal(JSON.parse(await readFile(seedPath, "utf8")).rules.length, 2);
});

test("still fails to boot when Supabase is blocked and there is no local copy", async () => {
  const blocked = async () => new Response("{}", { status: 402 });
  const store = new SupabaseStore({ url: "https://project.supabase.co", serviceRoleKey: "secret", fetchImpl: blocked });
  await assert.rejects(store.initialize(), /HTTP 402/);
});

test("selects Supabase only with complete server credentials", () => {
  assert.ok(createStore({ env: {}, cwd: "C:/app" }) instanceof JsonStore);
  assert.ok(createStore({ env: { SUPABASE_URL: "https://project.supabase.co", SUPABASE_SECRET_KEY: "secret" }, cwd: "C:/app", fetchImpl: async () => {} }) instanceof SupabaseStore);
  assert.throws(() => createStore({ env: { SUPABASE_URL: "https://project.supabase.co" }, cwd: "C:/app" }), /incompleta/i);
});

test("does not send a new secret key as a bearer token", async () => {
  const remote = fakeSupabase({ rules: [], events: {}, activity: [], pendingDeliveries: {}, contacts: {} });
  const store = new SupabaseStore({ url: "https://project.supabase.co", serviceRoleKey: "sb_secret_example", fetchImpl: remote.fetchImpl });
  await store.initialize();
  assert.equal(remote.requests[0].options.headers.apikey, "sb_secret_example");
  assert.equal(remote.requests[0].options.headers.Authorization, undefined);
});
