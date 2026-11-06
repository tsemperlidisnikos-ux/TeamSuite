/**
 * Capture every TeamSuite screen for TeamSuite_ver.3 UI parity.
 *
 * Usage:
 *   $env:PROMO_BASE_URL='https://www.teamsuite.me'
 *   node scripts/capture-ver3-parity-screens.mjs
 *
 * Output: docs/ver3-screen-parity/screens/*.png + manifest.json
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'ver3-screen-parity', 'screens');
const BASE = (process.env.PROMO_BASE_URL || 'https://www.teamsuite.me').replace(/\/$/, '');

const DEMO_ADMIN = { email: 'demo@teamsuite.app', password: 'demo1234' };
const DEMO_PARENT = { email: 'parent@teamsuite.app', password: 'demo1234' };
const DEMO_COACH = { email: 'coach@teamsuite.app', password: 'demo1234' };

/** @type {Array<{ id: string, path: string, title: string, desc: string, role?: string }>} */
const PUBLIC_PAGES = [
  { id: '00-login', path: '/login', title: 'Σύνδεση', desc: 'Οθόνη εισόδου.' },
  { id: '00-login-parent', path: '/login?app=parent', title: 'Σύνδεση γονέα', desc: 'Login mode γονέα.' },
  { id: '00-login-coach', path: '/login?app=coach', title: 'Σύνδεση προπονητή', desc: 'Login mode προπονητή.' },
  { id: '00-register', path: '/register', title: 'Εγγραφή συλλόγου', desc: 'Waitlist νέου συλλόγου.' },
  { id: '00-legal', path: '/legal', title: 'Νομικά', desc: 'Νομικά έγγραφα.' },
];

const ADMIN_PAGES = [
  { id: '01-dashboard', path: '/', title: 'Προεπισκόπηση', desc: 'Dashboard KPIs.' },
  { id: '02-calendar', path: '/calendar', title: 'Ημερολόγιο', desc: 'Μήνας/εβδομάδα/ημέρα.' },
  { id: '03-athletes', path: '/athletes', title: 'Αθλητές', desc: 'Μητρώο + αιτήσεις.' },
  { id: '04-staff', path: '/staff', title: 'Προσωπικό', desc: 'Στελέχη συλλόγου.' },
  { id: '05-coaches', path: '/coaches', title: 'Προπονητές', desc: 'Κατάλογος προπονητών.' },
  { id: '06-classes', path: '/classes', title: 'Τμήματα', desc: 'Τμήματα / ομάδες.' },
  { id: '07-parents', path: '/parents', title: 'Γονείς', desc: 'Συνδέσεις γονέων.' },
  { id: '07b-members', path: '/members', title: 'Μέλη', desc: 'Μητρώο μελών.' },
  { id: '08-trainings', path: '/trainings', title: 'Προπονήσεις', desc: 'Καταχώρηση προπονήσεων.' },
  { id: '09-matches', path: '/matches', title: 'Αγώνες', desc: 'Αγώνες και σκορ.' },
  { id: '10-schedule', path: '/schedule', title: 'Πρόγραμμα', desc: 'Εβδομαδιαίο πρόγραμμα.' },
  { id: '11-attendance', path: '/attendance', title: 'Παρουσίες', desc: 'Παρουσιολόγιο.' },
  { id: '12-associations', path: '/associations', title: 'Σωματείο', desc: 'Σωματεία / ενώσεις.' },
  { id: '13-sports', path: '/sports', title: 'Άθλημα', desc: 'Αθλήματα συλλόγου.' },
  { id: '14-announcements', path: '/announcements', title: 'Ανακοινώσεις', desc: 'Compose + λίστα.' },
  { id: '15-prints', path: '/prints', title: 'Εκτυπώσεις', desc: 'Εκτυπώσιμα.' },
  { id: '16-photos', path: '/photos', title: 'Φωτογραφίες', desc: 'Γκαλερί.' },
  { id: '16b-rental', path: '/rental', title: 'Ενοικίαση', desc: 'Κρατήσεις γηπέδου.' },
  { id: '17-warehouse', path: '/warehouse', title: 'Αποθήκη', desc: 'Προϊόντα / κινήσεις.' },
  { id: '18-fees', path: '/fees', title: 'Συνδρομές / Πληρωμές', desc: 'Χρεώσεις.' },
  { id: '19-transactions', path: '/transactions', title: 'Συναλλαγές', desc: 'Χρεώσεις/πληρωμές.' },
  { id: '20-partners', path: '/partner-businesses', title: 'Συμβεβλημένες επιχειρήσεις', desc: 'Partners.' },
  { id: '20b-document-protocol', path: '/document-protocol', title: 'Πρωτόκολλο Εγγράφων', desc: 'Πρωτόκολλο.' },
  { id: '21-finance', path: '/finance', title: 'Οικονομικά', desc: 'Finance hub.' },
  { id: '22-settings', path: '/settings', title: 'Ρυθμίσεις', desc: 'Ρυθμίσεις συλλόγου.' },
];

