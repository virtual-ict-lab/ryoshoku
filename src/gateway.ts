// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import { Client, Events } from "discord.js";
import { createLogger } from "./logger";

export function attachGatewayLogging(
  client: Client,
  log = createLogger("discord::gateway"),
  isClosing: () => boolean = () => false,
): void {
  client.on(Events.ShardReady, (shard) => log.info("Connected", { shard }));
  client.on(Events.ShardDisconnect, (event, shard) => {
    if (!isClosing()) log.error("Disconnected", { shard, code: event.code });
  });
  client.on(Events.ShardReconnecting, (shard) => {
    if (isClosing()) return;
    // discord.js emits ShardDisconnect only for unrecoverable closes.
    log.warn("Disconnected", { shard });
    log.warn("Reconnecting", { shard });
  });
  client.on(Events.ShardResume, (shard, replayedEvents) =>
    log.info("Session resumed", { shard, replayedEvents }),
  );
  client.on(Events.ShardError, (error, shard) =>
    log.error("Shard error", { shard, error }),
  );
  client.on(Events.Error, (error) => log.error("Connection error", { error }));
  client.on(Events.Warn, (message) => log.warn(message));
}
