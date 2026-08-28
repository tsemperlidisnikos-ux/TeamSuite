import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import * as budgetService from '../api/services/budgetService';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { BudgetInput } from '../schemas';
import type { BudgetLine } from '../types';
import {
  getConfiguredExpenseCategories,
  getConfiguredIncomeCategories,
} from '../platform/financeCatalog';
import {
  currentSeasonStartYear,
  seasonBounds,
} from '../shared/seasonPresets';
import { formatCurrency } from '../utils/labels';

function seasonLabel(start: number): string {
  return `${start}–${String(start + 1).slice(2)}`;
}

function inSeason(date: string, seasonStart: number): boolean {
  const bounds = seasonBounds(seasonStart);
  return date >= bounds.dateFrom && date <= bounds.dateTo;
}

/** Αγωνιστική σεζόν αθλητών: Αύγουστος → Ιούλιος */
function transactionInSeason(month: number, year: number, seasonStart: number): boolean {
  const start = month >= 8 ? year : year - 1;
  return start === seasonStart;
}

function isAthleteSubscriptionBudget(subcategory: string): boolean {
  return subcategory === 'ΣΥΝΔΡΟΜΕΣ ΑΘΛΗΤΩΝ';
}

export function BudgetPanel({ onSaved }: { onSaved: () => void }) {
  const { data } = useAppData();
  const [seasonStart, setSeasonStart] = useState(currentSeasonStartYear);
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [subcategory, setSubcategory] = useState('');
  const [amount, setAmount] = useState(0);
  const [clubName, setClubName] = useState('');
  const [sport, setSport] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const incomeCategories = getConfiguredIncomeCategories();
  const expenseCategories = getConfiguredExpenseCategories();
  const categories = type === 'income' ? incomeCategories : expenseCategories;

  const clubs = useMemo(
    () => (data.associations ?? []).filter((a) => a.active !== false),
    [data.associations],
  );
  const sports = useMemo(() => (data.sports ?? []).filter((s) => s.active), [data.sports]);

  const seasonBudgets = useMemo(
    () =>
      [...(data.budgets ?? [])]
        .filter((b) => b.seasonStart === seasonStart)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
          return a.subcategory.localeCompare(b.subcategory, 'el');
        }),
    [data.budgets, seasonStart],
  );

  const rows = useMemo(() => {
    const studentsById = new Map(data.students.map((s) => [s.id, s]));

    return seasonBudgets.map((line) => {
      let actual = 0;

      if (line.type === 'income' && isAthleteSubscriptionBudget(line.subcategory)) {
        actual = (data.transactions ?? [])
          .filter((t) => {
            if (t.type !== 'payment') return false;
            if (!transactionInSeason(t.month, t.year, seasonStart)) return false;
            const athlete = studentsById.get(t.athleteId);
            if (!athlete) return false;
            if (line.clubName && athlete.clubName !== line.clubName) return false;
            if (line.sport && athlete.sport !== line.sport) return false;
            return true;
          })
          .reduce((sum, t) => sum + t.amount, 0);
      } else if (line.type === 'income') {
        actual = data.revenues
          .filter(
            (r) =>
              inSeason(r.date, seasonStart) &&
              (r.subcategory || '') === line.subcategory &&
              (!line.clubName || r.clubName === line.clubName) &&
              (!line.sport || r.sport === line.sport),
          )
          .reduce((sum, r) => sum + r.amount, 0);
      } else {
        actual = data.expenses
          .filter(
            (e) =>
              inSeason(e.date, seasonStart) &&
              (e.subcategory || '') === line.subcategory &&
              (!line.clubName || e.clubName === line.clubName) &&
              (!line.sport || e.sport === line.sport),
          )
          .reduce((sum, e) => sum + e.amount, 0);
      }

      const diff = actual - line.amount;
      const pct = line.amount > 0 ? (actual / line.amount) * 100 : 0;
      return { line, actual, diff, pct };
    });
  }, [
    seasonBudgets,
    data.revenues,
    data.expenses,
    data.transactions,
    data.students,
    seasonStart,
  ]);

  const totals = useMemo(() => {
    const incomeBudget = rows
      .filter((r) => r.line.type === 'income')
      .reduce((s, r) => s + r.line.amount, 0);
    const incomeActual = rows
      .filter((r) => r.line.type === 'income')
      .reduce((s, r) => s + r.actual, 0);
    const expenseBudget = rows
      .filter((r) => r.line.type === 'expense')
      .reduce((s, r) => s + r.line.amount, 0);
    const expenseActual = rows
      .filter((r) => r.line.type === 'expense')
      .reduce((s, r) => s + r.actual, 0);
    return { incomeBudget, incomeActual, expenseBudget, expenseActual };
  }, [rows]);

  function resetForm() {
    setEditing(null);
    setType('income');
    setSubcategory('');
    setAmount(0);
    setClubName('');
    setSport('');
    setNotes('');
    setError('');
  }

  function startEdit(line: BudgetLine) {
    setEditing(line);
    setType(line.type);
    setSubcategory(line.subcategory);
    setAmount(line.amount);
    setClubName(line.clubName ?? '');
    setSport(line.sport ?? '');
    setNotes(line.notes ?? '');
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!subcategory) {
      setError('Επιλέξτε υποκατηγορία');
      return;
    }
    if (amount < 0) {
      setError('Το ποσό πρέπει να είναι ≥ 0');
      return;
    }

    const payload: BudgetInput = {
      seasonStart,
      type,
      subcategory,
      amount,
      clubName,
      sport,
      notes,
    };

    setSaving(true);
    setError('');
    const result = editing
      ? await budgetService.updateBudget(editing.id, payload)
      : await budgetService.createBudget(payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    resetForm();
    onSaved();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή γραμμής προϋπολογισμού;')) return;
    const result = await budgetService.deleteBudget(id);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα διαγραφής');
      return;
    }
    if (editing?.id === id) resetForm();
    onSaved();
  }

  return (
    <section className="income-entry-panel">
      <div className="income-entry-heading">
        <div>
          <p className="eyebrow">Κατηγορία</p>
          <h2>ΠΡΟΫΠΟΛΟΓΙΣΜΟΣ</h2>
          <p className="lede">
            Για <strong>Συνδρομές αθλητών</strong> το Πραγματικό προκύπτει από τις{' '}
            <strong>πληρωμές αθλητών</strong> (Συναλλαγές). Για τις υπόλοιπες
            υποκατηγορίες από τις καταχωρήσεις Έσοδα/Έξοδα.
          </p>
        </div>
        <div className="stat-pill">
          <span>Σεζόν</span>
          <strong>{seasonLabel(seasonStart)}</strong>
        </div>
      </div>

      <div className="report-template-actions" style={{ marginBottom: '0.5rem' }}>
        <button
          type="button"
          className="report-chip"
          onClick={() => {
            resetForm();
            setSeasonStart((y) => y - 1);
          }}
        >
          ← {seasonLabel(seasonStart - 1)}
        </button>
        <button type="button" className="report-chip is-active">
          {seasonLabel(seasonStart)}
        </button>
        <button
          type="button"
          className="report-chip"
          onClick={() => {
            resetForm();
            setSeasonStart((y) => y + 1);
          }}
        >
          {seasonLabel(seasonStart + 1)} →
        </button>
      </div>

      <div className="summary-row budget-summary-row">
        <div className="summary-card">
          <span>Προϋπ. εσόδων</span>
          <strong>{formatCurrency(totals.incomeBudget)}</strong>
        </div>
        <div className="summary-card">
          <span>Πραγματικά έσοδα</span>
          <strong>{formatCurrency(totals.incomeActual)}</strong>
        </div>
        <div className="summary-card">
          <span>Προϋπ. εξόδων</span>
          <strong>{formatCurrency(totals.expenseBudget)}</strong>
        </div>
        <div className="summary-card">
          <span>Πραγματικά έξοδα</span>
          <strong>{formatCurrency(totals.expenseActual)}</strong>
        </div>
      </div>

      <form className="entry-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="ta-table">
          <div className="ta-row">
            <label className="ta-title" htmlFor="budget-type">
              Τύπος
            </label>
            <div className="ta-analysis">
              <select
                id="budget-type"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as 'income' | 'expense');
                  setSubcategory('');
                }}
              >
                <option value="income">Έσοδο</option>
                <option value="expense">Έξοδο</option>
              </select>
            </div>
          </div>
          <div className="ta-row">
            <label className="ta-title" htmlFor="budget-subcategory">
              Υποκατηγορία
            </label>
            <div className="ta-analysis">
              <select
                id="budget-subcategory"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                required
              >
                <option value="">Επιλέξτε...</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ta-row">
            <label className="ta-title" htmlFor="budget-amount">
              Ποσό σεζόν (€)
            </label>
            <div className="ta-analysis">
              <div className="ta-amount">
                <input
                  id="budget-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                />
                <span>€</span>
              </div>
            </div>
          </div>
          <div className="ta-row">
            <label className="ta-title" htmlFor="budget-club">
              Σωματείο (προαιρετικό)
            </label>
            <div className="ta-analysis">
              <select
                id="budget-club"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
              >
                <option value="">Όλα</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ta-row">
            <label className="ta-title" htmlFor="budget-sport">
              Άθλημα (προαιρετικό)
            </label>
            <div className="ta-analysis">
              <select
                id="budget-sport"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
              >
                <option value="">Όλα</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ta-row">
            <label className="ta-title" htmlFor="budget-notes">
              Σημειώσεις
            </label>
            <div className="ta-analysis">
              <input
                id="budget-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="income-entry-actions">
          {editing ? (
            <Button type="button" variant="secondary" onClick={resetForm}>
              Ακύρωση
            </Button>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving
              ? 'Αποθήκευση…'
              : editing
                ? 'Ενημέρωση στόχου'
                : 'Προσθήκη στόχου'}
          </Button>
        </div>
      </form>

      <div className="income-entry-list">
        <h3 className="budget-results-title">Αποτέλεσμα σεζόν {seasonLabel(seasonStart)}</h3>
        {rows.length === 0 ? (
          <p className="income-entry-empty">
            Δεν υπάρχουν στόχοι για τη σεζόν {seasonLabel(seasonStart)}.
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Τύπος</th>
                <th>Υποκατηγορία</th>
                <th>Προϋπολογισμός</th>
                <th>Πραγματικό</th>
                <th>Πρόοδος</th>
                <th>Διαφορά</th>
                <th>Κατάσταση</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ line, actual, diff, pct }) => {
                const cappedPct = Math.min(pct, 100);
                const overBudget =
                  line.type === 'expense' ? actual > line.amount : actual < line.amount && actual > 0;
                const status =
                  actual === 0
                    ? 'Χωρίς κινήσεις ακόμα'
                    : line.type === 'expense'
                      ? actual <= line.amount
                        ? 'Εντός στόχου'
                        : 'Υπέρβαση'
                      : actual >= line.amount
                        ? 'Στόχος επιτεύχθηκε'
                        : 'Κάτω από στόχο';
                return (
                  <tr key={line.id}>
                    <td>{line.type === 'income' ? 'ΕΣΟΔΟ' : 'ΕΞΟΔΟ'}</td>
                    <td>
                      <strong>{line.subcategory}</strong>
                      {[line.clubName, line.sport].filter(Boolean).length > 0 ? (
                        <div className="match-print-details">
                          {[line.clubName, line.sport].filter(Boolean).join(' · ')}
                        </div>
                      ) : null}
                    </td>
                    <td>{formatCurrency(line.amount)}</td>
                    <td>{formatCurrency(actual)}</td>
                    <td className="budget-progress-cell">
                      <div className="budget-progress" aria-hidden="true">
                        <div
                          className={`budget-progress-bar ${
                            line.type === 'expense' && actual > line.amount
                              ? 'is-over'
                              : 'is-ok'
                          }`}
                          style={{ width: `${cappedPct}%` }}
                        />
                      </div>
                      <span>{pct.toFixed(0)}%</span>
                    </td>
                    <td
                      className={
                        line.type === 'expense'
                          ? diff > 0
                            ? 'amount expense'
                            : 'amount income'
                          : diff >= 0
                            ? 'amount income'
                            : 'amount expense'
                      }
                    >
                      {formatCurrency(diff)}
                    </td>
                    <td>
                      <span
                        className={`budget-status ${
                          actual === 0
                            ? 'is-pending'
                            : overBudget && line.type === 'expense'
                              ? 'is-bad'
                              : 'is-good'
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label="Επεξεργασία"
                        onClick={() => startEdit(line)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label="Διαγραφή"
                        onClick={() => void handleDelete(line.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="budget-hint">
          Για «Συνδρομές αθλητών»: κάθε πληρωμή στην ενότητα Συναλλαγές αυξάνει το
          Πραγματικό της σεζόν. Π.χ. πληρωμή 70 € → πρόοδος προς τον στόχο 1.000 €.
        </p>
      </div>
    </section>
  );
}