const FINANCE_TABS = [
  { id: '21a-finance-analysis', label: 'Ανάλυση', title: 'Οικονομικά — Ανάλυση' },
  { id: '21b-finance-revenues', label: 'Έσοδα', title: 'Οικονομικά — Έσοδα' },
  { id: '21c-finance-expenses', label: 'Έξοδα', title: 'Οικονομικά — Έξοδα' },
  { id: '21d-finance-accounts', label: 'Ταμεία', title: 'Οικονομικά — Ταμεία' },
  { id: '21e-finance-budget', label: 'Προϋπολογισμός', title: 'Οικονομικά — Προϋπολογισμός' },
  { id: '21f-finance-reports', label: 'Αναφορές', title: 'Οικονομικά — Αναφορές' },
  { id: '21g-finance-balance', label: 'Ισοζύγιο', title: 'Οικονομικά — Ισοζύγιο' },
];

const SETTINGS_TABS = [
  { id: '22a-settings-club', label: 'Σύλλογος', title: 'Ρυθμίσεις — Σύλλογος' },
  { id: '22b-settings-users', label: 'Χρήστες', title: 'Ρυθμίσεις — Χρήστες' },
  { id: '22c-settings-email', label: 'Email', title: 'Ρυθμίσεις — Email' },
  { id: '22d-settings-viva', label: 'Viva', title: 'Ρυθμίσεις — Viva' },
  { id: '22d2-settings-payments', label: 'Πληρωμές', title: 'Ρυθμίσεις — Πληρωμές' },
  { id: '22e-settings-register', label: 'Εγγραφή', title: 'Ρυθμίσεις — Δημόσια εγγραφή' },
  { id: '22e2-settings-public-reg', label: 'Δημόσια εγγραφή', title: 'Ρυθμίσεις — Δημόσια εγγραφή' },
  { id: '22f-settings-gdpr', label: 'GDPR', title: 'Ρυθμίσεις — GDPR' },
  { id: '22g-settings-backup', label: 'Backup', title: 'Ρυθμίσεις — Backup' },
  { id: '22h-settings-facility', label: 'Γήπεδο', title: 'Ρυθμίσεις — Γήπεδο' },
  { id: '22i-settings-sms', label: 'SMS', title: 'Ρυθμίσεις — SMS' },
  { id: '22j-settings-season', label: 'Σεζόν', title: 'Ρυθμίσεις — Σεζόν' },
  { id: '22k-settings-receipts', label: 'Αποδείξεις', title: 'Ρυθμίσεις — Αποδείξεις' },
];

