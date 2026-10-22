# TablePeace demo

**Different needs. One workable plan.**

> TablePeace helps student organizers find workable plans when needs conflict.

A responsive, buildless planning workspace for student project organizers. The demo compares fictional group requirements, shows aggregate conflicts, and lets the viewer test a venue or time alternative.

## Run locally

- Install Node.js 20 or newer.
- Run npm run dev.
- Open the local URL printed by the server (default http://127.0.0.1:4178).

## Honest demo boundaries

- Every person, plan response, and compatibility result in the example is fictional.
- The conflict explorer recomputes a deterministic what-if from the bundled sample fixture. It does not check venue hours, reservations, or actual member approvals.
- Shared rooms and persistent private responses need a database and server-side access rules. AI requirement suggestions need a server-side provider connection. Both are shown as not configured.
- This build asks for no credentials and does not persist form input.
- The comparison semantics were reconstructed from the supplied TablePeace implementation contract. The contract's companion reference fixture archive was not supplied, so its original reference cases cannot be claimed as reproduced.

## Validation

Run npm test for deterministic comparison checks, npm run lint for JavaScript syntax, and npm run build to check the static site files.

## Five-minute demo path

Use [DEMO.md](DEMO.md): compare the three example plans, show the privacy boundary, test School Library at 18:00, then show that zero confirmations and venue verification are still outstanding.

## Tech stack and configuration

This is a static HTML/CSS/JavaScript site using a small Node.js preview server. It has no runtime package dependencies and requires no environment variables or API keys. Shared rooms and AI suggestions remain unconfigured in this demo; the setup panel describes the server-side services needed to enable them.

## Live demo

After GitHub Pages is enabled with **GitHub Actions** as its source, the site will be available at <https://maga2010.github.io/tablepeace/>. The workflow deploys the static site from `dist/` whenever `main` changes.
