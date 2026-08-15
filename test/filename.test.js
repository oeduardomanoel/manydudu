import test from "node:test";
import assert from "node:assert/strict";
import { safeFilename } from "../src/util/filename.js";

test("safeFilename keeps a normal name untouched", () => {
  assert.equal(safeFilename("quero-o-guia"), "quero-o-guia");
});

test("safeFilename strips characters that could break a Content-Disposition header", () => {
  const result = safeFilename('foo"; filename*=UTF-8\'\'evil');
  assert.equal(result.includes('"'), false);
  assert.equal(result.includes(";"), false);
  assert.equal(result.includes("'"), false);
});

test("safeFilename strips CR/LF", () => {
  const result = safeFilename("foo\r\nSet-Cookie: evil=1");
  assert.equal(result.includes("\r"), false);
  assert.equal(result.includes("\n"), false);
});

test("safeFilename caps length at 100 characters", () => {
  assert.equal(safeFilename("a".repeat(500)).length, 100);
});

test("safeFilename falls back when the input is empty or blank", () => {
  assert.equal(safeFilename(""), "arquivo");
  assert.equal(safeFilename("   "), "arquivo");
  assert.equal(safeFilename(undefined, "automacao"), "automacao");
});
