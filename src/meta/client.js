import { MetaRequestPacer } from "./request-pacer.js";

export class MetaClient {
  constructor({ accessToken, instagramAccountId, graphVersion = "v23.0", fetcher = fetch,
    minWriteIntervalMs = 1500, now = Date.now, sleep } = {}) {
    this.accessToken = accessToken;
    this.instagramAccountId = instagramAccountId;
    const host = accessToken?.startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com";
    this.baseUrl = `https://${host}/${graphVersion}`;
    this.messagesPath = `${instagramAccountId}/messages`;
    this.ownIds = new Set(instagramAccountId ? [String(instagramAccountId)] : []);
    this.ownUsername = null;
    this.fetcher = fetcher;
    this.pacer = new MetaRequestPacer({ minIntervalMs: minWriteIntervalMs, now, sleep });
  }

  // A própria conta aparece com mais de um ID: o INSTAGRAM_ACCOUNT_ID (o "from.id" dos comentários
  // dela) e o id do /me (escopo do login do Instagram). Guarda todos pra nunca responder a si mesma.
  async loadOwnIdentity() {
    const me = await this.#get("/me?fields=id,user_id,username");
    for (const id of [me.id, me.user_id]) if (id) this.ownIds.add(String(id));
    if (me.username) this.ownUsername = String(me.username).toLowerCase();
    return { ids: [...this.ownIds], username: this.ownUsername };
  }

  isOwnAccount({ id, username } = {}) {
    if (id && this.ownIds.has(String(id))) return true;
    return Boolean(username && this.ownUsername && String(username).replace(/^@/, "").toLowerCase() === this.ownUsername);
  }

  setAccessToken(accessToken) {
    this.accessToken = accessToken;
    const host = accessToken?.startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com";
    this.baseUrl = this.baseUrl.replace(/^https:\/\/[^/]+/, `https://${host}`);
  }

  async reply(commentId, message, mode) {
    if (!this.accessToken) throw new Error("META_ACCESS_TOKEN não configurado.");
    const target = mode === "private" ? this.messagesPath : `${encodeURIComponent(commentId)}/replies`;
    const privateMessage = { text: message };
    const payload = mode === "private"
      ? { recipient: { comment_id: commentId }, message: privateMessage }
      : { message };
    return this.#post(target, payload);
  }

  async listMedia(limit = 24) {
    const fields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count";
    const result = await this.#get(`/me/media?fields=${fields}&limit=${Math.min(limit, 50)}`);
    return result.data ?? [];
  }

  async listComments(mediaId, limit = 50) {
    const id = encodeURIComponent(mediaId);
    const fields = "id,text,from,timestamp,hidden,like_count";
    const result = await this.#get(`/${id}/comments?fields=${fields}&limit=${Math.min(limit, 100)}`);
    return result.data ?? [];
  }

  async setCommentHidden(commentId, hidden) {
    if (!this.accessToken) throw new Error("META_ACCESS_TOKEN não configurado.");
    const id = encodeURIComponent(commentId);
    return this.#post(id, { hide: Boolean(hidden) });
  }

  async sendDirect(recipientId, text) {
    if (!this.accessToken) throw new Error("META_ACCESS_TOKEN não configurado.");
    return this.#post(this.messagesPath, { recipient: { id: recipientId }, message: { text } });
  }

  async sendLinkButton(recipientId, text, title, url) {
    if (!this.accessToken) throw new Error("META_ACCESS_TOKEN não configurado.");
    const message = { attachment: { type: "template", payload: { template_type: "button", text,
      buttons: [{ type: "web_url", title, url }] } } };
    return this.#post(this.messagesPath, { recipient: { id: recipientId }, message });
  }

  async sendFollowGate(recipientId, gate) {
    if (!this.accessToken) throw new Error("META_ACCESS_TOKEN não configurado.");
    const message = { attachment: { type: "template", payload: { template_type: "button", text: gate.text,
      buttons: [{ type: "web_url", title: gate.followButtonTitle, url: gate.profileUrl },
        { type: "postback", title: gate.confirmFollowTitle, payload: "CHECK_FOLLOW" }] } } };
    return this.#post(this.messagesPath, { recipient: { id: recipientId }, message });
  }

