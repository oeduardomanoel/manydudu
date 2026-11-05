import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function deriveKey(secret, purpose) {
  return createHmac("sha256", secret).update(purpose).digest();
}

function sign(payload, secret, purpose) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", deriveKey(secret, purpose)).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verify(token, secret, purpose) {
  if (!token) return null;
  const [data, signature] = String(token).split(".");
  if (!data || !signature) return null;
  const expected = createHmac("sha256", deriveKey(secret, purpose)).update(data).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header = "") {
  const cookies = {};
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

export function serializeCookie(name, value, { maxAgeSeconds, secure, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (maxAgeSeconds != null) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSecureRequest(request) {
  if (process.env.NODE_ENV === "development") return request.headers["x-forwarded-proto"] === "https";
  return true;
}

export function checkPassword(input, expected) {
  const a = createHash("sha256").update(String(input ?? "")).digest();
  const b = createHash("sha256").update(String(expected ?? "")).digest();
  return timingSafeEqual(a, b);
}

const SCRYPT_KEY_LENGTH = 64;

// The setup wizard writes ADMIN_PASSWORD as "scrypt:<saltHex>:<hashHex>" going forward.
// Instances set up before this existed still have the raw password in that same env var —
// verifyPasswordHash keeps accepting that legacy plaintext form so an already-deployed
// self-hosted instance never gets locked out by this change.
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password ?? ""), salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPasswordHash(input, stored) {
  const value = String(stored ?? "");
  if (!value.startsWith("scrypt:")) return checkPassword(input, value);
  const [, saltHex, hashHex] = value.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(String(input ?? ""), salt, SCRYPT_KEY_LENGTH);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// A short, non-reversible fingerprint of the current admin credential, baked into every
// session token — changing the password changes this fingerprint, which invalidates every
// session issued under the old one without needing to also rotate SESSION_SECRET.
function passwordFingerprint(storedPassword) {
  return createHash("sha256").update(String(storedPassword ?? "")).digest("base64url").slice(0, 16);
}

const SESSION_COOKIE = "md_session";
const ACCESS_COOKIE = "md_access";

export function createSessionCookie(user, secret, request, storedPassword) {
  const token = sign({ u: user, pf: passwordFingerprint(storedPassword), exp: Date.now() + 7 * 86400000 }, secret, "session");
  return serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: 7 * 86400, secure: isSecureRequest(request) });
}

export function clearSessionCookie(request) {
  return serializeCookie(SESSION_COOKIE, "", { maxAgeSeconds: 0, secure: isSecureRequest(request) });
}

export function readSession(request, secret, storedPassword) {
  const cookies = parseCookies(request.headers.cookie);
  const payload = verify(cookies[SESSION_COOKIE], secret, "session");
  if (!payload) return null;
  if (storedPassword !== undefined && payload.pf !== passwordFingerprint(storedPassword)) return null;
  return payload;
}

export function readAccessSlugs(request, secret) {
  const cookies = parseCookies(request.headers.cookie);
  const payload = verify(cookies[ACCESS_COOKIE], secret, "access");
  return Array.isArray(payload?.s) ? payload.s : [];
}

export function createAccessCookie(slugs, secret, request) {
  const token = sign({ s: [...new Set(slugs)], exp: Date.now() + 180 * 86400000 }, secret, "access");
  return serializeCookie(ACCESS_COOKIE, token, { maxAgeSeconds: 180 * 86400, secure: isSecureRequest(request) });
}

// X-Forwarded-For is a header the CLIENT sends — trusting it by default lets anyone
// reset every rate limiter below just by sending a different fake IP per request.
// Only honor it when the instance is explicitly known to sit behind a real reverse
// proxy (TRUST_PROXY=1), and even then take the entry closest to that proxy, not the
// client-supplied first hop.
export function getClientIp(request, { trustProxy = process.env.TRUST_PROXY === "1" } = {}) {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (forwarded) {
      const parts = String(forwarded).split(",").map((part) => part.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
  }
  return request.socket?.remoteAddress || "unknown";
}

const RATE_LIMITER_MAX_ENTRIES = 5000;

function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  function prune(now) {
    if (hits.size <= RATE_LIMITER_MAX_ENTRIES) return;
    for (const [ip, entry] of hits) if (now - entry.firstAt > windowMs) hits.delete(ip);
    if (hits.size <= RATE_LIMITER_MAX_ENTRIES) return;
    // still over the cap after pruning expired entries — drop the oldest ones outright
    // rather than let an attacker grow this Map without bound
    for (const [ip] of [...hits.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt).slice(0, hits.size - RATE_LIMITER_MAX_ENTRIES)) hits.delete(ip);
  }
  return {
    isLimited(request) {
      const entry = hits.get(getClientIp(request));
      if (!entry) return false;
      if (Date.now() - entry.firstAt > windowMs) return false;
      return entry.count >= max;
    },
    record(request) {
      const ip = getClientIp(request);
      const now = Date.now();
      const entry = hits.get(ip);
      if (!entry || now - entry.firstAt > windowMs) hits.set(ip, { count: 1, firstAt: now });
      else entry.count += 1;
      prune(now);
    },
    clear(request) {
      hits.delete(getClientIp(request));
    },
  };
}

const loginLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
export const isLoginRateLimited = (request) => loginLimiter.isLimited(request);
export const recordFailedLogin = (request) => loginLimiter.record(request);
export const clearLoginAttempts = (request) => loginLimiter.clear(request);

const leadLimiter = createRateLimiter({ max: 8, windowMs: 60 * 60 * 1000 });
export const isLeadRateLimited = (request) => leadLimiter.isLimited(request);
export const recordLeadSubmission = (request) => leadLimiter.record(request);

const setupLimiter = createRateLimiter({ max: 30, windowMs: 60 * 60 * 1000 });
export const isSetupRateLimited = (request) => setupLimiter.isLimited(request);
export const recordSetupAttempt = (request) => setupLimiter.record(request);

export function isSetupRequestAuthorized(request, url, config) {
  if (config.adminPassword) return false;
  if (!config.setupToken) return false;
  const provided = url.searchParams.get("token");
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(config.setupToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

const CSRF_COOKIE = "md_csrf";

export function createCsrfCookie(request) {
  const token = randomBytes(24).toString("hex");
  return serializeCookie(CSRF_COOKIE, token, { maxAgeSeconds: 7 * 86400, secure: isSecureRequest(request), httpOnly: false });
}

export function clearCsrfCookie(request) {
  return serializeCookie(CSRF_COOKIE, "", { maxAgeSeconds: 0, secure: isSecureRequest(request), httpOnly: false });
}

export function verifyCsrf(request) {
  const cookieToken = parseCookies(request.headers.cookie)[CSRF_COOKIE];
  const headerToken = request.headers["x-csrf-token"];
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(String(cookieToken));
  const b = Buffer.from(String(headerToken));
  return a.length === b.length && timingSafeEqual(a, b);
}
