import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearLoginActivityRecords,
  deleteLoginActivityRecord,
  fetchLoginActivity,
  type LoginActivityEvent,
} from '../api/services/loginActivityService';
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

function roleLabel(role: string): string {
  return roleLabels[role as UserRole] ?? role;
}

export function LoginActivityPanel({
  onSaved,
}: {
  onSaved?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [events, setEvents] = useState<LoginActivityEvent[]>([]);
  const [durable, setDurable] = useState<boolean | null>(null);
  const [clubFilter, setClubFilter] = useState('');
  const [query, setQuery] = useState('');

  const clubs = useMemo(() => getClubs(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLoginActivity(150);
      if (!result.success || !result.data) {
        onSaved?.(result.error ?? 'Αποτυχία φόρτωσης ιστορικού εισόδων');
        return;
      }
      setEvents(result.data.events);
      setDurable(result.data.durable);
      onSaved?.(
        result.data.durable
          ? `Φορτώθηκαν ${result.data.events.length} είσοδοι (cloud).`
          : `Φορτώθηκαν ${result.data.events.length} είσοδοι (τοπικά / memory).`,
      );
    } finally {
      setLoading(false);
    }
  }, [onSaved]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (clubFilter && (e.clubId ?? '') !== clubFilter) return false;
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.clubName ?? '').toLowerCase().includes(q) ||
        roleLabel(e.role).toLowerCase().includes(q)
      );
    });
  }, [events, clubFilter, query]);

  const busy = loading || clearing || Boolean(busyId);

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή αυτής της καταγραφής εισόδου;')) return;
    setBusyId(id);
    const result = await deleteLoginActivityRecord(id);
    setBusyId(null);
    if (!result.success) {
      onSaved?.(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
    onSaved?.('Η καταγραφή διαγράφηκε.');
  }

  async function handleClearAll() {
    if (!confirm('Διαγραφή όλου του ιστορικού εισόδων; Η ενέργεια δεν αναιρείται.')) return;
    setClearing(true);
    const result = await clearLoginActivityRecords();
    setClearing(false);
    if (!result.success) {
      onSaved?.(result.error ?? 'Αποτυχία εκκαθάρισης');
      return;
    }
    setEvents([]);
    onSaved?.(
      result.data?.cleared
        ? `Διαγράφηκαν ${result.data.cleared} καταγραφές.`
        : 'Το ιστορικό εισόδων διαγράφηκε.',
    );
  }

  return (
    <div className="entry-form admin-entry login-activity-panel">
      <p className="admin-entry-note">
        Ποιος μπήκε, σε ποιον σύλλογο, ρόλος και ώρα. Αποθηκεύεται στο cloud (Blob/Redis) ώστε να
        φαίνεται από κάθε συσκευή.
        {durable === true ? ' Cloud: ενεργό.' : durable === false ? ' Cloud: ανενεργό.' : ''}
      </p>

      <div className="club-users-grid">
        <label className="field">
          <span>Σύλλογος</span>
          <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}>
            <option value="">Όλοι</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Αναζήτηση</span>
          <input
            type="search"
            value={query}
            placeholder="Όνομα, email…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="admin-entry-actions">
        <Button type="button" onClick={() => void load()} disabled={busy}>
          {loading ? 'Φόρτωση…' : 'Ανανέωση'}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => void handleClearAll()}
          disabled={busy || events.length === 0}
        >
          {clearing ? 'Διαγραφή…' : 'Διαγραφή ιστορικού'}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="admin-entry-note" style={{ marginTop: '0.75rem' }}>
          {loading ? 'Φόρτωση…' : 'Δεν υπάρχουν καταγραφές ακόμα.'}
        </p>
      ) : (
        <div className="records-table login-activity-scroll">
          <table>
            <thead>
              <tr>
                {(['Ώρα', 'Χρήστης', 'Σύλλογος', 'Ρόλος', 'Τύπος', ''] as const).map((label, i) => (
                  <th key={label || `act-${i}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="login-activity-when">{formatWhen(e.at)}</td>
                  <td>
                    <div className="login-activity-name">{e.fullName}</div>
                    <div className="login-activity-email">{e.email}</div>
                  </td>
                  <td>{e.clubName ?? '—'}</td>
                  <td>{roleLabel(e.role)}</td>
                  <td>{e.source === 'impersonate' ? 'Impersonate' : 'Σύνδεση'}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
