# TeamSuite → Laravel 13 Migration Analysis Report

**Repository:** `C:\TeamSuite` (product name: **TeamSuite**, not Academy Suite)  
**Report date:** 2026-10-13  
**Scope:** Architecture analysis and migration planning only — **no code changes, no Laravel install, no DB migration.**  
**Production (from project rules/docs):** `https://teamsuite-seven.vercel.app` / `https://www.teamsuite.me`

---

## CRITICAL FINDING (read first)

The prompt assumed:

- React + **Node.js/Express** + **PostgreSQL** + scheduled jobs + email + SMS/Twilio + Viva + uploads

**Inspection of the actual source code shows a different architecture.**

| Assumed | Actual (from code) |
|--------|---------------------|
| Express app | **Vercel Serverless Functions** (`api/*.ts` + `@vercel/node`) — no Express app server |
| PostgreSQL | **No PostgreSQL / no SQL schema / no Prisma / no ORM** in the repository |
| Server-side domain DB | **Browser-first domain store**: `localStorage` + **IndexedDB**, synced as **JSON club mirrors** to **Vercel Blob** (+ **Upstash Redis/KV** for durable keys) |
| Twilio SMS | **SMS.to** API and optional **HTTP** SMS provider — **not Twilio** |
| Classic REST CRUD API | Thin server APIs for sync/auth/payments/email/SMS/media; **most business logic runs in the React client** (`src/api/services/*`, `src/data/*`) |

Therefore a “Laravel 13 migration” is **not** a straight Express→Laravel port. It is a **platform redesign**: move authoritative domain data and business rules from the browser (+ Blob mirrors) onto a **server-side Laravel + PostgreSQL** (or keep Blob/document model — not recommended for Laravel-native apps).

**Code findings vs recommendations** are labeled throughout. Where the repo cannot prove something: **Requires developer confirmation**.

---

# 1. CURRENT APPLICATION ARCHITECTURE

## Findings from code

### Frontend
- **Framework:** React **19.2.x** (`package.json`)
- **Router:** `react-router-dom` **7.x**
- **Build:** **Vite 8.2** + `@vitejs/plugin-react`
- **Language:** TypeScript ~6.0
- **UI:** Custom CSS + `lucide-react`; charts via `recharts`; PDF via `pdf-lib`
- **Mode:** **SPA** (client-side routing; `vercel.json` rewrites non-API to `/index.html`)

### Backend
- **Not Express.** Handlers under `/api` as **Vercel Node serverless** (`@vercel/node` ^5.9)
- **Runtime:** Node on Vercel (exact Node version pin: **Requires developer confirmation** from Vercel project settings; local tooling uses modern Node per lockfile/`@types/node` ^24)
- **ORM:** **None** (no Eloquent/Prisma/TypeORM; domain objects are TypeScript interfaces in `src/types/index.ts`)

### Data / “database”
- **Authoritative UX store:** browser `localStorage` keys such as `academyhub-data-by-club-v1`, `teamsuite-users-v1`, plus **IndexedDB** (`src/data/clubMapIdb.ts`, `src/data/store.ts`)
- **Cloud durability:** full-club JSON **mirrors** and account bundles via `api/sync/mirror.ts`, `api/sync/account.ts`, `api/lib/serverStore.ts`, `api/lib/durableKv.ts`
- **Stores used:** **Vercel Blob** (`BLOB_STORE_ID` / OIDC or `BLOB_READ_WRITE_TOKEN`) and/or **Upstash Redis REST** (`KV_REST_API_*` / `UPSTASH_REDIS_*`)
- **PostgreSQL version:** **N/A — not present in codebase**

### Authentication
- Hybrid:
  - **Server session tokens** via `POST /api/sync/account?kind=session` (`action=login|verify|logout|forgot|reset`) — HMAC/session secrets (`TEAMSUITE_SESSION_SECRET` / legacy `SS360_*`)
  - Client session mirror in `localStorage` (`teamsuite-session-v1`, `teamsuite-session-token-v1`)
  - Password hashing client/server utilities (`src/auth/password.ts`); users also in account bundle
- **Not JWT Passport/Laravel Sanctum today** (custom token scheme in serverless)

### API architecture
- **BFF / utility APIs** on Vercel + **client-side services** that mutate local `AppData` then push mirrors
- Sync auth headers / sync secret (`src/api/syncAuth.ts`, `assertSyncAuthorized` in `serverStore`)

### Storage
- Club media / logos / photos: Blob / public binary helpers (`api/club-media.ts`, `putPublicBinary`)
- Join form snapshots, mirrors, settlements stored in durable KV/Blob layers

### Queues
- **No Redis queue workers / Bull / BeeQueue** in app code
- Async work is mostly: serverless request lifetime, client-side loops (email send), Vercel **cron** HTTP hits

### Cron
- `vercel.json` crons:
  - `0 2 * * *` → `/api/gdpr?op=backup`
  - `30 2 * * *` → `/api/gdpr?op=retention`
- Additional in-browser scheduled backup while tab open (documented in backup inventory) — **client-dependent**

### WebSockets
- **Not found** as app realtime transport
- **Web Push** (VAPID) via `web-push` (`api/push.ts`, `api/lib/webPush.ts`)

### Email
- **Nodemailer** SMTP (`api/send-email.ts`, also in `public-join`, `public-rent`, `account` password reset)
- Per-club SMTP in notify config + platform SMTP env vars

### SMS
- **SMS.to** (`https://api.sms.to/sms/send`) or custom **HTTP** provider (`api/send-sms.ts`) — **not Twilio**

### Payments
- **Viva** (`api/viva.ts`: create-order, webhook, settlements)
- **Stripe** Checkout (`api/stripe.ts`)
- **Eurobank / Cardlink VPOS** field digest (`api/eurobank.ts`)

