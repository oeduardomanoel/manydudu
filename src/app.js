import { createRule, findMatchingRule, selectPublicReply, updateRule } from "./domain/automation.js";
import { buildAnalytics } from "./domain/analytics.js";
import { extractComments, extractMessages, extractPostbacks, verifyMetaSignature } from "./meta/webhook.js";
import { createCampaign, createLead, updateCampaign } from "./domain/campaigns.js";
import { PIPELINE_STAGES } from "./domain/pipeline.js";
import { sanitizeHtml } from "./util/html.js";
import { renderContentPage, renderGatePage, renderNotFound } from "./pages/gate.js";
import { checkPassword, clearSessionCookie, createAccessCookie, createSessionCookie, readAccessSlugs, readSession } from "./auth.js";

const json = (response, status, body) => { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); };
const html = (response, status, body) => { response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }); response.end(body); };
const withCookie = (response, cookie) => response.setHeader("Set-Cookie", cookie);

function requiresAuth(pathname, method) {
  if (pathname === "/" || pathname === "/index.html") return true;
  if (!pathname.startsWith("/api/")) return false;
  if (pathname === "/api/login") return false;
  if (pathname === "/api/leads" && method === "POST") return false;
  return true;
}

async function readBody(request, limit = 1_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new Error("Payload muito grande."); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

export function createApp({ store, meta, config, serveStatic }) {
  return async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      const campaignPath = url.pathname.match(/^\/c\/([a-z0-9-]+)$/);
      if (request.method === "GET" && campaignPath) {
        const campaign = await store.getCampaignBySlug(campaignPath[1]);
        if (!campaign || !campaign.active) return html(response, 404, renderNotFound());
        const slugs = readAccessSlugs(request, config.sessionSecret);
        return html(response, 200, slugs.includes(campaign.slug) ? renderContentPage(campaign) : renderGatePage(campaign));
      }
      if (request.method === "POST" && url.pathname === "/api/leads") {
        const { slug, ...input } = JSON.parse(await readBody(request));
        const campaign = await store.getCampaignBySlug(String(slug ?? ""));
        if (!campaign || !campaign.active) return json(response, 404, { error: "Campanha não encontrada." });
        const lead = createLead(input, campaign.slug);
        await store.addLead(lead);
        const slugs = readAccessSlugs(request, config.sessionSecret);
        withCookie(response, createAccessCookie([...slugs, campaign.slug], config.sessionSecret, request));
        return json(response, 201, { ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/login") {
        const { user, password } = JSON.parse(await readBody(request));
        const valid = checkPassword(user, config.adminUser) && config.adminPassword && checkPassword(password, config.adminPassword);
        if (!valid) return json(response, 401, { error: "Usuário ou senha inválidos." });
        withCookie(response, createSessionCookie(user, config.sessionSecret, request));
        return json(response, 200, { ok: true });
      }
      if (requiresAuth(url.pathname, request.method) && !readSession(request, config.sessionSecret)) {
        return url.pathname.startsWith("/api/") ? json(response, 401, { error: "Sessão expirada. Faça login novamente." })
          : (response.writeHead(302, { Location: "/login.html" }), response.end());
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        withCookie(response, clearSessionCookie(request));
        return json(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/campaigns") {
        return json(response, 200, { campaigns: await store.listCampaigns() });
      }
      if (request.method === "POST" && url.pathname === "/api/campaigns") {
        const input = JSON.parse(await readBody(request));
        const campaign = createCampaign({ ...input, contentHtml: sanitizeHtml(input.contentHtml) });
        await store.addCampaign(campaign);
        return json(response, 201, campaign);
      }
      const campaignAdminPath = url.pathname.match(/^\/api\/campaigns\/([a-z0-9-]+)$/);
      if (campaignAdminPath && request.method === "PATCH") {
        const existing = await store.getCampaignBySlug(campaignAdminPath[1]);
        if (!existing) return json(response, 404, { error: "Campanha não encontrada." });
        const input = JSON.parse(await readBody(request));
        const campaign = updateCampaign(existing, { ...input, contentHtml: sanitizeHtml(input.contentHtml) });
        await store.replaceCampaign(existing.slug, campaign);
        return json(response, 200, campaign);
      }
      if (campaignAdminPath && request.method === "DELETE") {
        await store.deleteCampaign(campaignAdminPath[1]);
        return json(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/leads") {
        return json(response, 200, { leads: await store.listLeads() });
      }
      const leadAdminPath = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
      if (leadAdminPath && request.method === "PATCH") {
        const { stage } = JSON.parse(await readBody(request));
        if (!PIPELINE_STAGES.includes(stage)) return json(response, 400, { error: "Estágio inválido." });
        const lead = await store.updateLead(leadAdminPath[1], { stage });
        return lead ? json(response, 200, lead) : json(response, 404, { error: "Lead não encontrado." });
      }
      if (request.method === "GET" && url.pathname === "/webhook") {
        const valid = Boolean(config.verifyToken) && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === config.verifyToken;
        response.writeHead(valid ? 200 : 403, { "Content-Type": "text/plain" }); return response.end(valid ? url.searchParams.get("hub.challenge") ?? "" : "Forbidden");
      }
      if (request.method === "POST" && url.pathname === "/webhook") {
        const body = await readBody(request);
        if (!verifyMetaSignature(body, request.headers["x-hub-signature-256"], config.appSecret)) return json(response, 401, { error: "Assinatura inválida." });
        const payload = JSON.parse(body);
        const comments = extractComments(payload);
        const messages = [...extractMessages(payload), ...extractPostbacks(payload)];
        response.writeHead(200); response.end("EVENT_RECEIVED");
        void Promise.all([processComments(comments, store, meta), processMessages(messages, store, meta)]);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        const state = await store.read(); return json(response, 200, { rules: state.rules, activity: state.activity, configured: config.configured });
      }
      if (request.method === "GET" && url.pathname === "/api/media") {
        return json(response, 200, { media: await meta.listMedia() });
      }
      if (request.method === "GET" && url.pathname === "/api/contacts") {
        return json(response, 200, { contacts: await store.listContacts() });
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
        if (!text || text.length > 1000) throw new Error("A resposta deve ter entre 1 e 1000 caracteres.");
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
        const contact = await store.updateContact(contactPath[1], changes);
        return contact ? json(response, 200, contact) : json(response, 404, { error: "Contato não encontrado." });
      }
      const contactActionPath = url.pathname.match(/^\/api\/contacts\/([^/]+)\/(messages|pause)$/);
      if (request.method === "POST" && contactActionPath?.[2] === "pause") {
        const { paused } = JSON.parse(await readBody(request));
        if (!(await store.getContact(contactActionPath[1]))) return json(response, 404, { error: "Contato não encontrado." });
        await store.setContactPaused(contactActionPath[1], Boolean(paused));
        return json(response, 200, { ok: true, paused: Boolean(paused) });
      }
      if (request.method === "POST" && contactActionPath?.[2] === "messages") {
        const { text } = JSON.parse(await readBody(request));
        const message = String(text ?? "").trim();
        if (!message || message.length > 1000) throw new Error("A mensagem deve ter entre 1 e 1000 caracteres.");
        const contact = await store.getContact(contactActionPath[1]);
        if (!contact) return json(response, 404, { error: "Contato não encontrado." });
        await meta.sendDirect(contactActionPath[1], message);
        await store.recordContactEvent({ contactId: contactActionPath[1], username: contact.username, type: "outgoing",
          text: message, at: new Date().toISOString() });
        await store.setContactPaused(contactActionPath[1], true);
        return json(response, 201, { ok: true });
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
      return serveStatic(request, response, url.pathname);
    } catch (error) { console.error(error.message); return json(response, 400, { error: error.message }); }
  };
}

export async function processComments(comments, store, meta) {
  for (const comment of comments) {
    if (!(await store.claimEvent(comment.id))) continue;
    if (comment.authorId) await store.recordContactEvent({ contactId: comment.authorId, username: comment.username,
      type: "comment", text: comment.text, mediaId: comment.mediaId, at: new Date().toISOString() });
    if (comment.authorId && await store.isContactPaused(comment.authorId)) {
      await store.log({ id: comment.id, username: comment.username, text: comment.text, mediaId: comment.mediaId,
        status: "ignored", reason: "human_takeover", at: new Date().toISOString() });
      continue;
    }
    const { rules, activity = [] } = await store.read(); const rule = findMatchingRule(comment.text, rules, comment.mediaId);
    const context = { id: comment.id, username: comment.username, text: comment.text, mediaId: comment.mediaId, at: new Date().toISOString() };
    if (!rule) { await store.log({ ...context, status: "ignored" }); continue; }
    try {
      let privateResult = null;
      if (["private", "both"].includes(rule.responseMode)) privateResult = await meta.reply(comment.id, rule.reply, "private");
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
  }
}

async function processMessages(messages, store, meta) {
  for (const message of messages) {
    if (!(await store.claimEvent(message.id))) continue;
    await store.recordContactEvent({ contactId: message.senderId, username: "instagram", type: message.payload ? "postback" : "message",
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
          await store.log({ id: message.id, status: "waiting_follow", ruleId: delivery.ruleId, username: profile.username || "instagram",
            text: "Aguardando a pessoa seguir o perfil", rule: delivery.ruleName, mediaId: delivery.mediaId, at: new Date().toISOString() });
          continue;
        }
      }
      if (delivery.deliveryStyle === "button") await meta.sendLinkButton(message.senderId, delivery.text, delivery.buttonTitle, delivery.url);
      else await meta.sendDirect(message.senderId, `${delivery.text}\n\n${delivery.url}`);
      await store.consumePendingDelivery(message.senderId);
      await store.log({ id: message.id, status: "delivered", ruleId: delivery.ruleId, username: "instagram", text: "Link entregue após resposta",
        rule: delivery.ruleName, mediaId: delivery.mediaId, at: new Date().toISOString() });
    } catch (error) {
      await store.log({ id: message.id, status: "failed", ruleId: delivery.ruleId, username: "instagram", text: "Falha ao entregar link",
        rule: delivery.ruleName, error: error.message, at: new Date().toISOString() });
    }
  }
}
