import { useEffect, useId, useState, type ChangeEvent } from 'react';
import * as accountSyncService from '../api/services/accountSyncService';
import * as backendSyncService from '../api/services/backendSyncService';
import { getSession, isPlatformAdmin } from '../auth/auth';
import {
  CLUB_BACKUP_WEEKDAYS,
  datetimeLocalValue,
  defaultOnceDateTime,
  describeClubBackupSchedule,
  prepareClubBackupScheduleForSave,
  type ClubBackupDeliveryMode,
  type ClubBackupScheduleKind,
} from '../auth/clubBackupSchedule';
import { ensureSessionClub, getClubById, updateClubBackupSchedule } from '../auth/clubs';
import { Button } from './ui/Button';
import {
  flushClubMirrorPush,
  getLastSyncAt,
  isAutoSyncEnabled,
  persistLocalStateToCloud,
  setAutoSyncEnabled,
} from '../data/clubSync';
import {
  getClubData,
  replaceClubData,
  replaceData,
  reseedDemoShowcase,
} from '../data/repository';
import { isDemoClubName, markDemoShowcaseApplied } from '../data/demoShowcase';
import { getPreviewClubId } from '../platform/platformConfig';
import {
  assertClubScopedRestore,
  buildClubBackupPayload,
  clubBackupFilenamePrefix,
  downloadBackupJson,
  formatBackupError,
  pickAppDataForRestore,
  confirmClubBackupRestore,
  readBackupFile,
} from '../utils/backupArchive';

function resolveTargetClubId(): string | null {
  const preview = getPreviewClubId();
  if (preview) return preview;
  const session = getSession();
  const ensured = ensureSessionClub(session);
  return ensured?.id ?? session?.clubId ?? null;
}

