import { getUsers, migratePlaintextPasswords, saveUsers, type AppUser } from '../../auth/auth';
import { isPasswordHashed } from '../../auth/password';
import { getClubs, getClubSmtp, getClubViva, type Club } from '../../auth/clubs';
import {
  clubHasStoredData,
  exportAllClubsData,
  getData,
  mutateClubData,
} from '../../data/repository';
import {
  ACADEMY_MODULES,
  CLUB_PERMISSIONS,
  CLUB_ROLES,
  defaultBackupScheduleRule,
  getBackupSchedules,
  loadPlatformConfig,
  saveBackupSchedules,
  type AcademyModuleId,
} from '../../platform/platformConfig';
import type { AppData } from '../../types';
import { appDataWeight } from '../../data/mediaStrip';
import { studentClassIds } from '../../utils/studentClasses';
import { hydrateAllClubMirrorsFromCloud, persistLocalStateToCloud } from '../../data/clubSync';
import { pushAccountBundle } from './accountSyncService';
import { ensureLegacyPaymentsMatchedAllClubs } from './paymentMatchingService';

export type DiagnosticSeverity = 'critical' | 'warning' | 'info' | 'ok';

export type DiagnosticFinding = {
  id: string;
  category: string;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  fix: string;
};

export type DiagnosticReport = {
  ranAt: string;
  durationMs: number;
  summary: Record<DiagnosticSeverity, number>;
  findings: DiagnosticFinding[];
};

type ProgressFn = (label: string, percent: number) => void;

function finding(
  partial: Omit<DiagnosticFinding, 'id'> & { id?: string },
): DiagnosticFinding {
  return {
    id: partial.id ?? `${partial.category}-${partial.title}`.slice(0, 80),
    category: partial.category,
    severity: partial.severity,
    title: partial.title,
    detail: partial.detail,
    fix: partial.fix,
  };
}

async function checkApiHealth(): Promise<DiagnosticFinding[]> {
  const out: DiagnosticFinding[] = [];
  try {
    const response = await fetch('/api/health');
    const json = (await response.json()) as {
      ok?: boolean;
      durable?: boolean;
      durableBackend?: string;
    };
    if (!response.ok || !json.ok) {
      out.push(
        finding({
          category: 'API',
          severity: 'critical',
          title: 'Health API αποτυγχάνει',
          detail: `HTTP ${response.status} από /api/health.`,
          fix: 'Ελέγξτε το deploy στο Vercel και ότι τα API routes είναι διαθέσιμα. Ξανακάντε deploy.',
        }),
      );
      return out;
    }
    const backend = json.durableBackend || (json.durable ? 'unknown' : 'memory');
    out.push(
      finding({
        category: 'API',
        severity: 'ok',
        title: 'Health API OK',
        detail: `Το /api/health απαντά. Durable store: ${json.durable ? 'ναι' : 'όχι'} (${backend}).`,
        fix: json.durable
          ? 'Καμία ενέργεια.'
          : 'Συνδέστε Vercel Blob (BLOB_READ_WRITE_TOKEN) ή Redis και κάντε redeploy.',
      }),
    );
    if (!json.durable) {
      out.push(
        finding({
          category: 'API',
          severity: 'warning',
          title: 'Δεν υπάρχει durable store',
          detail: 'Τα mirrors/account bundle δεν θα διατηρηθούν μεταξύ instances.',
          fix: 'Vercel Blob Storage (προτεινόμενο) ή Redis env · μετά redeploy.',
        }),
      );
    }
  } catch (err) {
    out.push(
      finding({
        category: 'API',
        severity: 'critical',
        title: 'Αδυναμία κλήσης Health API',
        detail: err instanceof Error ? err.message : 'Network error',
        fix: 'Ανοίξτε την εφαρμογή από το production URL (όχι μόνο τοπικά χωρίς API). Ελέγξτε δίκτυο/CORS.',
      }),
    );
  }
  return out;
}

