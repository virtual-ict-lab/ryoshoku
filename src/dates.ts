// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

export function dateInJapan(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addDays(date: string, count: number): string {
  const instant = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.toISOString().slice(0, 10) !== date
  )
    throw new Error(`Invalid date: ${date}`);
  instant.setUTCDate(instant.getUTCDate() + count);
  return instant.toISOString().slice(0, 10);
}

export function weekdayDate(date: string, weekday: number): string {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    throw new Error("Invalid weekday");
  const day = new Date(`${addDays(date, 0)}T00:00:00Z`).getUTCDay();
  return addDays(date, weekday - ((day + 6) % 7));
}
