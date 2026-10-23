import test from 'node:test';
import assert from 'node:assert/strict';
import { aiIsConfigured, interpretRequirements, selectAlternativeSuggestions, validateInterpretations } from '../scripts/ai-service.mjs';
import { fixture, searchAlternatives } from '../dist/engine.js';

const env = { AI_API_KEY: 'test-secret', AI_BASE_URL: 'https://provider.example/v1', AI_MODEL: 'small-model' };
const room = { timeZone: 'Asia/Shanghai', options: fixture.options.slice(0, 2) };
const entry = (overrides = {}) => ({
  sourcePhrase: 'after 6 pm', requirementType: 'hard', category: 'time', condition: 'available_after',
  normalizedValue: '2026-10-23T18:00', unit: 'local_time', certainty: 'high',
  clarificationNeeded: false, clarificationQuestion: null, ...overrides
});

test('AI setup status requires a key and model, without exposing credentials', () => {
  assert.equal(aiIsConfigured({}), false);
  assert.equal(aiIsConfigured({ ...env, AI_MODEL: ' ' }), false);
  assert.equal(aiIsConfigured(env), true);
  assert.equal(aiIsConfigured({ ...env, AI_BASE_URL: 'http://provider.example/v1' }), false);
  assert.equal(aiIsConfigured({ ...env, AI_BASE_URL: 'http://localhost:1234/v1' }), true);
});

test('requirement draft is source-grounded and maps supported fields while preserving unsupported hard needs', async () => {
  const note = 'I can arrive after 6 pm, prefer under ¥80, and need step-free access.';
  const value = {
    interpretations: [
      entry(),
      entry({ sourcePhrase: 'prefer under ¥80', requirementType: 'soft', category: 'budget', condition: 'at_most', normalizedValue: 80, unit: 'CNY' }),
      entry({ sourcePhrase: 'need step-free access', category: 'accessibility', condition: 'requires_accessibility', normalizedValue: 'step-free', unit: null })
    ], unparsed: []
  };
  const result = validateInterpretations(note, value, '2026-10-23');
  assert.deepEqual(result.interpretations.map(item => item.field), ['availableAfter', 'preferredBudget', 'unresolvedHard']);
  assert.throws(() => validateInterpretations(note, { ...value, interpretations: [entry({ sourcePhrase: 'after 6 pm, maybe' })] }, '2026-10-23'), /invalid draft/i);
  assert.throws(() => validateInterpretations(note, { ...value, extra: true }, '2026-10-23'), /invalid draft/i);
  assert.throws(() => validateInterpretations(note, { interpretations: [entry({ certainty: 'low', normalizedValue: null, clarificationNeeded: false })], unparsed: [] }, '2026-10-23'), /invalid draft/i);
});

test('AI request sends the volunteered note only after the server route invokes the provider and never returns a saved note', async () => {
  const note = 'I can arrive after 6 pm.';
  let request;
  const fetchImpl = async (url, options) => {
    request = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ interpretations: [entry()], unparsed: [] }) } }] }), { status: 200 });
  };
  const result = await interpretRequirements({ note, room, env, fetchImpl });
  assert.equal(request.url, 'https://provider.example/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-secret');
  assert.match(request.body.messages[1].content, /I can arrive after 6 pm\./);
  assert.equal(request.body.messages[1].content.includes('test-secret'), false);
  assert.equal(result.interpretations[0].field, 'availableAfter');
  assert.equal(JSON.stringify(result).includes(note), false);
});

test('provider failures become a safe manual-entry state', async () => {
  await assert.rejects(interpretRequirements({ note: 'after 6 pm', room, env: {}, fetchImpl: async () => { throw new Error('offline'); } }), /not configured.*not been sent/i);
  await assert.rejects(interpretRequirements({ note: 'after 6 pm', room, env, fetchImpl: async () => new Response('bad', { status: 429 }) }), /could not be generated/i);
});

test('AI alternative selector accepts only supplied deterministic candidates', async () => {
  const members = structuredClone(fixture.members);
  const candidates = searchAlternatives(fixture.options, members, 4).map((item, index) => ({ ...item, candidateId: `candidate-${index}` }));
  let prompt;
  const fetchImpl = async (_url, options) => {
    prompt = JSON.parse(options.body).messages[1].content;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestions: [candidates[0].candidateId] }) } }] }), { status: 200 });
  };
  const result = await selectAlternativeSuggestions({ candidates, conflicts: { noOriginalPlanFits: true }, timeZone: 'Asia/Shanghai', env, fetchImpl });
  assert.equal(result[0].option.venueLabel, candidates[0].option.venueLabel);
  assert.equal(result[0].source, 'AI-ranked deterministic candidate');
  assert.match(result[0].rationale, /participant\(s\)|hard requirements/);
  assert.equal(result[0].result.groupStatus, candidates[0].result.groupStatus);
  assert.equal(prompt.includes('candidate-0'), true);
  const badFetch = async (_url, options) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestions: ['invented'] }) } }] }), { status: 200 });
  await assert.rejects(selectAlternativeSuggestions({ candidates, conflicts: {}, timeZone: 'Asia/Shanghai', env, fetchImpl: badFetch }), /invalid alternatives/i);
});
