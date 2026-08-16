import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildPurchaseEvent } from "../src/domain/purchase-event.js";
import { AppError } from "../src/util/errors.js";

test("buildPurchaseEvent hashes the contact id as external_id and never sends it raw", () => {
  const event = buildPurchaseEvent({ contactId: "17841400000000000", value: 197, now: () => 1_700_000_000_000 });
  assert.equal(event.user_data.external_id, createHash("sha256").update("17841400000000000").digest("hex"));
  assert.equal(JSON.stringify(event).includes("17841400000000000"), false);
});

test("buildPurchaseEvent sets action_source/messaging_channel for an Instagram DM conversion", () => {
  const event = buildPurchaseEvent({ contactId: "1", value: 50 });
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.action_source, "business_messaging");
  assert.equal(event.messaging_channel, "instagram");
});

test("buildPurchaseEvent rounds value to cents and uppercases currency", () => {
  const event = buildPurchaseEvent({ contactId: "1", value: 99.999, currency: "brl" });
  assert.equal(event.custom_data.value, 100);
  assert.equal(event.custom_data.currency, "BRL");
});

test("buildPurchaseEvent rejects a zero, negative, or non-numeric value", () => {
  assert.throws(() => buildPurchaseEvent({ contactId: "1", value: 0 }), AppError);
  assert.throws(() => buildPurchaseEvent({ contactId: "1", value: -10 }), AppError);
  assert.throws(() => buildPurchaseEvent({ contactId: "1", value: "abc" }), AppError);
});

test("buildPurchaseEvent rejects a missing contact id", () => {
  assert.throws(() => buildPurchaseEvent({ contactId: "", value: 10 }), AppError);
});
