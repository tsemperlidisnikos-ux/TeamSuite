import { useMemo, useState } from 'react';
import { getUsers, isPlatformAdmin, roleLabels, type UserRole } from '../auth/auth';
import { isPasswordHashed } from '../auth/password';
import { getClubs } from '../auth/clubs';
import { PlatformAdminShell } from '../components/layout/PlatformAdminShell';
import { downloadXlsx } from '../utils/xlsxDownload';

interface ClubUserCredentialRow {
  id: string;
  lastName: string;
  firstName: string;
  email: string;
  username: string;
  password: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
}

function splitFullName(fullName: string): { lastName: string; firstName: string } {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return { lastName: '', firstName: '' };
  if (tokens.length === 1) return { lastName: tokens[0], firstName: '' };
  return {
    lastName: tokens[0],
    firstName: tokens.slice(1).join(' '),
  };
}

function resolvePassword(user: {
  password: string;
  passwordReveal?: string;
}): string {
  const reveal = (user.passwordReveal ?? '').trim();
  if (reveal) return reveal;
  if (user.password && !isPasswordHashed(user.password)) return user.password;
  return '';
}

function buildRows(clubId: string | null): ClubUserCredentialRow[] {
  if (!clubId) return [];
  return getUsers()
    .filter((u) => u.role !== 'platform_admin' && (u.clubId ?? null) === clubId)
    .map((u) => {
      const parts = splitFullName(u.fullName || '');
      const email = (u.email || '').trim();
      return {
        id: u.id,
        lastName: parts.lastName,
        firstName: parts.firstName,
        email,
        username: email,
        password: resolvePassword(u),
        role: u.role,
        roleLabel: roleLabels[u.role] ?? u.role,
        active: u.active,
      };
    })
    .sort((a, b) => {
      const byLast = a.lastName.localeCompare(b.lastName, 'el');
      if (byLast !== 0) return byLast;
      return a.firstName.localeCompare(b.firstName, 'el');
    });
}

export function PlatformClubUsersPage() {
  const clubs = useMemo(() => getClubs().slice().sort((a, b) => a.name.localeCompare(b.name, 'el')), []);
  const [clubId, setClubId] = useState<string>(() => clubs[0]?.id ?? '');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => buildRows(clubId || null), [clubId]);
  const clubName = clubs.find((c) => c.id === clubId)?.name ?? '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.lastName.toLowerCase().includes(q) ||
        row.firstName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.username.toLowerCase().includes(q) ||
        row.roleLabel.toLowerCase().includes(q),
    );
  }, [rows, query]);

  if (!isPlatformAdmin()) {
    return null;
  }

  function exportXlsx() {
    if (!clubId || rows.length === 0) return;
    const safe = (clubName || clubId).replace(/[^\w.\-Α-Ωα-ωΆ-Ώά-ώ ]+/gu, '_').trim() || 'club';
    downloadXlsx(
      'Χρήστες',
      ['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'EMAIL', 'USERNAME', 'PASSWORD'],
      rows.map((r) => [r.lastName, r.firstName, r.email, r.username, r.password]),
      `club-users-${safe}.xlsx`,
    );
  }

  return (
    <PlatformAdminShell
      title="Χρήστες συλλόγου"
      lede="Κατάλογος χρηστών ανά σύλλογο (μόνο Platform Admin). Εξαγωγή XLSX: ΕΠΩΝΥΜΟ, ΟΝΟΜΑ, EMAIL, USERNAME, PASSWORD."
    >
      <section className="admin-zone">
        <div className="admin-zone-stack" style={{ gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
            <label style={{ minWidth: '16rem', flex: 1 }}>
              <span className="field-label">Σύλλογος</span>
              <select
                className="input"
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
              >
                {clubs.length === 0 ? <option value="">Δεν υπάρχουν σύλλογοι</option> : null}
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ minWidth: '14rem', flex: 1 }}>
              <span className="field-label">Αναζήτηση</span>
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Επώνυμο, email…"
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!clubId || rows.length === 0}
              onClick={exportXlsx}
            >
              Εξαγωγή XLSX
            </button>
          </div>

          <p className="platform-admin-banner" style={{ margin: 0 }}>
            Οι κωδικοί εμφανίζονται μόνο στον Platform Admin. Αν λείπει κάποιος, θα εμφανιστεί μετά
            την επόμενη είσοδο ή αλλαγή κωδικού του χρήστη.
          </p>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Επώνυμο</th>
                  <th>Όνομα</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th>Ρόλος</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      {clubId
                        ? 'Δεν βρέθηκαν χρήστες για αυτόν τον σύλλογο.'
                        : 'Επιλέξτε σύλλογο.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id}>
                      <td>{row.lastName || '—'}</td>
                      <td>{row.firstName || '—'}</td>
                      <td>{row.email || '—'}</td>
                      <td>{row.username || '—'}</td>
                      <td>{row.password || '—'}</td>
                      <td>
                        {row.roleLabel}
                        {!row.active ? (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#b91c1c' }}>
                            ανενεργός
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {clubName ? (
            <p className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
              {filtered.length} / {rows.length} χρήστες · {clubName}
            </p>
          ) : null}
        </div>
      </section>
    </PlatformAdminShell>
  );
}