### Other integrations
- **Google Drive** backup OAuth (`api/google-drive.ts`)
- **Email open/click tracking** (`api/email-track.ts`)
- Public join / rent / club config APIs

### Current hosting dependencies
- **Vercel** project `teamsuite` (SPA + serverless + crons + Blob/OIDC)
- Upstash Redis/KV (optional but used as durable backend path)
- External SMTP, SMS.to, Viva, Stripe, Eurobank, Google OAuth

## CURRENT architecture diagram (code-derived)

```text
┌─────────────────────────────────────────────────────────────────┐
│ Browser (React 19 SPA / Vite)                                    │
│  • UI pages (athletes, fees, announcements, portals…)            │
│  • Domain logic: src/api/services/* , src/data/*                 │
│  • localStorage + IndexedDB (per-club AppData JSON)              │
│  • Session token in localStorage                                 │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ HTTPS /api/*                │ sync push/pull
                ▼                             ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ Vercel Serverless (Node)     │   │ Durable store                │
│ api/*.ts                     │──▶│ Vercel Blob ± Upstash Redis  │
│ • account/session            │   │ • club mirrors (JSON)        │
│ • club mirror / club-ops     │   │ • account bundle             │
│ • email / SMS / push         │   │ • settlements, public club   │
│ • viva / stripe / eurobank   │   │ • media binaries             │
│ • gdpr cron backup/retention │   └──────────────────────────────┘
│ • public-join / public-rent  │
└──────────────────────────────┘
 tre
 External: SMTP │ SMS.to │ Viva │ Stripe │ Cardlink │ Google Drive │ Web Push
```

---

# 2. CURRENT FRONTEND

## Findings

| Item | Value |
|------|--------|
| React | ^19.2.8 |
| Build | Vite ^8.2 — **not** CRA/Next |
| Rendering | **SPA** (CSR); no Next SSR/SSG |
| State | React hooks + `useAppData` / repository; **no Redux/Zustand** as primary store |
| Forms | Controlled inputs in pages; Zod used in `src/schemas` |
| Uploads | Client → `/api/club-media` / account media kinds; photos in AppData |
| WebSockets | Not used; **Web Push** optional |
| Build command | `tsc -b && vite build` (`npm run build`) |
| Output | Vite `dist/` (default) |
| Deploy | `npx vercel --prod` (project `teamsuite`) |
| Dev proxy | Vite proxies `/api` → production origin (`vite.config.ts`) |

### Routes (representative)
Public: `/login`, `/register`, `/join/:slug`, `/rent/:slug`, `/id/card`, `/legal…`, `/app/parent`, `/app/coach`  
Authenticated modules: `/athletes`, `/classes`, `/fees`, `/finance`, `/announcements`, `/warehouse`, `/platform`, … (`src/App.tsx`)

### Auth flow
1. Login page → `serverLogin` → `/api/sync/account?kind=session`  
2. Token stored; local user/session hydrated  
3. `RequireAuth` / role & module gates  
4. Club data pull via mirror sync services

### Environment variables (frontend-visible names only)
- `VITE_BOOTSTRAP_PLATFORM_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` / `_ALLOW_PROD` — bootstrap platform admin (dev/special)
- `import.meta.env.DEV` / `PROD` — Vite mode

## CAN THE EXISTING REACT FRONTEND REMAIN?

### **PARTIALLY**

**Why not YES:** Almost all CRUD/business rules mutate **client `AppData`**, then sync JSON mirrors. Laravel as a true API would require either:

1. **Large frontend rewrite** to call REST/JSON:API for every entity (athletes, fees, attendance…), or  
2. **Compatibility façade** that still accepts whole-club mirrors (Laravel storing JSON blobs) — preserves React short-term but **defeats** normal Eloquent design.

**What would need to change for a proper Laravel backend:**
- Replace `src/data/repository` / `clubSync` push-pull with HTTP resources
- Rework every `src/api/services/*` that writes local state
- Auth headers → Sanctum cookies/tokens
- Error/pagination shapes
- Possibly keep React UI shells/pages and swap data layer gradually

**What can remain with less change:**
- Visual pages, routing, CSS, PDF print helpers, much of form UX
- Public join/rent pages if APIs stay URL-compatible

---

# 3. CURRENT “BACKEND” (Vercel Node) → Laravel mapping

There is **no Express router tree**. Inventory is **serverless entrypoints** + **client domain services**.

## Table: CURRENT NODE COMPONENT → LARAVEL 13

