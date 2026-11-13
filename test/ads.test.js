import test from "node:test";
import assert from "node:assert/strict";
import { extractComments } from "../src/meta/webhook.js";
import { findMatchingRule } from "../src/domain/automation.js";
import { summarizeAds } from "../src/domain/ads.js";
import { processComments } from "../src/app.js";

const adPayload = { entry: [{ id: "me", changes: [{ field: "comments", value: {
  id: "c1", text: "Quero o MAPS", from: { id: "p1", username: "ana" },
  media: { id: "ad-media-9", ad_id: "120200001", ad_title: "Campanha Maps · Leads", original_media_id: "18110155243951055" },
} }] }] };

test("extractComments keeps the ad id, title and original post of comments made on ads", () => {
  const [comment] = extractComments(adPayload);
  assert.equal(comment.mediaId, "ad-media-9");
  assert.equal(comment.adId, "120200001");
  assert.equal(comment.adTitle, "Campanha Maps · Leads");
  assert.equal(comment.originalMediaId, "18110155243951055");
  const [organic] = extractComments({ entry: [{ changes: [{ field: "comments", value: { id: "c2", text: "x", from: { id: "p" }, media: { id: "m" } } }] }] });
  assert.equal(organic.adId, null);
});

test("an automation tied to a Reel also matches comments on the ad of that Reel", () => {
  const rules = [{ id: "r", name: "MAPS", keyword: "maps", match: "contains", enabled: true, mediaId: "18110155243951055" }];
  assert.equal(findMatchingRule("quero o maps", rules, "ad-media-9"), undefined);
  assert.equal(findMatchingRule("quero o maps", rules, ["ad-media-9", "18110155243951055"]).id, "r");
  assert.equal(findMatchingRule("quero o maps", rules, "18110155243951055").id, "r");
});

test("processComments answers an ad comment with the Reel's automation and records the ad", async () => {
  const replies = [];
  const events = [];
  const logs = [];
  const rule = { id: "r", name: "MAPS", keyword: "maps", match: "contains", enabled: true, responseMode: "private", reply: "Te mandei!", mediaId: "18110155243951055" };
  const store = {
    claimEvent: async () => true, recordContactEvent: async (event) => events.push(event), isContactPaused: async () => false, getContact: async () => null,
    read: async () => ({ rules: [rule], activity: [] }), setPendingDelivery: async () => {}, log: async (item) => logs.push(item),
  };
  const meta = { reply: async (id, text, mode) => { replies.push([id, mode]); return { recipient_id: "p1" }; } };
  await processComments(extractComments(adPayload), store, meta);
  assert.deepEqual(replies, [["c1", "private"]]);
  assert.equal(events[0].adId, "120200001");
  assert.equal(logs.at(-1).status, "sent");
  assert.equal(logs.at(-1).adTitle, "Campanha Maps · Leads");
});

test("summarizeAds groups ad comments and shows which automation covers each ad", () => {
  const contacts = {
    p1: { id: "p1", history: [{ type: "comment", adId: "A", adTitle: "Maps", mediaId: "ad-m", originalMediaId: "post-1", at: "2026-11-13T10:00:00Z" }, { type: "comment", adId: "A", mediaId: "ad-m", originalMediaId: "post-1", at: "2026-11-13T11:00:00Z" }] },
    p2: { id: "p2", history: [{ type: "comment", adId: "B", adTitle: "Escuro", mediaId: "dark-m", at: "2026-11-13T12:00:00Z" }, { type: "comment", mediaId: "post-2", at: "2026-11-13T12:00:00Z" }] },
  };
  const ads = summarizeAds(contacts, [{ id: "r", name: "MAPS", keyword: "maps", enabled: true, mediaId: "post-1" }]);
  assert.deepEqual(ads.map((ad) => [ad.adId, ad.comments, ad.people, ad.rule?.name ?? null]), [["B", 1, 1, null], ["A", 2, 1, "MAPS"]]);
  assert.equal(ads[1].adTitle, "Maps");
});
