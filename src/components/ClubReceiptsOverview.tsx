import { useMemo, useState } from 'react';
import { getClubs } from '../auth/clubs';
import { hydrateAllClubMirrorsFromCloud } from '../data/clubSync';
import { exportAllClubsData } from '../data/repository';
import { formatCurrency, formatDate } from '../utils/labels';
import { normalizeReceiptIssues } from '../utils/receiptBook';
import { describeReceiptIssue, receiptKindLabel } from '../utils/receiptIssueView';
import { Button } from './ui/Button';

export function ClubReceiptsOverview() {
  const clubs = getClubs();
  const [clubId, setClubId] = useState(clubs[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);

  const map = useMemo(() => exportAllClubsData(), [tick, loading]);
  const data = clubId ? map[clubId] : undefined;
  const rows = useMemo(
    () =>
      normalizeReceiptIssues(data?.receiptIssues)
        .map((row) => describeReceiptIssue(row, data!))
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.number - a.number),
    [data],
  );

  async function pullCloud() {
    setLoading(true);
    setMessage('');
    try {
      await hydrateAllClubMirrorsFromCloud();
      setTick((n) => n + 1);
      setMessage('Φορτώθηκαν τα μητρώα από το cloud.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Αποτυχία φόρτωσης cloud.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="entry-form admin-entry">
      <p className="admin-entry-note">
        Οι αποδείξεις ανήκουν στο μητρώο του συλλόγου (όχι στον χρήστη που τις έκοψε). Αν τις βλέπει
        μόνο ένα PC, δεν είχαν ανέβει στο cloud ή τις έσβησε άδειο push άλλης συσκευής. Πατήστε
        «Φόρτωση από cloud» και επιλέξτε σύλλογο. Ο χρήστης που τις έκοψε πρέπει να ανοίξει την
        εφαρμογή μία φορά μετά το deploy ώστε να ανέβουν.
      </p>
      <div className="admin-entry-actions">
        <label className="field" style={{ minWidth: 260 }}>
          <span>Σύλλογος</span>
          <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name} ({normalizeReceiptIssues(map[club.id]?.receiptIssues).length})
              </option>
            ))}
          </select>
        </label>
        <Button type="button" disabled={loading} onClick={() => void pullCloud()}>
          {loading ? 'Φόρτωση…' : 'Φόρτωση από cloud'}
        </Button>
      </div>
      {message ? <p className="settings-hint">{message}</p> : null}
      <p className="muted">
        {rows.length} αποδείξεις στο επιλεγμένο μητρώο
        {rows.length ? ` · σύνολο ${formatCurrency(rows.reduce((s, r) => s + (r.amount || 0), 0))}` : ''}
      </p>
      {rows.length === 0 ? (
        <p className="muted">Δεν υπάρχουν αποδείξεις σε αυτό το αντίγραφο του συλλόγου.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ημερομηνία</th>
                <th>Απόδειξη</th>
                <th>Παραλήπτης</th>
                <th>Αιτιολογία</th>
                <th>Ποσό</th>
                <th>Κατάσταση</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.issuedDate ? formatDate(row.issuedDate) : '—'}</td>
                  <td>{row.label}</td>
                  <td>{row.receivedFrom || '—'}</td>
                  <td>
                    {receiptKindLabel(row.kind)}
                    {row.reason ? ` · ${row.reason}` : ''}
                  </td>
                  <td>{row.amount ? formatCurrency(row.amount) : '—'}</td>
                  <td>{row.voidedAt ? 'Ακυρωμένη' : 'Εκδοθείσα'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