| CURRENT NODE COMPONENT | PURPOSE | LARAVEL 13 EQUIVALENT | COMPLEXITY | NOTES |
|------------------------|---------|----------------------|------------|-------|
| `api/*.ts` Vercel handlers | HTTP edge | Routes + Controllers | HIGH | Different hosting model (VPS PHP-FPM vs serverless) |
| `api/sync/account.ts` | Users, session, branding, waitlist, audit | Auth + User controllers, Sanctum | VERY HIGH | Large multi-kind file |
| `api/sync/mirror.ts` | Club JSON mirror GET/PUT | **Replace** with Eloquent resources *or* temporary MirrorController | VERY HIGH | Core data path today |
| `api/sync/club-ops.ts` | Fast ops slice sync | Domain APIs / jobs | HIGH | Attendance etc. |
| `api/sync/mirror-students.ts` | Student roster patch | StudentController | HIGH | |
| `api/lib/serverStore.ts` | Blob/KV persistence, auth helpers | Eloquent + Storage + Cache | VERY HIGH | Document store → RDBMS |
| `api/lib/durableKv.ts` | Redis/Blob abstraction | Redis facade / DB | HIGH | |
| `api/send-email.ts` | SMTP send | Mailables + Queue | MEDIUM | Nodemailer → Symfony Mailer |
| `api/send-sms.ts` | SMS.to / HTTP | Notification channel / SmsService | MEDIUM | Not Twilio |
| `api/push.ts` | Web Push | Notification + webpush package | MEDIUM | |
| `api/viva.ts` | Payments + webhook | VivaService + WebhookController | HIGH | Preserve webhook security |
| `api/stripe.ts` | Checkout session | Cashier or Stripe SDK service | MEDIUM | |
| `api/eurobank.ts` | Cardlink digest fields | Payment gateway service | MEDIUM | |
| `api/gdpr.ts` | DSAR, backup cron, retention | Commands + Policies | HIGH | Cron secrets |
| `api/public-join.ts` / `public-rent.ts` / `public-club.ts` | Public flows | Public controllers | HIGH | Nodemailer inside |
| `api/club-media.ts` | Media upload | Storage + controller | MEDIUM | |
| `api/google-drive.ts` | Drive backup OAuth | Socialite/custom OAuth | MEDIUM | |
| `api/email-track.ts` | Open/click tracking | Tracking controller | LOW–MEDIUM | |
| `src/api/services/*` (client) | **Real business logic** | Actions/Services/Jobs | VERY HIGH | Must move server-side for Laravel truth |
| `src/data/clubSync.ts` | Conflict merge, dirty push | Obsolete or rewrite | VERY HIGH | Multi-tab sync semantics |
| Vercel Cron HTTP | Scheduled backup/retention | Laravel Scheduler | MEDIUM | |
| Zod schemas (`src/schemas`) | Validation | Form Requests | MEDIUM | Also enforce server-side |
| AMKA field crypto | Sensitive field encryption | Laravel encrypted casts / custom | HIGH | Secrets must migrate carefully |

---

# 4. API ENDPOINT INVENTORY

Goal: no functional loss. Endpoints below are **from code**; query `op`/`kind`/`action` multiplex many operations.

| METHOD | CURRENT ROUTE | PURPOSE | AUTH | HANDLER | LARAVEL TARGET (proposal) | NOTES |
|--------|---------------|---------|------|---------|---------------------------|-------|
| * | `/api/health` → gdpr health | Health check | Cron/secret patterns | `api/gdpr.ts` | `GET /up` or `/api/health` | Rewrite in vercel.json |
| GET/POST | `/api/gdpr?op=*` | backup, retention, DSAR, consent, correct, data | Mixed + `CRON_SECRET` | `gdpr.ts` | `/api/gdpr/...` | |
| GET/POST | `/api/backup/scheduled` | Alias backup | Cron | gdpr | Scheduler command | |
| POST | `/api/send-email` | Send email | Sync auth | `send-email.ts` | `POST /api/email/send` | |
| POST | `/api/send-sms` | Send SMS | Sync auth | `send-sms.ts` | `POST /api/sms/send` | |
| * | `/api/push?op=` | vapid, subscribe, send, subscribers | Mixed | `push.ts` | `/api/push/*` | |
| * | `/api/viva?op=` / rewrites | create-order, webhook, settlements | Mixed + webhook secret | `viva.ts` | `/api/viva/*` | Keep webhook URL stable if possible |
| POST | `/api/stripe?op=create-session\|verify` | Stripe checkout | App | `stripe.ts` | `/api/stripe/*` | |
| POST | `/api/eurobank` | Cardlink form fields | Rate limit | `eurobank.ts` | `/api/eurobank/checkout-fields` | |
| * | `/api/sync/account?kind=` | session, media, branding, user, waitlist, audit, field-key, login-activity… | Session/sync | `account.ts` | Split into REST resources | **Largest surface** |
| GET/PUT | `/api/sync/mirror` | Club mirror | Sync/session | `mirror.ts` | Temporary compatibility **or** remove after CRUD APIs | |
| PUT | `/api/sync/club-ops` | Ops slice | Sync | `club-ops.ts` | Domain APIs | |
| POST | `/api/sync/mirror-students` | Students upsert | Sync | `mirror-students.ts` | `/api/athletes` | |
| GET/POST | `/api/public-club` | Public club config | Public/admin | `public-club.ts` | `/api/public/clubs/{slug}` | |
| * | `/api/public-join` | Join applications | Public + admin ops | `public-join.ts` | `/api/public/join` | |
| * | `/api/public-rent` | Court rental public | Public | `public-rent.ts` | `/api/public/rent` | |
| * | `/api/club-media` | Media | Auth | `club-media.ts` | `/api/media` | |
| * | `/api/google-drive?op=` | Drive OAuth/backup | Admin | `google-drive.ts` | `/api/integrations/google-drive` | |
| GET/POST | `/api/email-track` | Tracking pixel/click | Public signed | `email-track.ts` | `/api/email/track` | |

**Client-only “APIs”:** dozens of `src/api/services/*.ts` are **not HTTP** — they are local domain services. Migrating Laravel means **exposing new REST endpoints** for each entity in `AppData` or accepting continued mirror sync (compatibility mode).

Full per-entity CRUD routes do **not** exist as Express REST today.  
**Requires developer confirmation:** whether production clients (besides this SPA/TWA) call undocumented paths.

---

# 5. DATABASE ANALYSIS

## Findings

- **No PostgreSQL schema in repo** (no `.sql`, no migrations, no Prisma).
- Data model = TypeScript `AppData` + nested arrays (`src/types/index.ts`) persisted as **JSON documents per club**.
- Relationships are **in-document IDs** (e.g. `student.classId`, `parentLinks[]`), not SQL FKs.
- Soft-delete style via `deleted*Ids` arrays and suppressed fee keys.
- AMKA encryption at rest in browser/disk paths.

## Mapping implication

