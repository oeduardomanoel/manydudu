import { REFRESH_THRESHOLD_DAYS } from "../meta/token-refresh.js";

const WARN_MULTIPLIER = 2;

// tokenCheck vem de uma chamada ao vivo na Meta (MetaClient#checkToken): sem ela, o painel só sabia
// a validade de tokens já renovados pelo servidor e mostrava "Não configurado" pra um token do .env
// que funcionava — e não distinguia isso de um token expirado.
export function buildHealthReport({ metaToken, tokenConfigured, tokenCheck, usage, webhookConfigured, lastEventAt, storeStatus } = {}) {
  const now = Date.now();

  const configured = Boolean(metaToken?.accessToken || tokenConfigured);
  const daysLeft = metaToken?.expiresAt ? (metaToken.expiresAt - now) / 86400000 : null;
  const invalid = tokenCheck?.valid === false;
  const token = {
    configured,
    valid: tokenCheck?.valid ?? null,
    expired: Boolean(tokenCheck?.expired),
    error: invalid ? tokenCheck.error ?? null : null,
    username: tokenCheck?.username ?? null,
    daysLeft: daysLeft != null && !invalid ? Math.round(daysLeft) : null,
    status: !configured || invalid ? "critical"
      : daysLeft == null ? (tokenCheck?.valid ? "ok" : "warn")
      : daysLeft < REFRESH_THRESHOLD_DAYS ? "critical"
      : daysLeft < REFRESH_THRESHOLD_DAYS * WARN_MULTIPLIER ? "warn"
      : "ok",
  };

  const webhook = {
    configured: Boolean(webhookConfigured),
    lastEventAt: lastEventAt ?? null,
    status: webhookConfigured ? "ok" : "critical",
  };

  const apiUsage = {
    percent: usage?.usage ?? null,
    cooldownActive: Boolean(usage?.cooldownActive),
    status: usage?.usage == null ? "ok" : usage.usage >= 90 ? "critical" : usage.usage >= 80 ? "warn" : "ok",
  };

  const store = {
    backend: storeStatus?.backend ?? "unknown",
    ok: storeStatus?.ok !== false,
    latencyMs: storeStatus?.latencyMs ?? null,
    error: storeStatus?.error ?? null,
    status: storeStatus?.ok === false ? "critical" : "ok",
  };

  const statuses = [token.status, webhook.status, apiUsage.status, store.status];
  const overall = statuses.includes("critical") ? "critical" : statuses.includes("warn") ? "warn" : "ok";

  return { overall, token, webhook, apiUsage, store };
}
