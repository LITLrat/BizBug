"""CRM persistence, multi-business isolation, capture automation and UI regressions."""
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
import app as backend

client = TestClient(backend.app)


def create_business(name):
    response = client.post('/api/businesses', json={'name': name})
    assert response.status_code == 200, response.text
    return response.json()['id']


def api(bid, suffix):
    return f'/api/businesses/{bid}/crm/{suffix}'


def test_crm_contacts_pipeline_tasks_and_reporting_are_business_scoped():
    a = create_business('CRM Alpha Test')
    b = create_business('CRM Beta Test')
    created = client.post(api(a, 'leads'),json={
        'name':'Alex Tester','email':'alex@example.org','phone':'843-555-0123',
        'stage':'qualified','deal_value':3500,'owner':'Taylor','note':'Wants a service quote'
    })
    assert created.status_code == 200, created.text
    lead = created.json()
    lid = lead['id']
    assert lead['stage']=='qualified'
    dash = client.get(f'/api/businesses/{a}/dashboard').json()
    assert dash['crm']['stages']['qualified']==1
    assert dash['crm']['pipeline_value']==3500
    tasks = [task for task in dash['crm']['tasks'] if task['lead_id']==lid]
    assert len(tasks)==1, 'Capturing a lead should make exactly one follow-up task'
    assert tasks[0]['kind']=='initial-follow-up'
    assert tasks[0]['status']=='open'

    # CRM records must not leak across workspaces, even when ids are guessed.
    assert client.get(api(b, f'leads/{lid}')).status_code==404
    assert client.put(api(b, f'leads/{lid}'),json={'stage':'won'}).status_code==404
    assert client.post(api(b, f'leads/{lid}/notes'),json={'text':'private'}).status_code==404
    assert client.put(api(b, f'tasks/{tasks[0]["id"]}'),json={'status':'done'}).status_code==404
    assert client.post(api(b, 'tasks'),json={'title':'Wrong tenant','lead_id':lid}).status_code==404
    assert client.get(f'/api/businesses/{b}/dashboard').json()['crm']['lead_count']==0

    saved = client.put(api(a,f'leads/{lid}'),json={'stage':'won','deal_value':4250})
    assert saved.status_code==200, saved.text
    detail=client.get(api(a,f'leads/{lid}')).json()
    assert any(x['kind']=='stage' and 'won' in x['details'] for x in detail['events'])
    assert any(x['kind']=='value' for x in detail['events'])
    note=client.post(api(a,f'leads/{lid}/notes'),json={'text':'Called, ready to purchase.'})
    assert note.status_code==200
    assert any(x['kind']=='note' for x in note.json()['events'])
    assert client.get(f'/api/businesses/{a}/dashboard').json()['crm']['won_value']==4250

    task_id=tasks[0]['id']
    completed=client.put(api(a,f'tasks/{task_id}'),json={'status':'done'})
    assert completed.status_code==200
    assert completed.json()['completed_at']
    assert client.put(api(a,f'tasks/{task_id}'),json={'status':'open'}).json()['completed_at'] is None

    assert client.put(api(a,f'leads/{lid}'),json={'stage':'invalid'}).status_code==422
    assert client.put(api(a,f'leads/{lid}'),json={'deal_value':-1}).status_code==422


def test_chat_lead_capture_links_messages_and_creates_internal_followup():
    bid=create_business('CRM Capture Test')
    def message(text,sid=None):
        return client.post(f'/api/businesses/{bid}/chat',json={'message':text,'session_id':sid}).json()
    result=message('Leave a message')
    sid=result['session_id']
    assert result['stage']=='lead.name'
    for text in ('Jamie Contact','jamie@example.org','skip','Please call me about pricing'):
        result=message(text,sid)
    assert result['stage']==''
    dash=client.get(f'/api/businesses/{bid}/dashboard').json()
    leads=[lead for lead in dash['leads'] if lead['email']=='jamie@example.org']
    assert len(leads)==1
    assert sum(t['lead_id']==leads[0]['id'] for t in dash['crm']['tasks'])==1
    detail=client.get(api(bid,f'leads/{leads[0]["id"]}')).json()
    assert detail['lead']['chat_id']==sid
    assert any(m['content']=='Please call me about pricing' for m in detail['messages'])


def test_crm_mutations_require_admin_authentication(monkeypatch):
    monkeypatch.setattr(backend,'DEMO_MODE',False)
    monkeypatch.setattr(backend,'ADMIN_TOKEN','testing-crm-admin')
    result=client.post(api('bloom','leads'),json={'name':'Unsafe Mutation'})
    assert result.status_code==401
    assert client.get(api('bloom','leads/1')).status_code==401
    assert client.post(api('bloom','tasks'),json={'title':'Bad task'}).status_code==401
    # Authenticated access works without changing the public chat endpoints.
    ok=client.get('/api/businesses/bloom/dashboard',headers={
        'Authorization':'Bearer testing-crm-admin'})
    assert ok.status_code==200


@pytest.mark.skipif(shutil.which('node') is None,reason='Node unavailable')
def test_crm_scripts_are_syntactically_valid_and_wired():
    base=Path(__file__).resolve().parents[1]
    for name in ('app.js','crm-ui.js'):
        result=subprocess.run(['node','--check',str(base/'static'/name)],capture_output=True,text=True)
        assert result.returncode==0,result.stderr
    ui=(base/'static'/'app.js').read_text()
    assert "wireCrm()" in ui
    assert "'pipeline':crmPipelinePage" in ui
    assert "'tasks':crmTasksPage" in ui
    assert "'reports':crmReportsPage" in ui


def test_offline_bundle_includes_crm_files(tmp_path):
    """The one-file demo must not fetch CRM scripts over the network."""
    base=Path(__file__).resolve().parents[1]
    source=(base/'build_offline.py').read_text()
    assert "crm_js=(p/'crm-ui.js').read_text()" in source
    assert '<script src="/static/crm-ui.js" defer></script>' in source
    adapter=(base/'static'/'offline-adapter.js').read_text()
    assert "if(seg[3]==='crm')" in adapter
    assert 'crm:crmSnapshot(id)' in adapter
    if shutil.which('node'):
        script=adapter.replace('__INITIAL_DATA__','{"businesses":[],"leads":{},"faqs":{},"activities":{}}')
        target=tmp_path/'offline-adapter.js'
        target.write_text(script)
        result=subprocess.run(['node','--check',str(target)],capture_output=True,text=True)
        assert result.returncode==0,result.stderr