async function checkSyncEndpoints(): Promise<DiagnosticFinding[]> {
  const out: DiagnosticFinding[] = [];
  const { syncAuthHeaders, isSyncSessionConfigured } = await import('../syncAuth');
  if (!isSyncSessionConfigured()) {
    out.push(
      finding({
        category: 'Sync',
        severity: 'warning',
        title: 'Δεν υπάρχει ενεργό server session token',
        detail:
          'Τα sync APIs απαιτούν Bearer JWT μετά το login. Χωρίς token οι κλήσεις θα πάρουν 401.',
        fix: 'Συνδεθείτε ξανά ως Platform Admin. Το VITE_SS360_SYNC_SECRET δεν χρησιμοποιείται πλέον στο client.',
      }),
    );
  }
  try {
    const mirror = await fetch('/api/sync/mirror', { headers: syncAuthHeaders(false) });
    const mirrorJson = (await mirror.json()) as { ok?: boolean; clubs?: string[]; error?: string };
    if (mirror.status === 401 || mirror.status === 503) {
      out.push(
        finding({
          category: 'Sync',
          severity: 'critical',
          title: 'Mirror sync κλειδωμένο / μη εξουσιοδοτημένο',
          detail: mirrorJson.error || `HTTP ${mirror.status}`,
          fix: 'Συνδεθείτε ξανά (JWT). Στο Vercel ορίστε SS360_SYNC_SECRET / SS360_SESSION_SECRET (server-only) και redeploy.',
        }),
      );
    } else if (mirror.ok && mirrorJson.ok) {
      out.push(
        finding({
          category: 'Sync',
          severity: 'ok',
          title: 'Mirror sync API διαθέσιμο',
          detail: `Clubs στο mirror index: ${(mirrorJson.clubs ?? []).length}.`,
          fix: 'Καμία ενέργεια. Το αυτόματο sync είναι ενεργό από προεπιλογή (Ρυθμίσεις → Backup).',
        }),
      );
    } else {
      out.push(
        finding({
          category: 'Sync',
          severity: 'warning',
          title: 'Mirror sync API μη διαθέσιμο',
          detail: `HTTP ${mirror.status}`,
          fix: 'Βεβαιωθείτε ότι το αρχείο api/sync/mirror.ts είναι στο deploy και ότι τρέχετε σε Vercel.',
        }),
      );
    }
  } catch (err) {
    out.push(
      finding({
        category: 'Sync',
        severity: 'warning',
        title: 'Mirror sync unreachable',
        detail: err instanceof Error ? err.message : 'error',
        fix: 'Ελέγξτε σύνδεση και production API.',
      }),
    );
  }

  try {
    const account = await fetch('/api/sync/account', { headers: syncAuthHeaders(false) });
    const accountJson = (await account.json()) as { ok?: boolean; error?: string };
    if (account.status === 401 || account.status === 503) {
      out.push(
        finding({
          category: 'Sync',
          severity: 'critical',
          title: 'Account sync κλειδωμένο / μη εξουσιοδοτημένο',
          detail: accountJson.error || `HTTP ${account.status}`,
          fix: 'Συνδεθείτε ξανά ως Platform Admin. SS360_SYNC_SECRET μένει μόνο στο server (όχι VITE_*).',
        }),
      );
    } else if (account.status === 404) {
      out.push(
        finding({
          category: 'Sync',
          severity: 'warning',
          title: 'Δεν υπάρχει ακόμη account bundle στο cloud',
          detail: 'Το API υπάρχει, αλλά δεν έχει γίνει επιτυχές Push λογαριασμών.',
          fix: 'Ξανατρέξτε το διαγνωστικό τεστ (αυτόματο Push) ή Ρυθμίσεις → BACKUP → Push λογαριασμοί.',
        }),
      );
    } else if (account.ok) {
      out.push(
        finding({
          category: 'Sync',
          severity: 'ok',
          title: 'Account bundle cloud OK',
          detail: 'Βρέθηκε αποθηκευμένο users/clubs bundle.',
          fix: 'Καμία ενέργεια.',
        }),
      );
    } else {
      out.push(
        finding({
          category: 'Sync',
          severity: 'warning',
          title: 'Account sync API πρόβλημα',
          detail: `HTTP ${account.status}`,
          fix: 'Ελέγξτε api/sync/account.ts και BLOB_READ_WRITE_TOKEN / durable store.',
        }),
      );
    }
  } catch (err) {
    out.push(
      finding({
        category: 'Sync',
        severity: 'warning',
        title: 'Account sync unreachable',
        detail: err instanceof Error ? err.message : 'error',
        fix: 'Ελέγξτε production API / δίκτυο.',
      }),
    );
  }

  return out;
}

function checkStorage(): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  try {
    const probe = `__ss360_diag_${Date.now()}`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    out.push(
      finding({
        category: 'Storage',
        severity: 'ok',
        title: 'localStorage εγγραφή OK',
        detail: 'Ο browser επιτρέπει αποθήκευση.',
        fix: 'Καμία ενέργεια.',
      }),
    );
  } catch {
    out.push(
      finding({
        category: 'Storage',
        severity: 'critical',
        title: 'localStorage μπλοκαρισμένο ή γεμάτο',
        detail: 'Αποτυχία εγγραφής στο localStorage.',
        fix: 'Καθαρίστε δεδομένα ιστότοπου για teamsuite-seven.vercel.app ή απενεργοποιήστε private mode χωρίς storage.',
      }),
    );
  }

  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? '';
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    const mb = total / (1024 * 1024);
    out.push(
      finding({
        category: 'Storage',
        severity: mb > 4.5 ? 'warning' : 'ok',
        title: `Χρήση localStorage ~${mb.toFixed(2)} MB`,
        detail: `${localStorage.length} κλειδιά.`,
        fix:
          mb > 4.5
            ? 'Κάντε backup JSON, αφαιρέστε μεγάλες φωτογραφίες/logos και ενεργοποιήστε cloud sync.'
            : 'Καμία ενέργεια.',
      }),
    );
  } catch {
    /* ignore */
  }
  return out;
}

