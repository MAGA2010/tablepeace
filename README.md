# TablePeace demo

**Different needs. One workable plan.**

> TablePeace helps student organizers find workable plans when needs conflict.

A responsive, buildless planning workspace for student project organizers. The fictional example compares group requirements, searches new venue/time combinations, and runs Peace Protocol across 1,024 deterministic alternate timelines. The Node server also runs shared rooms: organizers create a room, send distinct invitation links, collect private responses, propose a versioned plan, and see unanimous confirmation when every participant accepts a compatible plan.

## Run locally

- Install Node.js 20 or newer.
- Run npm run dev.
- Open the local URL printed by the server (default http://127.0.0.1:4178).
- Open **Create a room** to use the live flow. Room data is saved in `.data/rooms.json` by default. Set `TABLEPEACE_DATA_FILE` to use another path. Set `HOST=0.0.0.0` and `PORT` when hosting the server on a network.

## Honest demo boundaries

- Every person, plan response, and compatibility result in the example is fictional.
- The decision lab edits four fictional profiles only in this browser tab. Its search uses known venues and half-hour start times within the example time window. It does not check venue hours, reservations, or actual member approvals.
- Peace Protocol is a local deterministic stress test, not a prediction. It models 0, 15, or 30 minute availability shifts and optional 20% budget cuts. Its percentages describe those modeled cases only.
- The Node server persists shared rooms to one local JSON file. Organizer links show aggregate counts after all participants submit; each participant link shows only that slot's response. Anyone holding a link can act as its owner. Use HTTPS and persistent storage before sharing over the internet. Run one server process per data file.
- The GitHub Pages deployment serves `dist/` only. It cannot run `/api/rooms`; its Create a room screen explains that a TablePeace server is required. The Node server needs a separate deployment for public collaboration.
- AI requirement suggestions are not connected. Peace Protocol is deterministic simulation, not a model prediction.
- The comparison semantics were reconstructed from the supplied TablePeace implementation contract. The contract's companion reference fixture archive was not supplied, so its original reference cases cannot be claimed as reproduced.

## Validation

Run npm test for deterministic comparison checks, npm run lint for JavaScript syntax, and npm run build to check the static site files.

## Five-minute demo path

Use [DEMO.md](DEMO.md): run the shared room flow with separate browser profiles, then show the fictional Decision lab and Peace Protocol.

## Tech stack and configuration

The frontend is static HTML/CSS/JavaScript. The Node.js server has no runtime package dependencies. It stores rooms on its local filesystem. No AI API key is needed.

## Live demo

After GitHub Pages is enabled with **GitHub Actions** as its source, the site will be available at <https://maga2010.github.io/tablepeace/>. The workflow deploys the static site from `dist/` whenever `main` changes.
