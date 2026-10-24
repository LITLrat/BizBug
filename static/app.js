/* BizBug demo assistant. No framework or build step required. */
const $=(sel,base=document)=>base.querySelector(sel);
const $$=(sel,base=document)=>[...base.querySelectorAll(sel)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const viewText=s=>esc(s).replace(/\*\*(.*?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
let storedAdminToken='';try{storedAdminToken=sessionStorage.getItem('bizbug_admin')||'';}catch{}
function readDemoPreference(key,fallback=''){try{return localStorage.getItem(key)??fallback;}catch{return fallback;}}
function saveDemoPreference(key,value){try{localStorage.setItem(key,value);}catch{}}
const state={businesses:[],businessId:'bloom',page:'overview',data:null,chatMessages:[],sessionId:null,busy:false,language:'en',chatOptions:[],token:storedAdminToken,integrations:null,smsDemoSession:null,smsDemoMessages:[],smsDemoOptions:[],conversations:null,theme:readDemoPreference('bizbug.theme','fern'),uiLanguage:(readDemoPreference('bizbug.uiLanguage')==='es'?'es':'en')};
const icons={chat:'🗣',lead:'✓',appointment:'🗓',faq:'?',activity:'✦'};
const dateFmt=s=>{if(!s)return '—';try{return new Date(s).toLocaleDateString(state.uiLanguage==='es'?'es-ES':undefined,{month:'short',day:'numeric',year:'numeric'});}catch{return s;}};
const timeFmt=s=>{if(!s)return '—';try{return new Date(s).toLocaleString(state.uiLanguage==='es'?'es-ES':undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return s;}};
const short=s=>(s||'').length>74?(s.slice(0,72)+'…'):s;
const current=()=>state.businesses.find(b=>b.id===state.businessId)||state.businesses[0]||{};
const themeNames={fern:'Fern',ocean:'Ocean',plum:'Plum',sunset:'Sunset'};
function applyTheme(theme){state.theme=themeNames[theme]?theme:'fern';document.body.setAttribute('data-theme',state.theme);saveDemoPreference('bizbug.theme',state.theme);const meta=document.querySelector('meta[name="theme-color"]');if(meta){const colors={fern:'#162930',ocean:'#102733',plum:'#24162b',sunset:'#2f1f1a'};meta.setAttribute('content',colors[state.theme]||'#162930');}$$('[data-theme-set]').forEach(btn=>btn.classList.toggle('active',btn.dataset.themeSet===state.theme));}
function wireThemeControls(base=document){base.querySelectorAll('[data-theme-set]').forEach(btn=>{btn.onclick=()=>applyTheme(btn.dataset.themeSet);btn.classList.toggle('active',btn.dataset.themeSet===state.theme);});}

const spanishLabels={
 "Workspace": "Área De Trabajo",
 "Your Workspace": "Tu Espacio De Trabajo",
 "Overview": "Resumen",
 "Leads & Contacts": "Clientes Potenciales Y Contactos",
 "Appointments": "Citas",
 "Knowledge Base": "Base De Conocimientos",
 "Business Setup": "Configuración Del Negocio",
 "Calendar & SMS": "Calendario Y SMS",
 "Administrative Access": "Acceso Administrativo",
 "Demo Environment": "Entorno De Demostración",
 "Offline demo · this device only": "Demostración Sin Conexión · Solo Este Dispositivo",
 "Theme": "Tema",
 "Welcome Back": "Bienvenido De Nuevo",
 "Your Assistant, At A Glance": "Tu Asistente De Un Vistazo",
 "Meet your next employee of the month. Available 24/7. No coffee breaks.": "Conoce A Tu Próximo Empleado Del Mes. Disponible Las 24 Horas, Los 7 Días. Sin Pausas Para Café.",
 "Interactive demo": "Demostración Interactiva",
 "MADE FOR SMALL BUSINESS": "CREADO PARA PEQUEÑOS NEGOCIOS",
 "Let’s Keep Your Business Buzzing": "Mantengamos Tu Negocio Activo",
 "Capture a lead, manage conversations, send an appointment request and more. Everything you do appears in the owner dashboard.": "Cambia De Tipo De Negocio, Haz Preguntas, Capta Clientes Potenciales Y Solicita Una Cita. Todo Aparece En El Panel De Control.",
 "Conversations": "Conversaciones",
 "Leads Captured": "Clientes Potenciales Captados",
 "Appointment Requests": "Solicitudes De Citas",
 "Knowledge Answers": "Respuestas De La Base De Conocimientos",
 "Started through the assistant": "Iniciadas Con El Asistente",
 "Includes labeled sample data": "Incluye Datos De Ejemplo",
 "Pending human confirmation": "Pendientes De Confirmación",
 "Configured FAQ responses": "Respuestas Frecuentes Configuradas",
 "Customize This Assistant": "Personaliza Este Asistente",
 "Four quick ways to make it your own": "Cuatro Formas Sencillas De Personalizarlo",
 "Train your assistant": "Entrena Tu Asistente",
 "Add services, FAQs & business facts": "Agrega Servicios, Preguntas Frecuentes Y Datos Del Negocio",
 "Review captured leads": "Revisa Los Clientes Captados",
 "See details from real demo chats": "Consulta Los Detalles De Las Conversaciones",
 "View customer requests": "Consulta Las Solicitudes De Los Clientes",
 "Personalize the brand": "Personaliza La Marca",
 "Change business name & greeting": "Cambia El Nombre Y El Saludo",
 "Recent Activity": "Actividad Reciente",
 "Leads and requests captured by the assistant": "Clientes Y Solicitudes Captadas Por El Asistente",
 "View leads ↗": "Ver Clientes ↗",
 "Your Suggested Next Actions": "Próximas Acciones Sugeridas",
 "Small daily tasks generated from the dashboard": "Tareas Diarias Sugeridas",
 "Live Assistant Playground": "Área De Pruebas Del Asistente",
 "Try it as your customer would": "Pruébalo Como Lo Haría Un Cliente",
 "Try me": "Pruébame",
 "Virtual assistant · Always available": "Asistente Virtual · Siempre Disponible",
 "Online": "En Línea",
 "Ask a question or type a message...": "Haz Una Pregunta O Escribe Un Mensaje...",
 "Demo assistant · Appointments are requests until confirmed by the business": "Asistente De Demostración · Las Citas Son Solicitudes Hasta Su Confirmación",
 "Reset Chat": "Reiniciar Chat",
 "What are your hours?": "¿Cuál Es Su Horario?",
 "Book appointment": "Reservar Cita",
 "Leave a message": "Dejar Un Mensaje",
 "Customer pipeline": "Gestión De Clientes",
 "Every new conversation can become a customer relationship.": "Cada Conversación Puede Convertirse En Una Relación Con Un Cliente.",
 "Contact Inbox": "Bandeja De Contactos",
 "Live lead capture": "Captación De Clientes En Vivo",
 "Contact": "Contacto",
 "Email": "Correo Electrónico",
 "Interested in": "Interesado En",
 "Date": "Fecha",
 "Status": "Estado",
 "Next step": "Próximo Paso",
 "Sample": "Ejemplo",
 "New lead": "Nuevo Cliente Potencial",
 "Draft follow-up": "Redactar Seguimiento",
 "No leads yet. Try leaving a message in the assistant.": "Todavía No Hay Clientes Potenciales. Intenta Dejar Un Mensaje Al Asistente.",
 "Client scheduling": "Programación De Clientes",
 "Appointments & requests": "Citas Y Solicitudes",
 "See which bookings were confirmed on the calendar and which require human follow-up.": "Consulta Qué Citas Están Confirmadas Y Cuáles Requieren Seguimiento.",
 "Customer Appointments": "Citas De Clientes",
 "Confirmed events and requests needing manual review": "Eventos Confirmados Y Solicitudes Pendientes De Revisión",
 "Customer": "Cliente",
 "Service": "Servicio",
 "Time": "Hora",
 "Submitted": "Enviada",
 "Confirmed": "Confirmada",
 "Request only": "Solo Solicitud",
 "No appointments yet. Use the assistant to start a booking.": "Aún No Hay Citas. Usa El Asistente Para Solicitar Una.",
 "Manage calendar →": "Administrar Calendario →",
 "Assistant Training": "Entrenamiento Del Asistente",
 "Give your assistant trusted answers about your services and business.": "Proporciona Respuestas Confiables Sobre Tus Servicios Y Tu Negocio.",
 "Frequently Asked Questions": "Preguntas Frecuentes",
 "Business Documents & Policies": "Documentos Y Políticas Del Negocio",
 "Saved Business Information": "Información Guardada Del Negocio",
 "Save knowledge": "Guardar Conocimientos",
 "What The Assistant Knows": "Lo Que Sabe El Asistente",
 "Add an FAQ": "Agregar Una Pregunta Frecuente",
 "Add New Question/Answer": "Agregar Nueva Pregunta/Respuesta",
 "Capture a lead, manage conversations, send an appointment request and more. Everything you do appears in the owner dashboard.": "Captura Un Cliente Potencial, Gestiona Conversaciones, Envía Una Solicitud De Cita Y Mucho Más. Todo Aparece En El Panel Del Propietario.",
 "No FAQs added yet.": "Todavía No Hay Preguntas Frecuentes.",
 "Make It Yours": "Hazlo Tuyo",
 "Customize the personality and details of this assistant.": "Personaliza La Personalidad Y Los Detalles De Este Asistente.",
 "Business Information Settings": "Configuración De La Información Del Negocio",
 "Displayed inside the chat assistant": "Se Muestra Dentro Del Asistente",
 "Business Name": "Nombre Del Negocio",
 "Location": "Ubicación",
 "Business Email": "Correo Electrónico Del Negocio",
 "Hours": "Horario",
 "Tagline": "Eslogan",
 "Brand Accent Color": "Color De La Marca",
 "Bookable Services (One Per Line)": "Servicios Reservables (Uno Por Línea)",
 "Greeting · English": "Saludo · Inglés",
 "Greeting · Spanish": "Saludo · Español",
 "Save business details": "Guardar Datos Del Negocio",
 "Install On A Website": "Instalar En Un Sitio Web",
 "Copy embed code": "Copiar Código Para Insertar",
 "Product Readiness": "Estado Del Producto",
 "Demo Color Scheme": "Combinación De Colores De La Demostración",
 "Switch the BizBug demo between a few palettes while you show it to prospects.": "Cambia Los Colores De BizBug Mientras Lo Presentas A Clientes.",
 "This changes the demo appearance only and helps you test different looks during sales conversations.": "Esta Opción Solo Cambia La Apariencia De La Demostración.",
 "Fern": "Verde",
 "Ocean": "Océano",
 "Plum": "Ciruela",
 "Sunset": "Atardecer",
 "Connect Your Tools": "Conecta Tus Herramientas",
 "Calendars & two-way SMS": "Calendarios Y Mensajes SMS",
 "Calendar booking": "Reservas En Calendario",
 "Show free times and create confirmed events": "Muestra Horarios Disponibles Y Confirma Eventos",
 "NOT CONNECTED": "SIN CONECTAR",
 "CONNECTED": "CONECTADO",
 "Launch Checklist": "Lista De Preparación",
 "SMS conversation simulator": "Simulador De Conversaciones SMS",
 "Twilio Number Assigned To This Business": "Número De Twilio Asignado A Este Negocio",
 "Send": "Enviar",
 "Save number": "Guardar Número",
 "Save booking settings": "Guardar Configuración De Citas",
 "Business Timezone (IANA)": "Zona Horaria Del Negocio (IANA)",
 "Appointment Length": "Duración De La Cita",
 "Connect Google Calendar": "Conectar Google Calendar",
 "Connect Microsoft Outlook / 365": "Conectar Microsoft Outlook / 365",
 "Add a business FAQ": "Agregar Pregunta Frecuente",
 "Customer Question": "Pregunta Del Cliente",
 "Answer (English)": "Respuesta",
 "Keywords (To Improve Demo Matching)": "Palabras Clave (Para Mejorar Las Respuestas)",
 "Additional Keywords (Optional)": "Palabras Clave Adicionales (Opcional)",
 "Add answer": "Agregar Respuesta",
 "Follow-up email draft": "Borrador De Correo De Seguimiento",
 "Draft Message": "Borrador De Mensaje",
 "Copy draft": "Copiar Borrador",
 "Dashboard access": "Acceso Al Panel",
 "Enter access token": "Introducir Código De Acceso",
 "Admin Access Token": "Código De Acceso Administrativo",
 "Unlock dashboard": "Desbloquear Panel",
 "Create a business assistant": "Crear Un Asistente Para Negocios",
 "Create assistant →": "Crear Asistente →",
 "Industry": "Sector",
 "Create a new business": "Crear Un Nuevo Negocio",
 "Try your own client profile": "Prueba Tu Propio Perfil",
 "Built for your next client.": "Listo Para Tu Próximo Cliente.",
 "Switch industries, test conversations, and show business owners the possibilities.": "Cambia De Sector, Prueba Conversaciones Y Muestra Las Posibilidades.",
 "Send Message": "Enviar Mensaje",
 "English + Español": "Inglés Y Español",
"SETUP":"CONFIGURACIÓN","TO-DO":"PENDIENTES","SIMULATION":"SIMULACIÓN","Live Assistant Playground":"Área De Pruebas Del Asistente","Sample contact":"Contacto De Ejemplo","Lead captured":"Cliente Potencial Captado","Review":"Revisar","Connect Your Tools":"Conecta Tus Herramientas","Calendars & Two-Way SMS":"Calendarios Y SMS Bidireccionales","Calendar Booking":"Reservas En Calendario","Two-Way SMS Assistant":"Asistente SMS Bidireccional","Customers Text A Business Number And Receive Replies":"Los Clientes Envían Mensajes Al Número Del Negocio Y Reciben Respuestas","NOT CONFIGURED":"SIN CONFIGURAR","SMS-Style Sales Demo":"Demostración Comercial Por SMS","Preview The Text Conversation Without Sending Actual Texts":"Previsualiza La Conversación Sin Enviar Mensajes Reales","Twilio Incoming-Message Webhook (POST)":"Webhook De Mensajes Entrantes De Twilio (POST)","Set PUBLIC_BASE_URL first":"Configura PUBLIC_BASE_URL Primero","30 minutes":"30 Minutos","45 minutes":"45 Minutos","60 minutes":"60 Minutos","90 minutes":"90 Minutos","120 minutes":"120 Minutos","These leads are stored in the local SQLite database. Entries marked “Sample” are fictional seed data. New leads collected in the playground appear here after refresh.":"Estos Contactos Se Guardan En La Base De Datos Local. Los Marcados Como “Ejemplo” Son Ficticios. Los Nuevos Contactos Aparecen Aquí Después De Actualizar.","No live calendar connected. The assistant collects unconfirmed appointment requests using sample request times.":"No Hay Un Calendario Conectado. El Asistente Recopila Solicitudes Sin Confirmar Con Horarios De Ejemplo.","Paste text from service menus, policies, rate sheets, or other business documents. The assistant uses the saved information as reference, not as instructions.":"Pega Texto De Menús De Servicios, Políticas, Tarifas U Otros Documentos Del Negocio. El Asistente Lo Usa Como Referencia, No Como Instrucciones.","Business name, hours, location, services, FAQs, and saved policies. Even without an AI API key, the assistant can find relevant words in FAQ answers and identify individual service prices. For deeper semantic matching, configure an OpenAI API key on the hosted server. The downloadable offline demo cannot call an AI model.":"Nombre, Horarios, Ubicación, Servicios, Preguntas Frecuentes Y Políticas Guardadas. Para Respuestas Flexibles Con IA, Configura Una Clave API De OpenAI En El Servidor. Sin Ella, La Demostración Usa Una Búsqueda Limitada De Preguntas Frecuentes.","✳ Your API keys stay on the server, never in the customer chat widget.":"✳ Las Claves API Se Mantienen En El Servidor Y Nunca En El Chat Del Cliente.","Put this snippet just before your website's closing body tag. Visitors will see a floating chat launcher.":"Coloca Este Código Antes De La Etiqueta De Cierre Del Sitio Web. Los Visitantes Verán Un Botón De Chat.","For a real client, configure their branding, admin access, privacy notice, and allowed website origins first.":"Para Un Cliente Real, Configura Primero Su Marca, Acceso Administrativo, Aviso De Privacidad Y Dominios Permitidos.","FAQs, Spanish chat, lead capture":"Preguntas Frecuentes, Chat En Español Y Captación De Clientes","Working demo":"Demostración Funcional","Customer appointment requests":"Solicitudes De Citas De Clientes","Email follow-up draft generator":"Generador De Borradores De Seguimiento Por Correo","OpenAI natural-language responses":"Respuestas En Lenguaje Natural Con OpenAI","Requires OPENAI_API_KEY":"Requiere OPENAI_API_KEY","Live calendar booking":"Reservas En Calendario En Vivo","Connect in Calendar & SMS":"Conectar En Calendario Y SMS","Two-way incoming SMS":"Mensajes SMS Entrantes Bidireccionales","Configure in Calendar & SMS":"Configurar En Calendario Y SMS","Individual business accounts":"Cuentas Individuales Para Negocios","Needs production login + tenancy":"Requiere Inicio De Sesión Seguro Y Separación Por Negocio","Connect each client’s own calendar and business texting number. Live connections require a secured, HTTPS-hosted server.":"Conecta El Calendario Y El Número De Mensajes De Cada Cliente. Las Conexiones Reales Requieren Un Servidor Seguro Con HTTPS.","Without a live connection, the assistant collects appointment requests only. Never presents demo times as confirmed.":"Sin Conexión Real, El Asistente Solo Recibe Solicitudes De Cita. Nunca Presenta Los Horarios De Prueba Como Confirmados.","One active booking calendar per business. Working hours currently use weekdays with morning and afternoon appointment windows. Existing events are checked before offering times.":"Se Utiliza Un Calendario Activo Por Negocio. Los Horarios Disponibles Se Basan En Días Laborables Y Se Revisan Los Eventos Existentes Antes De Ofrecer Citas.","Purchase and register an SMS-capable number in Twilio, then set its inbound webhook to the URL above. Messages are responded to in English or Spanish, and leads appear in this business’s dashboard. The app does not purchase or verify phone numbers for you.":"Compra Y Registra Un Número Compatible Con SMS En Twilio Y Configura Su Webhook En La Dirección Indicada. El Asistente Responde En Inglés O Español Y Los Contactos Aparecen En El Panel. La Aplicación No Compra Ni Verifica Números.","Text “Hi”, “I need an appointment”, or a business FAQ to get started.":"Escribe “Hola”, “Necesito Una Cita” O Una Pregunta Sobre El Negocio Para Comenzar.","This preview uses the website chat engine. Actual SMS uses the signed Twilio webhook, a unique sender phone number, and numbered service/time choices.":"Esta Vista Previa Utiliza El Motor De Chat Web. Los SMS Reales Utilizan El Webhook Firmado De Twilio Y El Número De Teléfono Del Cliente.","Production mode":"Modo De Producción","Google OAuth credentials":"Credenciales OAuth De Google","Microsoft OAuth credentials":"Credenciales OAuth De Microsoft","Twilio authentication token":"Token De Autenticación De Twilio","Calendar connected":"Calendario Conectado","SMS number mapped":"Número SMS Asignado","Connections are disabled in the public/demo configuration. Each customer requires a private, appropriately secured business environment.":"Las Conexiones Están Desactivadas En La Demostración Pública. Cada Cliente Necesita Un Entorno De Negocio Privado Y Seguro.","Add an FAQ":"Agregar Una Pregunta Frecuente","Add New Question/Answer":"Agregar Nueva Pregunta/Respuesta","Are you sure?":"¿Estás Seguro?"
};
function setUiLanguage(lang,{reset=true}={}){
 state.uiLanguage=lang==='es'?'es':'en';
 saveDemoPreference('bizbug.uiLanguage',state.uiLanguage);
 document.documentElement.lang=state.uiLanguage;
 document.querySelectorAll('[data-ui-language]').forEach(btn=>{let active=btn.dataset.uiLanguage===state.uiLanguage;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
 if(reset){state.sessionId=null;state.chatMessages=[];state.chatOptions=[];state.language=state.uiLanguage;}
}
function translateUi(root=document){
 if(state.uiLanguage!=='es')return;
 const skipped='.bubble,.msg-row,.faq-card b,.workspace-data,.workspace-option,.code-snippet,pre,.toast,.business-icon,.metric-value,.chat-avatar,.workspace-avatar';
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node;while(node=walk.nextNode()){
  const parent=node.parentElement;if(!parent||parent.closest(skipped))continue;
  const old=node.nodeValue,trimmed=old.trim();if(!trimmed)continue;
  let trans=spanishLabels[trimmed];if(!trans&&trimmed.startsWith('+ '))trans=spanishLabels[trimmed.slice(2)]?'+ '+spanishLabels[trimmed.slice(2)]:null;
  if(!trans){
   let m=trimmed.match(/^(\d+) contacts in this workspace$/);if(m)trans=`${m[1]} Contactos En Este Negocio`;
   m=trimmed.match(/^(\d+) ready-to-use answers$/);if(m)trans=`${m[1]} Respuestas Preparadas`;
   m=trimmed.match(/^(\d+) to review$/);if(m)trans=`${m[1]} Pendientes De Revisión`;
   m=trimmed.match(/^Review (\d+) unconfirmed appointment requests?$/i);if(m)trans=`Revisar ${m[1]} Solicitudes De Citas Sin Confirmar`;
   m=trimmed.match(/^Follow up with (\d+) new demo leads?$/i);if(m)trans=`Dar Seguimiento A ${m[1]} Clientes Potenciales Nuevos`;
   if(trimmed.startsWith('Open '))trans='Abrir '+({appointments:'Citas',leads:'Clientes Potenciales','knowledge base':'Base De Conocimientos'}[trimmed.slice(5).replace(' →','')]||trimmed.slice(5));

  }
  if(trans)node.nodeValue=old.replace(trimmed,trans);
 }
 for(const el of root.querySelectorAll?.('input[placeholder],textarea[placeholder],button[title],button[aria-label]')||[]){for(const attr of ['placeholder','title','aria-label']){const v=el.getAttribute(attr);if(v&&spanishLabels[v])el.setAttribute(attr,spanishLabels[v]);}}
}

function notify(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>t.classList.remove('show'),3500);}
async function api(path,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};if(state.token)headers.Authorization='Bearer '+state.token;
 const resp=await fetch('/api'+path,{...opts,headers});let data={};try{data=await resp.json();}catch{}
 if(!resp.ok){if(resp.status===401){showTokenModal();throw Error('Enter your dashboard access token to continue.');}throw Error(data.detail||'Request failed');}return data;}
function setBusinessColor(){document.documentElement.style.setProperty('--accent',current().accent||'#d17f83');}
async function loadBusiness(){const items=await api('/businesses');state.businesses=items;
 if(!items.some(b=>b.id===state.businessId))state.businessId=items[0]?.id;
 setBusinessColor();sideBar();await loadDashboard();}
async function loadDashboard(){try{state.data=await api('/businesses/'+state.businessId+'/dashboard');sideBar();render();}
 catch(e){$('#page-content').innerHTML=`<div class="panel panel-body"><h2>Dashboard Access</h2><p class="page-subtitle">${esc(e.message)}</p><br><button class="primary-btn" id="enter-token">Enter access token</button></div>`;$('#enter-token')?.addEventListener('click',showTokenModal);}}
function sideBar(){const b=current();$('#side-avatar').textContent=b.initials||'AI';$('#side-name').textContent=b.name||'Your business';$('#side-type').textContent=b.category||'';
 $('#nav-lead-count').textContent=state.data?.stats?.leads||'0';$('#breadcrumb').textContent=({'overview':'Overview','conversations':'Conversations','leads':'Leads & Contacts','pipeline':'Sales Pipeline','tasks':'Tasks & Follow-ups','reports':'CRM Reporting','appointments':'Appointments','knowledge':'Knowledge Base','settings':'Business Setup','integrations':'Calendar & SMS'})[state.page];
 $$('.nav-link').forEach(link=>link.classList.toggle('active',link.dataset.page===state.page));
 $('#workspace-menu').innerHTML=state.businesses.map(b=>`<button class="workspace-option" data-business="${esc(b.id)}"><span class="business-icon" style="background:${esc(b.accent)}">${esc(b.initials)}</span><span><b>${esc(b.name)}</b><small>${esc(b.category)}</small></span></button>`).join('')+`<button class="workspace-option" data-create="yes"><span class="business-icon" style="background:#3d756c">+</span><span><b>Create a new business</b><small>Try your own client profile</small></span></button>`;
 $('#workspace-menu').querySelectorAll('[data-business]').forEach(el=>el.addEventListener('click',()=>switchBusiness(el.dataset.business)));
 $('#workspace-menu').querySelector('[data-create]').addEventListener('click',()=>{hideMenu();newBusinessModal()});}
function hideMenu(){$('#workspace-menu').classList.add('hidden');}
async function switchBusiness(id){hideMenu();state.businessId=id;state.sessionId=null;state.chatMessages=[];state.chatOptions=[];state.smsDemoMessages=[];state.smsDemoSession=null;state.smsDemoOptions=[];state.conversations=null;state.integrations=null;state.language=state.uiLanguage;setBusinessColor();await loadDashboard();}
function switchPage(page){state.page=page;sideBar();render();if(page==='integrations')loadIntegrations();if(page==='conversations')loadConversations();window.scrollTo({top:0,behavior:'smooth'});}
function heading(eyebrow,title,subtitle,action=''){return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div>${action}</div>`;}
function metric(title,value,caption,icon,color='',destination='overview'){return `<button type="button" class="metric-card metric-link" data-goto="${destination}" aria-label="View ${esc(title)}"><div class="metric-top"><span>${title}</span><div class="metric-icon ${color}">${icon}</div></div><div class="metric-value">${value}</div><div class="metric-caption">${caption} <span aria-hidden="true">↗</span></div></button>`;}
function mainOverview(){const d=state.data,b=current(),s=d.stats;
 const quick=[['knowledge','?','Train your assistant','Add services, FAQs & business facts'],['leads','✓','Manage contacts','Open profiles and update your CRM'],['tasks','☑','Manage follow-ups','View overdue tasks and reminders'],['settings','⚙','Personalize the brand','Change business name & greeting']];
 const activities=(d.activities||[]).slice(0,5).map(a=>`<div class="activity"><span class="activity-symbol">${a.kind==='lead'?'✓':'🗓'}</span><div class="activity-details"><b>${esc(a.description)}</b><small>${dateFmt(a.created_at)} · ${a.kind==='lead'?'Lead captured':'Appointment requested'}</small></div></div>`).join('')||'<div class="empty">No recent activity yet. Try the assistant.</div>';
 return `${heading('Welcome Back','Your Assistant, At A Glance','Meet your next employee of the month. Available 24/7. No coffee breaks.','<span class="live-label">Interactive demo</span>')}
 <section class="top-hero"><div class="hero-text"><div class="eyebrow">MADE FOR SMALL BUSINESS</div><h2>Let’s Keep Your Business Buzzing</h2><p>Capture a lead, manage conversations, send an appointment request and more. Everything you do appears in the owner dashboard.</p></div><div class="hero-art"><div class="art-chat"><div class="art-bubble short"></div><div class="art-bubble"></div><div class="art-bubble answer"></div><div class="art-bubble short"></div></div><div class="art-circle">🐞</div></div></section>
 <div class="stats-grid">${metric('Conversations',s.conversations,'Started through the assistant','🗣','','conversations')}${metric('Leads Captured',s.leads,'Includes labeled sample data','✓','lilac','leads')}${metric('Appointment Requests',s.requests,'Pending human confirmation','🗓','cream','appointments')}${metric('Knowledge Answers',s.faqs,'Configured FAQ responses','?','pink','knowledge')}</div>
 <div class="crm-dashboard-jump"><button data-goto="pipeline">Sales Pipeline ↗</button><button data-goto="tasks">Tasks & Follow-ups (${crmData().open_tasks} open) ↗</button><button data-goto="reports">CRM Reporting ↗</button></div>
 <div class="main-grid"><div class="column-stack"><section class="panel"><div class="panel-titlebar"><div><h3>Customize This Assistant</h3><p>Four quick ways to make it your own</p></div><span class="micro">SETUP</span></div><div class="action-grid">${quick.map(x=>`<button class="action-card" data-goto="${x[0]}"><span class="action-icon">${x[1]}</span><span><b>${x[2]}</b><small>${x[3]}</small></span></button>`).join('')}</div></section>
 <section class="panel"><div class="panel-titlebar"><div><h3>Recent Activity</h3><p>Leads and requests captured by the assistant</p></div><button class="inline-btn" data-goto="leads">View leads ↗</button></div><div class="activity-list">${activities}</div></section>
 <section class="panel"><div class="panel-titlebar"><div><h3>Your Suggested Next Actions</h3><p>Small daily tasks generated from the dashboard</p></div><span class="micro">TO-DO</span></div><div class="panel-body">${[
 [String(d.appointments.filter(a=>a.status!=='confirmed').length),`Review ${d.appointments.filter(a=>a.status!=='confirmed').length} unconfirmed appointment request${d.appointments.filter(a=>a.status!=='confirmed').length===1?'':'s'}`,'appointments'],
 [String(d.leads.filter(l=>l.source!=='sample').length),`Follow up with ${d.leads.filter(l=>l.source!=='sample').length} new demo lead${d.leads.filter(l=>l.source!=='sample').length===1?'':'s'}`,'leads'],
 ['✦','Keep FAQs and service details current','knowledge']].map(([count,description,dest])=>`<button class="action-card" data-goto="${dest}" style="width:100%;margin-bottom:9px"><span class="guide-dot">${count}</span><span><b>${description}</b><small>Open ${dest==='knowledge'?'knowledge base':dest} →</small></span></button>`).join('')}</div></section></div>
 <div>${chatCard()}</div></div>`;}
function chipLabel(raw){if(raw.startsWith('SERVICE::'))return raw.slice(9);if(raw.startsWith('SLOT::')){try{return new Date(raw.slice(6)).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return raw.slice(6)}}return raw;}
function visibleChatOptions(){
 // The default prompts are conversation starters, not replies to follow-up questions.
 if(state.chatOptions.length)return state.chatOptions;
 if(state.chatMessages.some(m=>m.role==='user'))return [];
 return state.uiLanguage==='es'?['¿Cuál es su horario?','Solicitar cita','Dejar mensaje']:['What are your hours?','Book appointment','Leave a message'];
}
function chatCard(){const b=current();if(!state.chatMessages.length)state.chatMessages=[{role:'assistant',text:state.uiLanguage==='es'?b.greeting_es:b.greeting}];
 const options=visibleChatOptions();
 return `<section class="panel chat-panel"><div class="panel-titlebar"><div><h3>Live Assistant Playground</h3><p>Try it as your customer would</p></div><span class="live-label">Try me</span></div>
 <div class="chat-header"><div class="chat-avatar">${esc(b.initials)}</div><div><strong>${esc(b.name)}</strong><small><span class="online-pip"></span>Virtual assistant · Always available</small></div><span class="chat-status">Online</span></div>
 <div class="chat-surface" id="chat-messages">${state.chatMessages.map(m=>`<div class="msg-row ${m.role==='user'?'user':''}">${m.role==='assistant'?'<div class="msg-avatar">✳</div>':''}<div class="bubble">${viewText(m.text)}</div></div>`).join('')}${options.length?`<div class="chat-options" id="chat-options">${options.map(option=>`<button class="quick-chip" data-send="${esc(option)}">${esc(chipLabel(option))}</button>`).join('')}</div>`:''}</div>
 <form class="chat-compose" id="chat-form"><div class="compose-wrap"><input type="text" id="chat-input" name="message" maxlength="1400" placeholder="Ask a question or type a message..." aria-label="Chat message" autocomplete="off" spellcheck="true"><button class="send-btn" id="chat-send" type="button" aria-label="Send Message" ${state.busy?'disabled':''}>${state.busy?'Sending…':(state.uiLanguage==='es'?'Enviar':'Send')} <span aria-hidden="true">↗</span></button></div><div class="chat-disclaimer">Demo assistant · Appointments are requests until confirmed by the business</div></form>
 <div class="chat-controls"><span></span><div><button class="inline-btn" id="reset-chat">Reset Chat</button></div></div></section>`;}
async function loadConversations(){
 try{state.conversations=null;const data=await api(`/businesses/${state.businessId}/conversations`);
 if(state.page!=='conversations')return;state.conversations=data.conversations||[];render();}
 catch(error){if(state.page==='conversations'){state.conversations=[];render();notify('Could not load conversations: '+error.message);}}
}
function conversationsPage(){const items=state.conversations;
 const body=items===null?'<div class="empty">Loading Conversations...</div>':!items.length?'<div class="empty">No Conversations Yet. Use The Live Assistant Playground To Start One.</div>':items.map((conversation,index)=>{
 const entries=(conversation.messages||[]).map(message=>`<div class="history-message ${message.role==='user'?'from-customer':''}"><span class="history-role">${message.role==='user'?'Customer':'Assistant'}</span><p>${viewText(message.content)}</p></div>`).join('');
 return `<details class="conversation-entry" ${index===0?'open':''}><summary><span><strong>Conversation ${index+1}</strong><small>${esc(timeFmt(conversation.updated_at))} · ${esc(conversation.language==='es'?'Español':'English')}</small></span><span>${(conversation.messages||[]).length} Messages</span></summary><div class="conversation-messages">${entries||'<p>No Messages Saved.</p>'}</div></details>`;
 }).join('');
 return `${heading('Customer Conversations','Conversations','Review Recent Assistant Conversations For This Business.','<button class="secondary-btn" type="button" data-goto="overview">Open Assistant Playground →</button>')}
 <section class="panel"><div class="panel-titlebar"><h3>Recent Conversations</h3><span class="micro">Up To 50 Recent Sessions</span></div>${body}</section>`;
}
function leadsPage(){const d=state.data;const rows=d.leads.map(l=>`<tr><td><b>${esc(l.name)}</b><small>${esc(l.source==='sample'?'Sample contact':'AI assistant')}</small></td><td>${esc(l.email)}${l.phone?'<small>'+esc(l.phone)+'</small>':''}</td><td>${esc(short(l.note))}</td><td>${dateFmt(l.created_at)}</td><td><span class="pill ${l.source==='sample'?'':'new'}">${l.source==='sample'?'Sample':'New lead'}</span></td><td><button class="secondary-btn small-btn" data-followup="${l.id}">Draft follow-up</button></td></tr>`).join('');
 return `${heading('Customer pipeline','Leads & Contacts','Every new conversation can become a customer relationship.')}
 <div class="info-strip">These leads are stored in the local SQLite database. Entries marked “Sample” are fictional seed data. New leads collected in the playground appear here after refresh.</div>
 <section class="panel"><div class="panel-titlebar"><div><h3>Contact Inbox</h3><p>${d.leads.length} contacts in this workspace</p></div><span class="pill new">Live lead capture</span></div><div class="table-overflow"><table class="data-table"><thead><tr><th>Contact</th><th>Email</th><th>Interested in</th><th>Date</th><th>Status</th><th>Next step</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No leads yet. Try leaving a message in the assistant.</td></tr>'}</tbody></table></div></section>`;}
function appointmentsPage(){const d=state.data;
 const pending=d.appointments.filter(a=>a.status!=='confirmed').length;
 const rows=d.appointments.map(a=>`<tr><td><b>${esc(a.name)}</b><small>${esc(a.email||'Phone contact')}</small></td><td>${esc(a.service)}</td><td>${timeFmt(a.starts_at)}</td><td><span class="pill ${a.status==='confirmed'?'new':'pending'}">${a.status==='confirmed'?'Confirmed':'Request only'}</span>${a.provider?`<small>${esc(a.provider)}</small>`:''}</td><td>${dateFmt(a.created_at)}</td></tr>`).join('');
 return `${heading('Client scheduling','Appointments & requests','See which bookings were confirmed on the calendar and which require human follow-up.')}
 <div class="info-strip ${d.calendar_connected?'':'warning'}">${d.calendar_connected?'A business calendar is connected. New appointment times are checked against live availability and only marked confirmed after the provider saves an event.':'No live calendar connected. The assistant collects unconfirmed appointment requests using sample request times.'} <button class="inline-btn" data-goto="integrations">Manage calendar →</button></div>
 <section class="panel"><div class="panel-titlebar"><div><h3>Customer Appointments</h3><p>Confirmed events and requests needing manual review</p></div><span class="pill pending">${pending} to review</span></div><div class="table-overflow"><table class="data-table"><thead><tr><th>Customer</th><th>Service</th><th>Time</th><th>Status</th><th>Submitted</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No appointments yet. Use the assistant to start a booking.</td></tr>'}</tbody></table></div></section>`;}
function knowledgePage(){const d=state.data;return `${heading('Assistant Training','Knowledge Base','Give your assistant trusted answers about your services and business.', '<button class="primary-btn" id="add-faq-button">Add New Question/Answer</button>')}
 <div class="knowledge-grid"><section class="panel"><div class="panel-titlebar"><div><h3>Frequently Asked Questions</h3><p>${d.faqs.length} ready-to-use answers</p></div></div><div>${d.faqs.map(f=>`<div class="faq-card"><b>${esc(f.question)}</b><p>${esc(state.uiLanguage==='es'?(f.answer_es||f.answer):f.answer)}</p></div>`).join('')||'<div class="empty">No FAQs added yet.</div>'}</div></section>
 <div class="column-stack"><section class="panel"><div class="panel-titlebar"><h3>Business Documents & Policies</h3></div><div class="panel-body"><div class="info-strip">Paste text from service menus, policies, rate sheets, or other business documents. The assistant uses the saved information as reference, not as instructions.</div><form id="knowledge-form"><div class="field"><label for="knowledge-text">Saved Business Information</label><textarea rows="11" maxlength="10000" id="knowledge-text">${esc(d.business.knowledge)}</textarea></div><button type="submit" class="primary-btn">Save knowledge</button></form></div></section>
 <section class="panel"><div class="panel-titlebar"><h3>What The Assistant Knows</h3></div><div class="panel-body"><p class="page-subtitle">Business name, hours, location, services, FAQs, and saved policies. Even without an AI API key, the assistant can find relevant words in FAQ answers and identify individual service prices. For deeper semantic matching, configure an OpenAI API key on the hosted server. The downloadable offline demo cannot call an AI model.</p><div class="preview-note">✳ Your API keys stay on the server, never in the customer chat widget.</div></div></section></div></div>`;}
function settingsPage(){const d=state.data,b=d.business;const embed=`<script src="${location.origin}/widget.js" data-business="${b.id}" async><\/script>`;
 return `${heading('Make It Yours','Business Setup','Customize the personality and details of this assistant.')}
 <div class="settings-layout">
 <section class="panel"><div class="panel-titlebar"><div><h3>Business Information Settings</h3><p>Displayed inside the chat assistant</p></div></div><div class="panel-body"><form id="settings-form"><div class="two-col-form"><div class="field"><label>Business Name</label><input name="name" value="${esc(b.name)}" required></div><div class="field"><label>Location</label><input name="location" value="${esc(b.location)}"></div><div class="field"><label>Business Email</label><input name="email" type="email" value="${esc(b.email)}"></div><div class="field"><label for="business-hours">Hours</label><textarea id="business-hours" name="hours" rows="4" maxlength="500" placeholder="Mon–Fri: 9 AM–5 PM&#10;Sat: 10 AM–2 PM&#10;Sun: Closed">${esc(b.hours||'')}</textarea></div></div><div class="two-col-form"><div class="field"><label>Tagline</label><input name="tagline" value="${esc(b.tagline)}"></div><div class="field"><label>Brand Accent Color</label><input name="accent" type="color" value="${esc(b.accent)}" style="height:40px;padding:3px"></div></div><div class="field"><label>Bookable Services (One Per Line)</label><textarea rows="4" name="services" placeholder="Consultation&#10;Service call">${esc((b.services||[]).join('\n'))}</textarea></div><div class="field"><label>Greeting · English</label><textarea rows="3" name="greeting">${esc(b.greeting)}</textarea></div><div class="field"><label>Greeting · Spanish</label><textarea rows="3" name="greeting_es">${esc(b.greeting_es)}</textarea></div><button class="primary-btn" type="submit">Save business details</button></form></div></section>
 <div class="settings-support-grid"><div class="column-stack"><section class="panel"><div class="panel-titlebar"><h3>Install On A Website</h3></div><div class="panel-body"><p class="page-subtitle">Put this snippet just before your website's closing body tag. Visitors will see a floating chat launcher.</p><pre class="code-snippet">${esc(embed)}</pre><button class="secondary-btn" id="copy-embed">Copy embed code</button><div class="preview-note">For a real client, configure their branding, admin access, privacy notice, and allowed website origins first.</div></div></section></div><div class="column-stack"><section class="panel"><div class="panel-titlebar"><h3>Product Readiness</h3></div><div class="panel-body">${[['✓','FAQs, Spanish chat, lead capture','Working demo'],['✓','Customer appointment requests','Working demo'],['✓','Email follow-up draft generator','Working demo'],['↗','OpenAI natural-language responses',d.ai_enabled?'API enabled':'Requires OPENAI_API_KEY'],['↗','Live calendar booking',d.calendar_connected?'Connected':'Connect in Calendar & SMS'],['↗','Two-way incoming SMS','Configure in Calendar & SMS'],['↗','Individual business accounts','Needs production login + tenancy']].map(x=>`<div class="guide-line"><span class="guide-dot">${x[0]}</span><span><b>${x[1]}</b><br><span class="micro">${x[2]}</span></span></div>`).join('')}</div></section></div></div>
 <section class="panel"><div class="panel-titlebar"><h3>Demo Color Scheme</h3></div><div class="panel-body"><p class="page-subtitle">Switch the BizBug demo between a few palettes while you show it to prospects.</p><div class="theme-card"><button class="theme-pill" type="button" data-theme-set="fern"><span class="theme-pill-swatch" style="--sw:#2a765d"></span>Fern</button><button class="theme-pill" type="button" data-theme-set="ocean"><span class="theme-pill-swatch" style="--sw:#266e87"></span>Ocean</button><button class="theme-pill" type="button" data-theme-set="plum"><span class="theme-pill-swatch" style="--sw:#7b4a7e"></span>Plum</button><button class="theme-pill" type="button" data-theme-set="sunset"><span class="theme-pill-swatch" style="--sw:#c96f4a"></span>Sunset</button></div><div class="preview-note">This changes the demo appearance only and helps you test different looks during sales conversations.</div></div></section>
 </div>`;}

async function loadIntegrations(){
 try{state.integrations=await api(`/businesses/${state.businessId}/integrations`);if(state.page==='integrations')render();}
 catch(e){notify('Could not load integration settings: '+e.message);}
}
function integrationsPage(){
 const i=state.integrations;
 if(!i)return `${heading('CONNECT YOUR TOOLS','Calendars & Two-Way SMS','Loading integration settings...')}<section class="panel panel-body">Loading... </section>`;
 const on=i.production_mode, provider=i.calendar?.provider, num=i.sms?.number||'',tz=i.booking?.timezone||'America/New_York';
 const rows=[['google','Google Calendar'],['microsoft','Microsoft Outlook / 365']];
 return `${heading('CONNECT YOUR TOOLS','Calendars & Two-Way SMS','Connect each client’s own calendar and business texting number. Live connections require a secured, HTTPS-hosted server.')}
 <div class="main-grid"><div class="column-stack">
 <section class="panel"><div class="panel-titlebar"><div><h3>Calendar Booking</h3><p>Show free times and create confirmed events</p></div><span class="micro">${provider?'CONNECTED: '+esc(provider.toUpperCase()):'NOT CONNECTED'}</span></div>
 <div class="panel-body"><p class="page-subtitle" style="margin-bottom:15px">${provider?`Using ${esc(provider)} calendar. Appointment times are verified and the event is added before confirming.`:'Without a live connection, the assistant collects appointment requests only. Never presents demo times as confirmed.'}</p>
 <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${rows.map(([key,name])=>`<button class="${provider===key?'secondary-btn':'primary-btn'}" data-connect="${key}" ${!on||!i.oauth_ready[key]?'disabled':''}>${provider===key?'Reconnect':'Connect'} ${name}</button>`).join('')}${provider?'<button class="secondary-btn" id="disconnect-calendar">Disconnect calendar</button>':''}</div>
 <form id="booking-config-form" class="two-col-form"><div class="field"><label>Business Timezone (IANA)</label><input name="timezone" required value="${esc(tz)}" placeholder="America/New_York"></div><div class="field"><label>Appointment Length</label><select name="duration_min">${[30,45,60,90,120].map(n=>`<option value="${n}" ${i.booking?.duration_min===n?'selected':''}>${n} minutes</option>`).join('')}</select></div><button class="secondary-btn" ${!on?'disabled':''} type="submit">Save booking settings</button></form>
 <p class="preview-note" style="margin-top:12px">One active booking calendar per business. Working hours currently use weekdays with morning and afternoon appointment windows. Existing events are checked before offering times.</p></div></section>
 <section class="panel"><div class="panel-titlebar"><div><h3>Two-Way SMS Assistant</h3><p>Customers text a business number and receive replies</p></div><span class="micro">${num?'NUMBER ASSIGNED':'NOT CONFIGURED'}</span></div>
 <div class="panel-body"><div class="field"><label>Twilio Number Assigned To This Business</label><form id="sms-number-form" style="display:flex;gap:8px;flex-wrap:wrap"><input name="number" style="flex:1;min-width:160px" type="tel" placeholder="+18435550123" value="${esc(num)}" required><button class="primary-btn" ${!on||!i.sms_ready?'disabled':''}>Save number</button></form></div>
 ${num?'<button class="secondary-btn" id="remove-sms">Remove this number</button>':''}
 <div style="margin-top:16px" class="field"><label>Twilio Incoming-Message Webhook (POST)</label><pre class="code-snippet">${esc(i.webhook_url||'Set PUBLIC_BASE_URL first')}</pre></div>
 <p class="preview-note">Purchase and register an SMS-capable number in Twilio, then set its inbound webhook to the URL above. Messages are responded to in English or Spanish, and leads appear in this business’s dashboard. The app does not purchase or verify phone numbers for you.</p></div></section>
 </div><div class="column-stack">
 <section class="panel"><div class="panel-titlebar"><div><h3>SMS-Style Sales Demo</h3><p>Preview the text conversation without sending actual texts</p></div><span class="micro">SIMULATION</span></div>
 <div class="panel-body"><div id="sms-demo-log" style="min-height:210px;max-height:360px;overflow:auto;background:var(--panel, #f7f8fa);padding:13px;border-radius:10px">${state.smsDemoMessages.length?state.smsDemoMessages.map(m=>`<div style="margin:7px 0;max-width:91%;${m.role==='user'?'margin-left:auto;background:#d9f6df':'background:#edf1f5'};padding:10px;border-radius:12px;white-space:pre-wrap">${esc(m.text)}</div>`).join(''):'<p class="page-subtitle">Text “Hi”, “I need an appointment”, or a business FAQ to get started.</p>'}</div>
 <form id="sms-demo-form" style="display:flex;gap:8px;margin-top:12px"><input id="sms-demo-input" style="flex:1;min-width:130px" placeholder="Type a sample text..." required maxlength="1400"><button class="primary-btn">Send</button></form>
 <p class="preview-note">This preview uses the website chat engine. Actual SMS uses the signed Twilio webhook, a unique sender phone number, and numbered service/time choices.</p></div></section>
 <section class="panel"><div class="panel-titlebar"><h3>Launch Checklist</h3></div><div class="panel-body">${[['Production mode',on],['Google OAuth credentials',i.oauth_ready.google],['Microsoft OAuth credentials',i.oauth_ready.microsoft],['Twilio authentication token',i.sms_ready],['Calendar connected',!!provider],['SMS number mapped',!!num]].map(([label,yes])=>`<div class="guide-line"><span class="guide-dot">${yes?'✓':'·'}</span><span>${esc(label)}</span></div>`).join('')}<p class="preview-note">Connections are disabled in the public/demo configuration. Each customer requires a private, appropriately secured business environment.</p></div></section>
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

function render(){if(!state.data)return;sideBar();let html={'overview':mainOverview,'conversations':conversationsPage,'leads':crmLeadsPage,'pipeline':crmPipelinePage,'tasks':crmTasksPage,'reports':crmReportsPage,'appointments':appointmentsPage,'knowledge':knowledgePage,'settings':settingsPage,'integrations':integrationsPage}[state.page]();$('#page-content').innerHTML=html;wirePage();wireThemeControls();$$('.theme-pill').forEach(btn=>btn.classList.toggle('active',btn.dataset.themeSet===state.theme));translateUi($('#app'));}
function wirePage(){wireCrm();$('[data-goto]').forEach(btn=>btn.addEventListener('click',()=>switchPage(btn.dataset.goto)));
 $$('[data-followup]').forEach(btn=>btn.addEventListener('click',()=>openFollowup(btn.dataset.followup)));
 $$('#chat-options [data-send]').forEach(btn=>btn.addEventListener('click',()=>sendChat(btn.dataset.send)));
 $('#reset-chat')?.addEventListener('click',()=>resetChat());

 $('#settings-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=Object.fromEntries(new FormData(e.currentTarget));form.services=(form.services||'').split(/[,\n]/).map(s=>s.trim()).filter(Boolean);try{await api(`/businesses/${state.businessId}/settings`,{method:'PUT',body:JSON.stringify(form)});notify('Business settings saved');await loadBusiness();}catch(e){notify(e.message)}});
 $('#knowledge-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api(`/businesses/${state.businessId}/settings`,{method:'PUT',body:JSON.stringify({knowledge:$('#knowledge-text').value})});notify('Business knowledge saved');await loadDashboard();}catch(e){notify(e.message)}});
 $('#add-faq-button')?.addEventListener('click',faqModal);
 wireIntegrations();
 $('#copy-embed')?.addEventListener('click',async()=>{const code=`<script src="${location.origin}/widget.js" data-business="${state.businessId}" async></scr`+'ipt>';await navigator.clipboard.writeText(code);notify('Embed code copied!')});}
async function sendChat(raw){if(state.busy)return;state.busy=true;state.chatMessages.push({role:'user',text:chipLabel(raw)});state.chatOptions=[];refreshChatOnly();const b=state.businessId;
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
 try{const result=await api(`/businesses/${b}/chat`,{method:'POST',signal:controller.signal,body:JSON.stringify({message:raw,session_id:state.sessionId,language:state.uiLanguage})});if(b!==state.businessId)return;
 state.sessionId=result.session_id;state.language=result.language;state.chatMessages.push({role:'assistant',text:result.reply});state.chatOptions=result.options||[];
 if(!result.stage)await loadDashboard();else refreshChatOnly();}
 catch(e){state.chatMessages.push({role:'assistant',text:(state.uiLanguage==='es'?'No se pudo enviar el mensaje. ':'Sorry, the message could not be sent. ')+e.message});notify(state.uiLanguage==='es'?'Error al enviar el mensaje':'Message failed to send');refreshChatOnly();}
 finally{clearTimeout(timeout);state.busy=false;refreshChatOnly();}}
function refreshChatOnly(){if(state.page!=='overview')return;const temp=chatCard();const existing=$('.chat-panel');if(!existing)return;existing.outerHTML=temp;
 $$('#chat-options [data-send]').forEach(btn=>btn.addEventListener('click',()=>sendChat(btn.dataset.send)));
 $('#reset-chat')?.addEventListener('click',()=>resetChat());

 const surface=$('#chat-messages');if(surface)surface.scrollTop=surface.scrollHeight;translateUi($('.chat-panel'));}
function resetChat(keepLanguage=false){state.sessionId=null;state.chatMessages=[];state.chatOptions=[];if(!keepLanguage)state.language=state.uiLanguage;refreshChatOnly();}
function modal(title,content){const el=document.createElement('div');el.className='modal-backdrop';el.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close" aria-label="Close">×</button></div><div class="modal-body">${content}</div></div>`;document.body.appendChild(el);translateUi(el);
 el.addEventListener('click',e=>{if(e.target===el||e.target.closest('.modal-close'))el.remove()});return el;}
function showTokenModal(){if($('.modal-backdrop'))return;const m=modal('Dashboard access',`<p class="page-subtitle" style="margin-bottom:18px">Enter the ADMIN_TOKEN configured on your server. This is needed to see private business records.</p><form id="token-form"><div class="field"><label>Admin Access Token</label><input id="token-input" type="password" required autocomplete="off"></div><button class="primary-btn">Unlock dashboard</button></form>`);
 $('#token-form',m).addEventListener('submit',async e=>{e.preventDefault();state.token=$('#token-input',m).value;try{sessionStorage.setItem('bizbug_admin',state.token);}catch{}m.remove();await loadDashboard();});}
function newBusinessModal(){const m=modal('Create a business assistant',`<p class="page-subtitle" style="margin-bottom:18px">Give a prospective client their own profile and then add their FAQs, policies, and greetings.</p><form id="create-business-form"><div class="field"><label>Business Name</label><input name="name" required placeholder="e.g. Hometown Plumbing"></div><div class="field"><label>Industry</label><select name="category"><option>Home services</option><option>Beauty & wellness</option><option>Automotive</option><option>Real estate</option><option>Restaurants</option><option>Healthcare administration</option><option>Other small business</option></select></div><div class="two-col-form"><div class="field"><label>Business Email</label><input type="email" name="email" placeholder="contact@example.com"></div><div class="field"><label>Hours</label><textarea name="hours" rows="3" maxlength="500" placeholder="Mon–Fri: 9 AM–5 PM&#10;Sat: 10 AM–2 PM">By appointment</textarea></div></div><div class="field"><label>Location</label><input name="location" placeholder="Your city and state"></div><button class="primary-btn">Create assistant →</button></form>`);
 $('#create-business-form',m).addEventListener('submit',async e=>{e.preventDefault();try{const payload=Object.fromEntries(new FormData(e.currentTarget));const res=await api('/businesses',{method:'POST',body:JSON.stringify(payload)});m.remove();notify('New business assistant created');await loadBusiness();await switchBusiness(res.id);switchPage('settings');}catch(err){notify(err.message)}});}
function faqModal(){const m=modal('Add a business FAQ',`<form id="faq-form"><div class="field"><label>Customer Question</label><input required name="question" placeholder="Do you offer free estimates?"></div><div class="field"><label>Answer (English)</label><textarea required name="answer" placeholder="Our estimates are free for local residents..."></textarea></div><div class="field"><label>Additional Keywords (Optional)</label><input name="keywords" placeholder="estimate free quote price presupuesto"></div><button class="primary-btn">Add answer</button></form>`);
 $('#faq-form',m).addEventListener('submit',async e=>{e.preventDefault();try{await api(`/businesses/${state.businessId}/faqs`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});m.remove();notify('FAQ added');await loadDashboard();}catch(err){notify(err.message)}});}
async function openFollowup(id){try{const res=await api(`/businesses/${state.businessId}/followup`,{method:'POST',body:JSON.stringify({lead_id:Number(id)})});const text=`To: ${res.to}\nSubject: ${res.subject}\n\n${res.body}`;
 const m=modal('Follow-up email draft',`<div class="info-strip warning">This is a draft only. No email has been sent.</div><div class="field"><label>Draft Message</label><textarea id="followup-text" rows="13" readonly>${esc(text)}</textarea></div><button class="primary-btn" id="copy-followup">Copy draft</button>`);
 $('#copy-followup',m).addEventListener('click',async()=>{await navigator.clipboard.writeText(text);notify('Draft copied. Paste it in your email app.');});}catch(e){notify(e.message)}}
function startup(){applyTheme(state.theme);setUiLanguage(state.uiLanguage,{reset:false});
 document.body.classList.add('bizbug-ready');
 document.getElementById('bizbug-home-link')?.addEventListener('click',event=>{event.preventDefault();switchPage('overview');});
 // Delegated listeners survive chat-card replacement. Both click and Enter call the same sender.
 function submitPlaygroundMessage(){const field=document.getElementById('chat-input');if(!field||state.busy)return;
  const message=field.value.trim();if(!message){notify(state.uiLanguage==='es'?'Escribe un mensaje para enviarlo.':'Type a message to send.');field.focus();return;}
  field.value='';void sendChat(message);
 }
 document.addEventListener('click',event=>{if(event.target?.closest('#chat-send')){event.preventDefault();submitPlaygroundMessage();}},true);
 document.addEventListener('submit',event=>{if(event.target?.id==='chat-form'){event.preventDefault();submitPlaygroundMessage();}},true);
 document.addEventListener('keydown',event=>{if(event.target?.id==='chat-input'&&event.key==='Enter'&&!event.isComposing){event.preventDefault();submitPlaygroundMessage();}},true);
 document.querySelectorAll('[data-ui-language]').forEach(btn=>btn.addEventListener('click',()=>{setUiLanguage(btn.dataset.uiLanguage);render();}));const dt=new Date();$('#today-date').textContent=dt.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
 wireThemeControls();$('#workspace-picker').addEventListener('click',()=>$('#workspace-menu').classList.toggle('hidden'));
 document.addEventListener('click',e=>{if(!e.target.closest('#workspace-picker')&&!e.target.closest('#workspace-menu'))hideMenu();});
 $$('.nav-link').forEach(n=>n.addEventListener('click',()=>switchPage(n.dataset.page)));
 $('#admin-access').addEventListener('click',showTokenModal);
 loadBusiness().catch(e=>{$('#page-content').textContent='Unable to start: '+e.message;});}
startup();
