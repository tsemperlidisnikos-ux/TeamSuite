import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearClubAuditRecords,
  deleteClubAuditRecord,
  fetchClubAudit,
  PLATFORM_AUDIT_CLUB_ID,
  type ClubAuditAction,
  type ClubAuditEvent,
} from '../api/services/clubAuditService';
import { roleLabels, type UserRole } from '../auth/auth';
import { getClubs } from '../auth/clubs';
import { Button } from './ui/Button';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function actionLabel(action: ClubAuditAction): string {
  if (action === 'login') return 'Είσοδος';
  if (action === 'logout') return 'Έξοδος';
  return 'Καταχώρηση';
}

function todayInputValue(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function eventDay(iso: string): string {
  return iso.slice(0, 10);
}

export function ClubAuditLogPanel({
  onSaved,
}: {
  onSaved?: (message: string) => void;
}) {
  const clubs = useMemo(() => getClubs().filter((c) => c.id && c.id !== '_default'), []);
  const [clubId, setClubId] = useState(clubs[0]?.id ?? PLATFORM_AUDIT_CLUB_ID);
  const [day, setDay] = useState(todayInputValue);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ClubAuditEvent[]>([]);
  const [durable, setDurable] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const result = await fetchClubAudit(clubId, 500);
      if (!result.success || !result.data) {
        onSaved?.(result.error ?? 'Αποτυχία φόρτωσης ημερολογίου');
        return;
      }
      setEvents(result.data.events);
      setDurable(result.data.durable);
      onSaved?.(
        result.data.durable
          ? `Φορτώθηκαν ${result.data.events.length} κινήσεις (cloud).`
          : `Φορτώθηκαν ${result.data.events.length} κινήσεις (τοπικά / memory).`,
      );
    } finally {
      setLoading(false);
    }
  }, [clubId, onSaved]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (day && eventDay(e.at) !== day) return false;
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        actionLabel(e.action).toLowerCase().includes(q)
      );
    });
  }, [events, day, query]);

  function downloadDay() {
    const lines = [
      `TeamSuite — ημερολόγιο συλλόγου`,
      `Σύλλογος: ${clubs.find((c) => c.id === clubId)?.name ?? clubId}`,
      `Ημερομηνία: ${day || 'όλες'}`,
      '',
      ...filtered.map(
        (e) =>
          `${formatWhen(e.at)}\t${e.fullName} <${e.email}>\t${roleLabels[e.role as UserRole] ?? e.role}\t${actionLabel(e.action)}\t${e.summary}`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TeamSuite-log-${clubId}-${day || 'all'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const busy = loading || clearing || Boolean(busyId);

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή αυτής της καταγραφής;')) return;
    setBusyId(id);
    const result = await deleteClubAuditRecord(clubId, id);
    setBusyId(null);
    if (!result.success) {
      onSaved?.(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
    onSaved?.('Η καταγραφή διαγράφηκε.');
  }

  async function handleClearClub() {
    const clubName = clubs.find((c) => c.id === clubId)?.name ?? clubId;
    if (
      !confirm(
        `Διαγραφή όλου του ημερολογίου για «${clubName}»; Η ενέργεια δεν αναιρείται.`,
      )
    ) {
      return;
    }
    setClearing(true);
    const result = await clearClubAuditRecords(clubId);
    setClearing(false);
    if (!result.success) {
      onSaved?.(result.error ?? 'Αποτυχία εκκαθάρισης');
      return;
    }
    setEvents([]);
    onSaved?.(
      result.data?.cleared
        ? `Διαγράφηκαν ${result.data.cleared} καταγραφές.`
        : 'Το ημερολόγιο του συλλόγου διαγράφηκε.',
    );
  }

  return (
    <div className="entry-form admin-entry login-activity-panel">
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <label className="field">
          <span className="field-label">Σύλλογος</span>
          <select className="field-input" value={clubId} onChange={(e) => setClubId(e.target.value)}>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={PLATFORM_AUDIT_CLUB_ID}>Πλατφόρμα (PA)</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Ημερομηνία</span>
          <input className="field-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Αναζήτηση</span>
          <input
            className="field-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="όνομα, email, κίνηση"
          />
        </label>
      </div>
      <div className="row-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
          {loading ? 'Φόρτωση…' : 'Ανανέωση'}
        </Button>
        <Button type="button" variant="secondary" disabled={busy || filtered.length === 0} onClick={downloadDay}>
          Λήψη αρχείου ημέρας
        </Button>
        {day ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setDay('')}>
            Όλες οι ημέρες
          </Button>
        ) : null}
        <Button
          type="button"
          variant="danger"
          disabled={busy || events.length === 0}
          onClick={() => void handleClearClub()}
        >
          {clearing ? 'Διαγραφή…' : 'Διαγραφή ημερολογίου'}
        </Button>
      </div>
      {durable === false ? (
        <p className="muted">Το cloud store δεν είναι ενεργό — οι εγγραφές μπορεί να χαθούν στο restart.</p>
      ) : null}
      <p className="muted">
        {filtered.length} εγγραφές{day ? ` για ${day}` : ''}. Μόνο Platform Admin.
      </p>
      <div className="records-table login-activity-scroll">
        <table>
          <thead>
            <tr>
              <th>Ώρα</th>
              <th>Χρήστης</th>
              <th>Κίνηση</th>
              <th>Τι έγινε</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>Δεν υπάρχουν κινήσεις για τα φίλτρα.</td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id}>
                  <td className="login-activity-when">{formatWhen(e.at)}</td>
                  <td>
                    <div className="login-activity-name">{e.fullName}</div>
                    <div className="login-activity-email">
                      {e.email} · {roleLabels[e.role as UserRole] ?? e.role}
                    </div>
                  </td>
                  <td>{actionLabel(e.action)}</td>
                  <td>{e.summary}</td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void handleDelete(e.id)}
                    >
                      {busyId === e.id ? '…' : 'Διαγραφή'}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
