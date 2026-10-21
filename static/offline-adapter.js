/* LocalStorage demo API: runs the BizBug interface in one offline HTML file.
   All leads & requests are saved on this computer only. No external integrations.
*/
(function(){
 'use strict';
 const seed=__INITIAL_DATA__;
 const cacheKey='bizbug_offline_v2';
 function fresh(){return {businesses:seed.businesses.map(x=>({...x})),leads:structuredClone(seed.leads),appointments:{},faqs:structuredClone(seed.faqs),activities:structuredClone(seed.activities),chats:{},sessions:{}};}
 let data;try{data=JSON.parse(localStorage.getItem(cacheKey))||fresh()}catch{data=fresh()}
 const save=()=>{try{localStorage.setItem(cacheKey,JSON.stringify(data))}catch{}};
 const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 const err=(message,status=400)=>respond({detail:message},status);
 const date=()=>new Date().toISOString();
 const normalized=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').trim();
 const f_email=s=>{let x=String(s).match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);return x?x[0].toLowerCase():null};
 const inSpanish=(s,old)=>/[¿¡áéíóúñ]|\b(hola|quiero|necesito|cuanto|precio|cita|horario|gracias|español|reservar|nombre|correo|mañana|corte)\b/i.test(s)?'es':/\b(hello|hi|book|appointment|english)\b/i.test(s)?'en':old;
 const translate=(en,es,lang)=>lang==='es'?es:en;
 const activities=(bid,kind,description)=>{(data.activities[bid]??=[]).unshift({id:Date.now(),business_id:bid,kind,description,created_at:date()});};
 const slotOptions=()=>{let out=[];const d=new Date();for(let i=1;i<11;i++){const x=new Date(d);x.setDate(x.getDate()+i);if(x.getDay()===0||x.getDay()===6)continue;for(const h of [10,11,14,15]){x.setHours(h,0,0,0);out.push('SLOT::'+[x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-')+'T'+String(h).padStart(2,'0')+':00:00');if(out.length>=6)return out;}}return out};
 const business=id=>data.businesses.find(b=>b.id===id);
 const dashboard=id=>{const b=business(id);if(!b)return null;return {business:b,leads:data.leads[id]||[],appointments:data.appointments[id]||[],faqs:data.faqs[id]||[],activities:data.activities[id]||[],stats:{conversations:data.chats[id]||0,leads:(data.leads[id]||[]).length,requests:(data.appointments[id]||[]).length,faqs:(data.faqs[id]||[]).length},ai_enabled:false,demo_mode:true,calendar_connected:false}};
 function chat(id,body){const b=business(id),faqs=data.faqs[id]||[];if(!b)return err('Business not found',404);
 let sid=(body.session_id&&data.sessions[body.session_id])?body.session_id:null;
 if(!sid){sid=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():'offline-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);data.sessions[sid]={bid:id,stage:'',state:{},lang:'en'};data.chats[id]=(data.chats[id]||0)+1;}
 const ss=data.sessions[sid];if(ss.bid!==id)return err('Session does not belong to this business',403);
 const text=String(body.message||'').trim().slice(0,1400),low=normalized(text);if(!text)return err('Empty message');ss.lang=inSpanish(text,ss.lang);const L=ss.lang;let answer='',options=[];
 const e=(en,es)=>translate(en,es,L);
 const ask={
  'booking.service':()=>{const service=text.replace('SERVICE::','').trim();if(b.services.some(v=>v.toLowerCase()===service.toLowerCase())){ss.state.service=b.services.find(v=>v.toLowerCase()===service.toLowerCase());ss.stage='booking.slot';options=slotOptions();return e('Select a preferred demo request time. Times are NOT verified calendar availability.','Elige un horario de demostración. La disponibilidad no está verificada.')}options=b.services.map(x=>'SERVICE::'+x);return e('Choose a service below:','Elige un servicio:');},
  'booking.slot':()=>{if(text.startsWith('SLOT::')&&slotOptions().includes(text)){ss.state.slot=text.slice(6);ss.stage='booking.name';return e('Great! What name should we use for the appointment request?','¡Muy bien! ¿A nombre de quién registramos la solicitud?')}options=slotOptions();return e('Please select a demo request slot:','Elige un horario de demostración:');},
  'booking.name':()=>{const name=text.replace(/^(my name is|me llamo|soy|i am)\s+/i,'').trim();if(name.length<2)return e('What name should I use?','¿Cuál es tu nombre?');ss.state.name=name;ss.stage='booking.email';return e('And what email should we contact?','¿Y a qué correo podemos contactarte?');},
  'booking.email':()=>{const email=f_email(text);if(!email)return e('Please enter a valid email.','Por favor, escribe un correo válido.');const a={id:Date.now(),business_id:id,name:ss.state.name,email,service:ss.state.service,starts_at:ss.state.slot,status:'requested',created_at:date()};(data.appointments[id]??=[]).unshift(a);(data.leads[id]??=[]).unshift({id:Date.now()+1,business_id:id,name:a.name,email,phone:'',source:'assistant',note:'Appointment request: '+a.service,created_at:date()});activities(id,'appointment','Appointment request from '+a.name+' for '+a.service);ss.stage='';ss.state={};return e('Your appointment REQUEST has been saved. This is not a confirmed booking. The business must confirm the time with you.','Se registró tu SOLICITUD de cita. No está confirmada. El negocio debe comunicarse contigo para confirmarla.');},
  'lead.name':()=>{const name=text.replace(/^(my name is|me llamo|soy|i am)\s+/i,'').trim();if(name.length<2)return e('What is your name?','¿Cómo te llamas?');ss.state.name=name;ss.stage='lead.email';return e('What is your email address?','¿Cuál es tu correo electrónico?');},
  'lead.email':()=>{const email=f_email(text);if(!email)return e('Please enter a valid email address.','Ingresa un correo válido.');ss.state.email=email;ss.stage='lead.phone';options=L==='es'?['Omitir']:['Skip phone'];return e('Would you like to leave a phone number? You can type skip.','¿Quieres dejar un teléfono? Puedes escribir omitir.');},
  'lead.phone':()=>{if(['skip','skip phone','omitir','no'].includes(normalized(text))){ss.state.phone='';}else{const number=text.replace(/[^0-9+()\-]/g,'').slice(0,30);if(number.replace(/\D/g,'').length<7)return e('Please enter a phone number or skip.','Escribe un teléfono o escribe omitir.');ss.state.phone=number;}ss.stage='lead.note';return e('What would you like help with?','¿En qué necesitas ayuda?');},
  'lead.note':()=>{(data.leads[id]??=[]).unshift({id:Date.now(),business_id:id,name:ss.state.name,email:ss.state.email,phone:ss.state.phone||'',source:'assistant',note:text,created_at:date()});activities(id,'lead','New lead: '+ss.state.name+' asked about '+text.slice(0,72));ss.state={};ss.stage='';return e('Thanks! I saved your message and contact information for the team. Anything else?','¡Gracias! Guardé tus datos y mensaje para el equipo. ¿Algo más?');}
 };
 if(['cancel','start over','cancelar','reiniciar'].includes(low)){ss.stage='';ss.state={};answer=e('No problem. How can I help?','Sin problema. ¿Cómo te ayudo?');}
 else if(ask[ss.stage])answer=ask[ss.stage]();
 else if(/\b(appointment|book|booking|schedule|cita|agendar|reservar)\b/i.test(low)){ss.stage='booking.service';answer=e('Sure! Which service would you like?','¡Claro! ¿Qué servicio deseas?');options=b.services.map(s=>'SERVICE::'+s);}
 else if(/(leave a message|call me|contact me|estimate|quote|presupuesto|cotizacion|dejar mensaje|someone contact|talk to a person)/i.test(low)){ss.stage='lead.name';answer=e('Happy to help. What is your name?','Con gusto. ¿Cómo te llamas?');}
 else if(/^(hi|hello|hey|hola|buenos dias)/i.test(low)){answer=L==='es'?b.greeting_es:b.greeting;options=L==='es'?['Solicitar cita','Dejar mensaje']:['Book appointment','Leave a message'];}
 else {const terms=low.split(/\s+/).filter(t=>t.length>2&&!['the','are','how','what','you','with','for','que','los','las','como','donde','much','does'].includes(t));let best,score=0;for(const q of faqs){const corpus=normalized(q.question+' '+(q.keywords||''));const hits=terms.filter(t=>corpus.split(' ').includes(t)).length;if(hits>score){score=hits;best=q;}}
 if(best&&score>0)answer=L==='es'?(best.answer_es||best.answer):best.answer;
 else if(terms.some(t=>normalized(b.knowledge).includes(t))){answer=b.knowledge;}
 else{answer=e("I don't have a verified answer to that. I can save your contact details for a follow-up or take an appointment request.",
 "No tengo una respuesta verificada. Puedo guardar tus datos para que el equipo te contacte o registrar una solicitud de cita.");options=L==='es'?['Dejar mensaje','Solicitar cita']:['Leave a message','Book appointment'];}}
 save();return respond({session_id:sid,reply:answer,options,stage:ss.stage,language:L,calendar_connected:false});
 }
 async function router(url,opts={}){const parsed=new URL(url,location.href);if(!parsed.pathname.startsWith('/api/'))return window.__nativeFetch(url,opts);
 const seg=parsed.pathname.split('/').filter(Boolean),method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):{};
 if(seg[1]==='businesses'&&seg.length===2){if(method==='GET')return respond(data.businesses.map(b=>Object.fromEntries(['id','name','category','initials','accent','tagline','hours','location','greeting','greeting_es','services'].map(k=>[k,b[k]]))));
 if(method==='POST'){const id='biz-'+Math.random().toString(36).slice(2,10),name=body.name||'New business';const b={id,name,category:body.category||'Other',initials:name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase(),accent:'#7c74d7',tagline:body.tagline||'Here to help, any time.',email:body.email||'',hours:body.hours||'By appointment',location:body.location||'',greeting:'Hi! Welcome to '+name+'. How can I help?',greeting_es:'¡Hola! Bienvenido a '+name+'. ¿Cómo te puedo ayudar?',services:['Consultation'],knowledge:'Add business facts under Knowledge.'};data.businesses.push(b);data.faqs[id]=[];save();return respond({id});}}
 if(seg[1]==='businesses'&&seg.length>=3){const id=seg[2],b=business(id);if(!b)return err('Not found',404);
 if(seg.length===3&&method==='GET')return respond(b);
 if(seg[3]==='dashboard')return respond(dashboard(id));
 if(seg[3]==='integrations'&&method==='GET')return respond({calendar:null,sms:null,
   booking:{timezone:'America/New_York',duration_min:60},
   oauth_ready:{google:false,microsoft:false},sms_ready:false,production_mode:false,webhook_url:null});
 if(seg[3]==='chat'&&method==='POST')return chat(id,body);
 if(seg[3]==='settings'&&method==='PUT'){for(const key of ['name','tagline','email','hours','location','greeting','greeting_es','knowledge','services','accent'])if(key in body)b[key]=body[key];save();return respond({ok:true});}
 if(seg[3]==='faqs'&&method==='POST'){(data.faqs[id]??=[]).push({id:Date.now(),business_id:id,...body});save();return respond({ok:true});}
 if(seg[3]==='followup'&&method==='POST'){const l=(data.leads[id]||[]).find(l=>l.id===body.lead_id);if(!l)return err('Lead not found',404);return respond({to:l.email,subject:'Following up from '+b.name,body:'Hi '+l.name.split(' ')[0]+',\n\nThanks for contacting '+b.name+'! I wanted to follow up about '+l.note+'. Do you have any questions or a good time for us to reach you?\n\nThank you,\n'+b.name,sent:false});}}
 return err('Not found',404);
 }
 window.__nativeFetch=window.fetch.bind(window);window.fetch=router;
})();
