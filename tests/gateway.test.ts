// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from "bun:test";
import { Client, Events } from "discord.js";
import { attachGatewayLogging } from "../src/gateway";
import { createLogger } from "../src/logger";

test("reports disconnect, reconnect, fresh connection and session resumption", async () => {
  const lines: string[] = [];
  const client = new Client({ intents: [] });
  attachGatewayLogging(client, createLogger("discord::gateway", {
    write: (line) => lines.push(line), color: false,
  }));
  try {
    client.emit(Events.ShardReady, 0, new Set());
    client.emit(Events.ShardDisconnect, { code: 4004 } as CloseEvent, 0);
    client.emit(Events.ShardReconnecting, 0);
    client.emit(Events.ShardResume, 0, 3);
    client.emit(Events.ShardError, new Error("Socket failed"), 0);
    expect(lines[0]).toContain("INFO  [discord::gateway] Connected shard=0");
    expect(lines[1]).toContain("Disconnected shard=0 code=4004");
    expect(lines.some((line) => line.includes("WARN  [discord::gateway] Reconnecting shard=0"))).toBe(true);
    expect(lines.some((line) => line.includes("INFO  [discord::gateway] Session resumed shard=0 replayedEvents=3"))).toBe(true);
    expect(lines.at(-1)).toContain("ERROR [discord::gateway]");
    expect(lines.at(-1)).toContain("Socket failed");
  } finally {
    await client.destroy();
  }
});

test("reports recoverable disconnections even when Discord only emits reconnecting", async () => {
  const lines: string[] = [];
  const client = new Client({ intents: [] });
  attachGatewayLogging(client, createLogger("discord::gateway", {
    write: (line) => lines.push(line), color: false,
  }));
  try {
    client.emit(Events.ShardReconnecting, 0);
    expect(lines[0]).toContain("Disconnected shard=0");
    expect(lines[1]).toContain("Reconnecting shard=0");
  } finally {
    await client.destroy();
  }
});

test("does not report an intentional shutdown as a reconnect attempt", async () => {
  const lines: string[] = [];
  const client = new Client({ intents: [] });
  attachGatewayLogging(client, createLogger("discord::gateway", {
    write: (line) => lines.push(line), color: false,
  }), () => true);
  try {
    client.emit(Events.ShardReconnecting, 0);
    client.emit(Events.ShardDisconnect, { code: 1000 } as CloseEvent, 0);
    expect(lines).toEqual([]);
  } finally {
    await client.destroy();
  }
});
