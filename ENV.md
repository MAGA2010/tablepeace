# Server setup

The room API runs on the Node server. Its default data file is `.data/rooms.json`; it creates the directory and file on first room creation.

Copy `.env.example` to `.env`, then set the following values on the server if you want live AI suggestions:

| Variable | Required | Purpose |
| --- | --- | --- |
| `AI_API_KEY` | For AI | Provider credential; server only. |
| `AI_MODEL` | For AI | Model name supported by the configured provider. |
| `AI_BASE_URL` | No | OpenAI-compatible API base, default `https://api.openai.com/v1`. The server appends `/chat/completions`. |
| `TABLEPEACE_DATA_FILE` | No | Room JSON file path, default `.data/rooms.json`. |
| `HOST` | No | Bind address, default `127.0.0.1`. Use `0.0.0.0` behind a protected HTTPS host. |
| `PORT` | No | Port, default `4178`. |

Start with `npm run dev` on Node.js 20.6+. The server reads `.env` when present. Do not commit `.env`, expose its key in frontend code, or use public HTTP for participant links. The health endpoint returns only whether AI is configured; it never returns credentials.

If AI is not configured or the provider fails or times out, participants can still complete every field manually. AI notes are transmitted only after that participant checks consent and requests an interpretation. Raw notes are not stored in room data; reviewed structured fields and review acknowledgements persist with that participant’s private response.

For public judging, deploy the Node server behind HTTPS with persistent shared storage. GitHub Pages hosts the static example but does not serve `/api/rooms` or the AI routes. Current deployment access, database credentials, and AI credentials were not available during this implementation.
