"""Business-scoped CRM persistence and reporting for BizBug.

All CRM data is visible only through admin-protected routes. Automatic tasks are
internal reminders; they never send messages or contact customers.
"""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException

STAGES = ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')
TASK_STATUSES = ('open', 'done')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def setup(c):
    """Idempotent migration for existing businesses and historical leads."""
    fields = {row['name'] for row in c.execute('PRAGMA table_info(leads)')}
    additions = {
        'stage': "TEXT NOT NULL DEFAULT 'new'",
        'deal_value': 'REAL NOT NULL DEFAULT 0',
        'owner': "TEXT NOT NULL DEFAULT ''",
        'updated_at': 'TEXT',
        'chat_id': 'TEXT',
    }
    for col, definition in additions.items():
        if col not in fields:
            c.execute(f'ALTER TABLE leads ADD COLUMN {col} {definition}')
    c.executescript("""
    CREATE TABLE IF NOT EXISTS crm_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL,
      lead_id INTEGER,
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      due_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      kind TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(business_id) REFERENCES businesses(id),
      FOREIGN KEY(lead_id) REFERENCES leads(id)
    );
    CREATE INDEX IF NOT EXISTS crm_tasks_owner_due ON crm_tasks(business_id,status,due_at);
    CREATE UNIQUE INDEX IF NOT EXISTS crm_initial_task
      ON crm_tasks(business_id,lead_id,kind)
      WHERE kind='initial-follow-up' AND lead_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS crm_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL,
      lead_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id),
      FOREIGN KEY(lead_id) REFERENCES leads(id)
    );
    CREATE INDEX IF NOT EXISTS crm_events_lead ON crm_events(business_id,lead_id,id);
    CREATE TRIGGER IF NOT EXISTS crm_new_lead_tasks
    AFTER INSERT ON leads WHEN NEW.source != 'sample'
    BEGIN
      INSERT OR IGNORE INTO crm_tasks(business_id,lead_id,title,details,due_at,status,kind,created_at)
      VALUES(NEW.business_id,NEW.id,'Follow up with ' || NEW.name,
      'Review the new customer inquiry and decide on the next step.',
      strftime('%Y-%m-%dT%H:%M:%S+00:00','now','+1 day'),
      'open','initial-follow-up',strftime('%Y-%m-%dT%H:%M:%S+00:00','now'));
      INSERT INTO crm_events(business_id,lead_id,kind,details,created_at)
      VALUES(NEW.business_id,NEW.id,'captured','Lead captured via ' || NEW.source,
      strftime('%Y-%m-%dT%H:%M:%S+00:00','now'));
    END;
    """)
    # Existing real leads get the same single reminder; sample leads stay illustrative.
    c.execute("""
      INSERT OR IGNORE INTO crm_tasks(business_id,lead_id,title,details,due_at,status,kind,created_at)
      SELECT l.business_id,l.id,'Follow up with '||l.name,
       'Review this existing customer inquiry and decide on the next step.',
       ?, 'open','initial-follow-up',?
      FROM leads l WHERE l.source!='sample'
    """, ((datetime.now(timezone.utc)+timedelta(days=1)).isoformat(timespec='seconds'), now()))


def require_lead(c, bid, lead_id):
    item = c.execute('SELECT * FROM leads WHERE id=? AND business_id=?', (lead_id,bid)).fetchone()
    if not item:
        raise HTTPException(404, 'Contact not found in this business')
    return dict(item)


def require_task(c, bid, task_id):
    item = c.execute('SELECT * FROM crm_tasks WHERE id=? AND business_id=?', (task_id,bid)).fetchone()
    if not item:
        raise HTTPException(404, 'Task not found in this business')
    return dict(item)


def add_event(c, bid, lead_id, kind, details):
    c.execute('INSERT INTO crm_events(business_id,lead_id,kind,details,created_at) VALUES(?,?,?,?,?)',
              (bid,lead_id,kind,details,now()))


