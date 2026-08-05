import { MetaRequestPacer } from "./request-pacer.js";

export class MetaClient {
  constructor({ accessToken, instagramAccountId, graphVersion = "v23.0", fetcher = fetch,
    minWriteIntervalMs = 1500, now = Date.now, sleep } = {}) {
    this.accessToken = accessToken;
    this.instagramAccountId = instagramAccountId;
    const host = accessToken?.startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com";
    this.baseUrl = `https://${host}/${graphVersion}`;
    this.messagesPath = `${instagramAccountId}/messages`;
    this.fetcher = fetcher;
    this.pacer = new MetaRequestPacer({ minIntervalMs: minWriteIntervalMs, now, sleep });
  }

  async reply(commentId, message, mode) {
    if (!this.accessToken) throw new Error("META_ACCESS_TOKEN não configurado.");
    const target = mode === "private" ? this.messagesPath : `${commentId}/replies`;
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
    if (!response.ok) throw new Error(result.error?.message || `Meta respondeu ${response.status}.`);
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
    if (usage >= 95) this.pacer.cooldown(60_000);
    else if (usage >= 90) this.pacer.cooldown(30_000);
    else if (usage >= 80) this.pacer.cooldown(5_000);
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
