import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const screensDir = path.join(root, 'docs', 'ver3-screen-parity', 'screens');
const outPrompt = path.join(root, 'docs', 'ver3-screen-parity', 'PROMPT.md');
const outIndex = path.join(root, 'docs', 'TEAMSUITE_VER3_SCREEN_PARITY_PROMPT.md');

const manifest = JSON.parse(fs.readFileSync(path.join(screensDir, 'manifest.json'), 'utf8'));
const byFile = new Map(manifest.map((x) => [x.file, x]));
const files = fs
  .readdirSync(screensDir)
  .filter((f) => f.endsWith('.png'))
  .sort();

const tableLines = [
  '| # | Screenshot file | Route | Τίτλος |',
  '|---:|---|---|---|',
];
files.forEach((f, i) => {
  const row = byFile.get(f) || {};
  const title = row.title || f.replace(/\.png$/, '');
  tableLines.push(`| ${i + 1} | \`screens/${f}\` | \`${row.path || '—'}\` | ${title} |`);
});
const table = tableLines.join('\n');
const count = files.length;
const today = new Date().toISOString().slice(0, 10);

const fence = '```';
const promptInner = [
  'PROJECT: TeamSuite_ver.3 (C:\\TeamSuite_ver.3)',
  'REFERENCE APP (read-only): C:\\TeamSuite',
  'REFERENCE SCREENSHOTS (visual source of truth): C:\\TeamSuite\\docs\\ver3-screen-parity\\screens\\',
  'REFERENCE CHECKLIST (fields/tabs): C:\\TeamSuite\\docs\\TEAMSUITE_VER3_SCREEN_PARITY_PROMPT.md και ο παλιός κώδικας src/pages/*',
  '',
  '# Στόχος',
  '',
  'Φτιάξε / ολοκλήρωσε την UI της **TeamSuite_ver.3** ώστε κάθε οθόνη να είναι **ΑΚΡΙΒΩΣ ίδια** με την υπάρχουσα TeamSuite:',
  '- ίδια routes',
  '- ίδια ελληνικά labels (κουμπιά, tabs, φίλτρα, headers, empty states)',
  '- ίδια toolbars / φόρμες / πίνακες / ενέργειες γραμμής',
  '- ίδια πληροφοριακή ιεραρχία όπως στα screenshots',
  '',
  '# Υποχρεωτικοί κανόνες',
  '',
  '1. Για ΚΑΘΕ οθόνη: άνοιξε το αντίστοιχο PNG στο φάκελο screens/ ΚΑΙ το αντίστοιχο αρχείο στο C:\\TeamSuite\\src\\pages (ή components). Το screenshot = οπτική αλήθεια. Ο κώδικας = πλήρης λίστα πεδίων/ενεργειών.',
  '2. Δεν παραλείπεις οθόνες «για αργότερα». Αν λείπει κάτι = blocker.',
  '3. ΜΗΝ αλλάζεις το νόημα επιλογών. Επιτρέπεται καλύτερο CSS / grouped sidebar, ΑΛΛΑ όχι κόψιμο λειτουργιών ή πεδίων.',
  '4. Module gates + role permissions όπως στην παλιά.',
  '5. Portals (parent/coach/athlete) + public pages συμπεριλαμβάνονται.',
  '6. Στο τέλος κάθε φάσης: checklist οθόνη → ✅/❌ με αναφορά στο screenshot id.',
  '',
  '# Κατάλογος screenshots (οπτική πηγή αλήθειας)',
  '',
  table,
  '',
  '# Σειρά υλοποίησης',
  '',
  'U0 Layout + login + dashboard',
  'U1 Αθλητές + προφίλ (όλα τα tabs 03b–03h) + τμήματα + γονείς + προπονητές + μέλη',
  'U2 Ημερολόγιο / πρόγραμμα / προπονήσεις / παρουσίες / αγώνες',
  'U3 Fees / transactions / finance (όλα τα tabs 21*) / prints',
  'U4 Announcements / photos / warehouse / rental / protocol / partners',
  'U5 Settings όλες οι καρτέλες 22*',
  'U6 Public: register / join / rent / legal / app-parent / app-coach',
  'U7 Portals parent (30–33) + coach (40)',
  'U8 Platform Admin (αν υπάρχει στο ver.3 scope — διάβασε παλιό /platform*)',
  '',
  '# Οδηγία έναρξης',
  '',
  'Ξεκίνα επιβεβαιώνοντας: θα παραδώσεις 1:1 screen parity με την παλιά TeamSuite χρησιμοποιώντας τα PNG στο C:\\TeamSuite\\docs\\ver3-screen-parity\\screens\\ ως οπτική πηγή αλήθειας και τον παλιό κώδικα για πλήρη πεδία. Πρώτη παράδοση: U0 + πίνακας ✅/❌ για όλα τα screenshots του καταλόγου (ακόμα και αν είναι ❌).',
].join('\n');

