# Five-minute TablePeace demo

## Prepare

Run `npm run dev` from the project folder and open `http://127.0.0.1:4178`. This walkthrough creates a separate fictional live room and uses four participant links in separate browser profiles. Do not describe it as research or real user activity. The development checkout can use the server-side MiniMax credential from its ignored local `.env`; the public GitHub Pages site remains a static example and has no room backend. If a judge's setup has no provider credentials, enter the same requirements manually and show the “AI not configured” recovery state.

## Script

**0:00–0:30 — Problem.** “A student group can agree on an activity and still get stuck on schedule, cost, or access needs. TablePeace collects private requirements, separates hard constraints from preferences, and asks everyone to confirm the same plan revision. This is a prototype; we have not completed external user research.”

**0:30–1:15 — Create and invite.** Open **Create a room**, enter “Friday project meetup,” choose four people and `Asia/Hong_Kong`, then add three one-hour options for Friday 23 October 2026: Coffee Hub at 18:00 for ¥35 with a moderate setting; School Library at 18:00 for free with a quiet setting; and Makerspace at 19:00 for ¥60 with a lively setting. Create the room and open the four participant invitation links in distinct browser profiles. The room starts with an initial proposal; it is not yet a group decision.

**1:15–2:15 — Private requirements.** Use supported hard requirements for the successful path. In the participant forms, enter: Participant 1, available 19:00–22:00, max ¥100, no quiet requirement; Participant 2, 18:00–22:00, max ¥40, no quiet requirement; Participant 3, 18:00–22:00, max ¥100, quiet space required; Participant 4, 19:00–22:00, max ¥50, no quiet requirement. Each participant can enter these manually, or consent to an AI draft, inspect every interpreted field, correct it, and save. Do not put step-free access in this room: the engine cannot verify venue accessibility. Show it separately in a second room as an unresolved hard requirement, which must prevent a false feasibility claim.

**2:15–3:00 — Compare and explain.** The organizer sees only aggregate counts and a next-step explanation for each option. Coffee Hub at 18:00 is blocked by time and quiet-space needs; School Library at 18:00 is blocked by availability; Makerspace at 19:00 is blocked by budget and quiet-space needs. The host sees categories and counts, never a participant’s raw schedule, budget, note, or identity.

**3:00–4:15 — Find a proposal and decide.** The deterministic alternatives include School Library at 19:00. It fits all four submitted requirements; the venue and its hours are still unverified. Propose that option and read its revision number aloud. All four participants accept that same revision from their own links. Do not test a rejection in the success run, because a rejection correctly prevents confirmation; use a separate room if showing that branch. The room should then show four approvals and a confirmed result.

**4:15–5:00 — Persistence and limits.** Refresh the host and participant pages. Show that all four approvals still apply to the same proposal revision and the room remains confirmed. Close with: “This is a local demo using fictional participants. Venue access, hours, and booking are not verified. Public collaboration still needs the configured HTTPS service and durable storage; we have not completed user research.”

## Run checks

Run `npm test`, `npm run lint`, and `npm run build`. The live-room regression test creates four participants, finds the feasible 19:00 library proposal, records unanimous approval on one revision, reloads persisted state, and checks confirmation again. The AI tests use mocked provider responses; they do not count as a live AI comparison or user study.
