/**
 * Capture SportSuite 360 DEMO screens for promo + manual.
 * Usage: $env:PROMO_BASE_URL='http://localhost:5174'; node scripts/capture-promo-screens.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'promo', 'screens');
const BASE = process.env.PROMO_BASE_URL || 'http://127.0.0.1:5173';

const ADMIN_PAGES = [
  { id: '01-dashboard', path: '/', title: 'Επισκόπηση (Dashboard)', desc: 'KPIs, ταμείο, οφειλές, τμήματα και κατάσταση αθλητών.' },
  { id: '02-calendar', path: '/calendar', title: 'Ημερολόγιο', desc: 'Ημερήσια / εβδομαδιαία εικόνα προπονήσεων και αγώνων.' },
  { id: '03-athletes', path: '/athletes', title: 'Αθλητές', desc: 'Λίστα αθλητών, φίλτρα, αιτήσεις εγγραφής και προφίλ.' },
  { id: '04-staff', path: '/staff', title: 'Προσωπικό', desc: 'Διαχείριση στελεχών συλλόγου.' },
  { id: '05-coaches', path: '/coaches', title: 'Προπονητές', desc: 'Κατάλογος προπονητών και σύνδεση με τμήματα.' },
  { id: '06-classes', path: '/classes', title: 'Τμήματα', desc: 'Ομάδες / ηλικιακές κατηγορίες ανά άθλημα.' },
  { id: '07-parents', path: '/parents', title: 'Γονείς', desc: 'Σύνδεση γονέων με αθλητές και λογαριασμοί.' },
  { id: '08-trainings', path: '/trainings', title: 'Προπονήσεις', desc: 'Καταχώρηση και πρόγραμμα προπονήσεων.' },
  { id: '09-matches', path: '/matches', title: 'Αγώνες', desc: 'Αγώνες, αποτελέσματα και βαθμολογίες.' },
  { id: '10-schedule', path: '/schedule', title: 'Πρόγραμμα', desc: 'Εβδομαδιαίο πρόγραμμα τμημάτων.' },
  { id: '11-attendance', path: '/attendance', title: 'Παρουσίες', desc: 'Καταγραφή παρουσίας / απουσίας ανά προπόνηση.' },
  { id: '12-associations', path: '/associations', title: 'Σωματείο', desc: 'Στοιχεία σωματείου και ενώσεις.' },
  { id: '13-sports', path: '/sports', title: 'Άθλημα', desc: 'Ενεργά αθλήματα συλλόγου.' },
  { id: '14-announcements', path: '/announcements', title: 'Ανακοινώσεις', desc: 'Ανακοινώσεις προς γονείς / αθλητές / προπονητές.' },
  { id: '15-prints', path: '/prints', title: 'Εκτυπώσεις', desc: 'Εκτυπώσιμα έγγραφα και κάρτες.' },
  { id: '16-photos', path: '/photos', title: 'Φωτογραφίες', desc: 'Γκαλερί φωτογραφιών συλλόγου.' },
  { id: '17-warehouse', path: '/warehouse', title: 'Αποθήκη', desc: 'Είδη στολής / εξοπλισμού και κινήσεις.' },
  { id: '18-fees', path: '/fees', title: 'Συνδρομές / Πληρωμές', desc: 'Χρεώσεις, οφειλές και online πληρωμές.' },
  { id: '19-transactions', path: '/transactions', title: 'Συναλλαγές', desc: 'Ιστορικό χρεώσεων και εισπράξεων αθλητών.' },
  { id: '20-partners', path: '/partner-businesses', title: 'Συμβεβλημένες επιχειρήσεις', desc: 'Συνεργαζόμενες επιχειρήσεις συλλόγου.' },
  { id: '21-finance', path: '/finance', title: 'Οικονομικά', desc: 'Έσοδα, έξοδα, ταμεία, προϋπολογισμός και ανάλυση.' },
  { id: '22-settings', path: '/settings', title: 'Ρυθμίσεις', desc: 'Προφίλ συλλόγου, SMTP, Viva, backup, δημόσια εγγραφή.' },
];

const PUBLIC_PAGES = [
  { id: '00-login', path: '/login', title: 'Σύνδεση', desc: 'Οθόνη εισόδου με brand panel και φόρμα σύνδεσης.' },
  { id: '00-register', path: '/register', title: 'Εγγραφή συλλόγου', desc: 'Δημόσια αίτηση νέου συλλόγου (λίστα αναμονής).' },
];

const SETTINGS_TABS = [
  { id: '22a-settings-club', label: 'Σύλλογος', title: 'Ρυθμίσεις — Σύλλογος', desc: 'Λογότυπο, στοιχεία συλλόγου, SMTP και Viva.' },
  { id: '22b-settings-users', label: 'Χρήστες', title: 'Ρυθμίσεις — Χρήστες', desc: 'Λογαριασμοί και δικαιώματα καρτελών ανά ρόλο.' },
  { id: '22c-settings-email', label: 'Email', title: 'Ρυθμίσεις — Email', desc: 'Gmail/SMTP συλλόγου και δοκιμή αποστολής.' },
  { id: '22d-settings-viva', label: 'Viva', title: 'Ρυθμίσεις — Viva', desc: 'Online πληρωμές Viva Wallet.' },
  { id: '22e-settings-register', label: 'Εγγραφή', title: 'Ρυθμίσεις — Δημόσια εγγραφή', desc: 'Φόρμα /join, QR και τύποι αίτησης.' },
  { id: '22f-settings-gdpr', label: 'GDPR', title: 'Ρυθμίσεις — GDPR', desc: 'DPA, ΑΜΚΑ, DSAR και πολιτική διατήρησης.' },
  { id: '22g-settings-backup', label: 'Backup', title: 'Ρυθμίσεις — Backup', desc: 'ZIP/JSON, cloud sync και επαναφορά DEMO.' },
];

const FINANCE_TABS = [
  { id: '21a-finance-analysis', label: 'Ανάλυση', title: 'Οικονομικά — Ανάλυση', desc: 'Σύνολα εσόδων/εξόδων και γραφήματα.' },
  { id: '21b-finance-revenues', label: 'Έσοδα', title: 'Οικονομικά — Έσοδα', desc: 'Καταχώρηση εσόδων ανά κατηγορία.' },
  { id: '21c-finance-expenses', label: 'Έξοδα', title: 'Οικονομικά — Έξοδα', desc: 'Καταχώρηση εξόδων και εξόδων αγώνα.' },
  { id: '21d-finance-accounts', label: 'Ταμεία', title: 'Οικονομικά — Ταμεία', desc: 'Μετρητά / τράπεζα και κλείσιμο μήνα.' },
  { id: '21e-finance-budget', label: 'Προϋπολογισμός', title: 'Οικονομικά — Προϋπολογισμός', desc: 'Προϋπ. vs πραγματικά ανά σεζόν.' },
  { id: '21f-finance-reports', label: 'Αναφορές', title: 'Οικονομικά — Αναφορές', desc: 'Προεπισκόπηση, Excel, PDF, εκτύπωση.' },
];

async function dismissCookies(page) {
  const btn = page.getByRole('button', { name: /Αποδοχή όλων/i });
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function shot(page, fileId) {
  await dismissCookies(page);
  await page.waitForTimeout(500);
  const file = path.join(OUT, `${fileId}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  return file;
}

async function storedStudentCount(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('academyhub-data-by-club-v1');
      if (!raw) return 0;
      const map = JSON.parse(raw);
      return Object.values(map).reduce(
        (n, d) => n + ((d && d.students && d.students.length) || 0),
        0,
      );
    } catch {
      return 0;
    }
  });
}

async function waitForDemoData(page) {
  for (let i = 0; i < 30; i++) {
    if ((await storedStudentCount(page)) > 0) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function loginAs(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await dismissCookies(page);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !String(url).includes('/login'), { timeout: 45000 });
  await page.waitForTimeout(1200);
  await dismissCookies(page);
}

async function reseedFromBackup(page) {
  page.once('dialog', (d) => d.accept());
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await dismissCookies(page);
  await page.getByRole('button', { name: 'Backup' }).click();
  await page.waitForTimeout(400);
  const reseed = page.getByRole('button', { name: /Επαναφόρτωση DEMO/i });
  if (await reseed.count()) {
    await reseed.click();
    await page.waitForTimeout(2500);
  }
}

async function enterDemoAdmin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await dismissCookies(page);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  const demoBtn = page.getByRole('button', { name: /DEMO παρουσίασης|Είσοδος DEMO/i });
  if (await demoBtn.count()) {
    await demoBtn.click();
    await page.waitForURL((url) => !String(url).includes('/login'), { timeout: 60000 });
  } else {
    await loginAs(page, 'demo@sportsuite360.app', 'demo1234');
  }
  await page.waitForTimeout(2000);
  let ok = await waitForDemoData(page);
  if (!ok) {
    await reseedFromBackup(page);
    ok = await waitForDemoData(page);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissCookies(page);
  if ((await storedStudentCount(page)) === 0) {
    await reseedFromBackup(page);
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
  }
  console.log('DEMO students in storage:', await storedStudentCount(page));
}

async function logout(page) {
  const candidates = [
    'button:has-text("Αποσύνδεση")',
    'a:has-text("Αποσύνδεση")',
    'button[aria-label*="Αποσύνδεση"]',
    'button:has-text("Έξοδος")',
  ];
  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.click();
      await page.waitForTimeout(800);
      break;
    }
  }
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
}

async function clickTab(page, label) {
  const btn = page.getByRole('button', { name: label, exact: true }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'el-GR',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const manifest = [];

  for (const item of PUBLIC_PAGES) {
    await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded' });
    await shot(page, item.id);
    manifest.push({ ...item, role: 'public', file: `${item.id}.png` });
    console.log('OK', item.id);
  }

  await enterDemoAdmin(page);

  for (const item of ADMIN_PAGES) {
    try {
      await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await shot(page, item.id);
      manifest.push({ ...item, role: 'admin', file: `${item.id}.png` });
      console.log('OK', item.id);
    } catch (err) {
      console.warn('SKIP', item.id, err.message);
    }
  }

  try {
    await page.goto(`${BASE}/athletes/demo_ath_f1`, { waitUntil: 'domcontentloaded' });
    await shot(page, '03b-athlete-profile');
    manifest.push({
      id: '03b-athlete-profile',
      path: '/athletes/demo_ath_f1',
      title: 'Προφίλ αθλητή',
      desc: 'Καρτέλες προσωπικών, γονέων, συνδρομών, υγείας και GDPR.',
      role: 'admin',
      file: '03b-athlete-profile.png',
    });
    console.log('OK 03b-athlete-profile');
  } catch (err) {
    console.warn('SKIP athlete profile', err.message);
  }

  try {
    await page.goto(`${BASE}/finance`, { waitUntil: 'domcontentloaded' });
    for (const item of FINANCE_TABS) {
      await clickTab(page, item.label);
      await shot(page, item.id);
      manifest.push({ ...item, path: '/finance', role: 'admin', file: `${item.id}.png` });
      console.log('OK', item.id);
    }
  } catch (err) {
    console.warn('SKIP finance tabs', err.message);
  }

  try {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    for (const item of SETTINGS_TABS) {
      await clickTab(page, item.label);
      await shot(page, item.id);
      manifest.push({ ...item, path: '/settings', role: 'admin', file: `${item.id}.png` });
      console.log('OK', item.id);
    }
  } catch (err) {
    console.warn('SKIP settings tabs', err.message);
  }

  try {
    await logout(page);
    await loginAs(page, 'parent@sportsuite360.app', 'demo1234');
    await shot(page, '30-parent-overview');
    manifest.push({
      id: '30-parent-overview',
      path: '/?tab=overview',
      title: 'Περιοχή γονέα — Αρχική',
      desc: 'Tabs: αρχική, πρόγραμμα, πληρωμές, έγγραφα.',
      role: 'parent',
      file: '30-parent-overview.png',
    });
    await page.goto(`${BASE}/?tab=schedule`, { waitUntil: 'domcontentloaded' });
    await shot(page, '31-parent-schedule');
    manifest.push({
      id: '31-parent-schedule',
      path: '/?tab=schedule',
      title: 'Περιοχή γονέα — Πρόγραμμα',
      desc: 'Επόμενες προπονήσεις και λήψη .ics.',
      role: 'parent',
      file: '31-parent-schedule.png',
    });
    await page.goto(`${BASE}/?tab=payments`, { waitUntil: 'domcontentloaded' });
    await shot(page, '32-parent-payments');
    manifest.push({
      id: '32-parent-payments',
      path: '/?tab=payments',
      title: 'Περιοχή γονέα — Πληρωμές',
      desc: 'Υπόλοιπα, Viva και ιστορικό πληρωμών.',
      role: 'parent',
      file: '32-parent-payments.png',
    });
    await page.goto(`${BASE}/?tab=documents`, { waitUntil: 'domcontentloaded' });
    await shot(page, '33-parent-documents');
    manifest.push({
      id: '33-parent-documents',
      path: '/?tab=documents',
      title: 'Περιοχή γονέα — Έγγραφα',
      desc: 'Ιατρική κάρτα, GDPR και συναίνεση.',
      role: 'parent',
      file: '33-parent-documents.png',
    });
    console.log('OK parent portal');
  } catch (err) {
    console.warn('SKIP parent', err.message);
  }

  try {
    await logout(page);
    await loginAs(page, 'coach@sportsuite360.app', 'demo1234');
    await shot(page, '40-coach-portal');
    manifest.push({
      id: '40-coach-portal',
      path: '/',
      title: 'Περιοχή προπονητή',
      desc: 'Προπονήσεις, τμήματα και παρουσίες προπονητή.',
      role: 'coach',
      file: '40-coach-portal.png',
    });
    console.log('OK coach portal');
  } catch (err) {
    console.warn('SKIP coach', err.message);
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await browser.close();
  console.log(`Captured ${manifest.length} screens → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
