import { randomUUID } from "node:crypto";
import { AppError } from "../util/errors.js";
import { createRule } from "./automation.js";

const AUTOMATION_FIELDS = ["name", "keyword", "match", "responseMode", "reply", "publicReplies", "followUpEnabled", "followUpText", "followUpUrl",
  "requireFollow", "followPrompt", "profileUrl", "followButtonTitle", "confirmFollowTitle", "deliveryStyle", "buttonTitle"];

// Automação de comentário que nasce junto com o Reel: o Reel agendado ainda não tem ID no
// Instagram, então ela fica guardada no post e só vira regra (presa ao ID) quando ele for publicado.
// Valida já agora com as mesmas regras de uma automação normal, pra erro aparecer na hora de agendar.
export function normalizePostAutomation(input) {
  if (!input || input.enabled === false) return null;
  const automation = Object.fromEntries(AUTOMATION_FIELDS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
  automation.match ??= "contains";
  automation.responseMode ??= "both";
  createRule({ ...automation, mediaId: "pendente" });
  return automation;
}

export const MAX_CAPTION_LENGTH = 2200;
export const MAX_HASHTAGS = 30;
export const MAX_VIDEO_BYTES = 1024 ** 3; // 1 GB — limite de Reels da Meta
export const VIDEO_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov" };
export const GRADUATION_STRATEGIES = ["MANUAL", "SS_PERFORMANCE"];
export const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov)$/;
const MIN_SCHEDULE_LEAD_MS = 60_000;
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;
const FINAL_STATUSES = new Set(["published"]);

export const countHashtags = (caption) => (String(caption ?? "").match(/#[^\s#]+/g) || []).length;

// Post de Reels na fila: "agora" vira agendado pro instante atual, e o publicador pega na hora.
export function createPost(input, { now = Date.now() } = {}) {
  const kind = input.kind === "trial" ? "trial" : input.kind === "reel" ? "reel" : null;
  if (!kind) throw new AppError("Escolha entre Reels e Trial Reels.");
  const uploadId = String(input.uploadId ?? "");
  if (!UPLOAD_ID.test(uploadId)) throw new AppError("Envie o vídeo antes de publicar.");
  const caption = String(input.caption ?? "").trim();
  if (caption.length > MAX_CAPTION_LENGTH) throw new AppError(`A legenda pode ter no máximo ${MAX_CAPTION_LENGTH} caracteres.`);
  if (countHashtags(caption) > MAX_HASHTAGS) throw new AppError(`O Instagram aceita no máximo ${MAX_HASHTAGS} hashtags por post.`);
  const graduationStrategy = kind === "trial" ? String(input.graduationStrategy ?? "MANUAL") : null;
  if (kind === "trial" && !GRADUATION_STRATEGIES.includes(graduationStrategy)) throw new AppError("Escolha como o Trial Reels vira Reels normal.");

  let scheduledAt = new Date(now).toISOString();
  const scheduled = Boolean(input.publishAt);
  if (scheduled) {
    const at = Date.parse(input.publishAt);
    if (Number.isNaN(at)) throw new AppError("Data de agendamento inválida.");
    if (at < now + MIN_SCHEDULE_LEAD_MS) throw new AppError("Agende pra pelo menos 1 minuto no futuro — ou escolha publicar agora.");
    if (at > now + MAX_SCHEDULE_AHEAD_MS) throw new AppError("Dá pra agendar no máximo 90 dias pra frente.");
    scheduledAt = new Date(at).toISOString();
  }

  return {
    id: randomUUID(),
    uploadId,
    fileName: String(input.fileName ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 120) || "video",
    size: Number(input.size) || 0,
    kind,
    graduationStrategy,
    shareToFeed: kind === "reel" ? input.shareToFeed !== false : false,
    caption,
    automation: normalizePostAutomation(input.automation),
    scheduled,
    scheduledAt,
    status: "scheduled",
    createdAt: new Date(now).toISOString(),
  };
}

export function duePosts(posts = [], now = Date.now()) {
  return posts
    .filter((post) => post.status === "scheduled" && Date.parse(post.scheduledAt) <= now)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}

// Arquivos de vídeo que ainda podem ser usados: os de posts que não foram publicados.
export function referencedUploads(posts = []) {
  return new Set(posts.filter((post) => !FINAL_STATUSES.has(post.status)).map((post) => post.uploadId));
}
