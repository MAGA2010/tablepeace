import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomStore } from './room-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const dataFile = process.env.TABLEPEACE_DATA_FILE || path.resolve(root, '../.data/rooms.json');
const store = new RoomStore(dataFile);
await store.load();
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const send = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
};
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
  if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { status: 'ready' });
  const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
  if (url.pathname === '/api/rooms' && req.method === 'POST') return send(res, 201, await store.create(await body(req), origin));
  const match = /^\/api\/rooms\/([A-Za-z0-9_-]+)(?:\/(proposal|response|decision))?$/.exec(url.pathname);
  if (!match) return send(res, 404, { error: 'Not found.' });
  const room = store.get(match[1]);
  const bearer = req.headers.authorization?.replace(/^Bearer /, '');
  const auth = store.authenticate(room, bearer);
  if (!match[2] && req.method === 'GET') return send(res, 200, store.snapshot(room, auth, origin));
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
    if (req.url?.startsWith('/api/')) return send(res, error.message === 'Room not found.' ? 404 : error.message === 'Invalid room link.' ? 401 : 400, { error: error.message });
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
const port = Number(process.env.PORT || 4178);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => process.stdout.write(`TablePeace demo: http://${host}:${server.address().port}\n`));
