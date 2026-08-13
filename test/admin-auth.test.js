import test from "node:test";
import assert from "node:assert/strict";
import { isAdminAuthorized } from "../src/app.js";

test("requires the exact admin token when protection is configured", () => {
  assert.equal(isAdminAuthorized({ headers: { authorization: "Bearer correct" } }, "correct"), true);
  assert.equal(isAdminAuthorized({ headers: { authorization: "Bearer wrong" } }, "correct"), false);
  assert.equal(isAdminAuthorized({ headers: {} }, "correct"), false);
});

test("keeps local development open when no admin token is configured", () => {
  assert.equal(isAdminAuthorized({ headers: {} }, ""), true);
});
