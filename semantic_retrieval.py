"""Tenant-scoped semantic search over verified business knowledge.

Calls the OpenAI embeddings API server-side only. Caches document vectors by
content fingerprint to avoid repeated charges. Never embeds customer lead data.
"""
import hashlib
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from urllib import request as urlrequest

EMBEDDING_MODEL = os.environ.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small')
MIN_SIMILARITY = min(0.95, max(0.30, float(os.environ.get('SEMANTIC_MIN_SIMILARITY', '0.40'))))
MAX_DOCUMENTS = 80
MAX_PASSAGE_LENGTH = 1100
MONEY = re.compile(r'\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?')


def setup(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS knowledge_embeddings (
      business_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      model TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      vector_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (business_id, source_key, model),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )''')


def _passages(text):
    """Split policies at natural boundaries, then chunk unusually long lines."""
    for paragraph in re.split(r'\n\s*\n|(?<=\.)\s*\n', text or ''):
        paragraph = paragraph.strip()
        while paragraph:
            if len(paragraph) <= MAX_PASSAGE_LENGTH:
                yield paragraph
                break
            stop = paragraph.rfind(' ', 0, MAX_PASSAGE_LENGTH)
            if stop < MAX_PASSAGE_LENGTH // 2:
                stop = MAX_PASSAGE_LENGTH
            yield paragraph[:stop].strip()
            paragraph = paragraph[stop:].strip()


def _price_rows(answer):
    """Split a price menu into distinct evidence passages to avoid mixed-up prices."""
    matches = list(MONEY.finditer(answer or ''))
    if len(matches) < 2:
        return []
    rows = []
    prev = 0
    for item in matches:
        label = re.split(r'[\n;|•]', answer[prev:item.start()])[-1].strip(' \r\t:,-–.')
        prev = item.end()
        if label and len(label) < 130:
            rows.append((label, item.group(0).replace(' ', '')))
    return rows if len(rows) >= 2 else []


def make_passages(business, faqs):
    """Keep the index deterministic, bounded and strictly business specific."""
    entries = []
    for faq in faqs[:MAX_DOCUMENTS]:
        fid = str(faq['id'])
        rows = _price_rows(faq.get('answer') or '')
        if rows:
            for idx, (service, price) in enumerate(rows):
                entries.append({'key': f'faq:{fid}:price:{idx}', 'kind': 'price',
                                'label': service, 'price': price,
                                'text': f'Service: {service}. Price: {price}. '})
        else:
            text = ('Question: ' + (faq.get('question') or '') + '\n'
                    + 'Answer: ' + (faq.get('answer') or '') + '\n'
                    + 'Keywords: ' + (faq.get('keywords') or ''))[:MAX_PASSAGE_LENGTH]
            if faq.get('answer_es'):
                text += '\nRespuesta: ' + faq['answer_es'][:350]
            entries.append({'key': f'faq:{fid}', 'kind': 'faq', 'text': text})
    for idx, passage in enumerate(_passages((business.get('knowledge') or '')[:25000])):
        entries.append({'key': f'knowledge:{idx}', 'kind': 'policy', 'text': passage})
    # Business hours and location are always factual but should still be retrievable.
    entries.extend([
        {'key':'details:hours','kind':'details','text':f'Business hours: {business.get("hours") or "Not provided"}'},
        {'key':'details:location','kind':'details','text':f'Business location: {business.get("location") or "Not provided"}'},
        {'key':'details:services','kind':'details','text':'Available services: '+', '.join(business.get('services') or [])},
    ])
    return entries[:MAX_DOCUMENTS]


def _fingerprint(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def embed_texts(texts, api_key, model=EMBEDDING_MODEL):
    """Request a batch of embeddings, respecting response ordering by index."""
    if not texts:
        return []
    payload = json.dumps({'model': model, 'input': texts}).encode()
    req = urlrequest.Request('https://api.openai.com/v1/embeddings', data=payload,
             headers={'Authorization':'Bearer '+api_key, 'Content-Type':'application/json'}, method='POST')
    with urlrequest.urlopen(req, timeout=8) as response:
        data = json.load(response)
    raw = sorted(data.get('data') or [], key=lambda x: x['index'])
    vectors = [item['embedding'] for item in raw]
    if len(vectors) != len(texts) or any(not v or not all(math.isfinite(float(n)) for n in v) for v in vectors):
        raise ValueError('Invalid embedding result')
    return vectors


def _cosine(a, b):
    if len(a) != len(b) or not a:
        return -1.0
    numerator = sum(x*y for x,y in zip(a,b))
    magnitude = math.sqrt(sum(x*x for x in a)*sum(y*y for y in b))
    return numerator / magnitude if magnitude else -1.0


def retrieval_query(message):
    """Add terminology to clearly expressed user intents, not to source facts.

    Expanded terms are search hints only. Assistant replies must still be
    grounded in business-authored FAQ passages and policies.
    """
    low = message.lower()
    if (re.search(r'\b(hair|stylist|salon|highlight|streaks|balayage)\b', low)
            and re.search(r'\b(lighter|lighten|blended|streaks?|highlight(?:s|ing)?|balayage)\b', low)):
        return message + '\nSearch concepts: hair highlights, balayage color consultation.'
    return message


def retrieve(conn, bid, business, faqs, message, api_key, *, model=None,
             threshold=None, top_k=3):
    """Return matching evidence or [] when disabled, unrelated, or API unavailable.

    Caller can safely fall back to the existing lexical matcher on any failure.
    """
    if not api_key:
        return []
    model = model or EMBEDDING_MODEL
    threshold = MIN_SIMILARITY if threshold is None else threshold
    entries = make_passages(business, faqs)
    if not entries:
        return []
    setup(conn)
    cache = {(r['source_key'], r['model']):r for r in conn.execute(
        'SELECT source_key,model,fingerprint,vector_json FROM knowledge_embeddings WHERE business_id=? AND model=?',
        (bid,model))}
    vectors, missing = {}, []
    for entry in entries:
        record = cache.get((entry['key'],model))
        if record and record['fingerprint'] == _fingerprint(entry['text']):
            try:
                vectors[entry['key']] = json.loads(record['vector_json'])
                continue
            except (TypeError, ValueError):
                pass
        missing.append(entry)
    try:
        # Query + uncached evidence in one request. Cached documents aren't rebilled.
        embedded = embed_texts([retrieval_query(message)] + [e['text'] for e in missing],api_key,model)
    except Exception as exc:
        # Never log customer questions or secrets while troubleshooting.
        logging.warning('Semantic embeddings unavailable (%s; status=%s)',
                        type(exc).__name__, getattr(exc, 'code', 'n/a'))
        return []
    query_vector = embedded[0]
    for i, entry in enumerate(missing):
        vector = embedded[i+1]
        vectors[entry['key']] = vector
        conn.execute('''INSERT INTO knowledge_embeddings (business_id,source_key,model,fingerprint,vector_json,updated_at)
                        VALUES(?,?,?,?,?,?) ON CONFLICT(business_id,source_key,model) DO UPDATE SET
                        fingerprint=excluded.fingerprint,vector_json=excluded.vector_json,
                        updated_at=excluded.updated_at''',
                     (bid,entry['key'],model,_fingerprint(entry['text']),json.dumps(vector),
                      datetime.now(timezone.utc).isoformat()))
    current = {e['key'] for e in entries}
    # Rebuild when saved FAQs / policies change: remove superseded passages.
    for (source, _) in cache:
        if source not in current:
            conn.execute('DELETE FROM knowledge_embeddings WHERE business_id=? AND model=? AND source_key=?',
                         (bid,model,source))
    scored = sorted((( _cosine(query_vector,vectors[e['key']]),e) for e in entries),
                    key=lambda item:item[0], reverse=True)
    return [dict(entry,score=round(score,4)) for score,entry in scored
            if score>=threshold][:max(1,min(top_k,5))]
