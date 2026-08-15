import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verify(token, secret) {
  if (!token) return null;
  const [data, signature] = String(token).split(".");
  if (!data || !signature) return null;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
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

export function serializeCookie(name, value, { maxAgeSeconds, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (maxAgeSeconds != null) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSecureRequest(request) {
  return request.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
}

export function checkPassword(input, expected) {
  const a = createHash("sha256").update(String(input ?? "")).digest();
  const b = createHash("sha256").update(String(expected ?? "")).digest();
  return timingSafeEqual(a, b);
}

const SESSION_COOKIE = "md_session";
const ACCESS_COOKIE = "md_access";

export function createSessionCookie(user, secret, request) {
  const token = sign({ u: user, exp: Date.now() + 7 * 86400000 }, secret);
  return serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: 7 * 86400, secure: isSecureRequest(request) });
}

export function clearSessionCookie(request) {
  return serializeCookie(SESSION_COOKIE, "", { maxAgeSeconds: 0, secure: isSecureRequest(request) });
}

export function readSession(request, secret) {
  const cookies = parseCookies(request.headers.cookie);
  return verify(cookies[SESSION_COOKIE], secret);
}

export function readAccessSlugs(request, secret) {
  const cookies = parseCookies(request.headers.cookie);
  const payload = verify(cookies[ACCESS_COOKIE], secret);
  return Array.isArray(payload?.s) ? payload.s : [];
}

export function createAccessCookie(slugs, secret, request) {
  const token = sign({ s: [...new Set(slugs)], exp: Date.now() + 180 * 86400000 }, secret);
  return serializeCookie(ACCESS_COOKIE, token, { maxAgeSeconds: 180 * 86400, secure: isSecureRequest(request) });
}
