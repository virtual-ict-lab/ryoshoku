// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type InteractionEditReplyOptions,
} from "discord.js";
import { loadConfig } from "../src/config";
import { handleCommand } from "../src/commands";

const first = "123456789012345678";
const second = "987654321098765432";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("parses multiple admin user IDs without losing precision and removes duplicates", () => {
  const config = loadConfig({ ADMIN_USER_IDS: ` ${first}, ${second},,${first}, ` });
  expect(config.adminUserIds).toEqual([first, second]);
});

test.each([undefined, "", " , "])("an empty admin list denies access: %s", (value) => {
  expect(loadConfig({ ADMIN_USER_IDS: value }).adminUserIds).toEqual([]);
});

test.each(["@admin", `${first},invalid`, "1.234e+17"])(
  "rejects invalid admin user IDs: %s",
  (value) => expect(() => loadConfig({ ADMIN_USER_IDS: value })).toThrow("ADMIN_USER_IDS"),
);

test("does not treat a legacy guild ID as an admin user ID", () => {
  expect(loadConfig({ ADMIN_GUILD_ID: first }).adminUserIds).toEqual([]);
});

// Replace only Discord response delivery; authorization and file export run normally.
function command(userId: string, name: string, guildId: string, administrator: boolean) {
  const replies: InteractionReplyOptions[] = [];
  const edits: InteractionEditReplyOptions[] = [];
  const interaction = {
    commandName: name,
    user: { id: userId },
    guildId,
    memberPermissions: { has: () => administrator },
    deferred: false,
    replied: false,
    async reply(options: InteractionReplyOptions) { replies.push(options); },
    async deferReply() { this.deferred = true; },
    async editReply(options: InteractionEditReplyOptions) { edits.push(options); },
  };
  return { interaction, replies, edits };
}

test.each([first, second])("listed user %s can export without Discord administrator permission", async (userId) => {
  const dir = await mkdtemp(join(tmpdir(), "ryoshoku-admin-"));
  dirs.push(dir);
  const config = loadConfig({ DATA_DIR: dir, ADMIN_USER_IDS: `${first},${second}` });
  const { interaction, replies, edits } = command(userId, "vj", "444444444444444444", false);
  await handleCommand(interaction as unknown as ChatInputCommandInteraction, config);
  expect(replies).toEqual([]);
  expect(interaction.deferred).toBe(true);
  expect(edits).toHaveLength(1);
  const file = edits[0]!.files![0] as { attachment: Buffer };
  expect(JSON.parse(file.attachment.toString())).toEqual({ schemaVersion: 1, weeks: [] });
});

test.each(["sr", "vj"])("unlisted Discord administrators cannot execute /%s", async (name) => {
  const config = loadConfig({ ADMIN_USER_IDS: first });
  const { interaction, replies, edits } = command(second, name, first, true);
  await handleCommand(interaction as unknown as ChatInputCommandInteraction, config);
  expect(replies).toHaveLength(1);
  expect(replies[0]!.content).toContain("権限がありません");
  expect(replies[0]!.flags).toBe(MessageFlags.Ephemeral);
  expect(interaction.deferred).toBe(false);
  expect(edits).toEqual([]);
});

test("an unset allowlist also denies Discord administrators", async () => {
  const { interaction, replies, edits } = command(first, "vj", first, true);
  await handleCommand(interaction as unknown as ChatInputCommandInteraction, loadConfig({}));
  expect(replies[0]!.content).toContain("権限がありません");
  expect(edits).toEqual([]);
});
