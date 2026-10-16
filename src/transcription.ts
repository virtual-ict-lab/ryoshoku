// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import {
  RawDocumentSchema,
  WeeklyMenuSchema,
  meals,
  type RawDocument,
  type WeeklyMenu,
  type Meal,
} from "./model";
import { addDays } from "./dates";

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function transcribeMeal(rawText: string, warnings: string[] = []): Meal {
  return { rawText, text: normalizeText(rawText), warnings };
}

function printedDate(year: string, month: string, day: string): string {
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return addDays(value, 0);
}

export function buildMenu(
  input: RawDocument,
  hash: string,
  fetchedAt: string,
): WeeklyMenu {
  const raw = RawDocumentSchema.parse(input);
  const header = normalizeText(raw.headerText).replace(/\s/g, "");
  const m = header.match(
    /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[~〜～―-]+(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/,
  );
  if (!m) throw new Error("PDF本文の対象期間を読み取れません");
  const startDate = printedDate(m[1]!, m[2]!, m[3]!);
  const endDate = printedDate(m[4]!, m[5]!, m[6]!);
  if (addDays(startDate, raw.columns - 1) !== endDate)
    throw new Error("PDFの期間と日付列数が一致しません");
  if (raw.cells.length !== raw.columns * 3)
    throw new Error("献立セルが不足しています");
  const warnings: string[] = [];
  const days = Array.from({ length: raw.columns }, (_, column) => {
    const result = {
      date: addDays(startDate, column),
    } as WeeklyMenu["days"][number];
    for (const meal of meals) {
      const cells = raw.cells.filter(
        (c) => c.column === column && c.meal === meal,
      );
      if (cells.length !== 1)
        throw new Error("献立セルの重複または欠落があります");
      const cell = cells[0]!;
      const issues = cell.lines
        .filter((l) => l.confidence < 0.85)
        .map(
          (l) =>
            `${l.confidence < 0.5 ? "低信頼度のため表示省略" : "OCR要確認"} (${l.confidence.toFixed(2)}): ${l.text}`,
        );
      if (!cell.lines.length)
        issues.push(
          "読み取り結果が空です（未提供または認識できなかった可能性があります）",
        );
      const text = cell.lines.map((l) => l.text).join("\n");
      result[meal] = transcribeMeal(text, issues);
      // Keep every candidate in rawText/raw.json, but do not show low-score
      // illustration noise as a dish. This is confidence gating, not parsing.
      result[meal].text = normalizeText(
        cell.lines
          .filter((l) => l.confidence >= 0.5)
          .map((l) => l.text)
          .join("\n"),
      );
      if (issues.length)
        warnings.push(
          `${result.date} ${meal}: ${issues.length}行の認識を確認してください`,
        );
    }
    return result;
  });
  if (days.every((day) => meals.every((meal) => !day[meal].text)))
    throw new Error("料理名を1件も読み取れません！！");
  return WeeklyMenuSchema.parse({
    schemaVersion: 1,
    engine: raw.engine,
    sourceSha256: hash,
    fetchedAt,
    startDate,
    endDate,
    days,
    warnings,
  });
}
