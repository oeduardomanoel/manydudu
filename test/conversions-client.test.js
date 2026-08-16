import test from "node:test";
import assert from "node:assert/strict";
import { sendConversionEvent } from "../src/meta/conversions-client.js";

test("sendConversionEvent posts the event wrapped in a data array with the access token", async () => {
  let captured;
  const fetcher = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ events_received: 1 }) };
  };
  const event = { event_name: "Purchase" };
  const result = await sendConversionEvent({ pixelId: "999", accessToken: "capi-token", event, fetcher });

  assert.equal(result.events_received, 1);
  assert.equal(captured.url, "https://graph.facebook.com/v23.0/999/events");
  const body = JSON.parse(captured.options.body);
  assert.deepEqual(body.data, [event]);
  assert.equal(body.access_token, "capi-token");
});

test("sendConversionEvent throws Meta's error message on a non-ok response", async () => {
  const fetcher = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid parameter" } }) });
  await assert.rejects(
    sendConversionEvent({ pixelId: "999", accessToken: "x", event: {}, fetcher }),
    /Invalid parameter/,
  );
});
