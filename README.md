# BizBug | Calendar and Two-Way SMS Edition

**BizBug v0.6 | Updated October 21, 2026.** Multi-business assistant studio with website chat, leads, FAQ answers, and new **Google Calendar / Microsoft Outlook booking** and **Twilio inbound SMS** integration code. The integrations screen is available from **Calendar & SMS** in the left navigation.

**This package is a runnable application with locally mocked integration tests. It is NOT connected to real Google, Microsoft, or Twilio accounts and has NOT been publicly deployed.** The accounts, OAuth registrations, secrets, sending-number approval, hosting, and security work described below must be completed before a real customer can book or text.

## v0.6 interface updates

- **Business Information Settings** now appears first under Business Setup, with **Demo Color Scheme** at the bottom.
- The assistant chat uses a persistent form handler for click-to-send and Enter-to-send. Errors display directly in the conversation.
- All four demo color themes now actually update the main interface and sidebar.
- English/Español switch in the top bar translates the dashboard, menus, headings and built-in instructions, and selects the appropriate assistant language. Business-specific names and user-authored source materials remain as entered; the UI is not an automatic document translator.
- Knowledge Base no longer shows duplicate `ES:` answer snippets in English view; Spanish answers display when Español is selected and available.
- Top-right administrative access icon now uses a lock; hero and overview copy have been updated.

## Two ways to demonstrate

1. **Open `BizBug_Interactive_Demo.html`** for a no-install sales demo. Select a sample business, try the new **Calendar & SMS** tab, and send example messages in the SMS-style simulator. No real texts are sent, no real calendars are read, and the Connect buttons are intentionally disabled in this offline edition.
2. **Run the FastAPI source application** to see the owner dashboard, embed the chat widget, and enable live integrations after securely configuring the server. Its `Calendar & SMS` tab provides Google/Outlook OAuth connection buttons, a business timezone and appointment-duration setting, and a Twilio phone number mapping form.

## Features implemented

| Feature | Status |
| --- | --- |
| Branded assistants for different businesses, FAQs, English/Spanish guided chat | Working |
| OpenAI-powered natural-language FAQ fallback | Works with `OPENAI_API_KEY` |
| Lead capture in dashboard, SMS sender phone captured automatically | Working |
| Google Calendar OAuth authorization-code connection, encrypted OAuth token storage, refresh | Implemented; needs Google Cloud credentials and live validation |
| Google free/busy check, availability slots, calendar event creation | Implemented; needs connected business account and live validation |
| Microsoft OAuth delegated authentication, primary calendarView, event creation | Implemented; needs Microsoft app credentials and live validation |
| Outlook.com personal and Microsoft 365 account support | Microsoft Graph calendarView path chosen to support both; not yet tested with real tenant/account |
| Confirmed booking vs request-only fallback | Implemented; event must succeed before a confirmed status |
| Twilio inbound two-way SMS webhook, secure signed requests, `To` number -> business routing | Implemented; needs Twilio account, number, public webhook and live validation |
| SMS conversations, numbered menu selection, bilingual answers, inbound lead capture | Implemented; mocked automated tests passed |
| Twilio STOP/START/HELP and per-sender message limits | Implemented; actual carrier stop status is controlled by Twilio |
| Google/Microsoft calendar changes/cancellations from within dashboard | Not yet implemented |
| SMS/appointment reminders or bulk marketing | Not implemented |
| Client logins, tenant-specific admin roles, metered SaaS billing | Not implemented; required before general commercial launch |

## Install and run locally

Python 3.11+ is required.

```bash
python -m venv .venv
source .venv/bin/activate               # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
DEMO_MODE=true uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Visit http://127.0.0.1:8000. In local demo mode (`DEMO_MODE=true`), the calendar and SMS provider controls cannot be activated, but the simulator runs normally. Real OAuth callbacks and SMS require a publicly reachable HTTPS host, NOT `localhost`.

To run all offline/mocked provider tests:

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

**Latest test result: 17 passed.** Includes actual HTTP requests into the app and mocked Google/Microsoft provider API responses; does **not** establish that a production Google/Microsoft/Twilio account is already functional.

## Required server setup

Provision a **separate** Railway project and production deployment for BizBug, with a private persistent database disk and HTTPS domain. Do not deploy this into an unrelated app or mix customer data with another project. Example Railway start command is in `railway.json`.

Set the environment variables from `.env.example` using your cloud host's secret-variable facility. **The server fails closed by default:** either explicitly set `DEMO_MODE=true` for local-only demos or provide `ADMIN_TOKEN` with `DEMO_MODE=false` for private staging. Never expose demo-mode customer data on a public production URL. For real service:

- `DEMO_MODE=false` and a strong `ADMIN_TOKEN`. The **same token currently grants access to ALL businesses**. Keep the dashboard restricted to the agency operator. Do not give this token to individual business owners.
- `PUBLIC_BASE_URL=https://YOUR-HOSTNAME` must be the exact public HTTPS origin without trailing slash. Provider callback URLs and Twilio signature validation depend on it.
- `DATABASE_PATH=/data/bizbug.sqlite3` with an attached **persistent** disk at `/data`. SQLite is suitable for controlled pilot testing with one server process/worker. Move to PostgreSQL with proper tenant authorization and transactional locks for multi-instance SaaS.
- `TOKEN_ENCRYPTION_KEY`: generate once with:

