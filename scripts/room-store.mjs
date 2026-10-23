import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { aggregate, recombine, searchAlternatives, validateOption } from '../dist/engine.js';

const digest = value => createHash('sha256').update(value).digest();
const token = () => randomBytes(24).toString('base64url');
const equal = (left, right) => {
  if (typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex'), b = digest(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const validIso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const capped = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const clone = value => structuredClone(value);

export class RoomStore {
  constructor(filename) { this.filename = filename; this.rooms = {}; this.queue = Promise.resolve(); }
  async load() {
    try { this.rooms = JSON.parse(await readFile(this.filename, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async save() {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = this.filename + '.' + randomBytes(6).toString('hex') + '.tmp';
    await writeFile(temporary, JSON.stringify(this.rooms), { mode: 0o600 });
    await rename(temporary, this.filename);
  }
  mutate(action) {
    const result = this.queue.then(async () => {
      const value = action();
      await this.save();
      return value;
    });
    this.queue = result.catch(() => {});
    return result;
  }
  create(input, origin) {
    return this.mutate(() => {
      const title = capped(input?.title, 80);
      const expectedCount = Number(input?.expectedCount);
      if (!title || !Number.isInteger(expectedCount) || expectedCount < 3 || expectedCount > 8) throw new Error('Enter a room title and 3–8 people.');
      if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) throw new Error('Add 2–4 complete plan options.');
      const options = input.options.map((raw, index) => {
        const startUtc = raw?.startUtc, endUtc = raw?.endUtc;
        const option = {
          id: String.fromCharCode(65 + index), title: capped(raw?.venueLabel, 80), venueLabel: capped(raw?.venueLabel, 80),
          startUtc, endUtc, costMinor: raw?.costMinor, noise: raw?.noise,
          verified: false, revision: 1
        };
        if (!option.venueLabel || !validIso(startUtc) || !validIso(endUtc)) throw new Error('Complete each venue and time.');
        validateOption(option);
        if (Date.parse(endUtc) - Date.parse(startUtc) > 12 * 3600000) throw new Error('Keep each plan under 12 hours.');
        return option;
      });
      const id = randomBytes(12).toString('base64url');
      const hostToken = token(), secret = token();
      this.rooms[id] = {
        id, title, expectedCount, options, hostHash: digest(hostToken).toString('hex'), secret,
        participants: Array.from({ length: expectedCount }, (_, index) => ({ id: index + 1, response: null, accepted: null })),
        proposal: { option: options[0], revision: 1 }, createdAt: new Date().toISOString()
      };
      return { id, hostUrl: `${origin}/live.html#host=${id}.${hostToken}`, invites: this.invites(this.rooms[id], origin) };
    });
  }
  invites(room, origin) {
    return room.participants.map(participant => ({
      slot: participant.id,
      url: `${origin}/live.html#join=${room.id}.${createHmac('sha256', room.secret).update(String(participant.id)).digest('base64url')}`
    }));
  }
  get(id) { const room = this.rooms[id]; if (!room) throw new Error('Room not found.'); return room; }
  authenticate(room, bearer) {
    if (equal(room.hostHash, bearer)) return { role: 'host' };
    for (const participant of room.participants) {
      const expected = createHmac('sha256', room.secret).update(String(participant.id)).digest('base64url');
      const a = Buffer.from(expected), b = Buffer.from(bearer || '');
      if (a.length === b.length && timingSafeEqual(a, b)) return { role: 'participant', slot: participant.id };
    }
    throw new Error('Invalid room link.');
  }
  snapshot(room, auth, origin) {
    const base = { id: room.id, title: room.title, expectedCount: room.expectedCount, options: room.options, proposal: room.proposal, role: auth.role };
    const submitted = room.participants.filter(p => p.response).length;
    const approvals = room.participants.filter(p => p.accepted === true).length;
    const rejections = room.participants.filter(p => p.accepted === false).length;
    const ready = submitted === room.expectedCount;
    const responses = room.participants.filter(p => p.response).map(p => p.response);
    const proposalResult = ready ? aggregate(room.proposal.option, responses, room.expectedCount) : null;
    const confirmed = ready && proposalResult?.groupStatus === 'compatible' && approvals === room.expectedCount && rejections === 0;
    if (auth.role === 'participant') {
      const participant = room.participants[auth.slot - 1];
      return { ...base, slot: auth.slot, response: participant.response, accepted: participant.accepted, submitted, approvals, confirmed };
    }
    const results = ready ? room.options.map(option => aggregate(option, responses, room.expectedCount)) : null;
    const alternatives = ready ? searchAlternatives(room.options, responses, room.expectedCount, room.options[0]) : [];
    return {
      ...base, invites: this.invites(room, origin), submitted, approvals, rejections, ready,
      participantStatus: room.participants.map(p => ({ slot: p.id, submitted: Boolean(p.response), accepted: p.accepted })),
      results, proposalResult, alternatives: alternatives.map(item => ({ option: item.option, result: item.result })),
      confirmed
    };
  }
  submit(room, slot, input) {
    return this.mutate(() => {
      const participant = room.participants[slot - 1];
      const availability = [];
      if (input?.startUtc || input?.endUtc) {
        if (!validIso(input.startUtc) || !validIso(input.endUtc) || Date.parse(input.endUtc) <= Date.parse(input.startUtc)) throw new Error('Enter a valid availability interval.');
        availability.push({ startUtc: input.startUtc, endUtc: input.endUtc });
      }
      const budget = input?.maxBudgetMinor;
      if (budget !== null && (!Number.isSafeInteger(budget) || budget < 0)) throw new Error('Enter a valid budget or leave it unknown.');
      if (![true, false, null].includes(input?.needsQuiet)) throw new Error('Choose a quiet-space requirement.');
      participant.response = { submitted: true, availability, maxBudgetMinor: budget, needsQuiet: input.needsQuiet };
      this.invalidate(room);
      return { revision: room.proposal.revision };
    });
  }
  propose(room, input) {
    return this.mutate(() => {
      const venue = room.options.find(option => option.id === input?.venueId);
      if (!venue || !validIso(input?.startUtc)) throw new Error('Choose an offered venue and valid time.');
      const earliest = Math.min(...room.options.map(option => Date.parse(option.startUtc)));
      const latest = Math.max(...room.options.map(option => Date.parse(option.endUtc)), ...room.participants.flatMap(p => (p.response?.availability || []).map(a => Date.parse(a.endUtc))));
      const start = Date.parse(input.startUtc);
      const duration = Date.parse(venue.endUtc) - Date.parse(venue.startUtc);
      if (start < earliest || start + duration > latest || start % 1800000 !== 0) throw new Error('Choose a half-hour start within the room window.');
      const option = start === Date.parse(venue.startUtc) ? venue : recombine(venue, venue, { startUtc: input.startUtc });
      room.proposal.option = option;
      this.invalidate(room);
      return { revision: room.proposal.revision };
    });
  }
  decide(room, slot, input) {
    return this.mutate(() => {
      const participant = room.participants[slot - 1];
      if (!participant.response) throw new Error('Submit your requirements first.');
      if (input?.revision !== room.proposal.revision || typeof input?.accepted !== 'boolean') throw new Error('Proposal changed. Refresh before deciding.');
      participant.accepted = input.accepted;
      return { revision: room.proposal.revision };
    });
  }
  invalidate(room) {
    room.proposal.revision++;
    room.participants.forEach(participant => { participant.accepted = null; });
  }
}
