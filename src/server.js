import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { createApp } from "./app.js";
import { MetaClient } from "./meta/client.js";
import { createStore } from "./storage/create-store.js";
import { scheduleTokenRefresh } from "./meta/token-refresh.js";

const env = process.env;
const port = Number(env.PORT || 3000);
const store = createStore({ env });
await store.initialize();
const meta = new MetaClient({ accessToken: env.META_ACCESS_TOKEN, instagramAccountId: env.INSTAGRAM_ACCOUNT_ID,
  graphVersion: env.META_GRAPH_VERSION || "v23.0", minWriteIntervalMs: Number(env.META_MIN_WRITE_INTERVAL_MS || 1500) });

const storedToken = await store.getMetaToken();
if (storedToken?.accessToken) meta.setAccessToken(storedToken.accessToken);
if (env.META_ACCESS_TOKEN) scheduleTokenRefresh({ meta, store });

const MIN_SECRET_LENGTH = 32;
let sessionSecret = env.SESSION_SECRET || "";
if (sessionSecret.length < MIN_SECRET_LENGTH) {
  sessionSecret = randomBytes(32).toString("hex");
  console.warn(`AVISO: SESSION_SECRET ausente ou curto (mínimo ${MIN_SECRET_LENGTH} caracteres). Gerando um segredo temporário só para este processo — todas as sessões serão invalidadas a cada reinício. Defina SESSION_SECRET no .env para produção.`);
}

const config = { verifyToken: env.META_VERIFY_TOKEN || "", appSecret: env.META_APP_SECRET || "",
  configured: Boolean(env.META_ACCESS_TOKEN && env.INSTAGRAM_ACCOUNT_ID && env.META_VERIFY_TOKEN && env.META_APP_SECRET),
  adminUser: env.ADMIN_USER || "eduardo", adminPassword: env.ADMIN_PASSWORD || "", sessionSecret };
if (!env.ADMIN_PASSWORD) console.warn("AVISO: ADMIN_PASSWORD não definida — o login admin ficará bloqueado até configurar.");

const publicRoot = join(process.cwd(), "public");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
async function serveStatic(_request, response, pathname) {
  const requested = pathname === "/" ? "index.html"
    : pathname === "/visagismo" ? "visagismo.html"
      : pathname === "/dm-propria" || pathname === "/dm-propria/" ? "dm-propria/index.html"
        : pathname.slice(1);
  const file = normalize(join(publicRoot, requested));
  if (file !== publicRoot && !file.startsWith(publicRoot + sep)) { response.writeHead(403); return response.end(); }
  try { const body = await readFile(file); response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" }); response.end(body); }
  catch { response.writeHead(404); response.end("Not found"); }
}

createServer(createApp({ store, meta, config, serveStatic })).listen(port, () => console.log(`ManyDudu em http://localhost:${port}`));
