# Five-minute TablePeace demo

## Prepare

Run `npm run dev` from the project folder and open `http://127.0.0.1:4178`. For a stable walkthrough, use the fictional scenario below and separate browser profiles for the four participant links. Do not describe the seeded scenario as research or real user activity. This development checkout can use MiniMax from its ignored local `.env`; the public GitHub Pages site has no API key or room backend. If a judge's local setup has no provider credentials, use manual entry and show the visible “AI not configured” recovery state.

## Script

**0:00–0:30 — Problem.** “A student group can agree on an activity and still get stuck on schedule, cost, or access needs. TablePeace collects private requirements, separates hard constraints from preferences, and asks everyone to confirm the same plan revision. This is a prototype; we have not completed external user research.”

**0:30–1:15 — Create and invite.** Open **Create a room**, enter “Friday project meetup,” choose four people and the room time zone, then add three options: Coffee Hub at 18:00 for ¥35 with a moderate setting; School Library at 18:00 for free with a quiet setting; and Makerspace at 19:00 for ¥60 with a lively setting. Create the room and open the four separate invitation links in distinct browser profiles.

**1:15–2:15 — Private requirements.** Each person opts in, enters one sentence, reviews the exact phrase and proposed fields, corrects or confirms it, then explicitly saves. Use notes such as “I can arrive after 19:00,” “I need a quiet space,” “I can spend at most ¥40,” and “I need step-free access.” Demonstrate that an unsupported hard need such as step-free access remains unresolved. If AI is not configured, fill supported fields manually; the note is not sent in that state.

**2:15–3:00 — Compare and explain.** The organizer sees only aggregate counts. Point out the hard time, budget, and setting conflicts, the unresolved hard-requirement count, and soft preference fit. The percentage is calculated per participant from that person’s expressed soft preferences, then averaged equally; it does not change feasibility. No individual schedule or budget appears in the organizer view.

**3:00–4:15 — Find a proposal and decide.** Show deterministic combinations generated from the room’s known venues and available times. Use **Ask AI to rank alternatives** only after all original options fail; its output can choose only generated candidates, and every candidate’s feasibility remains the deterministic result. If AI is unavailable, deterministic alternatives remain available. Propose School Library at 19:00 if the submitted hard needs support it. Accept from the participant links. Then reject one revision to show that rejection is recorded as rejection, not acceptance; the organizer can propose a new version.

**4:15–5:00 — Persistence and limits.** Refresh the host and participant pages. Show that private responses, review acknowledgements, the current proposal revision, and each decision persist. Close with: “The local room server and MiniMax connection are configured for this demo. Public collaboration still needs an HTTPS backend and persistent shared storage. This walkthrough uses fictional participants; it is not user research, and venue availability is unverified.”

## Run checks

Run `npm test`, `npm run lint`, and `npm run build`. The AI tests use mocked provider responses. They validate schema, source grounding, failure handling, and candidate-ID restrictions; they do not count as a live AI comparison or user study.