export function BackupPanel() {
  const fileInputId = useId();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fileLabel, setFileLabel] = useState('Δεν επιλέχθηκε κανένα αρχείο.');
  const [syncing, setSyncing] = useState<'push' | 'pull' | 'accountPush' | 'accountPull' | null>(
    null,
  );
  const [restoring, setRestoring] = useState(false);
  const [, setClubTick] = useState(0);
  const onceDefaults = defaultOnceDateTime();
  const [kind, setKind] = useState<ClubBackupScheduleKind>('once');
  const [dateLocal, setDateLocal] = useState(onceDefaults.dateLocal);
  const [timeLocal, setTimeLocal] = useState(onceDefaults.timeLocal);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [mode, setMode] = useState<ClubBackupDeliveryMode>('download');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const clubId = resolveTargetClubId();
  const club = clubId ? getClubById(clubId) : null;
  const isDemoClub = isDemoClubName(club?.name);
  const autoSync = clubId ? isAutoSyncEnabled(clubId) : false;
  const lastSync = clubId ? getLastSyncAt(clubId) : null;
  const canManageAccounts = isPlatformAdmin();
  const schedule = club?.backupSchedule ?? null;

  useEffect(() => {
    const onClubsUpdated = () => setClubTick((n) => n + 1);
    window.addEventListener('academyhub-clubs-updated', onClubsUpdated);
    return () => window.removeEventListener('academyhub-clubs-updated', onClubsUpdated);
  }, []);

  useEffect(() => {
    const saved = clubId ? getClubById(clubId)?.backupSchedule : null;
    const fallback = defaultOnceDateTime();
    setKind(saved?.kind ?? 'once');
    setDateLocal(saved?.dateLocal ?? fallback.dateLocal);
    setTimeLocal(saved?.timeLocal ?? fallback.timeLocal);
    setDayOfWeek(saved?.dayOfWeek ?? 1);
    setMode(saved?.mode ?? 'download');
  }, [clubId]);

  function flash(ok: string) {
    setError('');
    setMessage(ok);
  }

  function handleBackupExport() {
    const activeClubId = resolveTargetClubId();
    setClubTick((n) => n + 1);
    if (!activeClubId) {
      setError('Δεν βρέθηκε σύλλογος για backup. Κάντε login και ξαναδοκιμάστε.');
      return;
    }
    downloadBackupJson(buildClubBackupPayload(activeClubId), clubBackupFilenamePrefix(activeClubId));
    flash('Το backup JSON κατέβηκε (μόνο δεδομένα αυτού του συλλόγου).');
  }

  async function handlePushMirror() {
    const activeClubId = resolveTargetClubId();
    setClubTick((n) => n + 1);
    if (!activeClubId) {
      setError('Δεν βρέθηκε σύλλογος για συγχρονισμό. Κάντε login και ξαναδοκιμάστε.');
      return;
    }
    setSyncing('push');
    setError('');
    const result = await backendSyncService.pushClubMirror(activeClubId);
    setSyncing(null);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία push');
      return;
    }
    flash(
      `Cloud mirror ενημερώθηκε${result.data?.updatedAt ? ` · ${result.data.updatedAt}` : ''}.`,
    );
    setClubTick((n) => n + 1);
  }

  async function handleToggleAutoSync(enabled: boolean) {
    const activeClubId = resolveTargetClubId();
    setClubTick((n) => n + 1);
    if (!activeClubId) {
      setError('Δεν βρέθηκε σύλλογος.');
      return;
    }
    setAutoSyncEnabled(activeClubId, enabled);
    setClubTick((n) => n + 1);
    if (enabled) {
      setSyncing('push');
      const result = await flushClubMirrorPush(activeClubId);
      setSyncing(null);
      if (!result.success) {
        setError(result.error ?? 'Αποτυχία αρχικού push');
        flash('Το αυτόματο sync ενεργοποιήθηκε, αλλά το πρώτο push απέτυχε.');
        return;
      }
      flash('Αυτόματο cloud sync ενεργό. Τα δεδομένα ανεβαίνουν μετά από κάθε αλλαγή.');
      return;
    }
    flash('Αυτόματο cloud sync απενεργοποιήθηκε.');
  }

  async function handleAccountPush() {
    if (!isPlatformAdmin()) {
      setError('Το push λογαριασμών επιτρέπεται μόνο σε Platform Admin.');
      return;
    }
    setSyncing('accountPush');
    setError('');
    const result = await accountSyncService.pushAccountBundle();
    setSyncing(null);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία push λογαριασμών');
      return;
    }
    flash(
      `Cloud λογαριασμοί ενημερώθηκαν${result.data?.updatedAt ? ` · ${result.data.updatedAt}` : ''}.`,
    );
  }

  async function handleAccountPull() {
    if (!isPlatformAdmin()) {
      setError('Το pull λογαριασμών επιτρέπεται μόνο σε Platform Admin.');
      return;
    }
    const confirmed = window.confirm(
      'Θα αντικατασταθούν οι τοπικοί users/clubs/config από το cloud. Συνέχεια;',
    );
    if (!confirmed) return;
    setSyncing('accountPull');
    setError('');
    const result = await accountSyncService.pullAccountBundle();
    setSyncing(null);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία pull λογαριασμών');
      return;
    }
    accountSyncService.applyAccountBundle(result.data);
    flash('Επαναφορά λογαριασμών από cloud. Ανανέωση…');
    window.setTimeout(() => window.location.reload(), 600);
  }

  async function handlePullMirror() {
    const activeClubId = resolveTargetClubId();
    setClubTick((n) => n + 1);
    if (!activeClubId) {
      setError('Δεν βρέθηκε σύλλογος για συγχρονισμό. Κάντε login και ξαναδοκιμάστε.');
      return;
    }
    const confirmed = window.confirm(
      'Θα αντικατασταθούν τα τοπικά δεδομένα του συλλόγου από το cloud mirror. Συνέχεια;',
    );
    if (!confirmed) return;

    setSyncing('pull');
    setError('');
    const result = await backendSyncService.pullClubMirror(activeClubId);
    setSyncing(null);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία pull');
      return;
    }

    replaceData(result.data.payload);
    flash(
      `Επαναφορά από mirror ολοκληρώθηκε${
        result.data.updatedAt ? ` · ${result.data.updatedAt}` : ''
      }. Ανανέωση σελίδας…`,
    );
    window.setTimeout(() => {
      window.location.reload();
    }, 600);
  }

  function handleSaveSchedule() {
    const activeClubId = resolveTargetClubId();
    setClubTick((n) => n + 1);
    if (!activeClubId) {
      setError('Δεν βρέθηκε σύλλογος για προγραμματισμό backup.');
      return;
    }
    const prepared = prepareClubBackupScheduleForSave({
      enabled: true,
      kind,
      dateLocal,
      timeLocal,
      dayOfWeek,
      mode,
    });
    if (!prepared.ok) {
      setError(prepared.error);
      setMessage('');
      return;
    }
    setSavingSchedule(true);
    const result = updateClubBackupSchedule(activeClubId, prepared.schedule);
    setSavingSchedule(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης προγράμματος.');
      setMessage('');
      return;
    }
    flash(
      prepared.schedule.kind === 'once'
        ? 'Το backup προγραμματίστηκε για την επιλεγμένη ημερομηνία και ώρα.'
        : 'Το επαναλαμβανόμενο backup αποθηκεύτηκε.',
    );
    setClubTick((n) => n + 1);
  }

  function handleDisableSchedule() {
    const activeClubId = resolveTargetClubId();
    if (!activeClubId) {
      setError('Δεν βρέθηκε σύλλογος.');
      return;
    }
    const result = updateClubBackupSchedule(
      activeClubId,
      schedule ? { ...schedule, enabled: false } : null,
    );
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία απενεργοποίησης.');
      return;
    }
    flash('Το προγραμματισμένο backup απενεργοποιήθηκε.');
    setClubTick((n) => n + 1);
  }

  function handleReseedDemo() {
    const activeClubId = resolveTargetClubId();
    if (!activeClubId || !isDemoClubName(getClubById(activeClubId)?.name)) return;
    const confirmed = window.confirm(
      'Θα επαναφορτωθούν τα πλήρη δεδομένα παρουσίασης DEMO (αντικαθιστά τα τρέχοντα). Συνέχεια;',
    );
    if (!confirmed) return;
    const result = reseedDemoShowcase(activeClubId);
    if (!result) {
      setError('Αποτυχία επαναφόρτωσης DEMO δεδομένων.');
      return;
    }
    flash('Τα DEMO δεδομένα παρουσίασης φορτώθηκαν. Ανανέωση σελίδας…');
    window.setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  async function applyBackupFile(file: File) {
    setRestoring(true);
    setError('');
    setMessage('');
    try {
      const activeClubId = resolveTargetClubId();
      setClubTick((n) => n + 1);
      if (!activeClubId) {
        throw new Error(
          'Δεν βρέθηκε ενεργός σύλλογος. Αποσύνδεση → «Είσοδος DEMO παρουσίασης» και ξαναδοκιμάστε.',
        );
      }

      const parsed = await readBackupFile(file);
      assertClubScopedRestore(parsed, activeClubId);
      const clubData = pickAppDataForRestore(parsed, activeClubId);
      if (!clubData) {
        throw new Error('Το backup δεν περιέχει δεδομένα συλλόγου.');
      }

      const targetName = getClubById(activeClubId)?.name ?? activeClubId;
      if (
        !confirmClubBackupRestore({
          payload: parsed,
          targetClubId: activeClubId,
          targetClubName: targetName,
        })
      ) {
        return;
      }

      const expectedStudents = clubData.students?.length ?? 0;
      replaceClubData(activeClubId, clubData);

      if (isDemoClubName(getClubById(activeClubId)?.name)) {
        markDemoShowcaseApplied(activeClubId);
      }

      const verify = getClubData(activeClubId);
      const gotStudents = verify.students?.length ?? 0;

      if (expectedStudents > 0 && gotStudents === 0) {
        throw new Error(
          'Η εγγραφή ολοκληρώθηκε αλλά τα δεδομένα δεν διαβάστηκαν πίσω. Καθαρίστε τα δεδομένα ιστότοπου και δοκιμάστε ξανά.',
        );
      }

      const cloud = await persistLocalStateToCloud({
        clubIds: [activeClubId],
        overwriteCloud: true,
      });
      if (!cloud.success) {
        setError(
          `Επαναφορά τοπικά OK (${gotStudents} αθλητές). Το cloud mirror απέτυχε: ${cloud.error ?? 'άγνωστο'}. Μην κάνετε logout μέχρι να πετύχει «Push mirror».`,
        );
        return;
      }

      flash(
        `Επαναφορά OK στον σύλλογο «${getClubById(activeClubId)?.name ?? activeClubId}»: ` +
          `${gotStudents} αθλητές, ${verify.classes?.length ?? 0} τμήματα. Αποθηκεύτηκε στο cloud. Ανανέωση…`,
      );
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (err) {
      setMessage('');
      setError(formatBackupError(err));
    } finally {
      setRestoring(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setFileLabel('Δεν επιλέχθηκε κανένα αρχείο.');
      return;
    }
    setFileLabel(file.name);
    void applyBackupFile(file);
    event.target.value = '';
  }

  return (
    <section className="panel settings-panel settings-backup">
      <header className="settings-backup-head">
        <h3>Αντίγραφα ασφαλείας</h3>
        <p className="lede">
          Backup και επαναφορά <strong>μόνο</strong> των δεδομένων του ενεργού συλλόγου
          {club ? (
            <>
              {' '}
              (<strong>{club.name}</strong>)
            </>
          ) : null}
          . Δεν περιλαμβάνει άλλους συλλόγους, ούτε κωδικούς SMTP/Viva.
        </p>
      </header>

      <div className="settings-form">
        <div className="settings-form-row settings-backup-block">
          <div className="settings-form-row-label settings-backup-copy">
            <strong>Λήψη backup συλλόγου</strong>
            <p>
              Κατεβάστε JSON με αθλητές, τμήματα, οικονομικά κ.λπ. του συλλόγου σας. Χρησιμοποιείται
              και για μεταφορά μεταξύ συσκευών (localhost ↔ Vercel).
            </p>
          </div>
          <div className="settings-form-row-content settings-backup-panel">
            <Button type="button" className="settings-backup-action" onClick={handleBackupExport}>
              Λήψη JSON
            </Button>
          </div>
        </div>

        <div className="settings-form-row settings-backup-block">
          <div className="settings-form-row-label settings-backup-copy">
            <strong>Προγραμματισμένο backup</strong>
            <p>
              Ορίστε συγκεκριμένη ημερομηνία και ώρα για αυτόματη λήψη των δεδομένων του συλλόγου.
              Το πρόγραμμα εκτελείται όσο η εφαρμογή είναι ανοιχτή στο πρόγραμμα περιήγησης.
            </p>
          </div>
          <div className="settings-form-row-content settings-backup-panel">
            <div className="settings-backup-schedule-fields">
              <label className="field">
                <span>Τύπος</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ClubBackupScheduleKind)}
                >
                  <option value="once">Μία φορά</option>
                  <option value="daily">Κάθε μέρα</option>
                  <option value="weekly">Κάθε εβδομάδα</option>
                </select>
              </label>
              {kind === 'once' ? (
                <label className="field">
                  <span>Ημερομηνία και ώρα</span>
                  <input
                    type="datetime-local"
                    min={datetimeLocalValue()}
                    value={dateLocal && timeLocal ? `${dateLocal}T${timeLocal}` : ''}
                    onChange={(e) => {
                      const [nextDate, nextTime] = e.target.value.split('T');
                      if (nextDate) setDateLocal(nextDate);
                      if (nextTime) setTimeLocal(nextTime.slice(0, 5));
                    }}
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Ώρα</span>
                  <input
                    type="time"
                    value={timeLocal}
                    onChange={(e) => setTimeLocal(e.target.value || '18:00')}
                  />
                </label>
              )}
              {kind === 'weekly' ? (
                <label className="field">
                  <span>Ημέρα</span>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  >
                    {CLUB_BACKUP_WEEKDAYS.map((label, value) => (
                      <option key={label} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="field">
                <span>Τρόπος</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ClubBackupDeliveryMode)}
                >
                  <option value="download">Λήψη JSON</option>
                  <option value="cloud">Cloud mirror</option>
                  <option value="both">JSON και cloud</option>
                </select>
              </label>
            </div>
            <p className="settings-backup-schedule-status">{describeClubBackupSchedule(schedule)}</p>
            <div className="settings-backup-schedule-actions">
              <Button
                type="button"
                className="settings-backup-action"
                disabled={!clubId || savingSchedule}
                onClick={handleSaveSchedule}
              >
                {savingSchedule ? 'Αποθήκευση…' : 'Αποθήκευση προγράμματος'}
              </Button>
              {schedule?.enabled ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="settings-backup-action"
                  onClick={handleDisableSchedule}
                >
                  Απενεργοποίηση
                </Button>
              ) : null}
            </div>
            <p className="settings-hint">
              Αν κλείσετε την εφαρμογή πριν την ώρα, το backup θα γίνει μόλις την ξανανοίξετε (αν η
              ώρα έχει περάσει).
            </p>
          </div>
        </div>

        <div className="settings-form-row settings-backup-block">
          <div className="settings-form-row-label settings-backup-copy">
            <strong>Επαναφορά από backup</strong>
            <p>
              Εφαρμόζει τα δεδομένα στον ενεργό σύλλογο
              {club ? (
                <>
                  {' '}
                  (<strong>{club.name}</strong>)
                </>
              ) : (
                ' (θα χρησιμοποιηθεί ο σύλλογος του λογαριασμού σας)'
              )}
              . Δεν αλλάζει τους λογαριασμούς σύνδεσης. Απορρίπτει πλήρη backup πλατφόρμας. Αν το
              αρχείο είναι άλλου συλλόγου, χρειάζεται δεύτερη επιβεβαίωση (πληκτρολογήστε
              ΜΕΤΑΦΟΡΑ).
            </p>
          </div>
          <div className="settings-form-row-content settings-backup-panel">
            <label
              htmlFor={fileInputId}
              className={`settings-backup-file-btn${restoring ? ' is-disabled' : ''}`}
              aria-disabled={restoring}
              onClick={() => {
                resolveTargetClubId();
                setClubTick((n) => n + 1);
              }}
            >
              {restoring ? 'Επαναφορά…' : 'Επιλογή αρχείου'}
            </label>
            <input
              id={fileInputId}
              type="file"
              accept=".json,application/json,text/json"
              className="settings-backup-file-input"
              disabled={restoring}
              onChange={handleFileChange}
            />
            <span className="settings-backup-file-name">{fileLabel}</span>
            <p className="settings-hint">
              Αν το κουμπί φαίνεται ανενεργό, κάνε login με DEMO και Ctrl+F5.
            </p>
          </div>
        </div>

        <div className="settings-form-row settings-backup-block">
          <div className="settings-form-row-label settings-backup-copy">
            <strong>Cloud sync συλλόγου</strong>
            <p>
              Συγχρονισμός δεδομένων αυτού του συλλόγου μεταξύ συσκευών (όχι αρχειακό backup).
              Το αυτόματο sync είναι ενεργό από προεπιλογή σε όλους τους συλλόγους.
              {lastSync ? (
                <>
                  <br />
                  Τελευταίο sync: {lastSync}
                </>
              ) : null}
            </p>
          </div>
          <div className="settings-form-row-content settings-backup-panel">
            <label className="admin-check" style={{ maxWidth: 280 }}>
              <span>Αυτόματο sync</span>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => void handleToggleAutoSync(e.target.checked)}
              />
            </label>
            <Button
              type="button"
              className="settings-backup-action"
              disabled={syncing !== null}
              onClick={() => void handlePushMirror()}
            >
              {syncing === 'push' ? 'Push…' : 'Push mirror συλλόγου'}
            </Button>
            <Button
              type="button"
              className="settings-backup-action"
              disabled={syncing !== null}
              onClick={() => void handlePullMirror()}
            >
              {syncing === 'pull' ? 'Pull…' : 'Pull / επαναφορά από mirror'}
            </Button>
            {canManageAccounts ? (
              <>
                <Button
                  type="button"
                  className="settings-backup-action"
                  disabled={syncing !== null}
                  onClick={() => void handleAccountPush()}
                >
                  {syncing === 'accountPush' ? 'Push…' : 'Push λογαριασμοί (users/clubs)'}
                </Button>
                <Button
                  type="button"
                  className="settings-backup-action"
                  disabled={syncing !== null}
                  onClick={() => void handleAccountPull()}
                >
                  {syncing === 'accountPull' ? 'Pull…' : 'Pull λογαριασμοί (cloud)'}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {isDemoClub ? (
          <div className="settings-form-row settings-backup-block">
            <div className="settings-form-row-label settings-backup-copy">
              <strong>Δεδομένα παρουσίασης DEMO</strong>
              <p>Επαναφορτώνει το ενσωματωμένο δείγμα παρουσίασης.</p>
            </div>
            <div className="settings-form-row-content settings-backup-panel">
              <Button type="button" className="settings-backup-action" onClick={handleReseedDemo}>
                Επαναφόρτωση DEMO δεδομένων
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}
    </section>
  );
}
