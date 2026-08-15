import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCookies, createSessionCookie, readSession, createAccessCookie, readAccessSlugs, checkPassword,
  isLoginRateLimited, recordFailedLogin, clearLoginAttempts, isLeadRateLimited, recordLeadSubmission,
} from "../src/auth.js";

const SECRET = "test-secret-with-plenty-of-entropy-for-hmac";
const fakeRequest = (cookieHeader) => ({ headers: { cookie: cookieHeader } });
const fakeRequestFromIp = (ip) => ({ headers: { "x-forwarded-for": ip } });

function cookieValue(setCookieString, name) {
  return parseCookies(setCookieString)[name];
}

test("session cookie round-trips through readSession", () => {
  const setCookie = createSessionCookie("eduardo", SECRET, fakeRequest(""));
  const token = cookieValue(setCookie, "md_session");
  const session = readSession(fakeRequest(`md_session=${encodeURIComponent(token)}`), SECRET);
  assert.equal(session.u, "eduardo");
});

test("access cookie round-trips through readAccessSlugs", () => {
  const setCookie = createAccessCookie(["guia-x"], SECRET, fakeRequest(""));
  const token = cookieValue(setCookie, "md_access");
  const slugs = readAccessSlugs(fakeRequest(`md_access=${encodeURIComponent(token)}`), SECRET);
  assert.deepEqual(slugs, ["guia-x"]);
});

test("an access token can never be replayed as a session cookie (regression for the public-lead-form auth bypass)", () => {
  const accessCookie = createAccessCookie(["guia-x"], SECRET, fakeRequest(""));
  const accessToken = cookieValue(accessCookie, "md_access");
  const session = readSession(fakeRequest(`md_session=${encodeURIComponent(accessToken)}`), SECRET);
  assert.equal(session, null);
});

test("a session token can never be replayed as an access cookie", () => {
  const sessionCookie = createSessionCookie("eduardo", SECRET, fakeRequest(""));
  const sessionToken = cookieValue(sessionCookie, "md_session");
  const slugs = readAccessSlugs(fakeRequest(`md_access=${encodeURIComponent(sessionToken)}`), SECRET);
  assert.deepEqual(slugs, []);
});

test("rejects a tampered signature", () => {
  const setCookie = createSessionCookie("eduardo", SECRET, fakeRequest(""));
  const token = cookieValue(setCookie, "md_session");
  const [data] = token.split(".");
  const tampered = `${data}.deadbeef`;
  assert.equal(readSession(fakeRequest(`md_session=${encodeURIComponent(tampered)}`), SECRET), null);
});

test("rejects a token signed with a different secret", () => {
  const setCookie = createSessionCookie("eduardo", "another-secret-entirely", fakeRequest(""));
  const token = cookieValue(setCookie, "md_session");
  assert.equal(readSession(fakeRequest(`md_session=${encodeURIComponent(token)}`), SECRET), null);
});

test("rejects a missing cookie", () => {
  assert.equal(readSession(fakeRequest(""), SECRET), null);
});

test("checkPassword accepts the correct password and rejects wrong ones", () => {
  assert.equal(checkPassword("correct-horse", "correct-horse"), true);
  assert.equal(checkPassword("wrong", "correct-horse"), false);
  assert.equal(checkPassword("", "correct-horse"), false);
});

test("login rate limiting blocks an IP after 5 failed attempts and a 6th failed attempt", () => {
  const request = fakeRequestFromIp("203.0.113.10");
  assert.equal(isLoginRateLimited(request), false);
  for (let i = 0; i < 5; i++) recordFailedLogin(request);
  assert.equal(isLoginRateLimited(request), true);
});

test("login rate limiting is per-IP, not global", () => {
  const attacker = fakeRequestFromIp("203.0.113.20");
  const other = fakeRequestFromIp("203.0.113.21");
  for (let i = 0; i < 5; i++) recordFailedLogin(attacker);
  assert.equal(isLoginRateLimited(attacker), true);
  assert.equal(isLoginRateLimited(other), false);
});

test("clearLoginAttempts resets the counter for that IP", () => {
  const request = fakeRequestFromIp("203.0.113.30");
  for (let i = 0; i < 5; i++) recordFailedLogin(request);
  assert.equal(isLoginRateLimited(request), true);
  clearLoginAttempts(request);
  assert.equal(isLoginRateLimited(request), false);
});

test("lead submission rate limiting blocks an IP after 8 submissions in an hour, independent of login limiter", () => {
  const request = fakeRequestFromIp("203.0.113.40");
  assert.equal(isLeadRateLimited(request), false);
  for (let i = 0; i < 8; i++) recordLeadSubmission(request);
  assert.equal(isLeadRateLimited(request), true);
  assert.equal(isLoginRateLimited(request), false);
});
