// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MenuStore } from "../src/store";
import { buildMenu } from "../src/transcription";
import type { RawDocument } from "../src/model";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const raw: RawDocument = {
  schemaVersion: 1, engine: "test", headerText: "2026/10/17~2026/10/17", columns: 1,
  cells: (["breakfast", "lunch", "dinner"] as const).map((meal) => ({
    column: 0, meal, bbox: [1, 2, 3, 4],
    lines: [{ text: "Rice", confidence: 0.99, box: [[0, 0], [1, 0], [1, 1], [0, 1]] }],
  })),
};

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "ryoshoku-logging-"));
  dirs.push(dir);
  return dir;
}

async function cli(args: string[], env: Record<string, string>) {
  const child = Bun.spawn([process.execPath, "src/cli.ts", ...args], {
    stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env, NO_COLOR: "1" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  return { stdout, stderr, code };
}

test("update keeps stdout as JSON while logging download and unchanged status to stderr", async () => {
  const dir = await setup();
  const pdf = "%PDF-1.7\nfixture";
  const hash = createHash("sha256").update(pdf).digest("hex");
  await new MenuStore(dir).save(buildMenu(raw, hash, "2026-10-17T00:00:00Z"));
  const server = Bun.serve({ port: 0, fetch: () => new Response(pdf) });
  try {
    const result = await cli(["update"], { DATA_DIR: dir, PDF_URL: server.url.href });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ changed: false, startDate: "2026-10-17", endDate: "2026-10-17", warnings: [] });
    expect(result.stderr).toContain("[menu::download]");
    expect(result.stderr).toContain("[menu::update] Menu unchanged");
    expect(result.stderr).toMatch(/duration=\d+\.\d{3}s/);
    expect(result.stderr).not.toContain("\x1b[");
  } finally { server.stop(true); }
});

test("extract forwards worker progress and saves its JSON without mixing logs into stdout", async () => {
  const dir = await setup();
  const worker = join(dir, "worker");
  await Bun.write(worker, `#!/bin/sh\nprintf '%s\\n' 'Processed cell column=1 meal=breakfast lines=1' >&2\nprintf '%s\\n' '${JSON.stringify(raw)}'\n`);
  await chmod(worker, 0o700);
  const pdf = join(dir, "source.pdf");
  const output = join(dir, "result.json");
  await Bun.write(pdf, "%PDF-1.7\nfixture");
  const result = await cli(["extract", pdf, "--output", output], { DATA_DIR: dir, OCR_PYTHON: worker });
  expect(result.code).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("[ocr::worker] Processed cell");
  expect(result.stderr).toContain("[ocr] OCR completed");
  expect(result.stderr).toContain("[cli] Menu saved");
  expect((await Bun.file(output).json()).days[0].breakfast.text).toBe("Rice");
});

test("CLI errors include the module and stack with a failing exit code", async () => {
  const result = await cli(["extract"], {});
  expect(result.code).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("ERROR [cli]");
  expect(result.stderr).toContain("extract requires a file path");
  expect(result.stderr).toContain("src/cli.ts:");
});
