import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { ATHLETE_INCOME_SUBCATEGORY } from '../api/services/athletePaymentRevenueBridge';
import * as feeChargesService from '../api/services/feeChargesService';
import * as financeService from '../api/services/financeService';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useAppData } from '../hooks/useAppData';
import {
  EXPENSE_SUBCATEGORIES,
  INCOME_SUBCATEGORIES,
} from '../shared/financeCategories';
import {
  getConfiguredExpenseCategories,
  getConfiguredIncomeCategories,
} from '../platform/financeCatalog';
import type { ReportFilters } from '../shared/reportFilters';
import { buildSeasonPresets } from '../shared/seasonPresets';
import { localDateIso } from '../utils/dates';
import type { MatchExpenseDetails } from '../types';
import { formatCurrency, formatDate } from '../utils/labels';

type ReportRow = {
  id: string;
  date: string;
  type: 'income' | 'expense';
  subcategory: string;
  clubName: string;
  sport: string;
  description: string;
  amount: number;
  surname?: string;
  firstName?: string;
  notes?: string;
  paymentMethod?: string;
  vatRate?: number;
  matchDetails?: MatchExpenseDetails;
};

function TitleAnalysisRow({
  title,
  htmlFor,
  children,
}: {
  title: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="ta-row">
      <label className="ta-title" htmlFor={htmlFor}>
        {title}
      </label>
      <div className="ta-analysis">{children}</div>
    </div>
  );
}

function TitleAnalysisTable({ children }: { children: ReactNode }) {
  return (
    <div className="ta-table">
      <div className="ta-row ta-header" aria-hidden="true">
        <div className="ta-title">Τίτλος</div>
        <div className="ta-analysis">Ανάλυση</div>
      </div>
      {children}
    </div>
  );
}

const emptyFilters: ReportFilters = {
  type: 'all',
  subcategory: '',
  clubName: '',
  sport: '',
  dateFrom: '',
  dateTo: '',
  minAmount: undefined,
  maxAmount: undefined,
  search: '',
};

