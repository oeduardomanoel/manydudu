import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countHashtags, createPost, duePosts, referencedUploads } from "../src/domain/publishing.js";
import { createPostScheduler, publishReel } from "../src/meta/reel-publisher.js";
import { MetaClient } from "../src/meta/client.js";
import { JsonStore } from "../src/storage/json-store.js";
import { AppError } from "../src/util/errors.js";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const UPLOAD = "0b9f6c2e-1d3a-4c5b-9e8f-7a6b5c4d3e2f.mp4";
const base = { uploadId: UPLOAD, kind: "reel", caption: "Legenda #ia" };
const queued = (overrides = {}) => ({ ...createPost(base), mediaBaseUrl: "https://painel.exemplo.com", ...overrides });
const quiet = { log: () => {}, logError: () => {} };

test("createPost publishes now by default and keeps share_to_feed only for normal reels", () => {
  const post = createPost(base, { now: NOW });
  assert.equal(post.status, "scheduled");
  assert.equal(post.scheduled, false);
  assert.equal(post.scheduledAt, new Date(NOW).toISOString());
  assert.equal(post.shareToFeed, true);
  assert.equal(post.graduationStrategy, null);
  const trial = createPost({ ...base, kind: "trial", graduationStrategy: "SS_PERFORMANCE", shareToFeed: true }, { now: NOW });
  assert.equal(trial.shareToFeed, false);
  assert.equal(trial.graduationStrategy, "SS_PERFORMANCE");
});

test("createPost schedules for a future date and rejects past, far-away or invalid dates", () => {
  const post = createPost({ ...base, publishAt: "2026-11-11T09:30:00-03:00" }, { now: NOW });
  assert.equal(post.scheduled, true);
  assert.equal(post.scheduledAt, "2026-11-11T12:30:00.000Z");
  assert.throws(() => createPost({ ...base, publishAt: "2026-11-10T11:00:00Z" }, { now: NOW }), AppError);
  assert.throws(() => createPost({ ...base, publishAt: "2027-06-01T00:00:00Z" }, { now: NOW }), AppError);
  assert.throws(() => createPost({ ...base, publishAt: "amanha" }, { now: NOW }), AppError);
});

test("createPost validates kind, upload id, caption size, hashtags and graduation strategy", () => {
  assert.throws(() => createPost({ ...base, kind: "story" }), AppError);
  assert.throws(() => createPost({ ...base, uploadId: "../../etc/passwd" }), AppError);
  assert.throws(() => createPost({ ...base, caption: "a".repeat(2201) }), AppError);
  assert.throws(() => createPost({ ...base, caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ") }), AppError);
  assert.throws(() => createPost({ ...base, kind: "trial", graduationStrategy: "SEMPRE" }), AppError);
  assert.equal(countHashtags("#a #b texto #c"), 3);
});

test("duePosts returns only scheduled posts whose time has come, oldest first", () => {
  const posts = [
    { id: "late", status: "scheduled", scheduledAt: "2026-11-10T11:00:00Z" },
    { id: "future", status: "scheduled", scheduledAt: "2026-11-10T13:00:00Z" },
    { id: "earliest", status: "scheduled", scheduledAt: "2026-11-10T10:00:00Z" },
    { id: "done", status: "published", scheduledAt: "2026-11-10T09:00:00Z" },
  ];
  assert.deepEqual(duePosts(posts, NOW).map((post) => post.id), ["earliest", "late"]);
  assert.deepEqual([...referencedUploads([{ status: "failed", uploadId: "a" }, { status: "published", uploadId: "b" }])], ["a"]);
});

function fakeMeta(statuses = ["IN_PROGRESS", "FINISHED"]) {
  const calls = [];
  return {
    calls,
    createReelContainer: async (post) => { calls.push(["create", post.videoUrl]); return { id: "container-1" }; },
    getContainerStatus: async () => { const code = statuses.shift(); calls.push(["status", code]); return { status_code: code, status: code }; },
    publishContainer: async (id) => { calls.push(["publish", id]); return { id: "media-9" }; },
    getMediaPermalink: async () => "https://www.instagram.com/reel/abc/",
  };
}

test("publishReel points Meta at the public video link, waits for FINISHED and publishes", async () => {
  const meta = fakeMeta();
  const result = await publishReel({ meta, post: queued(), sleep: async () => {} });
  assert.deepEqual(result, { containerId: "container-1", mediaId: "media-9", permalink: "https://www.instagram.com/reel/abc/" });
  assert.deepEqual(meta.calls.map((call) => call[0]), ["create", "status", "status", "publish"]);
  assert.equal(meta.calls[0][1], `https://painel.exemplo.com/reel-media/${UPLOAD}`);
});

test("publishReel stops with a readable error when Meta rejects the video", async () => {
  const meta = fakeMeta(["ERROR"]);
  await assert.rejects(publishReel({ meta, post: queued(), sleep: async () => {} }), /A Meta recusou o vídeo/);
  assert.equal(meta.calls.some((call) => call[0] === "publish"), false);
});

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), "manydudu-publish-"));
  const store = new JsonStore(join(directory, "db.json"));
  await store.initialize();
  const uploadsDir = join(directory, "uploads");
  await mkdir(uploadsDir, { recursive: true });
  try { await run({ store, uploadsDir }); } finally { await rm(directory, { recursive: true, force: true }); }
}

