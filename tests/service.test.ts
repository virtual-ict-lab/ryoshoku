import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MenuStore } from "../src/store";
import { updateMenu } from "../src/update";
import { loadConfig } from "../src/config";
import { buildMenu } from "../src/transcription";
import type { RawDocument } from "../src/model";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "ryoshoku-test-"));
  dirs.push(dir);
  return loadConfig({ DATA_DIR: dir });
}
function raw(): RawDocument {
  return {
    schemaVersion: 1,
    engine: "PP-OCRv6-medium",
    headerText: "期間：2026/10/12～2026/10/18",
    columns: 7,
    cells: Array.from({ length: 7 }, (_, column) =>
      (["breakfast", "lunch", "dinner"] as const).map((meal) => ({
        column,
        meal,
        bbox: [1, 2, 3, 4] as [number, number, number, number],
        lines: [
          {
            text: "ごはん",
            confidence: 0.99,
            box: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ] as [number, number][],
          },
        ],
      })),
    ).flat(),
  };
}
test("retains current week when a future menu is published", async () => {
  const config = await setup();
  const store = new MenuStore(config.dataDir);
  const a = buildMenu(raw(), "a".repeat(64), "2026-10-16T00:00:00.000Z");
  await store.save(a);
  const r = raw();
  r.headerText = "期間：2026/10/19～2026/10/25";
  await store.save(buildMenu(r, "b".repeat(64), "2026-10-16T01:00:00.000Z"));
  expect((await store.find("2026-10-16"))?.lunch.text).toBe("ごはん");
  expect(await store.find("2026-10-26")).toBeNull();
});
test("rejects corrupt cache rather than overwriting it", async () => {
  const config = await setup();
  await Bun.write(join(config.dataDir, "menus.json"), "{broken");
  await expect(new MenuStore(config.dataDir).load()).rejects.toThrow();
});
test("failed OCR leaves the previously saved menu intact", async () => {
  const config = await setup();
  const store = new MenuStore(config.dataDir);
  await store.save(
    buildMenu(raw(), "a".repeat(64), "2026-10-16T00:00:00.000Z"),
  );
  const before = await Bun.file(store.path).text();
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("%PDF-1.7\nfixture"),
  });
  try {
    await expect(
      updateMenu(
        { ...config, pdfUrl: server.url.href },
        {
          ocr: async () => {
            throw new Error("OCR failed");
          },
        },
      ),
    ).rejects.toThrow("OCR failed");
    expect(await Bun.file(store.path).text()).toBe(before);
  } finally {
    server.stop(true);
  }
});
test("same PDF skips OCR and concurrent updates are serialized", async () => {
  const config = await setup();
  let calls = 0;
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("%PDF-1.7\nfixture"),
  });
  const cfg = { ...config, pdfUrl: server.url.href };
  try {
    const deps = {
      ocr: async () => {
        calls++;
        return raw();
      },
    };
    const outcomes = await Promise.all([
      updateMenu(cfg, deps),
      updateMenu(cfg, deps),
    ]);
    expect(calls).toBe(1);
    expect(outcomes.map((r) => r.changed).sort()).toEqual([false, true]);
    expect((await new MenuStore(config.dataDir).load()).length).toBe(1);
  } finally {
    server.stop(true);
  }
});
test("HTTP errors and HTML response cannot replace the cache", async () => {
  const config = await setup();
  let status = 503;
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("<html>error</html>", { status }),
  });
  try {
    await expect(
      updateMenu({ ...config, pdfUrl: server.url.href }),
    ).rejects.toThrow("503");
    status = 200;
    await expect(
      updateMenu({ ...config, pdfUrl: server.url.href }),
    ).rejects.toThrow("PDF");
    expect(await Bun.file(join(config.dataDir, "menus.json")).exists()).toBe(
      false,
    );
  } finally {
    server.stop(true);
  }
});

test("recovers an abandoned update lock after a crashed process", async () => {
  const config = await setup();
  const { mkdir, utimes } = await import("node:fs/promises");
  const lock = join(config.dataDir, ".update.lock");
  await mkdir(lock);
  const old = new Date(Date.now() - 60000);
  await utimes(lock, old, old);
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("%PDF-1.7\nfixture"),
  });
  try {
    expect(
      (
        await updateMenu(
          { ...config, pdfUrl: server.url.href },
          { ocr: async () => raw() },
        )
      ).changed,
    ).toBe(true);
  } finally {
    server.stop(true);
  }
});
