import { isAbsolute, join } from "node:path";
import { JsonStore } from "./json-store.js";
import { SupabaseStore } from "./supabase-store.js";

export function createStore({ env = process.env, cwd = process.cwd(), fetchImpl = fetch } = {}) {
  const dataPath = env.DATA_PATH
    ? (isAbsolute(env.DATA_PATH) ? env.DATA_PATH : join(cwd, env.DATA_PATH))
    : join(cwd, "data", "db.json");
  const hasUrl = Boolean(env.SUPABASE_URL);
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const hasKey = Boolean(secretKey);
  if (hasUrl !== hasKey) {
    throw new Error("Configuração do Supabase incompleta. Defina SUPABASE_URL e SUPABASE_SECRET_KEY juntas.");
  }
  if (hasUrl) {
    return new SupabaseStore({
      url: env.SUPABASE_URL,
      serviceRoleKey: secretKey,
      stateId: env.SUPABASE_STATE_ID || "default",
      seedPath: dataPath,
      fetchImpl,
    });
  }
  return new JsonStore(dataPath);
}