test("scheduler publishes due posts, records the permalink and deletes the video file", async () => {
  await withStore(async ({ store, uploadsDir }) => {
    await writeFile(join(uploadsDir, UPLOAD), "video-bytes");
    const post = await store.addPost(queued());
    let statusDuringPublish;
    const scheduler = createPostScheduler({ store, meta: {}, uploadsDir, ...quiet,
      publish: async ({ post: current }) => { statusDuringPublish = (await store.getPost(current.id)).status; return { containerId: "c", mediaId: "m", permalink: "https://x/reel" }; } });
    await scheduler.tick();
    const saved = await store.getPost(post.id);
    assert.equal(statusDuringPublish, "publishing");
    assert.equal(saved.status, "published");
    assert.equal(saved.permalink, "https://x/reel");
    assert.deepEqual(await readdir(uploadsDir), []);
  });
});

const automation = { keyword: "skill", reply: "Oi {nome}! Responde SIM que eu te mando a {palavra}", publicReplies: ["Te mandei na DM 👊", "Olha a DM aí"],
  followUpEnabled: true, followUpText: "Aqui está 👇", followUpUrl: "https://exemplo.com/skill", deliveryStyle: "button", buttonTitle: "ACESSAR" };

test("createPost keeps a validated comment automation and rejects an invalid one before scheduling", () => {
  const post = createPost({ ...base, automation }, { now: NOW });
  assert.equal(post.automation.keyword, "skill");
  assert.equal(post.automation.responseMode, "both");
  assert.equal(post.automation.match, "contains");
  assert.equal(createPost(base, { now: NOW }).automation, null);
  assert.equal(createPost({ ...base, automation: { ...automation, enabled: false } }, { now: NOW }).automation, null);
  assert.throws(() => createPost({ ...base, automation: { ...automation, followUpUrl: "http://inseguro.com" } }, { now: NOW }), AppError);
  assert.throws(() => createPost({ ...base, automation: { keyword: "skill" } }, { now: NOW }), AppError);
});

test("scheduler creates the comment automation tied to the new Reel id after publishing", async () => {
  await withStore(async ({ store, uploadsDir }) => {
    await writeFile(join(uploadsDir, UPLOAD), "video");
    const post = await store.addPost(queued({ caption: "3 skills do Claude\nComenta SKILL", automation: createPost({ ...base, automation }).automation }));
    const scheduler = createPostScheduler({ store, meta: {}, uploadsDir, ...quiet, publish: async () => ({ containerId: "c", mediaId: "1790000", permalink: null }) });
    await scheduler.tick();
    const { rules } = await store.read();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].mediaId, "1790000");
    assert.equal(rules[0].mediaTitle, "3 skills do Claude");
    assert.equal(rules[0].keyword, "skill");
    assert.equal((await store.getPost(post.id)).ruleId, rules[0].id);
  });
});

