from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_explicit_spanish_preference_controls_reply_language():
    r = client.post('/api/businesses/bloom/chat', json={'message': 'Book appointment', 'language': 'es'})
    assert r.status_code == 200
    data = r.json()
    assert data['language'] == 'es'
    assert 'servicio' in data['reply'].lower()


def test_language_preference_optional_for_existing_sms_sessions():
    r = client.post('/api/businesses/bloom/chat', json={'message': 'Book appointment'})
    assert r.status_code == 200
    assert r.json()['language'] == 'en'


def test_rejects_invalid_language_values():
    r = client.post('/api/businesses/bloom/chat', json={'message': 'Hello', 'language': 'xx'})
    assert r.status_code == 422
