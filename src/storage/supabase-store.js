import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { JsonStore } from "./json-store.js";

const EMPTY_STATE = { rules: [], events: {}, activity: [], pendingDeliveries: {}, contacts: {}, campaigns: [], leads: [], metaToken: null, settings: {} };

function normalizeUrl(url) { return String(url).replace(/\/$/, ""); }

// O estado inteiro mora em memória: o Supabase só é lido uma vez, no boot. Antes cada leitura
// baixava o JSON completo e cada evento do webhook fazia várias — isso estourou a cota de egress.
// Gravações seguem indo para o Supabase (return=minimal, sem corpo de volta) e para uma cópia
// local no volume (seedPath), que segura o serviço no ar se o Supabase cair ou for bloqueado.
export class SupabaseStore extends JsonStore {
  get backend() { return "supabase"; }
  #state = null;
  constructor({ url, serviceRoleKey, stateId = "default", seedPath, fetchImpl = fetch }) {
    super(seedPath ?? "data/db.json");
    this.url = normalizeUrl(url);
    this.serviceRoleKey = serviceRoleKey;
    this.stateId = stateId;
    this.seedPath = seedPath;
    this.fetchImpl = fetchImpl;
    this.queue = Promise.resolve();
    this.syncError = null;
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
    let current;
    try {
      current = await this.#fetchState();
    } catch (error) {
      const mirror = await this.#readMirror();
      if (!mirror) throw error;
      console.warn(`Supabase indisponível, usando a cópia local: ${error.message}`);
      this.syncError = error.message;
      this.#state = mirror;
      return;
    }
    if (current) {
      this.#state = current;
      await this.#writeMirror(current);
      return;
    }
    const seed = await this.#seedState();
    await this.#write(seed);
    this.#state = seed;
    await this.#writeMirror(seed);
  }

  async read() {
    if (!this.#state) throw new Error("O estado do ManyDudu ainda não foi carregado. Reinicie o serviço.");
    return structuredClone(this.#state);
  }

  async update(change) {
    const operation = this.queue.then(async () => {
      const state = await this.read();
      change(state);
      this.#state = state;
      await this.#writeMirror(state);
      // estado completo a cada gravação: uma falha agora se corrige sozinha na próxima que passar
      try {
        await this.#write(state);
        this.syncError = null;
      } catch (error) {
        if (!this.seedPath) throw error;
        if (!this.syncError) console.error(`Falha ao sincronizar com o Supabase (seguindo na cópia local): ${error.message}`);
        this.syncError = error.message;
      }
      return structuredClone(state);
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

  async #readMirror() {
    if (!this.seedPath) return null;
    try {
      return { ...structuredClone(EMPTY_STATE), ...JSON.parse(await readFile(this.seedPath, "utf8")) };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async #writeMirror(state) {
    if (!this.seedPath) return;
    await mkdir(dirname(this.seedPath), { recursive: true });
    const temporary = `${this.seedPath}.tmp`;
    await writeFile(temporary, JSON.stringify(state));
    await rename(temporary, this.seedPath);
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
