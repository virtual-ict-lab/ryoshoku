import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { REST } from "discord.js";
import { loadConfig } from "./config";
import { makeEmbed } from "./commands";
import { registerCommands } from "./registration";
import { dateInJapan } from "./dates";
import { MenuStore, atomicJson } from "./store";
import { runOcr, updateMenu } from "./update";
import { buildMenu } from "./transcription";
import { RawDocumentSchema } from "./model";

// TODO: ログを綺麗にしたい
export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: "string" },
      date: { type: "string" },
      guild: { type: "string" },
    },
  });
  const [command, file] = positionals;
  const config = loadConfig();
  if (command === "start") {
    await (await import("./bot")).startBot();
    return;
  }
  if (command === "register") {
    if (!config.token) throw new Error("DISCORD_BOT_TOKEN is required");
    const rest = new REST({ version: "10" }).setToken(config.token);
    await registerCommands(rest, undefined, values.guild);
    console.log("Discord commands registered");
    return;
  }
  if (command === "update") {
    const r = await updateMenu(config);
    console.log(
      JSON.stringify(
        {
          changed: r.changed,
          startDate: r.menu.startDate,
          endDate: r.menu.endDate,
          warnings: r.menu.warnings,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "extract" || command === "reformat") {
    if (!file) throw new Error(`${command} requires a file path`);
    const input = resolve(file);
    const pdf =
      command === "extract" ? input : join(dirname(input), "source.pdf");
    const bytes = await readFile(pdf);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const target =
      command === "extract"
        ? join(config.dataDir, "extractions", hash)
        : dirname(input);
    await mkdir(target, { recursive: true });
    const raw =
      command === "extract"
        ? await runOcr(pdf, config, join(target, "cells"))
        : RawDocumentSchema.parse(JSON.parse(await readFile(input, "utf8")));
    if (command === "extract") {
      await writeFile(join(target, "source.pdf"), bytes);
      await atomicJson(join(target, "raw.json"), raw);
    }
    const menu = buildMenu(raw, hash, new Date().toISOString());
    const output = resolve(values.output ?? join(target, "menu.json"));
    await mkdir(dirname(output), { recursive: true });
    await atomicJson(output, menu);
    console.log(`Saved ${menu.startDate}..${menu.endDate} to ${output}`);
    return;
  }
  if (command === "preview") {
    const date = values.date ?? dateInJapan();
    const day = await new MenuStore(config.dataDir).find(date);
    if (!day) {
      console.log(`${date} の献立はまだ取得できていません。`);
      return;
    }
    console.log(JSON.stringify(makeEmbed(day, "プレビュー").toJSON(), null, 2));
    return;
  }
  console.log(
    "Usage: bun run src/cli.ts <start|register [--guild ID]|update|extract PDF [--output JSON]|reformat RAW_JSON [--output JSON]|preview [--date YYYY-MM-DD]>",
  );
}

if (import.meta.main)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
