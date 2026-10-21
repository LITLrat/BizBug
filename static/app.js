/* BizBug demo studio. No framework or build step required. */
const $=(sel,base=document)=>base.querySelector(sel);
const $$=(sel,base=document)=>[...base.querySelectorAll(sel)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const viewText=s=>esc(s).replace(/\*\*(.*?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
let storedAdminToken='';try{storedAdminToken=sessionStorage.getItem('bizbug_admin')||'';}catch{}
const state={businesses:[],businessId:'bloom',page:'overview',data:null,chatMessages:[],sessionId:null,busy:false,language:'en',chatOptions:[],token:storedAdminToken,integrations:null,smsDemoSession:null,smsDemoMessages:[],smsDemoOptions:[]};
const icons={chat:'◉',lead:'✉',appointment:'▦',faq:'▧',activity:'✦'};
const dateFmt=s=>{if(!s)return '—';try{return new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}catch{return s;}};
const timeFmt=s=>{if(!s)return '—';try{return new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return s;}};
const short=s=>(s||'').length>74?(s.slice(0,72)+'…'):s;
const current=()=>state.businesses.find(b=>b.id===state.businessId)||state.businesses[0]||{};
function notify(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>t.classList.remove('show'),3500);}
async function api(path,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};if(state.token)headers.Authorization='Bearer '+state.token;
 const resp=await fetch('/api'+path,{...opts,headers});let data={};try{data=await resp.json();}catch{}
 if(!resp.ok){if(resp.status===401){showTokenModal();throw Error('Enter your dashboard access token to continue.');}throw Error(data.detail||'Request failed');}return data;}
function setBusinessColor(){document.documentElement.style.setProperty('--accent',current().accent||'#d17f83');}
async function loadBusiness(){const items=await api('/businesses');state.businesses=items;
 if(!items.some(b=>b.id===state.businessId))state.businessId=items[0]?.id;
 setBusinessColor();sideBar();await loadDashboard();}
async function loadDashboard(){try{state.data=await api('/businesses/'+state.businessId+'/dashboard');sideBar();render();}
 catch(e){$('#page-content').innerHTML=`<div class="panel panel-body"><h2>Dashboard access</h2><p class="page-subtitle">${esc(e.message)}</p><br><button class="primary-btn" id="enter-token">Enter access token</button></div>`;$('#enter-token')?.addEventListener('click',showTokenModal);}}
function sideBar(){const b=current();$('#side-avatar').textContent=b.initials||'AI';$('#side-name').textContent=b.name||'Your business';$('#side-type').textContent=b.category||'';
 $('#nav-lead-count').textContent=state.data?.stats?.leads||'0';$('#breadcrumb').textContent=({'overview':'Overview','leads':'Leads & contacts','appointments':'Appointments','knowledge':'Knowledge base','settings':'Business setup','integrations':'Calendar & SMS'})[state.page];
 $$('.nav-link').forEach(link=>link.classList.toggle('active',link.dataset.page===state.page));
 $('#workspace-menu').innerHTML=state.businesses.map(b=>`<button class="workspace-option" data-business="${esc(b.id)}"><span class="business-icon" style="background:${esc(b.accent)}">${esc(b.initials)}</span><span><b>${esc(b.name)}</b><small>${esc(b.category)}</small></span></button>`).join('')+`<button class="workspace-option" data-create="yes"><span class="business-icon" style="background:#3d756c">+</span><span><b>Create a new business</b><small>Try your own client profile</small></span></button>`;
 $('#workspace-menu').querySelectorAll('[data-business]').forEach(el=>el.addEventListener('click',()=>switchBusiness(el.dataset.business)));
 $('#workspace-menu').querySelector('[data-create]').addEventListener('click',()=>{hideMenu();newBusinessModal()});}
function hideMenu(){$('#workspace-menu').classList.add('hidden');}
async function switchBusiness(id){hideMenu();state.businessId=id;state.sessionId=null;state.chatMessages=[];state.chatOptions=[];state.smsDemoMessages=[];state.smsDemoSession=null;state.smsDemoOptions=[];state.integrations=null;state.language='en';setBusinessColor();await loadDashboard();}
function switchPage(page){state.page=page;sideBar();render();if(page==='integrations')loadIntegrations();window.scrollTo({top:0,behavior:'smooth'});}
function heading(eyebrow,title,subtitle,action=''){return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div>${action}</div>`;}
function metric(title,value,caption,icon,color=''){return `<div class="metric-card"><div class="metric-top"><span>${title}</span><div class="metric-icon ${color}">${icon}</div></div><div class="metric-value">${value}</div><div class="metric-caption">${caption}</div></div>`;}
function mainOverview(){const d=state.data,b=current(),s=d.stats;
 const quick=[['knowledge','▧','Train your assistant','Add services, FAQs & business facts'],['leads','✉','Review captured leads','See details from real demo chats'],['appointments','▦','Appointment requests','View customer requests'],['settings','⚙','Personalize the brand','Change business name & greeting']];
 const activities=(d.activities||[]).slice(0,5).map(a=>`<div class="activity"><span class="activity-symbol">${a.kind==='lead'?'✉':'▦'}</span><div class="activity-details"><b>${esc(a.description)}</b><small>${dateFmt(a.created_at)} · ${a.kind==='lead'?'Lead captured':'Appointment requested'}</small></div></div>`).join('')||'<div class="empty">No recent activity yet. Try the assistant.</div>';
 return `${heading('Welcome back','Your assistant, at a glance','Meet your next employee of the month. Available 24/7, no coffee breaks.','<span class="live-label">Interactive demo</span>')}
 <section class="top-hero"><div class="hero-text"><div class="eyebrow">MADE FOR SMALL BUSINESS</div><h2>Let your business keep buzzing.</h2><p>Switch business types, ask real questions, capture a lead, and send an appointment request. Everything you do appears in the owner dashboard.</p></div><div class="hero-art"><div class="art-chat"><div class="art-bubble short"></div><div class="art-bubble"></div><div class="art-bubble answer"></div><div class="art-bubble short"></div></div><div class="art-circle">🐞</div></div></section>
 <div class="stats-grid">${metric('Conversations',s.conversations,'Started through the assistant','◉')}${metric('Leads captured',s.leads,'Includes labeled sample data','♙','lilac')}${metric('Appointment requests',s.requests,'Pending human confirmation','▦','cream')}${metric('Knowledge answers',s.faqs,'Configured FAQ responses','▧','pink')}</div>
 <div class="main-grid"><div class="column-stack"><section class="panel"><div class="panel-titlebar"><div><h3>Customize this assistant</h3><p>Four quick ways to make it your own</p></div><span class="micro">SETUP</span></div><div class="action-grid">${quick.map(x=>`<button class="action-card" data-goto="${x[0]}"><span class="action-icon">${x[1]}</span><span><b>${x[2]}</b><small>${x[3]}</small></span></button>`).join('')}</div></section>
 <section class="panel"><div class="panel-titlebar"><div><h3>Recent activity</h3><p>Leads and requests captured by the assistant</p></div><button class="inline-btn" data-goto="leads">View leads ↗</button></div><div class="activity-list">${activities}</div></section>
 <section class="panel"><div class="panel-titlebar"><div><h3>Your suggested next actions</h3><p>Small daily tasks generated from the dashboard</p></div><span class="micro">TO-DO</span></div><div class="panel-body">${[
 [String(d.appointments.filter(a=>a.status!=='confirmed').length),`Review ${d.appointments.filter(a=>a.status!=='confirmed').length} unconfirmed appointment request${d.appointments.filter(a=>a.status!=='confirmed').length===1?'':'s'}`,'appointments'],
 [String(d.leads.filter(l=>l.source!=='sample').length),`Follow up with ${d.leads.filter(l=>l.source!=='sample').length} new demo lead${d.leads.filter(l=>l.source!=='sample').length===1?'':'s'}`,'leads'],
 ['✦','Keep FAQs and service details current','knowledge']].map(([count,description,dest])=>`<button class="action-card" data-goto="${dest}" style="width:100%;margin-bottom:9px"><span class="guide-dot">${count}</span><span><b>${description}</b><small>Open ${dest==='knowledge'?'knowledge base':dest} →</small></span></button>`).join('')}</div></section></div>
 <div>${chatCard()}</div></div>`;}
function chipLabel(raw){if(raw.startsWith('SERVICE::'))return raw.slice(9);if(raw.startsWith('SLOT::')){try{return new Date(raw.slice(6)).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return raw.slice(6)}}return raw;}
function chatCard(){const b=current();if(!state.chatMessages.length)state.chatMessages=[{role:'assistant',text:state.language==='es'?b.greeting_es:b.greeting}];
 const options=state.chatOptions.length?state.chatOptions:['What are your hours?','Book appointment','Leave a message'];
 return `<section class="panel chat-panel"><div class="panel-titlebar"><div><h3>Live assistant playground</h3><p>Try it as your customer would</p></div><span class="live-label">Try me</span></div>
 <div class="chat-header"><div class="chat-avatar">${esc(b.initials)}</div><div><strong>${esc(b.name)}</strong><small><span class="online-pip"></span>Virtual assistant · Always available</small></div><span class="chat-status">Online</span></div>
 <div class="chat-surface" id="chat-messages">${state.chatMessages.map(m=>`<div class="msg-row ${m.role==='user'?'user':''}">${m.role==='assistant'?'<div class="msg-avatar">✳</div>':''}<div class="bubble">${viewText(m.text)}</div></div>`).join('')}<div class="chat-options" id="chat-options">${options.map(option=>`<button class="quick-chip" data-send="${esc(option)}">${esc(chipLabel(option))}</button>`).join('')}</div></div>
 <form class="chat-compose" id="chat-form"><div class="compose-wrap"><input type="text" id="chat-input" maxlength="1400" placeholder="Ask a question or type a message..." aria-label="Chat message" autocomplete="off"><button class="send-btn" type="submit" aria-label="Send message" ${state.busy?'disabled':''}>↑</button></div><div class="chat-disclaimer">Demo assistant · Appointments are requests until confirmed by the business</div></form>
 <div class="chat-controls"><span>✓ English + Spanish</span><div><button class="inline-btn" id="spanish-toggle">${state.language==='es'?'Switch to English':'Try Spanish'}</button> &nbsp;·&nbsp; <button class="inline-btn" id="reset-chat">Reset chat</button></div></div></section>`;}
function leadsPage(){const d=state.data;const rows=d.leads.map(l=>`<tr><td><b>${esc(l.name)}</b><small>${esc(l.source==='sample'?'Sample contact':'AI assistant')}</small></td><td>${esc(l.email)}${l.phone?'<small>'+esc(l.phone)+'</small>':''}</td><td>${esc(short(l.note))}</td><td>${dateFmt(l.created_at)}</td><td><span class="pill ${l.source==='sample'?'':'new'}">${l.source==='sample'?'Sample':'New lead'}</span></td><td><button class="secondary-btn small-btn" data-followup="${l.id}">Draft follow-up</button></td></tr>`).join('');
 return `${heading('Customer pipeline','Leads & contacts','Every new conversation can become a customer relationship.')}
 <div class="info-strip">These leads are stored in the local SQLite database. Entries marked “Sample” are fictional seed data. New leads collected in the playground appear here after refresh.</div>
 <section class="panel"><div class="panel-titlebar"><div><h3>Contact inbox</h3><p>${d.leads.length} contacts in this workspace</p></div><span class="pill new">Live lead capture</span></div><div class="table-overflow"><table class="data-table"><thead><tr><th>Contact</th><th>Email</th><th>Interested in</th><th>Date</th><th>Status</th><th>Next step</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No leads yet. Try leaving a message in the assistant.</td></tr>'}</tbody></table></div></section>`;}
function appointmentsPage(){const d=state.data;
 const pending=d.appointments.filter(a=>a.status!=='confirmed').length;
 const rows=d.appointments.map(a=>`<tr><td><b>${esc(a.name)}</b><small>${esc(a.email||'Phone contact')}</small></td><td>${esc(a.service)}</td><td>${timeFmt(a.starts_at)}</td><td><span class="pill ${a.status==='confirmed'?'new':'pending'}">${a.status==='confirmed'?'Confirmed':'Request only'}</span>${a.provider?`<small>${esc(a.provider)}</small>`:''}</td><td>${dateFmt(a.created_at)}</td></tr>`).join('');
 return `${heading('Client scheduling','Appointments & requests','See which bookings were confirmed on the calendar and which require human follow-up.')}
 <div class="info-strip ${d.calendar_connected?'':'warning'}">${d.calendar_connected?'A business calendar is connected. New appointment times are checked against live availability and only marked confirmed after the provider saves an event.':'No live calendar connected. The assistant collects unconfirmed appointment requests using sample request times.'} <button class="inline-btn" data-goto="integrations">Manage calendar →</button></div>
 <section class="panel"><div class="panel-titlebar"><div><h3>Customer appointments</h3><p>Confirmed events and requests needing manual review</p></div><span class="pill pending">${pending} to review</span></div><div class="table-overflow"><table class="data-table"><thead><tr><th>Customer</th><th>Service</th><th>Time</th><th>Status</th><th>Submitted</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No appointments yet. Use the assistant to start a booking.</td></tr>'}</tbody></table></div></section>`;}
function knowledgePage(){const d=state.data;return `${heading('Assistant training','Knowledge base','Give your assistant trusted answers about your services and business.', '<button class="primary-btn" id="add-faq-button">+ Add an FAQ</button>')}
 <div class="knowledge-grid"><section class="panel"><div class="panel-titlebar"><div><h3>Frequently asked questions</h3><p>${d.faqs.length} ready-to-use answers</p></div></div><div>${d.faqs.map(f=>`<div class="faq-card"><b>${esc(f.question)}</b><p>${esc(f.answer)}</p>${f.answer_es?`<small>ES: ${esc(short(f.answer_es))}</small>`:''}</div>`).join('')||'<div class="empty">No FAQs added yet.</div>'}</div></section>
 <div class="column-stack"><section class="panel"><div class="panel-titlebar"><h3>Business documents & policies</h3></div><div class="panel-body"><div class="info-strip">Paste text from service menus, policies, rate sheets, or other business documents. The assistant uses the saved information as reference, not as instructions.</div><form id="knowledge-form"><div class="field"><label for="knowledge-text">Saved business information</label><textarea rows="11" maxlength="10000" id="knowledge-text">${esc(d.business.knowledge)}</textarea></div><button type="submit" class="primary-btn">Save knowledge</button></form></div></section>
 <section class="panel"><div class="panel-titlebar"><h3>What the assistant knows</h3></div><div class="panel-body"><p class="page-subtitle">Business name, hours, location, services, FAQs, and your saved policy text. For flexible AI-powered answers, configure a server-side OpenAI API key. Without one, this demo uses a limited FAQ matching engine.</p><div class="preview-note">✳ Your API keys stay on the server, never in the customer chat widget.</div></div></section></div></div>`;}
function settingsPage(){const d=state.data,b=d.business;const embed=`<script src="${location.origin}/widget.js" data-business="${b.id}" async><\/script>`;
 return `${heading('Make it yours','Business setup','Customize the personality and details of this assistant.')}
 <div class="knowledge-grid"><section class="panel"><div class="panel-titlebar"><div><h3>Business identity</h3><p>Displayed inside the chat assistant</p></div></div><div class="panel-body"><form id="settings-form"><div class="two-col-form"><div class="field"><label>Business name</label><input name="name" value="${esc(b.name)}" required></div><div class="field"><label>Location</label><input name="location" value="${esc(b.location)}"></div><div class="field"><label>Business email</label><input name="email" type="email" value="${esc(b.email)}"></div><div class="field"><label>Hours</label><input name="hours" value="${esc(b.hours)}"></div></div><div class="two-col-form"><div class="field"><label>Tagline</label><input name="tagline" value="${esc(b.tagline)}"></div><div class="field"><label>Brand accent color</label><input name="accent" type="color" value="${esc(b.accent)}" style="height:40px;padding:3px"></div></div><div class="field"><label>Bookable services (one per line)</label><textarea rows="4" name="services" placeholder="Consultation&#10;Service call">${esc((b.services||[]).join('\n'))}</textarea></div><div class="field"><label>Greeting · English</label><textarea rows="3" name="greeting">${esc(b.greeting)}</textarea></div><div class="field"><label>Greeting · Spanish</label><textarea rows="3" name="greeting_es">${esc(b.greeting_es)}</textarea></div><button class="primary-btn" type="submit">Save business details</button></form></div></section>
 <div class="column-stack"><section class="panel"><div class="panel-titlebar"><h3>Install on a website</h3></div><div class="panel-body"><p class="page-subtitle">Put this snippet just before your website's closing body tag. Visitors will see a floating chat launcher.</p><pre class="code-snippet">${esc(embed)}</pre><button class="secondary-btn" id="copy-embed">Copy embed code</button><div class="preview-note">For a real client, configure their branding, admin access, privacy notice, and allowed website origins first.</div></div></section>
 <section class="panel"><div class="panel-titlebar"><h3>Product readiness</h3></div><div class="panel-body">${[['✓','FAQs, Spanish chat, lead capture','Working demo'],['✓','Customer appointment requests','Working demo'],['✓','Email follow-up draft generator','Working demo'],['↗','OpenAI natural-language responses',d.ai_enabled?'API enabled':'Requires OPENAI_API_KEY'],['↗','Live calendar booking',d.calendar_connected?'Connected':'Connect in Calendar & SMS'],['↗','Two-way incoming SMS','Configure in Calendar & SMS'],['↗','Individual business accounts','Needs production login + tenancy']].map(x=>`<div class="guide-line"><span class="guide-dot">${x[0]}</span><span><b>${x[1]}</b><br><span class="micro">${x[2]}</span></span></div>`).join('')}</div></section></div></div>`;}

async function loadIntegrations(){
 try{state.integrations=await api(`/businesses/${state.businessId}/integrations`);if(state.page==='integrations')render();}
 catch(e){notify('Could not load integration settings: '+e.message);}
}
function integrationsPage(){
 const i=state.integrations;
 if(!i)return `${heading('CONNECT YOUR TOOLS','Calendars & two-way SMS','Loading integration settings...')}<section class="panel panel-body">Loading... </section>`;
 const on=i.production_mode, provider=i.calendar?.provider, num=i.sms?.number||'',tz=i.booking?.timezone||'America/New_York';
 const rows=[['google','Google Calendar'],['microsoft','Microsoft Outlook / 365']];
 return `${heading('CONNECT YOUR TOOLS','Calendars & two-way SMS','Connect each client’s own calendar and business texting number. Live connections require a secured, HTTPS-hosted server.')}
 <div class="main-grid"><div class="column-stack">
 <section class="panel"><div class="panel-titlebar"><div><h3>Calendar booking</h3><p>Show free times and create confirmed events</p></div><span class="micro">${provider?'CONNECTED: '+esc(provider.toUpperCase()):'NOT CONNECTED'}</span></div>
 <div class="panel-body"><p class="page-subtitle" style="margin-bottom:15px">${provider?`Using ${esc(provider)} calendar. Appointment times are verified and the event is added before confirming.`:'Without a live connection, the assistant collects appointment requests only. Never presents demo times as confirmed.'}</p>
 <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${rows.map(([key,name])=>`<button class="${provider===key?'secondary-btn':'primary-btn'}" data-connect="${key}" ${!on||!i.oauth_ready[key]?'disabled':''}>${provider===key?'Reconnect':'Connect'} ${name}</button>`).join('')}${provider?'<button class="secondary-btn" id="disconnect-calendar">Disconnect calendar</button>':''}</div>
 <form id="booking-config-form" class="two-col-form"><div class="field"><label>Business timezone (IANA)</label><input name="timezone" required value="${esc(tz)}" placeholder="America/New_York"></div><div class="field"><label>Appointment length</label><select name="duration_min">${[30,45,60,90,120].map(n=>`<option value="${n}" ${i.booking?.duration_min===n?'selected':''}>${n} minutes</option>`).join('')}</select></div><button class="secondary-btn" ${!on?'disabled':''} type="submit">Save booking settings</button></form>
 <p class="preview-note" style="margin-top:12px">One active booking calendar per business. Working hours currently use weekdays with morning and afternoon appointment windows. Existing events are checked before offering times.</p></div></section>
 <section class="panel"><div class="panel-titlebar"><div><h3>Two-way SMS assistant</h3><p>Customers text a business number and receive replies</p></div><span class="micro">${num?'NUMBER ASSIGNED':'NOT CONFIGURED'}</span></div>
 <div class="panel-body"><div class="field"><label>Twilio number assigned to this business</label><form id="sms-number-form" style="display:flex;gap:8px;flex-wrap:wrap"><input name="number" style="flex:1;min-width:160px" type="tel" placeholder="+18435550123" value="${esc(num)}" required><button class="primary-btn" ${!on||!i.sms_ready?'disabled':''}>Save number</button></form></div>
 ${num?'<button class="secondary-btn" id="remove-sms">Remove this number</button>':''}
 <div style="margin-top:16px" class="field"><label>Twilio incoming-message webhook (POST)</label><pre class="code-snippet">${esc(i.webhook_url||'Set PUBLIC_BASE_URL first')}</pre></div>
 <p class="preview-note">Purchase and register an SMS-capable number in Twilio, then set its inbound webhook to the URL above. Messages are responded to in English or Spanish, and leads appear in this business’s dashboard. The app does not purchase or verify phone numbers for you.</p></div></section>
 </div><div class="column-stack">
 <section class="panel"><div class="panel-titlebar"><div><h3>SMS-style sales demo</h3><p>Preview the text conversation without sending actual texts</p></div><span class="micro">SIMULATION</span></div>
 <div class="panel-body"><div id="sms-demo-log" style="min-height:210px;max-height:360px;overflow:auto;background:var(--panel, #f7f8fa);padding:13px;border-radius:10px">${state.smsDemoMessages.length?state.smsDemoMessages.map(m=>`<div style="margin:7px 0;max-width:91%;${m.role==='user'?'margin-left:auto;background:#d9f6df':'background:#edf1f5'};padding:10px;border-radius:12px;white-space:pre-wrap">${esc(m.text)}</div>`).join(''):'<p class="page-subtitle">Text “Hi”, “I need an appointment”, or a business FAQ to get started.</p>'}</div>
 <form id="sms-demo-form" style="display:flex;gap:8px;margin-top:12px"><input id="sms-demo-input" style="flex:1;min-width:130px" placeholder="Type a sample text..." required maxlength="1400"><button class="primary-btn">Send</button></form>
 <p class="preview-note">This preview uses the website chat engine. Actual SMS uses the signed Twilio webhook, a unique sender phone number, and numbered service/time choices.</p></div></section>
 <section class="panel"><div class="panel-titlebar"><h3>Launch checklist</h3></div><div class="panel-body">${[['Production mode',on],['Google OAuth credentials',i.oauth_ready.google],['Microsoft OAuth credentials',i.oauth_ready.microsoft],['Twilio authentication token',i.sms_ready],['Calendar connected',!!provider],['SMS number mapped',!!num]].map(([label,yes])=>`<div class="guide-line"><span class="guide-dot">${yes?'✓':'·'}</span><span>${esc(label)}</span></div>`).join('')}<p class="preview-note">Connections are disabled in the public/demo configuration. Each customer requires a private, appropriately secured business environment.</p></div></section>
 </div></div>`;
}
function wireIntegrations(){
 if(state.page!=='integrations'||!state.integrations)return;
 $$('[data-connect]').forEach(b=>b.addEventListener('click',async()=>{
  try{const res=await api(`/businesses/${state.businessId}/calendar/${b.dataset.connect}/connect`,{method:'POST'});
   window.open(res.authorize_url,'bizbug_calendar_oauth','width=600,height=780');notify('Approve access in the provider window, then refresh this page.');
  }catch(e){notify(e.message)}
 }));
 $('#disconnect-calendar')?.addEventListener('click',async()=>{
  if(!confirm('Disconnect this business calendar? Future requests will not be auto-confirmed.'))return;
  try{await api(`/businesses/${state.businessId}/calendar`,{method:'DELETE'});await loadIntegrations();await loadDashboard();notify('Calendar disconnected');}catch(e){notify(e.message)}
 });
 $('#booking-config-form')?.addEventListener('submit',async e=>{
  e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));v.duration_min=Number(v.duration_min);
  try{await api(`/businesses/${state.businessId}/booking-config`,{method:'PUT',body:JSON.stringify(v)});await loadIntegrations();notify('Booking settings saved');}catch(e){notify(e.message)}
 });
 $('#sms-number-form')?.addEventListener('submit',async e=>{
  e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));
  try{await api(`/businesses/${state.businessId}/sms-number`,{method:'PUT',body:JSON.stringify(v)});await loadIntegrations();notify('Twilio number mapped to this business');}catch(e){notify(e.message)}
 });
 $('#remove-sms')?.addEventListener('click',async()=>{
  try{await api(`/businesses/${state.businessId}/sms-number`,{method:'DELETE'});await loadIntegrations();notify('Number unassigned');}catch(e){notify(e.message)}
 });
 $('#sms-demo-form')?.addEventListener('submit',async e=>{
  e.preventDefault();const input=$('#sms-demo-input');const val=input.value.trim();if(!val)return;input.value='';
  const selection=/^\d+$/.test(val)?state.smsDemoOptions[Number(val)-1]:null;
  state.smsDemoMessages.push({role:'user',text:val});
  try{const res=await api(`/businesses/${state.businessId}/chat`,{method:'POST',body:JSON.stringify({message:selection||val,session_id:state.smsDemoSession})});
   state.smsDemoSession=res.session_id;state.smsDemoOptions=res.options||[];
   const labels=state.smsDemoOptions.map((o,n)=>`${n+1}. ${o.startsWith('SERVICE::')?o.slice(9):o.startsWith('SLOT::')?new Date(o.slice(6)).toLocaleString():o}`);
   state.smsDemoMessages.push({role:'assistant',text:res.reply+(labels.length?'\n\n'+labels.join('\n'):'')});
   render();
  }catch(e){state.smsDemoMessages.push({role:'assistant',text:'Error: '+e.message});render();}
 });
}

