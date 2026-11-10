import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { createApp } from "./app.js";
import { MetaClient } from "./meta/client.js";
import { createStore } from "./storage/create-store.js";
import { scheduleTokenRefresh, tokenFingerprint } from "./meta/token-refresh.js";
import { createPostScheduler } from "./meta/reel-publisher.js";
import { createVisitCounter } from "./domain/campaign-visits.js";

// Without these, one unhandled rejection anywhere in the process (a bad webhook
// payload, a flaky Meta API call outside a try/catch) kills the whole instance —
// Node's default behavior for an uncaught unhandledRejection is to exit.
process.on("unhandledRejection", (reason) => { console.error("[unhandledRejection]", reason); });
process.on("uncaughtException", (error) => { console.error("[uncaughtException]", error); process.exit(1); });

const env = process.env;
const port = Number(env.PORT || 3000);
const store = createStore({ env });
await store.initialize();
const meta = new MetaClient({ accessToken: env.META_ACCESS_TOKEN, instagramAccountId: env.INSTAGRAM_ACCOUNT_ID,
  graphVersion: env.META_GRAPH_VERSION || "v23.0", minWriteIntervalMs: Number(env.META_MIN_WRITE_INTERVAL_MS || 1500) });

// O token renovado salvo no banco só vale enquanto derivar do META_ACCESS_TOKEN atual — se o admin
// colou um token novo no .env (ex.: o anterior expirou), o novo tem prioridade sobre o salvo.
const storedToken = await store.getMetaToken();
const storedUsable = Boolean(storedToken?.accessToken) && !(storedToken.expiresAt <= Date.now())
  && (!env.META_ACCESS_TOKEN || !storedToken.origin || storedToken.origin === tokenFingerprint(env.META_ACCESS_TOKEN));
if (storedUsable) meta.setAccessToken(storedToken.accessToken);
if (env.META_ACCESS_TOKEN) scheduleTokenRefresh({ meta, store });
// não bloqueia o boot: sem rede, a trava continua valendo pelo INSTAGRAM_ACCOUNT_ID
if (env.META_ACCESS_TOKEN) meta.loadOwnIdentity().catch((error) => console.error(`Não consegui identificar a própria conta: ${error.message}`));

const MIN_SECRET_LENGTH = 32;
let sessionSecret = env.SESSION_SECRET || "";
if (sessionSecret.length < MIN_SECRET_LENGTH) {
  sessionSecret = randomBytes(32).toString("hex");
  console.warn(`AVISO: SESSION_SECRET ausente ou curto (mínimo ${MIN_SECRET_LENGTH} caracteres). Gerando um segredo temporário só para este processo — todas as sessões serão invalidadas a cada reinício. Defina SESSION_SECRET no .env para produção.`);
}

const setupToken = env.ADMIN_PASSWORD ? "" : randomBytes(24).toString("hex");

// A silent "eduardo" default meant an instance with ADMIN_PASSWORD set but ADMIN_USER
// forgotten (e.g. a hand-edited .env) would boot with a predictable, publicly-known
// admin username. Refuse to start rather than guess.
if (env.ADMIN_PASSWORD && !env.ADMIN_USER) {
  console.error("ERRO: ADMIN_PASSWORD está definida mas ADMIN_USER não. Defina os dois no .env antes de subir o servidor.");
  process.exit(1);
}

const config = { verifyToken: env.META_VERIFY_TOKEN || "", appSecret: env.META_APP_SECRET || "",
  configured: Boolean(env.META_ACCESS_TOKEN && env.INSTAGRAM_ACCOUNT_ID && env.META_VERIFY_TOKEN && env.META_APP_SECRET),
  adminUser: env.ADMIN_USER || "", adminPassword: env.ADMIN_PASSWORD || "", sessionSecret, setupToken,
  envPath: env.MANYDUDU_ENV_PATH || join(process.cwd(), ".env"),
  // vídeos à espera de publicação — precisa estar num volume persistente, senão um deploy apaga os agendados
  uploadsDir: env.UPLOADS_PATH || join(process.cwd(), "data", "uploads") };
const scheduler = createPostScheduler({ store, meta, uploadsDir: config.uploadsDir });
await scheduler.start();
const visitCounter = createVisitCounter({ store });
visitCounter.start();
// deploy no Coolify manda SIGTERM: grava as visitas do último minuto antes de sair
process.once("SIGTERM", () => { visitCounter.flush().finally(() => process.exit(0)); });
if (!env.ADMIN_PASSWORD) {
  console.warn("AVISO: ADMIN_PASSWORD não definida — o login admin ficará bloqueado até configurar.");
  console.warn(`Configuração inicial: acesse http://SEU-ENDERECO/setup?token=${setupToken}`);
}

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

const server = createServer(createApp({ store, meta, config, serveStatic, scheduler, visitCounter }));
// o padrão do Node (5 min por requisição) cortaria o envio de um vídeo grande numa conexão lenta
server.requestTimeout = 60 * 60_000;
server.listen(port, () => console.log(`ManyDudu em http://localhost:${port}`));