| CURRENT “TABLE” (logical) | CURRENT MODEL | RELATIONSHIPS | PROPOSED LARAVEL MODEL | NOTES |
|---------------------------|---------------|---------------|------------------------|-------|
| users (account bundle) | `AppUser` | clubId, roles | `User` | |
| clubs | club config in auth/clubs | has many students… | `Club` | |
| students | `Student` | classes, fees, attendance | `Athlete`/`Student` | |
| coaches | `Coach` | classes/sports | `Coach` | |
| classes | `AcademyClass` | students, schedule | `Team`/`ClassModel` | name carefully (PHP `Class` reserved) |
| attendance | `AttendanceRecord` | student, training | `Attendance` | |
| trainings / schedule / matches | … | | Eloquent models | |
| transactions / revenues / expenses | finance | | Finance models | |
| fee templates / reminders | | | `FeeChargeTemplate` | |
| announcements | | | `Announcement` | |
| products / stock | warehouse | | `Product`, `StockMovement` | |
| rental bookings / facilities | | | `Facility`, `RentalBooking` | |
| registration applications | | | `RegistrationApplication` | |
| parent_links | | | `ParentAthleteLink` | |
| … | full `AppData` | | normalize into tables | |

**Triggers/views/extensions:** none in repo.  
**Schema changes required by Laravel:** **entire relational schema design** (greenfield relative to current storage), then **ETL from Blob mirrors / browser exports**.

Preferred long-term: **normalize into PostgreSQL**.  
Short-term compatibility: store mirror JSON in `club_mirrors` table — **not** idiomatic Laravel, high tech debt.

---

# 6. LARAVEL 13 TARGET DATA MODEL (proposed)

**Only entities supported by current `AppData` / auth types** (not invented).

Recommended core models (names illustrative):

| Model | Table (proposal) | PK | Relationships | Casts / notes |
|-------|------------------|----|---------------|---------------|
| User | users | uuid/string | belongsTo Club; roles | hashed password; permissions JSON |
| Club | clubs | string id | hasMany athletes, coaches… | settings JSON |
| Athlete | athletes | string | belongsToMany classes; hasMany transactions | amka encrypted cast |
| Coach | coaches | | | |
| AcademyClass | academy_classes | | | avoid `classes` reserved issues |
| ClubSeason | club_seasons | | | |
| ScheduleSlot | schedule_slots | | | |
| Attendance | attendances | | | |
| Training | trainings | | | |
| Match | matches | | | |
| AthleteTransaction | athlete_transactions | | | |
| Revenue / Expense | revenues / expenses | | | |
| CashAccount | cash_accounts | | | |
| FeeChargeTemplate | fee_charge_templates | | | |
| Announcement | announcements | | | audience JSON |
| StaffMember / ClubMember / Association | … | | | |
| Facility / RentalBooking / RentalSettings | … | | | |
| WarehouseProduct / StockMovement | … | | | |
| PartnerBusiness / PartnerOffer | … | | | |
| GalleryPhoto | photos | | | |
| ParentAthleteLink | parent_athlete_links | | | |
| ProgressReport | progress_reports | | | |
| RegistrationApplication | registration_applications | | | |
| DocumentProtocolEntry | document_protocol_entries | | | |
| PaymentSettlement (Viva) | viva_settlements | | | from serverStore type |
| Audit logs | amka_access_logs, gdpr_audit_logs | | | |

**Fillable/guarded:** prefer `$fillable` explicit per model + Form Requests.  
**Timestamps:** map `updatedAt` number/ISO fields carefully.  
**Soft deletes:** map `deleted*Ids` arrays → `deleted_at` or tombstone tables.

Laravel 13-specific model attributes: **Requires developer confirmation** of Laravel 13 release APIs; use current Laravel conventions (Eloquent, casts, UUIDs).

---

# 7. AUTHENTICATION

## Current (code)
- Custom **server session token** (account sync) + localStorage session
- Password verify/hash utilities
- Roles on user object
- Demo/local bootstrap sessions for presentation/dev
- Sync secret for machine sync paths
- Field key fetch for AMKA (`kind=field-key`)

## Laravel recommendation
- **Laravel Sanctum** for SPA (cookie/session) **and** optional API tokens for TWA/mobile-like clients
- Password reset via Laravel notifications (replace account `forgot`/`reset`)
- Email verification: only if product requires it — **partially present semantics today; Requires developer confirmation** for mandatory verify
- CORS: Sanctum stateful domains for SPA
- CSRF: Sanctum SPA cookie flow
- Rate limiting: login/forgot (already partially rate-limited in Node)

**Mobile/TWA:** `android-twa/` is a **Trusted Web Activity** wrapping the web app — not a separate native API client. Sanctum SPA auth can work if same-site cookies or token header strategy is designed.

---

# 8. ROLES AND PERMISSIONS

## Roles found in code (`src/auth/auth.ts`)
- `platform_admin`
- `admin`
- `doctor`
- `coach`
- `secretariat`
- `staff`
- `athlete`
- `parent`

Plus **per-user `permissions[]`** overrides and `financeOwnEntriesOnly`.  
Module gates via `RequireModule` / platform config.

## Laravel migration
- `spatie/laravel-permission` **optional** — useful but not mandatory
- Policies per model (AthletePolicy, FeePolicy…)
- Middleware `role:admin|secretariat`
- Gate for platform_admin
- Keep module enable flags on Club/License package (license packages exist in app)

---

# 9. BUSINESS LOGIC

Major areas implemented primarily in **client services** (must become Laravel Actions/Services):

