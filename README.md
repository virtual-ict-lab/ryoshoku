# knct-ryoshoku

I'm back! It's the Kagawa KOSEN ryoshoku bot.
You can use it as a Discord bot.

## Deploy

```sh
bun install --frozen-lockfile
uv sync --frozen
cp .env.example .env
# Set DISCORD_BOT_TOKEN as an environment variable
bun run start
```

`start` runs the bot with `NODE_ENV=production`, without watching source files.

## Logging

Logs are written to stderr in English. Timestamps use Japan Standard Time
(JST, UTC+09:00) with milliseconds; durations use seconds with three decimal places.

```text
2026-10-17 18:30:02.123 INFO  [discord::gateway] Connected shard=0
2026-10-17 18:30:18.360 INFO  [menu::update] Menu updated startDate=2026-10-12 endDate=2026-10-18 duration=15.237s
2026-10-17 19:12:00.456 WARN  [discord::gateway] Reconnecting shard=0
2026-10-17 19:12:02.789 INFO  [discord::gateway] Session resumed shard=0 replayedEvents=3
```

Levels and module names are colored in a terminal. Colors are disabled when
stderr is redirected, `TERM=dumb`, or `NO_COLOR` is set. Connection changes,
command execution, PDF downloads, OCR progress, menu updates, and shutdown are
logged. Errors include their stack traces. CLI JSON results stay on stdout.

## Develop

### require
- Bun 1.4.2
- uv 0.12.23
- Python >=3.11,<3.14

```sh
bun install --frozen-lockfile
uv sync --frozen
cp .env.example .env
```

Local transcription check:
```sh
bun run extract /path/to/kondate.pdf
```

Start the bot:
```sh
bun run start
```

The bot registers Discord commands and refreshes menus automatically. Bot
tokens and data paths are controlled by the environment variables shown in
`.env.example`.

The maintenance commands remain available directly through the CLI:
```sh
bun run src/cli.ts register [--guild ID]
bun run src/cli.ts update
bun run src/cli.ts reformat /path/to/raw.json
bun run src/cli.ts preview [--date YYYY-MM-DD]
```
