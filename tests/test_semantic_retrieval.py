"""Semantic retrieval regression tests; all external model calls are mocked."""
import json
import os
import sys
from pathlib import Path
from unittest.mock import Mock

os.environ['DEMO_MODE'] = 'true'
os.environ['DATABASE_PATH'] = '/tmp/bizbug-semantic-tests.sqlite3'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as server
import semantic_retrieval as semantic
from fastapi.testclient import TestClient

client = TestClient(server.app)


def create_business(name):
    res = client.post('/api/businesses', json={'name': name})
    assert res.status_code == 200, res.text
    return res.json()['id']


def add_faq(bid, title, answer):
    r = client.post(f'/api/businesses/{bid}/faqs',json={'question':title,'answer':answer})
    assert r.status_code == 200, r.text


def embedding_model(texts, _key, _model):
    """Simulated semantic vectors: longer hair means extensions, not haircuts."""
    vectors = []
    for text in texts:
        low=text.lower()
        if 'want longer hair' in low or 'make my hair longer' in low or 'extensions' in low:
            vectors.append([1.0, 0.0, 0.0])
        elif 'helicopter' in low or 'helicopters' in low:
            vectors.append([0.0, 0.0, 1.0])
        else:
            vectors.append([0.0, 1.0, 0.0])
    return vectors


def test_retrieval_understands_indirect_phrase_and_is_tenant_scoped(monkeypatch):
    monkeypatch.setattr(server, 'OPENAI_API_KEY', 'test-only-key')
    monkeypatch.setattr(server, 'SEMANTIC_SEARCH_ENABLED', True)
    monkeypatch.setattr(semantic, 'embed_texts', embedding_model)
    observed=[]
    def grounded(_business, _faqs, _msg, _lang, evidence=None):
        observed.append(evidence)
        return 'We offer hair extensions for $400.' if evidence else None
    monkeypatch.setattr(server, 'optional_ai_reply', grounded)
    a=create_business('Semantic Salon A')
    b=create_business('Semantic Salon B')
    add_faq(a, 'pricing', 'Haircut $30 Haircut and Style $45 Extensions $400')
    add_faq(b, 'pricing', 'Dog grooming $55')

    reply=client.post(f'/api/businesses/{a}/chat',json={'message':'I want longer hair, what can you do?'}).json()['reply']
    assert reply=='We offer hair extensions for $400.'
    assert observed[-1][0]['kind']=='price'
    assert observed[-1][0]['label']=='Extensions'
    # Another business does NOT see A's data or A's embeddings.
    other=client.post(f'/api/businesses/{b}/chat',json={'message':'I want longer hair, what can you do?'}).json()['reply']
    assert '$400' not in other
    with server.db() as c:
        a_keys={r['source_key'] for r in c.execute('SELECT source_key FROM knowledge_embeddings WHERE business_id=?',(a,))}
        b_keys={r['source_key'] for r in c.execute('SELECT source_key FROM knowledge_embeddings WHERE business_id=?',(b,))}
    assert any('price:' in key for key in a_keys)
    assert not any('price:' in key for key in b_keys)


def test_cache_reuses_embeddings_and_refreshes_changed_content(monkeypatch):
    bid=create_business('Caching Salon')
    add_faq(bid,'services','We offer extensions.')
    requests=[]
    def fake(texts, _key, _model):
        requests.append(list(texts))
        return [[1,0] if 'extension' in text.lower() or 'longer hair' in text.lower() else [0,1] for text in texts]
    monkeypatch.setattr(semantic, 'embed_texts', fake)
    with server.db() as c:
        biz=server.business_or_404(c,bid)
        faqs=[dict(x) for x in c.execute('SELECT * FROM faqs WHERE business_id=?',(bid,))]
        first=semantic.retrieve(c,bid,biz,faqs,'longer hair','key',threshold=.55)
        assert first
        second=semantic.retrieve(c,bid,biz,faqs,'longer hair','key',threshold=.55)
        assert second
    assert len(requests[0])>1
    assert len(requests[1])==1
    with server.db() as c:
        c.execute('UPDATE faqs SET answer=? WHERE business_id=?',('We offer extensions and wigs.',bid))
    with server.db() as c:
        biz=server.business_or_404(c,bid)
        faqs=[dict(x) for x in c.execute('SELECT * FROM faqs WHERE business_id=?',(bid,))]
        semantic.retrieve(c,bid,biz,faqs,'longer hair','key',threshold=.55)
    assert len(requests[2])==2  # query + modified FAQ, all other docs cached


def test_unrelated_question_fails_closed(monkeypatch):
    monkeypatch.setattr(server,'OPENAI_API_KEY','test-only-key')
    monkeypatch.setattr(server,'SEMANTIC_SEARCH_ENABLED',True)
    monkeypatch.setattr(semantic,'embed_texts',embedding_model)
    generator=Mock(return_value='Unverified confident answer')
    monkeypatch.setattr(server,'optional_ai_reply',generator)
    bid=create_business('Safe FAQ Salon')
    add_faq(bid,'pricing','Extensions $400')
    resp=client.post(f'/api/businesses/{bid}/chat',json={'message':'Can you land helicopters?'}).json()['reply']
    assert 'verified answer' in resp.lower()
    generator.assert_not_called()


def test_embedding_outage_falls_back_and_no_key_skips_embeddings(monkeypatch):
    bid=create_business('Fallback Salon')
    add_faq(bid,'hours','We close at 6 PM on Friday.')
    monkeypatch.setattr(server,'OPENAI_API_KEY','test-only-key')
    monkeypatch.setattr(server,'SEMANTIC_SEARCH_ENABLED',True)
    def offline(*_args):
        raise TimeoutError('Simulated embedding outage')
    monkeypatch.setattr(semantic,'embed_texts',offline)
    monkeypatch.setattr(server,'optional_ai_reply',Mock(return_value=None))
    res=client.post(f'/api/businesses/{bid}/chat',json={'message':'hours'}).json()['reply']
    assert '6 PM' in res
    monkeypatch.setattr(server,'OPENAI_API_KEY','')
    res=client.post(f'/api/businesses/{bid}/chat',json={'message':'hours'}).json()['reply']
    assert '6 PM' in res


def test_passages_split_prices_and_preserve_provided_facts():
    passages=semantic.make_passages({'knowledge':'You may cancel within 24 hours.','services':['Hair extensions'],'hours':'Tue-Sat','location':'Charleston'},[
        {'id':1,'question':'Pricing','answer':'Haircut $30 Haircut and Style $45 Extensions $400','answer_es':'','keywords':''}
    ])
    prices=[e for e in passages if e['kind']=='price']
    assert len(prices)==3
    assert [(x['label'],x['price']) for x in prices]==[('Haircut','$30'),('Haircut and Style','$45'),('Extensions','$400')]
    assert any('cancel within 24 hours' in x['text'] for x in passages)