| AREA | CURRENT IMPLEMENTATION | LARAVEL TARGET | RISKS |
|------|------------------------|----------------|-------|
| Athletes / registry | `studentsService`, spreadsheet import | AthleteService + Jobs | Data loss on sync conflicts |
| Classes / seasons | classes/seasons services | services | |
| Attendance / trainings | attendance/trainings + club-ops sync | APIs + jobs | Dual-write during cutover |
| Fees / debt | `feeChargesService` | FeeService; reminders incomplete UI | |
| Finance / receipts | finance, receiptBook, transactions | Finance module | Complex merges |
| Announcements + email audience | `notificationService`, prefer notify emails | AnnouncementService + Mail jobs | Preference rules recently changed |
| Warehouse | products + stock + notices | | |
| Rentals | rentalBookings + public-rent | | |
| Registration join | public-join + applications | | |
| GDPR / AMKA | gdpr services + crypto | | Legal + crypto migration |
| Sync conflict merge | `clubSync.mergeClubSnapshots` | **Eliminate** with server authority | Highest product risk |
| Payments | viva/stripe/eurobank services | Payment services + webhooks | |

**Architecture recommendation:** Controllers thin → Form Requests → Actions/Services → Models → Policies → Jobs/Events.  
Do **not** dump client TypeScript into Laravel controllers.

---

# 10. VALIDATION

- **Backend (serverless):** ad-hoc checks in handlers (email format, amounts, auth)
- **Client:** Zod schemas (`src/schemas/index.ts`) for many inputs
- **Gap:** much validation is **frontend-only** today

Laravel: Form Requests mirroring Zod rules for every public mutating endpoint.  
Especially: public join, payments, media MIME/size, GDPR DSAR.

---

# 11. CRON JOBS

| CURRENT JOB | FREQUENCY | TRIGGER | PURPOSE | LARAVEL |
|-------------|-----------|---------|---------|---------|
| GDPR backup | `0 2 * * *` | Vercel Cron → `/api/gdpr?op=backup` | Scheduled backup | `php artisan gdpr:backup` scheduled |
| GDPR retention | `30 2 * * *` | Vercel Cron → `op=retention` | Retention purge | `gdpr:retention` |
| Browser backup schedule | while tab open | client runner | Club JSON download/cloud | Prefer server-only; document UX change |
| Health card notices | on login / manual | client | Expiry emails | Scheduler + queue (fix reliability) |
| Warehouse low-stock mail | client heuristics | | | Scheduler |

Replace HTTP cron with **single system cron**: `* * * * * php artisan schedule:run`.

---

# 12. QUEUES AND BACKGROUND PROCESSING

Current: limited true queue; long email loops in client/serverless.

Should become Laravel Jobs:
- Bulk announcement emails
- SMS sends
- Web push fanout
- GDPR export/backup
- Drive upload
- Image/PDF heavy work
- Payment settlement reconciliation

### REDIS REQUIRED: **OPTIONAL (recommended YES in production)**

- **YES recommended** for queue + cache + rate limiting on a VPS  
- **Not strictly required** for a minimal sync: `database` queue driver works initially  
- Redis already conceptually present via Upstash in current stack — operators are familiar with KV

Do not add Redis “because Laravel”; add for **queues/cache** under multi-club load.

---

# 13. EMAIL

| Aspect | Finding |
|--------|---------|
| Provider | Club SMTP + platform SMTP env (`SMTP_*` / `PLATFORM_SMTP_*`) |
| Library | Nodemailer |
| Types to preserve | Announcements; fee/payment receipts; health card; warehouse; public join notify; password reset; waitlist; tracking |

Laravel: Mailables + Notifications; queue `mails`; keep unsubscribe list (`emailUnsubscribes`).

---

# 14. SMS / TWILIO

**Twilio: not used.**

| Workflow | Implementation |
|----------|----------------|
| Club SMS send | `api/send-sms.ts` → SMS.to or HTTP webhook |
| Client trigger | `smsService.ts`, health notices, etc. |

Laravel: `SmsChannel` / `SmsService` + queued `SendSmsJob`. Keep provider abstraction (`sms_to` | `http`).

---

# 15. VIVA PAYMENTS

From `api/viva.ts` + client `vivaService` / settlements:

| Capability | Present |
|------------|---------|
| Create order | Yes (`create-order`) |
| Webhook | Yes (`webhook`); `VIVA_WEBHOOK_SECRET` |
| Settlements | Yes |
| Stripe parallel | Yes |
| Eurobank VPOS fields | Yes |
| Refunds / recurring | **Not clearly implemented in reviewed handlers — Requires developer confirmation** |

Laravel target:
- `App\Services\Payments\VivaService`
- `PaymentController` / `VivaWebhookController`
- `VivaSettlement` model
- Jobs to consume settlements into finances
- Preserve webhook auth query/header behavior for zero breakage

---

# 16. FILE STORAGE

| Type | Where |
|------|--------|
| Club logos, hero, gallery, athlete photos | Blob / media APIs + URLs in AppData |
| Join form snapshots | durable store |
| Mirrors / backups | Blob/KV + optional Google Drive |
| PDFs | often generated client-side (`pdf-lib`) |

### Recommendation
- **Initial VPS:** Laravel Storage **local** disk for private + public disk behind Nginx **OR**  
- **B. S3-compatible** (better for future multi-node) — **recommended if budget allows**

Access control must move from “URL obscurity” to authorized download routes for private docs.

---

# 17. MOBILE APPLICATION COMPATIBILITY

| Item | Finding |
|------|---------|
| Native RN/Flutter app | **Not found** |
| Android TWA | `android-twa/` wraps web origin |
| Parent/Coach “apps” | Web routes `/app/parent`, `/app/coach` + PWA meta |

Laravel must keep **same origin / HTTPS** and auth story for TWA.  
Backward-compatible `/api/*` paths recommended during transition.

---

# 18. API RESPONSE COMPATIBILITY

