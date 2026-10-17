// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { resolve, join } from "node:path";

export const projectRoot = resolve(import.meta.dir, "..");
export const PDF_URL = "https://www.kagawa-nct.ac.jp/dormitoryE/kondate.pdf";

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const positive = (key: string, fallback: number) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isFinite(n) || n <= 0)
      throw new Error(`${key} must be positive`);
    return n;
  };
  const modelSize = env.OCR_MODEL_SIZE ?? "medium";
  if (!["small", "medium"].includes(modelSize))
    throw new Error("Invalid OCR_MODEL_SIZE");
  const adminUserIds = [...new Set(
    (env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean),
  )];
  if (adminUserIds.some((id) => !/^\d+$/.test(id))) {
    throw new Error("ADMIN_USER_IDS must be a comma-separated list of Discord user IDs");
  }
  return {
    dataDir: resolve(env.DATA_DIR ?? join(projectRoot, "data")),
    pdfUrl: env.PDF_URL ?? PDF_URL,
    python: env.OCR_PYTHON ?? join(projectRoot, ".venv", "bin", "python"),
    modelSize,
    modelDir: resolve(env.OCR_MODEL_DIR ?? join(projectRoot, ".models")),
    ocrTimeoutMs: positive("OCR_TIMEOUT_SECONDS", 600) * 1000,
    fetchTimeoutMs: positive("FETCH_TIMEOUT_SECONDS", 30) * 1000,
    updateIntervalMs: positive("UPDATE_INTERVAL_HOURS", 6) * 3600000,
    token: env.DISCORD_BOT_TOKEN,
    adminUserIds,
  };
}

export type Config = ReturnType<typeof loadConfig>;
