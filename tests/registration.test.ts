// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from "bun:test";
import { REST } from "discord.js";
import { registerCommands } from "../src/registration";

test("registers commands using the authenticated application without a configured ID", async () => {
  const received: { path: string; body: unknown }[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/v10/oauth2/applications/@me")
        return Response.json({ id: "123456789012345678" });
      if (request.method === "PUT") {
        const body = await request.json();
        received.push({ path, body });
        return Response.json(body);
      }
      return new Response("Unexpected request", { status: 404 });
    },
  });
  try {
    const rest = new REST({
      version: "10",
      api: server.url.origin,
      retries: 0,
    }).setToken("test-only-token");
    await registerCommands(rest);
    expect(received.length).toBe(1);
    expect(received[0]!.path).toBe(
      "/v10/applications/123456789012345678/commands",
    );
    expect(
      (received[0]!.body as { name: string }[]).map((c) => c.name),
    ).toEqual(["today", "tomorrow", "search", "help", "privacy", "sr", "vj"]);
    const commands = received[0]!.body as { name: string; default_member_permissions?: string | null }[];
    for (const command of commands.filter((c) => ["sr", "vj"].includes(c.name))) {
      expect(command.default_member_permissions).toBeNull();
    }
  } finally {
    server.stop(true);
  }
});

test("uses the application discovered at login and supports explicit guild registration", async () => {
  let path = "";
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      path = new URL(request.url).pathname;
      if (request.method !== "PUT")
        return new Response("No application lookup expected", { status: 400 });
      return Response.json(await request.json());
    },
  });
  try {
    const rest = new REST({
      version: "10",
      api: server.url.origin,
      retries: 0,
    }).setToken("test-only-token");
    await registerCommands(rest, "123456789012345678", "987654321098765432");
    expect(path).toBe(
      "/v10/applications/123456789012345678/guilds/987654321098765432/commands",
    );
  } finally {
    server.stop(true);
  }
});
