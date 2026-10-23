# TablePeace hackathon handoff

## Product

TablePeace helps small groups turn private needs into one workable plan. Its live-room flow gives each person a separate invitation, keeps participant answers private, checks supported hard constraints deterministically, shows soft-preference tradeoffs separately, and records approval against a versioned proposal.

## Verified in this build

- The local Node room server creates persistent rooms with separate participant slots. Organizers receive aggregate response data; participants see their own saved response.
- Hard time, budget, and supported setting conflicts block a plan. Unsupported hard needs stay unresolved. Soft preferences affect fit scores but never override feasibility.
- A proposal is confirmed only when every participant accepts the same revision. A rejection remains a rejection, and a changed proposal requires new approvals.
- Optional AI flows are server-side, consent-based, source-grounded, and constrained to structured fields or already-generated alternative IDs. The test provider is mocked.
- `npm test`, `npm run lint`, and `npm run build` pass. The suite has 23 tests, including privacy, persistence, feasibility, and AI failure behavior.
- The public GitHub Pages site serves the static demo from `dist/`. It does not host the room API.

## Limits to state clearly

- No live AI provider is configured; the interface shows the setup state and manual entry remains available.
- No public HTTPS room server or durable shared database is configured. Local rooms persist on the machine running the Node server.
- No target-user research, live AI-versus-manual study, or venue-availability check has been completed. The example room and test data are fictional.
- The companion reference-fixture archive was not supplied, so parity with those cases is not claimed.

## Demo and judge review

Use [DEMO.md](DEMO.md) for the five-minute walkthrough. It covers room creation, private responses, hard versus soft needs, alternative proposals, unanimous approval, persistence, and the setup limitations. Do not present mock-provider tests as evidence of live AI quality or user benefit.

The internal pre-submission self-review scored the build **3.29/5** across seven dimensions: problem clarity 4, originality 3, completeness 3, technical depth 4, demo quality 3, business value 3, and submission readiness 3. This is a heuristic review, not a prediction from a competition judge. The strongest evidence is the tested local group flow and constrained decision engine. The largest score limits are missing external research, no public shared-room backend, no live AI comparison, and no recorded demo. The detailed review is saved locally in `.hackathon/artifacts/judge-feedback.md`; `.hackathon/` is intentionally excluded from the public repository.

## Run and links

Use Node.js 20.6 or newer, then run `npm run dev` and open `http://127.0.0.1:4178`. The project has no package dependencies to install. See [README.md](README.md) and [ENV.md](ENV.md) for setup.

- Repository: <https://github.com/MAGA2010/tablepeace>
- Static demo: <https://maga2010.github.io/tablepeace/>
- Live room server: local demo only; no public API URL is configured.
