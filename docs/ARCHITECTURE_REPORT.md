# TeamSuite — Πλήρες Αρχιτεκτονικό Report

**Προϊόν:** TeamSuite  
**Repository:** `C:\TeamSuite`  
**Production:** `https://teamsuite-seven.vercel.app` · `https://www.teamsuite.me`  
**Ημερομηνία report:** 2026-10-16  
**Scope:** Περιγραφή της **υπάρχουσας** αρχιτεκτονικής όπως προκύπτει από τον κώδικα (όχι σχέδιο μελλοντικής μετανάστευσης).

---

## 1. Εκτελεστική σύνοψη

Το TeamSuite είναι **SPA διαχείρισης αθλητικού συλλόγου** με **browser-first** μοντέλο δεδομένων:

| Στρώμα | Τι είναι στην πράξη |
|--------|---------------------|
| UI | React 19 + Vite 8 + TypeScript, custom CSS |
| Domain logic | Κυρίως στο **client** (`src/api/services/*`, `src/data/*`) |
| Τοπική αποθήκευση | `localStorage` + **IndexedDB** (ανά σύλλογο) |
| Cloud durability | JSON **club mirrors** + account bundle σε **Upstash Redis / Vercel Blob** |
| Backend | **Vercel Serverless** (`api/*.ts`) — **όχι** Express, **όχι** PostgreSQL/ORM |
| Deploy | Vercel project **teamsuite** |

Η εφαρμογή δουλεύει «πρώτα τοπικά» (γρήγορο UI offline-ish) και συγχρονίζει προς/από το cloud. Το server API είναι κυρίως **sync, auth, πληρωμές, email/SMS, media, δημόσια endpoints** — όχι κλασικό REST CRUD ανά οντότητα.

---

## 2. Υψηλού επιπέδου διάγραμμα

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                            │
│  React pages → services → mutate AppData → localStorage/IDB     │
│       │                         │                               │
│       │ syncAuth (Bearer)       │ debounced push / poll pull    │
└───────┼─────────────────────────┼───────────────────────────────┘
        │                         │
        ▼                         ▼
