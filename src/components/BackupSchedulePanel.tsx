import { useEffect, useMemo, useState } from 'react';
import { getClubs } from '../auth/clubs';
import {
  runBackupScheduleNow,
  readBackupScheduleLog,
  type BackupScheduleLogEntry,
} from '../data/backupScheduleRunner';
import {
  defaultBackupScheduleRule,
  getBackupSchedules,
  saveBackupSchedules,
  type BackupDeliveryMode,
  type BackupFrequency,
  type BackupScheduleRule,
  type PlatformBackupSchedules,
} from '../platform/platformConfig';
import { Button } from './ui/Button';

const WEEKDAYS = [
  { value: 0, label: 'Κυριακή' },
  { value: 1, label: 'Δευτέρα' },
  { value: 2, label: 'Τρίτη' },
  { value: 3, label: 'Τετάρτη' },
  { value: 4, label: 'Πέμπτη' },
  { value: 5, label: 'Παρασκευή' },
  { value: 6, label: 'Σάββατο' },
];

function RuleEditor({
  title,
  hint,
  rule,
  onChange,
}: {
  title: string;
  hint: string;
  rule: BackupScheduleRule;
  onChange: (next: BackupScheduleRule) => void;
}) {
  return (
    <div className="entry-form admin-entry" style={{ marginBottom: '1rem' }}>
      <h4 style={{ margin: '0 0 0.35rem' }}>{title}</h4>
      <p className="admin-entry-note">{hint}</p>

      <label className="admin-check" style={{ maxWidth: 320, marginBottom: '0.65rem' }}>
        <span>Ενεργό</span>
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
        />
      </label>

      <div className="club-users-grid">
        <label className="field">
          <span>Συχνότητα</span>
          <select
            value={rule.frequency}
            onChange={(e) =>
              onChange({ ...rule, frequency: e.target.value as BackupFrequency })
            }
          >
            <option value="daily">Καθημερινά</option>
            <option value="weekly">Εβδομαδιαία</option>
            <option value="monthly">Μηνιαία</option>
          </select>
        </label>

        <label className="field">
          <span>Ώρα (τοπική)</span>
          <input
            type="time"
            value={rule.timeLocal}
            onChange={(e) => onChange({ ...rule, timeLocal: e.target.value || '02:00' })}
          />
        </label>

        {rule.frequency === 'weekly' ? (
          <label className="field">
            <span>Ημέρα</span>
            <select
              value={rule.dayOfWeek ?? 1}
              onChange={(e) => onChange({ ...rule, dayOfWeek: Number(e.target.value) })}
            >
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {rule.frequency === 'monthly' ? (
          <label className="field">
            <span>Ημέρα μήνα</span>
            <input
              type="number"
              min={1}
              max={28}
              value={rule.dayOfMonth ?? 1}
              onChange={(e) =>
                onChange({
                  ...rule,
                  dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value) || 1)),
                })
              }
            />
          </label>
        ) : null}

        <label className="field">
          <span>Τρόπος</span>
          <select
            value={rule.mode}
            onChange={(e) =>
              onChange({ ...rule, mode: e.target.value as BackupDeliveryMode })
            }
          >
            <option value="download">Λήψη αρχείου (JSON)</option>
            <option value="cloud">Cloud mirror (Redis)</option>
            <option value="both">Και τα δύο</option>
          </select>
        </label>
      </div>

      <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
        Τελευταία εκτέλεση: {rule.lastRunAt ?? '—'}
      </p>
    </div>
  );
}

