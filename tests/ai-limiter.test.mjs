import test from 'node:test';
import assert from 'node:assert/strict';
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
