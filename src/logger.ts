// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { inspect, stripVTControlCharacters } from "node:util";

type Fields = Record<string, unknown>;
type Level = "INFO" | "WARN" | "ERROR";
const colors = { INFO: 32, WARN: 33, ERROR: 31 };

export function elapsed(start: number, end = performance.now()): string {
  return `${((end - start) / 1000).toFixed(3)}s`;
}

export function createLogger(
  scope: string,
  options: {
    write?: (line: string) => void;
    now?: () => Date;
    color?: boolean;
  } = {},
) {
  const write = options.write ?? ((line: string) => {
    process.stderr.write(line);
  });
  const log = (level: Level, message: string, fields: Fields = {}) => {
    const color = options.color ?? Boolean(
      process.stderr.isTTY &&
      !("NO_COLOR" in process.env) &&
      process.env.TERM !== "dumb",
    );
    const paint = (text: string, code: number) =>
      color ? `\x1b[${code}m${text}\x1b[0m` : text;
    const now = (options.now ?? (() => new Date()))();
    const timestamp = new Date(now.getTime() + 9 * 3600000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    const details: string[] = [];
    const errors: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (value instanceof Error) {
        errors.push(stripVTControlCharacters(inspect(value, { colors: false, depth: 5 })));
        continue;
      }
      const text = typeof value === "string"
        ? value
        : inspect(value, { colors: false, breakLength: Infinity });
      const quoted = /[\s\x00-\x1f\x7f"\\]/.test(text);
      details.push(`${key}=${quoted ? JSON.stringify(text) : text}`);
    }
    const header = `${paint(timestamp, 90)} ${paint(level.padEnd(5), colors[level])} ${paint(`[${scope}]`, 36)}`;
    const safeMessage = message.replace(/[\r\n\x1b]/g, (c) =>
      JSON.stringify(c).slice(1, -1),
    );
    const stack = errors.length
      ? "\n" + errors.join("\n").split("\n").map((line) => `    ${line}`).join("\n")
      : "";
    write(`${header} ${safeMessage}${details.length ? " " + details.join(" ") : ""}${stack}\n`);
  };
  return {
    info: (message: string, fields?: Fields) => log("INFO", message, fields),
    warn: (message: string, fields?: Fields) => log("WARN", message, fields),
    error: (message: string, fields?: Fields) => log("ERROR", message, fields),
  };
}
