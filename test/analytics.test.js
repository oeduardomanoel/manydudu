import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalytics, buildKpis } from "../src/domain/analytics.js";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const daysAgo = (days, hours = 0) => new Date(NOW - days * 86_400_000 - hours * 3_600_000).toISOString();

test("buildKpis counts the last 7 days per day and compares with the previous 7 when the log reaches back", () => {
  const activity = [
    { status: "sent", at: daysAgo(0, 1) }, { status: "sent", at: daysAgo(0, 2) }, { status: "delivered", at: daysAgo(0, 1) },
    { status: "sent", at: daysAgo(3) }, { status: "waiting_follow", at: daysAgo(3) },
    { status: "sent", at: daysAgo(9) }, { status: "ignored", at: daysAgo(15) },
  ];
  const kpis = buildKpis({ activity, leads: [{ createdAt: daysAgo(1) }, { createdAt: daysAgo(10) }, { createdAt: daysAgo(11) }], now: NOW });
  assert.equal(kpis.complete, true);
  assert.equal(kpis.dmSent.value, 3);
  assert.equal(kpis.dmSent.previous, 1);
  assert.equal(kpis.dmSent.series.length, 7);
  assert.equal(kpis.dmSent.series[6], 2);
  assert.equal(kpis.delivered.value, 1);
  assert.equal(kpis.responseRate.value, 67);
  assert.equal(kpis.responseRate.previous, 0);
  assert.equal(kpis.leads.value, 1);
  assert.equal(kpis.leads.previous, 2);
});

test("buildKpis does not invent a comparison when the activity log is shorter than the period", () => {
  const kpis = buildKpis({ activity: [{ status: "sent", at: daysAgo(2) }], leads: [{ createdAt: daysAgo(9) }], now: NOW });
  assert.equal(kpis.complete, false);
  assert.equal(kpis.since, daysAgo(2));
  assert.equal(kpis.dmSent.previous, null);
  assert.equal(kpis.responseRate.previous, null);
  assert.equal(kpis.leads.previous, 1);
});

test("buildKpis handles an empty account", () => {
  const kpis = buildKpis({ now: NOW });
  assert.equal(kpis.dmSent.value, 0);
  assert.equal(kpis.responseRate.value, null);
  assert.equal(kpis.complete, false);
});

test("builds a conversion funnel from automation activity", () => {
  const analytics = buildAnalytics({
    rules: [{ id: "rule-1", name: "Guia IA", mediaId: "reel-1", enabled: true }],
    activity: [
      { status: "sent", ruleId: "rule-1", rule: "Guia IA", mediaId: "reel-1" },
      { status: "sent", ruleId: "rule-1", rule: "Guia IA", mediaId: "reel-1" },
      { status: "waiting_follow", ruleId: "rule-1", rule: "Guia IA", mediaId: "reel-1" },
      { status: "delivered", ruleId: "rule-1", rule: "Guia IA", mediaId: "reel-1" }
    ]
  });

  assert.deepEqual(analytics.total, { captured: 2, dmSent: 2, replied: 2, delivered: 1, deliveryRate: 50 });
  assert.equal(analytics.rules[0].name, "Guia IA");
  assert.equal(analytics.rules[0].delivered, 1);
});
