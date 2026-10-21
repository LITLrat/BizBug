"""Mocked-provider tests: no live Google, Microsoft, or Twilio credentials needed."""
import os
import sys
import json
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as server
import integrations as x

client = TestClient(server.app)
ADMIN = {'Authorization':'Bearer calendar-test-token'}

def fixture_secure(monkeypatch):
    monkeypatch.setattr(server,'DEMO_MODE',False)
    monkeypatch.setattr(server,'ADMIN_TOKEN','calendar-test-token')
    monkeypatch.setenv('TOKEN_ENCRYPTION_KEY',Fernet.generate_key().decode())
    monkeypatch.setenv('PUBLIC_BASE_URL','https://assistant.example.com')
    monkeypatch.setenv('GOOGLE_CLIENT_ID','google-client')
    monkeypatch.setenv('GOOGLE_CLIENT_SECRET','google-secret')
    monkeypatch.setenv('MICROSOFT_CLIENT_ID','ms-client')
    monkeypatch.setenv('MICROSOFT_CLIENT_SECRET','ms-secret')
    monkeypatch.setenv('TWILIO_AUTH_TOKEN','test-auth-token')

def test_live_integration_endpoints_require_production_admin(monkeypatch):
    monkeypatch.setattr(server,'DEMO_MODE',True)
    assert client.post('/api/businesses/bloom/calendar/google/connect').status_code==403
    assert client.put('/api/businesses/bloom/sms-number',json={'number':'+18435550155'}).status_code==403
    fixture_secure(monkeypatch)
    assert client.post('/api/businesses/bloom/calendar/google/connect').status_code==401
    assert client.put('/api/businesses/bloom/booking-config',headers=ADMIN,json={'timezone':'Not/AZone','duration_min':60}).status_code==422


def test_calendar_oauth_one_time_and_encrypted(monkeypatch):
    fixture_secure(monkeypatch)
    for provider in ('google','microsoft'):
        bid = 'bloom' if provider=='google' else 'auto'
        a=client.post(f'/api/businesses/{bid}/calendar/{provider}/connect',headers=ADMIN)
        assert a.status_code==200,a.text
        from urllib.parse import urlparse, parse_qs
        uri=a.json()['authorize_url']
        assert (provider=='google' and 'accounts.google' in uri) or (provider=='microsoft' and 'microsoftonline' in uri)
        state=parse_qs(urlparse(uri).query)['state'][0]
        monkeypatch.setattr(x,'exchange_code',lambda p,code:{'access_token':'super-secret-access','refresh_token':'super-secret-refresh','expires_in':3600})
        callback=client.get(f'/api/calendar/oauth/{provider}/callback',params={'state':state,'code':'mock-code'})
        assert callback.status_code==200, callback.text
        assert client.get(f'/api/calendar/oauth/{provider}/callback',params={'state':state,'code':'mock-code'}).status_code==400
        with server.db() as c:
            conn=c.execute('SELECT * FROM calendar_connections WHERE business_id=?',(bid,)).fetchone()
            assert conn['provider']==provider and 'super-secret' not in conn['access_token']
            assert x.decrypt(conn['refresh_token'])=='super-secret-refresh'
    status=client.get('/api/businesses/bloom/integrations',headers=ADMIN).json()
    assert status['calendar']['provider']=='google'
    assert 'refresh_token' not in str(status)


def test_real_slot_filter_and_booking_confirmation(monkeypatch):
    fixture_secure(monkeypatch)
    bid='hvac'
    # One provider is mocked as active with its encrypted credentials.
    with server.WRITE_LOCK, server.db() as c:
        c.execute('INSERT OR REPLACE INTO calendar_connections(business_id,provider,access_token,refresh_token,expires_at,connected_at) VALUES(?,?,?,?,?,?)',
            (bid,'google',x.encrypt('token'),x.encrypt('refresh'),9999999999,server.utc_now()))
    monkeypatch.setattr(x,'busy_ranges',lambda c,b,start,end:[])
    with server.db() as c:
        slots=x.live_slots(c,bid,12)
    assert slots and len(slots)==12
    with server.db() as c:
        assert x.verify_slot_available(c,bid,slots[0]['value'])
    assert client.get('/api/businesses/hvac/slots').json()['connected']
    events=[]
    def fake_event(c,b,uid,name,email,service,slot):
        events.append((b,service,slot))
        return 'mock-google-event-'+uuid.uuid4().hex
    monkeypatch.setattr(x,'create_event',fake_event)
    def send(message,session=None):
        r=client.post('/api/businesses/hvac/chat',json={'message':message,'session_id':session})
        assert r.status_code==200,r.text
        return r.json()
    r=send('Book appointment')
    r=send('SERVICE::AC repair',r['session_id'])
    assert r['options']
    r=send(r['options'][0],r['session_id'])
    r=send('Charlie Example',r['session_id'])
    r=send('charlie@example.net',r['session_id'])
    assert 'confirmed' in r['reply'].lower()
    assert len(events)==1
    appts=client.get('/api/businesses/hvac/dashboard',headers=ADMIN).json()['appointments']
    assert any(a['status']=='confirmed' and a['provider']=='google' and a['provider_event_id'] for a in appts)