  // Publicação de Reels (normal ou Trial Reels) em dois passos: container apontando pro vídeo num link
  // público (a Meta baixa de lá) e media_publish quando ela terminar de processar. O upload direto
  // (upload_type=resumable) não existe pra token de login do Instagram — a API responde
  // "The parameter video_url is required".
  async createReelContainer({ caption, kind, graduationStrategy, shareToFeed, videoUrl }) {
    if (!this.accessToken) throw new Error("META_ACCESS_TOKEN não configurado.");
    const payload = { media_type: "REELS", video_url: videoUrl, caption };
    if (kind === "trial") payload.trial_params = { graduation_strategy: graduationStrategy };
    else payload.share_to_feed = shareToFeed !== false;
    return this.#post(`${this.instagramAccountId}/media`, payload);
  }

  async getContainerStatus(containerId) {
    return this.#get(`/${encodeURIComponent(containerId)}?fields=status_code,status`);
  }

  async publishContainer(containerId) {
    return this.#post(`${this.instagramAccountId}/media_publish`, { creation_id: containerId });
  }

  async getMediaPermalink(mediaId) {
    const result = await this.#get(`/${encodeURIComponent(mediaId)}?fields=permalink`);
    return result.permalink ?? null;
  }

  async getPublishingLimit() {
    const result = await this.#get(`/${encodeURIComponent(this.instagramAccountId)}/content_publishing_limit?fields=config,quota_usage`);
    const entry = result.data?.[0];
    return entry ? { used: entry.quota_usage ?? 0, total: entry.config?.quota_total ?? null } : null;
  }

  // Chamada barata pra saber se o token ainda vale — usada pela tela de Saúde.
  async checkToken() {
    try {
      const me = await this.#get("/me?fields=id,username");
      return { valid: true, username: me.username ?? null };
    } catch (error) {
      return { valid: false, expired: error.code === 190, error: error.message };
    }
  }

  async getUserProfile(instagramScopedId) {
    const id = encodeURIComponent(instagramScopedId);
    const fields = "id,name,username,profile_pic,is_user_follow_business,is_business_follow_user";
    return this.#get(`/${id}?fields=${fields}`);
  }

  async #get(path) {
    if (!this.accessToken) throw new Error("META_ACCESS_TOKEN não configurado.");
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(12_000)
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error?.message || `Meta respondeu ${response.status}.`), { code: result.error?.code });
    return result;
  }

  async #post(path, payload) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.pacer.run(() => this.fetcher(`${this.baseUrl}/${path}`, {
        method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(12_000)
      }));
      const result = await response.json();
      this.#applyUsageCooldown(response);
      if (response.ok) return result;
      if (!isThrottled(response.status, result.error) || attempt === 2) throw new Error(formatMetaError(result.error, response.status));
      this.pacer.cooldown(readRetryAfter(response) || 2_000 * (2 ** attempt));
    }
  }

  #applyUsageCooldown(response) {
    const usage = readUsage(response);
    this.pacer.recordUsage(usage);
    if (usage >= 95) this.pacer.cooldown(60_000);
    else if (usage >= 90) this.pacer.cooldown(30_000);
    else if (usage >= 80) this.pacer.cooldown(5_000);
  }

  getUsageSnapshot() {
    const usage = this.pacer.getUsage();
    return { usage: usage?.value ?? null, usageAt: usage?.at ?? null, nextAllowedAt: this.pacer.nextAllowedAt, cooldownActive: this.pacer.nextAllowedAt > Date.now() };
  }
}

function formatMetaError(error, status) {
  if (!error) return `Meta respondeu ${status}.`;
  const details = [error.code && `código ${error.code}`, error.error_subcode && `subcódigo ${error.error_subcode}`].filter(Boolean).join(", ");
  return details ? `${error.message} (${details})` : error.message;
}

function isThrottled(status, error) {
  return status === 429 || [4, 17, 32, 613].includes(Number(error?.code));
}

function readRetryAfter(response) {
  const value = response.headers?.get?.("retry-after");
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

function readUsage(response) {
  const raw = response.headers?.get?.("x-app-usage");
  if (!raw) return 0;
  try {
    const usage = JSON.parse(raw);
    return Math.max(Number(usage.call_count) || 0, Number(usage.total_cputime) || 0, Number(usage.total_time) || 0);
  } catch { return 0; }
}
