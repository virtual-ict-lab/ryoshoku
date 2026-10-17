// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { constants } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { loadConfig, projectRoot } from "../src/config";
import { createLogger, elapsed } from "../src/logger";

const log = createLogger("setup");

async function run(args: string[], env = process.env): Promise<void> {
  const child = Bun.spawn(args, {
    cwd: projectRoot, env, stdout: "inherit", stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${args[0]} ${args[1]} failed (exit ${code})`);
}

async function main(): Promise<void> {
  const started = performance.now();
  const uv = Bun.which("uv");
  if (!uv) throw new Error("uv is required. Install uv, then run bun run setup again.");

  log.info("Installing JavaScript dependencies");
  await run([process.execPath, "install", "--frozen-lockfile"]);
  log.info("Preparing Python environment");
  await run([uv, "sync", "--frozen", "--dev"]);

  const envPath = join(projectRoot, ".env");
  try {
    await copyFile(join(projectRoot, ".env.example"), envPath, constants.COPYFILE_EXCL);
    log.info("Created .env from .env.example");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    log.info("Keeping existing .env");
  }
  const env = { ...parseEnv(await readFile(envPath, "utf8")), ...process.env };
  const config = loadConfig(env);
  log.info("Downloading and verifying OCR models", {
    model: config.modelSize,
    directory: config.modelDir,
  });
  await run([
    config.python, "-m", "ryoshoku_ocr.prepare",
    "--model-size", config.modelSize, "--model-dir", config.modelDir,
  ], { ...env, PYTHONPATH: join(projectRoot, "python") });
  log.info("Setup complete", { duration: elapsed(started) });
  log.info(config.token
    ? "Run bun run start to start the bot"
    : "Set DISCORD_BOT_TOKEN in .env, then run bun run start");
}

await main().catch((error) => {
  log.error("Setup failed", { error });
  process.exitCode = 1;
});
