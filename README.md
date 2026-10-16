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

Launch test:
```sh
bun run start
```
