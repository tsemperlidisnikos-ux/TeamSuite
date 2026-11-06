/**
 * Extra captures: settings via ?tab=, finance via .tab buttons, portals, join/rent.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'ver3-screen-parity', 'screens');
const BASE = (process.env.PROMO_BASE_URL || 'https://teamsuite-seven.vercel.app').replace(/\/$/, '');
const MANIFEST = path.join(OUT, 'manifest.json');

const SETTINGS = [
  ['22a-settings-club', 'club', 'Ρυθμίσεις — Σύλλογος'],
  ['22b-settings-users', 'users', 'Ρυθμίσεις — Χρήστες'],
  ['22e2-settings-public-reg', 'publicRegistration', 'Ρυθμίσεις — Δημόσια εγγραφή'],
  ['22d2-settings-payments', 'payments', 'Ρυθμίσεις — Πληρωμές'],
  ['22h-settings-facility', 'facilities', 'Ρυθμίσεις — Γήπεδο'],
  ['22c-settings-email', 'email', 'Ρυθμίσεις — Email'],
  ['22i-settings-sms', 'sms', 'Ρυθμίσεις — SMS'],
  ['22j-settings-season', 'seasons', 'Ρυθμίσεις — Σεζόν'],
  ['22k-settings-receipts', 'receipts', 'Ρυθμίσεις — Αποδείξεις'],
  ['22f-settings-gdpr', 'amka', 'Ρυθμίσεις — GDPR'],
  ['22g-settings-backup', 'backup', 'Ρυθμίσεις — Backup'],
  ['22l-settings-terms', 'terms', 'Ρυθμίσεις — Όροι'],
  ['22m-settings-clothing', 'clothing', 'Ρυθμίσεις — Πακέτο ρουχισμού'],
  ['22n-settings-discounts', 'discounts', 'Ρυθμίσεις — Λόγοι έκπτωσης'],
  ['22o-settings-sizes', 'sizes', 'Ρυθμίσεις — Μεγεθολόγιο'],
];

async function dismissCookies(page) {
  const btn = page.getByRole('button', { name: /Αποδοχή όλων/i });
  if (await btn.count()) await btn.click().catch(() => {});
}

async function shot(page, id) {
  await dismissCookies(page);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT, `${id}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

async function enterDemo(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await dismissCookies(page);
  const demoBtn = page.getByRole('button', { name: /DEMO|Είσοδος DEMO/i });
  if (await demoBtn.count()) {
    await demoBtn.click();
  } else {
    await page.fill('input[type="email"]', 'demo@teamsuite.app');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
  }
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 90000 });
  await page.waitForTimeout(2000);
}

async function hardLogout(page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (/session|token|demo/i.test(k)) localStorage.removeItem(k);
    }
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await dismissCookies(page);
}

async function login(page, email, password) {
  await hardLogout(page);
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 });
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'el-GR',
  })).newPage();
  page.setDefaultTimeout(30000);

  const added = [];

  await enterDemo(page);

  for (const [id, tab, title] of SETTINGS) {
    try {
      await page.goto(`${BASE}/settings?tab=${tab}`, { waitUntil: 'domcontentloaded' });
      await shot(page, id);
      added.push({ id, path: `/settings?tab=${tab}`, title, desc: title, role: 'admin', file: `${id}.png` });
      console.log('OK', id);
    } catch (e) {
      console.warn('SKIP', id, e.message);
    }
  }

  // Finance tabs by clicking .tabs .tab
  try {
    await page.goto(`${BASE}/finance`, { waitUntil: 'domcontentloaded' });
    const labels = await page.locator('.tabs .tab').allTextContents();
    console.log('Finance tabs:', labels);
    for (const label of labels) {
      const clean = label.trim();
      const id =
        {
          Ανάλυση: '21a-finance-analysis',
          Έσοδα: '21b-finance-revenues',
          Έξοδα: '21c-finance-expenses',
          Ταμεία: '21d-finance-accounts',
          Ισοζύγιο: '21g-finance-balance',
          Προϋπολογισμός: '21e-finance-budget',
          Αναφορές: '21f-finance-reports',
        }[clean] || `21x-finance-${clean.toLowerCase()}`;
      await page.locator('.tabs .tab', { hasText: clean }).first().click();
      await shot(page, id);
      added.push({
        id,
        path: '/finance',
        title: `Οικονομικά — ${clean}`,
        desc: clean,
        role: 'admin',
        file: `${id}.png`,
      });
      console.log('OK', id);
    }
  } catch (e) {
    console.warn('SKIP finance', e.message);
  }

  // slug from settings public registration page text
  try {
    await page.goto(`${BASE}/settings?tab=publicRegistration`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const body = await page.locator('body').innerText();
    const m = body.match(/\/join\/([a-zA-Z0-9_-]+)/) || body.match(/join\/([a-zA-Z0-9_-]+)/);
    const slug = m?.[1] || null;
    console.log('slug', slug);
    if (slug) {
      await hardLogout(page);
      await page.goto(`${BASE}/join/${slug}`, { waitUntil: 'domcontentloaded' });
      await shot(page, '00-join');
      added.push({
        id: '00-join',
        path: `/join/${slug}`,
        title: 'Δημόσια εγγραφή',
        desc: 'Public join',
        role: 'public',
        file: '00-join.png',
      });
      console.log('OK 00-join');
      await page.goto(`${BASE}/rent/${slug}`, { waitUntil: 'domcontentloaded' });
      await shot(page, '00-rent');
      added.push({
        id: '00-rent',
        path: `/rent/${slug}`,
        title: 'Δημόσια ενοικίαση',
        desc: 'Public rent',
        role: 'public',
        file: '00-rent.png',
      });
      console.log('OK 00-rent');
    }
  } catch (e) {
    console.warn('SKIP join/rent', e.message);
  }

  for (const [email, shots] of [
    [
      'parent@teamsuite.app',
      [
        ['30-parent-overview', '/?tab=overview', 'Περιοχή γονέα — Αρχική'],
        ['31-parent-schedule', '/?tab=schedule', 'Περιοχή γονέα — Πρόγραμμα'],
        ['32-parent-payments', '/?tab=payments', 'Περιοχή γονέα — Πληρωμές'],
        ['33-parent-documents', '/?tab=documents', 'Περιοχή γονέα — Έγγραφα'],
      ],
    ],
    [['coach@teamsuite.app', [['40-coach-portal', '/', 'Περιοχή προπονητή']]]],
  ]) {
    // flatten handling
  }

  try {
    await login(page, 'parent@teamsuite.app', 'demo1234');
    for (const [id, p, title] of [
      ['30-parent-overview', '/?tab=overview', 'Περιοχή γονέα — Αρχική'],
      ['31-parent-schedule', '/?tab=schedule', 'Περιοχή γονέα — Πρόγραμμα'],
      ['32-parent-payments', '/?tab=payments', 'Περιοχή γονέα — Πληρωμές'],
      ['33-parent-documents', '/?tab=documents', 'Περιοχή γονέα — Έγγραφα'],
    ]) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
      await shot(page, id);
      added.push({ id, path: p, title, desc: title, role: 'parent', file: `${id}.png` });
      console.log('OK', id);
    }
  } catch (e) {
    console.warn('SKIP parent', e.message);
  }

  try {
    await login(page, 'coach@teamsuite.app', 'demo1234');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await shot(page, '40-coach-portal');
    added.push({
      id: '40-coach-portal',
      path: '/',
      title: 'Περιοχή προπονητή',
      desc: 'Coach portal',
      role: 'coach',
      file: '40-coach-portal.png',
    });
    console.log('OK 40-coach-portal');
  } catch (e) {
    console.warn('SKIP coach', e.message);
  }

  let manifest = [];
  if (fs.existsSync(MANIFEST)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    } catch {
      manifest = [];
    }
  }
  const byId = new Map(manifest.map((x) => [x.id, x]));
  for (const row of added) byId.set(row.id, row);
  const next = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2), 'utf8');
  await browser.close();
  console.log(`Updated manifest: ${next.length} entries`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
