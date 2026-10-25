"""BizBug Admin: separate tenant-aware management portal, not the public demo.

Run: BIZBUG_DEV_MODE=true BIZBUG_BOOTSTRAP_EMAIL=... BIZBUG_BOOTSTRAP_PASSWORD=...
     uvicorn admin_portal.main:app --port 8001
In production a PostgreSQL URL, HTTPS cookies, and bootstrap admin credentials are required.
"""
import hashlib
import os
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit
from typing import Literal

from argon2 import PasswordHasher, exceptions as argon_errors
from fastapi import FastAPI, Request, HTTPException, Depends, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, delete, update

from .storage import (metadata, make_engine, users, businesses, memberships, sessions,
                      leads, appointments, conversations, audit_log, utcnow)

BASE = Path(__file__).resolve().parent
DEV = os.getenv('BIZBUG_DEV_MODE', 'false').lower() == 'true'
SESSION_DAYS = 7
COOKIE = 'bizbug_admin_session'
csrf_header = 'x-bizbug-csrf'
engine = make_engine()
ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)
metadata.create_all(engine)
app = FastAPI(title='BizBug Admin', docs_url='/api/docs' if DEV else None, redoc_url=None)
app.mount('/assets', StaticFiles(directory=str(BASE / 'static')), name='assets')


def guid(): return str(uuid.uuid4())
def digest(value: str) -> str: return hashlib.sha256(value.encode()).hexdigest()
def record(row): return dict(row._mapping) if row is not None else None


def audit(conn, actor, action, bid=None, details=''):
    conn.execute(audit_log.insert().values(id=guid(), actor_id=actor, business_id=bid,
                                          action=action, details=details[:500], created_at=utcnow()))


def initialize_admin():
    email = os.getenv('BIZBUG_BOOTSTRAP_EMAIL', '').strip().lower()
    password = os.getenv('BIZBUG_BOOTSTRAP_PASSWORD', '')
    if not email or not password or len(password) < 14:
        raise RuntimeError('Set BIZBUG_BOOTSTRAP_EMAIL and a 14+ character BIZBUG_BOOTSTRAP_PASSWORD')
    with engine.begin() as conn:
        count = conn.execute(select(func.count()).select_from(users).where(users.c.role == 'agency_admin')).scalar_one()
        if count == 0:
            conn.execute(users.insert().values(id=guid(), email=email, name='BizBug Administrator',
                password_hash=ph.hash(password), role='agency_admin', enabled=1,
                must_change_password=0, created_at=utcnow()))

initialize_admin()

# Local per-IP guard supplements (but does not replace) edge/WAF rate limits.
login_attempts = defaultdict(deque)


@app.middleware('http')
async def secure_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in {
        'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
        'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    }.items(): response.headers[k] = v
    return response


def current_user(request: Request):
    token = request.cookies.get(COOKIE, '')
    if not token:
        raise HTTPException(401, 'Sign in required')
    with engine.connect() as c:
        row = c.execute(select(users, sessions.c.csrf_hash, sessions.c.expires_at).join(
            sessions, users.c.id == sessions.c.user_id).where(sessions.c.token_hash == digest(token))).first()
        if not row:
            raise HTTPException(401, 'Session expired')
        user = record(row)
        expiry = user['expires_at']
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=utcnow().tzinfo)
        if expiry <= utcnow() or not user['enabled']:
            raise HTTPException(401, 'Session expired')
        return user


def signed_in(request: Request):
    user = current_user(request)
    if user['must_change_password']:
        raise HTTPException(403, 'Change your temporary password before using BizBug')
    return user


def require_write(request: Request):
    u = current_user(request)
    csrf = request.headers.get(csrf_header, '')
    if not csrf or not secrets.compare_digest(digest(csrf), u['csrf_hash']):
        raise HTTPException(403, 'Missing or invalid CSRF token')
    return u


def ready_write(request: Request):
    u = require_write(request)
    if u['must_change_password']:
        raise HTTPException(403, 'Change your temporary password first')
    return u


def require_admin(user):
    if user['role'] != 'agency_admin':
        raise HTTPException(403, 'Agency administrator permission required')


