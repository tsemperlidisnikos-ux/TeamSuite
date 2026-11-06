# Prompt: TeamSuite_ver.3 — πλήρης εφαρμογή από την αρχή

**Όνομα νέας εφαρμογής:** `TeamSuite_ver.3`  
**Φάκελος project:** `C:\TeamSuite_ver.3`  
**Παλιά εφαρμογή (αναφορά μόνο):** `C:\TeamSuite` — ΜΗΝ γράφεις μέσα της· μόνο διάβασμα / backup import.

---

## Φάκελος — τι κάνεις εσύ

**Δεν χρειάζεται να δημιουργήσεις εσύ τον φάκελο εκ των προτέρων.**

1. Άνοιξε **νέο** Cursor Agent / chat.
2. Επικόλλησε το **PROMPT** παρακάτω.
3. Ο agent θα δημιουργήσει το `C:\TeamSuite_ver.3` και θα κάνει `composer create-project` / Laravel scaffold μέσα του.

Εναλλακτικά (αν θέλεις να είσαι σίγουρος): δημιούργησε άδειο `C:\TeamSuite_ver.3`, άνοιξέ το ως workspace στο Cursor, και επικόλλησε το prompt — τότε ο agent δουλεύει μέσα στο ήδη ανοιχτό root.

**Μην** αντιγράφεις τον παλιό φάκελο `C:\TeamSuite` μέσα στο ver.3. Είναι νέο greenfield project.

---

## Σύσταση stack (για εσένα)

| | |
|--|--|
| Backend | Laravel + PostgreSQL σε **VPS** (όχι Vercel) |
| UI admin | Ομαδοποιημένο sidebar (ΜΗΤΡΩΟ / ΠΡΟΓΡΑΜΜΑ / ΟΙΚΟΝΟΜΙΚΑ / ΕΠΙΚΟΙΝΩΝΙΑ) |
| Mobile | Capacitor Android + iOS → ίδιο VPS URL (auto-update σε κάθε deploy) |
| Backup | Υποχρεωτική επαναφορά παλιών TeamSuite Club JSON |

---

## PROMPT (αντιγραφή από εδώ μέχρι το τέλος του μπλοκ)

