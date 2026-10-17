// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { readFile, readdir, realpath, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseEnv } from "node:util";
import { projectRoot } from "../src/config";
import { createLogger, elapsed } from "../src/logger";

const log = createLogger("clean");
const protectedNames = new Set([".git", "node_modules", ".venv", ".models", "data"]);
const cacheNames = new Set(["__pycache__", ".pytest_cache"]);

async function main(): Promise<void> {
  const started = performance.now();
  const contents = await readFile(join(projectRoot, ".env"), "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return "";
  });
  const env = { ...parseEnv(contents), ...process.env };
  const protectedPaths = await Promise.all([
    resolve(projectRoot, env.DATA_DIR ?? "data"),
    resolve(projectRoot, env.OCR_MODEL_DIR ?? ".models"),
  ].map(async (path) => {
    try {
      return await realpath(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return path;
    }
  }));
  const prefix = (path: string) => path.endsWith(sep) ? path : path + sep;
  let removed = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink() || protectedNames.has(entry.name)) continue;
      const protectedPath = protectedPaths.some((p) =>
        path === p || path.startsWith(prefix(p)) || p.startsWith(prefix(path)),
      );
      if (protectedPath) continue;
      const directoryCache = entry.isDirectory() && cacheNames.has(entry.name);
      const compilerCache = entry.isFile() && entry.name.endsWith(".tsbuildinfo");
      if (directoryCache || compilerCache) {
        await rm(path, { recursive: true, force: true });
        removed++;
      } else if (entry.isDirectory()) {
        await visit(path);
      }
    }
  };
  await visit(projectRoot);
  log.info("Cache cleanup complete", { removed, duration: elapsed(started) });
}

await main().catch((error) => {
  log.error("Cache cleanup failed", { error });
  process.exitCode = 1;
});
