import { useEffect, useMemo, useState } from 'react';
import {
  fetchClubWaitlist,
  updateClubWaitlistStatus,
  type ClubWaitlistEntry,
} from '../api/services/clubWaitlistService';
import { pushAccountBundle, pullAccountBundle, applyAccountBundle } from '../api/services/accountSyncService';
import { getUsers } from '../auth/auth';
import { getClubs, provisionClub, purgeClub } from '../auth/clubs';
import { removeClubStore } from '../data/store';
import { Button } from './ui/Button';

const LEVEL_LABELS: Record<string, string> = {
  academies: 'Ακαδημίες',
  pre: 'Προαγωνιστικό',
  comp: 'Αγωνιστικό',
};

function generatePassword(): string {
  return `ss${Math.random().toString(36).slice(2, 8)}`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: ClubWaitlistEntry['status']): string {
  if (status === 'approved') return 'Εγκρίθηκε';
  if (status === 'rejected') return 'Απορρίφθηκε';
  return 'Εκκρεμεί';
}

function levelsLabel(levels: string[]): string {
  if (!levels.length) return '—';
  return levels.map((id) => LEVEL_LABELS[id] ?? id).join(', ');
}

function resolveClubId(entry: ClubWaitlistEntry): string | null {
  if (entry.clubId) return entry.clubId;
  const name = entry.clubName.trim().toLowerCase();
  const byName = getClubs().find((c) => c.name.trim().toLowerCase() === name);
  if (byName) return byName.id;
  const email = entry.email.trim().toLowerCase();
  const byEmail = getUsers().find(
    (u) => u.email.toLowerCase() === email && u.role === 'admin' && u.clubId,
  );
  return byEmail?.clubId ?? null;
}