```
Όνομα προϊόντος / project: TeamSuite_ver.3

Θέλω να φτιάξεις από την ΑΡΧΗ την ΠΛΗΡΗ εφαρμογή διαχείρισης αθλητικών συλλόγων TeamSuite_ver.3, ισοδύναμη σε ΟΛΕΣ τις λειτουργίες με την υπάρχουσα εφαρμογή TeamSuite (όχι MVP). Multi-tenant sports club / academy management SaaS με σωστή server-side αρχιτεκτονική.

# 0. Τοποθεσία project (υποχρεωτικό)

- Δημιούργησε (αν δεν υπάρχει) και δούλεψε ΑΠΟΚΛΕΙΣΤΙΚΑ στο: C:\TeamSuite_ver.3
- Greenfield Laravel project μέσα σε αυτόν τον φάκελο (composer create-project ή ισοδύναμο).
- ΜΗΝ τροποποιείς αρχεία στο C:\TeamSuite (παλιά εφαρμογή). Μπορείς να το διαβάσεις μόνο ως αναφορά για λειτουργίες / schema / backup format.
- Git remote / repo name: TeamSuite_ver.3 (ξεχωριστό από το παλιό TeamSuite).
- Display name στην UI: TeamSuite (ή TeamSuite ver.3 όπου χρειάζεται versioning)· εσωτερικό project name: TeamSuite_ver.3

ΚΡΙΤΙΚΟΣ ΠΕΡΙΟΡΙΣΜΟΣ ΚΟΣΤΟΥΣ:
- Η παλιά εφαρμογή στο Vercel έχει πολύ μεγάλο κόστος. ΑΠΑΓΟΡΕΥΕΤΑΙ Vercel, Vercel Blob, Vercel Cron, Laravel Vapor, και γενικά serverless usage-billing ως κύριο hosting.
- Στόχος: προβλέψιμο χαμηλό κόστος σε VPS (Hetzner / Contabo / DigitalOcean ή ισοδύναμο).
- Ένα (ή λίγα) πάντα-ενεργά servers: Nginx + PHP-FPM + PostgreSQL + Redis + Supervisor για queues + Laravel Scheduler μέσω system cron.
- Storage: τοπικός δίσκος στο VPS αρχικά· προαιρετικά S3-compatible φθηνό object storage αργότερα (όχι Vercel Blob).
- Μη σχεδιάσεις αρχιτεκτονική που εξαρτάται από ακριβά managed PaaS.

ΚΡΙΤΙΚΗ ΑΠΑΙΤΗΣΗ — ΕΠΑΝΑΦΟΡΑ BACKUP ΠΑΛΙΑΣ TEAMSUITE (MUST HAVE):
Η TeamSuite_ver.3 ΠΡΕΠΕΙ να ανεβάζει και να ΕΠΑΝΑΦΕΡΕΙ τα υπάρχοντα backup αρχεία συλλόγου που παράγει η παλιά TeamSuite.

Μορφή:
- Club JSON από Ρυθμίσεις → Backup → Λήψη JSON (και ισοδύναμα από Platform Admin / logo / scheduled / Google Drive).
- Τυπικό όνομα: TeamSuite-{όνομα-συλλόγου}-YYYY-MM-DD-ΩΩ-ΛΛ (ενεργοί).json
- Payload (BackupPayload):
  - exportedAt, scope: "club", sourceClubId
  - appData και/ή appDataByClub[clubId] (πλήρες AppData)
  - clubs[] (χωρίς secrets), users[] (χωρίς password hashes)
- Secrets στο αρχείο είναι redacted → στην επαναφορά ΜΗΝ σβήνεις υπάρχοντα secrets αν το εισερχόμενο είναι κενό/masked.
- Αν λείπει ο σύλλογος: δημιουργία με το ίδιο sourceClubId.
- Αν υπάρχει: επιβεβαίωση UI + dry-run μετρητές πριν το replace/merge.
- Υποστήριξη και scope: "platform" full JSON για Platform Admin.
- ETL: JSON → Eloquent/PostgreSQL πίνακες (όχι blob ως μοναδική πηγή αλήθειας μετά το import).
- Feature test με fixture + UI «Επαναφορά από αρχείο TeamSuite».
- Χωρίς αυτό = blocker / όχι go-live.

# 1. Στόχος προϊόντος — ΠΛΗΡΗΣ εφαρμογή

Ελληνική πλατφόρμα SaaS για αθλητικούς συλλόγους / ακαδημίες:
- Ένας λογαριασμός πλατφόρμας διαχειρίζει πολλούς συλλόγους (clubs).
- Κάθε σύλλογος έχει μητρώο, πρόγραμμα, οικονομικά, portals, δημόσιες φόρμες.
- Ρόλοι: platform_admin, admin, secretariat, coach, staff, doctor, athlete, parent (+ per-user permissions, finance_own_entries_only).
- Scope = ΟΛΑ τα modules της παλιάς TeamSuite. Το ERD καλύπτει τα πάντα από την αρχή· η υλοποίηση γίνεται σε φάσεις.

ΜΗΝ αντιγράψεις browser-first localStorage + JSON mirrors. Server (PostgreSQL) = πηγή αλήθειας.

# 2. Τεχνολογικό stack (υποχρεωτικό)

- Backend: Laravel (τελευταία σταθερή) + PHP 8.3+
- DB: PostgreSQL
- Auth: Laravel session / Sanctum όπως ταιριάζει
- Queues: Redis + Supervisor workers στο VPS
- Scheduler: system cron → php artisan schedule:run
- Storage: local/public στο VPS· optional S3-compatible αργότερα
- Frontend προεπιλογή: Laravel + Inertia.js + React (ένα deploy, ίδιο origin)
- ΑΠΑΓΟΡΕΥΕΤΑΙ: Vercel / Vercel Blob / serverless-first / Vapor
- Form Requests, Policies (+ Spatie permission επιτρέπεται)
- Feature tests: auth, join, fees, payment webhooks, GDPR, TeamSuite backup restore
- UI γλώσσα: Ελληνικά
- Deploy docs: VPS Nginx, SSL, env, migrations, workers, scheduler, backups

## 2b. UI / Navigation (κλειδωμένο)

Admin desktop — ομαδοποιημένο collapsible left sidebar:
- ΜΗΤΡΩΟ → Αθλητές, Γονείς, Προπονητές, Προσωπικό, Μέλη, Τμήματα
- ΠΡΟΓΡΑΜΜΑ → Ημερολόγιο, Προπονήσεις, Αγώνες, Πρόγραμμα, Παρουσίες
- ΟΙΚΟΝΟΜΙΚΑ → Συνδρομές/Πληρωμές, Συναλλαγές, Οικονομικά, Αποθήκη, Ενοικίαση
- ΕΠΙΚΟΙΝΩΝΙΑ → Ανακοινώσεις, Φωτογραφίες, Εκτυπώσεις, Συμβεβλημένες επιχειρήσεις, Πρωτόκολλο
- Ξεχωριστά: Ρυθμίσεις · Platform (μόνο platform_admin)
- Mobile admin: drawer
- Portals (parent/coach/athlete): bottom tabs — όχι πλήρες admin sidebar
- Look: athletic/admin modern (navy/charcoal + ένα accent)· όχι purple gradients, όχι cream/serif broadsheet
- Branding: TeamSuite_ver.3 στο about/version· κύριο brand «TeamSuite»

## 2c. Android + iOS + αυτόματα updates (υποχρεωτικό)

- Capacitor apps Android + iOS που φορτώνουν το HTTPS origin του VPS (ίδιο frontend).
- Entry points: admin, /app/parent, /app/coach, athlete portal.
- Κάθε deploy στο VPS = άμεση ενημέρωση μέσα στις εγκατεστημένες εφαρμογές χωρίς store review για UI/λειτουργίες.
- Store release μόνο για native αλλαγές (icons, splash, permissions, push plugins).
- Push: Capacitor + FCM/APNs όπου χρειάζεται.
- v1: basic offline «no connection»· όχι πλήρες offline sync.
- Docs: APK/AAB, IPA, store listings, App Links / Universal Links.
- ΑΠΑΓΟΡΕΥΕΤΑΙ ξεχωριστό native rewrite (RN/Flutter από μηδέν) — σπάει το auto-update και διπλασιάζει κόστος.

# 3. Multi-tenancy

- Club με slug, settings, branding, license package / enabled modules.
- Όλα scoped by club_id.
- Tenancy middleware / global scopes.
- platform_admin: όλοι οι σύλλογοι, users, packages, waitlist, branding.

# 4. Ρόλοι

platform_admin, admin, secretariat, coach, staff, doctor, athlete, parent
+ custom permissions[] + finance_own_entries_only
Portals: parent, coach, athlete με σωστά links.

# 5. Domain modules — πλήρης ισοδυναμία

## 5.1 Μητρώο
Αθλητές (πλήρες προφίλ, πολλαπλά τμήματα/αθλήματα, GDPR, ΑΜΚΑ encrypted, στολή, εκπτώσεις), active|inactive|trial, προπονητές (ΓΓΑ, άδειες), staff, μέλη, γονείς + ParentAthleteLink, associations, sports, club seasons, academy classes, προφίλ, import/export spreadsheet, change logs, soft deletes.

## 5.2 Πρόγραμμα & αθλητική λειτουργία
Schedule, trainings, attendance, matches, calendar, progress reports.

## 5.3 Επικοινωνία
Announcements + audience, email (club SMTP + platform fallback), SMS (SMS.to | HTTP), Web Push, preferred parent email, unsubscribes, email tracking optional, health-card notices, low-stock notices.

## 5.4 Οικονομικά & συνδρομές
Fee templates + auto-generate, charges/payments + allocation, receipts book (σειρές/αύξων, ακυρώσεις), revenues/expenses, cash accounts, budgets, closed finance months, online checkouts, discount reasons, bridges από athlete payments & rentals.

## 5.5 Πληρωμές
Viva (order + webhook + settlements), Stripe Checkout, Eurobank/Cardlink field digest. Idempotent webhooks. Όχι πλήρη στοιχεία κάρτας.

## 5.6 Αποθήκη
Products, stock movements, clothing packages, size chart, low-stock alerts.

## 5.7 Εγκαταστάσεις & ενοικίαση
Facilities, rental settings/bookings, δημόσιο /rent/{slug}.

## 5.8 Δημόσια εγγραφή
/join/{slug} full|trial|waitlist, applications pending|approved|rejected, GDPR + υπογραφή + form snapshot, register club, waitlist.

## 5.9 Media & εκτυπώσεις
Gallery + GDPR, athlete photos, logos, prints/PDF, δημόσια κάρτα /id/card.

## 5.10 Πρωτόκολλο & συμμόρφωση
Document protocol (αυτόματος αριθμός), GDPR DSAR/consent/retention/audit, ΑΜΚΑ crypto + fingerprint + audit χωρίς plaintext, terms/DPA/retention HTML, legal pages, login activity.

## 5.11 Platform Admin
Clubs, platform users, license packages, branding, waitlist, diagnostics, backup policies.

## 5.12 Ρυθμίσεις συλλόγου
Users/permissions, SMTP/SMS/Push, seasons/sports/facilities, terms,
Backup/Restore:
- Native TeamSuite_ver.3 export ανά σύλλογο
- Import παλιού TeamSuite Club JSON (+ platform full για PA)
- Preview, preserve secrets, same club id
- Server scheduled backups + optional Google Drive

# 6. Αρχιτεκτονικές αρχές

1. PostgreSQL = μοναδική πηγή αλήθειας.
2. Controllers λεπτοί → Form Requests → Actions/Services → Models → Policies → Jobs.
3. Κάθε mutation: server validation + authorization.
4. Soft deletes με deleted_at.
5. UUID/ULID όπου βοηθά.
6. Emails/SMS/push/exports σε Queued Jobs.
7. Multi-device μέσω API + updated_at/locking — ΟΧΙ full-club JSON mirror sync.
8. ΑΜΚΑ encrypted + audit.
9. Public join/rent: rate limits.
10. Φιλικά URLs: /join/{slug}, /rent/{slug}, portals.

# 7. Ενδεικτικά models

Users, Clubs, ClubSettings, LicensePackages,
Athletes, Coaches, StaffMembers, ClubMembers, Associations, Sports, ClubSeasons,
AcademyClasses (+ pivots), ScheduleSlots, Trainings, Attendances, Matches,
Announcements, AthleteTransactions, FeeChargeTemplates, ReceiptSeries/Issues,
Revenues, Expenses, CashAccounts, BudgetLines, ClosedFinanceMonths,
OnlineCheckouts, PaymentSettlements, WarehouseProducts, StockMovements,
ClothingPackages, DiscountReasons, Facilities, RentalSettings, RentalBookings,
RegistrationApplications, ParentAthleteLinks, ProgressReports, GalleryPhotos,
DocumentProtocolEntries, AmkaAccessLogs, GdprAuditLogs, EmailUnsubscribes,
LoginActivities, PartnerBusinesses, PartnerOffers, MediaFiles, ClubBackups.

# 8. API / UI

- Admin screens για όλα τα modules με το grouped sidebar.
- Platform area.
- Public: login, register club, join, rent, legal, athlete id card.
- JSON resources + pagination/filters όπου χρειάζεται.
- OpenAPI ή τεκμηριωμένα endpoints.

# 9. Jobs / Scheduler

gdpr:backup, gdpr:retention, fee auto-generate, health-card notices, warehouse low-stock, announcement fanout, payment settlement reconciliation, optional Drive backup.

# 10. Μη λειτουργικές

- Ελληνικό UI, responsive, PWA-friendly
- CSRF, rate limits, webhook verification
- Auditable finance + GDPR
- Demo seeders χωρίς production passwords
- README: local + VPS
- Schema mapping πλήρες για παλιά AppData/BackupPayload

# 11. Φάσεις

Φάση 0: ADR + ERD + role×module matrix + BackupPayload→tables mapping + δημιουργία C:\TeamSuite_ver.3
Φάση 1: Auth, clubs, tenancy, platform skeleton + grouped sidebar shell
Φάση 2: Athletes/classes/coaches/parents + portals
Φάση 3: Schedule/trainings/attendance/matches/calendar
Φάση 4: Fees/transactions/receipts/finance
Φάση 5: Announcements + email/SMS/push
Φάση 6: Join/rent + applications
Φάση 7: Warehouse, photos, protocol, partners
Φάση 8: Payment gateways + webhooks
Φάση 9: GDPR/AMKA + TeamSuite JSON restore + native backups + scheduler
Φάση 10: Hardening, tests, indexes, VPS deploy docs
Φάση 11: Capacitor Android + iOS (admin/parent/coach), verify VPS deploy = instant app update

Ξεκίνα από Φάση 0 και Φάση 1. Πρώτη ενέργεια: δημιουργία φακέλου C:\TeamSuite_ver.3 και Laravel scaffold. Μην παραλείψεις modules από ERD. Restore παλιού TeamSuite JSON, grouped sidebar, και Capacitor auto-update είναι κριτήρια αποδοχής.

# 12. Αποφύγε

- Browser-authoritative data / full-club JSON mirror ως κύριο sync
- Business logic μόνο στο frontend
- Twilio ως μόνο SMS provider
- Plaintext ΑΜΚΑ σε logs
- Hardcoded credentials
- God controllers
- Vercel / Vapor / serverless billing
- MVP που κόβει modules από το τελικό scope
- Επεξεργασία του παλιού C:\TeamSuite

Επιβεβαίωσε κατανόηση με: (α) architecture + VPS cost estimate, (β) πλήρες ERD, (γ) role×module matrix, (δ) φάσεις 0–11 — μετά δημιούργησε το C:\TeamSuite_ver.3 και ξεκίνα υλοποίηση.
```

---

## Πώς να προχωρήσεις τώρα

1. **Δεν χρειάζεται** να φτιάξεις φάκελο μόνος σου (εκτός αν θέλεις άδειο workspace).
2. File → Open Folder ή νέο Agent window στο `C:\TeamSuite_ver.3`.
3. Επικόλλησε το μπλοκ **PROMPT** από αυτό το αρχείο.
4. Για **ακριβώς ίδιες οθόνες/επιλογές** επικόλλησε και το:  
   `C:\TeamSuite\docs\TEAMSUITE_VER3_SCREEN_PARITY_PROMPT.md`
5. Ζήτα: «Ξεκίνα Φάση 0–1 στο `C:\TeamSuite_ver.3`».

Το παλιό `C:\TeamSuite` μένει ως έχει (production / αναφορά / backups).
