import test from "node:test";
import assert from "node:assert/strict";
import { scoreContact, scoreLead } from "../src/domain/lead-score.js";

test("scoreContact is highest for a follower who replied fast, recently, with deep history", () => {
  const now = Date.now();
  const hot = scoreContact({
    follower: true,
    lastInteractionAt: new Date(now - 3600000).toISOString(),
    history: [
      { type: "outgoing_rule", text: "x", at: new Date(now - 7200000).toISOString() },
      { type: "message", text: "y", at: new Date(now - 7000000).toISOString() },
      { type: "comment", at: new Date(now - 7300000).toISOString() },
      { type: "comment", at: new Date(now - 7400000).toISOString() },
      { type: "comment", at: new Date(now - 7500000).toISOString() },
    ],
  }, now);
  assert.ok(hot > 80, `expected a hot score, got ${hot}`);
});

test("scoreContact is low for a stranger with no signals", () => {
  assert.equal(scoreContact({}, Date.now()), 0);
});

test("scoreContact rewards a fast response gap more than a slow one", () => {
  const now = Date.now();
  const fast = scoreContact({ history: [
    { type: "outgoing_rule", text: "x", at: new Date(now - 120000).toISOString() },
    { type: "message", at: new Date(now - 60000).toISOString() },
  ] }, now);
  const slow = scoreContact({ history: [
    { type: "outgoing_rule", text: "x", at: new Date(now - 2 * 86400000).toISOString() },
    { type: "message", at: new Date(now - 86400000).toISOString() },
  ] }, now);
  assert.ok(fast > slow, `expected fast (${fast}) > slow (${slow})`);
});

test("scoreLead is highest for a recent, detailed, multi-niche submission", () => {
  const now = Date.now();
  const hot = scoreLead({
    automationInterest: "x".repeat(200),
    niches: ["Estética", "Outro"],
    nicheOther: "Clínica de estética",
    createdAt: new Date(now - 3600000).toISOString(),
  }, now);
  assert.ok(hot > 90, `expected a hot score, got ${hot}`);
});

test("scoreLead is low for a shallow, old submission", () => {
  const now = Date.now();
  const cold = scoreLead({
    automationInterest: "oi",
    niches: [],
    createdAt: new Date(now - 60 * 86400000).toISOString(),
  }, now);
  assert.ok(cold < 15, `expected a cold score, got ${cold}`);
});

test("scoreLead never exceeds 100", () => {
  const now = Date.now();
  const score = scoreLead({ automationInterest: "x".repeat(500), niches: ["a", "b", "c", "d"], nicheOther: "x", createdAt: new Date(now).toISOString() }, now);
  assert.ok(score <= 100);
});