def test_calendar_failure_never_promises_confirmation(monkeypatch):
    fixture_secure(monkeypatch)
    # Existing mocked account from prior test, if present, must fail closed.
    with server.db() as c:
        con=c.execute('SELECT 1 FROM calendar_connections WHERE business_id=?',('hvac',)).fetchone()
    if not con:
        with server.WRITE_LOCK, server.db() as c:
            c.execute('INSERT OR REPLACE INTO calendar_connections(business_id,provider,access_token,refresh_token,expires_at,connected_at) VALUES(?,?,?,?,?,?)',
                ('hvac','google',x.encrypt('token'),x.encrypt('refresh'),9999999999,server.utc_now()))
    def fail(*args):
        raise x.IntegrationError('API unavailable')
    monkeypatch.setattr(x,'busy_ranges',fail)
    r=client.get('/api/businesses/hvac/slots')
    assert r.status_code==200 and r.json()['connected'] and not r.json()['slots']
    chat=client.post('/api/businesses/hvac/chat',json={'message':'Book appointment'}).json()
    chat=client.post('/api/businesses/hvac/chat',json={'message':'SERVICE::AC repair','session_id':chat['session_id']}).json()
    assert chat['stage']=='' and not any(s.startswith('SLOT::') for s in chat['options'])


def test_signed_sms_thread_handoff_and_idempotency(monkeypatch):
    fixture_secure(monkeypatch)
    number='+18435550155'
    r=client.put('/api/businesses/auto/sms-number',json={'number':number},headers=ADMIN)
    assert r.status_code==200,r.text
    def receive(body,sid=None,from_='+19195550177',to=number,signature_valid=True):
        sid=sid or 'SM'+uuid.uuid4().hex
        params={'To':to,'From':from_,'Body':body,'MessageSid':sid,'NumMedia':'0'}
        from urllib.parse import urlencode
        form=urlencode(params)
        sig=x.twilio_signature('https://assistant.example.com/api/sms/twilio',params,'test-auth-token') if signature_valid else 'invalid'
        return client.post('/api/sms/twilio',data=form,headers={'X-Twilio-Signature':sig,'Content-Type':'application/x-www-form-urlencoded'}),sid
    invalid,_=receive('Hi',signature_valid=False)
    assert invalid.status_code==403
    one,sid=receive('Hi')
    assert one.status_code==200 and 'Harbor Auto Care' in one.text
    duplicate,_=receive('Hi',sid)
    assert duplicate.text==one.text
    a,_=receive('Leave a message');assert 'name' in a.text.lower()
    b,_=receive('Jamie SMS');assert 'email' in b.text.lower()
    c,_=receive('jamie@example.com');assert 'help' in c.text.lower()
    d,_=receive('Need brake pads');assert 'saved' in d.text.lower()
    dash=client.get('/api/businesses/auto/dashboard',headers=ADMIN).json()
    assert any(l['phone']=='+19195550177' and l['source']=='sms' and l['email']=='jamie@example.com' for l in dash['leads'])
    stop,_=receive('STOP');assert '<Message>' not in stop.text
    blocked,_=receive('What are your hours?');assert '<Message>' not in blocked.text
    start,_=receive('START');assert '<Message>' not in start.text
    helped,_=receive('HELP');assert 'STOP' in helped.text


def test_sms_phone_isolation(monkeypatch):
    fixture_secure(monkeypatch)
    # Unknown destinations are not routed to any business.
    params={'To':'+18005550000','From':'+19195550177','Body':'Hey','MessageSid':'SM'+uuid.uuid4().hex}
    from urllib.parse import urlencode
    sig=x.twilio_signature('https://assistant.example.com/api/sms/twilio',params,'test-auth-token')
    r=client.post('/api/sms/twilio',data=urlencode(params),headers={'X-Twilio-Signature':sig,'Content-Type':'application/x-www-form-urlencoded'})
    assert r.status_code==200 and '<Message>' not in r.text


