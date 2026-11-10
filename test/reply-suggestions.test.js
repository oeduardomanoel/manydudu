import test from "node:test";
import assert from "node:assert/strict";
import { suggestReplies } from "../public/reply-suggestions.js";
import { personalize } from "../src/domain/automation.js";

test("suggestReplies builds 6 distinct public replies and DMs around the keyword", () => {
  const result = suggestReplies("crm");
  assert.equal(result.publicReplies.length, 6);
  assert.equal(new Set(result.publicReplies).size, 6);
  assert.ok(result.publicReplies.some((reply) => reply.includes("CRM")));
  assert.match(result.reply, /CRM/);
  assert.match(result.reply, /responde|Responde/);
  assert.match(result.followUpText, /CRM/);
});

test("suggestReplies changes the first DM when there is no delivery afterwards", () => {
  assert.notEqual(suggestReplies("ia", { followUp: true }).reply, suggestReplies("ia", { followUp: false }).reply);
});

test("suggestReplies rotates to other options with another seed", () => {
  assert.notDeepEqual(suggestReplies("ia", { seed: 0 }).publicReplies, suggestReplies("ia", { seed: 1 }).publicReplies);
});

test("every suggestion fits Instagram limits and leaves only {nome} for the server to fill", () => {
  for (let seed = 0; seed < 6; seed += 1) {
    const { publicReplies, reply, followUpText } = suggestReplies("vídeo", { seed });
    for (const text of [...publicReplies, reply, followUpText]) {
      assert.ok(text.length <= 900, text);
      assert.doesNotMatch(personalize(text, { username: "ana", keyword: "vídeo" }), /\{[a-z]+\}/i);
    }
  }
});
