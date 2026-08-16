import test from "node:test";
import assert from "node:assert/strict";
import { hasMessagingConsent, isLegacyPlaceholderUsername, planUsernameResync } from "../src/domain/username-resync.js";

test("isLegacyPlaceholderUsername matches the old fallback regardless of case", () => {
  assert.equal(isLegacyPlaceholderUsername("instagram"), true);
  assert.equal(isLegacyPlaceholderUsername("Instagram"), true);
  assert.equal(isLegacyPlaceholderUsername("INSTAGRAM"), true);
  assert.equal(isLegacyPlaceholderUsername("instagramreal"), false);
  assert.equal(isLegacyPlaceholderUsername(null), false);
});

test("hasMessagingConsent is true only when the contact has a messaging-type event", () => {
  assert.equal(hasMessagingConsent([{ type: "comment" }]), false);
  assert.equal(hasMessagingConsent([{ type: "message" }]), true);
  assert.equal(hasMessagingConsent([{ type: "postback" }]), true);
  assert.equal(hasMessagingConsent([{ type: "outgoing" }]), true);
  assert.equal(hasMessagingConsent([]), false);
});

test("planUsernameResync clears the legacy placeholder and retries the API only with consent", () => {
  const contacts = [
    { id: "a", username: "instagram", history: [{ type: "comment" }] },
    { id: "b", username: "instagram", history: [{ type: "comment" }, { type: "message" }] },
    { id: "c", username: null, history: [{ type: "message" }] },
    { id: "d", username: "real.handle", history: [{ type: "message" }] },
    { id: "e", username: null, history: [{ type: "comment" }] },
  ];
  assert.deepEqual(planUsernameResync(contacts), [
    { id: "a", clearLegacy: true, attemptLookup: false },
    { id: "b", clearLegacy: true, attemptLookup: true },
    { id: "c", clearLegacy: false, attemptLookup: true },
    { id: "d", clearLegacy: false, attemptLookup: false },
    { id: "e", clearLegacy: false, attemptLookup: false },
  ]);
});
