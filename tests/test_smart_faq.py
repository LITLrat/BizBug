from fastapi.testclient import TestClient
from app import app, price_answer

client = TestClient(app)


def test_generic_pricing_faq_supports_specific_questions():
    r = client.post('/api/businesses', json={'name': 'Test Price Salon', 'category': 'Beauty & wellness'})
    assert r.status_code == 200
    bid = r.json()['id']
    assert client.post(f'/api/businesses/{bid}/faqs', json={
        'question': 'pricing',
        'answer': 'Haircut $30 Haircut and Style $45 Extensions $400',
        'keywords': ''
    }).status_code == 200
    for question, expected, excluded in [
        ('How much are extensions?', '$400', ('$30', '$45')),
        ('How much does an extension cost?', '$400', ('$30', '$45')),
        ('How much is a haircut and style?', '$45', ('$30', '$400')),
        ('How much is a haircut?', '$30', ('$45', '$400')),
    ]:
        reply = client.post(f'/api/businesses/{bid}/chat', json={'message': question}).json()['reply']
        assert expected in reply, (question, reply)
        assert not any(price in reply for price in excluded), (question, reply)
    generic = client.post(f'/api/businesses/{bid}/chat', json={'message': 'What is your pricing?'}).json()['reply']
    assert 'Extensions $400' in generic
    missing = client.post(f'/api/businesses/{bid}/chat', json={'message': 'How much is eyebrow threading?'}).json()['reply']
    assert '$400' not in missing and '$30' not in missing

    other = client.post('/api/businesses', json={'name': 'Other Test Business', 'category': 'Other'}).json()['id']
    other_reply = client.post(f'/api/businesses/{other}/chat', json={'message': 'How much are extensions?'}).json()['reply']
    assert '$400' not in other_reply


def test_price_lookup_in_saved_business_knowledge():
    bid = client.post('/api/businesses', json={'name': 'Test Menu', 'category': 'Other'}).json()['id']
    assert client.put(f'/api/businesses/{bid}/settings', json={
        'knowledge': 'Consultation $80 Equipment setup $250',
    }).status_code == 200
    reply = client.post(f'/api/businesses/{bid}/chat', json={'message': 'What does equipment setup cost?'}).json()['reply']
    assert '$250' in reply and '$80' not in reply


def test_price_lookup_does_not_invent_unlisted_prices():
    faqs = [{'question': 'pricing', 'answer': 'Haircut $30 Haircut and Style $45 Extensions $400'}]
    assert price_answer(faqs, '', 'What do extensions cost?') == 'Extensions: $400'
    assert price_answer(faqs, '', 'How much are perms?') is None
    assert price_answer(faqs, '', 'What colors of extensions are available?') is None
