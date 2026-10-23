# TablePeace

**Different needs. One workable plan.** TablePeace helps a small group plan together when schedules, budgets, accessibility needs, and preferences differ.

The existing static HTML/CSS/JavaScript app includes a fictional example, a deterministic comparison and what-if engine, and a Node shared-room server. Organizers create rooms for 3–8 people, share a separate private invite link with each person, collect requirements, propose a versioned plan, and confirm only after every participant accepts a compatible proposal.

## Run locally

- Use Node.js 20.6 or newer.
- No dependency installation is needed; the project has no runtime package dependencies.
- Copy `.env.example` to `.env` if you want to configure an AI provider. Leave credentials blank for the manual-only demo.
- Run `npm run dev` and open `http://127.0.0.1:4178`.
- Open **Create a room**. Room data is persisted in `.data/rooms.json` by default. Set `TABLEPEACE_DATA_FILE`, `HOST`, or `PORT` to change the storage location or bind address.

## AI behavior and privacy

AI requirement drafts are optional and server-side. The included `.env.example` is set up for MiniMax China (`https://api.minimax.cn/v1`, `MiniMax-M2.5`); its server adapter uses MiniMax's [documented `/text/chatcompletion_v2` route](https://minimax.cn/models/text). Other providers can use an OpenAI-compatible `/chat/completions` endpoint. Never put a provider key in browser code or commit `.env`.

Participants explicitly consent before sending a note. The AI returns source phrases and structured draft fields; the participant reviews each suggestion, and the final response form still needs an explicit save. Low-certainty or unclear suggestions are not applied. Unsupported hard requirements stay unresolved, so no plan can be marked as fitting them. Raw notes are not stored in the room file. A configured provider receives the volunteered note, so use a provider approved for your data and review its handling terms. The server enforces conservative per-link, per-room, per-minute, and daily request limits. These in-memory limits reset when the local server restarts; public hosting should enforce durable limits at a trusted gateway or shared store.

When no original option fits, the organizer can ask the AI to rank up to three alternatives generated from room venues, available time windows, and confirmed responses. The AI cannot invent venue facts or decide feasibility. TablePeace reruns deterministic checks and labels each candidate with hard conflicts, unknowns, and equal-weight soft-preference fit. Without provider configuration, the same manual deterministic alternatives remain available and are labeled as such.

## Honest demo boundaries

- Every person, plan, response, and result in the example workspace is fictional.
- The decision lab edits fictional profiles in the browser only. Peace Protocol is a deterministic stress test of modeled assumptions, not a prediction.
- Hard feasibility is separate from soft-preference fit. Each participant’s expressed soft preferences are scored first, then participants are averaged equally. Soft preferences never turn a hard conflict into a feasible plan.
- Unsupported hard needs remain unresolved; this prototype does not yet evaluate accessibility or location constraints beyond its supported time, budget, and quiet-space fields.
- Shared rooms are persisted by the local Node server. Organizer links show aggregate counts; each participant link sees only that participant’s saved response. Anyone holding an invite can act as its slot. Use HTTPS and durable database storage before public use.
- The GitHub Pages workflow serves `dist/` only. GitHub Pages cannot run the room API or AI routes. A separate HTTPS Node deployment and persistent storage are required for a public collaborative flow. Current server/AI availability is shown in the setup state.
- The comparison semantics were reconstructed from the supplied TablePeace implementation contract. Its companion reference archive was not supplied, so the original reference cases are not claimed as reproduced.

## Verify

Run `npm test`, `npm run lint`, and `npm run build`. Tests include deterministic feasibility, room privacy and persistence, AI schema/source validation, safe provider failures, rate limits, and constrained alternative selection. Automated AI tests use a mock provider. A separate local MiniMax smoke test confirmed structured draft connectivity; it does not establish model quality or user benefit.

See [DEMO.md](DEMO.md) for the five-minute presentation and [ENV.md](ENV.md) for server configuration.

## Live static example

After GitHub Pages is enabled with **GitHub Actions** as its source, the static site is available at <https://maga2010.github.io/tablepeace/>. Live shared rooms require the separate Node deployment described above.
