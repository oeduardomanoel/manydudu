import { readFile, rename, writeFile } from "node:fs/promises";

export async function readEnvFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

export async function upsertEnvFile(path, updates) {
  const current = await readEnvFile(path);
  const lines = current.length ? current.split(/\r?\n/) : [];
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${value}`);
  }
  const output = `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
  const temp = `${path}.tmp`;
  await writeFile(temp, output);
  await rename(temp, path);
}
