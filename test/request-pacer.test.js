import test from "node:test";
import assert from "node:assert/strict";
import { MetaRequestPacer } from "../src/meta/request-pacer.js";

test("serializes writes and waits between consecutive Meta requests", async () => {
  let now = 0;
  const waits = [];
  const pacer = new MetaRequestPacer({ minIntervalMs: 1500, now: () => now, sleep: async (milliseconds) => {
    waits.push(milliseconds);
    now += milliseconds;
  } });

  const results = await Promise.all([
    pacer.run(async () => "first"),
    pacer.run(async () => "second"),
    pacer.run(async () => "third")
  ]);

  assert.deepEqual(results, ["first", "second", "third"]);
  assert.deepEqual(waits, [1500, 1500]);
});

test("honors a longer cooldown requested by Meta", async () => {
  let now = 0;
  const waits = [];
  const pacer = new MetaRequestPacer({ minIntervalMs: 1000, now: () => now, sleep: async (milliseconds) => {
    waits.push(milliseconds);
    now += milliseconds;
  } });

  pacer.cooldown(5000);
  await pacer.run(async () => "sent");

  assert.deepEqual(waits, [5000]);
});
