// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { Client, Events, GatewayIntentBits } from "discord.js";
import { handleCommand } from "./commands";
import { loadConfig } from "./config";
import { updateMenu, waitForUpdates } from "./update";
import { registerCommands } from "./registration";
import { attachGatewayLogging } from "./gateway";
import { createLogger } from "./logger";

const log = createLogger("bot");

export async function startBot(): Promise<void> {
  const config = loadConfig();
  if (!config.token) throw new Error("DISCORD_BOT_TOKEN is required");
  log.info("Starting bot");
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let closing = false;
  attachGatewayLogging(client, undefined, () => closing);
  client.on(Events.InteractionCreate, (interaction) => {
    if (!closing && interaction.isChatInputCommand())
      void handleCommand(interaction, config);
  });
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      await updateMenu(config);
    } catch (error) {
      log.error("Menu refresh failed", { error });
    } finally {
      refreshing = false;
    }
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  client.once(Events.ClientReady, (readyClient) => {
    log.info("Bot ready", {
      updateIntervalHours: config.updateIntervalMs / 3600000,
    });
    void registerCommands(readyClient.rest, readyClient.application.id).catch(
      (error) => log.error("Command registration failed", { error }),
    );
    void refresh();
    timer = setInterval(() => void refresh(), config.updateIntervalMs);
  });
  const stop = (signal: string) => {
    if (closing) return;
    closing = true;
    log.info("Shutting down", { signal });
    if (timer) clearInterval(timer);
    void (async () => {
      await client.destroy();
      await waitForUpdates();
      log.info("Bot stopped");
      process.exit(0);
    })().catch((error) => {
      log.error("Shutdown failed", { error });
      process.exit(1);
    });
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  log.info("Connecting to Discord");
  await client.login(config.token);
}