Current patterns: `{ ok: true/false, error?, token?, user?, payload?, updatedAt? }` (varies by handler).

**Risk:** Moving to Laravel Resource transformers will **break** the SPA unless a **compatibility layer** mirrors old shapes for sync endpoints.

Plan:
1. Freeze OpenAPI/fixtures of sync/account + mirror responses  
2. Laravel Anti-Corruption Layer returning legacy JSON  
3. New `/api/v2/*` Eloquent resources for rewritten frontend modules  
4. Deprecate mirror PUT after parity

---

# 19. ENVIRONMENT VARIABLES (names + purpose only)

| VARIABLE | COMPONENT | PURPOSE | LARAVEL EQUIVALENT |
|----------|-----------|---------|-------------------|
| `BLOB_STORE_ID` / `BLOB_READ_WRITE_TOKEN` / `VERCEL_OIDC_TOKEN` | durable store | Object storage auth | `FILESYSTEM_DISK` / S3 keys |
| `KV_REST_API_URL` / `TOKEN` or `UPSTASH_REDIS_*` | KV | Durable key-value | `REDIS_*` |
| `TEAMSUITE_SYNC_SECRET` / `SS360_SYNC_SECRET` | sync auth | Shared sync secret | App tokens / Sanctum; migrate off shared secret |
| `TEAMSUITE_SESSION_SECRET` / `SS360_SESSION_SECRET` | sessions | Token HMAC | `APP_KEY` + Sanctum |
| `TEAMSUITE_AMKA_SECRET` / `SS360_AMKA_SECRET` | AMKA crypto | Field encryption | `APP_KEY` / dedicated enc key |
| `CRON_SECRET` | cron | Authorize cron HTTP | Scheduler (no public HTTP) |
| `SMTP_*` / `PLATFORM_SMTP_*` | email | SMTP | `MAIL_*` |
| `PLATFORM_ADMIN_NOTIFY_EMAIL` / `CLUB_WAITLIST_NOTIFY_EMAIL` | notify | Ops inbox | config |
| `VIVA_WEBHOOK_SECRET` | viva | Webhook auth | config |
| Stripe keys | stripe | Checkout | `STRIPE_*` — **confirm exact names in Vercel dashboard** |
| `GOOGLE_DRIVE_CLIENT_ID` / `SECRET` / `REDIRECT_URI` | Drive | OAuth backup | services config |
| `VAPID_*` / `TEAMSUITE_VAPID_*` | push | Web Push | config |
| `APP_URL` / `VERCEL_PROJECT_PRODUCTION_URL` | URLs | Absolute links | `APP_URL` |
| `TEAMSUITE_ADMIN_*` / `VITE_BOOTSTRAP_*` | bootstrap admin | Initial admin | seeder (not VITE in Laravel) |
| `SS360_ALLOW_INSECURE_SYNC` | sync | Dev escape hatch | **do not enable in prod** |

Never commit values.

---

# 20. EXTERNAL SERVICES

| SERVICE | PURPOSE | CURRENT | LARAVEL | NETWORK |
|---------|---------|---------|---------|---------|
| Vercel Blob | Mirrors/media | `@vercel/blob` | S3/local | HTTPS out |
| Upstash Redis | KV | REST | Redis TCP or REST | |
| SMTP provider | Mail | Nodemailer | Mail | 587/465 |
| SMS.to | SMS | fetch API | SmsService | HTTPS |
| Viva | Payments | REST/webhook | VivaService | HTTPS in/out |
| Stripe | Payments | REST | Stripe SDK | HTTPS |
| Cardlink/Eurobank | VPOS | form POST | service | HTTPS |
| Google Drive | Backup | OAuth | Socialite/custom | HTTPS |
| Web Push (FCM/etc browser) | Push | web-push | package | HTTPS |

---

# 21. LARAVEL 13 PROJECT STRUCTURE (proposed)

```text
app/
  Actions/           # single-purpose use cases
  Console/Commands/  # gdpr:backup, fees:remind, …
  Events/ Listeners/
  Http/Controllers/ Api/ Web/
  Http/Middleware/
  Http/Requests/
  Http/Resources/    # v2 API
  Http/Legacy/       # mirror-compatible responses
  Jobs/
  Mail/
  Models/
  Notifications/
  Policies/
  Services/          # VivaService, SmsService, MirrorImportService…
bootstrap/ database/migrations/ routes/api.php routes/console.php
```

Avoid over-abstract “Repository for every model” unless needed.

---

# 22. TARGET INFRASTRUCTURE (Managed VPS)

```text
Managed VPS (Ubuntu)
├── Nginx (SPA static + /api → php-fpm)
├── React build (dist/) 
├── PHP-FPM 8.3+ / Laravel 13
├── PostgreSQL 16 (or host-managed)
├── Redis (optional→recommended)
├── queue workers (Supervisor)
├── Laravel Scheduler (cron)
├── SSL (Let’s Encrypt)
├── backups + monitoring
```

**Single VPS initially:** YES, for typical club SaaS load — **Requires developer confirmation** of concurrent clubs/users/traffic.

---

# 23. PHP REQUIREMENTS

