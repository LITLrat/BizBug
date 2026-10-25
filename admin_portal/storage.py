"""Isolated storage for the BizBug administration application.

SQLite is for local development only; use PostgreSQL for a hosted environment.
"""
import os
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import (create_engine, MetaData, Table, Column, String, Integer,
                        DateTime, ForeignKey, UniqueConstraint, Index, Text, Float)
from sqlalchemy.engine import Engine


def utcnow():
    return datetime.now(timezone.utc)


metadata = MetaData()
businesses = Table('businesses', metadata,
    Column('id', String(36), primary_key=True),
    Column('name', String(120), nullable=False), Column('industry', String(100), nullable=False),
    Column('email', String(250), nullable=False, default=''),
    Column('phone', String(40), nullable=False, default=''),
    Column('timezone', String(80), nullable=False, default='America/New_York'),
    Column('plan', String(30), nullable=False, default='Trial'),
    Column('status', String(30), nullable=False, default='trial'),
    Column('notes', Text, nullable=False, default=''),
    Column('created_at', DateTime(timezone=True), nullable=False, default=utcnow))
users = Table('users', metadata,
    Column('id', String(36), primary_key=True),
    Column('email', String(250), nullable=False, unique=True),
    Column('name', String(120), nullable=False),
    Column('password_hash', Text, nullable=False),
    Column('role', String(30), nullable=False),
    Column('enabled', Integer, nullable=False, default=1),
    Column('must_change_password', Integer, nullable=False, default=0),
    Column('created_at', DateTime(timezone=True), nullable=False, default=utcnow))
memberships = Table('memberships', metadata,
    Column('user_id', String(36), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('business_id', String(36), ForeignKey('businesses.id', ondelete='CASCADE'), primary_key=True),
    Column('role', String(30), nullable=False, default='owner'))
sessions = Table('sessions', metadata,
    Column('token_hash', String(64), primary_key=True),
    Column('user_id', String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
    Column('csrf_hash', String(64), nullable=False),
    Column('expires_at', DateTime(timezone=True), nullable=False),
    Column('created_at', DateTime(timezone=True), nullable=False, default=utcnow))
leads = Table('leads', metadata,
    Column('id', String(36), primary_key=True),
    Column('business_id', String(36), ForeignKey('businesses.id'), nullable=False),
    Column('name', String(120), nullable=False),
    Column('email', String(250), nullable=False, default=''),
    Column('phone', String(40), nullable=False, default=''),
    Column('source', String(30), nullable=False, default='manual'),
    Column('summary', Text, nullable=False, default=''),
    Column('status', String(30), nullable=False, default='new'),
    Column('created_at', DateTime(timezone=True), nullable=False, default=utcnow))
appointments = Table('appointments', metadata,
    Column('id', String(36), primary_key=True),
    Column('business_id', String(36), ForeignKey('businesses.id'), nullable=False),
    Column('customer', String(120), nullable=False),
    Column('service', String(180), nullable=False),
    Column('requested_for', String(90), nullable=False, default=''),
    Column('status', String(30), nullable=False, default='requested'),
    Column('created_at', DateTime(timezone=True), nullable=False, default=utcnow))
conversations = Table('conversations', metadata,
    Column('id', String(36), primary_key=True),
    Column('business_id', String(36), ForeignKey('businesses.id'), nullable=False),
    Column('channel', String(30), nullable=False),
    Column('customer', String(120), nullable=False, default=''),
    Column('last_message', Text, nullable=False, default=''),
    Column('updated_at', DateTime(timezone=True), nullable=False, default=utcnow))
audit_log = Table('audit_log', metadata,
    Column('id', String(36), primary_key=True),
    Column('actor_id', String(36), ForeignKey('users.id'), nullable=False),
    Column('business_id', String(36), nullable=True),
    Column('action', String(100), nullable=False),
    Column('details', Text, nullable=False, default=''),
    Column('created_at', DateTime(timezone=True), nullable=False, default=utcnow))

Index('idx_leads_tenant', leads.c.business_id, leads.c.created_at)
Index('idx_appt_tenant', appointments.c.business_id, appointments.c.created_at)
Index('idx_conversations_tenant', conversations.c.business_id, conversations.c.updated_at)
Index('idx_audit_tenant', audit_log.c.business_id, audit_log.c.created_at)


def make_engine() -> Engine:
    dev = os.getenv('BIZBUG_DEV_MODE', 'false').lower() == 'true'
    url = os.getenv('BIZBUG_ADMIN_DATABASE_URL', '').strip()
    if not dev and not url.startswith(('postgresql+psycopg://', 'postgresql://')):
        raise RuntimeError('Production BizBug Admin requires a PostgreSQL BIZBUG_ADMIN_DATABASE_URL')
    if not url:
        path = Path(os.getenv('BIZBUG_ADMIN_SQLITE', '/tmp/bizbug-admin-dev.sqlite3'))
        path.parent.mkdir(parents=True, exist_ok=True)
        url = f'sqlite:///{path}'
    if url.startswith('postgresql://'):
        url = 'postgresql+psycopg://' + url.removeprefix('postgresql://')
    return create_engine(url, pool_pre_ping=True, connect_args={'check_same_thread': False} if url.startswith('sqlite:') else {})