def test_google_and_outlook_busy_intervals(monkeypatch):
    fixture_secure(monkeypatch)
    from datetime import timezone
    start=datetime.now(timezone.utc).replace(minute=0,second=0,microsecond=0)
    end=start+timedelta(hours=3)
    calls=[]
    def fake_req(method,url,token,json_body=None):
        calls.append(url)
        if 'googleapis' in url:
            return {'calendars':{'primary':{'busy':[{'start':start.isoformat(),
                'end':(start+timedelta(hours=1)).isoformat()}]}}}
        return {'value':[{'start':{'dateTime':start.replace(tzinfo=None).isoformat(),'timeZone':'UTC'},
                          'end':{'dateTime':(start+timedelta(minutes=30)).replace(tzinfo=None).isoformat(),'timeZone':'UTC'},
                          'showAs':'busy','isCancelled':False},
                         {'start':{'dateTime':start.replace(tzinfo=None).isoformat(),'timeZone':'UTC'},
                          'end':{'dateTime':end.replace(tzinfo=None).isoformat(),'timeZone':'UTC'},
                          'showAs':'free','isCancelled':False}]}
    monkeypatch.setattr(x,'graph_or_google',fake_req)
    with server.WRITE_LOCK,server.db() as c:
        for bid,provider in [('bloom','google'),('auto','microsoft')]:
            c.execute('INSERT OR REPLACE INTO calendar_connections(business_id,provider,access_token,refresh_token,expires_at,connected_at) VALUES(?,?,?,?,?,?)',
                (bid,provider,x.encrypt('access'),x.encrypt('refresh'),9999999999,server.utc_now()))
        for bid in ['bloom','auto']:
            busy=x.busy_ranges(c,bid,start,end)
            assert len(busy)==1 and busy[0][0]==start
    assert any('freeBusy' in call for call in calls)
    assert any('calendarView' in call for call in calls)


def test_sms_no_email_lead_and_booking_calendar_outage(monkeypatch):
    fixture_secure(monkeypatch)
    with server.WRITE_LOCK,server.db() as c:
        c.execute('INSERT OR REPLACE INTO sms_numbers(number,business_id,configured_at) VALUES(?,?,?)',
            ('+18435550155','auto',server.utc_now()))
    def receive(body,from_='+19195550001'):
        from urllib.parse import urlencode
        params={'To':'+18435550155','From':from_,'Body':body,'MessageSid':'SM'+uuid.uuid4().hex}
        signature=x.twilio_signature('https://assistant.example.com/api/sms/twilio',params,'test-auth-token')
        r=client.post('/api/sms/twilio',data=urlencode(params),headers={'X-Twilio-Signature':signature,'Content-Type':'application/x-www-form-urlencoded'})
        assert r.status_code==200,r.text
        return r.text
    assert 'name' in receive('Leave a message').lower()
    assert 'email' in receive('Morgan No Email').lower()
    assert 'help' in receive('SKIP').lower()
    assert 'saved' in receive('My brake pads are worn').lower()
    with server.db() as c:
        assert c.execute('SELECT 1 FROM leads WHERE business_id=? AND phone=? AND email=?',
                         ('auto','+19195550001','')).fetchone()

    # Mock provider temporarily working for slot selection, then an outage at final confirmation.
    with server.WRITE_LOCK,server.db() as c:
        c.execute('INSERT OR REPLACE INTO calendar_connections(business_id,provider,access_token,refresh_token,expires_at,connected_at) VALUES(?,?,?,?,?,?)',
            ('auto','microsoft',x.encrypt('access'),x.encrypt('refresh'),9999999999,server.utc_now()))
    monkeypatch.setattr(x,'busy_ranges',lambda c,b,start,end:[])
    r=receive('Book appointment',from_='+19195550002')
    assert '1.' in r
    r=receive('1',from_='+19195550002')
    assert '1.' in r
    r=receive('1',from_='+19195550002')
    assert 'name' in r.lower()
    r=receive('Morgan Booking',from_='+19195550002')
    assert 'email' in r.lower()
    def fail(*args):
        raise x.IntegrationError('Mock outage')
    monkeypatch.setattr(x,'busy_ranges',fail)
    final=receive('SKIP',from_='+19195550002')
    assert 'not a confirmed booking' in final.lower()
    with server.db() as c:
        assert c.execute('SELECT 1 FROM appointments WHERE business_id=? AND name=? AND status=?',
                         ('auto','Morgan Booking','requested')).fetchone()
