import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchClubAudit,
  PLATFORM_AUDIT_CLUB_ID,
  undoClubAuditEvents,
  type ClubAuditAction,
  type ClubAuditEvent,
} from '../api/services/clubAuditService';
import { roleLabels, type UserRole } from '../auth/auth';
import { getClubs } from '../auth/clubs';
import type { ClubAuditChange } from '../data/clubAuditDiff';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

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
  if (action === 'undo') return 'Αναίρεση';
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

const COLLECTION_LABELS: Record<ClubAuditChange['collection'], string> = {
  attendance: 'Παρουσίες',
  trainings: 'Προπονήσεις',
  schedule: 'Πρόγραμμα',
  announcements: 'Ανακοινώσεις',
  matches: 'Αγώνες',
  products: 'Προϊόντα αποθήκης',
  stockMovements: 'Κινήσεις αποθήκης',
  feeChargeTemplates: 'Πρότυπα χρεώσεων',
};

function changeOperation(change: ClubAuditChange): string {
  if (!change.before) return 'Θα αφαιρεθεί η νέα εγγραφή';
  if (!change.after) return 'Θα επανέλθει η διαγραμμένη εγγραφή';
  return 'Θα επανέλθουν οι προηγούμενες τιμές';
}

function changedFields(change: ClubAuditChange): string[] {
  if (!change.before || !change.after) return [];
  const before = change.before as Record<string, unknown>;
  const after = change.after as Record<string, unknown>;
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => key !== 'updatedAt' && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, 12);
}

