import { expect, test } from "bun:test";
import { normalizeText, transcribeMeal, buildMenu } from "../src/transcription";
import { dateInJapan, addDays, weekdayDate } from "../src/dates";
import type { RawDocument } from "../src/model";

test("normalizes spacing and unicode without guessing dish names", () => {
  expect(
    normalizeText(" [ Ａ ]\r\n 牛乳（２００ｍｌ）\n夜力レ一登場！！ "),
  ).toBe("[ A ]\n牛乳(200ml)\n夜力レ一登場!!");
});
test("preserves A/B headings and line order as display text", () => {
  const raw =
    "[ A ]\n白身魚の磯辺揚げ\n[ B ]\nぶりの照焼き\n[ 共通料理 ]\nきのこ御飯";
  expect(transcribeMeal(raw).text).toBe(raw);
  expect(transcribeMeal(raw).rawText).toBe(raw);
});
test("empty meal stays empty and uncertain OCR text is preserved", () => {
  expect(transcribeMeal("").text).toBe("");
  expect(transcribeMeal("夜力レ一登場！！\n豆腐のキーマカレー").text).toBe(
    "夜力レ一登場!!\n豆腐のキーマカレー",
  );
});
test("calculates dates in JST over UTC midnight and month boundaries", () => {
  expect(dateInJapan(new Date("2026-10-15T15:00:00Z"))).toBe("2026-10-16");
  expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  expect(weekdayDate("2026-10-18", 0)).toBe("2026-10-12");
});
export function rawFixture(): RawDocument {
  return {
    schemaVersion: 1,
    engine: "PP-OCRv6-medium",
    headerText: "期間：2026/9/30～2026/10/4",
    columns: 5,
    cells: Array.from({ length: 5 }, (_, column) =>
      ["breakfast", "lunch", "dinner"].map((meal) => ({
        column,
        meal,
        bbox: [1, 2, 3, 4],
        lines: [
          {
            text: "ごはん",
            confidence: 0.99,
            box: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
          },
        ],
      })),
    ).flat(),
  } as RawDocument;
}
test("uses printed dates and supports five-day week with missing meals", () => {
  const raw = rawFixture();
  raw.cells[0]!.lines = [];
  raw.cells[1]!.lines = [];
  const parsed = buildMenu(raw, "a".repeat(64), "2026-10-16T00:00:00.000Z");
  expect(parsed.days.map((d) => d.date)).toEqual([
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
  ]);
  expect(parsed.days[0]!.breakfast.text).toBe("");
});
test("rejects missing cells and contradictory date ranges", () => {
  const raw = rawFixture();
  raw.cells.pop();
  expect(() =>
    buildMenu(raw, "a".repeat(64), "2026-10-16T00:00:00.000Z"),
  ).toThrow();
  const other = rawFixture();
  other.headerText = "期間：2026/9/29～2026/10/4";
  expect(() =>
    buildMenu(other, "a".repeat(64), "2026-10-16T00:00:00.000Z"),
  ).toThrow();
});

test("does not silently claim an empty OCR cell is a verified blank meal", () => {
  const input = rawFixture();
  input.cells[0]!.lines = [];
  const result = buildMenu(input, "a".repeat(64), "2026-10-16T00:00:00.000Z");
  expect(result.days[0]!.breakfast.warnings.length).toBeGreaterThan(0);
});

test("keeps weak OCR evidence but does not display illustration noise as food", () => {
  const input = rawFixture();
  input.cells[0]!.lines = [
    {
      text: "RM",
      confidence: 0.26,
      box: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    },
  ];
  const result = buildMenu(input, "a".repeat(64), "2026-10-16T00:00:00.000Z");
  expect(result.days[0]!.breakfast.rawText).toBe("RM");
  expect(result.days[0]!.breakfast.text).toBe("");
  expect(result.days[0]!.breakfast.warnings[0]).toContain("表示省略");
});