function render(){if(!state.data)return;sideBar();let html={'overview':mainOverview,'leads':leadsPage,'appointments':appointmentsPage,'knowledge':knowledgePage,'settings':settingsPage,'integrations':integrationsPage}[state.page]();$('#page-content').innerHTML=html;wirePage();}
function wirePage(){$$('[data-goto]').forEach(btn=>btn.addEventListener('click',()=>switchPage(btn.dataset.goto)));
 $$('[data-followup]').forEach(btn=>btn.addEventListener('click',()=>openFollowup(btn.dataset.followup)));
 $('#chat-form')?.addEventListener('submit',async e=>{e.preventDefault();const val=$('#chat-input').value.trim();if(!val||state.busy)return;$('#chat-input').value='';await sendChat(val);});
 $$('#chat-options [data-send]').forEach(btn=>btn.addEventListener('click',()=>sendChat(btn.dataset.send)));
 $('#reset-chat')?.addEventListener('click',()=>resetChat());
 $('#spanish-toggle')?.addEventListener('click',()=>{state.language=state.language==='es'?'en':'es';resetChat(true);});
 $('#settings-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=Object.fromEntries(new FormData(e.currentTarget));form.services=(form.services||'').split(/[,\n]/).map(s=>s.trim()).filter(Boolean);try{await api(`/businesses/${state.businessId}/settings`,{method:'PUT',body:JSON.stringify(form)});notify('Business settings saved');await loadBusiness();}catch(e){notify(e.message)}});
 $('#knowledge-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api(`/businesses/${state.businessId}/settings`,{method:'PUT',body:JSON.stringify({knowledge:$('#knowledge-text').value})});notify('Business knowledge saved');await loadDashboard();}catch(e){notify(e.message)}});
 $('#add-faq-button')?.addEventListener('click',faqModal);
 wireIntegrations();
 $('#copy-embed')?.addEventListener('click',async()=>{const code=`<script src="${location.origin}/widget.js" data-business="${state.businessId}" async></scr`+'ipt>';await navigator.clipboard.writeText(code);notify('Embed code copied!')});}
async function sendChat(raw){if(state.busy)return;state.busy=true;state.chatMessages.push({role:'user',text:chipLabel(raw)});state.chatOptions=[];refreshChatOnly();const b=state.businessId;
 try{const result=await api(`/businesses/${b}/chat`,{method:'POST',body:JSON.stringify({message:raw,session_id:state.sessionId})});if(b!==state.businessId)return;
 state.sessionId=result.session_id;state.language=result.language;state.chatMessages.push({role:'assistant',text:result.reply});state.chatOptions=result.options||[];
 if(!result.stage)await loadDashboard();else refreshChatOnly();}
 catch(e){state.chatMessages.push({role:'assistant',text:'Sorry, that request could not be completed. '+e.message});refreshChatOnly();}
 finally{state.busy=false;refreshChatOnly();}}
function refreshChatOnly(){if(state.page!=='overview')return;const temp=chatCard();const existing=$('.chat-panel');if(!existing)return;existing.outerHTML=temp;
 $('#chat-form')?.addEventListener('submit',async e=>{e.preventDefault();const val=$('#chat-input').value.trim();if(!val||state.busy)return;$('#chat-input').value='';await sendChat(val);});
 $$('#chat-options [data-send]').forEach(btn=>btn.addEventListener('click',()=>sendChat(btn.dataset.send)));
 $('#reset-chat')?.addEventListener('click',()=>resetChat());
 $('#spanish-toggle')?.addEventListener('click',()=>{state.language=state.language==='es'?'en':'es';resetChat(true)});
 const surface=$('#chat-messages');if(surface)surface.scrollTop=surface.scrollHeight;}
function resetChat(keepLanguage=false){state.sessionId=null;state.chatMessages=[];state.chatOptions=[];if(!keepLanguage)state.language='en';refreshChatOnly();}
function modal(title,content){const el=document.createElement('div');el.className='modal-backdrop';el.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close" aria-label="Close">×</button></div><div class="modal-body">${content}</div></div>`;document.body.appendChild(el);
 el.addEventListener('click',e=>{if(e.target===el||e.target.closest('.modal-close'))el.remove()});return el;}
function showTokenModal(){if($('.modal-backdrop'))return;const m=modal('Dashboard access',`<p class="page-subtitle" style="margin-bottom:18px">Enter the ADMIN_TOKEN configured on your server. This is needed to see private business records.</p><form id="token-form"><div class="field"><label>Admin access token</label><input id="token-input" type="password" required autocomplete="off"></div><button class="primary-btn">Unlock dashboard</button></form>`);
 $('#token-form',m).addEventListener('submit',async e=>{e.preventDefault();state.token=$('#token-input',m).value;try{sessionStorage.setItem('bizbug_admin',state.token);}catch{}m.remove();await loadDashboard();});}
function newBusinessModal(){const m=modal('Create a business assistant',`<p class="page-subtitle" style="margin-bottom:18px">Give a prospective client their own profile and then add their FAQs, policies, and greetings.</p><form id="create-business-form"><div class="field"><label>Business name</label><input name="name" required placeholder="e.g. Hometown Plumbing"></div><div class="field"><label>Industry</label><select name="category"><option>Home services</option><option>Beauty & wellness</option><option>Automotive</option><option>Real estate</option><option>Restaurants</option><option>Healthcare administration</option><option>Other small business</option></select></div><div class="two-col-form"><div class="field"><label>Business email</label><input type="email" name="email" placeholder="contact@example.com"></div><div class="field"><label>Hours</label><input name="hours" placeholder="Mon–Fri 9–5"></div></div><div class="field"><label>Location</label><input name="location" placeholder="Your city and state"></div><button class="primary-btn">Create assistant →</button></form>`);
 $('#create-business-form',m).addEventListener('submit',async e=>{e.preventDefault();try{const payload=Object.fromEntries(new FormData(e.currentTarget));const res=await api('/businesses',{method:'POST',body:JSON.stringify(payload)});m.remove();notify('New business assistant created');await loadBusiness();await switchBusiness(res.id);switchPage('settings');}catch(err){notify(err.message)}});}
function faqModal(){const m=modal('Add a business FAQ',`<form id="faq-form"><div class="field"><label>Customer question</label><input required name="question" placeholder="Do you offer free estimates?"></div><div class="field"><label>Answer (English)</label><textarea required name="answer" placeholder="Our estimates are free for local residents..."></textarea></div><div class="field"><label>Answer (Spanish, optional)</label><textarea name="answer_es" placeholder="Ofrecemos presupuestos gratuitos..."></textarea></div><div class="field"><label>Keywords (to improve demo matching)</label><input name="keywords" placeholder="estimate free quote price presupuesto"></div><button class="primary-btn">Add answer</button></form>`);
 $('#faq-form',m).addEventListener('submit',async e=>{e.preventDefault();try{await api(`/businesses/${state.businessId}/faqs`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});m.remove();notify('FAQ added');await loadDashboard();}catch(err){notify(err.message)}});}
async function openFollowup(id){try{const res=await api(`/businesses/${state.businessId}/followup`,{method:'POST',body:JSON.stringify({lead_id:Number(id)})});const text=`To: ${res.to}\nSubject: ${res.subject}\n\n${res.body}`;
 const m=modal('Follow-up email draft',`<div class="info-strip warning">This is a draft only. No email has been sent.</div><div class="field"><label>Draft message</label><textarea id="followup-text" rows="13" readonly>${esc(text)}</textarea></div><button class="primary-btn" id="copy-followup">Copy draft</button>`);
 $('#copy-followup',m).addEventListener('click',async()=>{await navigator.clipboard.writeText(text);notify('Draft copied. Paste it in your email app.');});}catch(e){notify(e.message)}}
function startup(){const dt=new Date();$('#today-date').textContent=dt.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
 $('#workspace-picker').addEventListener('click',()=>$('#workspace-menu').classList.toggle('hidden'));
 document.addEventListener('click',e=>{if(!e.target.closest('#workspace-picker')&&!e.target.closest('#workspace-menu'))hideMenu();});
 $$('.nav-link').forEach(n=>n.addEventListener('click',()=>switchPage(n.dataset.page)));
 $('#admin-access').addEventListener('click',showTokenModal);
 loadBusiness().catch(e=>{$('#page-content').textContent='Unable to start: '+e.message;});}
startup();
