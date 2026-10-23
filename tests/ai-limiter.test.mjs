import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AiRateLimitError, AiRequestLimiter, createAiRequestLimiter } from '../scripts/ai-limiter.mjs';

test('AI limiter enforces per-link cooldown, link/day, room/day, and server/minute caps', () => {
  let now = 1_000_000;
  const limiter = new AiRequestLimiter({
    clock: () => now,
    globalPerMinute: 3,
    globalPerDay: 10,
    roomPerDay: 2,
    callerPerDay: 2,
    callerCooldownMs: 5000
  });
  assert.equal(limiter.consume('room-a', 'participant-1').remainingForCallerToday, 1);
  assert.throws(() => limiter.consume('room-a', 'participant-1'), error => error instanceof AiRateLimitError && error.retryAfterSeconds === 5);
  now += 5000;
  limiter.consume('room-a', 'participant-1');
  assert.throws(() => limiter.consume('room-a', 'participant-2'), error => error instanceof AiRateLimitError && error.message.includes('limit'));
  limiter.consume('room-b', 'host');
  assert.throws(() => limiter.consume('room-c', 'host'), error => error instanceof AiRateLimitError);
});

test('limiter environment settings accept only bounded positive integers', () => {
  const limiter = createAiRequestLimiter({
    AI_LIMIT_CALLS_PER_MINUTE: '2',
    AI_LIMIT_CALLS_PER_DAY: '3',
    AI_LIMIT_CALLS_PER_ROOM_DAY: '0',
    AI_LIMIT_CALLS_PER_LINK_DAY: '999999',
    AI_LIMIT_LINK_COOLDOWN_SECONDS: '2'
  });
  assert.equal(limiter.limits.globalPerMinute, 2);
  assert.equal(limiter.limits.globalPerDay, 3);
  assert.equal(limiter.limits.roomPerDay, 12);
  assert.equal(limiter.limits.callerPerDay, 3);
  assert.equal(limiter.limits.callerCooldownMs, 2000);
});

test('AI usage limits survive a service restart when a durable data file is configured', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tablepeace-ai-limits-'));
  try {
    const filename = path.join(directory, 'usage.json');
    let now = 1_000_000;
    const options = { clock: () => now, filename, callerPerDay: 1, callerCooldownMs: 5000 };
    new AiRequestLimiter(options).consume('room-a', 'participant-1');
    now += 5000;
    const restarted = new AiRequestLimiter(options);
    assert.throws(() => restarted.consume('room-a', 'participant-1'), error => error instanceof AiRateLimitError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
