import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WeeklyMenuSchema, type WeeklyMenu, type DailyMenu } from "./model";

const CacheSchema = z.object({
  schemaVersion: z.literal(1),
  weeks: z.array(WeeklyMenuSchema),
});

export async function atomicJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

export class MenuStore {
  readonly path: string;

  constructor(readonly directory: string) {
    this.path = join(directory, "menus.json");
  }

  async load(): Promise<WeeklyMenu[]> {
    try {
      return CacheSchema.parse(JSON.parse(await readFile(this.path, "utf8")))
        .weeks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async save(menu: WeeklyMenu): Promise<void> {
    WeeklyMenuSchema.parse(menu);
    await mkdir(this.directory, { recursive: true });
    const weeks = (await this.load()).filter(
      (w) => w.startDate !== menu.startDate || w.endDate !== menu.endDate,
    );
    weeks.push(menu);
    weeks.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
    await atomicJson(this.path, {
      schemaVersion: 1,
      weeks: weeks.slice(0, 32),
    });
  }

  async find(date: string): Promise<DailyMenu | null> {
    const weeks = await this.load();
    weeks.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
    for (const week of weeks) {
      const day = week.days.find((d) => d.date === date);
      if (day) return day;
    }
    return null;
  }
  
}
