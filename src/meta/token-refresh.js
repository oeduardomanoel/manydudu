export const REFRESH_THRESHOLD_DAYS = 10;

export function isInstagramLoginToken(token) {
  return Boolean(token) && token.startsWith("IG");
}

// A mensagem da Meta sozinha ("An unknown error occurred", etc.) costuma não dizer nada —
// code/subcode/fbtrace_id são o que de fato permite diagnosticar (e o fbtrace_id dá pra
// procurar direto no suporte da Meta).
function describeMetaError(error, fallback) {
  if (!error) return fallback;
  const parts = [error.message || error.error_user_msg];
  if (error.type) parts.push(`type=${error.type}`);
  if (error.code != null) parts.push(`code=${error.code}`);
  if (error.error_subcode != null) parts.push(`subcode=${error.error_subcode}`);
  if (error.fbtrace_id) parts.push(`trace=${error.fbtrace_id}`);
  return parts.filter(Boolean).join(" · ") || fallback;
}

// debug_token exige um token de app (formato appId|appSecret) como access_token — o próprio
// token de usuário sendo inspecionado não tem autoridade pra se auto-inspecionar e a Meta
// responde "Application does not have permission for this action" se você tentar.
export async function debugToken(token, appId, appSecret, fetcher = fetch) {
  const appToken = `${appId}|${appSecret}`;
  const response = await fetcher(`https://graph.instagram.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(describeMetaError(result.error, `Meta respondeu ${response.status} ao checar o token.`));
  return result.data;
}

export async function refreshLongLivedToken(token, fetcher = fetch) {
  const response = await fetcher(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(result.error?.message || `Meta respondeu ${response.status} ao renovar o token.`);
  return { accessToken: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
}

export function needsRefresh(expiresAt) {
  if (!expiresAt) return true;
  return expiresAt - Date.now() < REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

export async function maybeRefreshToken({ meta, store, appId, appSecret, fetcher = fetch, log = console.log, logError = console.error }) {
  const currentToken = meta.accessToken;
  if (!isInstagramLoginToken(currentToken)) return;
  try {
    const stored = await store.getMetaToken();
    let expiresAt = stored?.accessToken === currentToken ? stored.expiresAt : null;
    if (!expiresAt) {
      const info = await debugToken(currentToken, appId, appSecret, fetcher);
      expiresAt = info.expires_at ? info.expires_at * 1000 : null;
    }
    if (!needsRefresh(expiresAt)) return;
    const refreshed = await refreshLongLivedToken(currentToken, fetcher);
    meta.setAccessToken(refreshed.accessToken);
    await store.setMetaToken(refreshed);
    log(`Token do Instagram renovado automaticamente. Válido até ${new Date(refreshed.expiresAt).toISOString()}.`);
  } catch (error) {
    logError(`Falha ao renovar o token do Instagram automaticamente: ${error.message}. Continuando com o token atual até a próxima tentativa.`);
  }
}

export function scheduleTokenRefresh({ meta, store, appId, appSecret, fetcher = fetch, intervalMs = 24 * 60 * 60 * 1000 }) {
  const run = () => maybeRefreshToken({ meta, store, appId, appSecret, fetcher });
  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