def tenant_access(conn, user, bid):
    found = conn.execute(select(businesses).where(businesses.c.id == bid)).first()
    if not found:
        raise HTTPException(404, 'Business not found')
    if user['role'] != 'agency_admin':
        has_membership = conn.execute(select(memberships.c.user_id).where(and_(
            memberships.c.user_id == user['id'], memberships.c.business_id == bid))).first()
        if not has_membership:
            raise HTTPException(404, 'Business not found')  # conceal tenant existence
    details = record(found)
    if user['role'] != 'agency_admin':
        details.pop('notes', None)
    return details


class Login(BaseModel):
    email: str = Field(min_length=5, max_length=250)
    password: str = Field(min_length=1, max_length=256)

class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=14, max_length=256)

class NewBusiness(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    industry: str = Field(default='Other', max_length=100)
    email: str = Field(default='', max_length=250)
    phone: str = Field(default='', max_length=40)
    timezone: str = Field(default='America/New_York', max_length=80)
    plan: Literal['Trial', 'Starter', 'Growth', 'Pro'] = 'Trial'
    notes: str = Field(default='', max_length=3000)

class UpdateBusiness(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    industry: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=250)
    phone: str | None = Field(default=None, max_length=40)
    timezone: str | None = Field(default=None, max_length=80)
    plan: Literal['Trial', 'Starter', 'Growth', 'Pro'] | None = None
    status: Literal['trial', 'active', 'paused', 'cancelled'] | None = None
    notes: str | None = Field(default=None, max_length=3000)

class NewOwner(BaseModel):
    email: str = Field(min_length=5, max_length=250)
    name: str = Field(min_length=2, max_length=120)

class NewLead(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(default='', max_length=250)
    phone: str = Field(default='', max_length=40)
    summary: str = Field(default='', max_length=2000)

class LeadUpdate(BaseModel):
    status: Literal['new', 'contacted', 'qualified', 'closed']

class NewAppointment(BaseModel):
    customer: str = Field(min_length=2, max_length=120)
    service: str = Field(min_length=2, max_length=180)
    requested_for: str = Field(default='', max_length=90)

class AppointmentUpdate(BaseModel):
    status: Literal['requested', 'reviewing', 'cancelled']


@app.get('/')
def index(): return FileResponse(BASE/'static'/'index.html')

@app.get('/health')
def health(): return {'status':'ok', 'application':'bizbug-admin', 'mode':'development' if DEV else 'production'}

@app.post('/api/auth/login')
def login(body: Login, request: Request, response: Response):
    origin = request.headers.get('origin')
    if origin:
        parsed = urlsplit(origin)
        # Reverse proxies commonly terminate TLS before forwarding to Uvicorn.
        # Validate the browser-facing Host and require HTTPS outside local development.
        if parsed.netloc.lower() != request.headers.get('host', '').lower() or (not DEV and parsed.scheme != 'https'):
            raise HTTPException(403, 'Cross-site login rejected')
    ip = request.client.host if request.client else 'unknown'
    recent = login_attempts[ip]
    now = time.monotonic()
    while recent and recent[0] < now - 900: recent.popleft()
    if len(recent) >= 12: raise HTTPException(429, 'Too many sign-in attempts; try later')
    recent.append(now)
    with engine.begin() as c:
        row = c.execute(select(users).where(users.c.email == body.email.strip().lower())).first()
        u = record(row)
        ok = False
        try:
            if u and u['enabled']:
                ok = ph.verify(u['password_hash'], body.password)
        except (argon_errors.VerifyMismatchError, argon_errors.InvalidHashError):
            pass
        if not ok:
            raise HTTPException(401, 'Incorrect email or password')
        token, csrf = secrets.token_urlsafe(40), secrets.token_urlsafe(32)
        c.execute(sessions.insert().values(token_hash=digest(token), user_id=u['id'], csrf_hash=digest(csrf),
                                           expires_at=utcnow()+timedelta(days=SESSION_DAYS), created_at=utcnow()))
        audit(c, u['id'], 'auth.login')
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS*86400, secure=not DEV,
                        httponly=True, samesite='strict', path='/')
    return {'user': safe_user(u), 'csrf':csrf}


def safe_user(u):
    return {'id':u['id'], 'email':u['email'], 'name':u['name'], 'role':u['role'],
            'must_change_password':bool(u['must_change_password'])}


@app.get('/api/auth/me')
def me(request: Request):
    u = current_user(request)
    token = request.cookies.get(COOKIE)
    # Return session-specific CSRF value only after login: CSRF is stored hashed, so
    # issue a new value and rotate its hash on each /me fetch.
    csrf = secrets.token_urlsafe(32)
    with engine.begin() as c:
        c.execute(update(sessions).where(sessions.c.token_hash == digest(token)).values(csrf_hash=digest(csrf)))
    return {'user':safe_user(u), 'csrf':csrf}


@app.post('/api/auth/logout')
def logout(request: Request, response: Response, u=Depends(require_write)):
    with engine.begin() as c:
        c.execute(delete(sessions).where(sessions.c.token_hash == digest(request.cookies.get(COOKIE,''))))
        audit(c, u['id'], 'auth.logout')
    response.delete_cookie(COOKIE, path='/')
    return {'ok':True}


@app.post('/api/auth/change-password')
def change_password(body: PasswordChange, request: Request, u=Depends(require_write)):
    try: good = ph.verify(u['password_hash'], body.old_password)
    except (argon_errors.VerifyMismatchError, argon_errors.InvalidHashError): good = False
    if not good: raise HTTPException(400, 'Current password incorrect')
    if body.old_password == body.new_password: raise HTTPException(400, 'Use a different password')
    with engine.begin() as c:
        c.execute(update(users).where(users.c.id == u['id']).values(
            password_hash=ph.hash(body.new_password), must_change_password=0))
        audit(c, u['id'], 'auth.password_changed')
    return {'ok':True}


@app.get('/api/portal/businesses')
def available_businesses(u=Depends(signed_in)):
    with engine.connect() as c:
        stmt = select(businesses)
        if u['role'] != 'agency_admin':
            stmt = stmt.join(memberships, memberships.c.business_id == businesses.c.id).where(memberships.c.user_id == u['id'])
        stmt = stmt.order_by(businesses.c.created_at.desc())
        profiles = [record(r) for r in c.execute(stmt)]
        if u['role'] != 'agency_admin':
            for profile in profiles: profile.pop('notes', None)
        return profiles


@app.get('/api/admin/overview')
def overview(u=Depends(signed_in)):
    require_admin(u)
    with engine.connect() as c:
        counts = {k: c.execute(select(func.count()).select_from(t)).scalar_one() for k, t in
                  [('businesses',businesses),('leads',leads),('appointments',appointments),('conversations',conversations)]}
        recent = [record(r) for r in c.execute(select(audit_log).order_by(audit_log.c.created_at.desc()).limit(15))]
        counts['businesses_active'] = c.execute(select(func.count()).select_from(businesses).where(businesses.c.status=='active')).scalar_one()
        return {'counts':counts, 'recent_audit':recent}


@app.post('/api/admin/businesses', status_code=201)
def create_business(body: NewBusiness, u=Depends(ready_write)):
    require_admin(u)
    bid=guid()
    with engine.begin() as c:
        c.execute(businesses.insert().values(id=bid, **body.model_dump(), status='trial', created_at=utcnow()))
        audit(c, u['id'], 'business.created', bid, body.name)
    return {'id':bid}


@app.patch('/api/admin/businesses/{bid}')
def edit_business(bid: str, body: UpdateBusiness, u=Depends(ready_write)):
    require_admin(u)
    values=body.model_dump(exclude_none=True)
    with engine.begin() as c:
        tenant_access(c,u,bid)
        if values:
            c.execute(update(businesses).where(businesses.c.id == bid).values(**values))
            audit(c,u['id'],'business.updated',bid,','.join(sorted(values.keys())))
    return {'ok':True}


@app.get('/api/admin/businesses/{bid}/team')
def team(bid: str, u=Depends(signed_in)):
    require_admin(u)
    with engine.connect() as c:
        tenant_access(c,u,bid)
        rows=c.execute(select(users.c.id,users.c.email,users.c.name,users.c.enabled,users.c.must_change_password)
            .join(memberships,memberships.c.user_id==users.c.id).where(memberships.c.business_id==bid))
        return [record(r) for r in rows]


@app.post('/api/admin/businesses/{bid}/owners', status_code=201)
def create_owner(bid: str, body: NewOwner, u=Depends(ready_write)):
    require_admin(u)
    email=body.email.strip().lower()
    temporary=secrets.token_urlsafe(24)
    with engine.begin() as c:
        tenant_access(c,u,bid)
        other=c.execute(select(users).where(users.c.email==email)).first()
        if other:
            raise HTTPException(409,'That email already exists; account linking requires an explicit review')
        user_id=guid()
        c.execute(users.insert().values(id=user_id,email=email,name=body.name,
                 password_hash=ph.hash(temporary),role='business_owner',enabled=1,
                 must_change_password=1,created_at=utcnow()))
        c.execute(memberships.insert().values(user_id=user_id,business_id=bid,role='owner'))
        audit(c,u['id'],'owner.created',bid,email)
    return {'id':user_id,'email':email,'temporary_password':temporary,
            'instruction':'Displayed once. Give it privately to the owner; they must change it on first login.'}


@app.get('/api/portal/businesses/{bid}/summary')
def business_summary(bid: str,u=Depends(signed_in)):
    with engine.connect() as c:
        p=tenant_access(c,u,bid)
        def count(table): return c.execute(select(func.count()).select_from(table).where(table.c.business_id==bid)).scalar_one()
        recent = [record(r) for r in c.execute(select(leads).where(leads.c.business_id==bid).order_by(leads.c.created_at.desc()).limit(5))]
        return {'business':p,'counts':{'leads':count(leads),'appointments':count(appointments),'conversations':count(conversations)},'recent_leads':recent}


@app.get('/api/portal/businesses/{bid}/leads')
def get_leads(bid:str,u=Depends(signed_in)):
    with engine.connect() as c:
        tenant_access(c,u,bid)
        return [record(r) for r in c.execute(select(leads).where(leads.c.business_id==bid).order_by(leads.c.created_at.desc()).limit(250))]


@app.post('/api/portal/businesses/{bid}/leads', status_code=201)
def add_lead(bid:str,body:NewLead,u=Depends(ready_write)):
    if not (body.phone.strip() or body.email.strip()): raise HTTPException(422,'Provide a phone or email')
    lead_id=guid()
    with engine.begin() as c:
        tenant_access(c,u,bid)
        c.execute(leads.insert().values(id=lead_id,business_id=bid,**body.model_dump(),source='manual',status='new',created_at=utcnow()))
        audit(c,u['id'],'lead.created',bid,lead_id)
    return {'id':lead_id}


@app.patch('/api/portal/businesses/{bid}/leads/{lead_id}')
def update_lead(bid:str,lead_id:str,body:LeadUpdate,u=Depends(ready_write)):
    with engine.begin() as c:
        tenant_access(c,u,bid)
        result=c.execute(update(leads).where(and_(leads.c.business_id==bid,leads.c.id==lead_id)).values(status=body.status))
        if not result.rowcount: raise HTTPException(404,'Lead not found')
        audit(c,u['id'],'lead.status',bid,f'{lead_id}: {body.status}')
    return {'ok':True}


@app.get('/api/portal/businesses/{bid}/appointments')
def get_appointments(bid:str,u=Depends(signed_in)):
    with engine.connect() as c:
        tenant_access(c,u,bid)
        return [record(r) for r in c.execute(select(appointments).where(appointments.c.business_id==bid).order_by(appointments.c.created_at.desc()).limit(250))]


@app.post('/api/portal/businesses/{bid}/appointments', status_code=201)
def add_appointment(bid:str,body:NewAppointment,u=Depends(ready_write)):
    aid=guid()
    with engine.begin() as c:
        tenant_access(c,u,bid)
        c.execute(appointments.insert().values(id=aid,business_id=bid,**body.model_dump(),status='requested',created_at=utcnow()))
        audit(c,u['id'],'appointment.requested',bid,aid)
    return {'id':aid,'status':'requested','confirmed':False}


@app.patch('/api/portal/businesses/{bid}/appointments/{appointment_id}')
def update_appointment(bid:str,appointment_id:str,body:AppointmentUpdate,u=Depends(ready_write)):
    with engine.begin() as c:
        tenant_access(c,u,bid)
        result=c.execute(update(appointments).where(and_(appointments.c.business_id==bid,appointments.c.id==appointment_id)).values(status=body.status))
        if not result.rowcount: raise HTTPException(404,'Appointment not found')
        audit(c,u['id'],'appointment.status',bid,f'{appointment_id}: {body.status}')
    return {'ok':True}


@app.get('/api/admin/audit')
def get_audit(u=Depends(signed_in)):
    require_admin(u)
    with engine.connect() as c:
        return [record(r) for r in c.execute(select(audit_log).order_by(audit_log.c.created_at.desc()).limit(150))]
