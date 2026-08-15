import test from "node:test";
import assert from "node:assert/strict";
import { buildContentRoi } from "../src/domain/roi.js";

test("groups contacts by their oldest comment's mediaId, ignoring newer comments on other content", () => {
  const contacts = [
    { id: "c1", stage: "cliente", history: [
      { type: "comment", mediaId: "reel-2", at: "2026-01-02T00:00:00.000Z" },
      { type: "comment", mediaId: "reel-1", at: "2026-01-01T00:00:00.000Z" },
    ] },
  ];
  const roi = buildContentRoi(contacts, {});
  assert.equal(roi[0].mediaId, "reel-1");
});

test("computes conversion rate as the share that reached cliente", () => {
  const contacts = [
    { stage: "cliente", history: [{ type: "comment", mediaId: "reel-1" }] },
    { stage: "novo", history: [{ type: "comment", mediaId: "reel-1" }] },
    { stage: "qualificado", history: [{ type: "comment", mediaId: "reel-1" }] },
    { stage: "novo", history: [{ type: "comment", mediaId: "reel-1" }] },
  ];
  const roi = buildContentRoi(contacts, {});
  assert.equal(roi[0].total, 4);
  assert.equal(roi[0].conversionRate, 25);
});

test("excludes contacts with no comment-origin mediaId, without crashing", () => {
  const contacts = [
    { stage: "novo", history: [{ type: "message", text: "oi" }] },
    { stage: "novo", history: [] },
    { stage: "novo" },
  ];
  assert.deepEqual(buildContentRoi(contacts, {}), []);
});

test("attaches media metadata from the lookup, or null when the content is gone", () => {
  const contacts = [{ stage: "novo", history: [{ type: "comment", mediaId: "reel-1" }] }, { stage: "novo", history: [{ type: "comment", mediaId: "reel-deleted" }] }];
  const roi = buildContentRoi(contacts, { "reel-1": { caption: "Meu Reel" } });
  const known = roi.find((item) => item.mediaId === "reel-1");
  const gone = roi.find((item) => item.mediaId === "reel-deleted");
  assert.equal(known.media.caption, "Meu Reel");
  assert.equal(gone.media, null);
});

test("sorts by total contacts descending", () => {
  const contacts = [
    { stage: "novo", history: [{ type: "comment", mediaId: "small" }] },
    { stage: "novo", history: [{ type: "comment", mediaId: "big" }] },
    { stage: "novo", history: [{ type: "comment", mediaId: "big" }] },
  ];
  const roi = buildContentRoi(contacts, {});
  assert.deepEqual(roi.map((item) => item.mediaId), ["big", "small"]);
});
