import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AppError } from "../util/errors.js";
import { PIPELINE_STAGES } from "../domain/pipeline.js";
import { backfillDailyStats, dayKey, recordDailyEvent } from "../domain/daily-stats.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVITY_LIMIT = 500;
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj ?? {}, key);

const EMPTY = { rules: [], events: {}, activity: [], pendingDeliveries: {}, contacts: {}, campaigns: [], leads: [], metaToken: null, settings: {} };

export class JsonStore {
  constructor(path) { this.path = path; this.queue = Promise.resolve(); }
  get backend() { return "local-json"; }
  async initialize() {
    await mkdir(dirname(this.path), { recursive: true });
    try { await readFile(this.path); } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.#write(EMPTY);
    }
  }
  async read() { return JSON.parse(await readFile(this.path, "utf8")); }
  async update(change) {
    const operation = this.queue.then(async () => { const state = await this.read(); change(state); await this.#write(state); return state; });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async claimEvent(id) { let claimed = false; await this.update((state) => { if (!state.events[id]) { state.events[id] = Date.now(); claimed = true; } }); return claimed; }
  async addRule(rule) { await this.update((state) => state.rules.unshift(rule)); return rule; }
  async replaceRule(id, replacement) {
    let replaced = false;
    await this.update((state) => {
      const index = state.rules.findIndex((rule) => rule.id === id);
      if (index < 0) return;
      state.rules[index] = replacement;
      replaced = true;
    });
    return replaced;
  }
  async deleteRule(id) { await this.update((state) => { state.rules = state.rules.filter((rule) => rule.id !== id); }); }
  async toggleRule(id) { await this.update((state) => { const rule = state.rules.find((item) => item.id === id); if (rule) rule.enabled = !rule.enabled; }); }
  async log(item) {
    await this.update((state) => {
      state.activity.unshift(item);
      state.activity = state.activity.slice(0, ACTIVITY_LIMIT);
      // mesma gravação do log: o resumo diário não custa uma escrita a mais
      state.dailyStats ??= {};
      recordDailyEvent(state.dailyStats, item);
    });
  }
  // dailyStatsSince = dia em que a contagem passou a ser completa. O que veio do log antes disso
  // é parcial (o log só guarda os eventos mais recentes) e o painel avisa isso.
  async ensureDailyStats() {
    await this.update((state) => {
      if (!state.dailyStats || !Object.keys(state.dailyStats).length) state.dailyStats = backfillDailyStats(state.activity ?? []);
      state.dailyStatsSince ??= dayKey();
    });
  }
  async setPendingDelivery(recipientId, delivery) {
    await this.update((state) => { state.pendingDeliveries ??= {}; state.pendingDeliveries[recipientId] = delivery; });
  }
  async getPendingDelivery(recipientId) {
    const state = await this.read();
    return hasOwn(state.pendingDeliveries, recipientId) ? state.pendingDeliveries[recipientId] : null;
  }
  async consumePendingDelivery(recipientId) {
    let delivery = null;
    await this.update((state) => {
      state.pendingDeliveries ??= {};
      delivery = hasOwn(state.pendingDeliveries, recipientId) ? state.pendingDeliveries[recipientId] : null;
      delete state.pendingDeliveries[recipientId];
    });
    return delivery;
  }
  async recordContactEvent(event) {
    await this.update((state) => {
      state.contacts ??= {};
      const current = hasOwn(state.contacts, event.contactId)
        ? state.contacts[event.contactId]
        : { id: event.contactId, tags: [], notes: [], history: [] };
      current.username = event.username || current.username || null;
      current.lastInteractionAt = event.at;
      current.history.unshift(event);
      current.history = current.history.slice(0, 200);
      state.contacts[event.contactId] = current;
    });
  }
  async listContacts() {
    const state = await this.read();
    return Object.values(state.contacts ?? {}).map((contact) => ({ ...contact, interactionCount: contact.history.length }))
      .sort((left, right) => String(right.lastInteractionAt).localeCompare(String(left.lastInteractionAt)));
  }
  async getContact(id) {
    const state = await this.read();
    return hasOwn(state.contacts, id) ? state.contacts[id] : null;
  }
  async updateContact(id, changes) {
    let updated = null;
    await this.update((state) => {
      if (!hasOwn(state.contacts, id)) return;
      const contact = state.contacts[id];
      if (Array.isArray(changes.tags)) contact.tags = [...new Set(changes.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 10);
      if (typeof changes.follower === "boolean") { contact.follower = changes.follower; contact.followerCheckedAt = new Date().toISOString(); }
      if (String(changes.note ?? "").trim()) contact.notes.unshift({ text: String(changes.note).trim().slice(0, 500), at: new Date().toISOString() });
      if (typeof changes.stage === "string" && PIPELINE_STAGES.includes(changes.stage)) contact.stage = changes.stage;
      if (typeof changes.pipelineNote === "string") contact.pipelineNote = changes.pipelineNote.trim().slice(0, 500);
      if (typeof changes.nextActionAt === "string" && (changes.nextActionAt === "" || DATE_ONLY.test(changes.nextActionAt))) contact.nextActionAt = changes.nextActionAt || null;
      updated = contact;
    });
    return updated;
  }
  async setContactPaused(id, paused) {
    await this.update((state) => { if (hasOwn(state.contacts, id)) state.contacts[id].automationPaused = Boolean(paused); });
  }
  async setContactUsername(id, username) {
    await this.update((state) => { if (hasOwn(state.contacts, id)) state.contacts[id].username = username; });
  }
  async isContactPaused(id) {
    const contact = await this.getContact(id);
    return Boolean(contact?.automationPaused);
  }
  async deleteContact(id) { await this.update((state) => { state.contacts ??= {}; delete state.contacts[id]; }); }
  async addCampaign(campaign) {
    await this.update((state) => {
      state.campaigns ??= [];
      if (state.campaigns.some((item) => item.slug === campaign.slug)) throw new AppError("Já existe uma campanha com esse slug.");
      state.campaigns.unshift(campaign);
    });
    return campaign;
  }
  async replaceCampaign(slug, replacement) {
    let replaced = false;
    await this.update((state) => {
      state.campaigns ??= [];
      const index = state.campaigns.findIndex((item) => item.slug === slug);
      if (index < 0) return;
      state.campaigns[index] = replacement;
      replaced = true;
    });
    return replaced;
  }
  async deleteCampaign(slug) { await this.update((state) => { state.campaigns = (state.campaigns ?? []).filter((item) => item.slug !== slug); }); }
  async getCampaignBySlug(slug) { const state = await this.read(); return (state.campaigns ?? []).find((item) => item.slug === slug) ?? null; }
  async listCampaigns() { const state = await this.read(); return state.campaigns ?? []; }
  async addLead(lead) { await this.update((state) => { state.leads ??= []; state.leads.unshift(lead); }); return lead; }
  async listLeads() { const state = await this.read(); return state.leads ?? []; }
  async addCampaignVisits(counts) {
    await this.update((state) => {
      for (const campaign of state.campaigns ?? []) {
        if (hasOwn(counts, campaign.slug)) campaign.visits = (Number(campaign.visits) || 0) + Number(counts[campaign.slug]);
      }
    });
  }
  async addPost(post) { await this.update((state) => { state.posts ??= []; state.posts.unshift(post); }); return post; }
  async listPosts() { const state = await this.read(); return state.posts ?? []; }
  async getPost(id) { return (await this.listPosts()).find((post) => post.id === id) ?? null; }
  async updatePost(id, changes) {
    let updated = null;
    await this.update((state) => {
      const post = (state.posts ?? []).find((item) => item.id === id);
      if (!post) return;
      Object.assign(post, changes, { updatedAt: new Date().toISOString() });
      updated = { ...post };
    });
    return updated;
  }
  async deletePost(id) { await this.update((state) => { state.posts = (state.posts ?? []).filter((post) => post.id !== id); }); }
  async deleteLead(id) { await this.update((state) => { state.leads = (state.leads ?? []).filter((lead) => lead.id !== id); }); }
  async updateLead(id, changes) {
    let updated = null;
    await this.update((state) => {
      state.leads ??= [];
      const lead = state.leads.find((item) => item.id === id);
      if (!lead) return;
      if (typeof changes.stage === "string" && PIPELINE_STAGES.includes(changes.stage)) lead.stage = changes.stage;
      if (typeof changes.pipelineNote === "string") lead.pipelineNote = changes.pipelineNote.trim().slice(0, 500);
      if (typeof changes.nextActionAt === "string" && (changes.nextActionAt === "" || DATE_ONLY.test(changes.nextActionAt))) lead.nextActionAt = changes.nextActionAt || null;
      updated = lead;
    });
    return updated;
  }
  async getMetaToken() { const state = await this.read(); return state.metaToken ?? null; }
  async setMetaToken(token) { await this.update((state) => { state.metaToken = token; }); }
  async getSettings() { const state = await this.read(); return state.settings ?? {}; }
  async setSettings(updates) { await this.update((state) => { state.settings = { ...(state.settings ?? {}), ...updates }; }); return this.getSettings(); }
  async #write(state) { const temporary = `${this.path}.tmp`; await writeFile(temporary, JSON.stringify(state, null, 2)); await rename(temporary, this.path); }
}
