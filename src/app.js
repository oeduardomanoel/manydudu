import { randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createPost, MAX_VIDEO_BYTES, UPLOAD_ID, VIDEO_TYPES } from "./domain/publishing.js";
import { createRule, findMatchingRule, selectPublicReply, suggestKeywords, updateRule } from "./domain/automation.js";
import { buildAnalytics } from "./domain/analytics.js";
import { extractComments, extractMessages, extractPostbacks, parseSignedRequest, verifyMetaSignature } from "./meta/webhook.js";
import { createCampaign, createLead, updateCampaign } from "./domain/campaigns.js";
import { exportPackage, parsePackage } from "./domain/automation-package.js";
import { applyBackup, exportState, validateBackup } from "./domain/backup.js";
import { buildHealthReport } from "./domain/health.js";
import { paginateActivity } from "./domain/activity.js";
import { isFatigued } from "./domain/fatigue.js";
import { scoreContact, scoreLead } from "./domain/lead-score.js";
import { isStale } from "./domain/retention.js";
import { buildContentRoi } from "./domain/roi.js";
import { validateSettings } from "./domain/settings.js";
import { deliverStageChange, isBlockedTarget } from "./domain/outbound-webhook.js";
import { buildPurchaseEvent } from "./domain/purchase-event.js";
import { sendConversionEvent } from "./meta/conversions-client.js";
import { planUsernameResync } from "./domain/username-resync.js";
import { PIPELINE_STAGES } from "./domain/pipeline.js";
import { AppError } from "./util/errors.js";
import { sanitizeHtml } from "./util/html.js";
import { safeFilename } from "./util/filename.js";
import { renderContentPage, renderGatePage, renderNotFound } from "./pages/gate.js";
import { renderSetupPage } from "./pages/setup.js";
import { upsertEnvFile } from "./util/env-file.js";
import { debugToken } from "./meta/token-refresh.js";
import { checkPassword, clearCsrfCookie, clearLoginAttempts, clearSessionCookie, createAccessCookie, createCsrfCookie, createSessionCookie, getClientIp, hashPassword, isLeadRateLimited, isLoginRateLimited, isSecureRequest, isSetupRateLimited, isSetupRequestAuthorized, readAccessSlugs, readSession, recordFailedLogin, recordLeadSubmission, recordSetupAttempt, verifyCsrf, verifyPasswordHash } from "./auth.js";

const json = (response, status, body) => { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); };
const html = (response, status, body) => { response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }); response.end(body); };
const withCookie = (response, cookie) => response.appendHeader("Set-Cookie", cookie);
const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

const MAX_RAW_CONTENT_LENGTH = 200_000;
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' blob:; script-src 'self'; frame-ancestors 'none'";
function applySecurityHeaders(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Content-Security-Policy", CSP);
  if (isSecureRequest(request)) response.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
}

async function maybeNotifyStageChange(store, kind, id, label, previousStage, record) {
  if (!record || previousStage === record.stage) return;
  const settings = await store.getSettings();
  if (!settings.outboundWebhookUrl) return;
  const payload = { event: "pipeline.stage_changed", kind, id, label, previousStage: previousStage ?? null, stage: record.stage, at: new Date().toISOString(), source: "manydudu" };
  try { await deliverStageChange({ url: settings.outboundWebhookUrl, payload }); }
  catch (error) { console.error(`Falha ao entregar webhook de saída: ${error.message}`); }
}

function requiresAuth(pathname, method) {
  if (pathname === "/" || pathname === "/index.html") return true;
  if (!pathname.startsWith("/api/")) return false;
  if (pathname === "/api/login") return false;
  if (pathname === "/api/branding") return false;
  if (pathname === "/api/leads" && method === "POST") return false;
  if (pathname === "/api/meta/data-deletion" && method === "POST") return false;
  return true;
}

async function readBody(request, limit = 1_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new AppError("Payload muito grande."); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

// Grava o corpo da requisição direto no disco (vídeo de até 1 GB não cabe no readBody em memória).
async function saveUpload(request, path, limit) {
  let size = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(size > limit ? new AppError("Vídeo grande demais — o limite do Instagram é 1 GB.") : null, chunk);
    },
  });
  try {
    await pipeline(request, counter, createWriteStream(path));
  } catch (error) {
    await unlink(path).catch(() => {});
    throw error;
  }
  return size;
}

// Endereço público do painel como o navegador do admin vê (atrás do proxy do Coolify): é de onde
// a Meta vai baixar o vídeo.
function publicBaseUrl(request) {
  const proto = String(request.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() || (isSecureRequest(request) ? "https" : "http");
  const host = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "").split(",")[0].trim();
  return `${proto}://${host}`;
}

