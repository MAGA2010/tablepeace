import { evaluateMember, formatTime, preferenceFit } from './engine.js';

const $ = selector => document.querySelector(selector);
const root = new URL('./', location.href);
const hash = /^#(host|join)=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(location.hash);
const session = hash ? { role: hash[1], id: hash[2], token: hash[3] } : null;
let current = null;
let busy = false;
let aiConfigured = false;
let aiDraft = null;
let unresolvedCategories = new Set();
let reviewedFields = new Set();
const money = minor => minor === 0 ? 'Free' : '¥' + (minor / 100).toFixed(minor % 100 ? 2 : 0);
const local = iso => iso ? new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 16) : '';
const utc = value => value ? new Date(value + ':00+08:00').toISOString() : null;
const node = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };
const clear = selector => { const element = $(selector); element.replaceChildren(); return element; };
const error = message => { $('#error').textContent = message; $('#error').hidden = !message; };

async function request(path = '', method = 'GET', value) {
  const response = await fetch(new URL('api/rooms/' + session.id + path, root), {
    method, headers: { Authorization: 'Bearer ' + session.token, ...(value ? { 'Content-Type': 'application/json' } : {}) },
    body: value ? JSON.stringify(value) : undefined, cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function button(text, action, className) {
  const element = node('button', text, className); element.type = 'button'; element.addEventListener('click', action); return element;
}
function preferenceLabel(result) {
  return result.preferenceFitPercent == null ? 'No soft preferences shared' : `Soft preferences fit ${result.preferenceFitPercent}% across ${result.preferenceMemberCount} participant(s)`;
}
function ownPreferenceSummary(option, response) {
  const checks = [];
  if (response.favoriteOptionId) checks.push(`favorite plan ${response.favoriteOptionId === option.id ? 'matches' : 'does not match'}`);
  if (Number.isSafeInteger(response.preferredBudgetMinor)) checks.push(`preferred budget ${option.costMinor <= response.preferredBudgetMinor ? 'fits' : 'does not fit'}`);
  if (response.preferredNoise) checks.push(`setting preference ${option.noise === response.preferredNoise ? 'matches' : 'does not match'}`);
  if (!checks.length) return 'No soft preferences saved.';
  const fit = preferenceFit(option, response);
  return `Your soft-preference fit is ${Math.round(fit.fit * 100)}% (${checks.join('; ')}).`;
}
async function propose(option) {
  if (!current || busy) return;
  if (!confirm('Propose this plan? Previous approvals will reset.')) return;
  const original = current.options.find(item => item.venueLabel === option.venueLabel);
  if (!original) return error('This option is no longer available. Refresh the room.');
  try { busy = true; render(await request('/proposal', 'PUT', { venueId: original.id, startUtc: option.startUtc })); error(''); }
  catch (cause) { error(cause.message); }
  finally { busy = false; }
}
function renderHost(data) {
  $('#host-count').textContent = `${data.submitted}/${data.expectedCount} responses submitted · ${data.approvals} accepted · ${data.rejections} rejected`;
  const invites = clear('#invites');
  data.invites.forEach(invite => {
    const row = node('div', '', 'invite-row');
    const state = data.participantStatus.find(participant => participant.slot === invite.slot);
    row.append(node('span', `Participant ${invite.slot} · ${state.submitted ? 'submitted' : 'waiting'}`));
    row.append(button('Copy link', async () => {
      try { await navigator.clipboard.writeText(invite.url); error(''); }
      catch { error('Clipboard unavailable. Copy this link: ' + invite.url); }
    }, 'small-button'));
    invites.append(row);
  });
  const results = clear('#host-results');
  if (!data.ready) {
    results.append(node('p', `Waiting for ${data.expectedCount - data.submitted} response(s). Group conflict counts appear when everyone submits.`, 'empty'));
  } else {
    data.options.forEach((option, index) => {
      const result = data.results[index];
      const row = node('div', '', 'result-row');
      row.append(node('b', `${option.venueLabel} · ${formatTime(option.startUtc)} · ${result.groupStatus}`));
      const hard = `Hard conflicts: ${result.timeConflictCount} time · ${result.budgetConflictCount} budget · ${result.environmentConflictCount} setting`;
      const unknown = `Needs info: ${result.timeUnknownCount} time · ${result.budgetUnknownCount} budget · ${result.environmentUnknownCount} setting · ${result.unresolvedHardRequirementCount} unresolved hard`;
      row.append(node('span', `${result.compatibleMemberCount}/${data.expectedCount} fit · ${hard} · ${unknown} · ${preferenceLabel(result)}`));
      results.append(row);
    });
  }
  const noOriginalFit = data.ready && !data.results.some(result => result.groupStatus === 'compatible');
  const hasFeasibleAlternative = data.alternatives.some(item => item.result.groupStatus === 'compatible');
  $('#host-ai-alternatives').hidden = !noOriginalFit;
  $('#host-ai-button').disabled = !aiConfigured || !noOriginalFit;
  $('#host-ai-copy').textContent = !aiConfigured
    ? 'AI provider is not configured on this server. Deterministic alternatives are still available below.'
    : 'The AI may rank only deterministic alternatives. Hard conflicts stay visible and feasibility remains deterministic.';
  if (!aiConfigured && noOriginalFit) $('#host-ai-status').textContent = 'Setup state: AI provider not configured.';

  const proposal = data.proposal;
  $('#host-proposal').textContent = `${proposal.option.venueLabel} · ${formatTime(proposal.option.startUtc)} · revision ${proposal.revision}`;
  $('#host-approval').textContent = data.confirmed ? 'Confirmed by every participant. Venue still unverified.' : `${data.approvals}/${data.expectedCount} accepted · ${data.rejections} rejected. ${noOriginalFit ? hasFeasibleAlternative ? 'No original plan fits, but a generated combination passes deterministic checks. Review its tradeoffs and ask everyone to decide.' : 'No current candidate is feasible. The conflict and missing-information counts above show what still needs to change.' : data.proposalResult?.groupStatus === 'compatible' ? 'Known requirements fit.' : 'Needs remain unresolved or pending.'}`;
  const choices = clear('#proposal-options');
  const offered = [
    ...data.options.map(option => ({ option, label: `${option.venueLabel} · ${formatTime(option.startUtc)} · original` })),
    ...data.alternatives.map(item => ({ option: item.option, label: `${item.option.venueLabel} · ${formatTime(item.option.startUtc)} · ${item.result.compatibleMemberCount}/${data.expectedCount} fit · ${item.result.groupStatus === 'compatible' ? 'feasible' : 'least conflicting, not feasible'}` }))
  ];
  offered.forEach(({ option, label }) => choices.append(button(label, () => propose(option), 'choice')));
  if (!data.ready) choices.prepend(node('p', 'New combinations appear after everyone submits.', 'empty'));
  if (!data.ready || !noOriginalFit) { clear('#host-ai-list'); $('#host-ai-status').textContent = ''; }
}
function fieldValue(entry) {
  if (entry.field === 'maximumBudget' || entry.field === 'preferredBudget') return `¥${entry.normalizedValue}`;
  if (entry.field === 'availableAfter') return `after ${entry.normalizedValue.replace('T', ' ')}`;
  if (entry.field === 'needsQuiet') return 'Quiet space required';
  if (entry.field === 'preferredNoise') return `Prefer a ${entry.normalizedValue} setting`;
  if (entry.field === 'unresolvedHard') return `Unresolved hard requirement (${entry.category})`;
  return 'Not safely mapped to a field';
}
function markReviewed(field) { reviewedFields.add(field); }
function applyInterpretation(entry) {
  if (entry.clarificationNeeded || entry.certainty === 'low') return;
  if (entry.field === 'maximumBudget') $('#max-budget').value = String(entry.normalizedValue);
  else if (entry.field === 'preferredBudget') $('#preferred-budget').value = String(entry.normalizedValue);
  else if (entry.field === 'availableAfter') $('#available-from').value = entry.normalizedValue;
  else if (entry.field === 'needsQuiet') $('#needs-quiet').value = 'yes';
  else if (entry.field === 'preferredNoise') $('#preferred-noise').value = entry.normalizedValue;
  else if (entry.field === 'unresolvedHard') unresolvedCategories.add(entry.category);
  else return;
  markReviewed(entry.field);
  renderReview();
}
function renderReview() {
  const holder = clear('#ai-review');
  if (!aiDraft) return;
  aiDraft.interpretations.forEach(entry => {
    const card = node('article', '', 'interpretation-card');
    card.append(node('b', `“${entry.sourcePhrase}”`));
    card.append(node('span', `${entry.requirementType} · ${entry.category} · ${entry.certainty} certainty`));
    card.append(node('p', fieldValue(entry)));
    if (entry.clarificationNeeded) card.append(node('p', `Please clarify: ${entry.clarificationQuestion}`, 'clarification'));
    if (entry.field === 'unresolvedHard') {
      const action = button(unresolvedCategories.has(entry.category) ? 'Unresolved requirement will remain visible' : 'Keep as unresolved hard requirement', () => applyInterpretation(entry), 'small-button');
      action.disabled = unresolvedCategories.has(entry.category); card.append(action);
    } else if (['maximumBudget', 'preferredBudget', 'availableAfter', 'needsQuiet', 'preferredNoise'].includes(entry.field)) {
      const action = button(reviewedFields.has(entry.field) ? 'Applied to your form' : 'Use this suggestion', () => applyInterpretation(entry), 'small-button');
      action.disabled = reviewedFields.has(entry.field) || entry.clarificationNeeded || entry.certainty === 'low';
      card.append(action);
    }
    holder.append(card);
  });
  if (aiDraft.unparsed.length) holder.append(node('p', 'Needs to review manually: ' + aiDraft.unparsed.join(' · '), 'empty'));
  if (!aiDraft.interpretations.length && !aiDraft.unparsed.length) holder.append(node('p', 'No explicit requirements found. Enter fields manually.', 'empty'));
}
function renderParticipant(data) {
  $('#slot-label').textContent = `PARTICIPANT ${data.slot} · PRIVATE RESPONSE`;
  const response = data.response;
  const favorite = $('#favorite-option');
  const selectedFavorite = response?.favoriteOptionId || favorite.value;
  favorite.replaceChildren(new Option('No preference', ''));
  data.options.forEach(option => favorite.add(new Option(option.venueLabel, option.id)));
  favorite.value = selectedFavorite;
  if (response && document.activeElement?.form !== $('#response-form')) {
    $('#available-from').value = local(response.availability[0]?.startUtc);
    $('#available-until').value = local(response.availability[0]?.endUtc);
    $('#max-budget').value = response.maxBudgetMinor == null ? '' : String(response.maxBudgetMinor / 100);
    $('#needs-quiet').value = response.needsQuiet === null ? 'unknown' : response.needsQuiet ? 'yes' : 'no';
    $('#preferred-budget').value = response.preferredBudgetMinor == null ? '' : String(response.preferredBudgetMinor / 100);
    $('#preferred-noise').value = response.preferredNoise || '';
    unresolvedCategories = new Set(response.unresolvedHardRequirements || []);
    reviewedFields = new Set((response.reviewedInterpretations || []).map(item => item.field));
  }
  $('#response-state').textContent = response ? 'Saved. Editing your response resets all approvals. AI notes are not saved.' : 'No response saved yet.';
  $('#ai-parse').disabled = !aiConfigured;
  if (!aiConfigured) $('#ai-status').textContent = 'AI provider not configured on this server. Your note will stay here; use the fields above.';
  const option = data.proposal.option;
  $('#participant-proposal').textContent = option.venueLabel + ' · ' + formatTime(option.startUtc);
  $('#participant-facts').textContent = `${formatTime(option.startUtc)}–${formatTime(option.endUtc)} · ${money(option.costMinor)} · ${option.noise} setting · revision ${data.proposal.revision}`;
  const fit = response ? evaluateMember(option, response) : null;
  $('#own-fit').textContent = fit ? `${fit.status === 'compatible' ? 'Your hard requirements fit this plan.' : fit.status === 'blocked' ? 'This plan conflicts with your hard requirements.' : 'Some hard requirements remain unknown.'} ${ownPreferenceSummary(option, response)}` : 'Submit your requirements before deciding.';
  $('#accept').disabled = !response;
  $('#reject').disabled = !response;
  $('#decision-state').textContent = data.confirmed ? 'Everyone accepted this plan. Venue still unverified.' : `${data.approvals}/${data.expectedCount} accepted · ${data.submitted}/${data.expectedCount} responses. ` + (data.accepted === true ? 'You accepted this revision.' : data.accepted === false ? 'You rejected this revision.' : 'No decision on this revision.');
}
function render(data) {
  current = data;
  $('#room').hidden = false; $('#intro').hidden = true;
  $('#room-title').textContent = data.title;
  $('#role-label').textContent = data.role === 'host' ? 'ORGANIZER VIEW' : 'PARTICIPANT VIEW';
  $('#room-subtitle').textContent = data.role === 'host' ? 'Share one private link per participant. Raw responses stay hidden from this view.' : 'Submit your own needs and decide on the current plan.';
  $('#connection').textContent = 'Connected';
  $('#host-view').hidden = data.role !== 'host';
  $('#participant-view').hidden = data.role !== 'participant';
  if (data.role === 'host') renderHost(data); else renderParticipant(data);
}
async function refresh() {
  if (!session || busy) return;
  try { render(await request()); error(''); }
  catch (cause) { $('#connection').textContent = 'Offline'; error(cause.message); }
}

$('#response-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!session || busy) return;
  const from = $('#available-from').value, until = $('#available-until').value;
  if ((from && !until) || (!from && until) || (from && until && from >= until)) return error('Enter a valid availability interval, or leave both times blank.');
  const budget = $('#max-budget').value, preferredBudget = $('#preferred-budget').value;
  if (budget !== '' && (!Number.isSafeInteger(Number(budget) * 100) || Number(budget) < 0)) return error('Enter a valid non-negative maximum budget.');
  if (preferredBudget !== '' && (!Number.isSafeInteger(Number(preferredBudget) * 100) || Number(preferredBudget) < 0)) return error('Enter a valid non-negative preferred budget.');
  const quiet = $('#needs-quiet').value;
  try {
    busy = true;
    render(await request('/response', 'PUT', {
      startUtc: utc(from), endUtc: utc(until), maxBudgetMinor: budget === '' ? null : Math.round(Number(budget) * 100),
      needsQuiet: quiet === 'unknown' ? null : quiet === 'yes',
      preferredBudgetMinor: preferredBudget === '' ? null : Math.round(Number(preferredBudget) * 100),
      preferredNoise: $('#preferred-noise').value || null, favoriteOptionId: $('#favorite-option').value || null,
      unresolvedHardRequirements: [...unresolvedCategories],
      reviewedInterpretations: [...reviewedFields].map(field => ({ field, reviewed: true }))
    }));
    error('');
  } catch (cause) { error(cause.message); }
  finally { busy = false; }
});
$('#ai-parse').addEventListener('click', async () => {
  if (!session || busy) return;
  const note = $('#needs-note').value.trim();
  if (!note) { $('#ai-status').textContent = 'Add a short note first.'; return; }
  if (!$('#ai-consent').checked) { $('#ai-status').textContent = 'Check consent before requesting an AI draft.'; return; }
  if (!aiConfigured) { $('#ai-status').textContent = 'AI is not configured. The note was not sent or saved; enter fields manually.'; return; }
  try {
    busy = true; $('#ai-parse').disabled = true; $('#ai-status').textContent = 'Preparing a draft for your review…';
    aiDraft = await request('/ai/parse', 'POST', { note, consent: true });
    $('#ai-status').textContent = 'Draft ready. Nothing has been added to your saved response yet.';
    renderReview();
  } catch (cause) { $('#ai-status').textContent = cause.message; }
  finally { busy = false; $('#ai-parse').disabled = !aiConfigured; }
});
$('#host-ai-button').addEventListener('click', async () => {
  if (!current || busy || !aiConfigured) return;
  try {
    busy = true; $('#host-ai-button').disabled = true; $('#host-ai-status').textContent = 'Ranking only the deterministic candidate plans…';
    const result = await request('/ai/alternatives', 'POST', {});
    const list = clear('#host-ai-list');
    result.suggestions.forEach(item => {
      const card = node('article', '', 'interpretation-card');
      const option = item.option;
      card.append(node('b', `${option.venueLabel} · ${formatTime(option.startUtc)}`));
      card.append(node('p', item.rationale));
      card.append(node('span', `${item.result.groupStatus} · ${item.result.compatibleMemberCount}/${current.expectedCount} hard-requirement fit · ${preferenceLabel(item.result)}`));
      card.append(button('Propose this option', () => propose(option), 'small-button'));
      list.append(card);
    });
    $('#host-ai-status').textContent = result.suggestions.length ? 'AI ranked these supplied alternatives. The deterministic checks below still decide status.' : 'No AI alternatives were returned.';
  } catch (cause) { $('#host-ai-status').textContent = cause.message; }
  finally { busy = false; $('#host-ai-button').disabled = !aiConfigured; }
});

for (const [selector, accepted] of [['#accept', true], ['#reject', false]]) {
  $(selector).addEventListener('click', async () => {
    if (!current || busy) return;
    try { busy = true; render(await request('/decision', 'PUT', { revision: current.proposal.revision, accepted })); error(''); }
    catch (cause) { error(cause.message); busy = false; await refresh(); }
    finally { busy = false; }
  });
}
fetch(new URL('api/health', root), { cache: 'no-store' }).then(response => response.json()).then(health => {
  aiConfigured = health?.ai?.configured === true;
  if (current?.role === 'participant') renderParticipant(current);
  if (current?.role === 'host') renderHost(current);
}).catch(() => {});
if (!session) $('#intro').hidden = false;
else { refresh(); setInterval(refresh, 3000); }
