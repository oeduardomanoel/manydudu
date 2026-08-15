import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

const SESSION_COOKIE = "md_session";
const ACCESS_COOKIE = "md_access";

export function createSessionCookie(user, secret, request) {
  const token = sign({ u: user, exp: Date.now() + 7 * 86400000 }, secret, "session");
  return serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: 7 * 86400, secure: isSecureRequest(request) });
}

export function clearSessionCookie(request) {
  return serializeCookie(SESSION_COOKIE, "", { maxAgeSeconds: 0, secure: isSecureRequest(request) });
}

export function readSession(request, secret) {
  const cookies = parseCookies(request.headers.cookie);
  return verify(cookies[SESSION_COOKIE], secret, "session");
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

export function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return request.socket?.remoteAddress || "unknown";
}

function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
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