const ATHLETE_PROFILE_TABS = [
  { id: '03b-athlete-personal', label: 'Προσωπικά Στοιχεία', title: 'Προφίλ — Προσωπικά' },
  { id: '03c-athlete-amka', label: 'AMKA & Ταυτοποίηση', title: 'Προφίλ — ΑΜΚΑ' },
  { id: '03d-athlete-health', label: 'Κάρτα Υγείας', title: 'Προφίλ — Κάρτα υγείας' },
  { id: '03e-athlete-fees', label: 'Συνδρομές / Οφειλές', title: 'Προφίλ — Συνδρομές' },
  { id: '03f-athlete-gdpr', label: 'Συγκαταθέσεις', title: 'Προφίλ — GDPR' },
  { id: '03g-athlete-progress', label: 'Πρόοδος', title: 'Προφίλ — Πρόοδος' },
  { id: '03h-athlete-history', label: 'Ιστορικό', title: 'Προφίλ — Ιστορικό' },
];

async function dismissCookies(page) {
  const btn = page.getByRole('button', { name: /Αποδοχή όλων/i });
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function shot(page, fileId) {
  await dismissCookies(page);
  await page.waitForTimeout(400);
  const file = path.join(OUT, `${fileId}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  return `${fileId}.png`;
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

async function firstAthleteId(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('academyhub-data-by-club-v1');
      if (!raw) return null;
      const map = JSON.parse(raw);
      for (const data of Object.values(map)) {
        const s = data?.students?.[0];
        if (s?.id) return s.id;
      }
      return null;
    } catch {
      return null;
    }
  });
}

async function publicJoinSlug(page) {
  return page.evaluate(() => {
    try {
      const clubsRaw = localStorage.getItem('teamsuite-clubs-v1') || localStorage.getItem('academyhub-clubs-v1');
      // try common keys
      for (const key of Object.keys(localStorage)) {
        if (!/club/i.test(key)) continue;
        try {
          const v = JSON.parse(localStorage.getItem(key) || 'null');
          const list = Array.isArray(v) ? v : v?.clubs;
          if (!Array.isArray(list)) continue;
          for (const c of list) {
            const slug = c?.publicRegistration?.slug || c?.slug || c?.joinSlug;
            if (slug) return String(slug);
          }
        } catch {
          /* ignore */
        }
      }
      if (clubsRaw) {
        const clubs = JSON.parse(clubsRaw);
        const list = Array.isArray(clubs) ? clubs : [];
        for (const c of list) {
          const slug = c?.publicRegistration?.slug || c?.slug;
          if (slug) return String(slug);
        }
      }
      return null;
    } catch {
      return null;
    }
  });
}

async function loginAs(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await dismissCookies(page);
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !String(url).includes('/login'), { timeout: 60000 });
  await page.waitForTimeout(1500);
  await dismissCookies(page);
}

async function enterDemoAdmin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await dismissCookies(page);
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  const demoBtn = page.getByRole('button', { name: /DEMO|Είσοδος DEMO/i });
  if (await demoBtn.count()) {
    await demoBtn.click();
    await page.waitForURL((url) => !String(url).includes('/login'), { timeout: 90000 });
  } else {
    await loginAs(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
  }
  await page.waitForTimeout(2000);
  // try reseed if empty
  if ((await storedStudentCount(page)) === 0) {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    const backupTab = page.getByRole('button', { name: 'Backup' });
    if (await backupTab.count()) await backupTab.click();
    page.once('dialog', (d) => d.accept());
    const reseed = page.getByRole('button', { name: /Επαναφόρτωση DEMO/i });
    if (await reseed.count()) {
      await reseed.click();
      await page.waitForTimeout(3000);
    }
  }
  console.log('DEMO students:', await storedStudentCount(page));
}

async function logout(page) {
  const candidates = [
    'button:has-text("Αποσύνδεση")',
    'a:has-text("Αποσύνδεση")',
    'button:has-text("Έξοδος")',
  ];
  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.click().catch(() => {});
      await page.waitForTimeout(600);
      break;
    }
  }
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
}

async function clickTab(page, label) {
  const exact = page.getByRole('button', { name: label, exact: true }).first();
  if (await exact.count()) {
    await exact.click();
    await page.waitForTimeout(500);
    return true;
  }
  const soft = page.getByRole('button', { name: new RegExp(`^${label}`, 'i') }).first();
  if (await soft.count()) {
    await soft.click();
    await page.waitForTimeout(500);
    return true;
  }
  // settings sometimes use links / tabs
  const tab = page.getByRole('tab', { name: new RegExp(label, 'i') }).first();
  if (await tab.count()) {
    await tab.click();
    await page.waitForTimeout(500);
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
  page.setDefaultTimeout(25000);
  /** @type {any[]} */
  const manifest = [];

  for (const item of PUBLIC_PAGES) {
    try {
      await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const file = await shot(page, item.id);
      manifest.push({ ...item, role: 'public', file });
      console.log('OK', item.id);
    } catch (err) {
      console.warn('SKIP', item.id, err.message);
    }
  }

  await enterDemoAdmin(page);

  for (const item of ADMIN_PAGES) {
    try {
      await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const file = await shot(page, item.id);
      manifest.push({ ...item, role: 'admin', file });
      console.log('OK', item.id);
    } catch (err) {
      console.warn('SKIP', item.id, err.message);
    }
  }

  // Athlete profile + tabs
  try {
    const athleteId = await firstAthleteId(page);
    if (athleteId) {
      await page.goto(`${BASE}/athletes/${encodeURIComponent(athleteId)}`, {
        waitUntil: 'domcontentloaded',
      });
      const file = await shot(page, '03b-athlete-profile');
      manifest.push({
        id: '03b-athlete-profile',
        path: `/athletes/${athleteId}`,
        title: 'Προφίλ αθλητή',
        desc: 'Καρτέλες προφίλ.',
        role: 'admin',
        file,
      });
      console.log('OK 03b-athlete-profile');
      for (const tab of ATHLETE_PROFILE_TABS) {
        const ok = await clickTab(page, tab.label);
        if (!ok) {
          console.warn('SKIP tab', tab.id);
          continue;
        }
        const f = await shot(page, tab.id);
        manifest.push({
          ...tab,
          path: `/athletes/${athleteId}`,
          desc: tab.title,
          role: 'admin',
          file: f,
        });
        console.log('OK', tab.id);
      }
    } else {
      console.warn('SKIP athlete profile — no students');
    }
  } catch (err) {
    console.warn('SKIP athlete profile', err.message);
  }

  // Class profile
  try {
    const classId = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('academyhub-data-by-club-v1');
        if (!raw) return null;
        const map = JSON.parse(raw);
        for (const data of Object.values(map)) {
          const c = data?.classes?.[0];
          if (c?.id) return c.id;
        }
        return null;
      } catch {
        return null;
      }
    });
    if (classId) {
      await page.goto(`${BASE}/classes/${encodeURIComponent(classId)}`, {
        waitUntil: 'domcontentloaded',
      });
      const file = await shot(page, '06b-class-profile');
      manifest.push({
        id: '06b-class-profile',
        path: `/classes/${classId}`,
        title: 'Προφίλ τμήματος',
        desc: 'Tabs τμήματος.',
        role: 'admin',
        file,
      });
      console.log('OK 06b-class-profile');
    }
  } catch (err) {
    console.warn('SKIP class profile', err.message);
  }

  // Finance tabs
  try {
    await page.goto(`${BASE}/finance`, { waitUntil: 'domcontentloaded' });
    for (const item of FINANCE_TABS) {
      const ok = await clickTab(page, item.label);
      if (!ok) {
        console.warn('SKIP', item.id);
        continue;
      }
      const file = await shot(page, item.id);
      manifest.push({
        ...item,
        path: '/finance',
        desc: item.title,
        role: 'admin',
        file,
      });
      console.log('OK', item.id);
    }
  } catch (err) {
    console.warn('SKIP finance tabs', err.message);
  }

  // Settings tabs
  try {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    for (const item of SETTINGS_TABS) {
      const ok = await clickTab(page, item.label);
      if (!ok) {
        console.warn('SKIP', item.id);
        continue;
      }
      const file = await shot(page, item.id);
      manifest.push({
        ...item,
        path: '/settings',
        desc: item.title,
        role: 'admin',
        file,
      });
      console.log('OK', item.id);
    }
  } catch (err) {
    console.warn('SKIP settings tabs', err.message);
  }

  // Public join / rent if slug available
  try {
    const slug = await publicJoinSlug(page);
    if (slug) {
      await logout(page);
      await page.goto(`${BASE}/join/${encodeURIComponent(slug)}`, { waitUntil: 'domcontentloaded' });
      const f1 = await shot(page, '00-join');
      manifest.push({
        id: '00-join',
        path: `/join/${slug}`,
        title: 'Δημόσια εγγραφή',
        desc: 'Public join form.',
        role: 'public',
        file: f1,
      });
      console.log('OK 00-join');
      await page.goto(`${BASE}/rent/${encodeURIComponent(slug)}`, { waitUntil: 'domcontentloaded' });
      const f2 = await shot(page, '00-rent');
      manifest.push({
        id: '00-rent',
        path: `/rent/${slug}`,
        title: 'Δημόσια ενοικίαση',
        desc: 'Public rent form.',
        role: 'public',
        file: f2,
      });
      console.log('OK 00-rent');
    } else {
      console.warn('SKIP join/rent — no slug');
    }
  } catch (err) {
    console.warn('SKIP join/rent', err.message);
  }

  // Parent portal
  try {
    await logout(page);
    await loginAs(page, DEMO_PARENT.email, DEMO_PARENT.password);
    for (const [id, tabPath, title] of [
      ['30-parent-overview', '/?tab=overview', 'Περιοχή γονέα — Αρχική'],
      ['31-parent-schedule', '/?tab=schedule', 'Περιοχή γονέα — Πρόγραμμα'],
      ['32-parent-payments', '/?tab=payments', 'Περιοχή γονέα — Πληρωμές'],
      ['33-parent-documents', '/?tab=documents', 'Περιοχή γονέα — Έγγραφα'],
    ]) {
      await page.goto(`${BASE}${tabPath}`, { waitUntil: 'domcontentloaded' });
      const file = await shot(page, id);
      manifest.push({ id, path: tabPath, title, desc: title, role: 'parent', file });
      console.log('OK', id);
    }
  } catch (err) {
    console.warn('SKIP parent', err.message);
  }

  // Coach portal
  try {
    await logout(page);
    await loginAs(page, DEMO_COACH.email, DEMO_COACH.password);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const file = await shot(page, '40-coach-portal');
    manifest.push({
      id: '40-coach-portal',
      path: '/',
      title: 'Περιοχή προπονητή',
      desc: 'Coach portal.',
      role: 'coach',
      file,
    });
    console.log('OK 40-coach-portal');
  } catch (err) {
    console.warn('SKIP coach', err.message);
  }

  // Mini apps
  try {
    await page.goto(`${BASE}/app/parent`, { waitUntil: 'domcontentloaded' });
    const f = await shot(page, '50-app-parent');
    manifest.push({
      id: '50-app-parent',
      path: '/app/parent',
      title: 'App γονέα',
      desc: 'Parent app shell.',
      role: 'public',
      file: f,
    });
    console.log('OK 50-app-parent');
  } catch (err) {
    console.warn('SKIP app parent', err.message);
  }
  try {
    await page.goto(`${BASE}/app/coach`, { waitUntil: 'domcontentloaded' });
    const f = await shot(page, '50-app-coach');
    manifest.push({
      id: '50-app-coach',
      path: '/app/coach',
      title: 'App προπονητή',
      desc: 'Coach app shell.',
      role: 'public',
      file: f,
    });
    console.log('OK 50-app-coach');
  } catch (err) {
    console.warn('SKIP app coach', err.message);
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await browser.close();
  console.log(`\nCaptured ${manifest.length} screens → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