// Vídeo com suporte a Range (bytes=início-fim) — quem baixa vídeo costuma pedir em pedaços.
function sendVideo(request, response, path, size, type) {
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range ?? ""));
  let start = 0; let end = size - 1;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { response.writeHead(416, { "Content-Range": `bytes */${size}` }); return response.end(); }
  }
  const partial = Boolean(range && (range[1] || range[2]));
  response.writeHead(partial ? 206 : 200, { "Content-Type": type, "Content-Length": end - start + 1, "Accept-Ranges": "bytes", "Cache-Control": "no-store",
    ...(partial ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
  if (request.method === "HEAD") return response.end();
  createReadStream(path, { start, end }).pipe(response);
}

export function createApp({ store, meta, config, serveStatic, scheduler = null }) {
  return async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    applySecurityHeaders(request, response);
    try {
      const campaignPath = url.pathname.match(/^\/c\/([a-z0-9-]+)$/);
      if (request.method === "GET" && campaignPath) {
        const campaign = await store.getCampaignBySlug(campaignPath[1]);
        if (!campaign || !campaign.active) return html(response, 404, renderNotFound(await store.getSettings()));
        const slugs = readAccessSlugs(request, config.sessionSecret);
        const settings = await store.getSettings();
        return html(response, 200, slugs.includes(campaign.slug) ? renderContentPage(campaign, settings) : renderGatePage(campaign, settings));
      }
      if (url.pathname === "/setup" || url.pathname.startsWith("/api/setup/")) {
        if (!isSetupRequestAuthorized(request, url, config)) return html(response, 404, renderNotFound(await store.getSettings()));
        if (isSetupRateLimited(request)) return json(response, 429, { error: "Muitas tentativas. Aguarde um pouco e tente de novo." });
        recordSetupAttempt(request);
        if (request.method === "GET" && url.pathname === "/setup") {
          return html(response, 200, renderSetupPage(url.searchParams.get("token")));
        }
        if (request.method === "POST" && url.pathname === "/api/setup/test-meta") {
          const { metaAccessToken, metaAppId, metaAppSecret } = JSON.parse(await readBody(request));
          if (!metaAccessToken) return json(response, 400, { error: "Informe o token de acesso." });
          if (!metaAppId || !metaAppSecret) return json(response, 400, { error: "Informe o App ID e o App Secret primeiro." });
          try {
            const info = await debugToken(metaAccessToken, metaAppId, metaAppSecret);
            const days = info.expires_at ? Math.max(0, Math.round((info.expires_at * 1000 - Date.now()) / 86400000)) : null;
            return json(response, 200, { ok: true, message: days != null ? `Token válido — expira em ${days} dias.` : "Token válido." });
          } catch (error) {
            return json(response, 400, { error: `Não consegui validar o token: ${error.message}` });
          }
        }
        if (request.method === "POST" && url.pathname === "/api/setup/test-supabase") {
          const { supabaseUrl, supabaseSecretKey } = JSON.parse(await readBody(request));
          if (!supabaseUrl && !supabaseSecretKey) return json(response, 200, { ok: true, message: "Sem Supabase — vai usar arquivo local." });
          if (!supabaseUrl || !supabaseSecretKey) return json(response, 400, { error: "Informe URL e secret key, ou deixe os dois em branco." });
          let hostname;
          try { hostname = new URL(supabaseUrl).hostname; } catch { return json(response, 400, { error: "URL do Supabase inválida." }); }
          if (await isBlockedTarget(hostname)) return json(response, 400, { error: "Esse endereço é bloqueado (aponta pra um endereço de metadados de nuvem)." });
          try {
            const testResponse = await fetch(`${String(supabaseUrl).replace(/\/$/, "")}/rest/v1/manydudu_state?select=id&limit=1`,
              { headers: { apikey: supabaseSecretKey }, signal: AbortSignal.timeout(6000) });
            if (testResponse.status === 200) return json(response, 200, { ok: true, message: "Conectado ✓ — tabela encontrada." });
            if (testResponse.status === 401 || testResponse.status === 403) return json(response, 400, { error: "Credenciais recusadas — confira a URL e a secret key." });
            if (testResponse.status === 404) return json(response, 400, { error: "Conectei, mas a tabela \"manydudu_state\" não existe ainda — rode o SQL do passo acima no SQL Editor do Supabase primeiro." });
            return json(response, 400, { error: `Supabase respondeu ${testResponse.status} — confira a URL e a secret key.` });
          } catch {
            return json(response, 400, { error: "Não consegui conectar nesse endereço." });
          }
        }
        if (request.method === "POST" && url.pathname === "/api/setup/complete") {
          const input = JSON.parse(await readBody(request));
          const adminUser = String(input.adminUser ?? "").trim();
          const adminPassword = String(input.adminPassword ?? "");
          if (!adminUser) throw new AppError("Informe o usuário do painel.");
          if (adminPassword.length < 8) throw new AppError("A senha precisa ter pelo menos 8 caracteres.");
          const metaAccessToken = String(input.metaAccessToken ?? "").trim();
          const metaAppId = String(input.metaAppId ?? "").trim();
          const metaAppSecret = String(input.metaAppSecret ?? "").trim();
          const instagramAccountId = String(input.instagramAccountId ?? "").trim();
          if (!metaAccessToken || !metaAppId || !metaAppSecret || !instagramAccountId) throw new AppError("Preencha as credenciais da Meta.");
          const metaVerifyToken = String(input.metaVerifyToken ?? "").trim() || randomBytes(16).toString("hex");
          const supabaseUrl = String(input.supabaseUrl ?? "").trim();
          const supabaseSecretKey = String(input.supabaseSecretKey ?? "").trim();
          if (Boolean(supabaseUrl) !== Boolean(supabaseSecretKey)) throw new AppError("Informe URL e secret key do Supabase juntas, ou deixe os dois em branco.");

          const adminPasswordHash = hashPassword(adminPassword);
          const updates = {
            ADMIN_USER: adminUser, ADMIN_PASSWORD: adminPasswordHash, SESSION_SECRET: randomBytes(32).toString("hex"),
            META_ACCESS_TOKEN: metaAccessToken, META_APP_ID: metaAppId, META_APP_SECRET: metaAppSecret, META_VERIFY_TOKEN: metaVerifyToken,
            INSTAGRAM_ACCOUNT_ID: instagramAccountId,
          };
          if (supabaseUrl) { updates.SUPABASE_URL = supabaseUrl; updates.SUPABASE_SECRET_KEY = supabaseSecretKey; }
          await upsertEnvFile(config.envPath, updates);
          config.adminUser = adminUser;
          config.adminPassword = adminPasswordHash;
          return json(response, 200, { ok: true, metaVerifyToken });
        }
        if (request.method === "POST" && url.pathname === "/api/setup/restart") {
          json(response, 200, { ok: true });
          setImmediate(() => process.exit(0));
          return;
        }
        return json(response, 404, { error: "Rota de configuração não encontrada." });
      }
      if (request.method === "POST" && url.pathname === "/api/leads") {
        if (isLeadRateLimited(request)) return json(response, 429, { error: "Muitos envios. Aguarde um pouco e tente de novo." });
        recordLeadSubmission(request);
        const { slug, company, ...input } = JSON.parse(await readBody(request));
        if (String(company ?? "").trim()) return json(response, 201, { ok: true });
        const campaign = await store.getCampaignBySlug(String(slug ?? ""));
        if (!campaign || !campaign.active) return json(response, 404, { error: "Campanha não encontrada." });
        const lead = createLead(input, campaign.slug);
        await store.addLead(lead);
        const slugs = readAccessSlugs(request, config.sessionSecret);
        withCookie(response, createAccessCookie([...slugs, campaign.slug], config.sessionSecret, request));
        return json(response, 201, { ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/login") {
        if (isLoginRateLimited(request)) return json(response, 429, { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
        const { user, password } = JSON.parse(await readBody(request));
        const valid = checkPassword(user, config.adminUser) && config.adminPassword && verifyPasswordHash(password, config.adminPassword);
        if (!valid) {
          recordFailedLogin(request);
          await store.log({ id: randomUUID(), status: "login_failed", user: String(user ?? "").slice(0, 60), ip: getClientIp(request), at: new Date().toISOString() });
          return json(response, 401, { error: "Usuário ou senha inválidos." });
        }
        clearLoginAttempts(request);
        withCookie(response, createSessionCookie(user, config.sessionSecret, request, config.adminPassword));
        withCookie(response, createCsrfCookie(request));
        return json(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/branding") {
        const { brandName, brandHandle, brandTagline, brandTemplate, brandLogoUrl } = await store.getSettings();
        return json(response, 200, { brandName, brandHandle, brandTagline, brandTemplate, brandLogoUrl });
      }
      if (request.method === "POST" && url.pathname === "/api/meta/data-deletion") {
        // Required by Meta Platform Terms for any app using Instagram/Facebook login:
        // when someone revokes the app's permission, Meta calls this with a signed
        // payload identifying them — honor it by erasing what we hold on that person.
        const body = (await readBody(request)).toString("utf8");
        const signedRequest = new URLSearchParams(body).get("signed_request");
        const payload = parseSignedRequest(signedRequest, config.appSecret);
        if (!payload?.user_id) return json(response, 400, { error: "signed_request inválido." });
        await store.deleteContact(String(payload.user_id));
        const confirmationCode = randomUUID();
        return json(response, 200, { url: `https://${request.headers.host}/`, confirmation_code: confirmationCode });
      }
      if (requiresAuth(url.pathname, request.method) && !readSession(request, config.sessionSecret, config.adminPassword)) {
        return url.pathname.startsWith("/api/") ? json(response, 401, { error: "Sessão expirada. Faça login novamente." })
          : (response.writeHead(302, { Location: "/login.html" }), response.end());
      }
      if (WRITE_METHODS.has(request.method) && requiresAuth(url.pathname, request.method) && !verifyCsrf(request)) {
        return json(response, 403, { error: "Token CSRF inválido ou ausente. Recarregue a página e tente de novo." });
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        withCookie(response, clearSessionCookie(request));
        withCookie(response, clearCsrfCookie(request));
        return json(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/campaigns") {
        return json(response, 200, { campaigns: await store.listCampaigns() });
      }
      if (request.method === "POST" && url.pathname === "/api/campaigns") {
        const input = JSON.parse(await readBody(request));
        if (String(input.contentHtml ?? "").length > MAX_RAW_CONTENT_LENGTH) return json(response, 400, { error: "Conteúdo muito longo." });
        const campaign = createCampaign({ ...input, contentHtml: sanitizeHtml(input.contentHtml) });
        await store.addCampaign(campaign);
        return json(response, 201, campaign);
      }
      if (request.method === "POST" && url.pathname === "/api/campaigns/preview") {
        // prévia do que ainda não foi salvo — mesma validação e mesmo HTML das páginas públicas
        const { view, ...input } = JSON.parse(await readBody(request));
        if (String(input.contentHtml ?? "").length > MAX_RAW_CONTENT_LENGTH) return json(response, 400, { error: "Conteúdo muito longo." });
        const campaign = createCampaign({ ...input, title: String(input.title ?? "").trim() || "Título da campanha", slug: "previa",
          contentHtml: sanitizeHtml(input.contentHtml).trim() || "<p>O conteúdo da entrega aparece aqui.</p>" });
        const settings = await store.getSettings();
        const page = view === "content" ? renderContentPage(campaign, settings) : renderGatePage(campaign, settings, { preview: true });
        return json(response, 200, { html: page });
      }
      const campaignAdminPath = url.pathname.match(/^\/api\/campaigns\/([a-z0-9-]+)$/);
      if (campaignAdminPath && request.method === "PATCH") {
        const existing = await store.getCampaignBySlug(campaignAdminPath[1]);
        if (!existing) return json(response, 404, { error: "Campanha não encontrada." });
        const input = JSON.parse(await readBody(request));
        if (String(input.contentHtml ?? "").length > MAX_RAW_CONTENT_LENGTH) return json(response, 400, { error: "Conteúdo muito longo." });
        const campaign = updateCampaign(existing, { ...input, contentHtml: sanitizeHtml(input.contentHtml) });
        await store.replaceCampaign(existing.slug, campaign);
        return json(response, 200, campaign);
      }
      if (campaignAdminPath && request.method === "DELETE") {
        await store.deleteCampaign(campaignAdminPath[1]);
        return json(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/leads") {
        const leads = await store.listLeads();
        return json(response, 200, { leads: leads.map((lead) => ({ ...lead, score: scoreLead(lead), stale: isStale(lead) })) });
      }
      const leadAdminPath = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
      if (leadAdminPath && request.method === "PATCH") {
        const changes = JSON.parse(await readBody(request));
        if (changes.stage !== undefined && !PIPELINE_STAGES.includes(changes.stage)) return json(response, 400, { error: "Estágio inválido." });
        const previousLead = (await store.listLeads()).find((item) => item.id === leadAdminPath[1]);
        const lead = await store.updateLead(leadAdminPath[1], changes);
        if (lead) void maybeNotifyStageChange(store, "lead", lead.id, lead.name, previousLead?.stage, lead);
        return lead ? json(response, 200, lead) : json(response, 404, { error: "Lead não encontrado." });
      }
      if (leadAdminPath && request.method === "DELETE") {
        await store.deleteLead(leadAdminPath[1]);
        return json(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/webhook") {
        const valid = Boolean(config.verifyToken) && url.searchParams.get("hub.mode") === "subscribe" && checkPassword(url.searchParams.get("hub.verify_token") ?? "", config.verifyToken);
        response.writeHead(valid ? 200 : 403, { "Content-Type": "text/plain" }); return response.end(valid ? url.searchParams.get("hub.challenge") ?? "" : "Forbidden");
      }
      if (request.method === "POST" && url.pathname === "/webhook") {
        const body = await readBody(request);
        if (!verifyMetaSignature(body, request.headers["x-hub-signature-256"], config.appSecret)) return json(response, 401, { error: "Assinatura inválida." });
        const payload = JSON.parse(body);
        const comments = extractComments(payload);
        const messages = [...extractMessages(payload), ...extractPostbacks(payload)];
        response.writeHead(200); response.end("EVENT_RECEIVED");
        // fire-and-forget by design (the Meta webhook already got its 200) — but an
        // unhandled rejection here would crash the whole process (Node kills the process
        // on an uncaught unhandledRejection), so a single malformed event must never be
        // allowed to take the instance down
        void Promise.all([processComments(comments, store, meta), processMessages(messages, store, meta)])
          .catch((error) => console.error("Falha ao processar evento de webhook:", error));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        const state = await store.read();
        return json(response, 200, { rules: state.rules, activity: state.activity, configured: config.configured, keywordSuggestions: suggestKeywords(state.activity) });
      }
      if (request.method === "GET" && url.pathname === "/api/media") {
        return json(response, 200, { media: await meta.listMedia() });
      }
      if (request.method === "GET" && url.pathname === "/api/contacts") {
        const contacts = await store.listContacts();
        return json(response, 200, { contacts: contacts.map((contact) => ({ ...contact, score: scoreContact(contact), stale: isStale(contact) })) });
      }
      if (request.method === "POST" && url.pathname === "/api/contacts/resync-usernames") {
        const contacts = await store.listContacts();
        const plan = planUsernameResync(contacts);
        let cleaned = 0, attempted = 0, resolved = 0;
        for (const step of plan) {
          if (step.clearLegacy) { await store.setContactUsername(step.id, null); cleaned++; }
          if (step.attemptLookup) {
            attempted++;
            try {
              const profile = await meta.getUserProfile(step.id);
              if (profile.username) { await store.setContactUsername(step.id, profile.username); resolved++; }
            } catch { /* sem consentimento de mensagem ainda, ou erro da API — mantém sem nome */ }
          }
        }
        return json(response, 200, { ok: true, total: contacts.length, cleaned, attempted, resolved });
      }
      if (request.method === "GET" && url.pathname === "/api/analytics") {
        const state = await store.read();
        return json(response, 200, buildAnalytics(state));
      }
      if (request.method === "GET" && url.pathname === "/api/moderation/comments") {
        const media = await meta.listMedia(12);
        const groups = await Promise.all(media.map(async (item) => ({ media: item, comments: await meta.listComments(item.id, 25) })));
        const comments = groups.flatMap(({ media: item, comments: items }) => items.map((comment) => ({ ...comment,
          mediaId: item.id, mediaCaption: item.caption || "Sem legenda", mediaThumbnail: item.thumbnail_url || item.media_url || "" })))
          .sort((left, right) => String(right.created_time).localeCompare(String(left.created_time)));
        return json(response, 200, { comments });
      }
      const moderationPath = url.pathname.match(/^\/api\/moderation\/comments\/([^/]+)\/(reply|hidden)$/);
      if (request.method === "POST" && moderationPath?.[2] === "reply") {
        const { message } = JSON.parse(await readBody(request));
        const text = String(message ?? "").trim();
        if (!text || text.length > 1000) throw new AppError("A resposta deve ter entre 1 e 1000 caracteres.");
        const result = await meta.reply(moderationPath[1], text, "public");
        return json(response, 201, result);
      }
      if (request.method === "POST" && moderationPath?.[2] === "hidden") {
        const { hidden } = JSON.parse(await readBody(request));
        return json(response, 200, await meta.setCommentHidden(moderationPath[1], Boolean(hidden)));
      }
      const contactPath = url.pathname.match(/^\/api\/contacts\/([^/]+)$/);
      if (request.method === "GET" && contactPath) {
        const contact = await store.getContact(contactPath[1]);
        return contact ? json(response, 200, contact) : json(response, 404, { error: "Contato não encontrado." });
      }
      if (request.method === "PATCH" && contactPath) {
        const changes = JSON.parse(await readBody(request));
        if (changes.stage !== undefined && !PIPELINE_STAGES.includes(changes.stage)) return json(response, 400, { error: "Estágio inválido." });
        const previousContact = await store.getContact(contactPath[1]);
        const contact = await store.updateContact(contactPath[1], changes);
        if (contact) {
          const label = contact.username ? `@${contact.username}` : contact.id;
          void maybeNotifyStageChange(store, "contact", contact.id, label, previousContact?.stage, contact);
        }
        return contact ? json(response, 200, contact) : json(response, 404, { error: "Contato não encontrado." });
      }
      if (request.method === "DELETE" && contactPath) {
        await store.deleteContact(contactPath[1]);
        return json(response, 200, { ok: true });
      }
      const contactActionPath = url.pathname.match(/^\/api\/contacts\/([^/]+)\/(messages|pause|mark-paid)$/);
      if (request.method === "POST" && contactActionPath?.[2] === "pause") {
        const { paused } = JSON.parse(await readBody(request));
        if (!(await store.getContact(contactActionPath[1]))) return json(response, 404, { error: "Contato não encontrado." });
        await store.setContactPaused(contactActionPath[1], Boolean(paused));
        return json(response, 200, { ok: true, paused: Boolean(paused) });
      }
      if (request.method === "POST" && contactActionPath?.[2] === "messages") {
        const { text } = JSON.parse(await readBody(request));
        const message = String(text ?? "").trim();
        if (!message || message.length > 1000) throw new AppError("A mensagem deve ter entre 1 e 1000 caracteres.");
        const contact = await store.getContact(contactActionPath[1]);
        if (!contact) return json(response, 404, { error: "Contato não encontrado." });
        await meta.sendDirect(contactActionPath[1], message);
        await store.recordContactEvent({ contactId: contactActionPath[1], username: contact.username, type: "outgoing",
          text: message, at: new Date().toISOString() });
        await store.setContactPaused(contactActionPath[1], true);
        return json(response, 201, { ok: true });
      }
      if (request.method === "POST" && contactActionPath?.[2] === "mark-paid") {
        const contactId = contactActionPath[1];
        const contact = await store.getContact(contactId);
        if (!contact) return json(response, 404, { error: "Contato não encontrado." });
        const { value, currency } = JSON.parse(await readBody(request));
        const settings = await store.getSettings();
        if (!settings.metaPixelId || !settings.metaCapiToken) throw new AppError("Configure o Pixel ID e o token do Conversions API primeiro.");
        const event = buildPurchaseEvent({ contactId, value, currency });
        await sendConversionEvent({ pixelId: settings.metaPixelId, accessToken: settings.metaCapiToken, event });
        await store.recordContactEvent({ contactId, username: contact.username, type: "purchase",
          text: `Marcado como pago — ${event.custom_data.currency} ${event.custom_data.value.toFixed(2)}`, at: new Date().toISOString() });
        return json(response, 200, { ok: true });
      }
      const commentsPath = url.pathname.match(/^\/api\/media\/([^/]+)\/comments$/);
      if (request.method === "GET" && commentsPath) {
        return json(response, 200, { comments: await meta.listComments(commentsPath[1]) });
      }
      if (request.method === "POST" && url.pathname === "/api/rules") {
        const rule = createRule(JSON.parse(await readBody(request))); await store.addRule(rule); return json(response, 201, rule);
      }
      const rulePath = url.pathname.match(/^\/api\/rules\/([^/]+)(\/toggle)?$/);
      if (rulePath && !rulePath[2] && request.method === "PATCH") {
        const state = await store.read();
        const existing = state.rules.find((rule) => rule.id === rulePath[1]);
        if (!existing) return json(response, 404, { error: "Automação não encontrada." });
        const rule = updateRule(existing, JSON.parse(await readBody(request)));
        await store.replaceRule(existing.id, rule);
        return json(response, 200, rule);
      }
      if (rulePath && request.method === "DELETE") { await store.deleteRule(rulePath[1]); return json(response, 200, { ok: true }); }
      if (rulePath?.[2] && request.method === "POST") { await store.toggleRule(rulePath[1]); return json(response, 200, { ok: true }); }
      const ruleExportPath = url.pathname.match(/^\/api\/rules\/([^/]+)\/export$/);
      if (ruleExportPath && request.method === "GET") {
        const state = await store.read();
        const rule = state.rules.find((item) => item.id === ruleExportPath[1]);
        if (!rule) return json(response, 404, { error: "Automação não encontrada." });
        const campaignSlug = url.searchParams.get("campaignSlug");
        const campaign = campaignSlug ? await store.getCampaignBySlug(campaignSlug) : null;
        const pkg = exportPackage(rule, campaign);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${safeFilename(rule.keyword, "automacao")}.json"` });
        return response.end(JSON.stringify(pkg, null, 2));
      }
      if (request.method === "GET" && url.pathname === "/api/settings") {
        return json(response, 200, await store.getSettings());
      }
      if (request.method === "PATCH" && url.pathname === "/api/settings") {
        const validated = validateSettings(JSON.parse(await readBody(request)));
        if (validated.outboundWebhookUrl && await isBlockedTarget(new URL(validated.outboundWebhookUrl).hostname)) {
          throw new AppError("Esse endereço é bloqueado (aponta pra um endereço de metadados de nuvem).");
        }
        return json(response, 200, await store.setSettings(validated));
      }
      if (request.method === "POST" && url.pathname === "/api/settings/test-webhook") {
        const settings = await store.getSettings();
        if (!settings.outboundWebhookUrl) return json(response, 400, { error: "Configure a URL do webhook primeiro." });
        try {
          await deliverStageChange({ url: settings.outboundWebhookUrl, payload: { event: "manydudu.test", message: "Teste de conexão do ManyDudu", at: new Date().toISOString(), source: "manydudu" } });
          return json(response, 200, { ok: true });
        } catch (error) {
          return json(response, 400, { error: error.message });
        }
      }
      if (request.method === "GET" && url.pathname === "/api/content-roi") {
        const contacts = await store.listContacts();
        let media = [];
        try { media = await meta.listMedia(50); } catch { media = []; }
        const mediaLookup = Object.fromEntries(media.map((item) => [item.id, item]));
        return json(response, 200, { items: buildContentRoi(contacts, mediaLookup) });
      }
      if (request.method === "GET" && url.pathname === "/api/activity") {
        const state = await store.read();
        const page = paginateActivity(state.activity, {
          limit: url.searchParams.get("limit"), offset: url.searchParams.get("offset"),
          status: url.searchParams.get("status") || undefined, ruleId: url.searchParams.get("ruleId") || undefined,
        });
        return json(response, 200, page);
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        const started = Date.now();
        let storeStatus; let metaToken = null; let lastEventAt = null;
        try {
          const state = await store.read();
          storeStatus = { ok: true, backend: store.backend, latencyMs: Date.now() - started };
          metaToken = state.metaToken ?? null;
          lastEventAt = state.activity?.[0]?.at ?? null;
        } catch (error) {
          storeStatus = { ok: false, backend: store.backend, error: error.message };
        }
        const tokenCheck = meta.accessToken ? await meta.checkToken() : null;
        const report = buildHealthReport({ metaToken: metaToken?.accessToken === meta.accessToken ? metaToken : null, tokenConfigured: Boolean(meta.accessToken),
          tokenCheck, usage: meta.getUsageSnapshot(), webhookConfigured: config.configured, lastEventAt, storeStatus });
        return json(response, 200, report);
      }
      if (request.method === "GET" && url.pathname === "/api/backup") {
        const backup = exportState(await store.read());
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="manydudu-backup-${new Date().toISOString().slice(0, 10)}.json"` });
        return response.end(JSON.stringify(backup, null, 2));
      }
      if (request.method === "POST" && url.pathname === "/api/backup/restore") {
        const sanitized = validateBackup((await readBody(request, 5_000_000)).toString("utf8"));
        await store.update((state) => applyBackup(state, sanitized));
        return json(response, 200, { ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/automation-packages/import") {
        const { rule: ruleData, campaign: campaignData } = parsePackage((await readBody(request)).toString("utf8"));
        const rule = createRule(ruleData);
        await store.addRule(rule);
        let campaign = null;
        if (campaignData) {
          campaign = createCampaign({ ...campaignData, contentHtml: sanitizeHtml(campaignData.contentHtml) });
          await store.addCampaign(campaign);
        }
        return json(response, 201, { rule, campaign });
      }
      const reelMediaPath = url.pathname.match(/^\/reel-media\/([^/]+)$/);
      if (reelMediaPath && (request.method === "GET" || request.method === "HEAD")) {
        // de onde a Meta baixa o vídeo na hora de publicar — só existe enquanto o post está "publicando"
        const uploadId = reelMediaPath[1];
        const posts = UPLOAD_ID.test(uploadId) ? await store.listPosts() : [];
        const info = posts.some((post) => post.uploadId === uploadId && post.status === "publishing")
          ? await stat(join(config.uploadsDir, uploadId)).catch(() => null) : null;
        if (!info) { response.writeHead(404); return response.end(); }
        return sendVideo(request, response, join(config.uploadsDir, uploadId), info.size, uploadId.endsWith(".mov") ? "video/quicktime" : "video/mp4");
      }
      if (request.method === "POST" && url.pathname === "/api/posts/upload") {
        const extension = VIDEO_TYPES[String(request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase()];
        if (!extension) return json(response, 400, { error: "Envie um vídeo MP4 ou MOV." });
        if (Number(request.headers["content-length"] ?? 0) > MAX_VIDEO_BYTES) return json(response, 400, { error: "Vídeo grande demais — o limite do Instagram é 1 GB." });
        await mkdir(config.uploadsDir, { recursive: true });
        const uploadId = `${randomUUID()}.${extension}`;
        const size = await saveUpload(request, join(config.uploadsDir, uploadId), MAX_VIDEO_BYTES);
        if (!size) { await unlink(join(config.uploadsDir, uploadId)).catch(() => {}); return json(response, 400, { error: "O arquivo chegou vazio." }); }
        return json(response, 201, { uploadId, size });
      }
      if (request.method === "GET" && url.pathname === "/api/posts") {
        let quota = null;
        if (typeof meta.getPublishingLimit === "function" && meta.accessToken) {
          try { quota = await meta.getPublishingLimit(); } catch { quota = null; }
        }
        return json(response, 200, { posts: await store.listPosts(), quota });
      }
      if (request.method === "POST" && url.pathname === "/api/posts") {
        const input = JSON.parse(await readBody(request));
        const uploadId = String(input.uploadId ?? "");
        const info = UPLOAD_ID.test(uploadId) ? await stat(join(config.uploadsDir, uploadId)).catch(() => null) : null;
        if (!info) return json(response, 400, { error: "O vídeo não foi encontrado no servidor. Envie de novo." });
        const post = { ...createPost({ ...input, size: info.size }), mediaBaseUrl: publicBaseUrl(request) };
        await store.addPost(post);
        scheduler?.kick();
        return json(response, 201, post);
      }
      const postPath = url.pathname.match(/^\/api\/posts\/([0-9a-f-]{36})(\/retry)?$/);
      if (postPath && request.method === "DELETE" && !postPath[2]) {
        const post = await store.getPost(postPath[1]);
        if (!post) return json(response, 404, { error: "Post não encontrado." });
        if (post.status === "publishing") return json(response, 400, { error: "Esse Reel está sendo publicado agora — espere terminar." });
        if (post.status !== "published") await unlink(join(config.uploadsDir, post.uploadId)).catch(() => {});
        await store.deletePost(post.id);
        return json(response, 200, { ok: true });
      }
      if (postPath && request.method === "POST" && postPath[2]) {
        const post = await store.getPost(postPath[1]);
        if (!post) return json(response, 404, { error: "Post não encontrado." });
        if (post.status !== "failed") return json(response, 400, { error: "Só dá pra tentar de novo um post que falhou." });
        if (!(await stat(join(config.uploadsDir, post.uploadId)).catch(() => null))) return json(response, 400, { error: "O arquivo do vídeo não está mais no servidor. Envie de novo." });
        const updated = await store.updatePost(post.id, { status: "scheduled", scheduledAt: new Date().toISOString(), error: null, mediaBaseUrl: publicBaseUrl(request) });
        scheduler?.kick();
        return json(response, 200, updated);
      }
      return serveStatic(request, response, url.pathname);
    } catch (error) {
      console.error(error);
      if (error instanceof AppError) return json(response, 400, { error: error.message });
      return json(response, 500, { error: "Erro interno." });
    }
  };
}

export async function processComments(comments, store, meta) {
  for (const comment of comments) {
    try {
    if (!(await store.claimEvent(comment.id))) continue;
    let username = comment.username || null;
    if (!username && comment.authorId) {
      const existing = await store.getContact(comment.authorId);
      username = existing?.username || null;
      if (!username) {
        try { username = (await meta.getUserProfile(comment.authorId)).username || null; }
        catch { username = null; }
      }
    }
    if (comment.authorId) await store.recordContactEvent({ contactId: comment.authorId, username,
      type: "comment", text: comment.text, mediaId: comment.mediaId, at: new Date().toISOString() });
    if (comment.authorId && await store.isContactPaused(comment.authorId)) {
      await store.log({ id: comment.id, username, text: comment.text, mediaId: comment.mediaId,
        status: "ignored", reason: "human_takeover", at: new Date().toISOString() });
      continue;
    }
    const { rules, activity = [] } = await store.read(); const rule = findMatchingRule(comment.text, rules, comment.mediaId);
    const context = { id: comment.id, username, text: comment.text, mediaId: comment.mediaId, at: new Date().toISOString() };
    if (!rule) { await store.log({ ...context, status: "ignored" }); continue; }
    if (comment.authorId && ["private", "both"].includes(rule.responseMode)) {
      const contact = await store.getContact(comment.authorId);
      if (isFatigued(contact?.history, rule.reply)) {
        await store.log({ ...context, status: "ignored", reason: "fatigue_guard", ruleId: rule.id, rule: rule.name });
        continue;
      }
    }
    try {
      let privateResult = null;
      if (["private", "both"].includes(rule.responseMode)) {
        privateResult = await meta.reply(comment.id, rule.reply, "private");
        if (comment.authorId) await store.recordContactEvent({ contactId: comment.authorId, username,
          type: "outgoing_rule", text: rule.reply, ruleId: rule.id, at: new Date().toISOString() });
      }
      if (rule.followUpEnabled && privateResult?.recipient_id) await store.setPendingDelivery(String(privateResult.recipient_id), {
        ruleId: rule.id, ruleName: rule.name, text: rule.followUpText, url: rule.followUpUrl,
        requireFollow: rule.requireFollow, followPrompt: rule.followPrompt,
        deliveryStyle: rule.deliveryStyle, buttonTitle: rule.buttonTitle,
        profileUrl: rule.profileUrl, followButtonTitle: rule.followButtonTitle, confirmFollowTitle: rule.confirmFollowTitle,
        mediaId: comment.mediaId, createdAt: new Date().toISOString()
      });
      if (["public", "both"].includes(rule.responseMode)) {
        const sentCount = activity.filter((event) => event.ruleId === rule.id && event.status === "sent").length;
        const publicReply = selectPublicReply(rule, sentCount);
        try { await meta.reply(comment.id, publicReply, "public"); }
        catch (error) {
          await store.log({ ...context, status: "public_failed", ruleId: rule.id, rule: rule.name,
            text: "A DM foi enviada, mas a resposta pública falhou", error: error.message });
          if (rule.responseMode === "public") throw error;
        }
      }
      await store.log({ ...context, status: "sent", ruleId: rule.id, rule: rule.name, awaitingReply: rule.followUpEnabled });
    }
    catch (error) { await store.log({ ...context, status: "failed", ruleId: rule.id, rule: rule.name, error: error.message }); }
    } catch (error) {
      // covers failures before the inner try (claimEvent, recordContactEvent, findMatchingRule...) —
      // one malformed comment must never stop the rest of the batch from being processed
      console.error("Falha ao processar comentário:", comment.id, error);
    }
  }
}

async function processMessages(messages, store, meta) {
  for (const message of messages) {
    try {
    if (!(await store.claimEvent(message.id))) continue;
    const existing = await store.getContact(message.senderId);
    let username = existing?.username || null;
    if (!username) {
      try { username = (await meta.getUserProfile(message.senderId)).username || null; }
      catch { username = null; }
    }
    await store.recordContactEvent({ contactId: message.senderId, username, type: message.payload ? "postback" : "message",
      text: message.text, at: new Date(message.timestamp).toISOString() });
    if (await store.isContactPaused(message.senderId)) continue;
    const delivery = await store.getPendingDelivery(message.senderId);
    if (!delivery) continue;
    try {
      if (delivery.requireFollow) {
        const profile = await meta.getUserProfile(message.senderId);
        await store.updateContact(message.senderId, { follower: Boolean(profile.is_user_follow_business) });
        if (!profile.is_user_follow_business) {
          await meta.sendFollowGate(message.senderId, { text: delivery.followPrompt, profileUrl: delivery.profileUrl,
            followButtonTitle: delivery.followButtonTitle, confirmFollowTitle: delivery.confirmFollowTitle });
          await store.log({ id: message.id, status: "waiting_follow", ruleId: delivery.ruleId, username: profile.username || username,
            text: "Aguardando a pessoa seguir o perfil", rule: delivery.ruleName, mediaId: delivery.mediaId, at: new Date().toISOString() });
          continue;
        }
      }
      if (delivery.deliveryStyle === "button") await meta.sendLinkButton(message.senderId, delivery.text, delivery.buttonTitle, delivery.url);
      else await meta.sendDirect(message.senderId, `${delivery.text}\n\n${delivery.url}`);
      await store.consumePendingDelivery(message.senderId);
      await store.log({ id: message.id, status: "delivered", ruleId: delivery.ruleId, username, text: "Link entregue após resposta",
        rule: delivery.ruleName, mediaId: delivery.mediaId, at: new Date().toISOString() });
    } catch (error) {
      await store.log({ id: message.id, status: "failed", ruleId: delivery.ruleId, username, text: "Falha ao entregar link",
        rule: delivery.ruleName, error: error.message, at: new Date().toISOString() });
    }
    } catch (error) {
      console.error("Falha ao processar mensagem:", message.id, error);
    }
  }
}
