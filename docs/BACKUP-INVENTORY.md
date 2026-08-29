# Κατάλογος Backup — TeamSuite

Τελευταία ενημέρωση περιεχομένου: **2026-08-29** (ZIP `C:\TeamSuite_backup` + deploy `teamsuite`).

Αυτό το αρχείο ενημερώνεται κάθε φορά που αλλάζει τι περιλαμβάνει κάποιο backup, ή μετά από **BACKUP + DEPLOY** (νέα γραμμή στο ιστορικό ZIP κώδικα).

---

## Είδη backup (τι περιλαμβάνει το καθένα)

| Ονομασία backup | Πού / πώς | Τι ακριβώς περιλαμβάνει | Τι ΔΕΝ περιλαμβάνει |
|-----------------|-----------|-------------------------|---------------------|
| **Club JSON** | Ρυθμίσεις → Backup → Λήψη JSON · ή Platform Admin → Backup συλλόγου | Μόνο τον ενεργό/επιλεγμένο σύλλογο: `AppData` (αθλητές, τμήματα, πρόγραμμα, παρουσίες, οικονομικά, αποθήκη, αιτήσεις, GDPR logs εντός AppData, κ.λπ.), το record του συλλόγου (προφίλ, licenses, δημόσια εγγραφή **χωρίς** secrets), users του συλλόγου **χωρίς** password hashes. `scope: club`. **Όνομα αρχείου:** `TeamSuite-{όνομα-συλλόγου}-ΗΜΕΡΟΜΗΝΙΑ.json` (διατηρούνται ελληνικοί χαρακτήρες). **Restore:** club Settings ή Platform Admin «Επαναφορά συλλόγου» (.json) | Άλλους συλλόγους, `platformConfig`, platform admins, SMTP password, Viva clientSecret, password hashes |
| **Club scheduled backup** | Ρυθμίσεις → Backup → Προγραμματισμένο backup | Ίδιο με **Club JSON** (mode=λήψη JSON) ή **Cloud mirror** την ορισμένη ημερομηνία/ώρα (μία φορά) ή καθημερινά/εβδομαδιαία. Τρέχει στο browser όσο η εφαρμογή είναι ανοιχτή· αν χάθηκε η ώρα, εκτελείται στο επόμενο άνοιγμα | Secrets όπως Club JSON· δεν τρέχει με κλειστό tab |
| **Platform full JSON** | Platform Admin → Backup → Λήψη full backup | Όλους τους συλλόγους (`appDataByClub`), ενεργό `appData`, `users` (χωρίς hashes), `clubs` (χωρίς SMTP/Viva secrets), πλήρες `platformConfig`. `scope: platform`. **Restore:** μόνο «Επαναφορά όλης της εφαρμογής» (.json, όχι club-only αρχεία) | SMTP passwords, Viva secrets, password hashes (redacted στο download) |
| **Scheduled full (browser)** | Platform Admin → Πρόγραμμα backup → fullApp | Ίδιο με Platform full JSON αν mode=download· αν mode=cloud: push mirror **όλων** των συλλόγων | Secrets στα JSON (redacted)· δεν τρέχει αν δεν είναι ανοιχτή η εφαρμογή ως Platform Admin |
| **Scheduled per-club (browser)** | Πρόγραμμα backup → perClub | Ανά επιλεγμένο σύλλογο: ίδιο με **Club JSON** (ή cloud mirror push) | Άλλους συλλόγους· secrets στα JSON |
| **Cloud mirror συλλόγου** | Ρυθμίσεις → Backup → Push/Pull mirror (ή auto sync) | Live `AppData` του συλλόγου στο Blob/Redis (ευαίσθητα πεδία κρυπτογραφημένα στο push). **Αυτόματο sync ενεργό από προεπιλογή** για κάθε σύλλογο (opt-out από το checkbox) | Users/clubs/config, ιστορικό εκδόσεων (overwrite), SMTP/Viva στο mirror |
| **Cloud account bundle** | Platform Admin: Push/Pull λογαριασμοί | `users`, `clubs`, `platformConfig` στο cloud. Pull/push **διατηρεί** υπάρχοντα SMTP/Viva secrets αν το εισερχόμενο έχει κενό/`********` | AppData αθλητών (αυτό είναι στο mirror) |
| **Server cron snapshot** | Vercel cron `0 2 * * *` → `/api/gdpr?op=backup` | Ημερήσιο αντίγραφο **υπαρχόντων** club mirrors (`ss360:backup-snap:ΗΜΕΡΟΜΗΝΙΑ:clubId`) | Account bundle· συλλόγους χωρίς προηγούμενο mirror push· δεν υπάρχει UI restore στην εφαρμογή |
| **Filesystem project ZIP** | `scripts/backup-project.ps1` → `C:\TeamSuite_backup\` (`TeamSuite_yyyy-MM-dd_HH-mm-ss.zip`) | Source code του project (χωρίς `node_modules`, `dist`, `.git`, `.env`, credentials) | Δεδομένα αθλητών / localStorage / Redis· δεν είναι data backup |
| **Git commit «Backup: …»** | Μετά από BACKUP + DEPLOY | Snapshot κώδικα στο git history | Runtime δεδομένα συλλόγων |

---

## Πολιτική secrets (ισχύει σε όλα τα downloadable JSON backup)

| Στοιχείο | Στο αρχείο backup |
|----------|-------------------|
| Password hashes χρηστών | Κενά (διατηρούνται τοπικά στην επαναφορά Platform Admin) |
| SMTP password | Κενό |
| Viva clientSecret | Κενό |
| `smtpSendLog` | Δεν εξάγεται |

**Cloud sync:** masked `********` ή κενό password **ποτέ** δεν αντικαθιστά πραγματικό App Password (τοπικά ή στο Blob notify config). Tenant GET επιστρέφει `passwordSet` (όχι `********`) ώστε η φόρμα να μην απενεργοποιεί το SMTP. `/api/send-email` χρησιμοποιεί notify config ή account-bundle SMTP.

---

## Ιστορικό filesystem ZIP (BACKUP + DEPLOY)

| Ονομασία αρχείου | Ημερομηνία | Τι περιλάμβανε (κώδικας / αλλαγές) |
|------------------|------------|-------------------------------------|
| `TeamSuite_2026-08-29_15-28-45.zip` | 2026-08-29 | Οδηγίες εισαγωγής αθλητών: τμήματα ακριβώς όπως στο πρόγραμμα |
| `TeamSuite_2026-08-29_15-24-46.zip` | 2026-08-29 | Προπονητές και Προσωπικό: πλήρης εξαγωγή Excel, εισαγωγή και οδηγίες όπως στους αθλητές |
| `TeamSuite_2026-08-29_15-11-50.zip` | 2026-08-29 | Αθλητές: οδηγίες εισαγωγής Excel δίπλα στο κουμπί Εισαγωγή |
| `TeamSuite_2026-08-29_14-50-27.zip` | 2026-08-29 | Αθλητές: πλήρης εξαγωγή Excel και εισαγωγή νέων/ενημέρωση υπαρχόντων από το ίδιο αρχείο |
| `TeamSuite_2026-08-29_14-25-17.zip` | 2026-08-29 | Login χωρίς αυτόματη αναγέννηση χρεώσεων · διαγραμμένες οφειλές δεν επανέρχονται από cloud |
| `TeamSuite_2026-08-29_14-15-28.zip` | 2026-08-29 | Γονείς: θηλυκό επώνυμο μόνο στη μητέρα · ο πατέρας μένει στον αρσενικό τύπο |
| `TeamSuite_2026-08-29_13-58-49.zip` | 2026-08-29 | Διαγραμμένες συναλλαγές δεν επανέρχονται στο login · θηλυκό επώνυμο μητέρας στη λίστα Γονείς |
| `TeamSuite_2026-08-29_04-41-18.zip` | 2026-08-29 | Διαγνωστικό: κουμπί Auto Repair (ορφανές συναλλαγές/συνδέσεις) με αποθήκευση στο cloud |
| `TeamSuite_2026-08-29_04-32-49.zip` | 2026-08-29 | Διαγνωστικό: διόρθωση ορφανών συναλλαγών και συνδέσεων προπονητή ανά σύλλογο (όχι preview club) |
| `TeamSuite_2026-08-29_04-10-07.zip` | 2026-08-29 | Διαγραφή φόρμας εγγραφής κρύβει την κάρτα · branding/pull χωρίς 503 στο deploy |
| `TeamSuite_2026-08-29_03-48-41.zip` | 2026-08-29 | Διαγραφή JPEG φόρμας εγγραφής στην καρτέλα αθλητή · ομαδική διαγραφή από Platform Admin |
| `TeamSuite_2026-08-29_03-28-57.zip` | 2026-08-29 | JPEG φόρμας εγγραφής σε popup (Αθλητές / προφίλ) · προστασία `/api/sync/account` από unhandled errors |
| `TeamSuite_2026-08-29_03-04-54.zip` | 2026-08-29 | Δημόσια εγγραφή σε αναμονή μέχρι έγκριση · στιγμιότυπο φόρμας στην καρτέλα · επιλογές εγγραφής σε popup |
| `TeamSuite_2026-08-29_02-39-24.zip` | 2026-08-29 | Δημόσια εγγραφή: πακέτο/ΙΣΤΟΣ/πληρωμή/δηλώσεις, dropdowns, ώρα υποβολής · μεγεθολόγιο απλοποιημένο · φωτο φόρμας μέσω Blob |
| `TeamSuite_2026-08-29_01-57-51.zip` | 2026-08-29 | Login χωρίς logo/360 · αφαίρεση Σύνδεση Ημερολογίου · υπόμνημα: αγώνας κόκκινο, ενοικίαση μπλε |
| `TeamSuite_2026-08-29_01-35-18.zip` | 2026-08-29 | Προσωπικό: αφαίρεση ρόλου Προπονητής από τη φόρμα νέου/επεξεργασίας μέλους |
| `TeamSuite_2026-08-29_01-24-48.zip` | 2026-08-29 | Μαύρο chrome: sidebar, tokens, login hero teal · λεπτό περίγραμμα στο header user |
| `TeamSuite_2026-08-29_01-06-13.zip` | 2026-08-29 | Λίστες αθλητών/προσωπικού/προπονητών/γονέων: ίδιο chrome, εξαγωγή xlsx, μαζική αλλαγή κατάστασης · μαύρο φόντο header |
| `TeamSuite_2026-08-28_17-43-30.zip` | 2026-08-28 | Ανακοινώσεις: κουμπί Άκυρο αριστερά από Αποστολή |
| `TeamSuite_2026-08-28_17-16-49.zip` | 2026-08-28 | Κεφαλίδα: μόνο εικόνα λογότυπου εφαρμογής, χωρίς κείμενο TeamSuite και χωρίς μικρό εικονίδιο αριστερά |
| `TeamSuite_2026-08-28_17-09-11.zip` | 2026-08-28 | Ανάκληση club logo στην κεφαλίδα · λογότυπο εφαρμογής (SS) ανά σύλλογο από Platform Admin · λογότυπο συλλόγου ξανά στο sidebar |
| `TeamSuite_2026-08-28_16-42-03.zip` | 2026-08-28 | Λογότυπο ανά σύλλογο στην κεφαλίδα (αντί SS + TeamSuite) από Platform Admin |
| `TeamSuite_2026-08-28_16-14-20.zip` | 2026-08-28 | Sync συναλλαγών/AppData μεταξύ browsers: mirror πρώτα στο login, ουρά push στο logout |
| `TeamSuite_2026-08-28_15-40-22.zip` | 2026-08-28 | Αποδοχή `/api/club-media` ως logoUrl στο cloud (διόρθωση σφάλματος HTTPS/data URL) |
| `TeamSuite_2026-08-28_15-34-36.zip` | 2026-08-28 | Logo/media σε private Blob + `/api/club-media` (χωρίς public access στο store) |
| `TeamSuite_2026-08-28_15-26-36.zip` | 2026-08-28 | Συγχρονισμός logo συλλόγου στο cloud (Blob HTTPS) ώστε να εμφανίζεται σε όλους τους browsers μετά το login |
| `TeamSuite_2026-08-28_14-42-31.zip` | 2026-08-28 | Durable Blob store · restore/login sync (τοπικά δεδομένα δεν σβήνονται) · club mirror push χωρίς Platform Admin account bundle |
| `SportSuite360_2026-08-28_12-44-33.zip` | 2026-08-28 | TeamSuite ξεχωριστό Vercel project (`teamsuite-seven.vercel.app`) · production URLs εκτός SportSuite360 · πριν το deploy |
| `SportSuite360_2026-08-28_11-24-15.zip` | 2026-08-28 | Κώδικας TeamSuite όπως στο GitHub (`main`) · ZIP στο `C:\TeamSuite_backup` · πριν το Vercel production deploy |
| `SportSuite360_2026-08-27_02-56-41.zip` | 2026-08-27 | Backup μόνο JSON (αφαίρεση ZIP λήψης/επαναφοράς) · διόρθωση verify επαναφοράς |
| `SportSuite360_2026-08-27_02-41-35.zip` | 2026-08-27 | Dashboard: τμήματα και μετρητές μόνο τρέχουσα ενεργή σεζόν (συνεπές με λίστα Τμήματα) |
| `SportSuite360_2026-08-27_02-26-51.zip` | 2026-08-27 | Όνομα συλλόγου στο αρχείο club backup (ZIP/JSON, προγραμματισμένα, Platform Admin) · φίλτρο άθλημα στον πίνακα Τμήματα |
| `SportSuite360_2026-08-27_02-09-57.zip` | 2026-08-27 | Ταξινόμηση στηλών στον πίνακα Τμήματα (κλικ επικεφαλίδας, asc/desc) |
| `SportSuite360_2026-08-27_02-00-45.zip` | 2026-08-27 | AppPopupLayer (portal + z-index) · popup menus σε πρώτο πλάνο (Τμήματα, Πρωτόκολλο, Ισοζύγιο, προφίλ αθλητή, modals) |
| `SportSuite360_2026-08-27_01-45-24.zip` | 2026-08-27 | Κατηγορία τμήματος: dropdown Αγωνιστικό / Ακαδημία στη φόρμα νέου τμήματος |
| `SportSuite360_2026-08-27_01-33-57.zip` | 2026-08-27 | Καρτέλα Αθλητές στο προφίλ τμήματος (προσθήκη με φίλτρα φύλου/έτους) · auto cloud pull κάθε ~30s + on focus |
| `SportSuite360_2026-08-27_01-09-15.zip` | 2026-08-27 | Τμήματα: λίστα (Ενεργά/Μη ενεργά, σεζόν, άθλημα) · προφίλ τμήματος με tabs και πίνακα αθλητών |
| `SportSuite360_2026-08-26_18-49-33.zip` | 2026-08-26 | Ρυθμίσεις → Σεζόν (μετά Άθλημα) · τμήματα ανά σεζόν · αυτόματη αποδέσμευση αθλητών μετά τη λήξη |
| `SportSuite360_2026-08-26_18-26-55.zip` | 2026-08-26 | Πρωτόκολλο Εγγράφων (menu πριν Ρυθμίσεις, μητρώο, καταχώρηση, αρ. πρωτοκόλλου editable από admin/Platform Admin) · toggle καρτελών Οικονομικών στο Platform Admin · βελτιώσεις Ισοζυγίου |
| `SportSuite360_2026-08-26_17-44-27.zip` | 2026-08-26 | Tab Ισοζύγιο μετά Ταμεία · πίνακες εσόδων/εξόδων · φίλτρα περιόδου/κατηγοριών/πληρωμών |
| `SportSuite360_2026-08-26_17-30-59.zip` | 2026-08-26 | Νέα σειρά tabs προφίλ αθλητή (Προσωπικά → AMKA → Γονείς → Υγεία → Ανακοινώσεις → Οφειλές → GDPR → Πρόοδος → Ιστορικό) |
| `SportSuite360_2026-08-26_17-14-49.zip` | 2026-08-26 | Dropdown Σωματείο μόνο από Ρυθμίσεις → Σωματείο (χωρίς όνομα club-tenant) |
| `SportSuite360_2026-08-26_14-10-53.zip` | 2026-08-26 | Fix login redirect loop (verify/rate-limit) · επιλογή Σωματείο στην ίδια γραμμή με ΑΜΚΑ / αρ. δελτίου |
| `SportSuite360_2026-08-25_21-03-09.zip` | 2026-08-25 | Fix χειροκίνητου ορίου αδειών — δεν ξανασυμπεραίνεται Start από το seat count |
| `SportSuite360_2026-08-25_16-42-29.zip` | 2026-08-25 | Νέος τιμοκατάλογος πακέτων συνδρομής (Start 294€ έως Pro Plus 100 2454€ καθαρά) |
| `SportSuite360_2026-08-25_15-57-25.zip` | 2026-08-25 | Επεξεργάσιμη ημερομηνία πρόσληψης στη φόρμα προπονητών |
| `SportSuite360_2026-08-25_14-22-30.zip` | 2026-08-25 | Στήλη Κωδικός Γ.Γ.Α στους προπονητές · αφαίρεση bullets πακέτου αδειών |
| `SportSuite360_2026-08-25_01-45-47.zip` | 2026-08-25 | Αυτόματο cloud sync ενεργό από προεπιλογή σε όλους τους συλλόγους |
| `SportSuite360_2026-08-25_01-32-06.zip` | 2026-08-25 | Προγραμματισμένο backup συλλόγου (ημερομηνία/ώρα) · DEMO 3 αθλήματα · sport-scoped σύνδεσμοι dashboard |
| `SportSuite360_2026-08-24_14-07-03.zip` | 2026-08-24 | SMTP App Password persistence (`passwordSet`) · contrast ετικέτας Προπονητής · promo pack παρουσίασης |
| `SportSuite360_2026-08-24_01-59-06.zip` | 2026-08-24 | Fix await SMTP notify on club waitlist (Vercel serverless) |
| `SportSuite360_2026-08-24_01-39-49.zip` | 2026-08-24 | Platform Admin full vs club restore · email ειδοποίηση νέας αίτησης συλλόγου |
| `SportSuite360_2026-08-24_01-10-13.zip` | 2026-08-24 | Login hero graphite+lime · μόνο θέματα Ocean Slate + Graphite Ember |
| `SportSuite360_2026-08-23_23-47-09.zip` | 2026-08-23 | Parent portal tabs (πρόγραμμα/.ics, πληρωμές, έγγραφα) · admin dashboard 5 KPIs |
| `SportSuite360_2026-08-23_23-26-47.zip` | 2026-08-23 | SMTP/Viva secret preservation (merge pull/push + notify) · club-scoped backups · BACKUP inventory |
| `SportSuite360_2026-08-23_23-07-43.zip` | 2026-08-23 | Project source + διορθώσεις backup ασφαλείας (club-only export, redaction secrets, ασφαλές restore) |
| `SportSuite360_2026-08-23_15-29-26.zip` | 2026-08-23 | Project source + αφαίρεση «Πλήρης εγγραφή» από δημόσια φόρμα |
| `SportSuite360_2026-08-23_15-08-23.zip` | 2026-08-23 | Project source + οδηγός SMTP εντός εφαρμογής |

> Νέες γραμμές προστίθενται στην **κορυφή** του πίνακα μετά από κάθε BACKUP + DEPLOY.
