import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RoomStore } from '../scripts/room-store.mjs';
import { fixture } from '../dist/engine.js';

test('private room persists, invalidates stale approvals, and confirms only unanimous compatible proposal', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tablepeace-'));
  try {
    const filename = path.join(directory, 'rooms.json');
    const store = new RoomStore(filename);
    await store.load();
    const created = await store.create({ title: 'Friday plan', expectedCount: 3, options: fixture.options.slice(0, 2) }, 'http://localhost:4178');
    const room = store.get(created.id);
    const hostToken = created.hostUrl.split('.').at(-1);
    const host = store.authenticate(room, hostToken);
    const tokens = created.invites.map(invite => invite.url.split('.').at(-1));
    const guests = tokens.map(token => store.authenticate(room, token));
    assert.throws(() => store.authenticate(room, 'bad-token'), /Invalid room link/);
    assert.equal(guests[0].slot, 1);
    const response = { startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T12:00:00.000Z', maxBudgetMinor: 2000, needsQuiet: true };
    await store.submit(room, 1, response);
    assert.equal(store.snapshot(room, guests[1], 'http://localhost:4178').response, null);
    assert.equal(store.snapshot(room, host, 'http://localhost:4178').results, null);
    await store.submit(room, 2, response);
    await store.submit(room, 3, response);
    const initial = store.snapshot(room, host, 'http://localhost:4178');
    assert.equal(initial.submitted, 3);
    assert.equal(initial.participantStatus[0].response, undefined);
    await store.propose(room, { venueId: 'B', startUtc: '2026-10-23T10:00:00.000Z' });
    assert.equal(store.snapshot(room, host, 'http://localhost:4178').proposalResult.groupStatus, 'compatible');
    const revision = room.proposal.revision;
    await store.decide(room, 1, { revision, accepted: true });
    await store.decide(room, 2, { revision, accepted: true });
    assert.equal(store.snapshot(room, host, 'http://localhost:4178').confirmed, false);
    await store.decide(room, 3, { revision, accepted: true });
    assert.equal(store.snapshot(room, host, 'http://localhost:4178').confirmed, true);
    assert.equal(store.snapshot(room, guests[0], 'http://localhost:4178').confirmed, true);
    const reloaded = new RoomStore(filename);
    await reloaded.load();
    assert.equal(reloaded.snapshot(reloaded.get(created.id), host, 'http://localhost:4178').confirmed, true);
    await reloaded.submit(reloaded.get(created.id), 1, response);
    assert.equal(reloaded.snapshot(reloaded.get(created.id), host, 'http://localhost:4178').approvals, 0);
    await assert.rejects(reloaded.decide(reloaded.get(created.id), 2, { revision, accepted: true }), /Proposal changed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