def create_lead(c, bid, body):
    t=now()
    cur=c.execute("""INSERT INTO leads(business_id,name,email,phone,source,note,created_at,stage,deal_value,owner,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (bid,body.name.strip(),body.email.strip(),body.phone.strip(),'manual',body.note.strip(),t,
         body.stage,body.deal_value,body.owner.strip(),t))
    return require_lead(c,bid,cur.lastrowid)


def update_lead(c, bid, lead_id, changes):
    existing=require_lead(c,bid,lead_id)
    if not changes:
        return existing
    changes['updated_at']=now()
    c.execute('UPDATE leads SET '+','.join(f'{k}=?' for k in changes)+' WHERE business_id=? AND id=?',
              [*changes.values(),bid,lead_id])
    if changes.get('stage') and changes['stage']!=existing['stage']:
        add_event(c,bid,lead_id,'stage',f"Pipeline: {existing['stage']} → {changes['stage']}")
    if 'deal_value' in changes and changes['deal_value']!=existing['deal_value']:
        add_event(c,bid,lead_id,'value',f"Opportunity value updated to ${changes['deal_value']:,.2f}")
    if 'owner' in changes and changes['owner']!=existing['owner']:
        add_event(c,bid,lead_id,'owner','Assigned to '+(changes['owner'] or 'Unassigned'))
    return require_lead(c,bid,lead_id)


def lead_detail(c, bid, lead_id):
    item=require_lead(c,bid,lead_id)
    events=[dict(x) for x in c.execute(
        'SELECT kind,details,created_at FROM crm_events WHERE business_id=? AND lead_id=? ORDER BY id DESC LIMIT 100',
        (bid,lead_id))]
    # Explicit chat linkage prevents one customer's messages leaking to another
    # contact that happens to share a name or an email address.
    messages=[]
    if item['chat_id']:
        messages=[dict(x) for x in c.execute(
            'SELECT role,content,created_at FROM messages WHERE business_id=? AND chat_id=? ORDER BY id DESC LIMIT 80',
            (bid,item['chat_id']))]
        messages.reverse()
    appointments=[dict(x) for x in c.execute(
        'SELECT service,starts_at,status,created_at FROM appointments WHERE business_id=? AND email=? AND email != ? ORDER BY id DESC LIMIT 20',
        (bid,item['email'],''))]
    tasks=[dict(x) for x in c.execute(
        'SELECT * FROM crm_tasks WHERE business_id=? AND lead_id=? ORDER BY id DESC LIMIT 50',
        (bid,lead_id))]
    return {'lead':item,'events':events,'messages':messages,'appointments':appointments,'tasks':tasks}


def note(c,bid,lead_id,text):
    require_lead(c,bid,lead_id)
    add_event(c,bid,lead_id,'note',text.strip())
    c.execute('UPDATE leads SET updated_at=? WHERE business_id=? AND id=?',(now(),bid,lead_id))
    return lead_detail(c,bid,lead_id)


def create_task(c,bid,body):
    if body.lead_id is not None:
        require_lead(c,bid,body.lead_id)
    t=now()
    cur=c.execute("""INSERT INTO crm_tasks(business_id,lead_id,title,details,due_at,status,kind,created_at)
                     VALUES(?,?,?,?,?,'open','manual',?)""",
                  (bid,body.lead_id,body.title.strip(),body.details.strip(),body.due_at,t))
    if body.lead_id:
        add_event(c,bid,body.lead_id,'task','Task created: '+body.title.strip())
    return require_task(c,bid,cur.lastrowid)


def update_task(c,bid,task_id,changes):
    existing=require_task(c,bid,task_id)
    if not changes:
        return existing
    if changes.get('lead_id') is not None:
        require_lead(c,bid,changes['lead_id'])
    if 'status' in changes:
        changes['completed_at']=now() if changes['status']=='done' else None
    c.execute('UPDATE crm_tasks SET '+','.join(f'{k}=?' for k in changes)+' WHERE business_id=? AND id=?',
              [*changes.values(),bid,task_id])
    if existing['lead_id'] and 'status' in changes and changes['status']!=existing['status']:
        add_event(c,bid,existing['lead_id'],'task','Task '+changes['status']+': '+existing['title'])
    return require_task(c,bid,task_id)


def snapshot(c,bid):
    counts={stage:0 for stage in STAGES}
    for item in c.execute("SELECT stage,COUNT(*) n FROM leads WHERE business_id=? AND source!='sample' GROUP BY stage",(bid,)):
        if item['stage'] in counts: counts[item['stage']]=item['n']
    amounts=c.execute("""SELECT
          COALESCE(SUM(CASE WHEN stage='won' THEN deal_value ELSE 0 END),0) won,
          COALESCE(SUM(CASE WHEN stage NOT IN ('won','lost') THEN deal_value ELSE 0 END),0) pipeline
          FROM leads WHERE business_id=? AND source!='sample'""",(bid,)).fetchone()
    today=datetime.now(timezone.utc).date().isoformat()
    tasks=[dict(x) for x in c.execute("""SELECT t.*,l.name AS contact_name
          FROM crm_tasks t LEFT JOIN leads l ON l.id=t.lead_id AND l.business_id=t.business_id
          WHERE t.business_id=? ORDER BY (t.status='done'), (t.due_at IS NULL),t.due_at,t.id DESC LIMIT 250""",(bid,))]
    open_tasks=sum(t['status']=='open' for t in tasks)
    overdue=sum(t['status']=='open' and t['due_at'] and t['due_at'][:10]<today for t in tasks)
    daily=[dict(x) for x in c.execute("""SELECT substr(created_at,1,10) day, COUNT(*) count
          FROM leads WHERE business_id=? AND source!='sample' AND created_at>=?
          GROUP BY substr(created_at,1,10) ORDER BY day""",
          (bid,(datetime.now(timezone.utc)-timedelta(days=29)).date().isoformat()))]
    total=sum(counts.values())
    closed=counts['won']+counts['lost']
    return {'stages':counts,'tasks':tasks,'open_tasks':open_tasks,'overdue_tasks':overdue,
            'pipeline_value':round(amounts['pipeline'],2),'won_value':round(amounts['won'],2),
            'closed_win_rate':round(100*counts['won']/closed,1) if closed else 0,
            'lead_count':total,'new_leads_30d':sum(d['count'] for d in daily),'daily_leads':daily}
