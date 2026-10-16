// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { Client, Events, GatewayIntentBits } from "discord.js";
import { handleCommand } from "./commands";
import { loadConfig } from "./config";
import { updateMenu, waitForUpdates } from "./update";
import { registerCommands } from "./registration";

export async function startBot(): Promise<void> {
  const config = loadConfig();
  if (!config.token) throw new Error("DISCORD_BOT_TOKEN is required");
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let closing = false;
  client.on(Events.InteractionCreate, (interaction) => {
    if (!closing && interaction.isChatInputCommand())
      void handleCommand(interaction, config);
  });
  client.on(Events.Error, (error) =>
    console.error("Discord connection error:", error.message),
  );
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const r = await updateMenu(config);
      console.info(
        `Menu ${r.changed ? "updated" : "unchanged"}: ${r.menu.startDate}..${r.menu.endDate}`,
      );
    } catch (error) {
      console.error(
        "Menu refresh failed:",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      refreshing = false;
    }
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  client.once(Events.ClientReady, (readyClient) => {
    console.info("Discord bot ready");
    void registerCommands(readyClient.rest, readyClient.application.id)
      .then(() => console.info("Discord commands registered automatically"))
      .catch((error) =>
        console.error(
          "Discord command registration failed:",
          error instanceof Error ? error.message : String(error),
        ),
      );
    void refresh();
    timer = setInterval(() => void refresh(), config.updateIntervalMs);
  });
  const stop = () => {
    if (closing) return;
    closing = true;
    if (timer) clearInterval(timer);
    void (async () => {
      await client.destroy();
      await waitForUpdates();
      process.exit(0);
    })();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await client.login(config.token);
}
