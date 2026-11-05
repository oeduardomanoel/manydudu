import test from "node:test";
import assert from "node:assert/strict";
import { isStale, findStale } from "../src/domain/retention.js";

const NOW = new Date("2026-08-18T00:00:00.000Z").getTime();

test("isStale flags a contact whose last interaction is well past the window", () => {
  const contact = { lastInteractionAt: "2024-01-01T00:00:00.000Z" };
  assert.equal(isStale(contact, { now: NOW }), true);
});

test("isStale keeps a recently active contact", () => {
  const contact = { lastInteractionAt: "2026-08-01T00:00:00.000Z" };
  assert.equal(isStale(contact, { now: NOW }), false);
});

test("isStale falls back to createdAt for records without lastInteractionAt (leads)", () => {
  assert.equal(isStale({ createdAt: "2024-01-01T00:00:00.000Z" }, { now: NOW }), true);
  assert.equal(isStale({ createdAt: "2026-08-10T00:00:00.000Z" }, { now: NOW }), false);
});

test("isStale treats a record with no usable date as stale rather than silently keeping it forever", () => {
  assert.equal(isStale({}, { now: NOW }), true);
});

test("isStale respects a custom maxInactiveDays window", () => {
  const contact = { lastInteractionAt: "2026-08-10T00:00:00.000Z" }; // 8 days before NOW
  assert.equal(isStale(contact, { now: NOW, maxInactiveDays: 30 }), false);
  assert.equal(isStale(contact, { now: NOW, maxInactiveDays: 5 }), true);
});

test("findStale filters a list down to only the stale records", () => {
  const records = [
    { id: "fresh", lastInteractionAt: "2026-08-15T00:00:00.000Z" },
    { id: "old", lastInteractionAt: "2023-01-01T00:00:00.000Z" },
  ];
  assert.deepEqual(findStale(records, { now: NOW }).map((r) => r.id), ["old"]);
});
