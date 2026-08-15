import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

const BLOCKED_IPV4_PREFIX = "169.254.";
const BLOCKED_IPV6_EXACT = new Set(["fd00:ec2::254", "::ffff:169.254.169.254"]);

export function isBlockedIp(address = "") {
  const normalized = String(address).toLowerCase();
  if (normalized.startsWith(BLOCKED_IPV4_PREFIX)) return true;
  return BLOCKED_IPV6_EXACT.has(normalized);
}

export async function isBlockedTarget(hostname, lookupImpl = lookup) {
  try {
    const { address } = await lookupImpl(hostname);
    return isBlockedIp(address);
  } catch {
    return false;
  }
}

// Resolves the hostname exactly once and pins the outgoing connection to that
// address, so a hostname that answers safe on the pre-flight check and then
// re-resolves to a cloud metadata IP (DNS rebinding) can't slip through.
function sendPinnedRequest(parsedUrl, address, body, timeoutMs, requestImpl) {
  return new Promise((resolve, reject) => {
    const request = requestImpl({
      host: address,
      servername: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: "POST",
      headers: { "Content-Type": "application/json", Host: parsedUrl.hostname, "Content-Length": Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (response) => {
      response.resume();
      response.on("end", () => resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode }));
    });
    request.on("timeout", () => request.destroy(new Error("Tempo esgotado ao entregar o webhook.")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

export async function deliverStageChange({ url, payload, fetcher, lookupImpl = lookup, timeoutMs = 5000, requestImpl = httpsRequest }) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("URL de destino precisa usar https://.");
  const { address } = await lookupImpl(parsed.hostname).catch(() => { throw new Error("Não foi possível resolver o endereço de destino."); });
  if (isBlockedIp(address)) throw new Error("Destino bloqueado (endereço de metadados de nuvem).");
  if (fetcher) {
    return fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
  return sendPinnedRequest(parsed, address, JSON.stringify(payload), timeoutMs, requestImpl);
}