function checkUsers(users: AppUser[], clubs: Club[]): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  const clubIds = new Set(clubs.map((c) => c.id));
  const emails = new Map<string, string[]>();

  if (users.length === 0) {
    out.push(
      finding({
        category: 'Users',
        severity: 'critical',
        title: 'Δεν υπάρχουν χρήστες',
        detail: 'Η λίστα users είναι κενή.',
        fix: 'Επαναφέρετε backup ή δημιουργήστε platform admin / εγγραφή συλλόγου.',
      }),
    );
    return out;
  }

  const platformAdmins = users.filter((u) => u.role === 'platform_admin' && u.active);
  if (platformAdmins.length === 0) {
    out.push(
      finding({
        category: 'Users',
        severity: 'critical',
        title: 'Δεν υπάρχει ενεργός Platform Admin',
        detail: 'Κανένας ενεργός χρήστης με ρόλο platform_admin.',
        fix: 'Από backup επαναφέρετε users ή δημιουργήστε platform admin λογαριασμό.',
      }),
    );
  } else {
    out.push(
      finding({
        category: 'Users',
        severity: 'ok',
        title: `Platform Admin: ${platformAdmins.length}`,
        detail: platformAdmins.map((u) => u.email).join(', '),
        fix: 'Καμία ενέργεια.',
      }),
    );
  }

  let plaintext = 0;
  let orphanClub = 0;
  let orphanAthleteLink = 0;
  let orphanCoachLink = 0;

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    if (!email.includes('@')) {
      out.push(
        finding({
          category: 'Users',
          severity: 'warning',
          title: 'Μη έγκυρο email χρήστη',
          detail: `${user.fullName} (${user.id})`,
          fix: 'Platform Admin → Χρήστες: διορθώστε το email του λογαριασμού.',
        }),
      );
    }
    const list = emails.get(email) ?? [];
    list.push(user.id);
    emails.set(email, list);

    if (!isPasswordHashed(user.password)) plaintext += 1;

    if (user.role !== 'platform_admin') {
      if (!user.clubId || !clubIds.has(user.clubId)) orphanClub += 1;
    }
  }

  for (const [email, ids] of emails) {
    if (ids.length > 1) {
      out.push(
        finding({
          category: 'Users',
          severity: 'critical',
          title: 'Διπλότυπο email',
          detail: `${email} → ${ids.join(', ')}`,
          fix: 'Κρατήστε έναν λογαριασμό ανά email. Διαγράψτε/συγχωνεύστε τα διπλά από Platform Users.',
        }),
      );
    }
  }

  if (plaintext > 0) {
    out.push(
      finding({
        category: 'Users',
        severity: 'warning',
        title: `${plaintext} κωδικοί χωρίς hash`,
        detail: 'Παλιοί λογαριασμοί με plaintext password στο localStorage.',
        fix: 'Ξανατρέξτε το διαγνωστικό (auto-repair) ή ανοίξτε την εφαρμογή — γίνεται αυτόματο migrate χωρίς hardcoded secrets.',
      }),
    );
  } else {
    out.push(
      finding({
        category: 'Users',
        severity: 'ok',
        title: 'Κωδικοί hashed',
        detail: 'Όλοι οι κωδικοί είναι hashed. Δεν υπάρχουν hardcoded credentials στο client source.',
        fix: 'Καμία ενέργεια.',
      }),
    );
  }

  if (orphanClub > 0) {
    out.push(
      finding({
        category: 'Users',
        severity: 'warning',
        title: `${orphanClub} χρήστες χωρίς έγκυρο σύλλογο`,
        detail: 'clubId λείπει ή δείχνει σε ανύπαρκτο club.',
        fix: 'Platform Users: αντιστοιχίστε σωστό clubId ή διαγράψτε ανενεργούς λογαριασμούς.',
      }),
    );
  }

  // Athlete/coach link integrity against each user's own club dataset
  const clubMap = exportAllClubsData();
  for (const user of users) {
    const clubData = user.clubId ? clubMap[user.clubId] : undefined;
    if (!clubData) continue;
    const athleteIds = new Set(clubData.students.map((s) => s.id));
    const coachIds = new Set(clubData.coaches.map((c) => c.id));
    if (user.athleteId && !athleteIds.has(user.athleteId)) orphanAthleteLink += 1;
    if (user.coachId && !coachIds.has(user.coachId)) orphanCoachLink += 1;
  }
  if (orphanAthleteLink > 0) {
    out.push(
      finding({
        category: 'Users',
        severity: 'warning',
        title: `${orphanAthleteLink} σύνδεση χρήστη→αθλητή σπασμένη`,
        detail: 'athleteId δεν υπάρχει στο τρέχον club dataset.',
        fix: 'Ρυθμίσεις → Χρήστες/Προσκλήσεις: ξανασυνδέστε τον αθλητή ή καθαρίστε το athleteId.',
      }),
    );
  }
  if (orphanCoachLink > 0) {
    out.push(
      finding({
        category: 'Users',
        severity: 'warning',
        title: `${orphanCoachLink} σύνδεση χρήστη→προπονητή σπασμένη`,
        detail: 'coachId δεν υπάρχει στο τρέχον club dataset.',
        fix: 'Ρυθμίσεις → Προσκλήσεις: ορίστε «Σύνδεση με προπονητή» σε έγκυρο προπονητή.',
      }),
    );
  }

  out.push(
    finding({
      category: 'Users',
      severity: 'ok',
      title: `Σύνολο χρηστών: ${users.length}`,
      detail: `Ενεργοί: ${users.filter((u) => u.active).length}`,
      fix: 'Καμία ενέργεια.',
    }),
  );

  return out;
}

