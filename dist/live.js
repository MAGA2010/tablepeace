import { evaluateMember, formatTime } from './engine.js';

const $ = selector => document.querySelector(selector);
const root = new URL('./', location.href);
const hash = /^#(host|join)=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(location.hash);
const session = hash ? { role: hash[1], id: hash[2], token: hash[3] } : null;
let current = null;
let busy = false;
const money = minor => minor === 0 ? 'Free' : '¥' + (minor / 100).toFixed(minor % 100 ? 2 : 0);
const local = iso => iso ? new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 16) : '';
const utc = value => value ? new Date(value + ':00+08:00').toISOString() : null;
const node = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };
const clear = selector => { const element = $(selector); element.replaceChildren(); return element; };
const error = message => { $('#error').textContent = message; $('#error').hidden = !message; };
async function request(path = '', method = 'GET', value) {
  const response = await fetch(new URL('api/rooms/' + session.id + path, root), {
    method, headers: { Authorization: 'Bearer ' + session.token, ...(value ? { 'Content-Type': 'application/json' } : {}) },
    body: value ? JSON.stringify(value) : undefined,
    cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function button(text, action, className) {
  const element = node('button', text, className);
  element.type = 'button'; element.addEventListener('click', action);
  return element;
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
      results.append(node('div', `${option.venueLabel} · ${formatTime(option.startUtc)}  |  ${result.compatibleMemberCount}/${data.expectedCount} fit · ${result.blockedMemberCount} conflicts`, 'result-row'));
    });
  }
  const proposal = data.proposal;
  $('#host-proposal').textContent = `${proposal.option.venueLabel} · ${formatTime(proposal.option.startUtc)} · revision ${proposal.revision}`;
  $('#host-approval').textContent = data.confirmed ? 'Confirmed by every participant. Venue still unverified.' : `${data.approvals}/${data.expectedCount} accepted · ${data.rejections} rejected. ${data.ready && ![...data.results, ...data.alternatives.map(item => item.result)].some(result => result.groupStatus === 'compatible') ? 'No feasible plan found in this window. Discuss a new venue, time, or requirement.' : data.proposalResult?.groupStatus === 'compatible' ? 'Known requirements fit.' : 'Needs remain unresolved or pending.'}`;
  const choices = clear('#proposal-options');
  const offered = [
    ...data.options.map(option => ({ option, label: `${option.venueLabel} · ${formatTime(option.startUtc)} · original` })),
    ...data.alternatives.map(item => ({ option: item.option, label: `${item.option.venueLabel} · ${formatTime(item.option.startUtc)} · ${item.result.compatibleMemberCount}/${data.expectedCount} fit · ${item.result.groupStatus === 'compatible' ? 'feasible' : 'least conflicting, not feasible'}` }))
  ];
  offered.forEach(({ option, label }) => {
    choices.append(button(label, async () => {
      if (!confirm('Propose this plan? Previous approvals will reset.')) return;
      try { busy = true; render(await request('/proposal', 'PUT', { venueId: data.options.find(original => original.venueLabel === option.venueLabel)?.id, startUtc: option.startUtc })); error(''); }
      catch (cause) { error(cause.message); }
      finally { busy = false; }
    }, 'choice'));
  });
  if (!data.ready) choices.prepend(node('p', 'New combinations appear after everyone submits.', 'empty'));
}
function renderParticipant(data) {
  $('#slot-label').textContent = `PARTICIPANT ${data.slot} · PRIVATE RESPONSE`;
  const response = data.response;
  if (response && document.activeElement?.form !== $('#response-form')) {
    $('#available-from').value = local(response.availability[0]?.startUtc);
    $('#available-until').value = local(response.availability[0]?.endUtc);
    $('#max-budget').value = response.maxBudgetMinor == null ? '' : String(response.maxBudgetMinor / 100);
    $('#needs-quiet').value = response.needsQuiet === null ? 'unknown' : response.needsQuiet ? 'yes' : 'no';
  }
  $('#response-state').textContent = response ? 'Saved. Editing your response resets all approvals.' : 'No response saved yet.';
  const option = data.proposal.option;
  $('#participant-proposal').textContent = option.venueLabel + ' · ' + formatTime(option.startUtc);
  $('#participant-facts').textContent = `${formatTime(option.startUtc)}–${formatTime(option.endUtc)} · ${money(option.costMinor)} · ${option.noise} setting · revision ${data.proposal.revision}`;
  const fit = response ? evaluateMember(option, response) : null;
  $('#own-fit').textContent = fit ? fit.status === 'compatible' ? 'Your submitted requirements fit this plan.' : fit.status === 'blocked' ? 'This plan conflicts with your requirements.' : 'Some of your requirements remain unknown.' : 'Submit your requirements before deciding.';
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
  const budget = $('#max-budget').value;
  if (budget !== '' && (!Number.isSafeInteger(Number(budget) * 100) || Number(budget) < 0)) return error('Enter a valid non-negative budget.');
  const quiet = $('#needs-quiet').value;
  try {
    busy = true;
    render(await request('/response', 'PUT', { startUtc: utc(from), endUtc: utc(until), maxBudgetMinor: budget === '' ? null : Math.round(Number(budget) * 100), needsQuiet: quiet === 'unknown' ? null : quiet === 'yes' }));
    error('');
  } catch (cause) { error(cause.message); }
  finally { busy = false; }
});
for (const [selector, accepted] of [['#accept', true], ['#reject', false]]) {
  $(selector).addEventListener('click', async () => {
    if (!current || busy) return;
    try { busy = true; render(await request('/decision', 'PUT', { revision: current.proposal.revision, accepted })); error(''); }
    catch (cause) { error(cause.message); busy = false; await refresh(); }
    finally { busy = false; }
  });
}
if (!session) $('#intro').hidden = false;
else { refresh(); setInterval(refresh, 3000); }