function matchesFilters(row: ReportRow, filters: ReportFilters): boolean {
  if (filters.type !== 'all' && row.type !== filters.type) return false;
  if (filters.subcategory && row.subcategory !== filters.subcategory) return false;
  if (filters.clubName && row.clubName !== filters.clubName) return false;
  if (filters.sport && row.sport !== filters.sport) return false;
  if (filters.dateFrom && row.date < filters.dateFrom) return false;
  if (filters.dateTo && row.date > filters.dateTo) return false;
  if (filters.minAmount != null && filters.minAmount > 0 && row.amount < filters.minAmount) {
    return false;
  }
  if (filters.maxAmount != null && filters.maxAmount > 0 && row.amount > filters.maxAmount) {
    return false;
  }
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const hay = [
      row.description,
      row.notes ?? '',
      row.surname ?? '',
      row.firstName ?? '',
      row.matchDetails?.teams ?? '',
      row.subcategory,
    ]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function exportCsv(items: ReportRow[], filename: string) {
  const headers = [
    'Ημερομηνία',
    'Τύπος',
    'Σωματείο',
    'Άθλημα',
    'Υποκατηγορία',
    'Περιγραφή',
    'Ονοματεπώνυμο',
    'Ποσό',
    'Τρόπος πληρωμής',
    'ΦΠΑ %',
    'Σημειώσεις',
  ];
  const lines = items.map((item) =>
    [
      formatDate(item.date),
      item.type === 'income' ? 'ΕΣΟΔΟ' : 'ΕΞΟΔΟ',
      item.clubName,
      item.sport,
      item.subcategory,
      item.description,
      [item.surname, item.firstName].filter(Boolean).join(' '),
      String(item.amount),
      item.paymentMethod ?? '',
      item.vatRate != null ? String(item.vatRate) : '',
      item.notes ?? '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(';'),
  );
  const blob = new Blob(['\uFEFF' + [headers.join(';'), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FinanceReportsPanel() {
  const { data, refresh } = useAppData();
  const [draft, setDraft] = useState<ReportFilters>(emptyFilters);
  const [applied, setApplied] = useState<ReportFilters>(emptyFilters);
  const [activeSeason, setActiveSeason] = useState<string | null>(null);
  const seasonPresets = buildSeasonPresets();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const clubs = useMemo(
    () => (data.associations ?? []).filter((a) => a.active !== false),
    [data.associations],
  );
  const sports = useMemo(() => (data.sports ?? []).filter((s) => s.active), [data.sports]);

  const allRows = useMemo<ReportRow[]>(() => {
    const incomeRows: ReportRow[] = data.revenues.map((rev) => ({
      id: rev.id,
      date: rev.date,
      type: 'income',
      subcategory: rev.subcategory || '',
      clubName: rev.clubName || '',
      sport: rev.sport || '',
      description: rev.description,
      amount: rev.amount,
      surname: rev.surname,
      firstName: rev.firstName,
      notes: rev.notes,
      paymentMethod: rev.paymentMethod,
      vatRate: rev.vatRate,
    }));
    const expenseRows: ReportRow[] = data.expenses.map((exp) => ({
      id: exp.id,
      date: exp.date,
      type: 'expense',
      subcategory: exp.subcategory || '',
      clubName: exp.clubName || '',
      sport: exp.sport || '',
      description: exp.description,
      amount: exp.amount,
      surname: exp.surname,
      firstName: exp.firstName,
      notes: exp.notes,
      paymentMethod: exp.paymentMethod,
      vatRate: exp.vatRate,
      matchDetails: exp.matchDetails,
    }));
    return [...incomeRows, ...expenseRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [data.revenues, data.expenses]);

  const subcategoryOptions = useMemo(() => {
    const configuredIncome = getConfiguredIncomeCategories().filter(
      (item) => item !== ATHLETE_INCOME_SUBCATEGORY,
    );
    const income = [
      ATHLETE_INCOME_SUBCATEGORY,
      ...(configuredIncome.length ? configuredIncome : [...INCOME_SUBCATEGORIES]),
    ];
    const expense = getConfiguredExpenseCategories();
    if (draft.type === 'income') return income;
    if (draft.type === 'expense') return expense.length ? expense : [...EXPENSE_SUBCATEGORIES];
    return [...income, ...(expense.length ? expense : [...EXPENSE_SUBCATEGORIES])];
  }, [draft.type]);

  const todayIso = localDateIso();

  const items = useMemo(
    () => allRows.filter((row) => matchesFilters(row, applied)),
    [allRows, applied],
  );

  const openChargeRows = useMemo(() => {
    const rows = feeChargesService.listClubOpenCharges();
    return rows.filter((row) => {
      if (applied.dateFrom && row.chargeDate && row.chargeDate < applied.dateFrom) return false;
      if (applied.dateTo && row.chargeDate && row.chargeDate > applied.dateTo) return false;
      if (applied.clubName && row.clubName !== applied.clubName) return false;
      if (applied.sport && row.sport !== applied.sport) return false;
      if (applied.minAmount != null && applied.minAmount > 0 && row.remaining < applied.minAmount) {
        return false;
      }
      if (applied.maxAmount != null && applied.maxAmount > 0 && row.remaining > applied.maxAmount) {
        return false;
      }
      if (applied.search.trim()) {
        const q = applied.search.trim().toLowerCase();
        const hay = `${row.athleteName} ${row.comments} ${row.periodLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [applied, data.transactions, data.students]);

  const openChargesTotal = openChargeRows.reduce((sum, row) => sum + row.remaining, 0);

  const incomeTotal = items
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const expenseTotal = items
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0);

  const todayItems = useMemo(
    () => allRows.filter((row) => row.date === todayIso),
    [allRows, todayIso],
  );
  const todayIncomeTotal = todayItems
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const todayExpenseTotal = todayItems
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0);

  const dailyTotals = useMemo(() => {
    const byDay = new Map<string, { income: number; expense: number }>();
    for (const item of items) {
      const entry = byDay.get(item.date) ?? { income: 0, expense: 0 };
      if (item.type === 'income') entry.income += item.amount;
      else entry.expense += item.amount;
      byDay.set(item.date, entry);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, values]) => ({
        date,
        income: values.income,
        expense: values.expense,
        balance: values.income - values.expense,
      }));
  }, [items]);

  function updateDraft<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    if (key === 'dateFrom' || key === 'dateTo') setActiveSeason(null);
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'type') next.subcategory = '';
      return next;
    });
  }

  function applyFilters(next = draft) {
    setApplied(next);
  }

  function applySeason(seasonId: string) {
    const season = buildSeasonPresets().find((item) => item.id === seasonId);
    if (!season) return;
    const next = {
      ...draft,
      dateFrom: season.filters.dateFrom,
      dateTo: season.filters.dateTo,
    };
    setActiveSeason(season.id);
    setDraft(next);
    setApplied(next);
  }

  function clearSeason() {
    setActiveSeason(null);
    const next: ReportFilters = {
      ...draft,
      dateFrom: '',
      dateTo: '',
    };
    setDraft(next);
    setApplied(next);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    applyFilters(draft);
  }

  async function handleDelete(item: ReportRow) {
    const label = item.type === 'income' ? 'έσοδο' : 'έξοδο';
    if (!confirm(`Διαγραφή ${label};`)) return;
    setDeletingId(item.id);
    const result =
      item.type === 'income'
        ? await financeService.deleteRevenue(item.id)
        : await financeService.deleteExpense(item.id);
    setDeletingId(null);
    if (!result.success) {
      alert(result.error ?? 'Σφάλμα διαγραφής');
      return;
    }
    refresh();
  }

  const metaLine = [
    activeSeason
      ? `Περίοδος: ${seasonPresets.find((s) => s.id === activeSeason)?.label ?? ''}`
      : null,
    applied.dateFrom || applied.dateTo
      ? `${applied.dateFrom || '…'} → ${applied.dateTo || '…'}`
      : null,
    `Εγγραφές: ${items.length}`,
    `Έσοδα φίλτρου: ${formatCurrency(incomeTotal)}`,
    `Έξοδα φίλτρου: ${formatCurrency(expenseTotal)}`,
    `Διαφορά: ${formatCurrency(incomeTotal - expenseTotal)}`,
    `Οφειλές αθλητών: ${formatCurrency(openChargesTotal)}`,
    applied.clubName ? `Ομάδα: ${applied.clubName}` : null,
    applied.sport ? `Άθλημα: ${applied.sport}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="income-entry-panel finance-reports-panel">
      <div className="income-entry-heading">
        <div>
          <p className="eyebrow">Κατηγορία</p>
          <h2>ΕΚΤΥΠΩΣΕΙΣ</h2>
          <p className="lede">
            Reports με φίλτρα. Προεπισκόπηση PDF, εκτύπωση browser ή εξαγωγή Excel / PDF.
          </p>
        </div>
        <div className="report-export-actions no-print">
          <Button type="button" onClick={() => setPreviewOpen(true)} disabled={items.length === 0}>
            Προεπισκόπηση
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => exportCsv(items, 'kiniseis.csv')}
            disabled={items.length === 0}
          >
            Excel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.print()}
            disabled={items.length === 0}
          >
            PDF
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Εκτύπωση
          </Button>
        </div>
      </div>

      <div className="report-templates no-print">
        <div className="report-templates-header">
          <h3>Περίοδος</h3>
          <p className="muted-text">Γρήγορη επιλογή σεζόν, τρέχοντος μήνα ή τρέχουσας ημέρας.</p>
        </div>
        <div className="report-template-actions">
          {seasonPresets.map((season) => (
            <button
              key={season.id}
              type="button"
              className={`report-chip ${activeSeason === season.id ? 'is-active' : ''}`}
              onClick={() => applySeason(season.id)}
            >
              {season.label}
            </button>
          ))}
          {activeSeason ? (
            <button type="button" className="report-chip report-chip--ghost" onClick={clearSeason}>
              Καθαρισμός
            </button>
          ) : null}
        </div>
      </div>

      <div className="summary-row no-print">
        <div className="summary-card">
          <span>Σύνολο εσόδων</span>
          <strong>{formatCurrency(incomeTotal)}</strong>
        </div>
        <div className="summary-card">
          <span>Σύνολο εξόδων</span>
          <strong>{formatCurrency(expenseTotal)}</strong>
        </div>
        <div className="summary-card">
          <span>Υπόλοιπο</span>
          <strong>{formatCurrency(incomeTotal - expenseTotal)}</strong>
        </div>
        <div className="summary-card">
          <span>Οφειλές αθλητών</span>
          <strong>{formatCurrency(openChargesTotal)}</strong>
        </div>
      </div>

      <div className="summary-row no-print">
        <div className="summary-card">
          <span>Έσοδα σήμερα</span>
          <strong>{formatCurrency(todayIncomeTotal)}</strong>
        </div>
        <div className="summary-card">
          <span>Έξοδα σήμερα</span>
          <strong>{formatCurrency(todayExpenseTotal)}</strong>
        </div>
        <div className="summary-card">
          <span>Υπόλοιπο σήμερα</span>
          <strong>{formatCurrency(todayIncomeTotal - todayExpenseTotal)}</strong>
        </div>
      </div>

      {dailyTotals.length > 0 ? (
        <div className="panel report-daily-totals no-print">
          <div className="panel-head">
            <h3>Σύνολα ανά ημέρα</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ημερομηνία</th>
                  <th>Έσοδα</th>
                  <th>Έξοδα</th>
                  <th>Υπόλοιπο</th>
                </tr>
              </thead>
              <tbody>
                {dailyTotals.map((day) => (
                  <tr key={day.date}>
                    <td>{formatDate(day.date)}</td>
                    <td className="amount income">{formatCurrency(day.income)}</td>
                    <td className="amount expense">{formatCurrency(day.expense)}</td>
                    <td className="amount">{formatCurrency(day.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <form className="filters-panel entry-form no-print" onSubmit={handleSubmit}>
        <TitleAnalysisTable>
          <TitleAnalysisRow title="Τύπος" htmlFor="filter-type">
            <select
              id="filter-type"
              value={draft.type}
              onChange={(e) => updateDraft('type', e.target.value as ReportFilters['type'])}
            >
              <option value="all">Όλα</option>
              <option value="income">Έσοδα</option>
              <option value="expense">Έξοδα</option>
            </select>
          </TitleAnalysisRow>
          <TitleAnalysisRow title="Υποκατηγορία" htmlFor="filter-subcategory">
            <select
              id="filter-subcategory"
              value={draft.subcategory}
              onChange={(e) => updateDraft('subcategory', e.target.value)}
            >
              <option value="">Όλες</option>
              {subcategoryOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>
          <TitleAnalysisRow title="Σωματείο" htmlFor="filter-club">
            <select
              id="filter-club"
              value={draft.clubName}
              onChange={(e) => updateDraft('clubName', e.target.value)}
            >
              <option value="">Όλα</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>
          <TitleAnalysisRow title="Άθλημα" htmlFor="filter-sport">
            <select
              id="filter-sport"
              value={draft.sport}
              onChange={(e) => updateDraft('sport', e.target.value)}
            >
              <option value="">Όλα</option>
              {sports.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>
          <TitleAnalysisRow title="Από ημερομηνία" htmlFor="filter-date-from">
            <input
              id="filter-date-from"
              type="date"
              value={draft.dateFrom}
              onChange={(e) => updateDraft('dateFrom', e.target.value)}
            />
          </TitleAnalysisRow>
          <TitleAnalysisRow title="Έως ημερομηνία" htmlFor="filter-date-to">
            <input
              id="filter-date-to"
              type="date"
              value={draft.dateTo}
              onChange={(e) => updateDraft('dateTo', e.target.value)}
            />
          </TitleAnalysisRow>
          <TitleAnalysisRow title="Ελάχιστο ποσό" htmlFor="filter-min">
            <div className="ta-amount">
              <input
                id="filter-min"
                type="number"
                min={0}
                step="0.01"
                value={draft.minAmount ?? ''}
                onChange={(e) =>
                  updateDraft(
                    'minAmount',
                    e.target.value === '' ? undefined : Number(e.target.value),
                  )
                }
              />
              <span>€</span>
            </div>
          </TitleAnalysisRow>
          <TitleAnalysisRow title="Μέγιστο ποσό" htmlFor="filter-max">
            <div className="ta-amount">
              <input
                id="filter-max"
                type="number"
                min={0}
                step="0.01"
                value={draft.maxAmount ?? ''}
                onChange={(e) =>
                  updateDraft(
                    'maxAmount',
                    e.target.value === '' ? undefined : Number(e.target.value),
                  )
                }
              />
              <span>€</span>
            </div>
          </TitleAnalysisRow>
          <TitleAnalysisRow title="Αναζήτηση" htmlFor="filter-search">
            <input
              id="filter-search"
              value={draft.search}
              onChange={(e) => updateDraft('search', e.target.value)}
              placeholder="Περιγραφή, ομάδες, σημειώσεις…"
            />
          </TitleAnalysisRow>
        </TitleAnalysisTable>
        <div className="income-entry-actions">
          <Button type="submit">Εφαρμογή φίλτρων</Button>
        </div>
      </form>

      <div className="report-sheet" id="report-print-area">
        <div className="report-meta">
          <h3>Αναφορά κινήσεων</h3>
          <p>{metaLine}</p>
        </div>

        {applied.type === 'all' || !applied.type ? (
          <div className="table-wrap report-open-charges">
            <h4 className="report-charges-heading">Εκκρεμείς χρεώσεις αθλητών</h4>
            <p className="muted-text">
              Οι οφειλές προέρχονται από χρεώσεις συνδρομών / κινήσεων αθλητών. Δεν είναι έσοδα μέχρι
              να εισπραχθούν.{' '}
              <Link to="/fees" className="text-link">
                Ανάλυση στις Συνδρομές / Πληρωμές
              </Link>
            </p>
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th>Περίοδος</th>
                  <th>Αθλητής</th>
                  <th>Περιγραφή</th>
                  <th>Ανοιχτό ποσό</th>
                </tr>
              </thead>
              <tbody>
                {openChargeRows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Δεν υπάρχουν ανοιχτές χρεώσεις αθλητών σε αυτά τα φίλτρα.</td>
                  </tr>
                ) : (
                  openChargeRows.map((row) => (
                    <tr key={row.chargeId}>
                      <td>{row.periodLabel}</td>
                      <td>
                        {row.athleteMissing ? (
                          row.athleteName
                        ) : (
                          <Link
                            to={`/transactions?athleteId=${encodeURIComponent(row.athleteId)}`}
                            className="text-link"
                          >
                            {row.athleteName}
                          </Link>
                        )}
                      </td>
                      <td>{feeChargesService.chargeCommentsLabel(row.comments)}</td>
                      <td className="amount">{formatCurrency(row.remaining)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Ημερομηνία</th>
                <th>Σωματείο</th>
                <th>Άθλημα</th>
                <th>Τύπος</th>
                <th>Υποκατηγορία</th>
                <th>Περιγραφή</th>
                <th>Ποσό</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8}>Δεν βρέθηκαν εγγραφές με αυτά τα φίλτρα.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.clubName || '—'}</td>
                    <td>{item.sport || '—'}</td>
                    <td>{item.type === 'income' ? 'ΕΣΟΔΟ' : 'ΕΞΟΔΟ'}</td>
                    <td>{item.subcategory || '—'}</td>
                    <td>
                      {item.description}
                      {item.surname || item.firstName ? (
                        <div className="match-print-details">
                          {[item.surname, item.firstName].filter(Boolean).join(' ')}
                        </div>
                      ) : null}
                      {item.type === 'expense' && item.matchDetails ? (
                        <div className="match-print-details">
                          <div>
                            Άθλημα: {item.matchDetails.sport} · Κατηγορία:{' '}
                            {item.matchDetails.category}
                          </div>
                          <div>Ομάδες: {item.matchDetails.teams}</div>
                        </div>
                      ) : null}
                    </td>
                    <td className={item.type === 'income' ? 'amount income' : 'amount expense'}>
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label="Διαγραφή"
                        disabled={deletingId === item.id}
                        onClick={() => void handleDelete(item)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {items.length > 0 ? (
              <tfoot>
                <tr className="report-total-row">
                  <td colSpan={7}>Σύνολο εσόδων</td>
                  <td className="amount income">{formatCurrency(incomeTotal)}</td>
                </tr>
                <tr className="report-total-row">
                  <td colSpan={7}>Σύνολο εξόδων</td>
                  <td className="amount expense">{formatCurrency(expenseTotal)}</td>
                </tr>
                <tr className="report-total-row report-balance-row">
                  <td colSpan={7}>Διαφορά</td>
                  <td className="amount">{formatCurrency(incomeTotal - expenseTotal)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <Modal
        open={previewOpen}
        title="Προεπισκόπηση αναφοράς"
        onClose={() => setPreviewOpen(false)}
        fullscreen
        className="finance-report-preview-modal"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setPreviewOpen(false)}>
              Κλείσιμο
            </Button>
            <Button type="button" onClick={() => window.print()}>
              Εκτύπωση
            </Button>
          </>
        }
      >
        <div className="report-preview-body">
          <p className="muted-text">{metaLine}</p>
          <p>
            Έσοδα: <strong>{formatCurrency(incomeTotal)}</strong> · Έξοδα:{' '}
            <strong>{formatCurrency(expenseTotal)}</strong> · Υπόλοιπο:{' '}
            <strong>{formatCurrency(incomeTotal - expenseTotal)}</strong>
          </p>
          <p className="muted-text">Εγγραφές: {items.length}</p>
        </div>
      </Modal>
    </section>
  );
}
