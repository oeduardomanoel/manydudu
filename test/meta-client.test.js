import test from "node:test";
import assert from "node:assert/strict";
import { MetaClient } from "../src/meta/client.js";

test("Instagram Login token uses graph.instagram.com", async () => {
  let requestedUrl;
  const fetcher = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ id: "reply-1" }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });

  await client.reply("comment-1", "Olá", "public");

  assert.match(requestedUrl, /^https:\/\/graph\.instagram\.com\//);
});

test("Facebook Login token uses graph.facebook.com", async () => {
  let requestedUrl;
  const fetcher = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ id: "reply-1" }) };
  };
  const client = new MetaClient({ accessToken: "EA-test", instagramAccountId: "ig-1", fetcher });

  await client.reply("comment-1", "Olá", "public");

  assert.match(requestedUrl, /^https:\/\/graph\.facebook\.com\//);
});

test("lists media with the fields needed by the dashboard", async () => {
  let requestedUrl;
  const fetcher = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ data: [{ id: "reel-1", media_product_type: "REELS" }] }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });

  const media = await client.listMedia();

  assert.equal(media[0].id, "reel-1");
  assert.match(requestedUrl, /\/me\/media\?/);
  assert.match(requestedUrl, /thumbnail_url/);
});

test("lists comments for a selected media id", async () => {
  let requestedUrl;
  const fetcher = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ data: [{ id: "comment-1", text: "Quero" }] }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });

  const comments = await client.listComments("reel-1");

  assert.equal(comments[0].id, "comment-1");
  assert.match(requestedUrl, /\/reel-1\/comments\?/);
});

test("sends a follow-up direct message to an Instagram-scoped id", async () => {
  let requestBody;
  const fetcher = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message_id: "message-1" }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });
  await client.sendDirect("person-1", "Aqui está: https://example.com");
  assert.deepEqual(requestBody.recipient, { id: "person-1" });
});

test("reads follower status from an Instagram-scoped profile", async () => {
  let requestedUrl;
  const fetcher = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ id: "person-1", username: "ana", is_user_follow_business: true }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });
  const profile = await client.getUserProfile("person-1");
  assert.equal(profile.is_user_follow_business, true);
  assert.match(requestedUrl, /is_user_follow_business/);
});

test("sends an Instagram URL button template", async () => {
  let requestBody;
  const fetcher = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message_id: "message-2" }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });
  await client.sendLinkButton("person-1", "Seu guia está pronto", "ABRIR GUIA", "https://example.com/guia");
  const payload = requestBody.message.attachment.payload;
  assert.equal(payload.template_type, "button");
  assert.deepEqual(payload.buttons[0], { type: "web_url", title: "ABRIR GUIA", url: "https://example.com/guia" });
});

test("sends the initial private reply as text only", async () => {
  let requestBody;
  let requestedUrl;
  const fetcher = async (url, options) => {
    requestedUrl = url;
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ recipient_id: "person-1" }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });
  await client.reply("comment-1", "Responda SIM para receber", "private", { quickReplyTitle: "SIM, QUERO" });
  assert.match(requestedUrl, /\/ig-1\/messages$/);
  assert.deepEqual(requestBody.message, { text: "Responda SIM para receber" });
});

test("sends profile and confirmation buttons for the follower gate", async () => {
  let requestBody;
  const fetcher = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message_id: "message-3" }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher });
  await client.sendFollowGate("person-1", { text: "Siga e confirme", profileUrl: "https://instagram.com/example/",
    followButtonTitle: "SEGUIR PERFIL", confirmFollowTitle: "JÁ SEGUI" });
  const buttons = requestBody.message.attachment.payload.buttons;
  assert.deepEqual(buttons[0], { type: "web_url", title: "SEGUIR PERFIL", url: "https://instagram.com/example/" });
  assert.deepEqual(buttons[1], { type: "postback", title: "JÁ SEGUI", payload: "CHECK_FOLLOW" });
});

test("waits for Meta retry-after and retries a throttled write", async () => {
  let attempts = 0;
  let now = 0;
  const waits = [];
  const fetcher = async () => {
    attempts += 1;
    if (attempts === 1) return {
      ok: false,
      status: 429,
      headers: { get: (name) => name.toLowerCase() === "retry-after" ? "2" : null },
      json: async () => ({ error: { message: "Too many calls", code: 4 } })
    };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: "reply-2" }) };
  };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher,
    now: () => now, sleep: async (milliseconds) => { waits.push(milliseconds); now += milliseconds; } });

  const result = await client.reply("comment-1", "Olá", "public");

  assert.equal(result.id, "reply-2");
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [2000]);
});
