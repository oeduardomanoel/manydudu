import test from "node:test";
import assert from "node:assert/strict";
import { validateSettings } from "../src/domain/settings.js";
import { AppError } from "../src/util/errors.js";

test("validateSettings only returns keys actually present in the input", () => {
  assert.deepEqual(validateSettings({ outboundWebhookUrl: "https://n8n.example.com/hook" }),
    { outboundWebhookUrl: "https://n8n.example.com/hook" });
  assert.deepEqual(validateSettings({ metaPixelId: "123456789" }), { metaPixelId: "123456789" });
});

test("validateSettings rejects a non-https webhook URL", () => {
  assert.throws(() => validateSettings({ outboundWebhookUrl: "http://example.com" }), AppError);
});

test("validateSettings accepts an empty webhook URL (disables it)", () => {
  assert.deepEqual(validateSettings({ outboundWebhookUrl: "" }), { outboundWebhookUrl: "" });
});

test("validateSettings rejects a non-numeric Pixel ID", () => {
  assert.throws(() => validateSettings({ metaPixelId: "abc123" }), AppError);
});

test("validateSettings trims the CAPI token without further validation", () => {
  assert.deepEqual(validateSettings({ metaCapiToken: "  EAAB...token  " }), { metaCapiToken: "EAAB...token" });
});

test("validateSettings ignores unknown keys", () => {
  assert.deepEqual(validateSettings({ notARealSetting: "x" }), {});
});
