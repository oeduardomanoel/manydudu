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

test("validateSettings trims and caps the brand name/handle/tagline", () => {
  assert.deepEqual(validateSettings({ brandName: "  Estúdio Ana  " }), { brandName: "Estúdio Ana" });
  assert.deepEqual(validateSettings({ brandHandle: "@meuinsta" }), { brandHandle: "meuinsta" });
  assert.deepEqual(validateSettings({ brandTagline: "  Uma frase de efeito  " }), { brandTagline: "Uma frase de efeito" });
});

test("validateSettings rejects an unknown brand template", () => {
  assert.throws(() => validateSettings({ brandTemplate: "dourado" }), AppError);
});

test("validateSettings accepts a known brand template", () => {
  assert.deepEqual(validateSettings({ brandTemplate: "azul" }), { brandTemplate: "azul" });
});

test("validateSettings accepts a small PNG data URI as the logo", () => {
  const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  assert.deepEqual(validateSettings({ brandLogoUrl: logo }), { brandLogoUrl: logo });
});

test("validateSettings accepts an https logo URL", () => {
  assert.deepEqual(validateSettings({ brandLogoUrl: "https://cdn.example.com/logo.png" }), { brandLogoUrl: "https://cdn.example.com/logo.png" });
});

test("validateSettings rejects a logo with an unsafe scheme", () => {
  assert.throws(() => validateSettings({ brandLogoUrl: "javascript:alert(1)" }), AppError);
});

test("validateSettings rejects a logo over 200KB", () => {
  const big = "data:image/png;base64," + "A".repeat(300_000);
  assert.throws(() => validateSettings({ brandLogoUrl: big }), AppError);
});

test("validateSettings rejects an unsupported logo mime type", () => {
  assert.throws(() => validateSettings({ brandLogoUrl: "data:image/gif;base64,AAAA" }), AppError);
});
