import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import * as cashAccountsService from '../api/services/cashAccountsService';
import * as financePeriodService from '../api/services/financePeriodService';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import { localDateIso } from '../utils/dates';
import { formatCurrency } from '../utils/labels';
import type { CashAccount } from '../types';

const KIND_LABELS: Record<CashAccount['kind'], string> = {
  cash: 'Μετρητά',
  bank: 'Τράπεζα',
  other: 'Άλλο',
};

export function CashAccountsPanel({ onSaved }: { onSaved: () => void }) {
  const { data, refresh } = useAppData();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CashAccount['kind']>('cash');
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closeMonth, setCloseMonth] = useState(() => localDateIso().slice(0, 7));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const balances = cashAccountsService.getAccountBalances();
  const closedMonths = useMemo(
    () => [...(data.closedFinanceMonths ?? [])].sort().reverse(),
    [data.closedFinanceMonths],
  );

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const result = await cashAccountsService.createCashAccount({
      name,
      kind,
      openingBalance,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία');
      return;
    }
    setName('');
    setOpeningBalance(0);
    setMessage('Το ταμείο δημιουργήθηκε.');
    refresh();
    onSaved();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή ταμείου;')) return;
    const result = await cashAccountsService.deleteCashAccount(id);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    refresh();
    onSaved();
  }

  async function handleCloseMonth() {
    if (!confirm(`Κλείσιμο μήνα ${closeMonth}; Δεν θα επιτρέπονται αλλαγές στις κινήσεις.`)) {
      return;
    }
    setSaving(true);
    setError('');
    const result = await financePeriodService.closeFinanceMonth(closeMonth);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία κλεισίματος');
      return;
    }
    setMessage(`Ο μήνας ${closeMonth} κλείστηκε.`);
    refresh();
    onSaved();
  }

  async function handleReopen(month: string) {
    if (!confirm(`Επανανοιγμα μήνα ${month};`)) return;
    const result = await financePeriodService.reopenFinanceMonth(month);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία');
      return;
    }
    setMessage(`Ο μήνας ${month} άνοιξε ξανά.`);
    refresh();
    onSaved();
  }

  return (
    <section className="stack-md">
      <div className="panel">
        <h3>Ταμεία / λογαριασμοί</h3>
        <p className="lede">Μετρητά, τράπεζα και υπόλοιπα βάσει εσόδων/εξόδων.</p>

        <form className="entry-form" onSubmit={(e) => void handleCreate(e)}>
          <div className="club-users-grid" style={{ marginBottom: '0.75rem' }}>
            <label className="field">
              <span>Όνομα</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Τύπος</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as CashAccount['kind'])}
              >
                <option value="cash">Μετρητά</option>
                <option value="bank">Τράπεζα</option>
                <option value="other">Άλλο</option>
              </select>
            </label>
            <label className="field">
              <span>Αρχικό υπόλοιπο</span>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <Button type="submit" disabled={saving}>
            <Plus size={16} /> Νέο ταμείο
          </Button>
        </form>

        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Όνομα</th>
                <th>Τύπος</th>
                <th>Αρχικό</th>
                <th>Υπόλοιπο</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={5}>Δεν υπάρχουν ταμεία ακόμη.</td>
                </tr>
              ) : (
                balances.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{KIND_LABELS[row.kind]}</td>
                    <td>{formatCurrency(row.openingBalance)}</td>
                    <td>
                      <strong>{formatCurrency(row.balance)}</strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void handleDelete(row.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Κλείσιμο μήνα</h3>
        <p className="lede">
          Κλειστός μήνας μπλοκάρει νέες/τροποποιήσεις εσόδων και εξόδων για εκείνες τις ημερομηνίες.
        </p>
        <div className="admin-entry-actions" style={{ alignItems: 'end', gap: '0.75rem' }}>
          <label className="field">
            <span>Μήνας</span>
            <input
              type="month"
              value={closeMonth}
              onChange={(e) => setCloseMonth(e.target.value)}
            />
          </label>
          <Button type="button" disabled={saving} onClick={() => void handleCloseMonth()}>
            Κλείσιμο μήνα
          </Button>
        </div>
        {closedMonths.length > 0 ? (
          <ul className="stack-sm" style={{ marginTop: '1rem' }}>
            {closedMonths.map((month) => (
              <li key={month} className="admin-record-line">
                <span>Κλειστός: {month}</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void handleReopen(month)}
                >
                  Επανανοιγμα
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Κανένας μήνας κλειστός.
          </p>
        )}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}
    </section>
  );
}
