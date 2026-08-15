import { REFRESH_THRESHOLD_DAYS } from "../meta/token-refresh.js";

const WARN_MULTIPLIER = 2;

export function buildHealthReport({ metaToken, usage, webhookConfigured, lastEventAt, storeStatus } = {}) {
  const now = Date.now();

  const daysLeft = metaToken?.expiresAt ? (metaToken.expiresAt - now) / 86400000 : null;
  const token = {
    configured: Boolean(metaToken?.accessToken),
    daysLeft: daysLeft != null ? Math.round(daysLeft) : null,
    status: !metaToken?.accessToken ? "critical"
      : daysLeft == null ? "warn"
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
