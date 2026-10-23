import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('HTTP room flow supports four private participants, AI setup recovery, rejection, and persisted unanimous confirmation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tablepeace-http-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'scripts/serve.mjs'], {
    cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TABLEPEACE_DATA_FILE: path.join(directory, 'rooms.json'), AI_API_KEY: '', AI_MODEL: '' },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  const origin = `http://127.0.0.1:${port}`;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { const response = await fetch(origin + '/api/health'); if (response.ok) { ready = true; break; } } catch {}
      if (child.exitCode !== null) break;
      await wait(50);
    }
    assert.equal(ready, true, 'server should become ready');
    assert.deepEqual(await (await fetch(origin + '/api/health')).json(), { status: 'ready', ai: { configured: false } });
    const options = [
      { venueLabel: 'Coffee Hub', startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T11:00:00.000Z', costMinor: 3500, noise: 'moderate' },
      { venueLabel: 'School Library', startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T11:00:00.000Z', costMinor: 0, noise: 'quiet' },
      { venueLabel: 'Makerspace', startUtc: '2026-10-23T11:00:00.000Z', endUtc: '2026-10-23T12:00:00.000Z', costMinor: 6000, noise: 'lively' }
    ];
    const createdResponse = await fetch(origin + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Friday meetup', expectedCount: 4, timeZone: 'Asia/Hong_Kong', options }) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    const token = url => url.split('.').at(-1);
    const hostToken = token(created.hostUrl);
    const guestTokens = created.invites.map(invite => token(invite.url));
    assert.equal(guestTokens.length, 4);
    const request = (pathname, method, body, bearer) => fetch(origin + pathname, {
      method, headers: { ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const badAuth = await request(`/api/rooms/${created.id}/ai/parse`, 'POST', { note: 'after 6 pm', consent: true }, hostToken);
    assert.equal(badAuth.status, 403);
    const noConsent = await request(`/api/rooms/${created.id}/ai/parse`, 'POST', { note: 'after 6 pm', consent: false }, guestTokens[0]);
    assert.equal(noConsent.status, 400);
    const notConfigured = await request(`/api/rooms/${created.id}/ai/parse`, 'POST', { note: 'after 6 pm', consent: true }, guestTokens[0]);
    assert.equal(notConfigured.status, 503);
    assert.match((await notConfigured.json()).error, /not configured/i);

    const responses = [
      { startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T13:00:00.000Z', maxBudgetMinor: 8000, needsQuiet: true, preferredNoise: 'quiet', favoriteOptionId: 'B' },
      { startUtc: '2026-10-23T11:00:00.000Z', endUtc: '2026-10-23T13:00:00.000Z', maxBudgetMinor: 10000, needsQuiet: false, preferredNoise: 'moderate', preferredBudgetMinor: 4000 },
      { startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T13:00:00.000Z', maxBudgetMinor: 0, needsQuiet: false, preferredNoise: 'quiet', note: 'PRIVATE NOTE MUST NOT PERSIST' },
      { startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T13:00:00.000Z', maxBudgetMinor: 10000, needsQuiet: false }
    ];
    for (let index = 0; index < guestTokens.length; index++) {
      const response = await request(`/api/rooms/${created.id}/response`, 'PUT', responses[index], guestTokens[index]);
      assert.equal(response.status, 200);
    }
    let hostResponse = await request(`/api/rooms/${created.id}`, 'GET', undefined, hostToken);
    let host = await hostResponse.json();
    assert.equal(host.submitted, 4);
    assert.equal(host.ready, true);
    assert.equal(host.results.some(result => result.groupStatus === 'compatible'), false);
    assert.equal(host.participantStatus[0].response, undefined);
    assert.equal(host.results[1].timeConflictCount, 1);
    assert.ok(host.results[1].preferenceFitPercent !== null);
    const aiAlternatives = await request(`/api/rooms/${created.id}/ai/alternatives`, 'POST', {}, hostToken);
    assert.equal(aiAlternatives.status, 503);

    const proposal = await request(`/api/rooms/${created.id}/proposal`, 'PUT', { venueId: 'B', startUtc: '2026-10-23T11:00:00.000Z' }, hostToken);
    assert.equal(proposal.status, 200);
    const revision = (await proposal.json()).proposal.revision;
    for (let index = 0; index < guestTokens.length; index++) {
      const decision = await request(`/api/rooms/${created.id}/decision`, 'PUT', { revision, accepted: index < 3 }, guestTokens[index]);
      assert.equal(decision.status, 200);
    }
    host = await (await request(`/api/rooms/${created.id}`, 'GET', undefined, hostToken)).json();
    assert.equal(host.confirmed, false);
    assert.equal(host.rejections, 1);
    const nextProposal = await request(`/api/rooms/${created.id}/proposal`, 'PUT', { venueId: 'B', startUtc: '2026-10-23T11:00:00.000Z' }, hostToken);
    const nextRevision = (await nextProposal.json()).proposal.revision;
    for (const guestToken of guestTokens) assert.equal((await request(`/api/rooms/${created.id}/decision`, 'PUT', { revision: nextRevision, accepted: true }, guestToken)).status, 200);
    host = await (await request(`/api/rooms/${created.id}`, 'GET', undefined, hostToken)).json();
    assert.equal(host.confirmed, true);
    assert.equal(host.approvals, 4);
    const rejoined = await (await request(`/api/rooms/${created.id}`, 'GET', undefined, guestTokens[0])).json();
    assert.equal(rejoined.confirmed, true);
    assert.equal(rejoined.response.maxBudgetMinor, 8000);
    assert.equal(rejoined.timeZone, 'Asia/Hong_Kong');
    const saved = await readFile(path.join(directory, 'rooms.json'), 'utf8');
    assert.equal(saved.includes('PRIVATE NOTE MUST NOT PERSIST'), false);
  } finally {
    child.kill();
    await wait(50);
    await rm(directory, { recursive: true, force: true });
  }
});

test('HTTP AI route rate-limits a participant link and does not expose the server key', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tablepeace-ai-limit-'));
  const port = await freePort();
  let providerCalls = 0;
  const provider = createHttpServer(async (_req, res) => {
    providerCalls++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ interpretations: [], unparsed: ['I can arrive after 6 pm.'] }) } }] }));
  });
  await new Promise((resolve, reject) => provider.once('error', reject).listen(0, '127.0.0.1', resolve));
  const providerUrl = `http://127.0.0.1:${provider.address().port}/v1`;
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'scripts/serve.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1', PORT: String(port), TABLEPEACE_DATA_FILE: path.join(directory, 'rooms.json'),
      AI_API_KEY: 'test-secret', AI_BASE_URL: providerUrl, AI_MODEL: 'test-model',
      AI_LIMIT_CALLS_PER_LINK_DAY: '2', AI_LIMIT_LINK_COOLDOWN_SECONDS: '1'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  const origin = `http://127.0.0.1:${port}`;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { const response = await fetch(origin + '/api/health'); if (response.ok) { ready = true; break; } } catch {}
      if (child.exitCode !== null) break;
      await wait(50);
    }
    assert.equal(ready, true);
    const health = await (await fetch(origin + '/api/health')).json();
    assert.deepEqual(health, { status: 'ready', ai: { configured: true } });
    assert.equal(JSON.stringify(health).includes('test-secret'), false);
    const options = [
      { venueLabel: 'Library', startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T11:00:00.000Z', costMinor: 0, noise: 'quiet' },
      { venueLabel: 'Cafe', startUtc: '2026-10-23T10:00:00.000Z', endUtc: '2026-10-23T11:00:00.000Z', costMinor: 3000, noise: 'moderate' }
    ];
    const created = await (await fetch(origin + '/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'AI limit test', expectedCount: 3, timeZone: 'Asia/Hong_Kong', options })
    })).json();
    const participantToken = created.invites[0].url.split('.').at(-1);
    const request = () => fetch(origin + `/api/rooms/${created.id}/ai/parse`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + participantToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'I can arrive after 6 pm.', consent: true })
    });
    const first = await request();
    assert.equal(first.status, 200);
    const second = await request();
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('retry-after'), '1');
    assert.equal(providerCalls, 1);
    assert.equal((await second.text()).includes('test-secret'), false);
  } finally {
    child.kill();
    await new Promise(resolve => provider.close(resolve));
    await wait(50);
    await rm(directory, { recursive: true, force: true });
  }
});
