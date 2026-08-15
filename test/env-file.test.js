import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEnvFile, upsertEnvFile } from "../src/util/env-file.js";
import { AppError } from "../src/util/errors.js";

function tempPath() {
  return join(tmpdir(), `manydudu-env-test-${randomUUID()}.env`);
}

test("upsertEnvFile creates a new file when none exists", async () => {
  const path = tempPath();
  await upsertEnvFile(path, { ADMIN_PASSWORD: "hunter2", SESSION_SECRET: "abc123" });
  const content = await readFile(path, "utf8");
  assert.match(content, /^ADMIN_PASSWORD=hunter2$/m);
  assert.match(content, /^SESSION_SECRET=abc123$/m);
  await rm(path);
});

test("upsertEnvFile replaces an existing key in place and preserves everything else", async () => {
  const path = tempPath();
  await writeFile(path, "PORT=3000\n# comentário\nADMIN_PASSWORD=old\nMETA_ACCESS_TOKEN=\n");
  await upsertEnvFile(path, { ADMIN_PASSWORD: "new-password" });
  const content = await readFile(path, "utf8");
  const lines = content.split("\n");
  assert.equal(lines[0], "PORT=3000");
  assert.equal(lines[1], "# comentário");
  assert.equal(lines[2], "ADMIN_PASSWORD=new-password");
  assert.equal(lines[3], "META_ACCESS_TOKEN=");
  await rm(path);
});

test("upsertEnvFile appends keys that don't already exist in the file", async () => {
  const path = tempPath();
  await writeFile(path, "PORT=3000\n");
  await upsertEnvFile(path, { SESSION_SECRET: "xyz" });
  const content = await readFile(path, "utf8");
  assert.match(content, /^PORT=3000$/m);
  assert.match(content, /^SESSION_SECRET=xyz$/m);
  await rm(path);
});

test("upsertEnvFile rejects values with a newline instead of injecting extra lines", async () => {
  const path = tempPath();
  await assert.rejects(
    () => upsertEnvFile(path, { ADMIN_PASSWORD: "x\nSESSION_SECRET=leaked" }),
    AppError,
  );
  await assert.rejects(
    () => upsertEnvFile(path, { ADMIN_PASSWORD: "x\r\nSESSION_SECRET=leaked" }),
    AppError,
  );
  const content = await readEnvFile(path);
  assert.equal(content.includes("leaked"), false);
});

test("upsertEnvFile is idempotent when applied twice with the same values", async () => {
  const path = tempPath();
  await upsertEnvFile(path, { ADMIN_PASSWORD: "same" });
  await upsertEnvFile(path, { ADMIN_PASSWORD: "same" });
  const content = await readFile(path, "utf8");
  assert.equal(content.match(/ADMIN_PASSWORD=/g).length, 1);
  await rm(path);
});
