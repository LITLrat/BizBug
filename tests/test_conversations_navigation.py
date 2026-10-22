import os
import sys
from pathlib import Path
os.environ.setdefault('DATABASE_PATH','/tmp/bizbug-v07-tests.sqlite3')
os.environ.setdefault('DEMO_MODE','true')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app import app
client=TestClient(app)


def test_multiline_hours_saved():
    hours='Monday: 8 AM - 5 PM\nTuesday: 9 AM - 7 PM\nSaturday: By Appointment\nSunday: Closed'
    r=client.put('/api/businesses/bloom/settings',json={'hours':hours})
    assert r.status_code==200, r.text
    assert client.get('/api/businesses/bloom/dashboard').json()['business']['hours']==hours


def test_conversation_history_is_accessible_and_scoped():
    before=client.get('/api/businesses/bloom/conversations')
    assert before.status_code==200
    r=client.post('/api/businesses/bloom/chat',json={'message':'What are your hours?'})
    assert r.status_code==200, r.text
    sid=r.json()['session_id']
    after=client.get('/api/businesses/bloom/conversations')
    assert after.status_code==200
    transcript=next(c for c in after.json()['conversations'] if c['id']==sid)
    assert [m['role'] for m in transcript['messages']][-2:]==['user','assistant']
    assert transcript['messages'][-2]['content']=='What are your hours?'
    other=client.get('/api/businesses/hvac/conversations')
    assert other.status_code==200
    assert all(c['id']!=sid for c in other.json()['conversations'])
    assert client.get('/api/businesses/no-such-business/conversations').status_code==404
