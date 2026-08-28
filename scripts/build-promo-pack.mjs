/**
 * Build presentation HTML manual + promo MP4 from captured screens.
 * Usage: node scripts/build-promo-pack.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PROMO = path.join(ROOT, 'docs', 'promo');
const SCREENS = path.join(PROMO, 'screens');
const SLIDES = path.join(PROMO, '_slides');
const MANUAL = path.join(PROMO, 'SportSuite360-egcheiridio.html');
const VIDEO = path.join(PROMO, 'SportSuite360-promo.mp4');

function img(id) {
  const file = `${id}.png`;
  return fs.existsSync(path.join(SCREENS, file)) ? `screens/${file}` : '';
}

function figure(id, caption) {
  const src = img(id);
  if (!src) return '';
  return `<figure class="shot"><img src="${src}" alt="${escapeHtml(caption)}" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function optionList(items) {
  return `<ul class="opts">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
}

const SECTIONS = [
  {
    id: 'public',
    title: 'Δημόσιες οθόνες',
    intro: 'Χωρίς σύνδεση: είσοδος στο σύστημα, εγγραφή νέου συλλόγου και νομικά έγγραφα.',
    blocks: [
      {
        h: 'Σύνδεση',
        path: '/login',
        role: 'Δημόσιο',
        shot: '00-login',
        what: 'Είσοδος διαχειριστή, προπονητή, γονέα, αθλητή ή διαχειριστή πλατφόρμας. Από εδώ ξεκινά και η DEMO παρουσίαση.',
        opts: [
          '<strong>Email</strong> — λογαριασμός χρήστη.',
          '<strong>Κωδικός πρόσβασης</strong> — με Εμφάνιση / Απόκρυψη κωδικού.',
          '<strong>Να με θυμάσαι</strong> — διατήρηση συνεδρίας στη συσκευή.',
          '<strong>Ξέχασα τον κωδικό μου</strong> — αποστολή συνδέσμου επαναφοράς.',
          '<strong>Σύνδεση</strong> — είσοδος στο portal του ρόλου σας.',
          '<strong>Είσοδος DEMO παρουσίασης</strong> — φορτώνει σύλλογο DEMO με πλήρη δείγματα (τοπικά στο browser).',
          '<strong>Εγγραφή συλλόγου</strong> — μετάβαση στη λίστα αναμονής νέας ακαδημίας.',
        ],
      },
      {
        h: 'Εγγραφή συλλόγου (λίστα αναμονής)',
        path: '/register',
        role: 'Δημόσιο',
        shot: '00-register',
        what: 'Αίτημα ένταξης για δωρεάν δοκιμή. Δεν δημιουργεί άμεσα λογαριασμό — ειδοποιείται ο διαχειριστής πλατφόρμας.',
        opts: [
          '<strong>Όνομα ακαδημίας</strong>, <strong>Ονοματεπώνυμο υπευθύνου</strong>, <strong>Email</strong>, <strong>Τηλέφωνο</strong>.',
          '<strong>Άθλημα</strong> — Ποδόσφαιρο, Μπάσκετ, Βόλεϊ, Χάντμπολ, Κολύμβηση, Τένις, Άλλο.',
          '<strong>Επίπεδο τμημάτων</strong> — Ακαδημίες / Προαγωνιστικό / Αγωνιστικό.',
          'Αποδοχή <strong>Όρων Χρήσης</strong> και <strong>Πολιτικής Απορρήτου</strong>.',
          'Μετά την υποβολή: «Είσαι στη λίστα!» και σύνδεσμος επιστροφής στη σύνδεση.',
        ],
      },
    ],
  },
  {
    id: 'admin-core',
    title: 'Διαχείριση ακαδημίας',
    intro: 'Μετά τη σύνδεση ως διαχειριστής συλλόγου βλέπετε το μενού ΑΚΑΔΗΜΙΑ. Κάθε καρτέλα είναι ένα module.',
    blocks: [
      {
        h: 'Επισκόπηση',
        path: '/',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '01-dashboard',
        what: 'Μία οθόνη για την υγεία του συλλόγου: αθλητές, παρουσίες, οφειλές, ιατρικές και αιτήσεις.',
        opts: [
          'KPI: <strong>Ενεργοί αθλητές</strong>, <strong>Παρουσία μήνα</strong>, <strong>Εκκρεμείς οφειλές</strong>, <strong>Ληγμένες ιατρικές</strong>, <strong>Αιτήσεις εγγραφής</strong>.',
          'Λωρίδα ταμείου: <strong>Ταμείο</strong>, <strong>Οφειλές</strong>, <strong>Εισπράξεις μήνα</strong>.',
          'Σύνοψη ανά άθλημα με συνδέσμους προς τμήματα και αθλητές.',
          'Επάνω δεξιά: όνομα χρήστη, ρόλος, <strong>Αποσύνδεση</strong>.',
        ],
      },
      {
        h: 'Ημερολόγιο',
        path: '/calendar',
        role: 'Διαχειριστής · Γραμματεία · Προπονητής',
        shot: '02-calendar',
        what: 'Προπονήσεις και αγώνες σε ημερολόγιο, με φίλτρα ομάδας και γηπέδου.',
        opts: [
          '<strong>Προηγούμενο / Επόμενο / Σήμερα</strong> — πλοήγηση περιόδου.',
          'Προβολές: <strong>Μήνας</strong>, <strong>Εβδομάδα</strong>, <strong>Ημέρα</strong>, <strong>Γήπεδα</strong>.',
          '<strong>Νέο Γεγονός</strong> — καταχώρηση προπόνησης.',
          'Φίλτρα: κατηγορία (Προπόνηση / Αγώνας), ομάδα, γήπεδο.',
          '<strong>Σύνδεση Ημερολογίου</strong> — συγχρονισμός με το πρόγραμμα.',
        ],
      },
      {
        h: 'Αθλητές',
        path: '/athletes',
        role: 'Διαχειριστής · Γραμματεία · Προπονητής · Ιατρός',
        shot: '03-athletes',
        what: 'Μητρώο αθλητών, σύνδεση με γονείς και τμήματα. Ο ιατρός βλέπει υγεία / ΑΜΚΑ.',
        opts: [
          '<strong>+ Νέος αθλητής</strong> — νέα καρτέλα μητρώου.',
          '<strong>Αναζήτηση αθλητή ή γονέα</strong>.',
          'Πίνακας: Αθλητής, Άθλημα, Τμήμα, Γονέας, Κατάσταση.',
          'Εκκρεμείς αιτήσεις δημόσιας εγγραφής: <strong>Επεξεργασία</strong>, <strong>Έγκριση</strong>, <strong>Απόρριψη</strong>.',
          'Κλικ σε γραμμή → προφίλ αθλητή.',
        ],
      },
      {
        h: 'Προφίλ αθλητή',
        path: '/athletes/:id',
        role: 'Όποιος έχει Αθλητές',
        shot: '03b-athlete-profile',
        what: 'Πλήρης φάκελος ενός αθλητή: στοιχεία, γονείς, οικονομικά, υγεία, GDPR, πρόοδος.',
        opts: [
          '<strong>Προσωπικά Στοιχεία</strong> — ταυτότητα, διεύθυνση, άθλημα, μεγέθη, εκπτώσεις.',
          '<strong>Γονείς</strong> — σύνδεση κηδεμόνων.',
          '<strong>AMKA & Ταυτοποίηση</strong>.',
          '<strong>Συνδρομές / Οφειλές</strong>.',
          '<strong>Κάρτα Υγείας</strong> — προεπισκόπηση / εκτύπωση.',
          '<strong>Συγκαταθέσεις (GDPR)</strong>.',
          '<strong>Πρόοδος</strong> και <strong>Ιστορικό</strong> παρουσιών.',
        ],
      },
      {
        h: 'Προσωπικό',
        path: '/staff',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '04-staff',
        what: 'Διοικητικό και άλλο προσωπικό του συλλόγου.',
        opts: [
          '<strong>Νέο μέλος</strong> / επεξεργασία: ονοματεπώνυμο, email, τηλέφωνο, ρόλος, τμήμα, κατάσταση.',
          'Αναζήτηση μέλους · διαγραφή.',
        ],
      },
      {
        h: 'Προπονητές',
        path: '/coaches',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '05-coaches',
        what: 'Κατάλογος προπονητών, άδειες και σύνδεση με τμήματα.',
        opts: [
          '<strong>Νέος προπονητής</strong> — φωτογραφία, άδεια, πρώτες βοήθειες, πρόσληψη.',
          'Πίνακας: άθλημα, email, τηλέφωνο, κατάσταση, τμήματα.',
        ],
      },
      {
        h: 'Τμήματα',
        path: '/classes',
        role: 'Διαχειριστής · Γραμματεία · Προπονητής',
        shot: '06-classes',
        what: 'Ομάδες / ηλικιακές κατηγορίες ανά άθλημα.',
        opts: [
          '<strong>Νέο τμήμα</strong> — όνομα, άθλημα, κατηγορία (π.χ. U12), ημερομηνίες ή «Πάντα ενεργό».',
          'Πίνακας αθλητών ανά τμήμα · επεξεργασία / διαγραφή.',
        ],
      },
      {
        h: 'Γονείς',
        path: '/parents',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '07-parents',
        what: 'Σύνδεση γονέων με αθλητές και πρόσκληση λογαριασμού για το parent portal.',
        opts: [
          '<strong>Πρόσκληση γονέα</strong> — ονοματεπώνυμο, email, κωδικός, προαιρετικός αθλητής.',
          'Σύνδεση / αποσύνδεση αθλητή από γονέα.',
          'Αναζήτηση γονέα ή email.',
        ],
      },
    ],
  },
  {
    id: 'ops',
    title: 'Προπονήσεις, αγώνες και παρουσίες',
    intro: 'Καθημερινή λειτουργία γηπέδου: καταχώρηση προπονήσεων, αγώνων, εβδομαδιαίου προγράμματος και παρουσιολογίου.',
    blocks: [
      {
        h: 'Προπονήσεις',
        path: '/trainings',
        role: 'Διαχειριστής · Προπονητής',
        shot: '08-trainings',
        what: 'Μεμονωμένες και επαναλαμβανόμενες προπονήσεις.',
        opts: [
          '<strong>Νέα προπόνηση</strong> — ημερομηνία, ώρα έναρξης/λήξης, τοποθεσία, τμήμα, σημειώσεις.',
          '<strong>Επαναλαμβανόμενες προπονήσεις</strong> — ημέρα εβδομάδας και περίοδος.',
          '<strong>Μαζική διαγραφή</strong>.',
        ],
      },
      {
        h: 'Αγώνες',
        path: '/matches',
        role: 'Διαχειριστής · Προπονητής',
        shot: '09-matches',
        what: 'Προγραμματισμός αγώνων, έδρα και αποτέλεσμα.',
        opts: [
          'Έδρα: <strong>Εντός / Εκτός / Ουδέτερο</strong>.',
          'Κατάσταση: <strong>Προγραμματισμένος / Ολοκληρώθηκε / Ακυρώθηκε</strong>.',
          'Καταχώρηση σκορ · διαγραφή αγώνα.',
        ],
      },
      {
        h: 'Πρόγραμμα',
        path: '/schedule',
        role: 'Διαχειριστής · Προπονητής · Αθλητής',
        shot: '10-schedule',
        what: 'Εβδομαδιαίο πλέγμα ωρών ανά τμήμα.',
        opts: [
          'Πλοήγηση εβδομάδας.',
          '<strong>Νέα ώρα προγράμματος</strong> — τμήμα, ημέρα, ώρες, τοποθεσία.',
        ],
      },
      {
        h: 'Παρουσίες',
        path: '/attendance',
        role: 'Διαχειριστής · Προπονητής · Αθλητής',
        shot: '11-attendance',
        what: 'Καταγραφή παρών/απών ανά τμήμα και ημερομηνία.',
        opts: [
          'Φίλτρα <strong>Ομάδα / Τμήμα</strong> και <strong>Ημερομηνία</strong>.',
          'Toggle <strong>Παρουσία / Απουσία</strong> ανά αθλητή.',
          '<strong>Email σε απουσία</strong> · <strong>Αποθήκευση</strong> · <strong>Εξαγωγή CSV</strong>.',
        ],
      },
      {
        h: 'Ανακοινώσεις',
        path: '/announcements',
        role: 'Όλοι οι ρόλοι (ανά κοινό)',
        shot: '14-announcements',
        what: 'Ενημερώσεις προς γονείς, προπονητές, αθλητές ή προσωπικό — με προαιρετικό email.',
        opts: [
          '<strong>Νέα Ανακοίνωση</strong> — τίτλος, περιεχόμενο (μορφοποίηση), εικόνα.',
          'Ακροατήριο: Γονείς / Προπονητές / Αθλητές / Προσωπικό, φίλτρο αθλήματος και τμημάτων.',
          'Ημερομηνίες εμφάνισης, προτεραιότητα.',
          '<strong>Αποστολή και με email</strong>.',
        ],
      },
    ],
  },
  {
    id: 'club-setup',
    title: 'Σωματείο, άθλημα, εκτυπώσεις, αποθήκη',
    intro: 'Υποδομή συλλόγου και βοηθητικά εργαλεία.',
    blocks: [
      {
        h: 'Σωματείο',
        path: '/associations',
        role: 'Ρυθμίσεις',
        shot: '12-associations',
        what: 'Ενώσεις / σωματεία που συνδέονται με οικονομικά και μητρώο.',
        opts: ['Προσθήκη, επεξεργασία, διαγραφή ονόματος σωματείου.'],
      },
      {
        h: 'Άθλημα',
        path: '/sports',
        role: 'Ρυθμίσεις',
        shot: '13-sports',
        what: 'Ενεργά αθλήματα του συλλόγου.',
        opts: ['Επιλογή από κατάλογο · ενεργοποίηση / απενεργοποίηση.'],
      },
      {
        h: 'Εκτυπώσεις',
        path: '/prints',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '15-prints',
        what: 'Έτοιμες αναφορές για εκτύπωση ή προεπισκόπηση.',
        opts: [
          'Λίστα αθλητών · Υπόλοιπα · Παρουσιολόγιο · Παρουσιολόγιο προπόνησης.',
          'Αιτήσεις εγγραφής · Λήξεις ιατρικών · Εισπράξεις περιόδου · Οφειλέτες.',
          'Νομικά έντυπα · Αναφορά προόδου · Κατάλογος τμημάτων · Ιατρικά στοιχεία.',
          'Οικονομική αναφορά · Χρεώσεις/πληρωμές · Πρόγραμμα προπονήσεων.',
          'Κάθε αναφορά έχει φίλτρα και <strong>Εκτύπωση</strong>.',
        ],
      },
      {
        h: 'Φωτογραφίες',
        path: '/photos',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '16-photos',
        what: 'Άλμπουμ συλλόγου με συναίνεση χρήσης φωτογραφίας.',
        opts: [
          'Αναζήτηση · ταξινόμηση νεότερα/παλαιότερα/όνομα.',
          'Ανέβασμα με λεζάντα, συλλογή και σύνδεση αθλητών.',
        ],
      },
      {
        h: 'Αποθήκη',
        path: '/warehouse',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '17-warehouse',
        what: 'Στολές, εξοπλισμός και κινήσεις αποθέματος.',
        opts: [
          '<strong>Νέο προϊόν</strong> — όνομα, κατηγορία, SKU, barcode, μάρκα, τιμή, κόστος, απόθεμα, μέγεθος, χρώμα.',
          'Κίνηση αποθέματος: τύπος, ποσότητα, σημείωση.',
        ],
      },
      {
        h: 'Συμβεβλημένες επιχειρήσεις',
        path: '/partner-businesses',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '20-partners',
        what: 'Συνεργάτες και προσφορές προς μέλη.',
        opts: [
          'Καρτέλες: όλες / προσφορές / πρόσφατες.',
          '<strong>Νέα επιχείρηση</strong> · <strong>Νέα προσφορά</strong> (έκπτωση, όροι).',
        ],
      },
    ],
  },
  {
    id: 'money',
    title: 'Συνδρομές, συναλλαγές και οικονομικά',
    intro: 'Από την οφειλή του αθλητή μέχρι ταμεία, προϋπολογισμό και αναφορές σεζόν.',
    blocks: [
      {
        h: 'Συνδρομές / Πληρωμές',
        path: '/fees',
        role: 'Διαχειριστής · Γραμματεία · Γονέας · Αθλητής',
        shot: '18-fees',
        what: 'Υπόλοιπα συνδρομών, μαζικές χρεώσεις, υπενθυμίσεις και πληρωμή Viva.',
        opts: [
          '<strong>Δημιουργία χρεώσεων</strong> · <strong>Υπενθύμιση οφειλών</strong> · <strong>Νέα χρέωση</strong>.',
          'KPI: οφειλές, πιστωτικά, ενεργοί αθλητές.',
          'Ανά αθλητή: μηνιαία συνδρομή, υπόλοιπο, τελευταία πληρωμή, <strong>Viva</strong>, <strong>Προφίλ</strong>.',
          'Πρότυπο χρέωσης: σεζόν, άθλημα, σε ποιους ισχύει, ποσό/μήνες.',
        ],
      },
      {
        h: 'Συναλλαγές',
        path: '/transactions',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '19-transactions',
        what: 'Αναλυτικό καθολικό χρεώσεων και εισπράξεων ανά αθλητή και σεζόν.',
        opts: [
          'Φίλτρα σεζόν / άθλημα · αναζήτηση αθλητή.',
          '<strong>Νέα κίνηση</strong> — χρέωση ή πληρωμή, μήνας, ποσό, τρόπος, σχόλια.',
          'Μηνιαίος πίνακας χρεώσεων / πληρωμών / παρουσιών.',
        ],
      },
      {
        h: 'Οικονομικά — Ανάλυση',
        path: '/finance',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '21a-finance-analysis',
        fallback: '21-finance',
        what: 'Συνολική εικόνα εσόδων, εξόδων και καθαρού αποτελέσματος.',
        opts: [
          'KPI: <strong>Συνολικά έσοδα</strong>, <strong>Συνολικά έξοδα</strong>, <strong>Καθαρό αποτέλεσμα</strong>.',
          'Γραφήματα μηνιαίας σύγκρισης και πίτες ανά κατηγορία.',
        ],
      },
      {
        h: 'Οικονομικά — Έσοδα',
        path: '/finance',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '21b-finance-revenues',
        what: 'Χειροκίνητη καταχώρηση εσόδων (οι πληρωμές αθλητών έρχονται αυτόματα από συνδρομές/Viva).',
        opts: [
          'Υποκατηγορία από κατάλογο πλατφόρμας.',
          'Σωματείο, άθλημα, μητρώο, ποσό, ημερομηνία, ταμείο, συνημμένα.',
        ],
      },
      {
        h: 'Οικονομικά — Έξοδα',
        path: '/finance',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '21c-finance-expenses',
        what: 'Έξοδα λειτουργίας και ειδική φόρμα εξόδων αγώνα.',
        opts: [
          'Υποκατηγορία · ποσό · σωματείο · συνημμένα.',
          'Έξοδα αγώνα: αντίπαλοι, μεταφορά (Λεωφορείο / Αεροπλάνο / Πλοίο / Άλλο).',
        ],
      },
      {
        h: 'Οικονομικά — Ταμεία',
        path: '/finance',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '21d-finance-accounts',
        what: 'Λογαριασμοί μετρητών / τράπεζας και κλείσιμο μήνα.',
        opts: [
          '<strong>Νέο ταμείο</strong> — όνομα, τύπος (Μετρητά / Τράπεζα / Άλλο), αρχικό υπόλοιπο.',
          '<strong>Κλείσιμο μήνα</strong> — κλείδωμα περιόδου.',
        ],
      },
      {
        h: 'Οικονομικά — Προϋπολογισμός',
        path: '/finance',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '21e-finance-budget',
        what: 'Προϋπολογισμένα vs πραγματικά έσοδα/έξοδα σεζόν.',
        opts: [
          'Τύπος Έσοδο/Έξοδο, υποκατηγορία, ποσό σεζόν.',
          'Σύνολα και <strong>Αποτέλεσμα σεζόν</strong>.',
        ],
      },
      {
        h: 'Οικονομικά — Αναφορές',
        path: '/finance',
        role: 'Διαχειριστής · Γραμματεία',
        shot: '21f-finance-reports',
        what: 'Εξαγωγή οικονομικών για παρουσίαση ή λογιστήριο.',
        opts: [
          '<strong>Προεπισκόπηση</strong> · <strong>Excel</strong> · <strong>PDF</strong> · <strong>Εκτύπωση</strong>.',
          'Περίοδος: σεζόν / μήνας / ημέρα · φίλτρα σωματείου και αθλήματος.',
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Ρυθμίσεις συλλόγου',
    intro: 'Όλες οι επιλογές παραμετροποίησης. Η καρτέλα Χρήστες εμφανίζεται μόνο στον διαχειριστή.',
    blocks: [
      {
        h: 'Σύλλογος',
        path: '/settings',
        role: 'Διαχειριστής',
        shot: '22a-settings-club',
        fallback: '22-settings',
        what: 'Ταυτότητα συλλόγου, άδειες αθλητών, λογότυπο και σύντομες ρυθμίσεις SMTP/Viva.',
        opts: [
          '<strong>Συνδρομή & άδειες αθλητών</strong> — πακέτο, τιμή +ΦΠΑ, λήξη, χρήση αδειών.',
          '<strong>Λογότυπο</strong> — ανέβασμα / αλλαγή / αφαίρεση (PNG, JPG, SVG έως 2MB).',
          'Στοιχεία: όνομα, Α.Φ.Μ., Δ.Ο.Υ., έδρα, έτος ίδρυσης, ιστότοπος, τηλέφωνο, email.',
          '<strong>Αποθήκευση</strong>.',
        ],
      },
      {
        h: 'Χρήστες',
        path: '/settings',
        role: 'Διαχειριστής συλλόγου',
        shot: '22b-settings-users',
        what: 'Λογαριασμοί εισόδου και ποια modules βλέπει ο καθένας.',
        opts: [
          '<strong>Νέος χρήστης</strong> — επώνυμο, όνομα, email, κωδικός, ρόλος.',
          'Ρόλοι: Διαχειριστής συλλόγου, Ιατρός, Προπονητής, Γραμματεία, Προσωπικό, Αθλητής, Γονέας.',
          'Checkboxes δικαιωμάτων καρτελών · ενεργοποίηση / απενεργοποίηση / διαγραφή.',
        ],
      },
      {
        h: 'Email (SMTP)',
        path: '/settings',
        role: 'Διαχειριστής',
        shot: '22c-settings-email',
        what: 'Αποστολή ανακοινώσεων, υπενθυμίσεων οφειλών και δοκιμαστικών μηνυμάτων από τον σύλλογο.',
        opts: [
          'Πάροχος: <strong>Gmail</strong> ή προσαρμοσμένο SMTP.',
          'Host, Port, username, App Password, Από (From).',
          '<strong>Δοκιμή αποστολής</strong> · <strong>Ιστορικό αποστολών</strong> · οδηγός SMTP.',
        ],
      },
      {
        h: 'Viva Wallet',
        path: '/settings',
        role: 'Διαχειριστής',
        shot: '22d-settings-viva',
        what: 'Online πληρωμή συνδρομών από γονείς / αθλητές.',
        opts: [
          '<strong>Ενεργές online πληρωμές</strong>.',
          'Client ID, Client Secret, Merchant ID, Source Code (4 ψηφία).',
          'Περιβάλλον: Demo / Live. Εμφάνιση Webhook URL και Success URL.',
        ],
      },
      {
        h: 'Δημόσια εγγραφή',
        path: '/settings',
        role: 'Διαχειριστής',
        shot: '22e-settings-register',
        what: 'Φόρμα /join για γονείς: πλήρης εγγραφή, δοκιμαστική ή λίστα αναμονής.',
        opts: [
          '<strong>Ενεργή δημόσια εγγραφή</strong> (απαιτεί DPA στο GDPR).',
          'Άμεση εμφάνιση στη λίστα αθλητών · δοκιμαστική προπόνηση · λίστα αναμονής.',
          'Slug συνδέσμου, <strong>Αντιγραφή</strong>, προεπισκόπηση, <strong>QR PNG</strong>, εκτύπωση.',
          'Email ειδοποίησης νέας αίτησης · φωτογραφία φόρμας.',
        ],
      },
      {
        h: 'GDPR / ΑΜΚΑ',
        path: '/settings',
        role: 'Διαχειριστής',
        shot: '22f-settings-gdpr',
        what: 'Συμμόρφωση: DPA, διατήρηση δεδομένων, πρόσβαση ΑΜΚΑ και αιτήματα υποκειμένου.',
        opts: [
          'Αποδοχή DPA · μήνες διατήρησης · checklist.',
          'Αρχείο πρόσβασης ΑΜΚΑ · αίτημα DSAR ανά αθλητή.',
        ],
      },
      {
        h: 'Backup',
        path: '/settings',
        role: 'Διαχειριστής',
        shot: '22g-settings-backup',
        what: 'Αντίγραφα μόνο του ενεργού συλλόγου και συγχρονισμός cloud.',
        opts: [
          '<strong>Λήψη ZIP</strong> · <strong>Λήψη JSON</strong> · επαναφορά από αρχείο.',
          'Cloud: αυτόματο sync, Push / Pull mirror συλλόγου.',
          'Στο DEMO: <strong>Επαναφόρτωση DEMO δεδομένων</strong>.',
        ],
      },
      {
        h: 'Άλλες καρτέλες ρυθμίσεων',
        path: '/settings',
        role: 'Ανά δικαίωμα',
        shot: '22-settings',
        what: 'Δευτερεύουσες επιλογές στο ίδιο μενού.',
        opts: [
          '<strong>Γήπεδο</strong> — εγκαταστάσεις, διάταξη ωρών, ενεργό/ανενεργό.',
          '<strong>Κωδικός</strong> — αλλαγή κωδικού εισόδου.',
          '<strong>Μεγεθολόγιο</strong> — μεγέθη παιδιών / ενηλίκων για αποθήκη και προφίλ.',
          '<strong>Όροι</strong> — κείμενο όρων που εμφανίζεται στη δημόσια εγγραφή.',
        ],
      },
    ],
  },
  {
    id: 'portals',
    title: 'Περιοχή γονέα και προπονητή',
    intro: 'Ο ίδιος σύνδεσμος (/) ανοίγει διαφορετικό portal ανά ρόλο.',
    blocks: [
      {
        h: 'Γονέας — Αρχική',
        path: '/?tab=overview',
        role: 'Γονέας',
        shot: '30-parent-overview',
        what: 'Σύνοψη των συνδεδεμένων παιδιών: οφειλές, επόμενη προπόνηση, ανακοινώσεις.',
        opts: [
          'Καρτέλες: <strong>Αρχική</strong>, <strong>Πρόγραμμα</strong>, <strong>Πληρωμές</strong>, <strong>Έγγραφα</strong>.',
          'KPI: συνδεδεμένοι αθλητές, συνολικές οφειλές, επόμενη προπόνηση, ανακοινώσεις.',
        ],
      },
      {
        h: 'Γονέας — Πρόγραμμα',
        path: '/?tab=schedule',
        role: 'Γονέας',
        shot: '31-parent-schedule',
        what: 'Επόμενες προπονήσεις και πρόσφατες παρουσίες.',
        opts: [
          'Ημερομηνία, ώρα, τμήμα, τοποθεσία.',
          '<strong>Λήψη ημερολογίου (.ics)</strong> για Google / Apple Calendar.',
          'Πίνακας παρουσιών: παρών / απών.',
        ],
      },
      {
        h: 'Γονέας — Πληρωμές',
        path: '/?tab=payments',
        role: 'Γονέας',
        shot: '32-parent-payments',
        what: 'Υπόλοιπα, ανοιχτές χρεώσεις και ιστορικό. Online πληρωμή αν είναι ενεργό το Viva.',
        opts: [
          'Υπόλοιπα ανά αθλητή · κουμπί <strong>Πληρωμή Viva</strong>.',
          'Ανοιχτές χρεώσεις ανά περίοδο · ιστορικό πληρωμών.',
        ],
      },
      {
        h: 'Γονέας — Έγγραφα',
        path: '/?tab=documents',
        role: 'Γονέας',
        shot: '33-parent-documents',
        what: 'Κατάσταση ιατρικής κάρτας, GDPR και συναίνεσης ιατρικών στοιχείων.',
        opts: [
          'Ιατρική / κάρτα υγείας (έγκυρη, λήγει, ληγμένη).',
          'GDPR: Πλήρης / Εκκρεμεί / Κλειδωμένη.',
          'Συναίνεση ιατρικών και ένδειξη ΑΜΚΑ.',
        ],
      },
      {
        h: 'Περιοχή προπονητή',
        path: '/',
        role: 'Προπονητής',
        shot: '40-coach-portal',
        what: 'Γρήγορη καταγραφή παρουσιών στα δικά του τμήματα, χωρίς οικονομικά.',
        opts: [
          'KPI: τα τμήματά μου, επόμενη προπόνηση, ανακοινώσεις, αθλητές.',
          'Φίλτρο τμήματος και ημερομηνίας · toggle Παρουσία / Απουσία · <strong>Αποθήκευση Παρουσιών</strong>.',
          'Πλαϊνή στήλη: προσεχείς προπονήσεις και ανακοινώσεις.',
          'Μενού: Ημερολόγιο, Αθλητές, Τμήματα, Προπονήσεις, Αγώνες, Πρόγραμμα, Παρουσίες, Ανακοινώσεις, Ρυθμίσεις.',
        ],
      },
    ],
  },
];

function buildManualHtml() {
  const toc = SECTIONS.map(
    (s) => `<li><a href="#${s.id}">${escapeHtml(s.title)}</a></li>`,
  ).join('');

  const body = SECTIONS.map((section) => {
    const blocks = section.blocks
      .map((b) => {
        const shotId = img(b.shot) ? b.shot : b.fallback;
        return `
        <article class="block">
          <header>
            <h3>${escapeHtml(b.h)}</h3>
            <p class="meta"><span class="path">${escapeHtml(b.path)}</span><span class="role">${escapeHtml(b.role)}</span></p>
          </header>
          <p class="what">${escapeHtml(b.what)}</p>
          ${shotId ? figure(shotId, b.h) : ''}
          <h4>Επιλογές & ενέργειες</h4>
          ${optionList(b.opts)}
        </article>`;
      })
      .join('');
    return `
      <section id="${section.id}">
        <h2>${escapeHtml(section.title)}</h2>
        <p class="lead">${escapeHtml(section.intro)}</p>
        ${blocks}
      </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SportSuite 360 — Εγχειρίδιο παρουσίασης</title>
  <style>
    :root {
      --ink: #12202c;
      --muted: #5b6b78;
      --line: #d5dde4;
      --paper: #f4f7f8;
      --card: #fff;
      --accent: #1f8a8a;
      --accent-2: #c6e04a;
      --navy: #0b1220;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Noto Sans", sans-serif;
      color: var(--ink);
      background: var(--paper);
      line-height: 1.55;
    }
    .hero {
      background: radial-gradient(1200px 500px at 10% -10%, #1a3a2a 0%, transparent 55%),
                  linear-gradient(160deg, #0b1220 0%, #163044 55%, #0f1c28 100%);
      color: #f6f8f4;
      padding: 72px 40px 56px;
    }
    .hero .brand { font-size: 42px; font-weight: 800; letter-spacing: .02em; margin: 0; }
    .hero .brand span { color: var(--accent-2); }
    .hero .tag { margin: 12px 0 0; max-width: 42rem; color: #c9d4cc; font-size: 18px; }
    .hero .meta-row { margin-top: 22px; display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: #9eaea8; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 0 28px 80px; }
    nav.toc {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 22px 28px;
      margin: -28px auto 40px;
      max-width: 1100px;
    }
    nav.toc h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    nav.toc ol { margin: 0; padding-left: 22px; columns: 2; }
    nav.toc a { color: var(--ink); text-decoration: none; }
    nav.toc a:hover { color: var(--accent); }
    section { margin: 48px 0 16px; }
    section > h2 {
      font-size: 28px;
      margin: 0 0 8px;
      padding-bottom: 8px;
      border-bottom: 3px solid var(--accent-2);
      display: inline-block;
    }
    .lead { color: var(--muted); max-width: 46rem; }
    .block {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 22px 24px 8px;
      margin: 22px 0;
    }
    .block h3 { margin: 0; font-size: 22px; }
    .meta { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0 10px; }
    .path, .role {
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 6px;
      background: #eef3f4;
      color: var(--muted);
    }
    .path { font-family: ui-monospace, Consolas, monospace; }
    .what { margin: 0 0 14px; }
    .block h4 { font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 8px 0; }
    .opts { margin: 0 0 18px; padding-left: 18px; }
    .opts li { margin: 6px 0; }
    figure.shot { margin: 0 0 16px; }
    figure.shot img {
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--line);
      display: block;
      background: #111;
    }
    figcaption { font-size: 12px; color: var(--muted); margin-top: 6px; }
    .note {
      background: #f3f7e8;
      border-left: 4px solid var(--accent-2);
      padding: 14px 18px;
      border-radius: 0 10px 10px 0;
      margin: 24px 0;
    }
    footer {
      color: var(--muted);
      font-size: 13px;
      padding: 28px 0 8px;
      border-top: 1px solid var(--line);
    }
    @media (max-width: 800px) {
      nav.toc ol { columns: 1; }
      .hero { padding: 48px 22px 40px; }
      .hero .brand { font-size: 30px; }
    }
    @media print {
      .hero { padding: 28px 0; background: #0b1220 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      nav.toc { margin-top: 16px; }
      .block { break-inside: avoid; }
      figure.shot img { max-height: 420px; object-fit: contain; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <p class="brand">SPORTSUITE <span>360</span></p>
    <p class="tag">Αναλυτικό εγχειρίδιο λειτουργιών — με πραγματικές οθόνες από το DEMO παρουσίασης.</p>
    <div class="meta-row">
      <span>Για παρουσίαση σε συλλόγους</span>
      <span>Demo: demo@sportsuite360.app / demo1234</span>
      <span>https://sportsuite360.vercel.app</span>
    </div>
  </header>
  <div class="wrap">
    <nav class="toc">
      <h2>Περιεχόμενα</h2>
      <ol>${toc}</ol>
    </nav>
    <div class="note">
      Οι φωτογραφίες είναι πραγματικά στιγμιότυπα της εφαρμογής (σύλλογος DEMO).
      Τα δικαιώματα καρτελών μπορεί να διαφέρουν ανά ρόλο· ο διαχειριστής τα ρυθμίζει από <strong>Ρυθμίσεις → Χρήστες</strong>.
    </div>
    ${body}
    <section id="cookies">
      <h2>Cookies</h2>
      <p class="lead">Στην πρώτη επίσκεψη εμφανίζεται banner συγκατάθεσης: Αποδοχή όλων, Απόρριψη προαιρετικών, Προσαρμογή (Essential / Analytics / Marketing).</p>
    </section>
    <footer>
      SportSuite 360 · εγχειρίδιο παρουσίασης · οι οθόνες ενημερώνονται με <code>npm run promo:capture</code> και <code>npm run promo:build</code>.
    </footer>
  </div>
</body>
</html>`;
}

const VIDEO_BEATS = [
  { type: 'card', id: 't0', title: 'SPORTSUITE 360', sub: 'Η πλατφόρμα διαχείρισης αθλητικών συλλόγων' },
  { type: 'screen', id: '00-login', title: 'Σύνδεση' },
  { type: 'screen', id: '01-dashboard', title: 'Επισκόπηση συλλόγου' },
  { type: 'screen', id: '02-calendar', title: 'Ημερολόγιο' },
  { type: 'screen', id: '03-athletes', title: 'Μητρώο αθλητών' },
  { type: 'screen', id: '03b-athlete-profile', title: 'Προφίλ αθλητή' },
  { type: 'screen', id: '10-schedule', title: 'Εβδομαδιαίο πρόγραμμα' },
  { type: 'screen', id: '11-attendance', title: 'Παρουσίες' },
  { type: 'screen', id: '18-fees', title: 'Συνδρομές & πληρωμές' },
  { type: 'screen', id: '21a-finance-analysis', title: 'Οικονομικά', fallback: '21-finance' },
  { type: 'screen', id: '30-parent-overview', title: 'Περιοχή γονέα' },
  { type: 'screen', id: '40-coach-portal', title: 'Περιοχή προπονητή' },
  { type: 'screen', id: '22-settings', title: 'Ρυθμίσεις' },
  { type: 'card', id: 't1', title: 'SPORTSUITE 360', sub: 'sportsuite360.vercel.app' },
];

function cardHtml(title, sub) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#0b1220;color:#f6f8f4;font-family:"Segoe UI",sans-serif;}
    .c{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
       background:radial-gradient(900px 400px at 15% 0%,#1a3a2a,transparent 60%);}
    h1{font-size:84px;margin:0;letter-spacing:.04em;}
    h1 span{color:#c6e04a;}
    p{margin:18px 0 0;font-size:28px;color:#b7c4bc;}
  </style></head><body><div class="c"><h1>${title.replace('360', '<span>360</span>')}</h1><p>${escapeHtml(sub)}</p></div></body></html>`;
}

async function renderVideoSlides() {
  fs.mkdirSync(SLIDES, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const files = [];

  for (const beat of VIDEO_BEATS) {
    if (beat.type === 'card') {
      const htmlPath = path.join(SLIDES, `${beat.id}.html`);
      fs.writeFileSync(htmlPath, cardHtml(beat.title, beat.sub), 'utf8');
      await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'load' });
      const out = path.join(SLIDES, `${beat.id}.png`);
      await page.screenshot({ path: out });
      files.push({ file: out, title: beat.title, dur: 3.2 });
      continue;
    }
    const srcId = img(beat.id) ? beat.id : beat.fallback;
    const src = srcId ? path.join(SCREENS, `${srcId}.png`) : '';
    if (!src || !fs.existsSync(src)) continue;
    const overlay = path.join(SLIDES, `${beat.id}-frame.png`);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;background:#0b1220;font-family:"Segoe UI",sans-serif;}
      .stage{height:100%;display:flex;flex-direction:column;}
      .bar{padding:22px 40px 10px;color:#c6e04a;font-size:22px;letter-spacing:.12em;text-transform:uppercase;}
      .title{padding:0 40px 16px;color:#fff;font-size:42px;font-weight:700;}
      .shot{flex:1;margin:0 40px 40px;background:#111;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;}
      img{width:100%;height:100%;object-fit:contain;background:#0e1620;}
    </style></head><body>
      <div class="stage">
        <div class="bar">SPORTSUITE 360</div>
        <div class="title">${escapeHtml(beat.title)}</div>
        <div class="shot"><img src="file:///${src.replace(/\\/g, '/')}" /></div>
      </div>
    </body></html>`;
    const htmlPath = path.join(SLIDES, `${beat.id}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: overlay });
    files.push({ file: overlay, title: beat.title, dur: 3.6 });
  }

  await browser.close();
  return files;
}

function runFfmpeg(args) {
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit', shell: false });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
}

function buildVideo(frames) {
  if (!frames.length) throw new Error('No video frames');
  const listPath = path.join(SLIDES, 'concat.txt');
  const lines = [];
  for (const f of frames) {
    const p = f.file.replace(/\\/g, '/').replace(/'/g, "'\\''");
    lines.push(`file '${p}'`);
    lines.push(`duration ${f.dur}`);
  }
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
  fs.writeFileSync(listPath, lines.join('\n'), 'utf8');

  runFfmpeg([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-vf', 'scale=1920:1080,fps=30,format=yuv420p',
    '-movflags', '+faststart',
    VIDEO,
  ]);
}

async function main() {
  if (!fs.existsSync(path.join(SCREENS, '00-login.png'))) {
    throw new Error('Missing screens. Run: node scripts/capture-promo-screens.mjs');
  }
  fs.mkdirSync(PROMO, { recursive: true });
  fs.writeFileSync(MANUAL, buildManualHtml(), 'utf8');
  console.log('Manual →', MANUAL);

  const pdfPath = path.join(PROMO, 'SportSuite360-egcheiridio.pdf');
  {
    const browser = await chromium.launch({ headless: true });
    const pdfPage = await browser.newPage();
    await pdfPage.goto(`file:///${MANUAL.replace(/\\/g, '/')}`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await pdfPage.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
    });
    await browser.close();
  }
  console.log('PDF →', pdfPath);

  const frames = await renderVideoSlides();
  buildVideo(frames);
  console.log('Video →', VIDEO);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
