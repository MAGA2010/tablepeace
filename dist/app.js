import { fixture, aggregate, searchAlternatives, recombine, formatTime } from "./engine.js";

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const plans = fixture.options;
let members = structuredClone(fixture.members);
let stats = Object.fromEntries(plans.map(plan => [plan.id, aggregate(plan, members, fixture.expectedCount)]));
let closestPlan = [...plans].sort((a,b) => stats[a.id].blockedMemberCount - stats[b.id].blockedMemberCount)[0];
let alternatives = searchAlternatives(plans, members, fixture.expectedCount, closestPlan);
let recommendation = alternatives[0];
let selectedId = closestPlan.id;
let simulated = null;
let page = location.hash.slice(1) || (location.pathname === "/new" ? "new" : "results");
let timer;
const money = cents => cents === 0 ? "Free" : "¥" + (cents / 100).toFixed(cents % 100 ? 2 : 0);
function labelStatus(status) {
  const names = { blocked:"Conflicts", needs_info:"Needs info", compatible:"Fits", pending:"Waiting" };
  return names[status] || "Needs info";
}
function setStatus(el, status) {
  el.className = "status " + (status === "compatible" ? "fits" : status === "blocked" ? "blocked" : "info");
  el.textContent = labelStatus(status);
}
function cell(kind, result) {
  let count=0, unknown=0;
  if(kind==="time"){ count=result.timeConflictCount; unknown=result.timeUnknownCount; }
  if(kind==="budget"){ count=result.budgetConflictCount; unknown=result.budgetUnknownCount; }
  if(kind==="environment"){ count=result.environmentConflictCount; unknown=result.environmentUnknownCount; }
  const el=document.createElement("span");
  el.className="cell-result "+(count?"cell-blocked":unknown?"cell-unknown":"cell-ok");
  el.textContent=count ? count+" conflict"+(count>1?"s":"") : unknown ? "Needs info" : result.pendingMemberCount ? result.checkedParticipantCount+" checked · "+result.pendingMemberCount+" pending" : result.checkedParticipantCount+" of "+fixture.expectedCount+" clear";
  return el;
}
function updateMatrix() {
  plans.forEach(plan=>{
    const r=stats[plan.id];
    [["time","time"],["budget","budget"],["environment","environment"]].forEach(([kind,key])=>{
      const td=document.querySelector('[data-cell="'+plan.id+"-"+key+'"]'); td.replaceChildren(cell(kind,r));
    });
    const total=document.querySelector('[data-total="'+plan.id+'"]'); total.replaceChildren();
    const status=document.createElement("span"); setStatus(status,r.groupStatus); total.append(status);
    const caption=document.createElement("small"); caption.className="aggregate-caption";
    caption.textContent=r.blockedMemberCount ? r.blockedMemberCount+" blocked" : r.unknownMemberCount ? "Some needs unknown" : "All supplied needs fit";
    total.append(caption);
    const card=document.querySelector('[data-card-status="'+plan.id+'"]'); setStatus(card,r.groupStatus);
  });
  choose(selectedId);
}
function choose(id) {
  selectedId=id;
  const plan=id==="simulation" ? simulated?.option : plans.find(p=>p.id===id);
  const result=id==="simulation" ? simulated?.result : stats[id];
  if(!plan||!result)return;
  $$("[data-option]").forEach(el=>el.classList.toggle("chosen",el.dataset.option===id));
  $("#selected-title").textContent=plan.venueLabel;
  $("#selected-time").textContent=formatTime(plan.startUtc)+" – "+formatTime(plan.endUtc);
  $("#selected-cost").textContent=money(plan.costMinor)+" total";
  $("#selected-noise").textContent=plan.noise==="quiet"?"Quiet setting":plan.noise==="moderate"?"Moderate setting":plan.noise==="lively"?"Lively setting":"Setting unknown";
  setStatus($("#selected-status"),result.groupStatus);
  const issues=[];
  const add=(count,title,body)=>{if(count)issues.push({count,title,body});};
  add(result.timeConflictCount,"Time conflict","This plan starts before one or more people are free.");
  add(result.budgetConflictCount,"Budget conflict","This plan exceeds at least one private limit.");
  add(result.environmentConflictCount,"Environment conflict","A quiet requirement conflicts with this setting.");
  add(result.timeUnknownCount,"Time not shared","Availability is missing or incomplete.");
  add(result.budgetUnknownCount,"Budget not shared","A budget is missing for this paid plan.");
  add(result.environmentUnknownCount,"Environment needs checking","A requirement or venue detail is unknown.");
  const holder=$("#issue-list"); holder.replaceChildren(); $("#clear-state").hidden=issues.length>0;
  issues.forEach(item=>{
    const row=document.createElement("div");row.className="issue-row";
    const text=document.createElement("span");const title=document.createElement("b");title.textContent=item.title;const body=document.createElement("small");body.textContent=item.body;text.append(title,body);
    const count=document.createElement("span");count.className="issue-count";count.textContent=item.count;
    row.append(text,count);holder.append(row);
  });
  $("#decision-title").textContent=plan.venueLabel;
  $("#decision-facts").textContent=formatTime(plan.startUtc)+" · "+money(plan.costMinor)+" · "+plan.noise+" setting";
  $("#decision-fit").textContent=result.compatibleMemberCount+"/"+fixture.expectedCount;
  $("#decision-warning").textContent=result.blockedMemberCount
    ? result.blockedMemberCount+" fictional response"+(result.blockedMemberCount===1?"":"s")+" still conflict with this plan."
    : result.unknownMemberCount || result.pendingMemberCount
      ? "Some requirements still need checking."
      : "Known requirements fit. Approval and venue checks still remain.";
}
function renderRecommendation() {
  $("#recommendation").hidden=!recommendation;
  if (!recommendation) return;
  const { option, result, changes }=recommendation;
  $("#recommendation-venue").textContent=option.venueLabel;
  $("#recommendation-time").textContent=formatTime(option.startUtc)+"–"+formatTime(option.endUtc)+" · "+money(option.costMinor)+" · "+option.noise+" setting";
  $("#recommendation-fit").textContent=result.compatibleMemberCount+"/"+fixture.expectedCount;
  $("#recommendation-before").textContent=stats[closestPlan.id].blockedMemberCount;
  $("#recommendation-after").textContent=result.blockedMemberCount;
  $("#recommendation-delta").textContent=changes+" change"+(changes===1?"":"s")+" from the closest existing plan";
  $("#recommendation-source").textContent="Based on "+closestPlan.venueLabel+" at "+formatTime(closestPlan.startUtc)+". "+(result.pendingMemberCount ? result.pendingMemberCount+" response"+(result.pendingMemberCount===1?"":"s")+" still pending. " : "")+"Fictional requirements only; venue hours and approval are unverified.";
}
function renderPage(next) {
  page=next;
  $$(".page-view").forEach(section=>section.hidden=section.dataset.view!==next);
  $$(".nav-link").forEach(link=>link.classList.toggle("active",link.dataset.page===next));
}
function setPage(next) {
  history.pushState(null,"","#"+next);
  renderPage(next);
  window.scrollTo({top:0,behavior:"smooth"});
}
function toast(message) {
  const el=$("#toast");el.textContent=message;el.classList.add("visible");
  clearTimeout(timer);timer=setTimeout(()=>el.classList.remove("visible"),3200);
}
function closeModal(){ $("#modal-root").replaceChildren(); }
function showSetup() {
  closeModal();
  const backdrop=document.createElement("div");backdrop.className="modal-backdrop";
  backdrop.addEventListener("click",e=>{if(e.target===backdrop)closeModal();});
  const box=document.createElement("section");box.className="setup-modal";box.setAttribute("role","dialog");box.setAttribute("aria-modal","true");
  const x=document.createElement("button");x.className="modal-close";x.textContent="×";x.setAttribute("aria-label","Close");x.onclick=closeModal;
  const eyebrow=document.createElement("div");eyebrow.className="eyebrow";eyebrow.textContent="LIVE FEATURES · SETUP STATUS";
  const h=document.createElement("h2");h.textContent="Connect your services to go live";
  const p=document.createElement("p");p.textContent="This demo runs in your browser. Shared rooms and AI suggestions need server services that are not connected yet.";
  const integrations=document.createElement("div");integrations.className="integration-list";
  [["Shared rooms & private needs","Database connection and room access rules"],["AI requirement suggestions","AI provider connection on a secure server"]].forEach(pair=>{
    const row=document.createElement("div");row.className="integration-row";
    const copy=document.createElement("span"),title=document.createElement("b"),desc=document.createElement("small"),status=document.createElement("i");
    title.textContent=pair[0];desc.textContent=pair[1];status.textContent="Not configured";copy.append(title,desc);row.append(copy,status);integrations.append(row);
  });
  const note=document.createElement("div");note.className="setup-callout";note.textContent="Nothing has been saved or sent. No API keys are requested here; credentials belong in secure server settings.";
  const done=document.createElement("button");done.className="button button-primary full-button";done.textContent="Got it";done.onclick=closeModal;
  box.append(x,eyebrow,h,p,integrations,note,done);backdrop.append(box);$("#modal-root").append(backdrop);done.focus();
}
function runRescue() {
  const venue=plans.find(p=>p.venueLabel===$("#venue-select").value);
  const time={startUtc:toUtc($("#time-select").value)};
  const option=recombine(closestPlan,venue,time);
  const result=aggregate(option,members,fixture.expectedCount);
  simulated={option,result};
  if(selectedId==="simulation")choose("simulation");
  $("[data-action='use-preview']").disabled=false;
  $("#candidate-title").textContent=option.venueLabel+" · "+formatTime(option.startUtc);
  $("#candidate-venue").textContent=option.venueLabel;
  $("#candidate-facts").textContent=formatTime(option.startUtc)+"–"+formatTime(option.endUtc)+" · "+money(option.costMinor)+" · "+option.noise+" setting";
  $("#outcome-title").textContent=result.blockedMemberCount ? result.blockedMemberCount+" known conflict"+(result.blockedMemberCount===1?"":"s")+" remain" : "No known conflicts in supplied needs";
  $("#outcome-copy").textContent=result.unknownMemberCount ? result.unknownMemberCount+" response details still need checking." : result.pendingMemberCount ? result.pendingMemberCount+" fictional responses are pending." : result.blockedMemberCount ? result.compatibleMemberCount+" of "+fixture.expectedCount+" fictional responses fit." : "All "+fixture.expectedCount+" fictional submitted needs fit this combination.";
  $("#outcome-title").className=result.blockedMemberCount?"warn":"good";
  toast(result.blockedMemberCount?"What-if checked — conflicts remain.":"What-if checked — no known conflicts.");
}
function resetCandidate() {
  const venue=plans.find(p=>p.venueLabel===$("#venue-select").value);
  const time={startUtc:toUtc($("#time-select").value)};
  const option=recombine(closestPlan,venue,time);
  $("#candidate-title").textContent=option.title;
  $("#candidate-venue").textContent=option.venueLabel;
  $("#candidate-facts").textContent=formatTime(option.startUtc)+"–"+formatTime(option.endUtc)+" · "+money(option.costMinor)+" · "+option.noise+" setting";
  $("#outcome-title").textContent="Ready to check this combination";
  $("#outcome-title").className="";
  $("#outcome-copy").textContent="Run the check to see how fictional group needs fit.";
  $("[data-action='use-preview']").disabled=true;
}
function toUtc(hour) { return new Date(fixture.date+"T"+hour+":00+08:00").toISOString(); }
function ensureTimeChoice(hour) {
  const select=$("#time-select");
  if(!$$('option',select).some(option=>option.value===hour))select.add(new Option(hour,hour));
  select.value=hour;
}
function renderLabMembers() {
  const holder=$("#lab-members");holder.replaceChildren();
  members.forEach((member,index)=>{
    const row=document.createElement("div");row.className="lab-member";row.dataset.member=index;
    const interval=member.availability[0];
    row.innerHTML='<div class="lab-member-title"><b>Participant '+(index+1)+'</b><span>Fictional</span></div><div class="lab-member-fields"><label>Available from<input type="time" data-field="from"></label><label>Until<input type="time" data-field="until"></label><label>Max budget (¥)<input type="number" min="0" step="1" data-field="budget"></label><label>Quiet space<select data-field="quiet"><option value="false">No</option><option value="true">Yes</option><option value="unknown">Unknown</option></select></label></div><label class="lab-submitted"><input type="checkbox" data-field="submitted"> Response submitted</label><small class="lab-error" role="alert"></small>';
    $("[data-field='from']",row).value=interval?formatTime(interval.startUtc):"";
    $("[data-field='until']",row).value=interval?formatTime(interval.endUtc):"";
    $("[data-field='budget']",row).value=member.maxBudgetMinor==null?"":String(member.maxBudgetMinor/100);
    $("[data-field='quiet']",row).value=member.needsQuiet===null?"unknown":String(member.needsQuiet);
    $("[data-field='submitted']",row).checked=member.submitted;
    holder.append(row);
  });
}
function renderLabResults() {
  const best=stats[closestPlan.id];
  $("#lab-best-score").textContent=best.compatibleMemberCount+"/"+fixture.expectedCount;
  $("#lab-best-label").textContent=closestPlan.venueLabel+" · "+formatTime(closestPlan.startUtc);
  $("#lab-best-detail").textContent=best.blockedMemberCount+" known conflict"+(best.blockedMemberCount===1?"":"s")+" · "+best.pendingMemberCount+" pending response"+(best.pendingMemberCount===1?"":"s");
  const originals=$("#lab-plan-list");originals.replaceChildren();
  plans.forEach(plan=>{
    const result=stats[plan.id],button=document.createElement("button");
    button.dataset.option=plan.id;
    button.innerHTML='<span></span><strong></strong><small></small>';
    $("span",button).textContent=plan.venueLabel+" · "+formatTime(plan.startUtc);
    $("strong",button).textContent=result.compatibleMemberCount+"/"+fixture.expectedCount+" fit";
    $("small",button).textContent=result.blockedMemberCount+" conflict"+(result.blockedMemberCount===1?"":"s");
    originals.append(button);
  });
  const suggestions=$("#lab-alternatives");suggestions.replaceChildren();
  alternatives.forEach(({option,result},index)=>{
    const button=document.createElement("button");button.dataset.labAlternative=index;
    button.innerHTML='<span></span><strong></strong><small></small>';
    $("span",button).textContent=option.venueLabel+" · "+formatTime(option.startUtc);
    $("strong",button).textContent=result.compatibleMemberCount+"/"+fixture.expectedCount+" fit";
    $("small",button).textContent=result.blockedMemberCount+" conflict"+(result.blockedMemberCount===1?"":"s")+" · "+money(option.costMinor);
    suggestions.append(button);
  });
  if(!alternatives.length)suggestions.textContent="No new combination within this time window.";
}
function updateLab() {
  const next=structuredClone(members);
  let valid=true;
  $$(".lab-member").forEach(row=>{
    const index=Number(row.dataset.member),member=next[index];
    const from=$("[data-field='from']",row).value,until=$("[data-field='until']",row).value;
    const budget=$("[data-field='budget']",row).value,quiet=$("[data-field='quiet']",row).value;
    const error=$(".lab-error",row);error.textContent="";
    if((from&&!until)||(!from&&until)||from&&until&&from>=until){error.textContent="Enter a valid availability interval, or leave both times empty.";valid=false;return;}
    if(budget!==""&&(!Number.isSafeInteger(Number(budget)*100)||Number(budget)<0)){error.textContent="Enter a valid non-negative budget.";valid=false;return;}
    member.availability=from?[{startUtc:toUtc(from),endUtc:toUtc(until)}]:[];
    member.maxBudgetMinor=budget===""?null:Math.round(Number(budget)*100);
    member.needsQuiet=quiet==="unknown"?null:quiet==="true";
    member.submitted=$("[data-field='submitted']",row).checked;
  });
  if(!valid)return;
  members=next;
  stats=Object.fromEntries(plans.map(plan=>[plan.id,aggregate(plan,members,fixture.expectedCount)]));
  closestPlan=[...plans].sort((a,b)=>stats[a.id].blockedMemberCount-stats[b.id].blockedMemberCount||stats[a.id].unknownMemberCount-stats[b.id].unknownMemberCount)[0];
  alternatives=searchAlternatives(plans,members,fixture.expectedCount,closestPlan);
  recommendation=alternatives[0];
  if(simulated)simulated.result=aggregate(simulated.option,members,fixture.expectedCount);
  renderRecommendation();renderLabResults();updateMatrix();resetCandidate();
}
function addOption() {
  const wrap=$("#option-inputs"), number=wrap.children.length+1;
  if(number>4){toast("A room can include up to four options.");return;}
  const card=wrap.querySelector(".option-entry").cloneNode(true);
  card.querySelector("b").textContent="Option "+number;
  card.querySelectorAll("input").forEach(input=>input.value="");
  card.querySelectorAll("select").forEach(select=>select.selectedIndex=0);
  wrap.append(card);
}
document.addEventListener("click",event=>{
  const pageButton=event.target.closest("[data-page]");
  if(pageButton){setPage(pageButton.dataset.page);return;}
  const option=event.target.closest("[data-option]");
  if(option){choose(option.dataset.option);if(page==="lab")setPage("results");return;}
  const action=event.target.closest("[data-action]")?.dataset.action;
  const labAlternative=event.target.closest("[data-lab-alternative]");
  if(labAlternative){simulated=alternatives[Number(labAlternative.dataset.labAlternative)];choose("simulation");setPage("results");return;}
  if(action==="setup"||action==="ai"){showSetup();return;}
  if(action==="rescue"){runRescue();return;}
  if(action==="open-recommendation"){$("#venue-select").value=recommendation.option.venueLabel;ensureTimeChoice(formatTime(recommendation.option.startUtc));runRescue();setPage("explore");return;}
  if(action==="reset-lab"){members=structuredClone(fixture.members);renderLabMembers();updateLab();toast("Example requirements restored.");return;}
  if(action==="use-preview"){if(!simulated){toast("Check a combination first.");return;}choose("simulation");setPage("results");return;}
  if(action==="cards"||action==="matrix"){const cards=action==="cards";$("#matrix").hidden=cards;$("#cards").hidden=!cards;$$(".view-toggle button").forEach(b=>b.classList.toggle("selected",b.dataset.action===action));return;}
  if(action==="add-option"){addOption();return;}
  if(action==="draft"){event.preventDefault();toast("This preview has not been saved.");return;}
  if(action==="copy-summary"){
    const plan=selectedId==="simulation"&&simulated?simulated.option:plans.find(p=>p.id===selectedId);
    const result=selectedId==="simulation"&&simulated?simulated.result:stats[selectedId];
    const summary="TablePeace illustrative demo: "+plan.venueLabel+" at "+formatTime(plan.startUtc)+". "+result.blockedMemberCount+" known conflicts; 0 of "+fixture.expectedCount+" confirmations. Venue unverified.";
    if(navigator.clipboard)navigator.clipboard.writeText(summary).then(()=>toast("Illustrative summary copied.")).catch(()=>toast(summary));else toast(summary);
  }
});
$("#create-form").addEventListener("submit",event=>{
  event.preventDefault();const errors=[];
  if(!$("#room-title").value.trim())errors.push("Add a room name.");
  $$(".option-entry").forEach((entry,index)=>{
    if(!entry.querySelector(".venue-input")?.value.trim())errors.push("Add a venue name for option "+(index+1)+".");
    if(!entry.querySelector('input[type="datetime-local"]')?.value)errors.push("Add a start time for option "+(index+1)+".");
    if(!entry.querySelector("select")?.value)errors.push("Choose an environment for option "+(index+1)+".");
    const price=entry.querySelector('input[type="number"]');if(price?.value&&Number(price.value)<0)errors.push("Cost must be zero or more.");
  });
  const out=$("#form-errors");out.replaceChildren();errors.forEach(error=>{const p=document.createElement("p");p.textContent=error;out.append(p);});
  if(errors.length){out.scrollIntoView({behavior:"smooth",block:"center"});return;}showSetup();
});
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeModal();});
$("#venue-select").addEventListener("change",resetCandidate);
$("#time-select").addEventListener("change",resetCandidate);
$("#lab-members").addEventListener("change",updateLab);
window.addEventListener("popstate",()=>renderPage(location.hash.slice(1)||(location.pathname==="/new"?"new":"results")));
renderLabMembers();renderLabResults();renderRecommendation();resetCandidate();updateMatrix();setPage(["overview","needs","results","explore","decision","lab","new"].includes(page)?page:"results");
