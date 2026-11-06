# PROMPT — TeamSuite_ver.3: 1:1 αντιγραφή ΟΛΩΝ των οθονών (με screenshots)

Επικόλλησε **ολόκληρο** αυτό το μπλοκ σε chat στο project `C:\TeamSuite_ver.3`.

```
PROJECT: TeamSuite_ver.3 (C:\TeamSuite_ver.3)
REFERENCE APP (read-only): C:\TeamSuite
REFERENCE SCREENSHOTS (visual source of truth): C:\TeamSuite\docs\ver3-screen-parity\screens\
REFERENCE CHECKLIST (fields/tabs): C:\TeamSuite\docs\TEAMSUITE_VER3_SCREEN_PARITY_PROMPT.md και ο παλιός κώδικας src/pages/*

# Στόχος

Φτιάξε / ολοκλήρωσε την UI της **TeamSuite_ver.3** ώστε κάθε οθόνη να είναι **ΑΚΡΙΒΩΣ ίδια** με την υπάρχουσα TeamSuite:
- ίδια routes
- ίδια ελληνικά labels (κουμπιά, tabs, φίλτρα, headers, empty states)
- ίδια toolbars / φόρμες / πίνακες / ενέργειες γραμμής
- ίδια πληροφοριακή ιεραρχία όπως στα screenshots

# Υποχρεωτικοί κανόνες

1. Για ΚΑΘΕ οθόνη: άνοιξε το αντίστοιχο PNG στο φάκελο screens/ ΚΑΙ το αντίστοιχο αρχείο στο C:\TeamSuite\src\pages (ή components). Το screenshot = οπτική αλήθεια. Ο κώδικας = πλήρης λίστα πεδίων/ενεργειών.
2. Δεν παραλείπεις οθόνες «για αργότερα». Αν λείπει κάτι = blocker.
3. ΜΗΝ αλλάζεις το νόημα επιλογών. Επιτρέπεται καλύτερο CSS / grouped sidebar, ΑΛΛΑ όχι κόψιμο λειτουργιών ή πεδίων.
4. Module gates + role permissions όπως στην παλιά.
5. Portals (parent/coach/athlete) + public pages συμπεριλαμβάνονται.
6. Στο τέλος κάθε φάσης: checklist οθόνη → ✅/❌ με αναφορά στο screenshot id.

# Κατάλογος screenshots (οπτική πηγή αλήθειας)

| # | Screenshot file | Route | Τίτλος |
|---:|---|---|---|
| 1 | `screens/00-join.png` | `/join/demo` | Δημόσια εγγραφή |
| 2 | `screens/00-legal.png` | `/legal` | Νομικά |
| 3 | `screens/00-login-coach.png` | `/login?app=coach` | Σύνδεση προπονητή |
| 4 | `screens/00-login-parent.png` | `/login?app=parent` | Σύνδεση γονέα |
| 5 | `screens/00-login.png` | `/login` | Σύνδεση |
| 6 | `screens/00-register.png` | `/register` | Εγγραφή συλλόγου |
| 7 | `screens/00-rent.png` | `/rent/demo` | Δημόσια ενοικίαση |
| 8 | `screens/01-dashboard.png` | `/` | Προεπισκόπηση |
| 9 | `screens/02-calendar.png` | `/calendar` | Ημερολόγιο |
| 10 | `screens/03-athletes.png` | `/athletes` | Αθλητές |
| 11 | `screens/03b-athlete-personal.png` | `/athletes/demo_ath_f1` | Προφίλ — Προσωπικά |
| 12 | `screens/03b-athlete-profile.png` | `/athletes/demo_ath_f1` | Προφίλ αθλητή |
| 13 | `screens/03c-athlete-amka.png` | `/athletes/demo_ath_f1` | Προφίλ — ΑΜΚΑ |
| 14 | `screens/03d-athlete-health.png` | `/athletes/demo_ath_f1` | Προφίλ — Κάρτα υγείας |
| 15 | `screens/03e-athlete-fees.png` | `/athletes/demo_ath_f1` | Προφίλ — Συνδρομές |
| 16 | `screens/03f-athlete-gdpr.png` | `/athletes/demo_ath_f1` | Προφίλ — GDPR |
| 17 | `screens/03g-athlete-progress.png` | `/athletes/demo_ath_f1` | Προφίλ — Πρόοδος |
| 18 | `screens/03h-athlete-history.png` | `/athletes/demo_ath_f1` | Προφίλ — Ιστορικό |
| 19 | `screens/04-staff.png` | `/staff` | Προσωπικό |
| 20 | `screens/05-coaches.png` | `/coaches` | Προπονητές |
| 21 | `screens/06-classes.png` | `/classes` | Τμήματα |
| 22 | `screens/06b-class-profile.png` | `/classes/demo_class_bask_u12` | Προφίλ τμήματος |
| 23 | `screens/07-parents.png` | `/parents` | Γονείς |
| 24 | `screens/07b-members.png` | `/members` | Μέλη |
| 25 | `screens/08-trainings.png` | `/trainings` | Προπονήσεις |
| 26 | `screens/09-matches.png` | `/matches` | Αγώνες |
| 27 | `screens/10-schedule.png` | `/schedule` | Πρόγραμμα |
| 28 | `screens/11-attendance.png` | `/attendance` | Παρουσίες |
| 29 | `screens/12-associations.png` | `/associations` | Σωματείο |
| 30 | `screens/13-sports.png` | `/sports` | Άθλημα |
| 31 | `screens/14-announcements.png` | `/announcements` | Ανακοινώσεις |
| 32 | `screens/15-prints.png` | `/prints` | Εκτυπώσεις |
| 33 | `screens/16-photos.png` | `/photos` | Φωτογραφίες |
| 34 | `screens/16b-rental.png` | `/rental` | Ενοικίαση |
| 35 | `screens/17-warehouse.png` | `/warehouse` | Αποθήκη |
| 36 | `screens/18-fees.png` | `/fees` | Συνδρομές / Πληρωμές |
| 37 | `screens/19-transactions.png` | `/transactions` | Συναλλαγές |
| 38 | `screens/20-partners.png` | `/partner-businesses` | Συμβεβλημένες επιχειρήσεις |
| 39 | `screens/20b-document-protocol.png` | `/document-protocol` | Πρωτόκολλο Εγγράφων |
| 40 | `screens/21-finance.png` | `/finance` | Οικονομικά |
| 41 | `screens/21a-finance-analysis.png` | `—` | 21a-finance-analysis |
| 42 | `screens/21b-finance-revenues.png` | `—` | 21b-finance-revenues |
| 43 | `screens/21c-finance-expenses.png` | `—` | 21c-finance-expenses |
| 44 | `screens/21d-finance-accounts.png` | `—` | 21d-finance-accounts |
| 45 | `screens/21e-finance-budget.png` | `/finance` | Οικονομικά — Προϋπολογισμός |
| 46 | `screens/21f-finance-reports.png` | `/finance` | Οικονομικά — Αναφορές |
| 47 | `screens/21g-finance-balance.png` | `/finance` | Οικονομικά — Ισοζύγιο |
| 48 | `screens/22-settings.png` | `/settings` | Ρυθμίσεις |
| 49 | `screens/22a-settings-club.png` | `/settings?tab=club` | Ρυθμίσεις — Σύλλογος |
| 50 | `screens/22b-settings-users.png` | `/settings?tab=users` | Ρυθμίσεις — Χρήστες |
| 51 | `screens/22c-settings-email.png` | `/settings?tab=email` | Ρυθμίσεις — Email |
| 52 | `screens/22d-settings-viva.png` | `—` | 22d-settings-viva |
| 53 | `screens/22d2-settings-payments.png` | `/settings?tab=payments` | Ρυθμίσεις — Πληρωμές |
| 54 | `screens/22e-settings-register.png` | `—` | 22e-settings-register |
| 55 | `screens/22e2-settings-public-reg.png` | `/settings?tab=publicRegistration` | Ρυθμίσεις — Δημόσια εγγραφή |
| 56 | `screens/22f-settings-gdpr.png` | `/settings?tab=amka` | Ρυθμίσεις — GDPR |
| 57 | `screens/22g-settings-backup.png` | `/settings?tab=backup` | Ρυθμίσεις — Backup |
| 58 | `screens/22h-settings-facility.png` | `/settings?tab=facilities` | Ρυθμίσεις — Γήπεδο |
| 59 | `screens/22i-settings-sms.png` | `/settings?tab=sms` | Ρυθμίσεις — SMS |
| 60 | `screens/22j-settings-season.png` | `/settings?tab=seasons` | Ρυθμίσεις — Σεζόν |
| 61 | `screens/22k-settings-receipts.png` | `/settings?tab=receipts` | Ρυθμίσεις — Αποδείξεις |
| 62 | `screens/22l-settings-terms.png` | `/settings?tab=terms` | Ρυθμίσεις — Όροι |
| 63 | `screens/22m-settings-clothing.png` | `/settings?tab=clothing` | Ρυθμίσεις — Πακέτο ρουχισμού |
| 64 | `screens/22n-settings-discounts.png` | `/settings?tab=discounts` | Ρυθμίσεις — Λόγοι έκπτωσης |
| 65 | `screens/22o-settings-sizes.png` | `/settings?tab=sizes` | Ρυθμίσεις — Μεγεθολόγιο |
| 66 | `screens/30-parent-overview.png` | `/?tab=overview` | Περιοχή γονέα — Αρχική |
| 67 | `screens/31-parent-schedule.png` | `/?tab=schedule` | Περιοχή γονέα — Πρόγραμμα |
| 68 | `screens/32-parent-payments.png` | `/?tab=payments` | Περιοχή γονέα — Πληρωμές |
| 69 | `screens/33-parent-documents.png` | `/?tab=documents` | Περιοχή γονέα — Έγγραφα |
| 70 | `screens/40-coach-portal.png` | `/` | Περιοχή προπονητή |
| 71 | `screens/50-app-coach.png` | `/app/coach` | App προπονητή |
| 72 | `screens/50-app-parent.png` | `/app/parent` | App γονέα |

# Σειρά υλοποίησης

U0 Layout + login + dashboard
U1 Αθλητές + προφίλ (όλα τα tabs 03b–03h) + τμήματα + γονείς + προπονητές + μέλη
U2 Ημερολόγιο / πρόγραμμα / προπονήσεις / παρουσίες / αγώνες
U3 Fees / transactions / finance (όλα τα tabs 21*) / prints
U4 Announcements / photos / warehouse / rental / protocol / partners
U5 Settings όλες οι καρτέλες 22*
U6 Public: register / join / rent / legal / app-parent / app-coach
U7 Portals parent (30–33) + coach (40)
U8 Platform Admin (αν υπάρχει στο ver.3 scope — διάβασε παλιό /platform*)

# Οδηγία έναρξης

Ξεκίνα επιβεβαιώνοντας: θα παραδώσεις 1:1 screen parity με την παλιά TeamSuite χρησιμοποιώντας τα PNG στο C:\TeamSuite\docs\ver3-screen-parity\screens\ ως οπτική πηγή αλήθειας και τον παλιό κώδικα για πλήρη πεδία. Πρώτη παράδοση: U0 + πίνακας ✅/❌ για όλα τα screenshots του καταλόγου (ακόμα και αν είναι ❌).
```

---

## Πώς το χρησιμοποιείς

1. Άνοιξε το project **TeamSuite_ver.3** (`C:\TeamSuite_ver.3`).
2. Επικόλλησε το μπλοκ μέσα στα triple backticks παραπάνω.
3. Τα screenshots είναι ήδη στο: `C:\TeamSuite\docs\ver3-screen-parity\screens\` (**72 PNG**).
4. Για λεπτομέρειες πεδίων/tabs δες και το εκτενές checklist στο `docs/TEAMSUITE_VER3_SCREEN_PARITY_PROMPT.md`.

## Επαναλήψη capture

```powershell
$env:PROMO_BASE_URL='https://teamsuite-seven.vercel.app'
node scripts/capture-ver3-parity-screens.mjs
node scripts/capture-ver3-parity-screens-extra.mjs
node scripts/build-ver3-parity-prompt.mjs
```

Captured from: `https://teamsuite-seven.vercel.app` (DEMO) · 72 screens · 2026-10-16
