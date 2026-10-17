// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from "bun:test";
import { createLogger, elapsed } from "../src/logger";

test("logs JST timestamps with milliseconds and hierarchical scopes", () => {
  const lines: string[] = [];
  const log = createLogger("menu::update", {
    write: (line) => lines.push(line),
    now: () => new Date("2026-10-17T15:00:01.007Z"),
    color: false,
  });
  log.info("Menu updated", { duration: "1.234s", warnings: 2 });
  expect(lines[0]).toBe(
    "2026-10-18 00:00:01.007 INFO  [menu::update] Menu updated duration=1.234s warnings=2\n",
  );
});

test("colors terminal levels and scopes without changing the readable text", () => {
  const lines: string[] = [];
  const log = createLogger("discord::gateway", {
    write: (line) => lines.push(line), color: true,
  });
  log.info("Connected");
  log.warn("Reconnecting");
  log.error("Connection failed", { error: new Error("Socket closed") });
  expect(lines.every((line) => line.includes("\x1b["))).toBe(true);
  expect(lines[1]!.replace(/\x1b\[[0-9;]*m/g, "")).toContain(
    "WARN  [discord::gateway] Reconnecting",
  );
  expect(lines[0]).not.toContain("ryoshoku::");
});

test("preserves error stacks and causes while escaping newlines in ordinary fields", () => {
  const lines: string[] = [];
  const error = new Error("Update failed", { cause: new Error("HTTP 503") });
  const log = createLogger("menu::update", { write: (line) => lines.push(line), color: false });
  log.error("Processing failed", { source: "input\nFORGED", error });
  expect(lines[0]).toContain('source="input\\nFORGED"');
  expect(lines[0]).toContain("Error: Update failed");
  expect(lines[0]).toContain("HTTP 503");
  expect(lines[0]).toContain("logger.test.ts:");
  expect(lines[0]).not.toContain("\x1b[");
});

test("formats elapsed seconds with three decimal places", () => {
  expect(elapsed(1000, 2234)).toBe("1.234s");
});

test("removes preexisting terminal codes from error stacks in plain output", () => {
  const lines: string[] = [];
  const log = createLogger("ocr", { write: (line) => lines.push(line), color: false });
  log.error("Worker failed", {
    error: new Error("\x1b[31mInference failed\x1b[0m", {
      cause: new Error("\x1b[33mModel unavailable\x1b[0m"),
    }),
  });
  expect(lines[0]).toContain("Inference failed");
  expect(lines[0]).toContain("Model unavailable");
  expect(lines[0]).not.toContain("\x1b");
});

test("writes diagnostics to stderr with no colors when piped or NO_COLOR is set", async () => {
  const child = Bun.spawn([process.execPath, "-e", `
    import { createLogger } from "./src/logger";
    createLogger("cli").info("Starting");
    console.log(JSON.stringify({ ok: true }));
  `], { stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  expect(code).toBe(0);
  expect(JSON.parse(out)).toEqual({ ok: true });
  expect(err).toContain("INFO  [cli] Starting");
  expect(err).not.toContain("\x1b[");
});