┌──────────────────┐    ┌─────────────────────────────────────────┐
│  Vercel Serverless│    │  Durable store (api/lib/durableKv.ts)   │
│  api/*.ts         │───▶│  1) Upstash Redis REST (προτιμητέο)     │
│  api/sync/*       │    │  2) Vercel Blob (fallback / media)      │
│  api/lib/*        │    │  3) in-memory (μόνο χωρίς env)          │
└──────────────────┘    └─────────────────────────────────────────┘
        │
        ├── SMTP (Nodemailer) · SMS.to / HTTP SMS
        ├── Viva / Stripe / Eurobank
        ├── Web Push (VAPID)
        └── Google Drive backup (OAuth)
```

---

## 3. Tech stack

### Frontend
- **React** `^19.2`, **react-router-dom** `^7`
- **Vite** `^8.2`, **TypeScript** `~6.0`
- **Zod** για validation εισόδων (`src/schemas`)
- **lucide-react** icons, **recharts** γραφήματα, **pdf-lib** PDF
- Styles: μεγάλο `src/index.css` + modules CSS ανά περιοχή (`photos.css`, `announcements.css`, …) και appearance themes

### Backend (serverless)
- `@vercel/node` handlers στο φάκελο `api/`
- Κοινή λογική στο `api/lib/serverStore.ts`, `durableKv.ts`, `fieldCrypto.ts`, `mirrorChunks.ts`, κ.λπ.

### Αποθήκευση cloud
- `@upstash/redis` — durable key/value
- `@vercel/blob` — Blob store / media / KV fallback paths

### Tooling
- `oxlint`, `vitest`, Playwright (promo screens)
- Scripts: backup, security checks, promo pack

---

## 4. Οργάνωση κώδικα (μονολιθικό SPA + thin API)

```
C:\TeamSuite
├── api/                    # Vercel serverless endpoints
│   ├── lib/                # store, KV, crypto, push, mirror helpers
│   ├── sync/               # mirror, account, club-ops, mirror-students
│   ├── public-join.ts      # δημόσια εγγραφή
│   ├── public-rent.ts      # δημόσια ενοικίαση
│   ├── send-email.ts / send-sms.ts / push.ts
│   ├── viva.ts / stripe.ts / eurobank.ts
│   └── gdpr.ts             # health, backup cron, retention
├── src/
│   ├── pages/              # οθόνες (Athletes, Fees, Matches, …)
│   ├── components/         # layout, UI, panels
│   ├── api/services/       # client domain services (CRUD τοπικά + cloud calls)
│   ├── data/               # AppData store, sync merge, seed
│   ├── auth/               # session, roles, password, clubs
│   ├── platform/           # modules, branding, preview club
│   ├── schemas/            # Zod inputs
│   ├── types/              # AppData + domain types
│   ├── shared/             # κοινά payloads (join, rental, …)
│   ├── hooks/              # useAppData, useCloudMirrorAutoPull, …
│   └── utils/              # helpers (AMKA, sports, surnames, …)
├── docs/                   # οδηγίες, backup inventory, reports
├── vercel.json             # rewrites, cache headers, crons
└── package.json
```

**Σημαντικό:** Ο φάκελος `src/api/services/` **δεν** είναι server. Είναι **client-side services** που:
1. Διαβάζουν/γράφουν `AppData` μέσω `mutateData` / `getData`
2. Καλλούν `/api/...` όταν χρειάζεται sync, media, email, πληρωμές κ.λπ.
3. Επιστρέφουν πάντα `ApiResult<T>` μέσω `apiClient` (`success` / `error`)

---

## 5. Μοντέλο δεδομένων

### 5.1 `AppData` (ανά σύλλογο)

Κεντρική «βάση» στο browser: ένα μεγάλο JSON document ανά `clubId` (`src/types/index.ts` → `AppData`).

Ενδεικτικές συλλογές:
- Μητρώο: `students`, `coaches`, `staff`, `classes`, `parents` links, `clubMembers`
- Λειτουργία: `schedule`, `trainings`, `matches`, `attendance`, `announcements`
- Οικονομικά: `revenues`, `expenses`, `transactions`, `feeChargeTemplates`, `cashAccounts`, `budgets`, αποδείξεις
- Περιεχόμενο: `photos`, `facilities`, `sports`, `clubSeasons`, `rentalBookings`, `partnerBusinesses`
- Compliance: `amkaAccessLogs`, `gdprAuditLogs`, `emailUnsubscribes`, αιτήσεις εγγραφής
- **Tombstones:** `deletedStudentIds`, `deletedMatchIds`, `deletedRegistrationApplicationIds`, … ώστε διαγραφές να μην επανέρχονται από παλιό cloud mirror

### 5.2 Τοπική αποθήκευση
- Keys τύπου `academyhub-data-by-club-v1` (localStorage) + IndexedDB map (`src/data/clubMapIdb.ts`)
- Ενεργός σύλλογος: `resolveActiveClubId()` — για platform admin μπορεί να ισχύει **preview club**
- ΑΜΚΑ: κρυπτογράφηση στο disk, plaintext στο memory (`amkaCrypto` + per-club field key)

### 5.3 Cloud mirrors
- Prefix keys π.χ. `ss360:mirror:{clubId}`, `ss360:pending-apps:{clubId}`, account bundle, notify config, snapshots
- Merge στο server προστατεύει roster / αποδείξεις / ops slices (`mergeMirrorPayloadPreservingRoster`, `mergeOpsSliceIntoPayload`)
- Μεγάλα payloads: **chunked** upload/download + gzip (`api/lib/mirrorChunks.ts`, όριο ~4.5MB Vercel)

### 5.4 Account bundle (πλατφόρμα)
- Users, clubs, κατηγορίες εσόδων/εξόδων, platform branding — ξεχωριστό sync από το club mirror (`api/sync/account.ts`, `accountSyncService`)

---

## 6. Συγχρονισμός (η καρδιά της αρχιτεκτονικής)

### 6.1 Ροή εγγραφής
1. Χρήστης αλλάζει κάτι στην UI  
2. Service καλεί `mutateData` → αποθήκευση τοπικά + event UI refresh  
3. `scheduleClubMirrorPush` / `scheduleClubOpsSlice` (debounce)  
4. Push στο `/api/sync/mirror` ή γρήγορο patch `/api/sync/club-ops`  
5. Άλλες συσκευές: `pullClubMirrorIfNewer` (poll ~3 λεπτά + στο focus tab)

### 6.2 Merge στρατηγική
- Client merge ανά συλλογή: `financeSyncMerge`, `opsSyncMerge`, `clubContentSyncMerge`
- Προτίμηση `updatedAt` / dirty flags / tombstones
- **Write conflicts:** όταν τοπικό και cloud έχουν αποκλίνοντα writes → UI event `CLUB_WRITE_CONFLICT_EVENT` (επιλογή keep local / take cloud / merge-both)

### 6.3 Auto-pull
- Hook `useCloudMirrorAutoPull`: account bundle + club mirror
- Flush ops + full mirror στο `pagehide` / κρύψιμο tab (keepalive)
- Demo sessions και σύντομο grace μετά το login παραλείπονται

### 6.4 Club-ops slice
Ελαφρύ live patch για συχνές αλλαγές (πρόγραμμα, παρουσίες, οικονομικά snippets, αιτήσεις, …) χωρίς πλήρες mirror κάθε φορά — `clubOpsSyncService.ts`.

---

## 7. Authentication & εξουσιοδότηση

### Ρόλοι (`UserRole`)
`platform_admin` · `admin` · `secretariat` · `doctor` · `coach` · `staff` · `athlete` · `parent`

### Session
- Server login: `POST /api/sync/account?kind=session` → token σε `teamsuite-session-token-v1`
- Client session mirror: `teamsuite-session-v1`
- Headers sync: `Authorization: Bearer …` (`src/api/syncAuth.ts`)
- Server: `assertSyncAuthorized` / `assertClubTenantAccess` / platform admin checks

### Πρόσβαση modules
- Ανά σύλλογο ενεργοποιούνται modules (`ACADEMY_MODULES` στο `platformConfig`)
- Ρόλοι + προαιρετικά custom `permissions[]` ανά user
- Coach scope: φίλτρο τμημάτων/αθλητών (`utils/coachScope`)
- Portals: `/app/parent`, `/app/coach`, athlete portal routes

### Multi-tenant
- Κάθε club έχει δικό του `AppData` mirror
- Platform admin μπορεί να κάνει preview συλλόγου χωρίς να αλλάζει session club των κανονικών χρηστών με τον ίδιο τρόπο

---

## 8. Frontend routing & modules

SPA shell: `RequireAuth` → `AppLayout` (nav ανά ενεργά modules).

| Περιοχή | Routes (ενδεικτικά) |
|---------|---------------------|
| Public | `/login`, `/register`, `/join/:slug`, `/rent/:slug`, `/legal`, `/id/card` |
| Club app | `/`, `/athletes`, `/classes`, `/schedule`, `/attendance`, `/matches`, `/fees`, `/finance`, `/announcements`, `/photos`, `/rental`, `/settings`, … |
| Platform | `/platform`, `/platform/users`, `/platform/packages` |
| Mini-apps | `/app/parent`, `/app/coach` |

Lazy loading σελίδων μέσω dynamic imports στο `App.tsx` (μείωση αρχικού bundle).

---

## 9. Server API επιφάνεια

### Sync / δεδομένα
| Endpoint | Ρόλος |
|----------|--------|
| `GET/POST /api/sync/mirror` | Πλήρες club AppData mirror (+ chunked) |
| `PUT /api/sync/club-ops` | Γρήγορο ops slice merge |
| `POST/PATCH /api/sync/account` | Session, users/clubs bundle, media upload (`?kind=media`), club profile |
| `POST /api/sync/mirror-students` | Στοχευμένο upsert αθλητών |

### Δημόσια
| Endpoint | Ρόλος |
|----------|--------|
| `/api/public-join` | Φόρμα εγγραφής, λίστα/dismiss εκκρεμών αιτήσεων |
| `/api/public-rent` | Κρατήσεις ενοικίασης |
| `/api/public-club` | Δημόσια στοιχεία συλλόγου / slug |

### Επικοινωνίες & media
| Endpoint | Ρόλος |
|----------|--------|
| `/api/send-email` | SMTP αποστολή (club/platform) |
| `/api/email-track` | Open/click tracking |
| `/api/send-sms` | SMS.to ή HTTP provider |
| `/api/push` | Web Push subscriptions / send |
| `/api/club-media` | Δημόσια/club media helpers |

### Πληρωμές
| Endpoint | Ρόλος |
|----------|--------|
| `/api/viva` | orders, webhook, settlements |
| `/api/stripe` | Checkout session / verify |
| `/api/eurobank` | Cardlink VPOS digest |

### Compliance / ops
| Endpoint | Ρόλος |
|----------|--------|
| `/api/gdpr` | health, backup snapshot, retention |
| `/api/google-drive` | OAuth backup προς Drive |

`vercel.json` κάνει SPA fallback (`/*` → `index.html`) και aliases για viva/stripe/backup paths.

---

## 10. Cron & παρασκήνιο

Από `vercel.json`:
- **02:00 UTC** — `/api/gdpr?op=backup` (snapshot mirrors)
- **02:30 UTC** — `/api/gdpr?op=retention`

**Δεν υπάρχει** ουρά εργατών (Bull/Redis workers). Μαζικές εργασίες (π.χ. αποστολή πολλών email ανακοινώσεων) τρέχουν **στον browser** σε loops/chunks όσο είναι ανοιχτή η καρτέλα.

Web Push αντί για WebSockets για ειδοποιήσεις γονέων/συσκευών.

---

## 11. Ολοκληρώσεις τρίτων

| Σύστημα | Χρήση |
|---------|--------|
| Nodemailer SMTP | Email συλλόγου / platform / reset / join confirms |
| SMS.to ή custom HTTP | SMS |
| Viva Wallet | Online πληρωμές + webhook settlements |
| Stripe Checkout | Εναλλακτικό checkout |
| Eurobank / Cardlink | VPOS field digest |
| Google Drive | Προαιρετικό cloud backup |
| Web Push (VAPID) | Push notifications |
| Vercel Blob | Media + durable JSON |
| Upstash Redis | Durable KV mirrors/keys |

---

## 12. Ασφάλεια & GDPR (αρχιτεκτονικά)

- Tenant isolation με `clubId` σε sync APIs  
- Session tokens + role checks στο server για ευαίσθητα ops  
- ΑΜΚΑ: field-level encryption, audit logs πρόσβασης  
- GDPR endpoints/retention cron, DSAR-related services στο client  
- Tombstones για διαγραφές  
- Rate limiting σε δημόσια join (`allowRateLimit`)  
- Demo accounts απομονωμένα από cloud bundle  

Λεπτομέρειες checklist: `docs/GDPR-CHECKLIST.md`.

---

## 13. Backup

- Νυχτερινό server snapshot των mirrors (cron)  
- Client Push/Pull από Ρυθμίσεις → Backup  
- Filesystem ZIP script (`scripts/backup-project.ps1`) για κώδικα  
- Inventory ειδών backup: `docs/BACKUP-INVENTORY.md`  

**Κρίσιμο:** χωρίς επιτυχές mirror Push, το νυχτερινό backup αντιγράφει ό,τι υπάρχει ήδη στο cloud — όχι απαραίτητα τις τελευταίες τοπικές αλλαγές που δεν ανέβηκαν.

---

## 14. Πρότυπο ανάπτυξης domain feature

Τυπικό pattern νέας οντότητας (π.χ. αγώνες):

1. Type στο `src/types` + πεδίο στο `AppData`  
2. Zod schema στο `src/schemas`  
3. Service στο `src/api/services/*Service.ts` με `mutateData`  
4. Page στο `src/pages`  
5. Αν χρειάζεται cloud merge: tombstone list + merge στο `clubContentSyncMerge` / ops slice  
6. Module id στο `ACADEMY_MODULES` + nav στο `AppLayout` αν είναι νέα ενότητα  

**Δεν** δημιουργείται πίνακας SQL ούτε Express router.

---

## 15. Ισχυρά σημεία & περιορισμοί

### Ισχυρά
- Γρήγορο UI (τοπικό state)
- Λειτουργία με προσωρινό offline / κακό δίκτυο (μέχρι να γίνει push)
- Ένα deploy (static + serverless) στο Vercel
- Πλούσιο domain σε ένα product surface (μητρώο → οικονομικά → portals)

### Περιορισμοί / trade-offs
- **Δεν υπάρχει κλασική σχεσιακή βάση** · αναφορές ακεραιότητας είναι application-level  
- Business rules τρέχουν στο client → δυσκολότερο server-side audit/enforcement για όλα  
- Μεγάλα mirrors → όρια μεγέθους, chunking, ανάγκη να μην ενσωματώνονται data-URL φωτογραφίες στο JSON  
- Concurrent edits πολλών χρηστών → conflicts / merge, όχι ACID transactions  
- Μαζικά jobs εξαρτώνται από ανοιχτό browser (εκτός crons backup/retention)  

---

## 16. Σχετικά documents στο repo

| Αρχείο | Περιεχόμενο |
|--------|-------------|
| `README.md` | Σύντομη επισκόπηση προϊόντος |
| `docs/BACKUP-INVENTORY.md` | Τι περιλαμβάνει κάθε είδος backup |
| `docs/GDPR-CHECKLIST.md` | GDPR σημεία |
| `ACADEMY_SUITE_LARAVEL13_MIGRATION_REPORT.md` | Ανάλυση πιθανής μετανάστευσης σε Laravel (όχι η τρέχουσα αρχιτεκτονική στόχος) |
| `docs/LARAVEL_REBUILD_PROMPT.md` | Prompt για μελλοντικό rebuild |

---

## 17. Συμπέρασμα

Η TeamSuite είναι **cloud-synced, document-oriented, multi-tenant SPA**:

> **React client = σύστημα εγγραφής/λογικής**  
> **Vercel serverless = πύλη sync + integrations**  
> **Redis/Blob JSON mirrors = ανθεκτικό αντίγραφο ανά σύλλογο**

Αυτό εξηγεί γιατί οι οθόνες «αποθηκεύουν» αμέσως τοπικά, γιατί υπάρχει Push/Pull/auto-sync, και γιατί διαγραφές χρειάζονται tombstones ώστε να μην «επιστρέφουν» από το cloud.
