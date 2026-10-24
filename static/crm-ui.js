
/* CRM owner dashboard. Uses the same business-scoped administrative API as BizBug. */
const crmStages=[
 ['new','New Lead'],['contacted','Contacted'],['qualified','Qualified'],
 ['proposal','Proposal / Quote'],['won','Won'],['lost','Lost']
];
const crmMoney=n=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
const crmData=()=>state.data?.crm||{stages:{},tasks:[],open_tasks:0,overdue_tasks:0,pipeline_value:0,won_value:0,closed_win_rate:0,lead_count:0,new_leads_30d:0,daily_leads:[]};
const crmStageName=s=>crmStages.find(v=>v[0]===s)?.[1]||s;
const crmStageOptions=selected=>crmStages.map(([value,name])=>`<option value="${value}" ${value===selected?'selected':''}>${name}</option>`).join('');
const crmDateInput=date=>{if(!date)return '';let d=new Date(date);if(!Number.isFinite(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};

function crmLeadsPage(){
 const d=state.data,report=crmData();
 const rows=d.leads.map(l=>`<tr>
 <td><button class="crm-name" data-crm-lead="${l.id}">${esc(l.name)}</button><small>${esc(l.source==='sample'?'Sample contact':l.source)}</small></td>
 <td>${esc(l.email||'No email')}${l.phone?'<small>'+esc(l.phone)+'</small>':''}</td>
 <td><span class="crm-stage-label" data-stage="${esc(l.stage||'new')}">${esc(crmStageName(l.stage||'new'))}</span></td>
 <td>${crmMoney(l.deal_value)}</td><td>${esc(l.owner||'Unassigned')}</td>
 <td>${dateFmt(l.created_at)}</td>
 <td><button class="secondary-btn small-btn" data-crm-lead="${l.id}">View Profile</button></td></tr>`).join('');
 return `${heading('Customer Relationship Management','Leads & Contacts','Track customers, their conversations, ownership, and opportunities.','<button class="primary-btn" id="crm-add-lead">+ Add Contact</button>')}
 <div class="crm-overview-row"><div class="crm-mini-metric"><b>${report.lead_count}</b><span>Real Leads</span></div><div class="crm-mini-metric"><b>${report.new_leads_30d}</b><span>Past 30 Days</span></div><div class="crm-mini-metric"><b>${crmMoney(report.pipeline_value)}</b><span>Open Opportunity Value</span></div><div class="crm-mini-metric"><b>${report.open_tasks}</b><span>Follow-ups Open</span></div></div>
 <div class="info-strip">Sample contacts are clearly labeled and excluded from performance reporting. Opportunity values are manually entered estimates, not verified sales revenue.</div>
 <section class="panel"><div class="panel-titlebar"><div><h3>Customer Directory</h3><p>Open a profile to update the stage, add notes, or review linked conversations.</p></div><button class="inline-btn" data-goto="pipeline">View Pipeline →</button></div>
 <div class="table-overflow"><table class="data-table"><thead><tr><th>Contact</th><th>Contact Info</th><th>Stage</th><th>Deal Value</th><th>Owner</th><th>Added</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7">No contacts yet. Add one or capture a lead through chat.</td></tr>'}</tbody></table></div></section>`;
}

function crmPipelinePage(){
 const d=state.data,r=crmData();
 const lanes=crmStages.map(([key,name])=>{
 const leads=d.leads.filter(l=>(l.stage||'new')===key);
 const cards=leads.map(l=>`<button type="button" class="crm-deal-card" data-crm-lead="${l.id}">
 <strong>${esc(l.name)}</strong><small>${esc(l.note||'No opportunity description')}</small>
 <span>${crmMoney(l.deal_value)} · ${esc(l.owner||'Unassigned')}</span></button>`).join('');
 return `<section class="crm-lane"><div class="crm-lane-header"><b>${name}</b><span>${leads.length}</span></div>
 <div class="crm-lane-cards">${cards||'<div class="crm-lane-empty">No contacts</div>'}</div></section>`;
 }).join('');
 return `${heading('Opportunity Tracking','Sales Pipeline','Open a contact to move it to the next stage or change its value.','<button class="primary-btn" id="crm-add-lead">+ Add Opportunity</button>')}
 <div class="crm-overview-row"><div class="crm-mini-metric"><b>${crmMoney(r.pipeline_value)}</b><span>Open Pipeline</span></div><div class="crm-mini-metric"><b>${crmMoney(r.won_value)}</b><span>Won Value Entered</span></div><div class="crm-mini-metric"><b>${r.closed_win_rate}%</b><span>Closed-Deal Win Rate</span></div></div>
 <div class="info-strip">Stages reflect the current contact status. Won value is based on amounts entered by the business owner; BizBug does not verify payments.</div>
 <div class="crm-board">${lanes}</div>`;
}

function crmTasksPage(){
 const tasks=crmData().tasks;
 const open=tasks.filter(t=>t.status==='open');
 const done=tasks.filter(t=>t.status==='done');
 const renderTask=t=>`<div class="crm-task-row">
 <button class="crm-task-check ${t.status==='done'?'checked':''}" type="button" data-crm-task-toggle="${t.id}" data-current-status="${t.status}" aria-label="${t.status==='done'?'Reopen':'Complete'} task">${t.status==='done'?'✓':'○'}</button>
 <div><b class="${t.status==='done'?'crm-task-done':''}">${esc(t.title)}</b><small>${esc(t.details||'')}${t.contact_name?' · '+esc(t.contact_name):''}</small></div>
 <span class="crm-task-date">${t.due_at?'Due '+esc(dateFmt(t.due_at)):'No due date'}</span>
 ${t.lead_id?'<button class="inline-btn" data-crm-lead="'+t.lead_id+'">Contact ↗</button>':''}
 </div>`;
 return `${heading('Work & Automation','Tasks & Follow-ups','Every newly captured real lead automatically gets an internal follow-up task.','<button class="primary-btn" id="crm-add-task">+ New Task</button>')}
 <div class="crm-overview-row"><div class="crm-mini-metric"><b>${crmData().open_tasks}</b><span>Open Tasks</span></div><div class="crm-mini-metric"><b>${crmData().overdue_tasks}</b><span>Overdue</span></div><div class="crm-mini-metric"><b>${done.length}</b><span>Completed (Recent)</span></div></div>
 <div class="info-strip">Automatic follow-up tasks are internal reminders. BizBug does not email or text customers automatically, and marking a task complete does not send a message.</div>
 <section class="panel"><div class="panel-titlebar"><h3>To Do</h3><span class="micro">${open.length} currently displayed</span></div><div class="crm-task-list">${open.map(renderTask).join('')||'<div class="empty">All caught up. No open follow-ups.</div>'}</div></section>
 <section class="panel" style="margin-top:18px"><div class="panel-titlebar"><h3>Completed Tasks</h3></div><div class="crm-task-list">${done.map(renderTask).join('')||'<div class="empty">No completed tasks yet.</div>'}</div></section>`;
}

function crmReportsPage(){
 const r=crmData(),values=crmStages.map(([key,label])=>({label,value:r.stages[key]||0}));
 const max=Math.max(1,...values.map(x=>x.value));
 const bars=values.map(x=>`<div class="crm-report-line"><span>${esc(x.label)}</span><div class="crm-report-track"><div style="width:${Math.round(x.value/max*100)}%"></div></div><b>${x.value}</b></div>`).join('');
 const days=r.daily_leads||[];
 const peak=Math.max(1,...days.map(d=>d.count));
 const daily=days.length?days.map(d=>`<div class="crm-report-day"><small>${esc(d.day.slice(5))}</small><div style="height:${Math.max(6,Math.round(d.count/peak*120))}px"></div><span>${d.count}</span></div>`).join(''):'<div class="empty">No customer leads captured in the past 30 days.</div>';
 return `${heading('CRM Insights','Reporting & Analytics','Understand contact volume, follow-up work, and estimated pipeline progress.')}
 <div class="crm-overview-row"><div class="crm-mini-metric"><b>${r.lead_count}</b><span>Real Leads</span></div><div class="crm-mini-metric"><b>${r.new_leads_30d}</b><span>New in 30 Days</span></div><div class="crm-mini-metric"><b>${r.closed_win_rate}%</b><span>Closed-Deal Win Rate</span></div><div class="crm-mini-metric"><b>${crmMoney(r.pipeline_value)}</b><span>Estimated Open Value</span></div></div>
 <div class="crm-report-grid">
 <section class="panel"><div class="panel-titlebar"><div><h3>Pipeline Breakdown</h3><p>Contacts at each stage, excluding sample records</p></div></div><div class="panel-body">${bars}</div></section>
 <section class="panel"><div class="panel-titlebar"><div><h3>Lead Activity · 30 Days</h3><p>Daily lead captures, on days with activity</p></div></div><div class="crm-daily-chart">${daily}</div></section></div>
 <div class="info-strip">Reporting uses saved contact stages and entered opportunity values. A won deal is not proof of a completed payment. Win rate uses closed deals only (won ÷ won + lost).</div>`;
}

async function crmOpenLead(id){
 try{
  const data=await api('/businesses/'+state.businessId+'/crm/leads/'+id);
  const l=data.lead;
  const rows=(data.events||[]).map(e=>`<div class="crm-timeline-item"><b>${esc(e.kind)}</b><small>${esc(timeFmt(e.created_at))}</small><p>${esc(e.details)}</p></div>`).join('');
  const transcript=(data.messages||[]).map(m=>`<div class="crm-timeline-item"><b>${m.role==='user'?'Customer':'Assistant'}</b><small>${esc(timeFmt(m.created_at))}</small><p>${viewText(m.content)}</p></div>`).join('');
  const appointments=(data.appointments||[]).map(a=>`<div class="crm-timeline-item"><b>Appointment: ${esc(a.service||'Request')}</b><small>${esc(timeFmt(a.starts_at))}</small><p>Status: ${esc(a.status)}</p></div>`).join('');
  const m=modal('Customer Profile · '+l.name,`
  <div class="crm-profile-header"><span class="crm-stage-label" data-stage="${esc(l.stage||'new')}">${esc(crmStageName(l.stage||'new'))}</span><span>${esc(l.source)} · Created ${dateFmt(l.created_at)}</span></div>
  <form id="crm-contact-form"><div class="two-col-form">
    <div class="field"><label>Name</label><input name="name" required minlength="2" maxlength="160" value="${esc(l.name)}"></div>
    <div class="field"><label>Email</label><input name="email" type="email" maxlength="160" value="${esc(l.email||'')}"></div>
    <div class="field"><label>Phone</label><input name="phone" maxlength="40" value="${esc(l.phone||'')}"></div>
    <div class="field"><label>Assigned Owner</label><input name="owner" maxlength="120" value="${esc(l.owner||'')}" placeholder="Staff name"></div>
    <div class="field"><label>Sales Stage</label><select name="stage">${crmStageOptions(l.stage||'new')}</select></div>
    <div class="field"><label>Opportunity Value ($)</label><input name="deal_value" type="number" min="0" step=".01" max="100000000" value="${Number(l.deal_value)||0}"></div>
  </div><div class="field"><label>Customer Inquiry</label><textarea name="note" rows="3" maxlength="1000">${esc(l.note||'')}</textarea></div>
  <button class="primary-btn" type="submit">Save Contact</button></form>
  <div class="crm-modal-divider"></div><h3>Add Activity Note</h3><form id="crm-note-form" style="margin-top:10px"><div class="field"><textarea name="text" rows="2" maxlength="3000" required placeholder="Call notes, next steps, or customer preferences"></textarea></div><button type="submit" class="secondary-btn">Save Note</button></form>
  <div class="crm-modal-divider"></div><h3>Contact History</h3><div class="crm-timeline">${rows||'<p>No activity logged yet.</p>'}</div>
  <h3>Linked Chat History</h3><div class="crm-timeline">${transcript||'<p>No linked chat transcript for this contact.</p>'}</div>
  <h3>Appointments</h3><div class="crm-timeline">${appointments||'<p>No appointments linked by email.</p>'}</div>
  <button type="button" class="secondary-btn" id="crm-draft-followup">Draft Follow-up</button>`);
  $('#crm-contact-form',m).addEventListener('submit',async e=>{
   e.preventDefault();const obj=Object.fromEntries(new FormData(e.currentTarget));obj.deal_value=Number(obj.deal_value)||0;
   try{await api('/businesses/'+state.businessId+'/crm/leads/'+id,{method:'PUT',body:JSON.stringify(obj)});
    m.remove();await loadDashboard();notify('Contact updated');}catch(err){notify(err.message);}
  });
  $('#crm-note-form',m).addEventListener('submit',async e=>{
   e.preventDefault();const text=new FormData(e.currentTarget).get('text');
   try{await api('/businesses/'+state.businessId+'/crm/leads/'+id+'/notes',{method:'POST',body:JSON.stringify({text})});
    m.remove();await loadDashboard();await crmOpenLead(id);}catch(err){notify(err.message);}
  });
  $('#crm-draft-followup',m).addEventListener('click',()=>{m.remove();openFollowup(id);});
 }catch(err){notify('Contact could not be opened: '+err.message);}
}

function crmNewLead(){
 const m=modal('Add Contact',`<form id="crm-new-lead"><div class="two-col-form">
 <div class="field"><label>Full Name</label><input name="name" required minlength="2" maxlength="160"></div>
 <div class="field"><label>Email</label><input type="email" name="email" maxlength="160"></div>
 <div class="field"><label>Phone Number</label><input name="phone" maxlength="40"></div>
 <div class="field"><label>Assigned Owner</label><input name="owner" maxlength="120" placeholder="Staff name"></div>
 <div class="field"><label>Stage</label><select name="stage">${crmStageOptions('new')}</select></div>
 <div class="field"><label>Opportunity Value ($)</label><input type="number" name="deal_value" min="0" max="100000000" step=".01" value="0"></div>
 </div><div class="field"><label>Notes / Customer Need</label><textarea name="note" maxlength="1000" rows="3"></textarea></div>
 <button class="primary-btn" type="submit">Create Contact</button></form>`);
 $('#crm-new-lead',m).addEventListener('submit',async e=>{
  e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));body.deal_value=Number(body.deal_value)||0;
  try{await api('/businesses/'+state.businessId+'/crm/leads',{method:'POST',body:JSON.stringify(body)});
  m.remove();await loadDashboard();notify('Contact created with a follow-up task');}catch(err){notify(err.message);}
 });
}