- PHP **8.3+** (Laravel 13 requirement: **Requires developer confirmation** of official Laravel 13 PHP constraint)
- Extensions: `mbstring`, `openssl`, `pdo_pgsql`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath`, `fileinfo`, `curl`, `zip`, `intl`, `gd` or `imagick` (if server PDFs), `redis` (if Redis), `pcntl`/`posix` helpful for workers
- Composer 2
- Node **only for building frontend** (CI or build host), not required on app runtime if `dist/` prebuilt

---

# 24. NGINX

**Recommended for fewest app changes during transition:**

```text
https://www.teamsuite.me/           → SPA static
https://www.teamsuite.me/api/*      → Laravel public/index.php
```

Same-origin keeps TWA/cookies simpler than `api.` subdomain.  
Subdomain `api.` is fine later with Sanctum stateful domains.

---

# 25. QUEUE WORKERS

| Queue | Jobs | Concurrency | Timeout | Retry |
|-------|------|-------------|---------|-------|
| `default` | misc | 1–2 | 90s | 3 |
| `mail` | emails | 1–2 | 120s | 3 |
| `sms` | sms | 1 | 60s | 3 |
| `sync` | mirror import/ETL | 1 | 600s | 1–2 |

Supervisor programs: `php artisan queue:work --queue=mail,sms,default`.

---

# 26. LARAVEL SCHEDULER MAPPING

| CURRENT | LARAVEL |
|---------|---------|
| Vercel `gdpr backup` 02:00 | `Schedule::command('gdpr:backup')->dailyAt('02:00')` |
| Vercel `retention` 02:30 | `gdpr:retention` dailyAt 02:30 |
| Health card on login | `healthcard:notify-expiring` hourly/daily |
| Warehouse notice | daily |
| Drive backup | as configured |

System crontab: only `schedule:run` every minute.

---

# 27. LOGGING AND MONITORING

- Laravel log channels (daily files) + stderr
- Structured context: club_id, user_id, payment_id (no AMKA/secrets)
- Alert on: queue failed jobs, scheduler misses, 5xx, webhook signature failures
- Avoid overkill APM initially; optional Sentry — **Requires developer confirmation**

---

# 28. BACKUPS

Must back up:
1. **PostgreSQL** (logical dumps + PITR if offered)
2. **Storage disk** (uploads)
3. **`.env`** (secrets vault / encrypted backup — not in Git)
4. Optional: exported mirror snapshots during transition

Source code: Git only.

---

# 29. SECURITY

- `APP_KEY`, DB, mail, payment secrets on VPS only
- HTTPS everywhere; secure cookies; Sanctum CSRF for SPA
- CORS allowlist
- Rate limit auth & public join
- Policies for AMKA/doctor role
- Validate uploads; virus scan optional later
- Verify Viva/Stripe webhooks
- PostgreSQL/Redis bound to localhost or private network
- Firewall: 80/443 only public
- Retire `SS360_ALLOW_INSECURE_SYNC` and long-lived shared sync secrets where possible

---

# 30. MIGRATION STRATEGY (phased — not big bang)

Because this is **not** Express→Laravel, phases adjust:

### PHASE 1 — Freeze & document
Capture mirror JSON schemas, account bundle shape, all `/api` responses, env inventory, cron behavior.

### PHASE 2 — Laravel 13 skeleton on staging VPS
Nginx, PHP, empty PostgreSQL, Sanctum, health check.

### PHASE 3 — ETL design
`MirrorImport` command: Blob/export → normalized tables. Validate counts per club.

### PHASE 4 — Authentication parity
Login/logout/forgot/reset; map roles; TWA cookie tests.

### PHASE 5 — Compatibility API
Implement Legacy Mirror GET/PUT **or** dual-write — choose one strategy (**Requires product decision**).

### PHASE 6 — Module-by-module true APIs
Athletes → Fees → Attendance → Announcements → Finance → … rewriting React data adapters.

### PHASE 7 — Integrations
Mail, SMS, Push, Viva, Stripe, Eurobank, Drive, GDPR.

### PHASE 8 — Scheduler/queues replace Vercel cron & client loops.

### PHASE 9 — React staging against Laravel.

### PHASE 10 — TWA / parent-coach portals.

### PHASE 11 — Production data sync (final ETL + mirror cut).

### PHASE 12 — DNS/cutover from Vercel to VPS (or Laravel on Vercel — atypical).

### PHASE 13 — Keep Vercel project read-only rollback window.

---

# 31. MIGRATION COMPLEXITY (no time estimates)

| Module | Complexity |
|--------|------------|
| Authentication / users / clubs | VERY HIGH |
| Athletes / registry / AMKA | VERY HIGH |
| Coaches / classes / seasons | HIGH |
| Attendance / trainings / schedule | HIGH |
| Fees / finance / receipts | VERY HIGH |
| Announcements / notifications | HIGH |
| Uploads / media | MEDIUM |
| Cron / GDPR | HIGH |
| Email | MEDIUM |
| SMS | MEDIUM |
| Push | MEDIUM |
| Viva / Stripe / Eurobank | HIGH |
| Public join / rent | HIGH |
| “Mobile” TWA portals | MEDIUM |
| Reports / prints / PDF | MEDIUM–HIGH |
| Sync conflict elimination | VERY HIGH |

---

# 32. FUNCTIONAL PARITY CHECKLIST (template)

For each feature module:

- [ ] Laravel implementation complete  
- [ ] API-compatible (or React adapter updated)  
- [ ] Database tested (ETL + constraints)  
- [ ] Authentication tested  
- [ ] Authorization / roles tested  
- [ ] React tested  
- [ ] TWA / parent / coach portals tested  
- [ ] Production-like load/smoke complete  
- [ ] Payments webhooks tested in sandbox  
- [ ] Email/SMS sampled  
- [ ] GDPR export/erase tested  
- [ ] Backup/restore tested  

---

# 33. DATABASE MIGRATION STRATEGY

### Recommendation: **C then stabilize toward normalized B**

- **A (keep existing PostgreSQL schema):** **Impossible as-is** — there is no PostgreSQL schema.  
- **B (gradual normalize):** after initial load.  
- **C (new Laravel schema + migrate data):** **Required** — ETL from Blob mirrors / club JSON exports into Eloquent tables.

Preserve **business data**, not the document physical format.

---

# 34. ZERO / LOW DOWNTIME CUTOVER

1. Staging Laravel with anonymized/full copy ETL  
2. Freeze writes on Vercel (maintenance) **or** short dual-write window  
3. Final mirror pull → ETL  
4. Switch DNS to VPS  
5. Validate login + one club smoke  
6. Monitor webhooks (update Viva URL if host changes)  
7. Rollback DNS to Vercel if critical  

Webhook URL changes need provider console updates — plan explicitly.

---

# 35. ROLLBACK PLAN

1. Keep Vercel deployment immutable during soak period  
2. DNS TTL lowered before cutover  
3. Do not destroy Blob mirrors until soak ends  
4. If Laravel fails: revert DNS; restore read-only warning if partial writes occurred  
5. Document whether any Laravel-only writes must be reverse-ETL’d (**Requires runbook**)

---

# 36. INITIAL VPS SIZING

**No production traffic metrics in repo.**

### Metrics still required (ask ops)
- Active clubs, peak concurrent staff, email blast sizes, mirror payload sizes, monthly payments volume

### MINIMUM (small pilot)
- vCPU: 2  
- RAM: 4 GB  
- NVMe: 80 GB  
- Database: PostgreSQL on same VPS  
- Redis: optional (database queue)  
- Backup: daily off-box dump  

### RECOMMENDED STARTING POINT
- vCPU: 4  
- RAM: 8 GB  
- NVMe: 160+ GB  
- Database: managed PostgreSQL if provider offers  
- Redis: yes (1 GB)  
- Backup: daily + weekly retention  

---

# 37. FUTURE SCALING

```text
LB → Laravel app nodes (stateless) → PostgreSQL primary
                                 → Redis
                                 → Object storage (S3)