export function BackupSchedulePanel({
  onSaved,
}: {
  onSaved?: (message: string) => void;
}) {
  const clubs = useMemo(() => getClubs(), []);
  const [schedules, setSchedules] = useState<PlatformBackupSchedules>(() =>
    getBackupSchedules(),
  );
  const [log, setLog] = useState<BackupScheduleLogEntry[]>(() => readBackupScheduleLog());
  const [busy, setBusy] = useState<'fullApp' | 'perClub' | null>(null);

  useEffect(() => {
    function refreshLog() {
      setLog(readBackupScheduleLog());
    }
    window.addEventListener('academyhub-backup-schedule-log', refreshLog);
    window.addEventListener('academyhub-platform-updated', () => {
      setSchedules(getBackupSchedules());
    });
    return () => {
      window.removeEventListener('academyhub-backup-schedule-log', refreshLog);
    };
  }, []);

  function handleSave() {
    saveBackupSchedules(schedules);
    onSaved?.(
      'Το πρόγραμμα backup αποθηκεύτηκε. Η αυτόματη εκτέλεση γίνεται όσο είναι ανοιχτή η εφαρμογή.',
    );
  }

  function toggleClub(clubId: string) {
    setSchedules((prev) => {
      const set = new Set(prev.clubIds);
      if (set.has(clubId)) set.delete(clubId);
      else set.add(clubId);
      return { ...prev, clubIds: [...set] };
    });
  }

  async function handleRunNow(kind: 'fullApp' | 'perClub') {
    setBusy(kind);
    saveBackupSchedules(schedules);
    await runBackupScheduleNow(kind);
    setSchedules(getBackupSchedules());
    setLog(readBackupScheduleLog());
    setBusy(null);
    onSaved?.(kind === 'fullApp' ? 'Full backup εκτελέστηκε τώρα.' : 'Backup συλλόγων εκτελέστηκε τώρα.');
  }

  return (
    <div className="entry-form admin-entry">
      <p className="admin-entry-note">
        Ορίστε πότε γίνεται <strong>full backup</strong> της εφαρμογής και πότε backup{' '}
        <strong>δεδομένων κάθε συλλόγου</strong> (χωρίς secrets). Η λήψη JSON απαιτεί ανοιχτό browser
        browser (σύνδεση Platform Admin). Το cloud mirror αποθηκεύει στο Redis/Blob.
      </p>

      <RuleEditor
        title="1. Full backup εφαρμογής"
        hint="Users, clubs, platform config και δεδομένα όλων των συλλόγων."
        rule={schedules.fullApp}
        onChange={(fullApp) => setSchedules((prev) => ({ ...prev, fullApp }))}
      />

      <RuleEditor
        title="2. Backup δεδομένων ανά σύλλογο / χρήστη"
        hint="Ξεχωριστό αντίγραφο για κάθε σύλλογο (ή μόνο τους επιλεγμένους)."
        rule={schedules.perClub}
        onChange={(perClub) => setSchedules((prev) => ({ ...prev, perClub }))}
      />

      <div style={{ marginBottom: '0.85rem' }}>
        <strong>Σύλλογοι για per-club backup</strong>
        <p className="admin-entry-note">Κενή επιλογή = όλοι οι σύλλογοι.</p>
        <div className="admin-check-list" style={{ maxHeight: 220 }}>
          {clubs.length === 0 ? (
            <p className="muted">Δεν υπάρχουν σύλλογοι.</p>
          ) : (
            clubs.map((club) => (
              <label key={club.id} className="admin-check">
                <span>{club.name}</span>
                <input
                  type="checkbox"
                  checked={schedules.clubIds.includes(club.id)}
                  onChange={() => toggleClub(club.id)}
                />
              </label>
            ))
          )}
        </div>
        {schedules.clubIds.length > 0 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSchedules((prev) => ({ ...prev, clubIds: [] }))}
          >
            Καθαρισμός επιλογής (όλοι)
          </Button>
        ) : null}
      </div>

      <div className="admin-entry-actions">
        <Button type="button" onClick={handleSave}>
          Αποθήκευση προγράμματος
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void handleRunNow('fullApp')}
        >
          {busy === 'fullApp' ? 'Εκτέλεση…' : 'Εκτέλεση full τώρα'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void handleRunNow('perClub')}
        >
          {busy === 'perClub' ? 'Εκτέλεση…' : 'Εκτέλεση συλλόγων τώρα'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setSchedules({
              fullApp: defaultBackupScheduleRule({ mode: 'download' }),
              perClub: defaultBackupScheduleRule({ mode: 'cloud' }),
              clubIds: [],
            })
          }
        >
          Επαναφορά προεπιλογών
        </Button>
      </div>

      {log.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <strong>Ιστορικό εκτελέσεων</strong>
          <ul className="stack-sm" style={{ marginTop: '0.5rem' }}>
            {log.slice(0, 8).map((entry, index) => (
              <li key={`${entry.at}-${index}`} className={entry.ok ? '' : 'form-error'}>
                <span className="muted">{entry.at}</span> · {entry.kind}
                {entry.clubId ? ` · ${entry.clubId}` : ''} — {entry.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