```bash
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

**Back up the encryption key separately.** If you change/lose it without rotating stored credentials, connected calendars must be reauthorized. The key encrypts OAuth refresh and access tokens at rest. It is not a replacement for full-disk encryption, HTTPS, network controls, or database backups.

- `OPENAI_API_KEY` is recommended for genuinely flexible AI chat answers. Without it, FAQ matching and appointment/lead workflows are scripted. The bot must only use validated data to take actions.

## Connect Google Calendar

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/) and enable **Google Calendar API**.
2. Set up the OAuth consent screen, app identity, and test users if app publishing is in Testing status.
3. Create a **Web application** OAuth client. Register the exact redirect URI:

   `https://YOUR-HOSTNAME/api/calendar/oauth/google/callback`

4. Assign its values to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the server.
5. The app requests `calendar.events` and `calendar.events.freebusy`, with **offline access** and user consent. Google may require OAuth app verification before use with unrelated customer accounts.
6. Sign in to BizBug as the agency admin, choose the desired business, open **Calendar & SMS**, and click **Connect Google Calendar**. Have the appropriate calendar owner consent. Complete the pop-up and refresh the integration page.
7. Try `GET /api/businesses/{id}/slots`, test a booking in the chat, then inspect the business's real Google Calendar for the resulting event.

Google API docs: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query and https://developers.google.com/workspace/calendar/api/v3/reference/events/insert

## Connect Microsoft Outlook / Microsoft 365

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/) > **App registrations** > New registration.
2. Select the intended account audience. To support both organizations and consumer Outlook.com/Hotmail accounts, register the app for **organizational directories and personal Microsoft accounts**.
3. Add a **Web** redirect URI:

   `https://YOUR-HOSTNAME/api/calendar/oauth/microsoft/callback`

4. Create an app client secret, then populate `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` securely.
5. Grant delegated Microsoft Graph permissions for **`User.Read`**, **`Calendars.ReadWrite`** and **`offline_access`**. Organization tenant policies may require admin consent.
6. Open **Calendar & SMS**, click **Connect Microsoft Outlook / 365**, and grant access in the sign-in pop-up. The app reads the authenticated user's **primary calendar** via Microsoft Graph `calendarView` and creates events via `POST /me/events`.
7. Verify with a real test booking and confirm that the event shows up in the intended user's Outlook calendar.

Microsoft docs: https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0 and https://learn.microsoft.com/en-us/graph/api/calendar-post-events?view=graph-rest-1.0

**One booking calendar per business:** Connecting a second provider replaces the active provider for that business. This release does not merge all employees' calendars, support resource calendars, or manage multiple staff schedules.

## Enable inbound and outbound conversational SMS via Twilio

