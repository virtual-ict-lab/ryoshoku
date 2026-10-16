import { REST, Routes } from "discord.js";
import { z } from "zod";
import { commandDefinitions } from "./commands";

export async function registerCommands(
  rest: REST,
  applicationId?: string,
  guildId?: string,
): Promise<void> {
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
}