function previewValue(value: unknown): string {
  if (value == null || value === '') return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
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
  const [actionFilter, setActionFilter] = useState<'all' | ClubAuditAction>('all');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ClubAuditEvent[]>([]);
  const [durable, setDurable] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undoing, setUndoing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [undoReason, setUndoReason] = useState('');
  const [confirmationReady, setConfirmationReady] = useState(false);

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
      setSelected(new Set());
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
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        actionLabel(e.action).toLowerCase().includes(q)
      );
    });
  }, [events, day, query, actionFilter]);

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

  const revertedIds = useMemo(
    () => new Set(events.flatMap((event) => event.revertedEventIds ?? [])),
    [events],
  );
  const canUndo = (event: ClubAuditEvent) =>
    event.action === 'change' && Boolean(event.undo?.changes.length) && !revertedIds.has(event.id);
  const selectedEvents = events.filter((event) => selected.has(event.id) && canUndo(event));
  const selectableFiltered = filtered.filter(canUndo);
  const busy = loading || undoing;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleUndo() {
    if (!selectedEvents.length) return;
    if (!confirmationReady || undoReason.trim().length < 5) return;
    setUndoing(true);
    const result = await undoClubAuditEvents(clubId, selectedEvents, undoReason);
    setUndoing(false);
    if (!result.success) {
      onSaved?.(result.error ?? 'Αποτυχία αναίρεσης');
      return;
    }
    setPreviewOpen(false);
    setConfirmationReady(false);
    setUndoReason('');
    setSelected(new Set());
    onSaved?.(
      `Αναιρέθηκαν ${selectedEvents.length} ${selectedEvents.length === 1 ? 'κίνηση' : 'κινήσεις'}. Snapshot: ${result.data?.snapshotId ?? 'δημιουργήθηκε'}.`,
    );
    await load();
  }

  return (
    <>
    <div className="entry-form admin-entry login-activity-panel">
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
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
          <span className="field-label">Κατηγορία</span>
          <select
            className="field-input"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as 'all' | ClubAuditAction)}
          >
            <option value="all">Όλες</option>
            <option value="change">Καταχωρήσεις</option>
            <option value="undo">Αναιρέσεις</option>
            <option value="login">Είσοδοι</option>
            <option value="logout">Έξοδοι</option>
          </select>
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
          disabled={busy || selectedEvents.length === 0}
          onClick={() => {
            setUndoReason('');
            setConfirmationReady(false);
            setPreviewOpen(true);
          }}
        >
          {undoing ? 'Αναίρεση…' : `Αναίρεση επιλεγμένων (${selectedEvents.length})`}
        </Button>
      </div>
      {durable === false ? (
        <p className="muted">Το cloud store δεν είναι ενεργό — οι εγγραφές μπορεί να χαθούν στο restart.</p>
      ) : null}
      <p className="muted">
        {filtered.length} εγγραφές{day ? ` για ${day}` : ''}. Οι μη αναστρέψιμες κινήσεις
        διατηρούνται στο ιστορικό χωρίς δυνατότητα επιλογής.
      </p>
      <div className="records-table login-activity-scroll">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Επιλογή όλων των αναστρέψιμων κινήσεων"
                  checked={
                    selectableFiltered.length > 0 &&
                    selectableFiltered.every((event) => selected.has(event.id))
                  }
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const event of selectableFiltered) {
                        if (e.target.checked) next.add(event.id);
                        else next.delete(event.id);
                      }
                      return next;
                    })
                  }
                />
              </th>
              <th>Ώρα</th>
              <th>Χρήστης</th>
              <th>Κίνηση</th>
              <th>Τι έγινε</th>
              <th>Αναίρεση</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>Δεν υπάρχουν κινήσεις για τα φίλτρα.</td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Επιλογή κίνησης ${e.summary}`}
                      disabled={busy || !canUndo(e)}
                      checked={selected.has(e.id)}
                      onChange={() => toggleSelected(e.id)}
                    />
                  </td>
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
                    {revertedIds.has(e.id)
                      ? 'Αναιρέθηκε'
                      : canUndo(e)
                        ? 'Διαθέσιμη'
                        : e.undoReason || 'Δεν υποστηρίζεται'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    <Modal
      open={previewOpen}
      title={`Προεπισκόπηση αναίρεσης (${selectedEvents.length})`}
      wide
      onClose={() => {
        if (undoing) return;
        setPreviewOpen(false);
        setConfirmationReady(false);
      }}
      footer={
        confirmationReady ? (
          <>
            <Button type="button" variant="secondary" disabled={undoing} onClick={() => setConfirmationReady(false)}>
              Πίσω
            </Button>
            <Button type="button" variant="danger" disabled={undoing} onClick={() => void handleUndo()}>
              {undoing ? 'Snapshot και αναίρεση…' : 'Οριστική αναίρεση'}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => setPreviewOpen(false)}>
              Άκυρο
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={undoReason.trim().length < 5}
              onClick={() => setConfirmationReady(true)}
            >
              Συνέχεια στην επιβεβαίωση
            </Button>
          </>
        )
      }
    >
      <p className="lede">
        Ελέγξτε τις αλλαγές. Πριν από την εκτέλεση θα δημιουργηθεί υποχρεωτικά cloud snapshot
        του συλλόγου.
      </p>
      <div className="audit-undo-preview">
        {selectedEvents.map((event) => (
          <section key={event.id} className="audit-undo-event">
            <strong>{formatWhen(event.at)} · {event.fullName}</strong>
            <p>{event.summary}</p>
            <ul>
              {(event.undo?.changes ?? []).map((change, index) => {
                const fields = changedFields(change);
                return (
                  <li key={`${event.id}-${change.collection}-${change.entityId}-${index}`}>
                    <strong>{COLLECTION_LABELS[change.collection]}</strong> · {changeOperation(change)}
                    <span className="muted"> · ID {change.entityId}</span>
                    {fields.length ? (
                      <div className="audit-undo-fields">
                        {fields.map((field) => (
                          <div key={field}>
                            <strong>{field}:</strong>{' '}
                            {previewValue((change.after as Record<string, unknown>)[field])}
                            {' → '}
                            {previewValue((change.before as Record<string, unknown>)[field])}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <label className="field">
        <span className="field-label">Υποχρεωτική αιτιολογία αναίρεσης</span>
        <textarea
          className="field-input"
          rows={3}
          value={undoReason}
          disabled={confirmationReady || undoing}
          onChange={(e) => setUndoReason(e.target.value)}
          placeholder="Π.χ. Λανθασμένη μαζική καταχώρηση παρουσιών"
        />
      </label>
      {confirmationReady ? (
        <div className="form-error">
          Δεύτερη επιβεβαίωση: θα αναιρεθούν {selectedEvents.length} κινήσεις. Η πράξη και η
          αιτιολογία θα παραμείνουν στο ιστορικό.
        </div>
      ) : null}
    </Modal>
    </>
  );
}