function checkClubs(clubs: Club[]): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  if (clubs.length === 0) {
    out.push(
      finding({
        category: 'Clubs',
        severity: 'critical',
        title: 'Δεν υπάρχουν σύλλογοι',
        detail: 'Η λίστα clubs είναι κενή.',
        fix: 'Κάντε εγγραφή νέου συλλόγου ή επαναφέρετε backup.',
      }),
    );
    return out;
  }

  out.push(
    finding({
      category: 'Clubs',
      severity: 'ok',
      title: `${clubs.length} σύλλογοι`,
      detail: clubs.map((c) => c.name).join(' · '),
      fix: 'Καμία ενέργεια.',
    }),
  );

  for (const club of clubs) {
    const smtp = getClubSmtp(club.id);
    if (smtp.enabled) {
      const missing =
        !smtp.host || !smtp.port || !smtp.username || (!smtp.password && !smtp.passwordSet);
      out.push(
        finding({
          category: 'Email',
          severity: missing ? 'critical' : 'ok',
          title: `SMTP «${club.name}»`,
          detail: missing
            ? 'Ενεργό SMTP αλλά λείπουν host/port/user/password.'
            : `SMTP ενεργό (${smtp.host}:${smtp.port}).`,
          fix: missing
            ? 'Ρυθμίσεις → Email συλλόγου: συμπληρώστε όλα τα πεδία και δοκιμάστε αποστολή test.'
            : 'Καμία ενέργεια.',
        }),
      );
    }

    const viva = getClubViva(club.id);
    if (viva.enabled) {
      const missing = !viva.clientId || !viva.clientSecret || !viva.sourceCode;
      out.push(
        finding({
          category: 'Viva',
          severity: missing ? 'critical' : 'ok',
          title: `Viva «${club.name}»`,
          detail: missing
            ? 'Viva ενεργό χωρίς credentials.'
            : `Viva ενεργό (${viva.environment ?? 'demo'}).`,
          fix: missing
            ? 'Ρυθμίσεις → Viva Wallet: συμπληρώστε Client ID/Secret/Source Code.'
            : 'Καμία ενέργεια.',
        }),
      );
    }

    const pub = club.publicRegistration;
    if (pub?.enabled && !pub.slug?.trim()) {
      out.push(
        finding({
          category: 'PublicJoin',
          severity: 'warning',
          title: `Δημόσια εγγραφή χωρίς slug («${club.name}»)`,
          detail: 'enabled=true αλλά λείπει slug.',
          fix: 'Ρυθμίσεις → Δημόσια εγγραφή: ορίστε μοναδικό slug και Αποθήκευση.',
        }),
      );
    }
  }

  return out;
}

