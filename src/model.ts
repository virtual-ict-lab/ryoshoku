import { z } from "zod";

export const meals = ["breakfast", "lunch", "dinner"] as const;
export type MealName = (typeof meals)[number];
const point = z.tuple([z.number().finite(), z.number().finite()]);

export const RawDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  engine: z.string().min(1),
  headerText: z.string(),
  columns: z.number().int().min(1).max(7),
  cells: z.array(
    z.object({
      column: z.number().int().min(0),
      meal: z.enum(meals),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      lines: z.array(
        z.object({
          text: z.string(),
          confidence: z.number().min(0).max(1),
          box: z.array(point),
        }),
      ),
    }),
  ),
});

export type RawDocument = z.infer<typeof RawDocumentSchema>;

export const MealSchema = z.object({
  text: z.string(),
  rawText: z.string(),
  warnings: z.array(z.string()),
});

export type Meal = z.infer<typeof MealSchema>;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const WeeklyMenuSchema = z.object({
  schemaVersion: z.literal(1),
  engine: z.string(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  fetchedAt: z.string().datetime(),
  startDate: date,
  endDate: date,
  days: z
    .array(
      z.object({
        date,
        breakfast: MealSchema,
        lunch: MealSchema,
        dinner: MealSchema,
      }),
    )
    .min(1)
    .max(7),
  warnings: z.array(z.string()),
});

export type WeeklyMenu = z.infer<typeof WeeklyMenuSchema>;

export type DailyMenu = WeeklyMenu["days"][number];
