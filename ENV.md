# Server setup

The room API runs on the Node server. Its default data file is `.data/rooms.json`; it creates the directory and file on first room creation.

Copy `.env.example` to `.env`, then set the following values on the server if you want live AI suggestions:

| Variable | Required | Purpose |
| --- | --- | --- |
| `AI_API_KEY` | For AI | Provider credential; server only. |
| `AI_MODEL` | For AI | MiniMax China example: `MiniMax-M2.5`; use a model supported by the configured provider. |
| `AI_BASE_URL` | No | MiniMax China example: `https://api.minimax.cn/v1`, which uses `/text/chatcompletion_v2`; other providers use an OpenAI-compatible API base and `/chat/completions`. |
| `AI_LIMIT_CALLS_PER_MINUTE` | No | Shared server cap, default `6`. |
| `AI_LIMIT_CALLS_PER_DAY` | No | Shared server cap, default `40` per rolling 24 hours. |
| `AI_LIMIT_CALLS_PER_ROOM_DAY` | No | Room cap, default `12` per rolling 24 hours. |
| `AI_LIMIT_CALLS_PER_LINK_DAY` | No | Host or participant invite cap, default `3` per rolling 24 hours. |
| `AI_LIMIT_LINK_COOLDOWN_SECONDS` | No | Minimum interval for one invite link, default `5` seconds. |
| `TABLEPEACE_DATA_FILE` | No | Room JSON file path, default `.data/rooms.json`. |
| `AI_LIMITER_DATA_FILE` | No | Durable AI usage event file. Defaults beside `TABLEPEACE_DATA_FILE`. Keep it on the same persistent volume as room data. |
| `ROOM_RETENTION_DAYS` | No | Room and invitation lifetime, from 1–90 days; default `7`. Expired room data is deleted. |
| `HOST` | No | Bind address, default `127.0.0.1`. Use `0.0.0.0` behind a protected HTTPS host. |
| `PORT` | No | Port, default `4178`. |

Start with `npm run dev` on Node.js 20.6+. The server reads `.env` when present. Do not commit `.env`, expose its key in frontend code, or use public HTTP for participant links. The health endpoint returns only whether AI is configured; it never returns credentials.

If AI is not configured or the provider fails or times out, participants can still complete every field manually. AI notes are transmitted only after that participant checks consent and requests an interpretation. Raw notes are not stored in room data; reviewed structured fields and review acknowledgements persist with that participant’s private response. When `AI_LIMITER_DATA_FILE` is configured, quota events are stored atomically and survive restarts. This file-backed limiter and room store are designed for one server instance.

For public judging, use the prepared Render Blueprint in `render.yaml`; it runs one paid HTTPS web service with a persistent disk. GitHub Pages hosts the static example but does not serve `/api/rooms` or the AI routes. Set the MiniMax key as a Render secret; no credential belongs in the repository, Pages deployment, or browser code. Rooms expire after seven days. The deployment has no independent backup yet, so keep test rooms fictional until backups and data handling have been reviewed.
