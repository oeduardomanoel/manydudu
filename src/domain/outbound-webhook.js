import { lookup } from "node:dns/promises";

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

export async function deliverStageChange({ url, payload, fetcher = fetch, lookupImpl = lookup, timeoutMs = 5000 }) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("URL de destino precisa usar https://.");
  if (await isBlockedTarget(parsed.hostname, lookupImpl)) throw new Error("Destino bloqueado (endereço de metadados de nuvem).");
  return fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}
