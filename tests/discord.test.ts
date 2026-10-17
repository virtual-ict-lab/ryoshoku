// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from "bun:test";
import {
  makeEmbed,
  responseFor,
  isAdminAllowed,
  commandDefinitions,
} from "../src/commands";
import type { DailyMenu } from "../src/model";
import { transcribeMeal } from "../src/transcription";
const day: DailyMenu = {
  date: "2026-10-16",
  breakfast: transcribeMeal("[ A ]\nごはん\n[ B ]\nパン"),
  lunch: transcribeMeal("カレーライス"),
  dinner: transcribeMeal(""),
};
test("embeds preserve A/B text and show empty meals explicitly", () => {
  const e = makeEmbed(day, "本日").toJSON();
  expect(e.fields![0]!.value).toBe("[ A ]\nごはん\n[ B ]\nパン");
  expect(e.fields![2]!.value).toContain("読み取り結果なし");
});
test("bounds long fields to Discord limits", () => {
  const long = { ...day, lunch: transcribeMeal("長い献立".repeat(1000)) };
  const e = makeEmbed(long, "本日").toJSON();
  expect(e.fields!.every((f) => f.value.length <= 1024)).toBe(true);
});

test("marks only the uncertain display line using normalized cached OCR warnings", () => {
  const lunch = transcribeMeal("ごはん\n野菜ｻﾗﾀﾞ\n野菜サラダ風スープ", [
    "OCR要確認 (0.72): 野菜ｻﾗﾀﾞ",
  ]);
  const e = makeEmbed({ ...day, lunch }, "本日").toJSON();
  expect(e.fields![1]!.value).toBe("ごはん\n⚠️ 野菜サラダ\n野菜サラダ風スープ");
  expect(e.fields![0]!.value).not.toContain("⚠️");
  expect(e.fields!.every((field) => field.inline)).toBe(true);
  expect(lunch.text).toBe("ごはん\n野菜サラダ\n野菜サラダ風スープ");
});

test("shows the omitted line count in its meal without revealing discarded OCR text", () => {
  const breakfast = transcribeMeal("ごはん\n47", [
    "低信頼度のため表示省略 (0.10): 済",
    "低信頼度のため表示省略 (0.32): 4",
    "OCR要確認 (0.72): 47",
  ]);
  const e = makeEmbed({ ...day, breakfast }, "本日").toJSON();
  expect(e.fields![0]!.value).toBe("ごはん\n⚠️ 47\n\n⚠️ 認識が不確かな2行を省略");
  expect(e.fields![1]!.value).toBe("カレーライス");
});

test("marks an empty OCR result where no dish line can be identified", () => {
  const dinner = transcribeMeal("", [
    "読み取り結果が空です（未提供または認識できなかった可能性があります）",
  ]);
  const e = makeEmbed({ ...day, dinner }, "本日").toJSON();
  expect(e.fields![2]!.value).toStartWith("⚠️ 読み取り結果なし");
});

test("keeps omission notices visible when a long meal needs clipping", () => {
  const lunch = transcribeMeal("長い献立\n".repeat(400), [
    "低信頼度のため表示省略 (0.12): discarded",
  ]);
  const e = makeEmbed({ ...day, lunch }, "本日").toJSON();
  expect(e.fields![1]!.value.length).toBeLessThanOrEqual(1024);
  expect(e.fields![1]!.value).toContain("続きは原PDFを確認してください");
  expect(e.fields![1]!.value).toEndWith("⚠️ 認識が不確かな1行を省略");
});

test.each(["today", "tomorrow", "search"])(
  "%s explains the warning marker next to the affected line",
  (command) => {
    const lunch = transcribeMeal("野菜サラダ", ["OCR要確認 (0.72): 野菜サラダ"]);
    const response = responseFor(command, { ...day, lunch }, day.date);
    expect(response.content).toContain("⚠️");
    expect(response.embeds![0]!.toJSON().fields![1]!.value).toBe("⚠️ 野菜サラダ");
  },
);
test("missing tomorrow never substitutes today and replies privately", () => {
  const r = responseFor("tomorrow", null, "2026-10-17");
  expect(r.ephemeral).toBe(true);
  expect(r.content).toContain("2026-10-17");
  expect(r.embeds).toBeUndefined();
  expect(responseFor("today", day, day.date).ephemeral).toBe(false);
});
test("admin commands require both configured guild and administrator permission", () => {
  expect(isAdminAllowed("123", "123", true)).toBe(true);
  expect(isAdminAllowed("123", "123", false)).toBe(false);
  expect(isAdminAllowed("456", "123", true)).toBe(false);
  expect(isAdminAllowed("123", undefined, true)).toBe(false);
});
test("keeps legacy user command names and seven weekday choices", () => {
  const commands = commandDefinitions().map((c) => c.toJSON());
  expect(commands.map((c) => c.name)).toEqual([
    "today",
    "tomorrow",
    "search",
    "help",
    "privacy",
    "sr",
    "vj",
  ]);
  const search = commands.find((c) => c.name === "search")!;
  expect((search.options![0] as { choices: unknown[] }).choices.length).toBe(7);
});
