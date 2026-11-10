import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { duePosts, referencedUploads, UPLOAD_ID } from "../domain/publishing.js";

const ORPHAN_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Link público de onde a Meta baixa o vídeo — /reel-media/<uploadId> só responde enquanto o post
// está "publicando", e o nome do arquivo é um UUID aleatório.
export const reelMediaUrl = (post) => `${post.mediaBaseUrl}/reel-media/${post.uploadId}`;

// A Meta baixa e processa o vídeo de forma assíncrona: só dá pra publicar quando o container chega
// em FINISHED (vídeos longos levam alguns minutos).
export async function publishReel({ meta, post, sleep = wait, pollIntervalMs = 5000, timeoutMs = 20 * 60_000, now = Date.now }) {
  const container = await meta.createReelContainer({ ...post, videoUrl: reelMediaUrl(post) });
  const deadline = now() + timeoutMs;
  for (;;) {
    const status = await meta.getContainerStatus(container.id);
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`A Meta recusou o vídeo: ${status.status || status.status_code}. Confira formato (MP4/MOV, 9:16) e duração (3 s a 15 min).`);
    }
    if (now() > deadline) throw new Error("A Meta demorou demais pra processar o vídeo. Tente de novo.");
    await sleep(pollIntervalMs);
  }
  const published = await meta.publishContainer(container.id);
  let permalink = null;
  try { permalink = await meta.getMediaPermalink(published.id); } catch { /* o post já saiu — o link é só conveniência */ }
  return { containerId: container.id, mediaId: published.id, permalink };
}

export function createPostScheduler({ store, meta, uploadsDir, intervalMs = 30_000, log = console.log, logError = console.error, publish = publishReel }) {
  const running = new Set();
  let ticking = null;

  async function runPost(post) {
    running.add(post.id);
    const filePath = join(uploadsDir, post.uploadId);
    try {
      await stat(filePath);
      if (!post.mediaBaseUrl?.startsWith("https://")) throw new Error("O painel precisa estar num endereço https público pra Meta conseguir baixar o vídeo.");
      await store.updatePost(post.id, { status: "publishing", startedAt: new Date().toISOString(), error: null });
      const result = await publish({ meta, post });
      await store.updatePost(post.id, { status: "published", publishedAt: new Date().toISOString(), ...result });
      await unlink(filePath).catch(() => {});
      log(`Reel publicado: ${result.permalink || result.mediaId}`);
    } catch (error) {
      const message = error.code === "ENOENT" ? "O arquivo do vídeo não está mais no servidor. Envie de novo." : error.message;
      await store.updatePost(post.id, { status: "failed", failedAt: new Date().toISOString(), error: message }).catch(() => {});
      logError(`Falha ao publicar Reel ${post.id}: ${message}`);
    } finally {
      running.delete(post.id);
    }
  }

  // Apaga vídeos enviados que não viraram post (ou cujo post foi cancelado) depois de 24 h.
  async function cleanOrphans(posts) {
    const keep = referencedUploads(posts);
    let files = [];
    try { files = await readdir(uploadsDir); } catch { return; }
    for (const file of files) {
      if (!UPLOAD_ID.test(file) || keep.has(file)) continue;
      const path = join(uploadsDir, file);
      const info = await stat(path).catch(() => null);
      if (info && Date.now() - info.mtimeMs > ORPHAN_UPLOAD_MAX_AGE_MS) await unlink(path).catch(() => {});
    }
  }

  async function tick() {
    if (ticking) return ticking;
    ticking = (async () => {
      const posts = await store.listPosts();
      for (const post of duePosts(posts)) {
        if (!running.has(post.id)) await runPost(post);
      }
      await cleanOrphans(posts);
    })().catch((error) => logError(`Falha no agendador de Reels: ${error.message}`)).finally(() => { ticking = null; });
    return ticking;
  }

  // Post que estava "publicando" quando o servidor caiu: não dá pra saber se saiu ou não, então
  // marca como falha pra pessoa conferir no Instagram antes de tentar de novo (evita post duplicado).
  async function recoverInterrupted() {
    const posts = await store.listPosts();
    for (const post of posts.filter((item) => item.status === "publishing")) {
      await store.updatePost(post.id, { status: "failed", failedAt: new Date().toISOString(),
        error: "A publicação foi interrompida (o servidor reiniciou). Confira no Instagram se o Reel saiu antes de tentar de novo." });
    }
  }

  return {
    tick,
    kick: () => { void tick(); },
    async start() {
      await recoverInterrupted().catch((error) => logError(`Falha ao recuperar posts interrompidos: ${error.message}`));
      void tick();
      const timer = setInterval(() => { void tick(); }, intervalMs);
      timer.unref?.();
      return timer;
    },
  };
}
