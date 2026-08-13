import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createApp } from "./app.js";
import { MetaClient } from "./meta/client.js";
import { createStore } from "./storage/create-store.js";
import { AgentRouterClient } from "./ai/agentrouter-client.js";

const env = process.env;
const port = Number(env.PORT || 3000);
const store = createStore({ env });
await store.initialize();
const meta = new MetaClient({ accessToken: env.META_ACCESS_TOKEN, instagramAccountId: env.INSTAGRAM_ACCOUNT_ID,
  graphVersion: env.META_GRAPH_VERSION || "v23.0", minWriteIntervalMs: Number(env.META_MIN_WRITE_INTERVAL_MS || 1500) });
const config = { verifyToken: env.META_VERIFY_TOKEN || "", appSecret: env.META_APP_SECRET || "", adminToken: env.ADMIN_API_TOKEN || "",
  configured: Boolean(env.META_ACCESS_TOKEN && env.INSTAGRAM_ACCOUNT_ID && env.META_VERIFY_TOKEN && env.META_APP_SECRET) };
const aiAgent = env.AGENTROUTER_API_KEY && env.AGENTROUTER_BASE_URL && env.AGENTROUTER_MODEL
  ? new AgentRouterClient({ apiKey: env.AGENTROUTER_API_KEY, baseUrl: env.AGENTROUTER_BASE_URL,
    model: env.AGENTROUTER_MODEL, timeoutMs: Number(env.AGENTROUTER_TIMEOUT_MS || 20_000) }) : null;

const publicRoot = join(process.cwd(), "public");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
async function serveStatic(_request, response, pathname) {
  const requested = pathname === "/" ? "index.html"
    : pathname === "/visagismo" ? "visagismo.html"
      : pathname === "/dm-propria" || pathname === "/dm-propria/" ? "dm-propria/index.html"
        : pathname.slice(1);
  const file = normalize(join(publicRoot, requested));
  if (!file.startsWith(publicRoot)) { response.writeHead(403); return response.end(); }
  try { const body = await readFile(file); response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" }); response.end(body); }
  catch { response.writeHead(404); response.end("Not found"); }
}

createServer(createApp({ store, meta, config, serveStatic, aiAgent })).listen(port, () => console.log(`ManyDudu em http://localhost:${port}`));