1. Open [Twilio Console](https://console.twilio.com/) and set up a paid account. Acquire an SMS-capable phone number for each business, or a messaging service with a correctly routed dedicated sender. **This app does not buy/verify numbers.**
2. Configure regulatory registration as needed. **US application traffic over a 10-digit long code requires A2P 10DLC brand/campaign registration**, even for automated user-initiated replies. Toll-free sender verification has different requirements. Obtain appropriate consent and clearly describe response behavior and opt-out terms.
3. Add `TWILIO_AUTH_TOKEN` in the server environment.
4. Under **Calendar & SMS**, choose a business, enter its owned Twilio number in E.164 format (example: `+18435550123`), and save. This controls routing: the inbound `To` number selects the business.
5. In Twilio number/messaging service configuration, set **A MESSAGE COMES IN / Incoming Messages** to a webhook (HTTP **POST**):

   `https://YOUR-HOSTNAME/api/sms/twilio`

6. From an actual mobile phone, text `Hi`, `Book appointment`, or `Can I get a quote?`. Follow the numbered replies (`1`, `2`, etc.). Use `Leave a message` to test capturing a phone-only lead. Confirm it appears in **Leads & contacts** with `source=sms`.
7. Text `STOP`, `START`, and `HELP` to test state management. Twilio also enforces carrier-level opt-out handling. This app verifies every POST against `X-Twilio-Signature` using the exact configured external URL and auth token.

**Replies are sent through TwiML in the incoming webhook HTTP response.** No separate Twilio Account SID or outbound REST-sending credential is needed for this specific immediate reply workflow. Scheduled/promotional outgoing texts and SMS reminders are NOT included, and would require extra APIs, customer consent and message queues.

Twilio docs: https://www.twilio.com/docs/usage/tutorials/how-to-secure-your-flask-app-by-validating-incoming-twilio-requests and https://www.twilio.com/docs/messaging/compliance/a2p-10dlc


## Twilio free-trial limitations (important)

A Twilio trial is useful for learning the console and testing provider connectivity, but is **not** a way to run unrestricted public customer conversations. Current Twilio trial documentation limits recipients to verified phone numbers and may restrict replies to preapproved message templates. Trial accounts cannot complete US A2P 10DLC registration. Upgrade and register the business/campaign before offering live US business texting. **Never put the Twilio Auth Token, account SID, OAuth secrets, or API keys in GitHub.**

This project has not been validated against a live Twilio number/account. The first live smoke test requires a hosted HTTPS URL and an SMS-capable number assigned to the business, then setting its inbound webhook to `POST https://YOUR-HOSTNAME/api/sms/twilio`.

Twilio references: https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account and https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart

## Booking rules and accurate promises

- Working hours are a **temporary fixed weekday slot grid**: 9:00, 10:00, 11:00, 13:00, 14:00 and 15:00. The app looks up to 14 days ahead and checks the connected calendar's busy events. Times are shown in the business's IANA timezone (e.g. `America/New_York`). Appointment duration can be set from 15 to 180 minutes through the backend; the UI offers 30/45/60/90/120 minutes.
- When **no calendar is connected**, chat offers labeled **demo request times** and creates status `requested` only.
- When **calendar is connected**, offered times exclude conflicts, and the chosen time is checked again when submitting contact details. The booking becomes `confirmed` **only if the calendar event creation succeeds**, and the returned provider event ID is stored.
- If provider access fails, the system hides unavailable live slots. If an outage happens after a previously displayed slot is selected, it may store a pending **unconfirmed request** instead of promising a booked event.
- Basic double-booking defense uses a SQLite uniqueness constraint and per-process serialization. External calendar booking is not fully atomic; **do not operate multiple server workers** or promise strong concurrent booking guarantees until transactional queue/distributed locking and conflict-reconciliation are added.
- Cancellation/rescheduling, changed external events, DST-edge validation, staff/room resource schedules, reminders, buffers, holidays, and multi-location hours need further engineering before broad launch.

## Security and business readiness

**Do not yet sell this as a complete, multi-tenant SaaS product or let unrelated business owners log into the same admin dashboard.** One server-wide admin token is a pilot operator control, not tenant authentication. The current project needs real per-business sign-ins, roles, tenant-scoped authorization, audit logs, secrets rotation, retention/deletion controls, backups, web/SMS abuse controls, structured privacy and consent notices, observability, a notification queue, and billing/usage quotas. The SMS webhook caps 30 inbound processed messages per sender per hour; for real scale, add distributed/edge rate limiting and spending controls.

Neither sample branding nor the demo contains a real connected service. Do not input patient health information, sensitive financial records, or other regulated data into this starter.

## Source files

- `app.py`: FastAPI endpoints, SQLite schema, shared chat workflow, OAuth callbacks, Twilio webhook.
- `integrations.py`: provider OAuth, encrypted token handling, busy-time retrieval, event creation, signed SMS verification.
- `static/index.html` / `static/app.js` / `static/styles.css`: owner dashboard and integration configuration screens.
- `static/widget.html` / `static/widget.js`: embedded business website chat.
- `static/offline-adapter.js` / `build_offline.py`: offline demo bundle generation (simulated integrations only).
- `tests/test_app.py` / `tests/test_integrations.py`: baseline and provider-mocked automated tests.

**Next recommended milestone:** Real provider smoke tests under your own domain, followed by a secure tenant onboarding architecture and a queued SMS notification/booking-confirmation service.


## Opening the demo on iPhone
Downloaded standalone HTML may not run inside iOS Files, Quick Look, or ChatGPT's document preview: those environments can block JavaScript or localStorage. BizBug v0.7 catches denied storage and displays a clear fallback message instead of an unexplained loading screen. The recommended interactive iPhone experience is an HTTPS-hosted BizBug demo opened directly in Safari. Do not expect HTML attachment preview to behave as a normal Safari tab.

## v0.7 Demo UI updates

- **Business Setup:** Hours supports multiline schedules up to 500 characters. Displayed hours do not automatically change connected-calendar scheduling rules.
- **Overview:** All four KPI cards navigate to dedicated pages. Conversations displays the most recent 50 sessions (up to 40 messages each); the live route requires the existing administrator token.
- **Live Assistant Playground:** A stable delegated Send / Enviar button and Enter-key handler replace form-dependent sending. Errors are displayed if the chat request fails or times out.
- **Offline demo:** Conversations and their messages persist locally in the browser. No real calendar, Twilio, or AI calls are made by the offline HTML file.

Run backend checks using `pytest -q tests`. For a browser smoke test, open the rebuilt `BizBug_Interactive_Demo.html`, submit by Send and Enter, click the four KPI cards, then save multiline business hours.


## v0.8: Smarter Knowledge Base Retrieval

- Updated the Overview description and renamed the Knowledge Base button **Add New Question/Answer**.
- FAQ retrieval now searches question titles, keywords, and **the answers themselves**.
- A pricing entry such as `Haircut $30 Haircut and Style $45 Extensions $400` answers “How much are extensions?” with `Extensions: $400`.
- Specific price answers can also come from Saved Business Information. The improvement works in both the server and offline demo, with no AI API key required.
- More nuanced questions still benefit from a configured AI model. BizBug must not invent missing business facts.
- Browser-local data from an earlier downloaded HTML demo may not migrate to a new downloaded HTML file. Re-enter an FAQ when testing a separate downloaded demo; live-server database entries are unaffected.

Run `pytest -q tests` and `python build_offline.py` to test or rebuild.

## Semantic Knowledge Search (v0.11)

BizBug now includes a **hybrid, business-scoped knowledge retrieval layer** for the hosted server.
The assistant first identifies direct saved prices, then (when configured) searches FAQ answers,
service lists, hours, locations and policy text by meaning with `text-embedding-3-small`.
The response model receives only the matched verified passages. It must not invent a price
or promise an appointment. If no passage meets the similarity threshold, the assistant
can fall back to exact FAQ/keyword matching and otherwise ask the customer to leave a message.

**Activation:** Set `OPENAI_API_KEY` in the server environment, `SEMANTIC_SEARCH_ENABLED=true`
and optionally `OPENAI_EMBEDDING_MODEL` and `SEMANTIC_MIN_SIMILARITY` (default 0.57).
No additional Python dependencies or vector database are required. The first question after
adding knowledge creates cached vectors in SQLite, keyed by business, passage and content
hash. Later queries reuse unchanged vectors; editing a FAQ invalidates that vector.
Because this sends **business-authored text and customer questions** to the OpenAI API,
obtain appropriate consent, write a privacy notice, and do not place sensitive client or
regulated records in the Knowledge Base without suitable agreements and controls.
The server-side key is never sent to customers' browsers.

**Important demo distinction:** The downloadable single-file HTML works offline,
without an API key or external calls. Its existing keyword and price matcher continues
to work, but full semantic retrieval requires a deployed BizBug backend and a working
OpenAI API key. There is no simulated claim of live AI capabilities in the offline file.

**Testing:** Run `pytest -q tests`. The semantic tests use mocked vectors/response text,
not a live API connection. Validate actual recall, precision, latency, pricing and
privacy on real customer knowledge before commercial rollout. The similarity threshold
should be tuned using examples from each business sector.


## v0.12: More Reliable Knowledge Answers

- Fixed the vague-word fallback that could return a haircut price for questions about blended highlights.
- Recognizes clear color-service descriptions, such as “lighter blended streaks,” as potential balayage/highlighting questions, but only answers from business-authored facts.
- Adds those concepts as search hints to semantic retrieval, with a more accommodating default similarity threshold (0.40). Calibrate this against real support questions before relying on it for unsupervised commercial use.
- Logs *types* of OpenAI embedding/response failures without leaking API keys or customer chat content.
- Provides regression tests against the exact faulty salon question and irrelevant FAQ matches.


## v0.13: Complete Business Facts Answers

- Answer requests to list all services directly from the selected business's saved Business Setup services, in order, regardless of embeddings availability.
- Also handle common business-hours and location questions using owner-entered values.
- Preserve booking and pricing intents, Spanish replies, and business-data isolation. No extra OpenAI calls for these structured facts.
- Regression coverage includes the real customer question `List all services that you offer` and updated settings.
