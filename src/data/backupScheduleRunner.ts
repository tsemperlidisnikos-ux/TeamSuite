import * as backendSyncService from '../api/services/backendSyncService';
import { getSession, isPlatformAdmin } from '../auth/auth';
import { isClubBackupScheduleDue, type ClubBackupSchedule } from '../auth/clubBackupSchedule';
import { getClubs, updateClubBackupSchedule, type Club } from '../auth/clubs';
import { getClubData } from '../data/repository';
import {
  getBackupSchedules,
  saveBackupSchedules,
  type BackupScheduleRule,
  type PlatformBackupSchedules,
} from '../platform/platformConfig';
import {
  buildBackupPayload,
  buildClubBackupPayload,
  clubBackupFilenamePrefix,
  downloadBackupJson,
} from '../utils/backupArchive';
import { localDateTimeIso } from '../utils/dates';

const LOG_KEY = 'academyhub-backup-schedule-log-v1';
const MAX_LOG = 40;

export type BackupScheduleLogEntry = {
  at: string;
  kind: 'fullApp' | 'perClub' | 'club';
  clubId?: string;
  message: string;
  ok: boolean;
};

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localNowParts() {
  const now = new Date();
  return {
    now,
    timeLocal: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    dayOfWeek: now.getDay(),
    dayOfMonth: now.getDate(),
    dayKey: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

function lastRunDayKey(lastRunAt?: string | null): string | null {
  if (!lastRunAt) return null;
  const d = new Date(lastRunAt);
  if (Number.isNaN(d.getTime())) return lastRunAt.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True αν ο κανόνας πρέπει να τρέξει τώρα (τοπική ώρα). */
export function isBackupScheduleDue(rule: BackupScheduleRule): boolean {
  if (!rule.enabled) return false;
  const { timeLocal, dayOfWeek, dayOfMonth, dayKey } = localNowParts();
  if (rule.timeLocal !== timeLocal) return false;
  if (lastRunDayKey(rule.lastRunAt) === dayKey) return false;

  if (rule.frequency === 'weekly') {
    return dayOfWeek === (rule.dayOfWeek ?? 1);
  }
  if (rule.frequency === 'monthly') {
    return dayOfMonth === (rule.dayOfMonth ?? 1);
  }
  return true;
}

export function readBackupScheduleLog(): BackupScheduleLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BackupScheduleLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendLog(entry: BackupScheduleLogEntry) {
  const next = [entry, ...readBackupScheduleLog()].slice(0, MAX_LOG);
  localStorage.setItem(LOG_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('academyhub-backup-schedule-log'));
}

function markRuleRun(
  schedules: PlatformBackupSchedules,
  key: 'fullApp' | 'perClub',
): PlatformBackupSchedules {
  const at = localDateTimeIso();
  const next: PlatformBackupSchedules = {
    ...schedules,
    [key]: { ...schedules[key], lastRunAt: at },
  };
  saveBackupSchedules(next);
  return next;
}

async function runFullAppBackup(rule: BackupScheduleRule) {
  if (!isPlatformAdmin()) {
    appendLog({
      at: localDateTimeIso(),
      kind: 'fullApp',
      ok: false,
      message: 'Full backup απαιτεί σύνδεση Platform Admin.',
    });
    return;
  }
  try {
    if (rule.mode === 'download' || rule.mode === 'both') {
      const name = downloadBackupJson(buildBackupPayload(), 'academyhub-full-backup');
      appendLog({
        at: localDateTimeIso(),
        kind: 'fullApp',
        ok: true,
        message: `Λήψη full backup: ${name}`,
      });
    }
    if (rule.mode === 'cloud' || rule.mode === 'both') {
      const clubs = getClubs();
      let ok = 0;
      for (const club of clubs) {
        // Ensure club bucket is readable, then push mirror.
        void getClubData(club.id);
        const result = await backendSyncService.pushClubMirror(club.id);
        if (result.success) ok += 1;
      }
      appendLog({
        at: localDateTimeIso(),
        kind: 'fullApp',
        ok: ok > 0,
        message: `Cloud mirror όλων των συλλόγων: ${ok}/${clubs.length}`,
      });
    }
  } catch (err) {
    appendLog({
      at: localDateTimeIso(),
      kind: 'fullApp',
      ok: false,
      message: err instanceof Error ? err.message : 'Αποτυχία full backup',
    });
  }
}

async function runPerClubBackups(rule: BackupScheduleRule, clubIds: string[]) {
  const clubs = getClubs();
  const selected =
    clubIds.length > 0 ? clubs.filter((c) => clubIds.includes(c.id)) : clubs;
  const session = getSession();

  // Club admin: μόνο ο δικός του σύλλογος.
  const targets =
    isPlatformAdmin()
      ? selected
      : selected.filter((c) => c.id === session?.clubId);

  for (const club of targets) {
    try {
      if (rule.mode === 'download' || rule.mode === 'both') {
        const name = downloadBackupJson(
          buildClubBackupPayload(club.id),
          clubBackupFilenamePrefix(club.id),
        );
        appendLog({
          at: localDateTimeIso(),
          kind: 'perClub',
          clubId: club.id,
          ok: true,
          message: `${club.name}: λήψη ${name}`,
        });
      }
      if (rule.mode === 'cloud' || rule.mode === 'both') {
        void getClubData(club.id);
        const result = await backendSyncService.pushClubMirror(club.id);
        appendLog({
          at: localDateTimeIso(),
          kind: 'perClub',
          clubId: club.id,
          ok: Boolean(result.success),
          message: result.success
            ? `${club.name}: cloud mirror OK`
            : `${club.name}: ${result.error ?? 'αποτυχία mirror'}`,
        });
      }
    } catch (err) {
      appendLog({
        at: localDateTimeIso(),
        kind: 'perClub',
        clubId: club.id,
        ok: false,
        message: `${club.name}: ${err instanceof Error ? err.message : 'σφάλμα'}`,
      });
    }
  }
}

async function runClubScheduledBackup(club: Club, schedule: ClubBackupSchedule) {
  try {
    if (schedule.mode === 'download' || schedule.mode === 'both') {
      const name = downloadBackupJson(
        buildClubBackupPayload(club.id),
        clubBackupFilenamePrefix(club.id),
      );
      appendLog({
        at: localDateTimeIso(),
        kind: 'club',
        clubId: club.id,
        ok: true,
        message: `${club.name}: προγραμματισμένη λήψη ${name}`,
      });
    }
    if (schedule.mode === 'cloud' || schedule.mode === 'both') {
      void getClubData(club.id);
      const result = await backendSyncService.pushClubMirror(club.id);
      appendLog({
        at: localDateTimeIso(),
        kind: 'club',
        clubId: club.id,
        ok: Boolean(result.success),
        message: result.success
          ? `${club.name}: προγραμματισμένο cloud mirror OK`
          : `${club.name}: ${result.error ?? 'αποτυχία mirror'}`,
      });
    }
  } catch (err) {
    appendLog({
      at: localDateTimeIso(),
      kind: 'club',
      clubId: club.id,
      ok: false,
      message: `${club.name}: ${err instanceof Error ? err.message : 'σφάλμα'}`,
    });
    return;
  }

  const at = localDateTimeIso();
  const next: ClubBackupSchedule =
    schedule.kind === 'once'
      ? { ...schedule, enabled: false, lastRunAt: at, completedAt: at }
      : { ...schedule, lastRunAt: at };
  updateClubBackupSchedule(club.id, next);
}

async function tickClubBackupSchedules(): Promise<void> {
  const session = getSession();
  if (!session) return;
  const clubs = getClubs();
  const targets = isPlatformAdmin()
    ? clubs
    : clubs.filter((club) => club.id === session.clubId);

  for (const club of targets) {
    const schedule = club.backupSchedule;
    if (!schedule || !isClubBackupScheduleDue(schedule)) continue;
    await runClubScheduledBackup(club, schedule);
  }
}

export async function tickBackupSchedules(): Promise<void> {
  if (running) return;
  if (!getSession()) return;
  running = true;
  try {
    let schedules = getBackupSchedules();
    if (isBackupScheduleDue(schedules.fullApp)) {
      await runFullAppBackup(schedules.fullApp);
      schedules = markRuleRun(schedules, 'fullApp');
    }
    if (isBackupScheduleDue(schedules.perClub)) {
      await runPerClubBackups(schedules.perClub, schedules.clubIds);
      markRuleRun(schedules, 'perClub');
    }
    await tickClubBackupSchedules();
  } finally {
    running = false;
  }
}

/** Manual run από Platform Admin UI. */
export async function runBackupScheduleNow(kind: 'fullApp' | 'perClub') {
  const schedules = getBackupSchedules();
  if (kind === 'fullApp') {
    await runFullAppBackup(schedules.fullApp);
    markRuleRun(schedules, 'fullApp');
    return;
  }
  await runPerClubBackups(schedules.perClub, schedules.clubIds);
  markRuleRun(schedules, 'perClub');
}

export function startBackupScheduleRunner(): void {
  if (timer) return;
  void tickBackupSchedules();
  timer = setInterval(() => {
    void tickBackupSchedules();
  }, 30_000);
}

export function stopBackupScheduleRunner(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
