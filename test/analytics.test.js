import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalytics } from "../src/domain/analytics.js";

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
