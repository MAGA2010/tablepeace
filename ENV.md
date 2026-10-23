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
| `HOST` | No | Bind address, default `127.0.0.1`. Use `0.0.0.0` behind a protected HTTPS host. |
| `PORT` | No | Port, default `4178`. |

Start with `npm run dev` on Node.js 20.6+. The server reads `.env` when present. Do not commit `.env`, expose its key in frontend code, or use public HTTP for participant links. The health endpoint returns only whether AI is configured; it never returns credentials.

If AI is not configured or the provider fails or times out, participants can still complete every field manually. AI notes are transmitted only after that participant checks consent and requests an interpretation. Raw notes are not stored in room data; reviewed structured fields and review acknowledgements persist with that participant’s private response. The usage limiter is in memory and resets when the local process restarts; production hosting should use a durable shared quota at the gateway or database layer.

For public judging, deploy the Node server behind HTTPS with persistent shared storage. GitHub Pages hosts the static example but does not serve `/api/rooms` or the AI routes. The local development checkout can configure MiniMax in its ignored `.env`; no credential is included in the repository or Pages deployment.
