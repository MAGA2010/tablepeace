import { aggregate, formatTime, recombine } from './engine.js';

const STEP = 30 * 60 * 1000;
const makeRandom = seed => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const shift = (value, minutes) => new Date(Date.parse(value) + minutes * 60000).toISOString();

export function stressTest(options, members, expectedCount, runs = 1024, seed = 20261022) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 4096) throw new Error('Invalid simulation count');
  if (!options.length) throw new Error('Add a plan before running the simulation');
  const base = options[0];
  const duration = Date.parse(base.endUtc) - Date.parse(base.startUtc);
  const start = Math.min(...options.map(option => Date.parse(option.startUtc)));
  const knownEnds = [
    ...options.map(option => Date.parse(option.endUtc)),
    ...members.flatMap(member => (member.availability || []).map(interval => Date.parse(interval.endUtc)))
  ].filter(Number.isFinite);
  const last = Math.min(Math.max(...knownEnds) - duration, start + 24 * STEP);
  const venues = [...new Map(options.map(option => [[option.venueLabel, option.costMinor, option.noise].join('|'), option])).values()];
  const candidates = [];
  for (let at = Math.ceil(start / STEP) * STEP; at <= last; at += STEP) {
    for (const venue of venues) {
      candidates.push(recombine(base, venue, { startUtc: new Date(at).toISOString() }));
    }
  }
  const random = makeRandom(seed);
  const records = candidates.map(option => ({ option, passed: 0, fitTotal: 0, shockPasses: [0, 0, 0] }));
  const shocks = [
    { name: 'Late arrivals', change: (member) => ({ ...member, availability: (member.availability || []).map(interval => ({ ...interval, startUtc: shift(interval.startUtc, 30) })) }) },
    { name: 'Early departures', change: (member) => ({ ...member, availability: (member.availability || []).map(interval => ({ ...interval, endUtc: shift(interval.endUtc, -30) })) }) },
    { name: 'Budget squeeze', change: (member) => ({ ...member, maxBudgetMinor: member.maxBudgetMinor == null ? null : Math.floor(member.maxBudgetMinor * .8) }) }
  ];
  for (let run = 0; run < runs; run++) {
    const scenario = members.map(member => {
      if (!member.submitted) return member;
      const late = Math.floor(random() * 3) * 15;
      const early = Math.floor(random() * 3) * 15;
      const cost = random() < .5 ? .8 : 1;
      return {
        ...member,
        availability: (member.availability || []).map(interval => ({
          startUtc: shift(interval.startUtc, late), endUtc: shift(interval.endUtc, -early)
        })),
        maxBudgetMinor: member.maxBudgetMinor == null ? null : Math.floor(member.maxBudgetMinor * cost)
      };
    });
    records.forEach(record => {
      const result = aggregate(record.option, scenario, expectedCount);
      record.fitTotal += result.compatibleMemberCount;
      if (result.groupStatus === 'compatible') record.passed++;
    });
  }
  records.forEach(record => {
    shocks.forEach((shock, index) => {
      const shocked = members.map(member => member.submitted ? shock.change(member) : member);
      const result = aggregate(record.option, shocked, expectedCount);
      record.shockPasses[index] = result.groupStatus === 'compatible' ? 1 : 0;
    });
  });
  records.sort((a, b) => b.passed - a.passed || b.fitTotal - a.fitTotal || a.option.costMinor - b.option.costMinor || Date.parse(a.option.startUtc) - Date.parse(b.option.startUtc));
  const winner = records[0];
  const backup = records.find(record => record !== winner) || null;
  return {
    runs,
    candidates: records.length,
    winner: {
      ...winner,
      passRate: winner.passed / runs,
      averageFit: winner.fitTotal / runs,
      time: formatTime(winner.option.startUtc)
    },
    backup: backup && { ...backup, passRate: backup.passed / runs, time: formatTime(backup.option.startUtc) },
    shocks: shocks.map((shock, index) => ({ name: shock.name, passed: Boolean(winner.shockPasses[index]) })),
    baseline: aggregate(winner.option, members, expectedCount)
  };
}
