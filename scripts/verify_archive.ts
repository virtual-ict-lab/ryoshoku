// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildMenu } from "../src/transcription";
import { RawDocumentSchema } from "../src/model";
import { MenuStore } from "../src/store";

const [directory, pdfDirectory] = process.argv.slice(2);
if (!directory || !pdfDirectory) {
  console.error(
    "Usage: bun run scripts/verify_archive.ts RAW_JSON_DIRECTORY PDF_DIRECTORY",
  );
  process.exit(1);
}
const store = new MenuStore(join(directory, "verified-cache"));
for (const file of (await readdir(directory))
  .filter((f) => f.endsWith(".raw.json"))
  .sort()) {
  const raw = RawDocumentSchema.parse(
    await Bun.file(join(directory, file)).json(),
  );
  const bytes = await Bun.file(
    join(pdfDirectory, file.replace(".raw.json", ".pdf")),
  ).arrayBuffer();
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const menu = buildMenu(raw, hash, new Date().toISOString());
  await store.save(menu);
  console.log(
    `${file}: ${menu.startDate}..${menu.endDate}, ${menu.days.length} days, ${menu.warnings.length} warnings`,
  );
}
