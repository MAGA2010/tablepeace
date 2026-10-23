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

test('judge demo finds a supported plan and keeps four approvals on the same revision after reload', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tablepeace-demo-'));
  try {
    const filename = path.join(directory, 'rooms.json');
    const store = new RoomStore(filename);
    await store.load();
    const options = [
      { venueLabel: 'Coffee Hub', startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T11:00:00.000Z', costMinor: 3500, noise: 'moderate' },
      { venueLabel: 'School Library', startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T11:00:00.000Z', costMinor: 0, noise: 'quiet' },
      { venueLabel: 'Makerspace', startUtc: '2026-10-23T11:00:00.000Z', endUtc: '2026-10-23T12:00:00.000Z', costMinor: 6000, noise: 'lively' }
    ];
    const created = await store.create({ title: 'Friday project meetup', expectedCount: 4, timeZone: 'Asia/Hong_Kong', options }, 'http://localhost:4178');
    const room = store.get(created.id);
    const host = store.authenticate(room, created.hostUrl.split('.').at(-1));
    const participants = created.invites.map(invite => store.authenticate(room, invite.url.split('.').at(-1)));
    const responses = [
      { startUtc: '2026-10-23T11:00:00.000Z', endUtc: '2026-10-23T14:00:00.000Z', maxBudgetMinor: 10000, needsQuiet: false },
      { startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T14:00:00.000Z', maxBudgetMinor: 4000, needsQuiet: false },
      { startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T14:00:00.000Z', maxBudgetMinor: 10000, needsQuiet: true },
      { startUtc: '2026-10-23T11:00:00.000Z', endUtc: '2026-10-23T14:00:00.000Z', maxBudgetMinor: 5000, needsQuiet: false }
    ];
    for (let slot = 1; slot <= 4; slot++) await store.submit(room, slot, responses[slot - 1]);

    const before = store.snapshot(room, host, 'http://localhost:4178');
    assert.deepEqual(before.results.map(result => result.groupStatus), ['blocked', 'blocked', 'blocked']);
    const candidate = before.alternatives.find(item => item.option.venueLabel === 'School Library' && item.option.startUtc === '2026-10-23T11:00:00.000Z');
    assert.equal(candidate?.result.groupStatus, 'compatible');

    await store.propose(room, { venueId: 'B', startUtc: '2026-10-23T11:00:00.000Z' });
    const revision = room.proposal.revision;
    for (let slot = 1; slot <= 4; slot++) await store.decide(room, slot, { revision, accepted: true });
    assert.equal(store.snapshot(room, host, 'http://localhost:4178').confirmed, true);
    assert.deepEqual(room.participants.map(participant => participant.accepted), [true, true, true, true]);

    const refreshed = new RoomStore(filename);
    await refreshed.load();
    const afterRefresh = refreshed.snapshot(refreshed.get(created.id), { role: 'host' }, 'http://localhost:4178');
    assert.equal(afterRefresh.proposal.revision, revision);
    assert.equal(afterRefresh.approvals, 4);
    assert.equal(afterRefresh.confirmed, true);

    const accessibility = new RoomStore(path.join(directory, 'accessibility.json'));
    await accessibility.load();
    const unresolved = await accessibility.create({ title: 'Accessibility check', expectedCount: 4, options }, 'http://localhost:4178');
    const unresolvedRoom = accessibility.get(unresolved.id);
    for (let slot = 1; slot <= 4; slot++) await accessibility.submit(unresolvedRoom, slot, {
      ...responses[slot - 1], unresolvedHardRequirements: slot === 1 ? ['accessibility'] : []
    });
    await accessibility.propose(unresolvedRoom, { venueId: 'B', startUtc: '2026-10-23T11:00:00.000Z' });
    const unresolvedHost = accessibility.authenticate(unresolvedRoom, unresolved.hostUrl.split('.').at(-1));
    const unresolvedRevision = unresolvedRoom.proposal.revision;
    for (let slot = 1; slot <= 4; slot++) await accessibility.decide(unresolvedRoom, slot, { revision: unresolvedRevision, accepted: true });
    const unresolvedSnapshot = accessibility.snapshot(unresolvedRoom, unresolvedHost, 'http://localhost:4178');
    assert.equal(unresolvedSnapshot.proposalResult.groupStatus, 'needs_info');
    assert.equal(unresolvedSnapshot.proposalResult.unresolvedHardRequirementCount, 1);
    assert.equal(unresolvedSnapshot.confirmed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('soft preferences are saved privately, unresolved hard needs prevent a false fit, and AI notes are discarded', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tablepeace-preferences-'));
  try {
    const filename = path.join(directory, 'rooms.json');
    const store = new RoomStore(filename);
    await store.load();
    const created = await store.create({ title: 'Preference check', expectedCount: 3, timeZone: 'Asia/Hong_Kong', options: fixture.options.slice(0, 2) }, 'http://localhost:4178');
    const room = store.get(created.id), host = store.authenticate(room, created.hostUrl.split('.').at(-1));
    const guests = created.invites.map(invite => store.authenticate(room, invite.url.split('.').at(-1)));
    for (let slot = 1; slot <= 3; slot++) await store.submit(room, slot, {
      startUtc: '2026-10-23T08:00:00.000Z', endUtc: '2026-10-23T12:00:00.000Z', maxBudgetMinor: 10000, needsQuiet: false,
      preferredBudgetMinor: 5000, preferredNoise: 'quiet', favoriteOptionId: 'B',
      unresolvedHardRequirements: slot === 1 ? ['accessibility'] : [],
      reviewedInterpretations: [{ field: 'unresolvedHard', reviewed: true }], note: 'PRIVATE RAW NOTE SHOULD NOT PERSIST'
    });
    const hostView = store.snapshot(room, host, 'http://localhost:4178');
    const participantView = store.snapshot(room, guests[0], 'http://localhost:4178');
    assert.equal(hostView.results[0].groupStatus, 'needs_info');
    assert.equal(hostView.results[0].unresolvedHardRequirementCount, 1);
    assert.equal(hostView.results[0].preferenceMemberCount, 3);
    assert.equal(hostView.participantStatus[0].response, undefined);
    assert.deepEqual(participantView.response.unresolvedHardRequirements, ['accessibility']);
    assert.equal(participantView.response.preferredNoise, 'quiet');
    const saved = await (await import('node:fs/promises')).readFile(filename, 'utf8');
    assert.equal(saved.includes('PRIVATE RAW NOTE SHOULD NOT PERSIST'), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('expired rooms are inaccessible and their saved records are removed', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tablepeace-expiry-'));
  try {
    const filename = path.join(directory, 'rooms.json');
    const store = new RoomStore(filename, { retentionMs: 60_000 });
    await store.load();
    const created = await store.create({ title: 'Temporary plan', expectedCount: 3, options: fixture.options.slice(0, 2) }, 'http://localhost:4178');
    const room = store.get(created.id);
    assert.equal(Date.parse(room.expiresAt) - Date.parse(room.createdAt), 60_000);
    assert.equal(await store.pruneExpired(Date.parse(room.expiresAt)), 1);
    assert.throws(() => store.get(created.id), /Room not found/);
    const refreshed = new RoomStore(filename);
    await refreshed.load();
    assert.deepEqual(refreshed.rooms, {});
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
