import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomStore } from './room-store.mjs';
import { AiUnavailableError, aiIsConfigured, interpretRequirements, selectAlternativeSuggestions } from './ai-service.mjs';
import { AiLimiterStorageError, AiRateLimitError, createAiRequestLimiter } from './ai-limiter.mjs';
import { aggregate, searchAlternatives } from '../dist/engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const dataFile = process.env.TABLEPEACE_DATA_FILE || path.resolve(root, '../.data/rooms.json');
const retentionDays = Number.isInteger(Number(process.env.ROOM_RETENTION_DAYS)) && Number(process.env.ROOM_RETENTION_DAYS) >= 1 && Number(process.env.ROOM_RETENTION_DAYS) <= 90 ? Number(process.env.ROOM_RETENTION_DAYS) : 7;
const store = new RoomStore(dataFile, { retentionMs: retentionDays * 24 * 60 * 60 * 1000 });
await store.load();
const aiLimiter = createAiRequestLimiter(process.env, Date.now, process.env.AI_LIMITER_DATA_FILE || path.join(path.dirname(dataFile), 'ai-usage.json'));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const send = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(value));
};
function limitAiRequest(room, auth, res) {
  const callerId = auth.role === 'host' ? 'host' : 'participant-' + auth.slot;
  try { aiLimiter.consume(room.id, callerId); return false; }
  catch (error) {
    if (!(error instanceof AiRateLimitError)) throw error;
    send(res, 429, { error: error.message }, { 'Retry-After': String(error.retryAfterSeconds) });
    return true;
  }
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Send JSON.');
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 32768) throw new Error('Request is too large.');
  }
  try { return JSON.parse(value); } catch { throw new Error('Invalid JSON.'); }
}
async function api(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { status: 'ready', ai: { configured: aiIsConfigured() } });
  const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
  if (url.pathname === '/api/rooms' && req.method === 'POST') return send(res, 201, await store.create(await body(req), origin));
  const match = /^\/api\/rooms\/([A-Za-z0-9_-]+)(?:\/(proposal|response|decision)|\/ai\/(parse|alternatives))?$/.exec(url.pathname);
  if (!match) return send(res, 404, { error: 'Not found.' });
  const room = store.get(match[1]);
  const bearer = req.headers.authorization?.replace(/^Bearer /, '');
  const auth = store.authenticate(room, bearer);
  if (!match[2] && !match[3] && req.method === 'GET') return send(res, 200, store.snapshot(room, auth, origin));
  if (match[3] === 'parse' && req.method === 'POST' && auth.role === 'participant') {
    const input = await body(req);
    if (input?.consent !== true) return send(res, 400, { error: 'Give consent before sending this note to the AI provider.' });
    if (!aiIsConfigured()) return send(res, 503, { error: 'AI provider is not configured on this server. Your note has not been sent; enter the fields manually.' });
    if (limitAiRequest(room, auth, res)) return;
    return send(res, 200, await interpretRequirements({ note: input.note, room, env: process.env }));
  }
  if (match[3] === 'alternatives' && req.method === 'POST' && auth.role === 'host') {
    const submitted = room.participants.filter(person => person.response).map(person => person.response);
    if (submitted.length !== room.expectedCount) return send(res, 409, { error: 'Wait until everyone has submitted before asking for alternatives.' });
    const existing = room.options.map(option => aggregate(option, submitted, room.expectedCount));
    if (existing.some(result => result.groupStatus === 'compatible')) return send(res, 409, { error: 'An offered plan already fits the submitted hard requirements.' });
    if (!aiIsConfigured()) return send(res, 503, { error: 'AI provider is not configured on this server. Deterministic alternatives are still available.' });
    if (limitAiRequest(room, auth, res)) return;
    const candidates = searchAlternatives(room.options, submitted, room.expectedCount, room.proposal.option);
    const conflicts = { optionsChecked: existing.length, noOriginalPlanFits: true };
    return send(res, 200, { suggestions: await selectAlternativeSuggestions({
      candidates: candidates.map((item, index) => ({ ...item, candidateId: 'candidate-' + index })),
      conflicts, timeZone: room.timeZone || 'Asia/Shanghai', env: process.env
    }) });
  }
  if (match[2] === 'response' && req.method === 'PUT' && auth.role === 'participant') {
    await store.submit(room, auth.slot, await body(req));
    return send(res, 200, store.snapshot(room, auth, origin));
  }
  if (match[2] === 'proposal' && req.method === 'PUT' && auth.role === 'host') {
    await store.propose(room, await body(req));
    return send(res, 200, store.snapshot(room, auth, origin));
  }
  if (match[2] === 'decision' && req.method === 'PUT' && auth.role === 'participant') {
    await store.decide(room, auth.slot, await body(req));
    return send(res, 200, store.snapshot(room, auth, origin));
  }
  return send(res, 403, { error: 'This link cannot perform that action.' });
}
const server = http.createServer(async (req, res) => {
  try {
    await store.pruneExpired();
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' || pathname === '/new' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep) && filename !== path.join(root, 'index.html')) throw new Error('Invalid path');
    const file = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(file);
  } catch (error) {
    if (req.url?.startsWith('/api/')) return send(res, error instanceof AiUnavailableError || error instanceof AiLimiterStorageError ? 503 : error.message === 'Room not found.' || error.message === 'Room expired.' ? 404 : error.message === 'Invalid room link.' ? 401 : 400, { error: error.message });
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
const port = Number(process.env.PORT || 4178);
const host = process.env.HOST || '127.0.0.1';
const cleanup = setInterval(() => { store.pruneExpired().catch(() => {}); }, 10 * 60 * 1000);
cleanup.unref();
server.listen(port, host, () => process.stdout.write(`TablePeace demo: http://${host}:${server.address().port}\n`));