test("a failed publish never creates the automation", async () => {
  await withStore(async ({ store, uploadsDir }) => {
    await writeFile(join(uploadsDir, UPLOAD), "video");
    await store.addPost(queued({ automation: createPost({ ...base, automation }).automation }));
    const scheduler = createPostScheduler({ store, meta: {}, uploadsDir, ...quiet, publish: async () => { throw new Error("Meta fora"); } });
    await scheduler.tick();
    assert.deepEqual((await store.read()).rules, []);
  });
});

test("scheduler marks failures, keeps the file for a retry and recovers posts interrupted mid-publish", async () => {
  await withStore(async ({ store, uploadsDir }) => {
    await writeFile(join(uploadsDir, UPLOAD), "video");
    const failing = await store.addPost(queued());
    const stuck = await store.addPost(queued({ status: "publishing" }));
    const noHttps = await store.addPost(queued({ mediaBaseUrl: "http://localhost:3000" }));
    const scheduler = createPostScheduler({ store, meta: {}, uploadsDir, intervalMs: 60_000, ...quiet,
      publish: async () => { throw new Error("Meta fora do ar"); } });
    const timer = await scheduler.start();
    clearInterval(timer);
    await scheduler.tick();
    const failed = await store.getPost(failing.id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.error, "Meta fora do ar");
    assert.match((await store.getPost(stuck.id)).error, /interrompida/);
    assert.match((await store.getPost(noHttps.id)).error, /https público/);
    assert.deepEqual(await readdir(uploadsDir), [UPLOAD]);
  });
});

test("scheduler deletes orphan uploads older than 24h but keeps recent and unrelated files", async () => {
  await withStore(async ({ store, uploadsDir }) => {
    const old = "11111111-1111-4111-8111-111111111111.mp4";
    const fresh = "22222222-2222-4222-8222-222222222222.mov";
    await writeFile(join(uploadsDir, old), "x");
    await writeFile(join(uploadsDir, fresh), "x");
    await writeFile(join(uploadsDir, "nao-mexer.txt"), "x");
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await utimes(join(uploadsDir, old), twoDaysAgo, twoDaysAgo);
    const scheduler = createPostScheduler({ store, meta: {}, uploadsDir, ...quiet });
    await scheduler.tick();
    assert.deepEqual((await readdir(uploadsDir)).sort(), [fresh, "nao-mexer.txt"]);
  });
});

test("MetaClient creates Reels and Trial Reels containers pointing at the video link", async () => {
  const bodies = [];
  const fetcher = async (url, options) => { bodies.push([url, JSON.parse(options.body)]); return { ok: true, headers: new Headers(), json: async () => ({ id: "c1" }) }; };
  const client = new MetaClient({ accessToken: "IG-test", instagramAccountId: "ig-1", fetcher, minWriteIntervalMs: 0 });
  await client.createReelContainer({ caption: "oi", kind: "reel", shareToFeed: false, videoUrl: "https://x/v.mp4" });
  await client.createReelContainer({ caption: "oi", kind: "trial", graduationStrategy: "MANUAL", videoUrl: "https://x/v.mp4" });
  await client.publishContainer("c1");
  assert.match(bodies[0][0], /\/ig-1\/media$/);
  assert.deepEqual(bodies[0][1], { media_type: "REELS", video_url: "https://x/v.mp4", caption: "oi", share_to_feed: false });
  assert.deepEqual(bodies[1][1], { media_type: "REELS", video_url: "https://x/v.mp4", caption: "oi", trial_params: { graduation_strategy: "MANUAL" } });
  assert.match(bodies[2][0], /\/ig-1\/media_publish$/);
  assert.deepEqual(bodies[2][1], { creation_id: "c1" });
});
