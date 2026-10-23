import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as f, evaluateMember, aggregate, rescue, searchAlternatives, recombine, canConfirm } from '../dist/engine.js';
import { stressTest } from '../dist/protocol.js';
const member = () => structuredClone(f.members[3]);
test('document golden aggregates are A=3, B=1, C=2 with separate reasons', () => {
  const r = f.options.map(o => aggregate(o, f.members, 4));
  assert.deepEqual(r.map(x => x.blockedMemberCount), [3, 1, 2]);
  assert.deepEqual(r.map(x => [x.timeConflictCount, x.budgetConflictCount, x.environmentConflictCount]), [[1,1,1],[1,0,0],[0,1,1]]);
});
test('library at 18:00 clears known requirements but is unverified', () => {
  const o = recombine(f.options[1], f.options[1], f.options[2]);
  assert.equal(aggregate(o, f.members, 4).groupStatus, 'compatible'); assert.equal(o.verified, false);
});
test('full interval containment and endpoint boundaries are required', () => {
  const m = member(); m.availability = [{ startUtc:f.options[0].startUtc, endUtc:f.options[0].endUtc }];
  assert.equal(evaluateMember(f.options[0],m).status,'compatible');
  m.availability[0].endUtc = '2026-10-23T08:59:00Z'; assert.ok(evaluateMember(f.options[0],m).reasons.includes('TIME_CONFLICT'));
});
test('missing budget stays unknown for paid plans but does not block a free plan', () => {
  const m=member(); m.maxBudgetMinor=null;
  assert.equal(evaluateMember(f.options[0],m).status,'needs_info'); assert.equal(evaluateMember(f.options[1],m).status,'compatible');
});
test('missing time and unknown quiet requirements cannot become compatible', () => {
  const m=member(); m.availability=[]; m.needsQuiet=null;
  assert.deepEqual(evaluateMember(f.options[1],m).reasons,['TIME_UNSPECIFIED','QUIET_REQUIREMENT_UNSPECIFIED']);
});
test('known violations take precedence over unknown facts and retain both reasons', () => {
  const m=member(); m.maxBudgetMinor=0; m.needsQuiet=null;
  assert.equal(evaluateMember(f.options[0],m).status,'blocked'); assert.ok(evaluateMember(f.options[0],m).reasons.includes('QUIET_REQUIREMENT_UNSPECIFIED'));
});
test('a fourth missing response stays pending even when the submitted members fit', () => {
  const o=recombine(f.options[1],f.options[1],f.options[2]); const r=aggregate(o,f.members.slice(0,3),4);
  assert.equal(r.groupStatus,'pending'); assert.equal(r.pendingMemberCount,1);
});
test('rescue excludes existing and duplicate options, is deterministic and preserves input', () => {
  const before=JSON.stringify(f), r=rescue([...f.options,f.options[0]],f.members,4);
  assert.equal(r[0].option.title,'School Library · 18:00'); assert.equal(r[0].result.blockedMemberCount,0);
  assert.ok(r.length<=3); assert.equal(new Set(r.map(x=>x.option.title)).size,r.length); assert.equal(JSON.stringify(f),before);
});
test('search finds new half-hour starts and ranks distinct venues without changing input', () => {
  const before=JSON.stringify(f), ranked=searchAlternatives(f.options,f.members,4,f.options[1]);
  assert.equal(ranked[0].option.title,'School Library · 18:00');
  assert.equal(ranked[0].result.compatibleMemberCount,4);
  assert.equal(ranked[0].result.blockedMemberCount,0);
  assert.equal(new Set(ranked.map(item=>item.option.venueLabel)).size,3);
  assert.ok(ranked.some(item=>item.option.startUtc.endsWith('30:00.000Z')));
  assert.equal(JSON.stringify(f),before);
});
test('search responds to changed requirements', () => {
  const members=structuredClone(f.members);
  members[0].availability[0].startUtc='2026-10-23T08:00:00Z';
  const ranked=searchAlternatives(f.options,members,4,f.options[1]);
  assert.equal(aggregate(f.options[1],members,4).compatibleMemberCount,4);
  assert.equal(ranked[0].option.title,'School Library · 16:30');
});
test('Peace Protocol is deterministic, includes a fallback, and does not mutate requirements', () => {
  const before=JSON.stringify(f);
  const first=stressTest(f.options,f.members,4,256,42);
  const second=stressTest(f.options,f.members,4,256,42);
  assert.equal(first.winner.option.title,'School Library · 18:30');
  assert.equal(first.winner.passRate,1);
  assert.equal(first.backup.option.title,'School Library · 18:00');
  assert.equal(first.shocks.length,3);
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(f),before);
});
test('Peace Protocol changes its survivor when the fictional group changes', () => {
  const members=structuredClone(f.members);
  members[0].availability[0].startUtc='2026-10-23T08:00:00Z';
  const result=stressTest(f.options,members,4,128,42);
  assert.equal(result.winner.option.title,'School Library · 16:30');
  assert.equal(result.winner.passRate,1);
});
test('confirmation needs four unique current explicit approvals; revision changes void them', () => {
  const args={joinedCount:4,submittedCount:4,expectedCount:4,aggregateResult:{groupStatus:'compatible'},roomRevision:4,proposalRevision:4,responses:[1,2,3,4].map(i=>({participantId:i,accepted:true,proposalRevision:4}))};
  assert.equal(canConfirm(args),true); assert.equal(canConfirm({...args,roomRevision:5}),false);
  assert.equal(canConfirm({...args,responses:args.responses.slice(0,3)}),false);
  assert.equal(canConfirm({...args,responses:[...args.responses.slice(0,3),args.responses[0]]}),false);
});