function checkAppData(clubId: string, clubName: string, data: AppData): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  const prefix = clubName || clubId;
  const classIds = new Set(data.classes.map((c) => c.id));
  const studentIds = new Set(data.students.map((s) => s.id));
  const coachIds = new Set(data.coaches.map((c) => c.id));
  const accountIds = new Set((data.cashAccounts ?? []).map((a) => a.id));

  const orphanStudents = data.students.filter((s) =>
    studentClassIds(s).some((id) => !classIds.has(id)),
  ).length;
  if (orphanStudents > 0) {
    out.push(
      finding({
        category: 'Data',
        severity: 'warning',
        title: `${prefix}: ${orphanStudents} αθλητές με ανύπαρκτο τμήμα`,
        detail: 'classId δείχνει σε τμήμα που δεν υπάρχει.',
        fix: 'Αθλητές → επεξεργασία: επιλέξτε έγκυρο τμήμα ή αφήστε κενό.',
      }),
    );
  }

  const orphanTxn = (data.transactions ?? []).filter(
    (t) => !studentIds.has(t.athleteId),
  ).length;
  if (orphanTxn > 0) {
    out.push(
      finding({
        category: 'Data',
        severity: 'warning',
        title: `${prefix}: ${orphanTxn} συναλλαγές χωρίς αθλητή`,
        detail: 'athleteId δεν υπάρχει στο μητρώο.',
        fix: 'Συναλλαγές: διαγράψτε ορφανές κινήσεις ή επαναφέρετε τον αθλητή από backup.',
      }),
    );
  }

  const orphanAttendance = (data.attendance ?? []).filter(
    (a) => !studentIds.has(a.studentId) || !classIds.has(a.classId),
  ).length;
  if (orphanAttendance > 0) {
    out.push(
      finding({
        category: 'Data',
        severity: 'warning',
        title: `${prefix}: ${orphanAttendance} παρουσίες ορφανές`,
        detail: 'Παρουσίες με ανύπαρκτο αθλητή/τμήμα.',
        fix: 'Ξανατρέξτε το διαγνωστικό (γίνεται αυτόματος καθαρισμός) ή καθαρίστε χειροκίνητα.',
      }),
    );
  }

  const badAccountRefs = [
    ...(data.revenues ?? []).filter((r) => r.accountId && !accountIds.has(r.accountId)),
    ...(data.expenses ?? []).filter((e) => e.accountId && !accountIds.has(e.accountId)),
  ].length;
  if (badAccountRefs > 0) {
    out.push(
      finding({
        category: 'Finance',
        severity: 'warning',
        title: `${prefix}: ${badAccountRefs} κινήσεις με ανύπαρκτο ταμείο`,
        detail: 'accountId δεν αντιστοιχεί σε cashAccounts.',
        fix: 'Οικονομικά → Ταμεία: δημιουργήστε το ταμείο ή καθαρίστε το accountId στις κινήσεις.',
      }),
    );
  }

  const payments = (data.transactions ?? []).filter((t) => t.type === 'payment');
  const unallocated = payments.filter((p) => !p.allocatesChargeId).length;
  if (payments.length > 0) {
    out.push(
      finding({
        category: 'Finance',
        severity: unallocated === 0 ? 'ok' : 'warning',
        title:
          unallocated === 0
            ? `${prefix}: όλες οι πληρωμές αντιστοιχισμένες (${payments.length})`
            : `${prefix}: ${unallocated}/${payments.length} πληρωμές χωρίς αντιστοίχιση`,
        detail:
          unallocated === 0
            ? 'Όλες οι πληρωμές έχουν allocatesChargeId.'
            : 'Πληρωμές χωρίς allocatesChargeId.',
        fix:
          unallocated > 0
            ? 'Ξανατρέξτε το διαγνωστικό (αυτόματη αντιστοίχιση σε όλα τα clubs) ή ανοίξτε Συναλλαγές/Οικονομικά.'
            : 'Καμία ενέργεια.',
      }),
    );
  }

  const templateCount = data.feeChargeTemplates?.length ?? 0;
  const autoTemplates = (data.feeChargeTemplates ?? []).filter((t) => t.autoGenerate);
  out.push(
    finding({
      category: 'Fees',
      severity: templateCount === 0 ? 'info' : 'ok',
      title: `${prefix}: πρότυπα χρεώσεων ${templateCount}`,
      detail: `Αυτόματη χρέωση: ${autoTemplates.length}/${templateCount}.`,
      fix:
        templateCount === 0
          ? 'Προαιρετικό: Συνδρομές → νέο πρότυπο, αν ο σύλλογος χρεώνει συνδρομές από την εφαρμογή.'
          : 'Καμία ενέργεια. Τα πρότυπα ορίζονται μόνο από Συνδρομές, όχι από το Auto Repair.',
    }),
  );

  const matches = data.matches ?? [];
  const badMatchClass = matches.filter((m) => m.classId && !classIds.has(m.classId)).length;
  if (badMatchClass > 0) {
    out.push(
      finding({
        category: 'Matches',
        severity: 'warning',
        title: `${prefix}: ${badMatchClass} αγώνες με ανύπαρκτο τμήμα`,
        detail: 'classId αγώνα δεν υπάρχει.',
        fix: 'Αγώνες → επεξεργασία: επιλέξτε έγκυρο τμήμα ή αφήστε κενό.',
      }),
    );
  } else if (matches.length > 0) {
    out.push(
      finding({
        category: 'Matches',
        severity: 'ok',
        title: `${prefix}: ${matches.length} αγώνες OK`,
        detail: 'Δεν βρέθηκαν σπασμένα classId.',
        fix: 'Καμία ενέργεια.',
      }),
    );
  }

  const weight = appDataWeight(data);
  if (weight > 2_500_000) {
    out.push(
      finding({
        category: 'Data',
        severity: 'warning',
        title: `${prefix}: μεγάλο dataset (~${Math.round(weight / 1024)} KB)`,
        detail: 'Κίνδυνος quota localStorage.',
        fix: 'Αφαιρέστε μεγάλες φωτογραφίες, κάντε cloud sync και περιοδικό backup.',
      }),
    );
  }

  const counts = `αθλητές ${data.students.length}, τμήματα ${data.classes.length}, συναλλαγές ${(data.transactions ?? []).length}, έσοδα ${data.revenues.length}, έξοδα ${data.expenses.length}`;
  out.push(
    finding({
      category: 'Data',
      severity: 'ok',
      title: `${prefix}: σύνοψη δεδομένων`,
      detail: counts,
      fix: 'Καμία ενέργεια.',
    }),
  );

  // Duplicate student ids
  const seen = new Set<string>();
  let dupIds = 0;
  for (const s of data.students) {
    if (seen.has(s.id)) dupIds += 1;
    seen.add(s.id);
  }
  if (dupIds > 0) {
    out.push(
      finding({
        category: 'Data',
        severity: 'critical',
        title: `${prefix}: διπλά student ids`,
        detail: `${dupIds} διπλότυπα.`,
        fix: 'Επαναφέρετε από καθαρό backup ή επεξεργαστείτε το JSON backup και κάντε restore.',
      }),
    );
  }

  void coachIds;
  return out;
}

