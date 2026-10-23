# Public live-room setup

GitHub Pages serves the static example. Use the Render web service for the shared-room API and live interface; it serves the same `dist/` files and keeps the provider key on the server.

## Create the service

1. Connect the `MAGA2010/tablepeace` GitHub repository to Render and create a Blueprint instance from `render.yaml`.
2. Add `AI_API_KEY` as a secret in the Render service settings. Do not put it in Git, a browser field, or the public Pages build. The service remains usable with manual entry if this secret is left unset.
3. Apply the Blueprint and wait for `/api/health` to report `ready`. Render provides the service over HTTPS. Share the resulting Render URL for live rooms; the Pages URL remains the static example.
4. Test room creation, four separate invitation links, response submission, proposal, unanimous decision, and refresh from devices outside the developer's network before a judge uses the link.

The Blueprint uses one paid web-service instance with a 1 GB persistent disk. Render's persistent disk requires a paid service plan. Room data and AI usage counters are written under `/var/data`; the AI limits therefore survive a restart while this remains a single instance. The configured limits are six provider calls per minute, 40 per day, 12 per room per day, three per invitation link per day, and a five-second per-link cooldown.

Rooms and invitation links expire after seven days. Expired room records are removed at startup and by the periodic cleanup task. Participant notes are not stored; reviewed structured requirements remain in the room file until expiry. Keep real sensitive needs out of this demo until independent backups and a reviewed data-retention process are in place. Persistent storage protects against a restart, but it is not an independent backup.

## Verify before sharing

- Confirm the health endpoint, HTTPS, and AI setup state from the deployed service.
- Create a fictional four-person room and test every invitation from separate devices or browser profiles.
- Confirm that the organizer sees only aggregate conflict categories and counts.
- Confirm one feasible proposal gets four approvals on one revision and stays confirmed after refresh.
- Confirm the seven-day expiry and the unsupported-accessibility path remain unresolved.
- Check that the provider key is masked in Render settings and absent from the built site and Git history.

This deployment file prepares the service; it does not create a Render account, apply a paid service, or prove the cross-device checks above.
