import { fixture, aggregate, rescue, recombine, formatTime } from "./engine.js";

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const plans = fixture.options;
const stats = Object.fromEntries(plans.map(plan => [plan.id, aggregate(plan, fixture.members, fixture.expectedCount)]));
let selectedId = "A";
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
  el.textContent=count ? count+" conflict"+(count>1?"s":"") : unknown ? "Needs info" : result.checkedParticipantCount+" of 4 clear";
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
  const plan=id==="simulation" ? simulated.option : plans.find(p=>p.id===id);
  const result=id==="simulation" ? simulated.result : stats[id];
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
  $("#decision-fit").textContent=(result.blockedMemberCount?"0":"4")+"/4";
  const fit=$("#decision-fit").parentElement.nextElementSibling;
  fit.querySelector("b").textContent=result.blockedMemberCount?"Known conflicts remain":"Needs appear compatible";
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
  const time=plans.find(p=>formatTime(p.startUtc)===$("#time-select").value);
  const option=recombine(plans[1],venue,time);
  const result=aggregate(option,fixture.members,fixture.expectedCount);
  simulated={option,result};selectedId="simulation";
  $("#candidate-title").textContent=option.venueLabel+" · "+formatTime(option.startUtc);
  $("#candidate-venue").textContent=option.venueLabel;
  $("#candidate-facts").textContent=formatTime(option.startUtc)+"–"+formatTime(option.endUtc)+" · "+money(option.costMinor)+" · "+option.noise+" setting";
  $("#outcome-title").textContent=result.blockedMemberCount ? result.blockedMemberCount+" known conflict"+(result.blockedMemberCount===1?"":"s")+" remain" : "No known conflicts in supplied needs";
  $("#outcome-copy").textContent=result.unknownMemberCount ? result.unknownMemberCount+" response details still need checking." : "All four fictional submitted needs fit this combination.";
  $("#outcome-title").className=result.blockedMemberCount?"warn":"good";
  toast(result.blockedMemberCount?"What-if checked — conflicts remain.":"What-if checked — no known conflicts.");
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
  if(option){choose(option.dataset.option);return;}
  const action=event.target.closest("[data-action]")?.dataset.action;
  if(action==="setup"||action==="ai"){showSetup();return;}
  if(action==="rescue"){runRescue();return;}
  if(action==="use-preview"){if(!simulated){toast("Check a combination first.");return;}choose("simulation");setPage("results");return;}
  if(action==="cards"||action==="matrix"){const cards=action==="cards";$("#matrix").hidden=cards;$("#cards").hidden=!cards;$$(".view-toggle button").forEach(b=>b.classList.toggle("selected",b.dataset.action===action));return;}
  if(action==="add-option"){addOption();return;}
  if(action==="draft"){event.preventDefault();toast("This preview has not been saved.");return;}
  if(action==="copy-summary"){
    const plan=selectedId==="simulation"&&simulated?simulated.option:plans.find(p=>p.id===selectedId);
    const result=selectedId==="simulation"&&simulated?simulated.result:stats[selectedId];
    const summary="TablePeace illustrative demo: "+plan.venueLabel+" at "+formatTime(plan.startUtc)+". "+result.blockedMemberCount+" known conflicts; 0 of 4 confirmations. Venue unverified.";
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
window.addEventListener("popstate",()=>renderPage(location.hash.slice(1)||(location.pathname==="/new"?"new":"results")));
updateMatrix();choose("A");setPage(["overview","needs","results","explore","decision","new"].includes(page)?page:"results");
