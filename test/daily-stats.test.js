import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backfillDailyStats, buildSeries, dayKey, overview, previousMonthSpan, recordDailyEvent } from "../src/domain/daily-stats.js";
import { JsonStore } from "../src/storage/json-store.js";

// 15:00 UTC = 12:00 em São Paulo — longe da virada do dia
const NOW = Date.parse("2026-11-11T15:00:00Z");
const at = (daysAgo, hour = 15) => new Date(NOW - daysAgo * 86_400_000 + (hour - 15) * 3_600_000).toISOString();

test("dayKey uses the Brazilian calendar day, not UTC", () => {
  assert.equal(dayKey("2026-11-11T02:00:00Z"), "2026-11-10");
  assert.equal(dayKey("2026-11-11T15:00:00Z"), "2026-11-11");
});

test("recordDailyEvent counts sent, delivered, replies and failures, with sent per automation", () => {
  const stats = {};
  recordDailyEvent(stats, { status: "sent", ruleId: "r1", at: at(0) });
  recordDailyEvent(stats, { status: "sent", ruleId: "r2", at: at(0) });
  recordDailyEvent(stats, { status: "delivered", ruleId: "r1", at: at(0) });
  recordDailyEvent(stats, { status: "waiting_follow", at: at(0) });
  recordDailyEvent(stats, { status: "ignored", at: at(0) });
  recordDailyEvent(stats, { status: "sent", at: "não é data" });
  assert.deepEqual(stats["2026-11-11"], { sent: 2, delivered: 1, replied: 2, failed: 0, byRule: { r1: 1, r2: 1 } });
});

test("old days are dropped after 120 days", () => {
  const stats = { "2026-01-01": { sent: 9, delivered: 0, replied: 0, failed: 0, byRule: {} } };
  recordDailyEvent(stats, { status: "sent", at: at(0) });
  assert.equal(stats["2026-01-01"], undefined);
});

test("buildSeries fills missing days with zero and filters by automation", () => {
  const stats = backfillDailyStats([
    { status: "sent", ruleId: "r1", at: at(0) }, { status: "sent", ruleId: "r2", at: at(0) }, { status: "sent", ruleId: "r1", at: at(3) },
  ]);
  const all = buildSeries(stats, { range: "14d", now: NOW });
  assert.equal(all.length, 14);
  assert.equal(all.at(-1).day, "2026-11-11");
  assert.equal(all.at(-1).value, 2);
  assert.equal(all.at(-4).value, 1);
  assert.equal(all[0].value, 0);
  assert.equal(buildSeries(stats, { range: "14d", now: NOW, ruleId: "r2" }).at(-1).value, 1);
  assert.equal(buildSeries(stats, { range: "30d", now: NOW }).length, 30);
  const weeks = buildSeries(stats, { range: "13w", now: NOW });
  assert.equal(weeks.length, 13);
  assert.equal(weeks.at(-1).value, 3);
});

test("previous-month comparison only appears when the complete count reaches back that far", () => {
  assert.equal(previousMonthSpan("2026-11-02", NOW), null);
  assert.equal(previousMonthSpan(null, NOW), null);
  assert.deepEqual(previousMonthSpan("2026-09-30", NOW), { from: "2026-10-01", to: "2026-10-11" });
});

test("data backfilled from the capped log before dailyStatsSince does not count as complete", () => {
  const state = { dailyStats: backfillDailyStats([{ status: "sent", at: "2026-09-28T15:00:00Z" }, { status: "sent", at: at(0) }]), dailyStatsSince: "2026-11-11" };
  const result = overview(state, { now: NOW });
  assert.equal(result.trackedSince, "2026-11-11");
  assert.equal(result.monthComplete, false);
  assert.equal(result.month.previousSent, null);
});

test("overview gathers month totals, goals, series and a ranking by automation", () => {
  const state = {
    dailyStats: backfillDailyStats([{ status: "sent", ruleId: "r1", at: at(0) }, { status: "sent", ruleId: "r1", at: at(1) }, { status: "sent", ruleId: "r2", at: at(2) }]),
    activity: [{ status: "waiting_follow", at: at(0) }, { status: "waiting_follow", at: at(2) }],
    leads: [{ createdAt: at(0) }, { createdAt: at(20) }],
    settings: { dmDailyGoal: 300, leadMonthlyGoal: 80 },
    rules: [{ id: "r1", name: "VÍDEO", keyword: "video" }, { id: "r2", name: "CRM", keyword: "crm" }, { id: "r3", name: "Parada", keyword: "x" }],
  };
  const result = overview(state, { now: NOW });
  assert.equal(result.month.sent, 3);
  assert.equal(result.month.previousSent, null);
  assert.equal(result.month.leads, 1);
  assert.equal(result.month.day, 11);
  assert.equal(result.month.daysInMonth, 30);
  assert.equal(result.waitingFollowToday, 1);
  assert.deepEqual(result.goals, { dmDaily: 300, leadMonthly: 80 });
  assert.deepEqual(result.ranking.map((rule) => [rule.name, rule.sent]), [["VÍDEO", 2], ["CRM", 1]]);
});

test("JsonStore.log feeds the daily summary in the same write, and ensureDailyStats backfills once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-daily-"));
  try {
    const store = new JsonStore(join(directory, "db.json"));
    await store.initialize();
    await store.update((state) => { state.activity = [{ status: "sent", ruleId: "r1", at: new Date().toISOString() }]; });
    await store.ensureDailyStats();
    await store.ensureDailyStats();
    await store.log({ status: "sent", ruleId: "r1", at: new Date().toISOString() });
    const { dailyStats, dailyStatsSince } = await store.read();
    assert.equal(dailyStats[dayKey()].sent, 2);
    assert.equal(dailyStatsSince, dayKey());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
