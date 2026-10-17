# knct-ryoshoku

I'm back! It's the Kagawa KOSEN ryoshoku bot.
You can use it as a Discord bot.

## Deploy

```sh
bun run setup
# Set DISCORD_BOT_TOKEN as an environment variable
bun run start
```

`start` runs the bot with `NODE_ENV=production`, without watching source files.

Set `ADMIN_USER_IDS` to a comma-separated list of Discord user IDs to allow
those users to run `/sr` and `/vj`, for example:

```dotenv
ADMIN_USER_IDS=123456789012345678,987654321098765432
```

Only the listed users can run these commands, regardless of server or Discord
administrator permissions. Leaving the list empty disables both commands.
This replaces `ADMIN_GUILD_ID`; use user IDs instead of a server ID. Restart
the bot after changing the list. Global commands are re-registered automatically
at startup to clear the previous administrator permission requirement. If you
previously registered commands for specific guilds, re-register each guild once:

```sh
bun run src/cli.ts register --guild GUILD_ID
```

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

Bun and uv must be installed first. uv prepares the Python environment and can
download a compatible Python interpreter when needed.

```sh
bun run setup
```

`setup` installs JavaScript and Python development dependencies from the lockfiles,
creates `.env` only when it is missing, and downloads the detection and recognition
models selected by `OCR_MODEL_SIZE` into `OCR_MODEL_DIR`. It runs a generated-image
OCR check so both models are loaded before the first menu request. Existing `.env`
settings are preserved; environment variables take precedence. Set the Discord
token in `.env` before starting the bot. Running `setup` again reuses installed
dependencies and downloaded models.

Remove project caches:
```sh
bun run clean
```

`clean` removes `__pycache__`, `.pytest_cache`, and `*.tsbuildinfo` within the
project. It preserves `.env`, models, menu data, `node_modules`, and `.venv`,
including configured model and data directories. It does not follow symlinks
or clear shared package caches.

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