```

Keep sessions in Redis/cookie; files on object storage; no local-only mirrors.

---

# 38. FINAL RECOMMENDATION (explicit answers)

1. **Is migration to Laravel 13 feasible?**  
   **YES, technically**, but it is a **re-architecture** (client-document → server RDBMS), not a framework swap.

2. **Can existing React frontend remain?**  
   **PARTIALLY** — UI yes; data layer must change substantially for a proper Laravel API.

3. **Can existing PostgreSQL be preserved?**  
   **N/A — none exists.** New PostgreSQL + ETL from mirrors.

4. **Can existing API contracts be preserved?**  
   **PARTIALLY** — possible via Legacy Mirror/Account compatibility layer; expensive long-term.

5. **Can mobile continue?**  
   **TWA/web portals YES** if origin/auth preserved; no separate native API found.

6. **Most work?**  
   Domain ETL, eliminating client-authoritative sync, finance/fees, auth/session parity, announcement/notification pipelines.

7. **Node-specific irreplaceable deps?**  
   Nothing uniquely Node-only that Laravel cannot replace; **Vercel Blob/OIDC** and **client merge algorithms** need redesign. `pdf-lib` client PDFs can stay in React.

8. **Is Redis required?**  
   **OPTIONAL initially; recommended YES** for queues/cache.

9. **Is S3-compatible storage recommended?**  
   **YES for multi-node / durability**; local disk OK for single VPS MVP.

10. **Can full stack run on one Managed VPS?**  
    **YES** for initial production, with monitoring.

11. **Recommended VPS?**  
    **4 vCPU / 8 GB RAM / 160 GB NVMe** starting point pending metrics.

12. **Main risks?**  
    Data loss during ETL; sync conflict semantics; payment webhook cutover; underestimating client-side business logic volume; AMKA/crypto key migration; dual systems during transition.

---

# 39. EXECUTIVE SUMMARY FOR HOSTING PROVIDER

| | Current | Proposed |
|--|---------|----------|
| Frontend | React 19 SPA (Vite) on Vercel | React SPA (kept, adapters rewritten) |
| Backend | Vercel Serverless Node (`api/*.ts`) | **Laravel 13** on Ubuntu VPS |
| Database | **JSON mirrors in Blob/KV + browser storage** (no PostgreSQL) | **PostgreSQL** (new schema + ETL) |
| Cache | Upstash Redis REST (KV) | Redis (optional→recommended) |
| Queue | Mostly none / request-scoped | Laravel Queue + Supervisor |
| Storage | Vercel Blob (+ Drive backups) | Local disk and/or S3-compatible |
| Integrations | SMTP, SMS.to, Viva, Stripe, Eurobank, Google Drive, Web Push | Same, via Laravel services |

**PHP:** 8.3+ with pdo_pgsql, redis, intl, zip, gd/imagick as needed  
**Workers:** yes (mail/sms/default)  
**Scheduler:** yes (replaces Vercel cron)

**Recommended server:** 4 vCPU / 8 GB RAM / 160 GB NVMe  
**Migration complexity:** **VERY HIGH** (architecture change)  
**Main risks:** data model ETL, client-side logic port, payments webhooks, sync parity

---

# 40. OUTPUT / DISCLAIMER

- This file: `ACADEMY_SUITE_LARAVEL13_MIGRATION_REPORT.md`  
- **No application source was modified for migration.**  
- **Laravel was not installed.**  
- **No production configuration changed.**  
- Product codebase name is **TeamSuite**; report filename kept as requested.  
- Assumed stack in the user prompt (**Express + PostgreSQL + Twilio**) **does not match** the repository; all planning above is based on **inspected code**.

### Open confirmations for the developer/ops
1. Exact production Node version on Vercel  
2. Whether any external mobile native app exists beyond Android TWA  
3. Full Vercel env key list for Stripe/Viva live keys naming  
4. Aggregate traffic / club counts for final sizing  
5. Product decision: **Legacy mirror compatibility** vs **big-bang React data rewrite**  
6. Official Laravel 13 PHP/extension constraints at install time  

---

*End of report.*