export function ClubWaitlistPanel({
  onSaved,
}: {
  onSaved?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ClubWaitlistEntry[]>([]);
  const [durable, setDurable] = useState<boolean | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{
    email: string;
    password: string;
    clubName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const result = await fetchClubWaitlist();
    setLoading(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία φόρτωσης λίστας αναμονής.');
      onSaved?.(result.error ?? 'Αποτυχία φόρτωσης λίστας αναμονής.');
      return;
    }
    setError('');
    setEntries(result.data.entries.filter((e) => e.status !== 'rejected'));
    setDurable(result.data.durable);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    const rank = (status: ClubWaitlistEntry['status']) =>
      status === 'pending' ? 0 : status === 'approved' ? 1 : 2;
    return [...entries].sort((a, b) => {
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [entries]);

  const pendingCount = entries.filter((e) => e.status === 'pending').length;

  function passwordFor(id: string): string {
    return passwords[id] ?? '';
  }

  async function handleApprove(entry: ClubWaitlistEntry) {
    const password = passwordFor(entry.id).trim() || generatePassword();
    if (password.length < 6) {
      onSaved?.('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
      return;
    }
    setBusyId(entry.id);
    setCopied(false);

    const account = await pullAccountBundle();
    if (account.success && account.data) {
      applyAccountBundle(account.data);
    }

    const provisioned = await provisionClub({
      clubName: entry.clubName,
      adminFullName: entry.adminFullName,
      email: entry.email,
      password,
      phone: entry.phone,
      dpaAcceptedAt: entry.dpaAcceptedAt,
    });
    if (!provisioned.success || !provisioned.data) {
      setBusyId(null);
      onSaved?.(provisioned.error ?? 'Αποτυχία δημιουργίας λογαριασμού.');
      return;
    }

    const pushed = await pushAccountBundle();
    const updated = await updateClubWaitlistStatus({
      id: entry.id,
      action: 'approve',
      clubId: provisioned.data.club.id,
    });
    setBusyId(null);

    if (!updated.success) {
      onSaved?.(
        updated.error ??
          'Ο λογαριασμός δημιουργήθηκε, αλλά η λίστα αναμονής δεν ενημερώθηκε.',
      );
    } else if (!pushed.success) {
      onSaved?.(
        'Ο λογαριασμός δημιουργήθηκε τοπικά. Το cloud push απέτυχε — κάντε Push από το Backup.',
      );
    } else {
      onSaved?.(`Εγκρίθηκε ο σύλλογος «${entry.clubName}».`);
    }

    setPasswords((prev) => ({ ...prev, [entry.id]: password }));
    setCreated({
      email: entry.email,
      password,
      clubName: entry.clubName,
    });
    setEntries((prev) =>
      prev.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              status: 'approved',
              approvedAt: new Date().toISOString(),
              clubId: provisioned.data?.club.id ?? null,
            }
          : item,
      ),
    );
  }

  async function handleReject(entry: ClubWaitlistEntry) {
    setError('');
    setBusyId(entry.id);
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    const updated = await updateClubWaitlistStatus({
      id: entry.id,
      action: 'reject',
    });
    setBusyId(null);
    if (!updated.success) {
      const message = updated.error ?? 'Αποτυχία απόρριψης.';
      setError(message);
      onSaved?.(message);
      await load();
      return;
    }
    onSaved?.(`Διαγράφηκε η αίτηση «${entry.clubName}».`);
    await load();
  }

  async function handleDeleteClub(entry: ClubWaitlistEntry) {
    const ok = window.confirm(
      `Διαγραφή συλλόγου «${entry.clubName}»; Θα διαγραφούν ο λογαριασμός admin και τα δεδομένα του συλλόγου.`,
    );
    if (!ok) return;

    setError('');
    setBusyId(entry.id);

    const account = await pullAccountBundle();
    if (account.success && account.data) {
      applyAccountBundle(account.data);
    }

    const clubId = resolveClubId(entry);
    if (clubId) {
      const purged = purgeClub(clubId);
      if (!purged.success) {
        setBusyId(null);
        const message = purged.error ?? 'Αποτυχία διαγραφής συλλόγου.';
        setError(message);
        onSaved?.(message);
        return;
      }
      removeClubStore(clubId);
      const pushed = await pushAccountBundle();
      if (!pushed.success) {
        setBusyId(null);
        const message =
          pushed.error ??
          'Ο σύλλογος διαγράφηκε τοπικά. Το cloud push απέτυχε — κάντε Push από το Backup.';
        setError(message);
        onSaved?.(message);
        return;
      }
    }

    const removed = await updateClubWaitlistStatus({
      id: entry.id,
      action: 'reject',
    });
    setBusyId(null);
    if (!removed.success) {
      const message = removed.error ?? 'Ο σύλλογος διαγράφηκε, αλλά η λίστα δεν ενημερώθηκε.';
      setError(message);
      onSaved?.(message);
      await load();
      return;
    }
    onSaved?.(`Διαγράφηκε ο σύλλογος «${entry.clubName}».`);
    await load();
  }

  async function copyCredentials() {
    if (!created) return;
    const text = `Σύλλογος: ${created.clubName}\nEmail: ${created.email}\nΚωδικός: ${created.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      onSaved?.('Δεν έγινε αντιγραφή. Αντιγράψτε τα στοιχεία χειροκίνητα.');
    }
  }

  return (
    <div className="entry-form admin-entry club-waitlist-panel">
      <p className="admin-entry-note">
        Αιτήσεις από τη δημόσια φόρμα /register. Έγκριση δημιουργεί σύλλογο και admin με τον
        κωδικό που ορίζετε.
        {durable === true ? ' Cloud: ενεργό.' : durable === false ? ' Cloud: ανενεργό.' : ''}
        {pendingCount ? ` Εκκρεμούν ${pendingCount}.` : ''}
      </p>

      {error ? (
        <p className="admin-entry-note" style={{ color: '#f87171' }}>
          {error}
        </p>
      ) : null}

      {created ? (
        <div className="club-waitlist-created">
          <strong>Νέα στοιχεία εισόδου</strong>
          <p>
            {created.clubName}
            <br />
            {created.email}
            <br />
            {created.password}
          </p>
          <Button type="button" variant="secondary" onClick={() => void copyCredentials()}>
            {copied ? 'Αντιγράφηκαν' : 'Αντιγραφή'}
          </Button>
        </div>
      ) : null}

      <div className="admin-entry-actions">
        <Button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Φόρτωση…' : 'Ανανέωση'}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="admin-entry-note" style={{ marginTop: '0.75rem' }}>
          {loading ? 'Φόρτωση…' : 'Δεν υπάρχουν αιτήσεις ακόμα.'}
        </p>
      ) : (
        <div className="records-table login-activity-scroll club-waitlist-scroll">
          <table>
            <thead>
              <tr>
                {(['Ημ/νία', 'Ακαδημία', 'Υπεύθυνος', 'Κατάσταση', 'Κωδικός'] as const).map(
                  (label) => (
                    <th key={label}>{label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr key={entry.id}>
                  <td className="login-activity-when">{formatWhen(entry.createdAt)}</td>
                  <td>
                    <div className="login-activity-name">{entry.clubName}</div>
                    <div className="login-activity-email">
                      {entry.sport} · {levelsLabel(entry.levels)}
                    </div>
                  </td>
                  <td>
                    <div className="login-activity-name">{entry.adminFullName}</div>
                    <div className="login-activity-email">
                      {entry.email}
                      <br />
                      {entry.phone}
                    </div>
                  </td>
                  <td>{statusLabel(entry.status)}</td>
                  <td>
                    {entry.status === 'pending' ? (
                      <div className="club-waitlist-actions">
                        <input
                          type="text"
                          value={passwordFor(entry.id)}
                          placeholder="Κωδικός (min 6)"
                          autoComplete="off"
                          onChange={(e) =>
                            setPasswords((prev) => ({
                              ...prev,
                              [entry.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="club-waitlist-buttons">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busyId === entry.id}
                            onClick={() =>
                              setPasswords((prev) => ({
                                ...prev,
                                [entry.id]: generatePassword(),
                              }))
                            }
                          >
                            Τυχαίος
                          </Button>
                          <Button
                            type="button"
                            disabled={busyId === entry.id}
                            onClick={() => void handleApprove(entry)}
                          >
                            {busyId === entry.id ? '…' : 'Έγκριση'}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            disabled={busyId === entry.id}
                            onClick={() => void handleReject(entry)}
                          >
                            Απόρριψη
                          </Button>
                        </div>
                      </div>
                    ) : entry.status === 'approved' ? (
                      <div className="club-waitlist-actions">
                        <span className="login-activity-email">Λογαριασμός δημιουργήθηκε</span>
                        <div className="club-waitlist-buttons">
                          <Button
                            type="button"
                            variant="danger"
                            disabled={busyId === entry.id}
                            onClick={() => void handleDeleteClub(entry)}
                          >
                            {busyId === entry.id ? '…' : 'Διαγραφή συλλόγου'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="login-activity-email">—</span>
                    )}
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
