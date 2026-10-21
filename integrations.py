"""Calendar OAuth, live availability, and SMS verification for BizBug.

Only a server configured with public HTTPS, admin token, encrypted credentials,
provider OAuth credentials and Twilio is appropriate for real customer data.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, quote, urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from cryptography.fernet import Fernet, InvalidToken

GOOGLE = 'google'
MICROSOFT = 'microsoft'
PROVIDERS = (GOOGLE, MICROSOFT)
GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy'
MICROSOFT_SCOPE = 'offline_access User.Read Calendars.ReadWrite'


class IntegrationError(Exception):
    """A provider failed; never treat it as a successful booking."""


def safe_timezone(zone):
    try:
        ZoneInfo(zone)
    except (ValueError, ZoneInfoNotFoundError, TypeError):
        raise ValueError('Invalid IANA timezone')
    return zone


def provider_creds(provider):
    prefix = {'google': 'GOOGLE', 'microsoft': 'MICROSOFT'}[provider]
    cid = os.getenv(prefix + '_CLIENT_ID', '').strip()
    secret = os.getenv(prefix + '_CLIENT_SECRET', '').strip()
    if not cid or not secret:
        raise IntegrationError(f'{provider.title()} OAuth client ID / secret are not configured')
    return cid, secret


def public_base_url():
    url = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
    # No localhost or HTTP: OAuth and Twilio signatures depend on canonical HTTPS host.
    if not url.startswith('https://') or urlparse(url).hostname in ('localhost', '127.0.0.1'):
        raise IntegrationError('PUBLIC_BASE_URL must be your public HTTPS origin')
    return url


def cipher():
    try:
        return Fernet(os.environ['TOKEN_ENCRYPTION_KEY'].encode())
    except (KeyError, ValueError, TypeError) as e:
        raise IntegrationError('Set TOKEN_ENCRYPTION_KEY to a Fernet key') from e


def encrypt(value):
    return cipher().encrypt(value.encode()).decode() if value else ''


def decrypt(value):
    try:
        return cipher().decrypt(value.encode()).decode() if value else ''
    except (InvalidToken, ValueError) as e:
        raise IntegrationError('Stored OAuth credentials cannot be decrypted') from e


def oauth_endpoints(provider):
    if provider == GOOGLE:
        return ('https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token')
    if provider == MICROSOFT:
        return ('https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
                'https://login.microsoftonline.com/common/oauth2/v2.0/token')
    raise IntegrationError('Unsupported calendar provider')


def callback_uri(provider):
    return f'{public_base_url()}/api/calendar/oauth/{provider}/callback'


def authorize_url(provider, state):
    client_id, _ = provider_creds(provider)
    params = {'client_id': client_id, 'redirect_uri': callback_uri(provider),
              'response_type': 'code', 'state': state,
              'scope': GOOGLE_SCOPE if provider == GOOGLE else MICROSOFT_SCOPE}
    if provider == GOOGLE:
        params.update({'access_type': 'offline', 'prompt': 'consent'})
    else:
        params.update({'response_mode': 'query'})
    return oauth_endpoints(provider)[0] + '?' + urlencode(params)


def token_request(provider, form):
    _, endpoint = oauth_endpoints(provider)
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.post(endpoint, data=form)
            response.raise_for_status()
            data = response.json()
        if not data.get('access_token'):
            raise IntegrationError('Calendar service did not return an access token')
        return data
    except (httpx.HTTPError, ValueError) as e:
        raise IntegrationError('Calendar authorization or token refresh failed') from e


def exchange_code(provider, code):
    client_id, secret = provider_creds(provider)
    return token_request(provider, {'client_id': client_id, 'client_secret': secret,
                                    'grant_type': 'authorization_code', 'code': code,
                                    'redirect_uri': callback_uri(provider)})


def refresh_access(c, connection):
    provider = connection['provider']
    # Refresh proactively so an in-flight event creation won't hit expiration.
    if connection['expires_at'] > time.time() + 90:
        return decrypt(connection['access_token'])
    refresh = decrypt(connection['refresh_token'])
    if not refresh:
        raise IntegrationError('Calendar authorization expired; reconnect the account')
    client_id, secret = provider_creds(provider)
    data = token_request(provider, {'client_id': client_id, 'client_secret': secret,
                                    'refresh_token': refresh, 'grant_type': 'refresh_token',
                                    **({'scope': MICROSOFT_SCOPE} if provider == MICROSOFT else {})})
    new_refresh = data.get('refresh_token') or refresh
    c.execute('UPDATE calendar_connections SET access_token=?, refresh_token=?, expires_at=? WHERE business_id=?',
              (encrypt(data['access_token']), encrypt(new_refresh), time.time()+int(data.get('expires_in', 3600)),connection['business_id']))
    return data['access_token']


def graph_or_google(method, url, token, json_body=None):
    # Constant-provider domains only; never request caller-defined URLs.
    if not url.startswith(('https://www.googleapis.com/calendar/v3/', 'https://graph.microsoft.com/v1.0/')):
        raise IntegrationError('Unexpected calendar URL')
    try:
        with httpx.Client(timeout=12.0) as client:
            resp = client.request(method, url, json=json_body,
                                  headers={'Authorization': 'Bearer ' + token,
                                           'Content-Type': 'application/json'})
            resp.raise_for_status()
            return resp.json()
    except (httpx.HTTPError, ValueError) as e:
        raise IntegrationError('Live calendar service is currently unavailable') from e


def parse_time(s):
    if not s:
        raise IntegrationError('Calendar event has no time')
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except ValueError as e:
        raise IntegrationError('Invalid calendar event time') from e


def busy_ranges(c, business_id, start, end):
    """Return UTC busy intervals, excluding free and cancelled events."""
    connection = c.execute('SELECT * FROM calendar_connections WHERE business_id=?', (business_id,)).fetchone()
    if not connection:
        return None  # Explicitly indicates demo/request-only mode.
    token = refresh_access(c, connection)
    if connection['provider'] == GOOGLE:
        payload = {'timeMin': start.astimezone(timezone.utc).isoformat(),
                   'timeMax': end.astimezone(timezone.utc).isoformat(),
                   'items': [{'id': 'primary'}]}
        data = graph_or_google('POST','https://www.googleapis.com/calendar/v3/freeBusy',token,payload)
        cal = data.get('calendars', {}).get('primary', {})
        if cal.get('errors') or 'busy' not in cal:
            raise IntegrationError('Google calendar free/busy information is unavailable')
        entries = [{'start': item['start'], 'end': item['end']} for item in cal['busy']]
    else:
        url = ('https://graph.microsoft.com/v1.0/me/calendar/calendarView?' + urlencode({
            'startDateTime': start.astimezone(timezone.utc).isoformat(),
            'endDateTime': end.astimezone(timezone.utc).isoformat(),
            '$select': 'start,end,showAs,isCancelled', '$top': '250'}))
        entries = []
        # Guard against huge calendars: fail closed rather than overlook conflicts.
        for _ in range(12):
            data = graph_or_google('GET', url, token)
            for e in data.get('value', []):
                if e.get('isCancelled') or e.get('showAs') == 'free':
                    continue
                def graph_dt(x):
                    dt = parse_time(x['dateTime'])
                    if dt.tzinfo is None:
                        # Without Prefer header, calendarView normally returns UTC.
                        # Some tenants provide a timezone string. Fail closed if not UTC.
                        tzname = x.get('timeZone', 'UTC')
                        if tzname not in ('UTC','Etc/UTC','Coordinated Universal Time'):
                            raise IntegrationError('Calendar returned an unexpected timezone')
                        dt = dt.replace(tzinfo=timezone.utc)
                    return dt
                entries.append((graph_dt(e['start']), graph_dt(e['end'])))
            next_url = data.get('@odata.nextLink')
            if not next_url:
                return entries
            if not next_url.startswith('https://graph.microsoft.com/v1.0/'):
                raise IntegrationError('Invalid calendar pagination URL')
            url = next_url
        raise IntegrationError('Calendar has too many events to check safely')
    return [(parse_time(e['start']),parse_time(e['end'])) for e in entries]


def intersects(a, b, busy):
    return any(a < end and b > start for start, end in busy)


def get_config(c, bid):
    row = c.execute('SELECT * FROM booking_configs WHERE business_id=?', (bid,)).fetchone()
    return dict(row) if row else {'business_id':bid,'timezone':'America/New_York','duration_min':60}


def live_slots(c, bid, limit=6):
    config = get_config(c, bid)
    zone = ZoneInfo(config['timezone'])
    now = datetime.now(zone)
    start = now + timedelta(hours=2)
    end = now + timedelta(days=14)
    busy = busy_ranges(c, bid, start, end)
    if busy is None:
        return None
    slots = []
    duration = timedelta(minutes=config['duration_min'])
    for day in range(0,15):
        local_date = (now + timedelta(days=day)).date()
        if local_date.weekday() >= 5:
            continue
        for hour in (9,10,11,13,14,15):
            dt = datetime(local_date.year, local_date.month, local_date.day, hour, tzinfo=zone)
            finish = dt + duration
            if dt < start or finish > end or intersects(dt.astimezone(timezone.utc),finish.astimezone(timezone.utc),busy):
                continue
            slot = dt.isoformat(timespec='minutes')
            used = c.execute("SELECT 1 FROM appointments WHERE business_id=? AND starts_at=? AND status!='cancelled'", (bid,slot)).fetchone()
            if used:
                continue
            slots.append({'value':slot, 'label': dt.strftime('%a %b %d · %I:%M %p') + ' ' + dt.tzname()})
            if len(slots)>=limit:
                return slots
    return slots


def verify_slot_available(c, bid, iso_value):
    slots = live_slots(c, bid, limit=120)
    return slots is not None and iso_value in {s['value'] for s in slots}


def create_event(c, bid, event_key, name, email, service, slot):
    conn = c.execute('SELECT * FROM calendar_connections WHERE business_id=?', (bid,)).fetchone()
    if not conn:
        raise IntegrationError('No calendar connected')
    cfg = get_config(c,bid)
    dt = parse_time(slot)
    if dt.tzinfo is None:
        raise IntegrationError('Booking slot has no timezone')
    stop = dt + timedelta(minutes=cfg['duration_min'])
    token = refresh_access(c, conn)
    title = f'{service} - {name}'[:180]
    description = f'Booked by BizBug. Customer: {name}; email: {email}; service: {service}. Confirmation requires reviewing calendar event.'
    if conn['provider'] == GOOGLE:
        payload = {'id': event_key, 'summary': title, 'description': description,
                   'start': {'dateTime': dt.isoformat()}, 'end': {'dateTime': stop.isoformat()}}
        result = graph_or_google('POST','https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none',token,payload)
    else:
        payload = {'subject':title, 'body': {'contentType':'text', 'content':description},
                   'start': {'dateTime': dt.astimezone(timezone.utc).replace(tzinfo=None).isoformat(), 'timeZone':'UTC'},
                   'end': {'dateTime': stop.astimezone(timezone.utc).replace(tzinfo=None).isoformat(), 'timeZone':'UTC'},
                   'showAs':'busy', 'transactionId':event_key}
        result = graph_or_google('POST','https://graph.microsoft.com/v1.0/me/events',token,payload)
    if not result.get('id'):
        raise IntegrationError('Calendar did not confirm creation')
    return result['id']


def twilio_signature(url, params, auth_token):
    """Official Twilio form-post signature algorithm (parameters sorted by name)."""
    msg = url + ''.join(k + params[k] for k in sorted(params))
    mac = hmac.new(auth_token.encode(),msg.encode(),hashlib.sha1).digest()
    return base64.b64encode(mac).decode()


def check_twilio_signature(path, params, supplied):
    token = os.getenv('TWILIO_AUTH_TOKEN', '')
    if not token:
        raise IntegrationError('Twilio authentication token not configured')
    actual = twilio_signature(public_base_url()+path, params, token)
    return bool(supplied) and secrets.compare_digest(actual,supplied)


def e164(phone):
    return bool(re.fullmatch(r'\+[1-9]\d{7,14}',phone or ''))
