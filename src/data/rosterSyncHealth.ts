import * as backendSyncService from '../api/services/backendSyncService';
import { getClubData } from './repository';
import { getLastSyncAt, isClubMirrorDirty } from './clubSync';
import type { AppData } from '../types';

export type RosterCounts = {
  total: number;
  active: number;
  inactive: number;
  trial: number;
  other: number;
};

export type RosterSyncSeverity = 'ok' | 'info' | 'warning' | 'danger';

export type RosterSyncRecommend = 'none' | 'push' | 'pull' | 'do_not_pull';

export type RosterSyncDiagnosis = {
  local: RosterCounts;
  cloud: RosterCounts | null;
  cloudUpdatedAt: string | null;
  lastSyncAt: string | null;
  dirty: boolean;
  severity: RosterSyncSeverity;
  title: string;
  detail: string;
  recommend: RosterSyncRecommend;
};

export function countRoster(data: AppData | undefined | null): RosterCounts {
  const students = data?.students ?? [];
  let active = 0;
  let inactive = 0;
  let trial = 0;
  let other = 0;
  for (const student of students) {
    const status = student.status ?? 'active';
    if (status === 'active') active += 1;
    else if (status === 'inactive') inactive += 1;
    else if (status === 'trial') trial += 1;
    else other += 1;
  }
  return { total: students.length, active, inactive, trial, other };
}

export function formatRosterCounts(counts: RosterCounts): string {
  return `${counts.total} αθλητές · ${counts.active} ενεργοί · ${counts.inactive} ανενεργοί · ${counts.trial} δοκιμαστικοί`;
}

export function diagnoseRosterSync(input: {
  local: AppData | undefined | null;
  cloud: AppData | undefined | null;
  dirty: boolean;
  lastSyncAt: string | null;
  cloudUpdatedAt: string | null;
}): RosterSyncDiagnosis {
  const local = countRoster(input.local);
  const cloud = input.cloud ? countRoster(input.cloud) : null;
  const base = {
    local,
    cloud,
    cloudUpdatedAt: input.cloudUpdatedAt,
    lastSyncAt: input.lastSyncAt,
    dirty: input.dirty,
  };

  if (!cloud) {
    return {
      ...base,
      severity: input.dirty ? 'warning' : 'info',
      title: input.dirty ? 'Το cloud δεν έχει ακόμη αυτό το μητρώο' : 'Δεν βρέθηκε cloud mirror',
      detail: `Αυτός ο browser: ${formatRosterCounts(local)}. Κάντε Push για να το δουν Chrome, Edge και κινητό.`,
      recommend: local.total > 0 ? 'push' : 'none',
    };
  }

  const totalGap = local.total - cloud.total;
  const activeGap = local.active - cloud.active;

  if (totalGap >= 20 || (local.total >= cloud.total * 2 && local.total >= 30) || activeGap >= 10) {
    return {
      ...base,
      severity: 'danger',
      title: 'Αυτός ο browser έχει πληρέστερο μητρώο από το cloud',
      detail: `Εδώ: ${formatRosterCounts(local)}. Cloud: ${formatRosterCounts(cloud)}. Μην κάνετε Pull και μην κάνετε Push από άλλον browser που δείχνει λιγότερους. Κάντε Push από εδώ.`,
      recommend: 'do_not_pull',
    };
  }

  if (totalGap <= -20 || (cloud.total >= local.total * 2 && cloud.total >= 30) || activeGap <= -10) {
    return {
      ...base,
      severity: 'warning',
      title: 'Το cloud έχει πληρέστερο μητρώο από αυτόν τον browser',
      detail: `Εδώ: ${formatRosterCounts(local)}. Cloud: ${formatRosterCounts(cloud)}. Κάντε Pull μόνο αν δεν έχετε τοπικές εισαγωγές που λείπουν από το cloud.`,
      recommend: 'pull',
    };
  }

  if (local.active !== cloud.active || local.inactive !== cloud.inactive) {
    return {
      ...base,
      severity: 'warning',
      title: 'Διαφορά κατάστασης αθλητών μεταξύ browser και cloud',
      detail: `Εδώ: ${formatRosterCounts(local)}. Cloud: ${formatRosterCounts(cloud)}. Ίδιο περίπου πλήθος, διαφορετικοί ενεργοί/ανενεργοί — συνήθως άλλος browser. Push από τον σωστό.`,
      recommend: activeGap > 0 ? 'push' : 'pull',
    };
  }

  if (input.dirty) {
    return {
      ...base,
      severity: 'info',
      title: 'Υπάρχουν τοπικές αλλαγές που δεν έχουν ανέβει',
      detail: `Εδώ: ${formatRosterCounts(local)}. Cloud: ${formatRosterCounts(cloud)}. Θα ανέβουν με το αυτόματο sync ή με Push.`,
      recommend: 'push',
    };
  }

  return {
    ...base,
    severity: 'ok',
    title: 'Το μητρώο συμφωνεί με το cloud',
    detail: `Εδώ και cloud: ${formatRosterCounts(local)}. Chrome και Edge πρέπει να δείχνουν τους ίδιους αριθμούς μετά από Push και ανανέωση.`,
    recommend: 'none',
  };
}

export async function loadRosterSyncDiagnosis(clubId: string): Promise<RosterSyncDiagnosis> {
  const local = getClubData(clubId);
  const dirty = isClubMirrorDirty(clubId);
  const lastSyncAt = getLastSyncAt(clubId);
  const pulled = await backendSyncService.pullClubMirror(clubId);
  if (!pulled.success || !pulled.data?.payload || pulled.data.durable === false) {
    return diagnoseRosterSync({
      local,
      cloud: null,
      dirty,
      lastSyncAt,
      cloudUpdatedAt: null,
    });
  }
  return diagnoseRosterSync({
    local,
    cloud: pulled.data.payload,
    dirty,
    lastSyncAt,
    cloudUpdatedAt: pulled.data.updatedAt ?? null,
  });
}

export const ROSTER_HEALTH_EVENT = 'academyhub-roster-health';

export function notifyRosterHealthChanged(clubId?: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ROSTER_HEALTH_EVENT, { detail: { clubId: clubId ?? null } }));
}
