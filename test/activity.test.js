import test from "node:test";
import assert from "node:assert/strict";
import { paginateActivity } from "../src/domain/activity.js";

const activity = [
  { id: "1", status: "sent", ruleId: "r1" },
  { id: "2", status: "ignored" },
  { id: "3", status: "sent", ruleId: "r2" },
  { id: "4", status: "failed", ruleId: "r1" },
];

test("paginates with a default limit and offset", () => {
  const page = paginateActivity(activity, {});
  assert.equal(page.total, 4);
  assert.equal(page.items.length, 4);
  assert.equal(page.limit, 30);
  assert.equal(page.offset, 0);
});

test("filters by status", () => {
  const page = paginateActivity(activity, { status: "sent" });
  assert.equal(page.total, 2);
  assert.deepEqual(page.items.map((e) => e.id), ["1", "3"]);
});

test("filters by ruleId", () => {
  const page = paginateActivity(activity, { ruleId: "r1" });
  assert.deepEqual(page.items.map((e) => e.id), ["1", "4"]);
});

test("respects limit and offset for pagination", () => {
  const page = paginateActivity(activity, { limit: 2, offset: 2 });
  assert.equal(page.total, 4);
  assert.deepEqual(page.items.map((e) => e.id), ["3", "4"]);
});

test("clamps limit to a sane maximum and offset to non-negative", () => {
  const page = paginateActivity(activity, { limit: 10000, offset: -5 });
  assert.equal(page.limit, 200);
  assert.equal(page.offset, 0);
});