const promptBody = [
  '# PROMPT — TeamSuite_ver.3: 1:1 αντιγραφή ΟΛΩΝ των οθονών (με screenshots)',
  '',
  'Επικόλλησε **ολόκληρο** αυτό το μπλοκ σε chat στο project `C:\\TeamSuite_ver.3`.',
  '',
  fence,
  promptInner,
  fence,
  '',
  '---',
  '',
  '## Πώς το χρησιμοποιείς',
  '',
  '1. Άνοιξε το project **TeamSuite_ver.3** (`C:\\TeamSuite_ver.3`).',
  '2. Επικόλλησε το μπλοκ μέσα στα triple backticks παραπάνω.',
  `3. Τα screenshots είναι ήδη στο: \`C:\\TeamSuite\\docs\\ver3-screen-parity\\screens\\\` (**${count} PNG**).`,
  '4. Για λεπτομέρειες πεδίων/tabs δες και το εκτενές checklist στο `docs/TEAMSUITE_VER3_SCREEN_PARITY_PROMPT.md`.',
  '',
  '## Επαναλήψη capture',
  '',
  fence + 'powershell',
  "$env:PROMO_BASE_URL='https://teamsuite-seven.vercel.app'",
  'node scripts/capture-ver3-parity-screens.mjs',
  'node scripts/capture-ver3-parity-screens-extra.mjs',
  'node scripts/build-ver3-parity-prompt.mjs',
  fence,
  '',
  `Captured from: \`https://teamsuite-seven.vercel.app\` (DEMO) · ${count} screens · ${today}`,
  '',
].join('\n');

fs.writeFileSync(outPrompt, promptBody, 'utf8');

const old = fs.readFileSync(outIndex, 'utf8');
const marker = '## PROMPT (αντιγραφή από εδώ)';
const cut = old.indexOf(marker);
const rest = cut >= 0 ? old.slice(cut) : old;

const bridge = [
  '# TeamSuite → TeamSuite_ver.3 — Screen parity (screenshots + prompt)',
  '',
  '**Νέο πακέτο (προτιμητέο):** [`docs/ver3-screen-parity/PROMPT.md`](./ver3-screen-parity/PROMPT.md)',
  `**Screenshots:** [\`docs/ver3-screen-parity/screens/\`](./ver3-screen-parity/screens/) (**${count} PNG**)`,
  '**Manifest:** [`docs/ver3-screen-parity/screens/manifest.json`](./ver3-screen-parity/screens/manifest.json)',
  '',
  'Άνοιξε το `PROMPT.md` και επικόλλησε το μπλοκ PROMPT στο chat του `C:\\TeamSuite_ver.3`.',
  '',
  '---',
  '',
  '## Λεπτομερές checklist πεδίων (συμπληρωματικό)',
  '',
  'Παρακάτω παραμένει το αναλυτικό checklist (tabs/fields/actions). Χρησιμοποίησέ το μαζί με τα screenshots — όχι αντί αυτών.',
  '',
  '',
].join('\n');

fs.writeFileSync(outIndex, bridge + rest, 'utf8');
console.log('Wrote', outPrompt);
console.log('Updated', outIndex);
console.log('Screens', count);
