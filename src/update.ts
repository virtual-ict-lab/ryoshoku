// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import { RawDocumentSchema, type RawDocument } from "./model";
import { buildMenu } from "./transcription";
import { MenuStore, atomicJson } from "./store";
import { projectRoot, type Config } from "./config";
import { lock as lockDirectory } from "proper-lockfile";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function runOcr(
  pdf: string,
  config: Config,
  debugDir?: string,
): Promise<RawDocument> {
  const args = [
    config.python,
    "-m",
    "ryoshoku_ocr.worker",
    pdf,
    "--model-size",
    config.modelSize,
    "--model-dir",
    config.modelDir,
  ];
  if (debugDir) args.push("--debug-dir", debugDir);
  const child = Bun.spawn(args, {
    cwd: projectRoot,
    env: { ...process.env, PYTHONPATH: join(projectRoot, "python") },
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, config.ocrTimeoutMs);
  // Read both pipes immediately so a full stderr buffer cannot deadlock the worker.
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (timedOut) throw new Error("OCR timed out");
    if (code !== 0)
      throw new Error(`OCR failed (exit ${code}): ${stderr.slice(-2000)}`);
    return RawDocumentSchema.parse(JSON.parse(stdout));
  } finally {
    clearTimeout(timer);
  }
}

async function downloadPdf(config: Config): Promise<Uint8Array> {
  const response = await fetch(config.pdfUrl, {
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
    headers: { "User-Agent": "KNCT-RyoshokuBot/1.0" },
  });
  if (!response.ok)
    throw new Error(`PDF download failed: HTTP ${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_PDF_BYTES)
    throw new Error("PDF is too large");
  if (!response.body) throw new Error("Empty PDF response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > MAX_PDF_BYTES) throw new Error("PDF is too large");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-")
    throw new Error("Response is not a PDF");
  return data;
}

const updates = new Map<string, Promise<unknown>>();

export async function waitForUpdates(): Promise<void> {
  await Promise.allSettled([...updates.values()]);
}

export function updateMenu(
  config: Config,
  deps: { ocr?: (pdf: string, debugDir: string) => Promise<RawDocument> } = {},
) {
  const previous = updates.get(config.dataDir) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => performUpdate(config, deps));
  updates.set(config.dataDir, next);
  void next
    .finally(() => {
      if (updates.get(config.dataDir) === next) updates.delete(config.dataDir);
    })
    .catch(() => {});
  return next;
}

async function performUpdate(
  config: Config,
  deps: { ocr?: (pdf: string, debugDir: string) => Promise<RawDocument> },
) {
  await mkdir(config.dataDir, { recursive: true });
  const lock = join(config.dataDir, ".update.lock");
  // Heartbeats keep active OCR protected, while a crashed process's lock expires.
  const release = await lockDirectory(config.dataDir, {
    lockfilePath: lock,
    realpath: false,
    stale: 15000,
    update: 5000,
    retries: 0,
  });
  let staging: string | undefined;
  try {
    const data = await downloadPdf(config);
    const hash = createHash("sha256").update(data).digest("hex");
    const store = new MenuStore(config.dataDir);
    const weeks = await store.load();
    const existing = weeks.find((w) => w.sourceSha256 === hash);
    if (existing) return { changed: false, menu: existing };
    staging = await mkdtemp(join(config.dataDir, ".ocr-"));
    const pdf = join(staging, "source.pdf");
    await writeFile(pdf, data);
    const raw = deps.ocr
      ? await deps.ocr(pdf, join(staging, "cells"))
      : await runOcr(pdf, config, join(staging, "cells"));
    // Preserve the OCR output before normalization; changing formatting never needs inference again.
    await atomicJson(join(staging, "raw.json"), raw);
    const menu = buildMenu(raw, hash, new Date().toISOString());
    await atomicJson(join(staging, "menu.json"), menu);
    const snapshots = join(config.dataDir, "snapshots");
    await mkdir(snapshots, { recursive: true });
    const snapshot = join(snapshots, hash);
    try {
      await rename(staging, snapshot);
      staging = undefined;
    } catch (error) {
      if (
        !["EEXIST", "ENOTEMPTY"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
    await store.save(menu);
    return { changed: true, menu };
  } finally {
    try {
      if (staging) await rm(staging, { recursive: true, force: true });
    } finally {
      await release();
    }
  }
}
