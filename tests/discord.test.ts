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
