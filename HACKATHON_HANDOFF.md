# TablePeace hackathon handoff

## Product

TablePeace helps small groups turn private needs into one workable plan. Its live-room flow gives each person a separate invitation, keeps participant answers private, checks supported hard constraints deterministically, shows soft-preference tradeoffs separately, and records approval against a versioned proposal.

## Verified in this build

- The local Node room server creates persistent rooms with separate participant slots. Organizers receive aggregate response data; participants see their own saved response.
- Hard time, budget, and supported setting conflicts block a plan. Unsupported hard needs stay unresolved. Soft preferences affect fit scores but never override feasibility.
- A proposal is confirmed only when every participant accepts the same revision. A rejection remains a rejection, and a changed proposal requires new approvals.
- Optional AI flows are server-side, consent-based, source-grounded, and constrained to structured fields or already-generated alternative IDs. A separate local MiniMax smoke request returned the supported time and setting fields; automated tests still use a mocked provider.
- The server caps AI at 6 requests per minute and 40 per rolling day, with 12 per room and 3 per invite link per rolling day plus a five-second per-link cooldown. The configured usage file survives restarts on a persistent disk.
- Rooms and invitation links expire after seven days, then the stored room is deleted. Raw AI notes are not stored.
- The corrected scripted path uses four supported hard requirements, finds School Library at 19:00, records four approvals on one proposal revision, and remains confirmed after reload. A separate accessibility case stays unresolved.
- `npm test`, `npm run lint`, and `npm run build` pass. The suite has 30 tests, including the full scripted decision, persistence, privacy, provider failure, and rate-limit behavior.
- The public GitHub Pages site serves the static demo from `dist/`. It does not host the room API.

## Limits to state clearly

- MiniMax is configured only in this local development environment; the public Pages site has no API key or room server. The interface shows a safe setup state when credentials are absent.
- A Render Blueprint is prepared in `render.yaml`; it has not been applied. Public rooms still require the organizer to connect Render, configure the server secret, and test the resulting HTTPS URL from outside the developer's network. The Blueprint uses one paid service and a persistent disk; it does not configure independent backups.
- No target-user research, AI-versus-manual study, or venue-availability check has been completed. The example room and test data are fictional.
- No five-minute recording or cross-device public-path verification has been completed.
- The companion reference-fixture archive was not supplied, so parity with those cases is not claimed.

## Demo and judge review

The latest user-provided grade is **60/100**; this is not a promised competition score. Use [DEMO.md](DEMO.md) for the corrected five-minute walkthrough, [DEPLOY.md](DEPLOY.md) for public setup, and [USER_TEST_PLAN.md](USER_TEST_PLAN.md) to collect genuine user evidence. Do not present mock-provider tests or fictional participants as evidence of live AI quality or user benefit.

The strongest current evidence is the tested local group flow, deterministic feasibility, persisted approval, server-side AI setup, and bounded usage. The main remaining score limits are missing external research, no deployed public room service, no AI-versus-manual comparison, no independent backups, and no recorded demo. `.hackathon/` contains local heuristic artifacts and is intentionally excluded from the public repository.

## Run and links

Use Node.js 20.6 or newer, then run `npm run dev` and open `http://127.0.0.1:4178`. The project has no package dependencies to install. See [README.md](README.md) and [ENV.md](ENV.md) for setup.

- Repository: <https://github.com/MAGA2010/tablepeace>
- Static demo: <https://maga2010.github.io/tablepeace/>
- Live room server: local at `http://127.0.0.1:4178`; public hosting is prepared but not configured.
