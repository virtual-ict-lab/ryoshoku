// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { REST, Routes } from "discord.js";
import { z } from "zod";
import { commandDefinitions } from "./commands";
import { createLogger, elapsed } from "./logger";

const log = createLogger("discord::registration");

export async function registerCommands(
  rest: REST,
  applicationId?: string,
  guildId?: string,
): Promise<void> {
  const started = performance.now();
  log.info("Registering commands", { scope: guildId ? "guild" : "global" });
  const id =
    applicationId ??
    z
      .object({ id: z.string().regex(/^\d+$/) })
      .parse(await rest.get(Routes.oauth2CurrentApplication())).id;
  const route = guildId
    ? Routes.applicationGuildCommands(id, guildId)
    : Routes.applicationCommands(id);
  await rest.put(route, {
    body: commandDefinitions().map((command) => command.toJSON()),
  });
  log.info("Commands registered", {
    scope: guildId ? "guild" : "global",
    duration: elapsed(started),
  });
}