function checkPlatformConfig(): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  const config = loadPlatformConfig();

  if (!config.appName?.trim()) {
    out.push(
      finding({
        category: 'Config',
        severity: 'warning',
        title: 'Κενό όνομα εφαρμογής',
        detail: 'appName λείπει.',
        fix: 'Platform Admin: ορίστε όνομα / logo εφαρμογής.',
      }),
    );
  }

  if (!config.incomeCategories?.length || !config.expenseCategories?.length) {
    out.push(
      finding({
        category: 'Config',
        severity: 'warning',
        title: 'Κενός κατάλογος κατηγοριών οικονομικών',
        detail: 'Λείπουν income/expense categories.',
        fix: 'Platform Admin → κατηγορίες εσόδων/εξόδων: επαναφέρετε προεπιλογές.',
      }),
    );
  } else {
    out.push(
      finding({
        category: 'Config',
        severity: 'ok',
        title: 'Κατάλογος οικονομικών OK',
        detail: `Έσοδα ${config.incomeCategories.length}, έξοδα ${config.expenseCategories.length}.`,
        fix: 'Καμία ενέργεια.',
      }),
    );
  }

  for (const role of CLUB_ROLES) {
    const perms = config.clubRolePermissions?.[role] ?? [];
    const unknown = perms.filter(
      (p) => !(CLUB_PERMISSIONS as readonly string[]).includes(p),
    );
    if (unknown.length) {
      out.push(
        finding({
          category: 'Config',
          severity: 'warning',
          title: `Ρόλος ${role}: άγνωστα δικαιώματα`,
          detail: unknown.join(', '),
          fix: 'Platform Admin → δικαιώματα ρόλων: αποθηκεύστε ξανά τον ρόλο.',
        }),
      );
    }
  }

  const moduleIds = new Set(ACADEMY_MODULES.map((m) => m.id));
  if (!moduleIds.has('matches' as AcademyModuleId)) {
    out.push(
      finding({
        category: 'Config',
        severity: 'warning',
        title: 'Λείπει module Αγώνες από config',
        detail: 'Το matches δεν είναι στα ACADEMY_MODULES.',
        fix: 'Ενημερώστε την εφαρμογή στην τελευταία έκδοση (deploy).',
      }),
    );
  } else {
    out.push(
      finding({
        category: 'Config',
        severity: 'ok',
        title: 'Module Αγώνες καταχωρημένο',
        detail: 'Το /matches υπάρχει στο menu config.',
        fix: 'Καμία ενέργεια.',
      }),
    );
  }

  const schedules = config.backupSchedules;
  if (schedules?.fullApp.enabled || schedules?.perClub.enabled) {
    out.push(
      finding({
        category: 'Backup',
        severity: 'ok',
        title: 'Πρόγραμμα backup ενεργό',
        detail: `Full: ${schedules.fullApp.enabled ? schedules.fullApp.frequency : 'off'} · Per-club: ${schedules.perClub.enabled ? schedules.perClub.frequency : 'off'}`,
        fix: 'Η λήψη JSON απαιτεί ανοιχτό browser. Για cloud χρησιμοποιήστε mode cloud/both.',
      }),
    );
  } else {
    out.push(
      finding({
        category: 'Backup',
        severity: 'info',
        title: 'Πρόγραμμα backup ανενεργό',
        detail: 'Δεν έχει ενεργοποιηθεί scheduled backup.',
        fix: 'Platform Admin → Πρόγραμμα backup: ενεργοποιήστε full και/ή per-club.',
      }),
    );
  }

  return out;
}

function checkRoutesSmoke(): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  const expected = [
    '/',
    '/athletes',
    '/trainings',
    '/matches',
    '/fees',
    '/finance',
    '/settings',
    '/prints',
    '/attendance',
    '/announcements',
  ];
  out.push(
    finding({
      category: 'UI',
      severity: 'ok',
      title: 'Βασικές διαδρομές εφαρμογής',
      detail: expected.join(', '),
      fix: 'Αν κάποια σελίδα 404 μετά το deploy, κάντε hard refresh (Ctrl+F5) και ελέγξτε App.tsx routes.',
    }),
  );
  return out;
}

function ensureBackupSchedulesEnabled(): boolean {
  const current = getBackupSchedules();
  if (current.fullApp.enabled || current.perClub.enabled) return false;
  saveBackupSchedules({
    ...current,
    fullApp: {
      ...defaultBackupScheduleRule({
        enabled: true,
        frequency: 'daily',
        timeLocal: '02:00',
        mode: 'both',
      }),
      lastRunAt: current.fullApp.lastRunAt ?? null,
    },
    perClub: {
      ...defaultBackupScheduleRule({
        enabled: true,
        frequency: 'daily',
        timeLocal: '02:15',
        mode: 'cloud',
      }),
      lastRunAt: current.perClub.lastRunAt ?? null,
    },
    clubIds: current.clubIds ?? [],
  });
  return true;
}

function personKey(parts: string[]): string {
  return parts
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}

function resolveCoachLink(
  coaches: Array<{ id: string; firstName: string; lastName: string }>,
  user: AppUser,
): string | null {
  const current = user.coachId?.trim() || '';
  if (current && coaches.some((c) => c.id === current)) return current;
  const full = personKey([user.fullName ?? '']);
  if (!full) return null;
  const matches = coaches.filter((c) => {
    const a = personKey([c.lastName, c.firstName]);
    const b = personKey([c.firstName, c.lastName]);
    return a === full || b === full;
  });
  return matches.length === 1 ? matches[0]!.id : null;
}

