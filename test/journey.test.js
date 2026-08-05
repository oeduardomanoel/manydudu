import test from "node:test";
import assert from "node:assert/strict";
import { buildJourney } from "../src/domain/automation.js";

test("builds the visible journey from the enabled automation steps", () => {
  const journey = buildJourney({ keyword: "quero", responseMode: "private", followUpEnabled: true,
    initialQuickReplyEnabled: true, requireFollow: true, deliveryStyle: "button" });

  assert.deepEqual(journey.map((step) => step.type), ["trigger", "message", "reply", "condition", "delivery"]);
  assert.equal(journey[0].summary, "Comentário contém “quero”");
  assert.equal(journey[4].summary, "Entregar por botão");
});
