import os
import sys
from pathlib import Path
os.environ['DATABASE_PATH'] = '/tmp/bizbug-tests.sqlite3'
os.environ['DEMO_MODE'] = 'true'
try:
    Path(os.environ['DATABASE_PATH']).unlink()
except FileNotFoundError:
    pass
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app
from fastapi.testclient import TestClient
client=TestClient(app)


def send(bid, message, session=None):
    r=client.post(f'/api/businesses/{bid}/chat',json={'message':message,'session_id':session})
    assert r.status_code==200,r.text
    return r.json()

def test_get_business_profiles_and_dashboard():
    profiles=client.get('/api/businesses').json()
    assert len(profiles)==4
    assert 'knowledge' not in profiles[0]
    r=client.get('/api/businesses/bloom/dashboard')
    assert r.status_code==200
    assert r.json()['stats']['faqs']==4
    assert r.json()['calendar_connected'] is False

def test_faq_answer_and_spanish():
    assert '$55' in send('bloom','How much is a haircut?')['reply']
    r=send('bloom','¿Cuánto cuesta un corte?')
    assert r['language']=='es'
    # Spanish FAQ can match by cue words, else it must not invent prices.
    assert ('55' in r['reply'] or 'respuesta verificada' in r['reply'])

def test_lead_capture_persists():
    a=send('auto','Leave a message'); assert a['stage']=='lead.name'
    a=send('auto','Chris Tester',a['session_id']); assert a['stage']=='lead.email'
    a=send('auto','chris.demo@example.com',a['session_id']); assert a['stage']=='lead.phone'
    a=send('auto','843-555-0173',a['session_id']); assert a['stage']=='lead.note'
    a=send('auto','Please call about my brakes',a['session_id'])
    assert 'saved' in a['reply']
    leads=client.get('/api/businesses/auto/dashboard').json()['leads']
    assert any(l['email']=='chris.demo@example.com' and l['phone']=='843-555-0173' for l in leads)

def test_booking_request_not_confirmation():
    a=send('hvac','Book appointment'); assert a['stage']=='booking.service'
    a=send('hvac','SERVICE::AC repair',a['session_id']); assert a['stage']=='booking.slot'
    assert a['options'][0].startswith('SLOT::')
    a=send('hvac',a['options'][0],a['session_id']); assert a['stage']=='booking.name'
    a=send('hvac','Jordan Test',a['session_id']); assert a['stage']=='booking.email'
    a=send('hvac','jordan.test@example.com',a['session_id']); assert a['stage']==''
    assert 'not a confirmed booking' in a['reply']
    r=client.get('/api/businesses/hvac/dashboard').json()
    assert any(x['status']=='requested' for x in r['appointments'])
    assert any(x['email']=='jordan.test@example.com' for x in r['leads'])

def test_faq_and_business_creation_and_followup():
    r=client.post('/api/businesses',json={'name':'Sample Plumbing','category':'Home services'})
    assert r.status_code==200
    bid=r.json()['id']
    assert client.put(f'/api/businesses/{bid}/settings',json={'hours':'24 hours','knowledge':'Emergency scheduling by request only.'}).status_code==200
    assert client.post(f'/api/businesses/{bid}/faqs',json={'question':'What hours are you open?','answer':'We take requests 24 hours a day.','keywords':'hours open'}).status_code==200
    assert '24 hours' in send(bid,'What hours are you open?')['reply']
    lead=client.get('/api/businesses/bloom/dashboard').json()['leads'][0]
    r=client.post('/api/businesses/bloom/followup',json={'lead_id':lead['id']})
    assert r.status_code==200 and r.json()['sent'] is False

def test_no_confirmation_or_duplicate_booking():
    assert client.get('/api/businesses/bloom/slots').json()['connected'] is False
    assert client.get('/api/businesses/bad/dashboard').status_code==404
