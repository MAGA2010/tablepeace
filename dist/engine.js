// Deterministic semantics reconstructed from the supplied v2.1 document.
// The executable companion ZIP was not supplied. This is an illustrative fixture.
export const fixture = {
  title: 'Friday Project Meetup', timezone: 'Asia/Shanghai', currency: 'CNY', date: '2026-10-23', expectedCount: 4,
  options: [
    { id: 'A', title: 'Coffee Hub', venueLabel: 'Coffee Hub', startUtc: '2026-10-23T08:00:00Z', endUtc: '2026-10-23T09:00:00Z', costMinor: 3500, noise: 'moderate', icon: 'coffee', revision: 1, verified: false },
    { id: 'B', title: 'School Library', venueLabel: 'School Library', startUtc: '2026-10-23T08:00:00Z', endUtc: '2026-10-23T09:00:00Z', costMinor: 0, noise: 'quiet', icon: 'library', revision: 1, verified: false },
    { id: 'C', title: 'Makerspace', venueLabel: 'Makerspace', startUtc: '2026-10-23T10:00:00Z', endUtc: '2026-10-23T11:00:00Z', costMinor: 6000, noise: 'lively', icon: 'tools', revision: 1, verified: false }
  ],
  members: [
    { submitted: true, availability: [{ startUtc: '2026-10-23T10:00:00Z', endUtc: '2026-10-23T12:00:00Z' }], maxBudgetMinor: 10000, needsQuiet: false, favoriteOptionId: 'B' },
    { submitted: true, availability: [{ startUtc: '2026-10-23T08:00:00Z', endUtc: '2026-10-23T12:00:00Z' }], maxBudgetMinor: 2000, needsQuiet: false, favoriteOptionId: 'B' },
    { submitted: true, availability: [{ startUtc: '2026-10-23T08:00:00Z', endUtc: '2026-10-23T12:00:00Z' }], maxBudgetMinor: 10000, needsQuiet: true, favoriteOptionId: 'A' },
    { submitted: true, availability: [{ startUtc: '2026-10-23T08:00:00Z', endUtc: '2026-10-23T12:00:00Z' }], maxBudgetMinor: 10000, needsQuiet: false, favoriteOptionId: 'C' }
  ]
};
const time = v => Date.parse(v);
export function validateOption(o) {
  if (!o || !Number.isFinite(time(o.startUtc)) || !Number.isFinite(time(o.endUtc)) || time(o.endUtc) <= time(o.startUtc)) throw new Error('Invalid plan interval');
  if (!Number.isSafeInteger(o.costMinor) || o.costMinor < 0) throw new Error('Invalid minor-unit cost');
  if (!['quiet', 'moderate', 'lively', 'unknown'].includes(o.noise)) throw new Error('Invalid environment');
}
export function evaluateMember(option, member) {
  validateOption(option);
  if (!member?.submitted) return { status: 'pending', reasons: [] };
  const failures = [], unknown = [];
  const intervals = Array.isArray(member.availability) ? member.availability : [];
  if (!intervals.length) unknown.push('TIME_UNSPECIFIED');
  else if (intervals.some(a => !Number.isFinite(time(a.startUtc)) || !Number.isFinite(time(a.endUtc)) || time(a.endUtc) <= time(a.startUtc))) unknown.push('TIME_UNSPECIFIED');
  else if (!intervals.some(a => time(a.startUtc) <= time(option.startUtc) && time(option.endUtc) <= time(a.endUtc))) failures.push('TIME_CONFLICT');
  if (member.maxBudgetMinor != null && (!Number.isSafeInteger(member.maxBudgetMinor) || member.maxBudgetMinor < 0)) unknown.push('BUDGET_UNSPECIFIED');
  else if (option.costMinor > 0 && member.maxBudgetMinor == null) unknown.push('BUDGET_UNSPECIFIED');
  else if (member.maxBudgetMinor != null && option.costMinor > member.maxBudgetMinor) failures.push('OVER_BUDGET');
  if (typeof member.needsQuiet !== 'boolean') unknown.push('QUIET_REQUIREMENT_UNSPECIFIED');
  else if (member.needsQuiet && option.noise === 'unknown') unknown.push('VENUE_NOISE_UNVERIFIED');
  else if (member.needsQuiet && option.noise !== 'quiet') failures.push('NOT_QUIET');
  return { status: failures.length ? 'blocked' : unknown.length ? 'needs_info' : 'compatible', reasons: [...failures, ...unknown] };
}
export function aggregate(option, members, expectedCount = 4) {
  const checked = members.filter(m => m?.submitted).map(m => evaluateMember(option, m));
  const count = code => checked.filter(r => r.reasons.includes(code)).length;
  const result = {
    optionId: option.id, blockedMemberCount: checked.filter(r => r.status === 'blocked').length,
    compatibleMemberCount: checked.filter(r => r.status === 'compatible').length,
    unknownMemberCount: checked.filter(r => r.reasons.some(c => ['TIME_UNSPECIFIED', 'BUDGET_UNSPECIFIED', 'QUIET_REQUIREMENT_UNSPECIFIED', 'VENUE_NOISE_UNVERIFIED'].includes(c))).length,
    pendingMemberCount: Math.max(0, expectedCount - checked.length), checkedParticipantCount: checked.length,
    timeConflictCount: count('TIME_CONFLICT'), budgetConflictCount: count('OVER_BUDGET'), environmentConflictCount: count('NOT_QUIET'),
    timeUnknownCount: count('TIME_UNSPECIFIED'), budgetUnknownCount: count('BUDGET_UNSPECIFIED'), environmentUnknownCount: checked.filter(r => r.reasons.includes('QUIET_REQUIREMENT_UNSPECIFIED') || r.reasons.includes('VENUE_NOISE_UNVERIFIED')).length,
    favoriteCount: members.filter(m => m?.submitted && m.favoriteOptionId === option.id).length
  };
  result.groupStatus = result.blockedMemberCount ? 'blocked' : result.unknownMemberCount ? 'needs_info' : result.pendingMemberCount ? 'pending' : 'compatible';
  return result;
}
export function recombine(base, venue, sourceTime) {
  const duration = time(base.endUtc) - time(base.startUtc);
  const end = new Date(time(sourceTime.startUtc) + duration).toISOString();
  return { ...base, id: 'simulation', title: `${venue.venueLabel} · ${formatTime(sourceTime.startUtc)}`, venueLabel: venue.venueLabel, costMinor: venue.costMinor, noise: venue.noise, icon: venue.icon, startUtc: sourceTime.startUtc, endUtc: end, verified: false, source: 'rescue', revision: 1 };
}
const key = o => [o.venueLabel, o.costMinor, o.noise, time(o.startUtc), time(o.endUtc)].join('|');
export function rescue(options, members, expectedCount, base = options[1]) {
  const seen = new Set(options.map(key)), candidates = [];
  const venues = [...new Map(options.map(o => [[o.venueLabel, o.costMinor, o.noise].join('|'), o])).values()];
  const times = [...new Map(options.map(o => [time(o.startUtc), o])).values()];
  let computations = 0;
  for (const venue of venues) for (const start of times) {
    if (++computations > 24) break;
    const option = recombine(base, venue, start), signature = key(option);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const changes = Number(base.venueLabel !== option.venueLabel || base.costMinor !== option.costMinor || base.noise !== option.noise) + Number(time(base.startUtc) !== time(option.startUtc));
    candidates.push({ option, result: aggregate(option, members, expectedCount), changes });
  }
  return candidates.sort((a, b) => a.result.blockedMemberCount - b.result.blockedMemberCount || a.result.unknownMemberCount - b.result.unknownMemberCount || a.changes - b.changes || time(a.option.startUtc) - time(b.option.startUtc) || a.option.title.localeCompare(b.option.title)).slice(0, 3);
}
export function searchAlternatives(options, members, expectedCount, base = options[1]) {
  const venues = [...new Map(options.map(option => [[option.venueLabel, option.costMinor, option.noise].join('|'), option])).values()];
  const existing = new Set(options.map(key));
  const duration = time(base.endUtc) - time(base.startUtc);
  const starts = options.map(option => time(option.startUtc));
  const ends = [
    ...options.map(option => time(option.endUtc)),
    ...members.flatMap(member => (member.availability || []).map(interval => time(interval.endUtc)))
  ].filter(Number.isFinite);
  const first = Math.ceil(Math.min(...starts) / 1800000) * 1800000;
  const last = Math.min(Math.max(...ends) - duration, first + 24 * 1800000);
  const candidates = [];
  for (let start = first; start <= last; start += 1800000) {
    for (const venue of venues) {
      const option = recombine(base, venue, { startUtc: new Date(start).toISOString() });
      if (existing.has(key(option))) continue;
      const result = aggregate(option, members, expectedCount);
      const changes = Number(base.venueLabel !== option.venueLabel || base.costMinor !== option.costMinor || base.noise !== option.noise)
        + Number(time(base.startUtc) !== start);
      candidates.push({ option, result, changes });
    }
  }
  const ranked = candidates.sort((a, b) =>
    a.result.blockedMemberCount - b.result.blockedMemberCount ||
    a.result.unknownMemberCount - b.result.unknownMemberCount ||
    b.result.compatibleMemberCount - a.result.compatibleMemberCount ||
    a.changes - b.changes ||
    a.option.costMinor - b.option.costMinor ||
    time(a.option.startUtc) - time(b.option.startUtc) ||
    a.option.title.localeCompare(b.option.title)
  );
  const varied = [], usedVenues = new Set();
  for (const candidate of ranked) {
    if (usedVenues.has(candidate.option.venueLabel)) continue;
    varied.push(candidate);
    usedVenues.add(candidate.option.venueLabel);
    if (varied.length === 3) return varied;
  }
  for (const candidate of ranked) {
    if (varied.includes(candidate)) continue;
    varied.push(candidate);
    if (varied.length === 3) break;
  }
  return varied;
}
export function canConfirm({ joinedCount, submittedCount, expectedCount, aggregateResult, roomRevision, proposalRevision, responses }) {
  return joinedCount === expectedCount && submittedCount === expectedCount && aggregateResult.groupStatus === 'compatible' && roomRevision === proposalRevision && responses.length === expectedCount && new Set(responses.map(r => r.participantId)).size === expectedCount && responses.every(r => r.accepted === true && r.proposalRevision === proposalRevision);
}
export function formatTime(value) { return new Intl.DateTimeFormat('en-GB', { timeZone: fixture.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
