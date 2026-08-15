import { readFile } from "node:fs/promises";
import { JsonStore } from "./json-store.js";

const EMPTY_STATE = { rules: [], events: {}, activity: [], pendingDeliveries: {}, contacts: {}, campaigns: [], leads: [], metaToken: null };

function normalizeUrl(url) { return String(url).replace(/\/$/, ""); }

export class SupabaseStore extends JsonStore {
  get backend() { return "supabase"; }
  constructor({ url, serviceRoleKey, stateId = "default", seedPath, fetchImpl = fetch }) {
    super(seedPath ?? "data/db.json");
    this.url = normalizeUrl(url);
    this.serviceRoleKey = serviceRoleKey;
    this.stateId = stateId;
    this.seedPath = seedPath;
    this.fetchImpl = fetchImpl;
    this.queue = Promise.resolve();
  }

  get endpoint() {
    return `${this.url}/rest/v1/manydudu_state`;
  }

  get headers() {
    const headers = {
      apikey: this.serviceRoleKey,
      "Content-Type": "application/json",
    };
    if (!this.serviceRoleKey.startsWith("sb_secret_")) {
      headers.Authorization = `Bearer ${this.serviceRoleKey}`;
    }
    return headers;
  }

  async initialize() {
    const current = await this.#fetchState();
    if (current) return;
    await this.#write(await this.#seedState());
  }

  async read() {
    const state = await this.#fetchState();
    if (!state) throw new Error("O estado do ManyDudu não existe no Supabase. Reinicie o serviço para criá-lo.");
    return structuredClone(state);
  }

  async update(change) {
    const operation = this.queue.then(async () => {
      const state = await this.read();
      change(state);
      await this.#write(state);
      return state;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async #fetchState() {
    const query = `${this.endpoint}?id=eq.${encodeURIComponent(this.stateId)}&select=state`;
    const response = await this.fetchImpl(query, { headers: this.headers });
    if (!response.ok) throw await this.#requestError(response, "ler");
    const rows = await response.json();
    return rows[0]?.state ?? null;
  }

  async #write(state) {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { ...this.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: this.stateId, state, updated_at: new Date().toISOString() }),
    });
    if (!response.ok) throw await this.#requestError(response, "salvar");
  }

  async #seedState() {
    if (!this.seedPath) return structuredClone(EMPTY_STATE);
    try {
      const state = JSON.parse(await readFile(this.seedPath, "utf8"));
      return { ...structuredClone(EMPTY_STATE), ...state };
    } catch (error) {
      if (error.code === "ENOENT") return structuredClone(EMPTY_STATE);
      throw new Error(`Não foi possível importar os dados locais: ${error.message}`);
    }
  }

  async #requestError(response, action) {
    const detail = (await response.text()).slice(0, 500);
    return new Error(`Não foi possível ${action} os dados no Supabase (HTTP ${response.status}). ${detail}`.trim());
  }
}
