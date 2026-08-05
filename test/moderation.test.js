import test from "node:test";
import assert from "node:assert/strict";
import { MetaClient } from "../src/meta/client.js";

test("hides an Instagram comment through its comment id", async () => {
  let requestedUrl;
  let requestBody;
  const fetcher = async (url, options) => {
    requestedUrl = url;
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ success: true }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });

  await client.setCommentHidden("comment-1", true);

  assert.match(requestedUrl, /\/comment-1$/);
  assert.deepEqual(requestBody, { hide: true });
});
