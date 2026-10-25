# BizBug Admin v0.1 | Private Agency and Business Management

**This is the NEW admin application. The existing BizBug public demo is not modified.** The repository should contain both: `admin_portal/` for private management and the original `static/`, `app.py`, and the `gh-pages` branch for the sample customer demo.

## What's Working

- Agency admin login (Argon2 password hashes; HttpOnly SameSite session cookie and CSRF token)
- Master overview with real counts from its own database, not fabricated demo data
- Client directory and business creation, plan and status settings
- Individual business dashboard, lead inbox, and appointment request list
- Owner account creation with randomly generated one-time temporary passwords, and forced password change on first login
- Authorization enforced on each business-scoped API request; owners cannot enumerate or read other businesses
- Activity/audit log for admin, owner, lead and appointment changes
- Browser interface for desktop and mobile
- PostgreSQL support for production, SQLite only for local development

## Run locally

From the project root, install `admin-requirements.txt` and run:

```bash
export BIZBUG_DEV_MODE=true
export BIZBUG_ADMIN_SQLITE=./bizbug-admin-local.sqlite3
export BIZBUG_BOOTSTRAP_EMAIL=admin@example.com
export BIZBUG_BOOTSTRAP_PASSWORD='SET_A_LONG_UNIQUE_PASSWORD_AT_LEAST_14_CHARACTERS'
uvicorn admin_portal.main:app --port 8001 --reload
```

Open `http://localhost:8001`. Set real secrets through a safe environment/secret manager, never commit them to GitHub. The bootstrap admin account is created only when none exists.

## Production prerequisites (not deployed)

- Create a **separate** service for the BizBug Admin application, not the public demo or Rummagr.
- Set `BIZBUG_ADMIN_DATABASE_URL` to a dedicated PostgreSQL database using `postgresql+psycopg://...`.
- Set `BIZBUG_BOOTSTRAP_EMAIL`, `BIZBUG_BOOTSTRAP_PASSWORD`, **do not set** `BIZBUG_DEV_MODE=true`.
- Host behind HTTPS with the correct forwarded proxy headers; keep cookies Secure, HttpOnly and SameSite Strict.
- Configure automated database backups, WAF / rate limiting, audit log retention, error monitoring, and an external secret manager before onboarding paying customers.
- Deploy with one process initially; plan migrations rather than treating `metadata.create_all` as a migration framework.
- Invitation delivery, user password recovery, automatic calendar connections, inbound Twilio routing, Stripe billing, and usage reporting are **not** yet connected in this admin app. Subscription plan labels are manually managed and do not charge customers.
- The existing demo's SQLite data is **not migrated**. This portal uses a separate database by design; an explicit data migration should be performed when moving customer records into production.

## Security Notes

An owner can only see a business if their user ID is present in `memberships`. Agency admin access is separate. Requests cannot select their own role. All mutations require a CSRF header and valid session. Owner temporary passwords are returned only at account creation. All appointment entries in this build are **unconfirmed requests**, not successful calendar bookings. Do not expose raw administrative credentials or temporary passwords in screenshots/demos.

## Tests

Run `pytest tests_admin -q` from the root after installing dependencies. Tests include login/CSRF checks, owner scope enforcement, password-change requirement, cross-business lead/appointment isolation, role-denied admin actions, and separation from the demo.


## Railway/Container preparation

The admin service has its **own** `admin_portal/Dockerfile` and `admin_portal/railway.json`. Build from the repository root (`docker build -f admin_portal/Dockerfile .`), configure admin secrets privately, and **do not** reuse the existing BizBug demo service. This installs admin-only dependencies and runs on `$PORT`.

Do not deploy publicly until secrets, PostgreSQL, backups, reverse-proxy TLS handling, recovery and edge rate limiting are validated. Railway deployment is not performed by this version.