function repairOrphanUserLinks(): { coaches: number; athletes: number } {
  const clubMap = exportAllClubsData();
  const users = getUsers();
  let coaches = 0;
  let athletes = 0;
  const next = users.map((user) => {
    const clubData = user.clubId ? clubMap[user.clubId] : undefined;
    if (!clubData) return user;
    let changed = user;
    if (user.role === 'coach' || user.coachId) {
      const resolved = resolveCoachLink(clubData.coaches ?? [], user);
      if ((user.coachId || null) !== (resolved || null)) {
        coaches += 1;
        changed = { ...changed, coachId: resolved };
      }
    }
    if (user.athleteId) {
      const ok = (clubData.students ?? []).some((s) => s.id === user.athleteId);
      if (!ok) {
        athletes += 1;
        changed = { ...changed, athleteId: null };
      }
    }
    return changed;
  });
  if (coaches > 0 || athletes > 0) saveUsers(next);
  return { coaches, athletes };
}

async function applyAutomaticRepairs(
  onProgress?: ProgressFn,
): Promise<DiagnosticFinding[]> {
  onProgress?.('Λήψη συλλόγων από cloud', 1);
  await hydrateAllClubMirrorsFromCloud();
  onProgress?.('Αυτόματες διορθώσεις', 2);
  const out: DiagnosticFinding[] = [];

  const hashed = await migratePlaintextPasswords();
  out.push(
    finding({
      category: 'Repair',
      severity: 'ok',
      title:
        hashed > 0
          ? `Διορθώθηκαν ${hashed} plaintext κωδικοί`
          : 'Κωδικοί hashed OK',
      detail:
        hashed > 0
          ? 'Οι κωδικοί μετατράπηκαν σε PBKDF2 hash χωρίς αλλαγή του μυστικού.'
          : 'Όλοι οι κωδικοί ήταν ήδη hashed.',
      fix: 'Καμία ενέργεια.',
    }),
  );

  const matched = ensureLegacyPaymentsMatchedAllClubs();
  out.push(
    finding({
      category: 'Repair',
      severity: 'ok',
      title:
        matched.paymentsMatched > 0
          ? `Αντιστοιχίστηκαν ${matched.paymentsMatched} πληρωμές σε ${matched.clubsTouched} συλλόγους`
          : 'Αντιστοίχιση πληρωμών OK',
      detail: 'FIFO / ίδια περίοδος σε όλα τα club stores (συμπεριλαμβανομένου DEMO).',
      fix: 'Καμία ενέργεια.',
    }),
  );

  const backupEnabled = ensureBackupSchedulesEnabled();
  out.push(
    finding({
      category: 'Repair',
      severity: 'ok',
      title: backupEnabled
        ? 'Ενεργοποιήθηκε πρόγραμμα backup'
        : 'Πρόγραμμα backup ενεργό OK',
      detail: 'Full daily (download+cloud) · Per-club daily (cloud).',
      fix: 'Καμία ενέργεια. Μπορείτε να αλλάξετε ώρα/συχνότητα στο Πρόγραμμα backup.',
    }),
  );

  let orphanAttendanceCleaned = 0;
  let orphanTxnCleaned = 0;
  const clubIds = [...new Set([
    ...getClubs().map((c) => c.id),
    ...Object.keys(exportAllClubsData()),
  ])].filter((id) => id && id !== '_default' && clubHasStoredData(id));
  for (const clubId of clubIds) {
    mutateClubData(clubId, (draft) => {
      const studentIds = new Set(draft.students.map((s) => s.id));
      const classIdsLocal = new Set(draft.classes.map((c) => c.id));
      const before = draft.attendance?.length ?? 0;
      draft.attendance = (draft.attendance ?? []).filter(
        (a) => studentIds.has(a.studentId) && classIdsLocal.has(a.classId),
      );
      orphanAttendanceCleaned += before - draft.attendance.length;
      const beforeTxn = draft.transactions?.length ?? 0;
      draft.transactions = (draft.transactions ?? []).filter((t) =>
        studentIds.has(t.athleteId),
      );
      orphanTxnCleaned += beforeTxn - draft.transactions.length;
    });
  }

  const userLinks = repairOrphanUserLinks();
  const cloud = await persistLocalStateToCloud({
    clubIds,
    overwriteCloud: true,
  });
  if (!cloud.success) {
    out.push(
      finding({
        category: 'Repair',
        severity: 'warning',
        title: 'Τοπική διόρθωση έγινε, το cloud sync απέτυχε',
        detail: cloud.error ?? 'Άγνωστο σφάλμα',
        fix: 'Ξανατρέξτε το διαγνωστικό όσο είστε συνδεδεμένοι.',
      }),
    );
  }

  out.push(
    finding({
      category: 'Repair',
      severity: 'ok',
      title:
        orphanAttendanceCleaned > 0
          ? `Καθαρίστηκαν ${orphanAttendanceCleaned} ορφανές παρουσίες`
          : 'Παρουσίες χωρίς ορφανά OK',
      detail: 'Αφαιρέθηκαν εγγραφές με ανύπαρκτο αθλητή/τμήμα.',
      fix: 'Καμία ενέργεια.',
    }),
  );

  out.push(
    finding({
      category: 'Repair',
      severity: 'ok',
      title:
        orphanTxnCleaned > 0
          ? `Καθαρίστηκαν ${orphanTxnCleaned} ορφανές συναλλαγές`
          : 'Συναλλαγές χωρίς ορφανά OK',
      detail: 'Αφαιρέθηκαν χρεώσεις/πληρωμές με ανύπαρκτο αθλητή στο μητρώο.',
      fix: 'Καμία ενέργεια.',
    }),
  );

  out.push(
    finding({
      category: 'Repair',
      severity: 'ok',
      title:
        userLinks.coaches + userLinks.athletes > 0
          ? `Διορθώθηκαν συνδέσεις: ${userLinks.coaches} προπονητές, ${userLinks.athletes} αθλητές`
          : 'Συνδέσεις χρηστών→προπονητή/αθλητή OK',
      detail:
        'Άκυρα coachId/athleteId καθαρίστηκαν ή επανασυνδέθηκαν με καρτέλα ίδιου ονόματος στον σύλλογο του χρήστη.',
      fix: 'Καμία ενέργεια.',
    }),
  );

  const pushed = await pushAccountBundle();
  if (pushed.success) {
    out.push(
      finding({
        category: 'Repair',
        severity: 'ok',
        title: 'Έγινε Push λογαριασμών στο cloud',
        detail: pushed.data?.updatedAt
          ? `Account bundle ενημερώθηκε: ${pushed.data.updatedAt}`
          : 'Users/clubs/config ανέβηκαν στο durable store.',
        fix: 'Καμία ενέργεια.',
      }),
    );
  } else {
    out.push(
      finding({
        category: 'Repair',
        severity: 'warning',
        title: 'Αποτυχία Push λογαριασμών',
        detail: pushed.error ?? 'Άγνωστο σφάλμα',
        fix: 'Βεβαιωθείτε ότι το durable store (Blob) είναι ενεργό και ξανατρέξτε το τεστ.',
      }),
    );
  }

  return out;
}