function crmNewTask(){
 const contacts=(state.data?.leads||[]).map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
 const m=modal('Create Follow-up Task',`<form id="crm-new-task">
 <div class="field"><label>Task Title</label><input name="title" maxlength="200" minlength="2" required placeholder="Call customer about quote"></div>
 <div class="field"><label>Contact (Optional)</label><select name="lead_id"><option value="">No linked contact</option>${contacts}</select></div>
 <div class="field"><label>Due Date (Optional)</label><input type="datetime-local" name="due_at"></div>
 <div class="field"><label>Details</label><textarea rows="3" maxlength="1000" name="details" placeholder="What should happen next?"></textarea></div>
 <button class="primary-btn" type="submit">Save Task</button></form>`);
 $('#crm-new-task',m).addEventListener('submit',async e=>{
  e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));
  body.lead_id=body.lead_id?Number(body.lead_id):null;
  body.due_at=body.due_at?new Date(body.due_at).toISOString():null;
  try{await api('/businesses/'+state.businessId+'/crm/tasks',{method:'POST',body:JSON.stringify(body)});
  m.remove();await loadDashboard();notify('Task created');}catch(err){notify(err.message);}
 });
}

async function crmToggleTask(id,current){
 try{await api('/businesses/'+state.businessId+'/crm/tasks/'+id,{method:'PUT',body:JSON.stringify({status:current==='done'?'open':'done'})});
 await loadDashboard();notify(current==='done'?'Task reopened':'Task completed');}catch(err){notify(err.message);}
}

function wireCrm(){
 $('#crm-add-lead')?.addEventListener('click',crmNewLead);
 $('#crm-add-task')?.addEventListener('click',crmNewTask);
 $$('[data-crm-lead]').forEach(btn=>btn.addEventListener('click',()=>crmOpenLead(Number(btn.dataset.crmLead))));
 $$('[data-crm-task-toggle]').forEach(btn=>btn.addEventListener('click',()=>crmToggleTask(Number(btn.dataset.crmTaskToggle),btn.dataset.currentStatus)));
}
