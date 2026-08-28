import { useCallback, useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, RotateCcw, Search, Send, Users } from 'lucide-react';
import * as parentsService from '../api/services/parentsService';
import { getSession } from '../auth/auth';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAppData } from '../hooks/useAppData';
import { getPreviewClubId } from '../platform/platformConfig';

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<parentsService.ParentInviteStatus, string> = {
  active: 'Ενεργός',
  pending: 'Πρόσκληση εκκρεμεί',
  not_invited: 'Δεν έχει προσκληθεί',
};

function generatePassword(): string {
  return `gon${Math.random().toString(36).slice(2, 8)}`;
}

export function ParentsPage() {
  const { data, refresh } = useAppData();
  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;

  const [rows, setRows] = useState<parentsService.ParentDirectoryRow[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generatePassword);
  const [athleteId, setAthleteId] = useState('');
  const [inviteOnly, setInviteOnly] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadError, setLoadError] = useState('');

  const athletes = useMemo(
    () =>
      [...(data.students ?? [])]
        .filter((s) => s.status !== 'inactive')
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
        ),
    [data.students],
  );

  const loadRows = useCallback(async () => {
    setLoadError('');
    if (!clubId) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    const result = await parentsService.listParentDirectory(clubId);
    if (result.success) {
      setRows(result.data ?? []);
    } else {
      setRows([]);
      setLoadError(result.error ?? 'Αποτυχία φόρτωσης γονέων.');
    }
    setLoadingRows(false);
  }, [clubId]);

  useEffect(() => {
    void loadRows();
  }, [data.parentLinks, data.students, loadRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (teamFilter && !row.classIds.includes(teamFilter)) return false;
      if (!q) return true;
      const hay = `${row.fullName} ${row.email} ${row.athletes.map((a) => a.label).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, statusFilter, teamFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  function resetFilters() {
    setQuery('');
    setStatusFilter('');
    setTeamFilter('');
    setPage(1);
  }

  function openInvite(prefill?: { fullName?: string; email?: string; athleteId?: string }) {
    setFullName(prefill?.fullName ?? '');
    setEmail(prefill?.email ?? '');
    setPassword(generatePassword());
    setAthleteId(prefill?.athleteId ?? athletes[0]?.id ?? '');
    setInviteOnly(!prefill?.athleteId && !prefill?.email);
    setError('');
    setMessage('');
    setMenuKey(null);
    setOpen(true);
  }

  async function handleSave() {
    if (!clubId) return;
    setSaving(true);
    setError('');
    setMessage('');

    const result =
      inviteOnly || !athleteId
        ? await parentsService.inviteParent({
            clubId,
            fullName,
            email,
            password,
            athleteId: athleteId || null,
          })
        : await parentsService.connectParent({
            clubId,
            fullName,
            email,
            password,
            athleteId,
          });

    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setOpen(false);
    setMessage(
      inviteOnly || !athleteId
        ? 'Η πρόσκληση καταχωρήθηκε (εκκρεμεί ενεργοποίηση).'
        : 'Ο γονέας συνδέθηκε με τον αθλητή.',
    );
    refresh();
    await loadRows();
  }

  async function handleDisconnect(row: parentsService.ParentDirectoryRow) {
    if (!clubId || row.linkIds.length === 0) return;
    if (!confirm('Αποσύνδεση γονέα από τους συνδεδεμένους αθλητές;')) return;
    await parentsService.disconnectAllParentLinks(clubId, row.linkIds);
    setMenuKey(null);
    refresh();
    await loadRows();
  }

  if (!clubId) {
    return <p className="form-error">Δεν βρέθηκε σύλλογος για τον λογαριασμό.</p>;
  }

  return (
    <div className="parents-page">
      <section className="parents-hero panel">
        <div className="parents-hero-copy">
          <span className="parents-hero-icon" aria-hidden>
            <Users size={22} />
          </span>
          <div>
            <h1>Γονείς</h1>
            <p>
              Διαχείριση γονέων και σύνδεση με αθλητές. Προσκαλέστε γονείς για πρόσβαση στην
              εφαρμογή.
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => openInvite()}>
          + Πρόσκληση Γονέα
        </Button>
      </section>

      {message ? <p className="settings-success">{message}</p> : null}

      <section className="parents-filters panel">
        <label className="parents-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Αναζήτηση γονέα ή email"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>

        <label className="parents-filter-field">
          <span>Κατάσταση</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Όλες</option>
            <option value="active">Ενεργός</option>
            <option value="pending">Πρόσκληση εκκρεμεί</option>
            <option value="not_invited">Δεν έχει προσκληθεί</option>
          </select>
        </label>

        <label className="parents-filter-field">
          <span>Ομάδα</span>
          <select
            value={teamFilter}
            onChange={(e) => {
              setTeamFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Όλες</option>
            {data.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
                {cls.ageGroup ? ` · ${cls.ageGroup}` : ''}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="parents-reset" onClick={resetFilters}>
          <RotateCcw size={15} /> Επαναφορά
        </button>
      </section>

      <section className="parents-table-card panel">
        {loadingRows ? (
          <p className="parents-empty">Φόρτωση γονέων…</p>
        ) : loadError ? (
          <p className="form-error">{loadError}</p>
        ) : pageRows.length === 0 ? (
          <p className="parents-empty">Δεν υπάρχουν γονείς με αυτά τα κριτήρια.</p>
        ) : (
          <div className="table-wrap parents-table-wrap">
            <table className="parents-table">
              <thead>
                <tr>
                  <th>Ονοματεπώνυμο</th>
                  <th>Συνδεδεμένοι αθλητές</th>
                  <th>Email</th>
                  <th>Κατάσταση</th>
                  <th>Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.fullName}</strong>
                    </td>
                    <td>
                      {row.athletes.length === 0 ? (
                        <span className="parents-muted">—</span>
                      ) : (
                        <ul className="parents-athletes">
                          {row.athletes.map((athlete) => (
                            <li key={athlete.id}>{athlete.label}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>{row.email || <span className="parents-muted">Χωρίς email</span>}</td>
                    <td>
                      <span className={`parents-status parents-status--${row.status}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="parents-actions">
                      {row.status === 'active' ? (
                        <div className="parents-menu-wrap">
                          <button
                            type="button"
                            className="parents-menu-btn"
                            aria-label="Ενέργειες"
                            onClick={() => setMenuKey(menuKey === row.key ? null : row.key)}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {menuKey === row.key ? (
                            <div className="parents-menu">
                              <button
                                type="button"
                                onClick={() =>
                                  openInvite({
                                    fullName: row.fullName,
                                    email: row.email,
                                    athleteId: row.athletes[0]?.id,
                                  })
                                }
                              >
                                Νέα σύνδεση
                              </button>
                              <button type="button" onClick={() => void handleDisconnect(row)}>
                                Αποσύνδεση
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="parents-invite-btn"
                          disabled={!row.email}
                          onClick={() =>
                            openInvite({
                              fullName: row.fullName,
                              email: row.email,
                              athleteId: row.athletes[0]?.id,
                            })
                          }
                        >
                          <Send size={14} /> Αποστολή πρόσκλησης
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="parents-pager">
          <span>
            Εμφανίζονται {from} έως {to} από {filtered.length} εγγραφές
          </span>
          <div className="parents-pager-btns">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Προηγούμενη σελίδα"
            >
              ‹
            </button>
            <button type="button" className="is-active" aria-current="page">
              {safePage}
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Επόμενη σελίδα"
            >
              ›
            </button>
          </div>
        </div>
      </section>

      <Modal
        open={open}
        title="Πρόσκληση γονέα"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {inviteOnly ? 'Αποστολή πρόσκλησης' : 'Αποθήκευση'}
            </Button>
          </>
        }
      >
        <div className="stack-md">
          <label className="field">
            <span className="field-label">Ονοματεπώνυμο γονέα</span>
            <input
              className="field-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Κωδικός</span>
            <input
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Αθλητής (προαιρετικό για πρόσκληση)</span>
            <select
              className="field-input"
              value={athleteId}
              onChange={(e) => {
                setAthleteId(e.target.value);
                setInviteOnly(!e.target.value);
              }}
            >
              <option value="">Μόνο πρόσκληση…</option>
              {athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.lastName} {athlete.firstName}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
