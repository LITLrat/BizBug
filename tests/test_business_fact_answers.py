"""Broad informational questions must use complete, business-scoped configuration."""
import os
import sys
from pathlib import Path
from unittest.mock import Mock
import pytest

os.environ.setdefault('DEMO_MODE', 'true')
os.environ.setdefault('DATABASE_PATH', '/tmp/bizbug-facts-tests.sqlite3')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as server
from fastapi.testclient import TestClient

client = TestClient(server.app)


@pytest.fixture(autouse=True)
def do_not_spend_the_shared_rate_limit_budget_in_tests(monkeypatch):
    # The production limiter remains enabled. Keep many synthetic chat requests
    # in these regression tests from making later unrelated tests hit HTTP 429.
    monkeypatch.setattr(server, 'rate_limit', lambda _ip: None)


def chat(bid, message, language=None, session_id=None):
    response = client.post(f'/api/businesses/{bid}/chat', json={
        'message': message, 'language': language, 'session_id': session_id})
    assert response.status_code == 200, response.text
    return response.json()


def test_every_configured_service_is_listed_in_owner_order_even_with_ai_enabled(monkeypatch):
    monkeypatch.setattr(server, 'OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(server.semantic, 'retrieve', Mock(side_effect=AssertionError('should not embed structured fact questions')))
    questions = (
        'List all services that you offer',
        'What services do you have?',
        'Tell me which treatments are available',
        'What do you offer?',
        'Which services can I book an appointment for?',
        'Can you show me your service menu?',
    )
    expected = ['Women’s haircut', 'Color consultation', 'Balayage', 'Blowout']
    for question in questions:
        result = chat('bloom', question)
        assert result['stage'] == ''
        assert all(f'• {item}' in result['reply'] for item in expected), (question, result)
        assert [result['reply'].index(item) for item in expected] == sorted(result['reply'].index(item) for item in expected)
        assert '$55' not in result['reply']
        assert result['options'] == ['Book appointment']


def test_owner_settings_change_immediately_affects_list_and_tenant_isolation(monkeypatch):
    monkeypatch.setattr(server, 'OPENAI_API_KEY', '')
    a = client.post('/api/businesses',json={'name':'Test Widget Workshop'}).json()['id']
    b = client.post('/api/businesses',json={'name':'Test Stone Workshop'}).json()['id']
    assert client.put(f'/api/businesses/{a}/settings',json={
        'services':['Custom screen repair','Battery replacement'],
        'hours':'Monday: 8 AM–6 PM\nTuesday: By appointment',
        'location':'150 Example Road, SC'}).status_code==200
    assert client.put(f'/api/businesses/{b}/settings',json={'services':['Stone cutting']}).status_code==200
    list_a=chat(a,'What services do you provide?')['reply']
    list_b=chat(b,'What services do you provide?')['reply']
    assert 'Custom screen repair' in list_a and 'Battery replacement' in list_a
    assert 'Stone cutting' not in list_a
    assert 'Stone cutting' in list_b and 'Battery replacement' not in list_b
    hours=chat(a,'Are you open on Tuesday?')['reply']
    assert 'By appointment' in hours and '\n' in hours
    assert '150 Example Road' in chat(a,'Where are you located?')['reply']


def test_spanish_services_and_workflow_intents_stay_distinct():
    es=chat('bloom','¿Qué servicios ofrecen?')
    assert es['language']=='es'
    assert 'servicios' in es['reply'].lower() and '• Balayage' in es['reply']
    assert es['options']==['Solicitar cita']
    booking=chat('bloom','Book appointment')
    assert booking['stage']=='booking.service'
    assert 'SERVICE::Balayage' in booking['options']
    not_list=chat('bloom','How much is a haircut?')['reply']
    assert '$55' in not_list


def test_fact_classifier_avoids_irrelevant_questions():
    for message in ['How much is a haircut?', 'Can you book a haircut?',
                    'Is balayage available?', 'Why does my car need service?',
                    'Do you have an available appointment?', 'What can you do?']:
        assert server.business_fact_intent(message) is None, message
