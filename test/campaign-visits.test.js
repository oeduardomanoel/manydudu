import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVisitCounter, isLikelyBot } from "../src/domain/campaign-visits.js";
import { JsonStore } from "../src/storage/json-store.js";

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 350.0";

test("isLikelyBot skips link previews and empty user agents but keeps the Instagram in-app browser", () => {
  assert.equal(isLikelyBot(PHONE), false);
  assert.equal(isLikelyBot("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"), true);
  assert.equal(isLikelyBot("WhatsApp/2.23.20.0"), true);
  assert.equal(isLikelyBot("Googlebot/2.1"), true);
  assert.equal(isLikelyBot(""), true);
});

test("visits are summed in memory and written once per flush", async () => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-visits-"));
  try {
    const store = new JsonStore(join(directory, "db.json"));
    await store.initialize();
    await store.addCampaign({ id: "1", slug: "crm", title: "CRM", active: true });
    await store.addCampaign({ id: "2", slug: "ia", title: "IA", active: true, visits: 10 });
    let writes = 0;
    const counting = { addCampaignVisits: async (counts) => { writes += 1; return store.addCampaignVisits(counts); } };
    const counter = createVisitCounter({ store: counting });
    counter.record("crm", PHONE); counter.record("crm", PHONE); counter.record("ia", PHONE);
    counter.record("crm", "facebookexternalhit/1.1");
    counter.record("sumiu", PHONE);
    await counter.flush();
    await counter.flush();
    assert.equal(writes, 1);
    const campaigns = await store.listCampaigns();
    assert.equal(campaigns.find((c) => c.slug === "crm").visits, 2);
    assert.equal(campaigns.find((c) => c.slug === "ia").visits, 11);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed flush keeps the counts for the next attempt", async () => {
  let fail = true;
  const saved = [];
  const store = { addCampaignVisits: async (counts) => { if (fail) throw new Error("Supabase fora"); saved.push(counts); } };
  const counter = createVisitCounter({ store, logError: () => {} });
  counter.record("crm", PHONE);
  await counter.flush();
  counter.record("crm", PHONE);
  assert.deepEqual(counter.pending(), { crm: 2 });
  fail = false;
  await counter.flush();
  assert.deepEqual(saved, [{ crm: 2 }]);
});