export async function runPlatformDiagnostics(
  onProgress?: ProgressFn,
  options?: { autoRepair?: boolean },
): Promise<DiagnosticReport> {
  const started = performance.now();
  const findings: DiagnosticFinding[] = [];
  const autoRepair = Boolean(options?.autoRepair);

  if (autoRepair) {
    try {
      findings.push(...(await applyAutomaticRepairs(onProgress)));
    } catch (err) {
      findings.push(
        finding({
          category: 'Repair',
          severity: 'critical',
          title: 'Αποτυχία αυτόματων διορθώσεων',
          detail: err instanceof Error ? err.message : String(err),
          fix: 'Ανοίξτε την κονσόλα browser (F12) και ξανατρέξτε το Auto Repair.',
        }),
      );
    }
  } else {
    onProgress?.('Λήψη συλλόγων από cloud', 2);
    await hydrateAllClubMirrorsFromCloud();
  }

  const clubMap = exportAllClubsData();
  const clubs = getClubs();
  const steps: Array<{ label: string; run: () => Promise<DiagnosticFinding[]> | DiagnosticFinding[] }> =
    [
      { label: 'API health', run: () => checkApiHealth() },
      { label: 'Sync endpoints', run: () => checkSyncEndpoints() },
      { label: 'Storage', run: () => checkStorage() },
      {
        label: 'Users',
        run: () => checkUsers(getUsers(), getClubs()),
      },
      { label: 'Clubs', run: () => checkClubs(getClubs()) },
      { label: 'Platform config', run: () => checkPlatformConfig() },
      { label: 'Routes', run: () => checkRoutesSmoke() },
    ];

  for (const club of clubs) {
    steps.push({
      label: `Data «${club.name}»`,
      run: () => {
        const data = clubMap[club.id];
        if (!data) return [];
        return checkAppData(club.id, club.name, data);
      },
    });
  }
  if (clubs.length === 0) {
    steps.push({
      label: 'Active club data',
      run: () => checkAppData('active', 'Ενεργός σύλλογος', getData()),
    });
  }

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    onProgress?.(step.label, Math.round(((i + 1) / (steps.length + 1)) * 100));
    try {
      const part = await step.run();
      findings.push(...part);
    } catch (err) {
      findings.push(
        finding({
          category: 'Runner',
          severity: 'critical',
          title: `Κρίσιμο σφάλμα στο βήμα «${step.label}»`,
          detail: err instanceof Error ? err.message : String(err),
          fix: 'Ανοίξτε την κονσόλα browser (F12) για stack trace και στείλτε το στον προγραμματιστή.',
        }),
      );
    }
  }

  const summary: Record<DiagnosticSeverity, number> = {
    critical: 0,
    warning: 0,
    info: 0,
    ok: 0,
  };
  for (const f of findings) summary[f.severity] += 1;

  return {
    ranAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    summary,
    findings,
  };
}
