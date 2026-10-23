const minute = 60_000;
const day = 24 * 60 * minute;

function boundedInteger(env, key, fallback, max = 10_000) {
  const value = Number(env[key]);
  return Number.isSafeInteger(value) && value > 0 && value <= max ? value : fallback;
}

export class AiRateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('AI usage limit reached. Try again later.');
    this.name = 'AiRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AiRequestLimiter {
  constructor({
    clock = Date.now,
    globalPerMinute = 6,
    globalPerDay = 40,
    roomPerDay = 12,
    callerPerDay = 3,
    callerCooldownMs = 5000
  } = {}) {
    this.clock = clock;
    this.limits = { globalPerMinute, globalPerDay, roomPerDay, callerPerDay, callerCooldownMs };
    this.events = [];
  }

  consume(roomId, callerId) {
    const now = this.clock();
    this.events = this.events.filter(event => now - event.at < day);
    const callerEvents = this.events.filter(event => event.roomId === roomId && event.callerId === callerId);
    const roomEvents = this.events.filter(event => event.roomId === roomId);
    const minuteEvents = this.events.filter(event => now - event.at < minute);
    const limit = (events, count, windowMs) => {
      if (events.length < count) return null;
      const retryAt = events[0].at + windowMs;
      return Math.max(1, Math.ceil((retryAt - now) / 1000));
    };
    const latestCaller = callerEvents.at(-1);
    const retryAfter = [
      latestCaller && now - latestCaller.at < this.limits.callerCooldownMs
        ? Math.max(1, Math.ceil((latestCaller.at + this.limits.callerCooldownMs - now) / 1000)) : null,
      limit(callerEvents, this.limits.callerPerDay, day),
      limit(roomEvents, this.limits.roomPerDay, day),
      limit(this.events, this.limits.globalPerDay, day),
      limit(minuteEvents, this.limits.globalPerMinute, minute)
    ].filter(value => value !== null);
    if (retryAfter.length) throw new AiRateLimitError(Math.max(...retryAfter));
    this.events.push({ at: now, roomId, callerId });
    return { remainingForCallerToday: this.limits.callerPerDay - callerEvents.length - 1 };
  }
}

export function createAiRequestLimiter(env = process.env, clock = Date.now) {
  return new AiRequestLimiter({
    clock,
    globalPerMinute: boundedInteger(env, 'AI_LIMIT_CALLS_PER_MINUTE', 6, 100),
    globalPerDay: boundedInteger(env, 'AI_LIMIT_CALLS_PER_DAY', 40),
    roomPerDay: boundedInteger(env, 'AI_LIMIT_CALLS_PER_ROOM_DAY', 12),
    callerPerDay: boundedInteger(env, 'AI_LIMIT_CALLS_PER_LINK_DAY', 3),
    callerCooldownMs: boundedInteger(env, 'AI_LIMIT_LINK_COOLDOWN_SECONDS', 5, 3600) * 1000
  });
}
