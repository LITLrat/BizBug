"""Package a fully offline, localStorage-backed demo as one openable HTML file."""
from pathlib import Path
from datetime import datetime, timezone
import json
import os
os.environ.setdefault('DEMO_MODE','true')
from app import SEEDS
root=Path(__file__).parent
p=root/'static'
html=(p/'index.html').read_text()
css=(p/'styles.css').read_text().replace("@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap');",'')
js=(p/'app.js').read_text().replace('location.origin', "'https://YOUR-LIVE-DOMAIN.example'")
adapter=(p/'offline-adapter.js').read_text().replace('new URL(url,location.href)', "new URL(url,location.href==='about:blank'?'https://demo.local':location.href)")
seed={
 'businesses':[], 'faqs':{}, 'leads':{}, 'activities':{}
}
for x in SEEDS:
 seed['businesses'].append({k:x[k] for k in ['id','name','category','initials','accent','tagline','email','hours','location','greeting','greeting_es','services','knowledge']})
 seed['faqs'][x['id']]=[{'id':i+1,'business_id':x['id'],'question':f[0],'answer':f[1],'answer_es':f[2],'keywords':f[3]} for i,f in enumerate(x['faqs'])]
 sample={
  'bloom':[('Avery Johnson','avery.demo@example.com','Balayage consultation'),('Morgan Lopez','morgan.demo@example.com','Haircut appointment')],
  'hvac':[('Jordan Carter','jordan.demo@example.com','AC repair estimate')],
  'auto':[('Sam Williams','sam.demo@example.com','Brake inspection')],
  'realty':[('Taylor Davis','taylor.demo@example.com','First-time buyer consultation')],
 }
 now=datetime.now(timezone.utc).isoformat(timespec='seconds')
 seed['leads'][x['id']]=[{'id':idx+1,'business_id':x['id'],'name':name,'email':email,'phone':'','source':'sample','note':note,'created_at':now} for idx,(name,email,note) in enumerate(sample.get(x['id'],[]))]
 seed['activities'][x['id']]=[{'id':idx+1,'business_id':x['id'],'kind':'lead','description':'Sample lead received from '+name,'created_at':now} for idx,(name,_,_) in enumerate(sample.get(x['id'],[]))]
adapter=adapter.replace('__INITIAL_DATA__',json.dumps(seed,ensure_ascii=False))
html=html.replace('<link rel="stylesheet" href="/static/styles.css">','<style>'+css+'</style>')
html=html.replace('<script src="/static/app.js" defer></script>',
 '''<script>'''+adapter.replace('</script>','<\\/script>')+'''</script><script>'''+js.replace('</script>','<\\/script>')+'''</script>''')
html=html.replace('<title>BizBug · Assistant Studio</title>', '<title>BizBug · Offline Sales Demo</title>')
html=html.replace('Demo environment</span>', 'Offline demo · this device only</span>')
destination=root.parent/'BizBug_Interactive_Demo.html'
destination.write_text(html)
print('Created:',destination,'bytes',destination.stat().st_size)
