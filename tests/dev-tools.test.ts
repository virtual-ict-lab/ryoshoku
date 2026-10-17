// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, expect, test } from "bun:test";
import { chmod, cp, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sourceRoot = resolve(import.meta.dir, "..");
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ryoshoku-tools-")));
  dirs.push(root);
  await cp(join(sourceRoot, "scripts"), join(root, "scripts"), { recursive: true });
  await cp(join(sourceRoot, "src"), join(root, "src"), { recursive: true });
  await Bun.write(join(root, "package.json"), '{"name":"tools-test","type":"module","private":true}');
  await Bun.write(join(root, ".env.example"), "OCR_MODEL_SIZE=small\nOCR_MODEL_DIR=./downloaded-models\n");
  const bin = join(root, "bin");
  await mkdir(bin);
  // Only uv provisioning and Python/model downloads are substituted; Bun and the scripts run normally.
  await Bun.write(join(bin, "uv"), `#!/usr/bin/env bun
import { mkdir, chmod, copyFile } from "node:fs/promises";
if (process.env.TEST_UV_FAILURE) process.exit(9);
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["sync", "--frozen", "--dev"])) process.exit(8);
await mkdir(".venv/bin", { recursive: true });
await copyFile("bin/python", ".venv/bin/python");
await chmod(".venv/bin/python", 0o700);
`);
  await Bun.write(join(bin, "python"), `#!/usr/bin/env bun
await Bun.write("model-check.json", JSON.stringify({ args: process.argv.slice(2), pythonpath: process.env.PYTHONPATH }));
`);
  await chmod(join(bin, "uv"), 0o700);
  await chmod(join(bin, "python"), 0o700);
  return root;
}

async function run(root: string, script: string, extra: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of ["DATA_DIR", "OCR_MODEL_DIR", "OCR_MODEL_SIZE", "OCR_PYTHON", "ADMIN_USER_IDS", "VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT"])
    delete env[key];
  const child = Bun.spawn([process.execPath, join(root, "scripts", `${script}.ts`)], {
    cwd: root,
    env: { ...env, PATH: `${join(root, "bin")}:${env.PATH}`, NO_COLOR: "1", ...extra },
    stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  return { stdout, stderr, code };
}

test("setup bootstraps without node_modules and prepares the model selected in the new env file", async () => {
  const root = await fixture();
  const result = await run(root, "setup");
  expect(result.code).toBe(0);
  expect(await Bun.file(join(root, ".env")).text()).toContain("OCR_MODEL_SIZE=small");
  const report = await Bun.file(join(root, "model-check.json")).json();
  expect(report.args).toEqual([
    "-m", "ryoshoku_ocr.prepare", "--model-size", "small", "--model-dir", join(root, "downloaded-models"),
  ]);
  expect(report.pythonpath).toBe(join(root, "python"));
});

test("setup preserves an existing env file and environment variables override its settings", async () => {
  const root = await fixture();
  const content = "OCR_MODEL_SIZE=small\nOCR_MODEL_DIR=./existing-models\n# Keep this file\n";
  await Bun.write(join(root, ".env"), content);
  const result = await run(root, "setup", { OCR_MODEL_SIZE: "medium" });
  expect(result.code).toBe(0);
  expect(await Bun.file(join(root, ".env")).text()).toBe(content);
  expect((await Bun.file(join(root, "model-check.json")).json()).args).toContain("medium");
});

test("setup stops if Python environment provisioning fails", async () => {
  const root = await fixture();
  const result = await run(root, "setup", { TEST_UV_FAILURE: "1" });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("exit 9");
  expect(await Bun.file(join(root, "model-check.json")).exists()).toBe(false);
});

test("clean removes generated caches while preserving models, data, dependencies, env and symlink targets", async () => {
  const root = await fixture();
  const external = await mkdtemp(join(tmpdir(), "ryoshoku-external-"));
  dirs.push(external);
  const removable = ["python/__pycache__/module.pyc", ".pytest_cache/state", "project.tsbuildinfo"];
  const retained = [".models/model.onnx", "data/__pycache__/keep", "node_modules/__pycache__/keep", ".venv/__pycache__/keep", ".git/__pycache__/keep", "custom-models/__pycache__/keep", "custom-data/.pytest_cache/keep", ".env"];
  for (const file of [...removable, ...retained]) {
    await mkdir(resolve(root, file, ".."), { recursive: true });
    await Bun.write(join(root, file), "keep");
  }
  await mkdir(join(external, "__pycache__"));
  await Bun.write(join(external, "__pycache__/keep"), "keep");
  await symlink(external, join(root, "external"));
  await symlink(join(root, "custom-models"), join(root, "models-alias"));
  const env = { OCR_MODEL_DIR: join(root, "models-alias"), DATA_DIR: join(root, "custom-data") };
  expect((await run(root, "clean", env)).code).toBe(0);
  for (const file of removable) expect(await Bun.file(join(root, file)).exists()).toBe(false);
  for (const file of retained) expect(await Bun.file(join(root, file)).text()).toBe("keep");
  expect(await Bun.file(join(external, "__pycache__/keep")).text()).toBe("keep");
  expect((await run(root, "clean", env)).code).toBe(0);
});
