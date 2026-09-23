import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, MoreHorizontal, Plus, RotateCcw, Search, Send } from 'lucide-react';
import * as parentsService from '../api/services/parentsService';
import * as pushService from '../api/services/pushService';
import { sendClubEmail } from '../api/services/emailService';
import { sendClubSms, viberChatUrl } from '../api/services/smsService';
import { getSession } from '../auth/auth';
import { getClubById, getClubSms, getClubSmtp } from '../auth/clubs';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import { getPreviewClubId } from '../platform/platformConfig';
import { downloadXlsx } from '../utils/xlsxDownload';
import { parentAppUrl, portalAppInviteText } from '../utils/parentApp';

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<parentsService.ParentInviteStatus, string> = {
  active: 'Ενεργός',
  pending: 'Πρόσκληση εκκρεμεί',
  not_invited: 'Δεν έχει προσκληθεί',
};

function exportParentsXlsx(rows: parentsService.ParentDirectoryRow[]) {
  downloadXlsx(
    'Γονείς',
    ['Ονοματεπώνυμο', 'Αθλητές', 'Email', 'Κατάσταση'],
    rows.map((row) => [
      row.fullName,
      row.athletes.map((a) => a.label).join(', '),
      row.email || '',
      STATUS_LABELS[row.status],
    ]),
    `goneis-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

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
  const [selected, setSelected] = useState<string[]>([]);
  const [pushIds, setPushIds] = useState<Set<string>>(() => new Set());
  const [pushFilter, setPushFilter] = useState('');
  const [inviting, setInviting] = useState(false);

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

  useEffect(() => {
    if (!clubId) {
      setPushIds(new Set());
      return;
    }
    let cancelled = false;
    void pushService.listPushSubscriberIds(clubId).then((ids) => {
      if (!cancelled) setPushIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, data.parentLinks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (pushFilter === 'on' && !(row.parentUserId && pushIds.has(row.parentUserId))) return false;
      if (pushFilter === 'off' && row.parentUserId && pushIds.has(row.parentUserId)) return false;
      if (teamFilter && !row.classIds.includes(teamFilter)) return false;
      if (!q) return true;
      const hay = `${row.fullName} ${row.email} ${row.athletes.map((a) => a.label).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, statusFilter, teamFilter, pushFilter, pushIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllPage() {
    const ids = pageRows.map((r) => r.key);
    const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((prev) =>
      allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  }

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

  const club = clubId ? getClubById(clubId) : null;
  const appUrl = parentAppUrl();
  const inviteText = portalAppInviteText({
    clubName: club?.name ?? 'TeamSuite',
    kind: 'parent',
    url: appUrl,
  });
  const withPush = rows.filter((row) => row.parentUserId && pushIds.has(row.parentUserId)).length;
  const withoutPush = rows.filter((row) => row.parentUserId && !pushIds.has(row.parentUserId));

  async function sendAppInvite(row: parentsService.ParentDirectoryRow): Promise<string[]> {
    if (!clubId) return [];
    const channels: string[] = [];
    const smtp = getClubSmtp(clubId);
    if (smtp.enabled && row.email.includes('@')) {
      const mail = await sendClubEmail({
        clubId,
        to: row.email,
        subject: `Εφαρμογή γονέα — ${club?.name ?? 'TeamSuite'}`,
        text: inviteText,
        athleteId: row.athletes[0]?.id,
      });
      if (mail.success) channels.push(`email ${row.email}`);
    }
    const sms = getClubSms(clubId);
    if (sms.enabled && row.phones[0]) {
      const sent = await sendClubSms({
        clubId,
        to: row.phones[0],
        text: inviteText,
        athleteId: row.athletes[0]?.id,
      });
      if (sent.success) channels.push(`SMS ${row.phones[0]}`);
    }
    return channels;
  }

  async function handleSendAppLink(row: parentsService.ParentDirectoryRow) {
    setInviting(true);
    setError('');
    const channels = await sendAppInvite(row);
    setInviting(false);
    if (channels.length > 0) {
      setMessage(`Στάλθηκε σύνδεσμος εφαρμογής (${channels.join(', ')}).`);
      return;
    }
    if (row.phones[0]) {
      window.open(viberChatUrl(row.phones[0], inviteText), '_blank');
      setMessage('Άνοιξε Viber για αποστολή. Αν δεν στάλθηκε SMS/email, αντιγράψτε και τον σύνδεσμο.');
      return;
    }
    void navigator.clipboard?.writeText(appUrl);
    setMessage('Δεν υπάρχει SMS/email. Ο σύνδεσμος αντιγράφηκε για αποστολή με το χέρι.');
  }

  async function handleRemindWithoutPush() {
    if (withoutPush.length === 0) {
      setMessage('Όλοι οι ενεργοί γονείς έχουν ειδοποιήσεις, ή δεν υπάρχουν λογαριασμοί.');
      return;
    }
    if (!confirm(`Να σταλεί υπενθύμιση σε ${withoutPush.length} γονείς χωρίς ειδοποιήσεις;`)) return;
    setInviting(true);
    let sent = 0;
    for (const row of withoutPush) {
      const channels = await sendAppInvite(row);
      if (channels.length) sent += 1;
    }
    setInviting(false);
    setMessage(`Υπενθύμιση: στάλθηκε σε ${sent} από ${withoutPush.length}.`);
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
    <div className="parents-page stack-lg">
      <PageHeader
        title="Γονείς"
        subtitle="Διαχείριση γονέων και σύνδεση με αθλητές"
        actions={
          <Button type="button" onClick={() => openInvite()}>
            <Plus size={16} /> Πρόσκληση γονέα
          </Button>
        }
      />

      {message ? <p className="settings-success">{message}</p> : null}

      <section className="panel parent-app-share">
        <p>
          <strong>Εφαρμογή γονέα:</strong>{' '}
          <a href={appUrl} target="_blank" rel="noreferrer">
            {appUrl}
          </a>
        </p>
        <p className="muted">
          {withPush} από {rows.filter((row) => row.parentUserId).length} γονείς με λογαριασμό
          ενεργοποίησαν ειδοποιήσεις. Στείλτε SMS/email ή Viber· στο κινητό: προσθήκη στην αρχική
          οθόνη και μετά «Ενεργοποίηση ειδοποιήσεων».
        </p>
        <div className="parent-app-share-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(appUrl).then(
                () => setMessage('Ο σύνδεσμος αντιγράφηκε.'),
                () => setMessage(appUrl),
              );
            }}
          >
            Αντιγραφή συνδέσμου
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={inviting || withoutPush.length === 0}
            onClick={() => void handleRemindWithoutPush()}
          >
            <Send size={16} /> Υπενθύμιση χωρίς ειδοποιήσεις ({withoutPush.length})
          </Button>
        </div>
      </section>

      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            type="search"
            placeholder="Αναζήτηση γονέα ή email..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Κατάσταση</span>
          <select
            className="field-input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Όλα</option>
            <option value="active">Ενεργός</option>
            <option value="pending">Πρόσκληση εκκρεμεί</option>
            <option value="not_invited">Δεν έχει προσκληθεί</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Ειδοποιήσεις app</span>
          <select
            className="field-input"
            value={pushFilter}
            onChange={(e) => {
              setPushFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Όλα</option>
            <option value="on">Ενεργές</option>
            <option value="off">Χωρίς ειδοποιήσεις</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Ομάδα</span>
          <select
            className="field-input"
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
        <Button type="button" variant="secondary" onClick={resetFilters}>
          <RotateCcw size={16} /> Επαναφορά
        </Button>
        <Button type="button" variant="secondary" onClick={() => exportParentsXlsx(filtered)}>
          <Download size={16} /> Εξαγωγή
        </Button>
      </div>

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
                  <th>
                    <input
                      type="checkbox"
                      checked={
                        pageRows.length > 0 && pageRows.every((r) => selected.includes(r.key))
                      }
                      onChange={toggleAllPage}
                      aria-label="Επιλογή όλων"
                    />
                  </th>
                  <th>Ονοματεπώνυμο</th>
                  <th>Συνδεδεμένοι αθλητές</th>
                  <th>Email</th>
                  <th>Κατάσταση</th>
                  <th>Εφαρμογή</th>
                  <th>Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.key)}
                        onChange={() => toggleSelected(row.key)}
                        aria-label={`Επιλογή ${row.fullName}`}
                      />
                    </td>
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
                    <td>
                      {row.parentUserId && pushIds.has(row.parentUserId) ? (
                        <span className="parents-status parents-status--active">Ειδοποιήσεις OK</span>
                      ) : row.parentUserId ? (
                        <span className="parents-status parents-status--pending">Χωρίς ειδοποιήσεις</span>
                      ) : (
                        <span className="parents-muted">Χωρίς λογαριασμό</span>
                      )}
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
                              <button type="button" onClick={() => void handleSendAppLink(row)}>
                                Σύνδεσμος εφαρμογής
                              </button>
                              <button type="button" onClick={() => void handleDisconnect(row)}>
                                Αποσύνδεση
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="parents-menu-wrap">
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
                          <button
                            type="button"
                            className="parents-invite-btn"
                            disabled={inviting}
                            onClick={() => void handleSendAppLink(row)}
                          >
                            Σύνδεσμος app
                          </button>
                        </div>
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
