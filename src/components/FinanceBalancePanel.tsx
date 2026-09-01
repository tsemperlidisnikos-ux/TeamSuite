import { useMemo, useRef, useState } from 'react';
import {
  Filter,
  Printer,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  ATHLETE_INCOME_DESCRIPTIONS,
  ATHLETE_INCOME_SUBCATEGORY,
} from '../api/services/athletePaymentRevenueBridge';
import { Button } from './ui/Button';
import { AppPopupLayer } from './ui/AppPopupLayer';
import { StatCard } from './ui/StatCard';
import { useAppData } from '../hooks/useAppData';
import {
  getConfiguredExpenseCategories,
  getConfiguredExpenseDescriptions,
  getConfiguredIncomeCategories,
  getConfiguredIncomeDescriptions,
} from '../platform/financeCatalog';
import {
  EXPENSE_SUBCATEGORIES,
  INCOME_SUBCATEGORIES,
  isSubscriptionSubcategory,
} from '../shared/financeCategories';
import { PAYMENT_METHODS, normalizePaymentMethod } from '../shared/paymentMethods';
import {
  currentSeasonStartYear,
  dayBounds,
  monthBounds,
} from '../shared/seasonPresets';
import { localDateIso } from '../utils/dates';
import { formatCurrency, formatDate } from '../utils/labels';
import { filterOwnFinanceEntries } from '../utils/financeOwnEntries';
import type { Expense, PaymentMethod, Revenue } from '../types';

type PayBucket = 'cash' | 'card' | 'bank' | 'online';

type BalanceFilters = {
  clubName: string;
  sport: string;
  paymentMethod: string;
  incomeCategory: string;
  incomeLabel: string;
  subscriptionLabel: string;
  expenseCategory: string;
  expenseLabel: string;
  dateFrom: string;
  dateTo: string;
};

type AggRow = {
  key: string;
  sport: string;
  category: string;
  cash: number;
  card: number;
  bank: number;
  online: number;
  total: number;
};

const emptyFilters = (): BalanceFilters => {
  const start = currentSeasonStartYear();
  // Αγωνιστική σεζόν UI: Αύγουστος → Ιούλιος (όπως προϋπολογισμός).
  return {
    clubName: '',
    sport: '',
    paymentMethod: '',
    incomeCategory: '',
    incomeLabel: '',
    subscriptionLabel: '',
    expenseCategory: '',
    expenseLabel: '',
    dateFrom: `${start}-08-01`,
    dateTo: `${start + 1}-07-31`,
  };
};

function paymentBucket(method: string | undefined | null): PayBucket {
  const normalized = normalizePaymentMethod(method);
  if (normalized === 'cash') return 'cash';
  if (normalized === 'card') return 'card';
  if (normalized === 'transfer') return 'bank';
  return 'online';
}

function quarterBounds(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    dateFrom: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function weekBounds(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { dateFrom: localDateIso(mon), dateTo: localDateIso(sun) };
}

function seasonOptions(now = new Date()) {
  const current = currentSeasonStartYear(now);
  return [current, current - 1, current - 2, current + 1].map((start) => ({
    id: String(start),
    label: `${start}-${String(start + 1).slice(2)}`,
    dateFrom: `${start}-08-01`,
    dateTo: `${start + 1}-07-31`,
  }));
}

function matchesDate(date: string, from: string, to: string) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function accumulate(
  rows: Array<{
    sport: string;
    category: string;
    amount: number;
    paymentMethod?: PaymentMethod;
  }>,
): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const row of rows) {
    const sport = row.sport.trim() || '—';
    const category = row.category.trim() || '—';
    const key = `${sport.toLowerCase()}::${category.toLowerCase()}`;
    const entry =
      map.get(key) ??
      ({
        key,
        sport,
        category,
        cash: 0,
        card: 0,
        bank: 0,
        online: 0,
        total: 0,
      } satisfies AggRow);
    const bucket = paymentBucket(row.paymentMethod);
    entry[bucket] += row.amount;
    entry.total += row.amount;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) =>
    `${a.sport} ${a.category}`.localeCompare(`${b.sport} ${b.category}`, 'el'),
  );
}

function sumRows(rows: AggRow[]) {
  return rows.reduce(
    (acc, row) => ({
      cash: acc.cash + row.cash,
      card: acc.card + row.card,
      bank: acc.bank + row.bank,
      online: acc.online + row.online,
      total: acc.total + row.total,
    }),
    { cash: 0, card: 0, bank: 0, online: 0, total: 0 },
  );
}

function countActiveFilters(f: BalanceFilters, defaults: BalanceFilters) {
  let n = 0;
  if (f.clubName) n += 1;
  if (f.sport) n += 1;
  if (f.paymentMethod) n += 1;
  if (f.incomeCategory) n += 1;
  if (f.incomeLabel) n += 1;
  if (f.subscriptionLabel) n += 1;
  if (f.expenseCategory) n += 1;
  if (f.expenseLabel) n += 1;
  if (f.dateFrom !== defaults.dateFrom || f.dateTo !== defaults.dateTo) n += 1;
  return n;
}

function exportBalanceCsv(
  income: AggRow[],
  expenses: AggRow[],
  filename: string,
) {
  const headers = [
    'Τύπος',
    'Άθλημα',
    'Κατηγορία',
    'Μετρητά',
    'Κάρτες',
    'Τράπεζα',
    'Online',
    'Ποσό',
  ];
  const lines = [
    ...income.map((r) =>
      ['ΕΣΟΔΟ', r.sport, r.category, r.cash, r.card, r.bank, r.online, r.total]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(';'),
    ),
    ...expenses.map((r) =>
      ['ΕΞΟΔΟ', r.sport, r.category, r.cash, r.card, r.bank, r.online, r.total]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(';'),
    ),
  ];
  const blob = new Blob(['\uFEFF' + [headers.join(';'), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function BalanceTable({
  title,
  rows,
}: {
  title: string;
  rows: AggRow[];
}) {
  const totals = sumRows(rows);
  return (
    <section className="balance-table-block">
      <h3>{title}</h3>
      <div className="table-wrap balance-table-wrap">
        <table className="data-table balance-data-table">
          <colgroup>
            <col className="col-sport" />
            <col className="col-category" />
            <col className="col-amount" />
            <col className="col-amount" />
            <col className="col-amount" />
            <col className="col-amount" />
            <col className="col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th>Άθλημα</th>
              <th>Κατηγορία</th>
              <th className="num">Μετρητά</th>
              <th className="num">Κάρτες</th>
              <th className="num">Τράπεζα</th>
              <th className="num">Online</th>
              <th className="num">Ποσό</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  Δεν υπάρχουν δεδομένα στον πίνακα
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.sport}</td>
                  <td>{row.category}</td>
                  <td className="num">{formatCurrency(row.cash)}</td>
                  <td className="num">{formatCurrency(row.card)}</td>
                  <td className="num">{formatCurrency(row.bank)}</td>
                  <td className="num">{formatCurrency(row.online)}</td>
                  <td className="num">{formatCurrency(row.total)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="balance-total-row">
              <td colSpan={2}>Σύνολο</td>
              <td className="num">{formatCurrency(totals.cash)}</td>
              <td className="num">{formatCurrency(totals.card)}</td>
              <td className="num">{formatCurrency(totals.bank)}</td>
              <td className="num">{formatCurrency(totals.online)}</td>
              <td className="num">{formatCurrency(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function FinanceBalancePanel() {
  const { data, refresh } = useAppData();
  const defaults = useMemo(() => emptyFilters(), []);
  const [draft, setDraft] = useState<BalanceFilters>(defaults);
  const [applied, setApplied] = useState<BalanceFilters>(defaults);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersAnchorRef = useRef<HTMLDivElement>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [activeSeason, setActiveSeason] = useState<string | null>(() =>
    String(currentSeasonStartYear()),
  );

  const clubs = useMemo(
    () => (data.associations ?? []).filter((a) => a.active !== false),
    [data.associations],
  );

  const sports = useMemo(
    () => (data.sports ?? []).filter((s) => s.active),
    [data.sports],
  );

  const incomeCategories = useMemo(() => {
    const configured = getConfiguredIncomeCategories().filter(
      (item) => item !== ATHLETE_INCOME_SUBCATEGORY,
    );
    return [
      ATHLETE_INCOME_SUBCATEGORY,
      ...(configured.length ? configured : [...INCOME_SUBCATEGORIES]),
    ];
  }, []);

  const expenseCategories = useMemo(() => {
    const configured = getConfiguredExpenseCategories();
    return configured.length ? configured : [...EXPENSE_SUBCATEGORIES];
  }, []);

  const incomeLabels = useMemo(() => {
    const cat = draft.incomeCategory || '';
    if (!cat || isSubscriptionSubcategory(cat)) return [];
    return getConfiguredIncomeDescriptions(cat);
  }, [draft.incomeCategory]);

  const subscriptionLabels = useMemo(() => {
    const fromConfig = getConfiguredIncomeDescriptions(ATHLETE_INCOME_SUBCATEGORY);
    return fromConfig.length ? fromConfig : [...ATHLETE_INCOME_DESCRIPTIONS];
  }, []);

  const expenseLabels = useMemo(() => {
    const cat = draft.expenseCategory || '';
    if (!cat) return [];
    return getConfiguredExpenseDescriptions(cat);
  }, [draft.expenseCategory]);

  const seasons = useMemo(() => seasonOptions(), []);

  const filteredIncome = useMemo(() => {
    return filterOwnFinanceEntries(data.revenues).filter((rev: Revenue) => {
      if (!matchesDate(rev.date, applied.dateFrom, applied.dateTo)) return false;
      if (applied.clubName && (rev.clubName || '') !== applied.clubName) return false;
      if (applied.sport && (rev.sport || '') !== applied.sport) return false;
      if (
        applied.paymentMethod &&
        normalizePaymentMethod(rev.paymentMethod) !== applied.paymentMethod
      ) {
        return false;
      }
      const sub = rev.subcategory || '';
      if (applied.incomeCategory && sub !== applied.incomeCategory) return false;
      if (applied.subscriptionLabel) {
        if (!isSubscriptionSubcategory(sub)) return false;
        if ((rev.description || '') !== applied.subscriptionLabel) return false;
      }
      if (applied.incomeLabel) {
        if (isSubscriptionSubcategory(sub)) return false;
        if ((rev.description || '') !== applied.incomeLabel) return false;
      }
      return true;
    });
  }, [data.revenues, applied]);

  const filteredExpenses = useMemo(() => {
    return filterOwnFinanceEntries(data.expenses).filter((exp: Expense) => {
      if (!matchesDate(exp.date, applied.dateFrom, applied.dateTo)) return false;
      if (applied.clubName && (exp.clubName || '') !== applied.clubName) return false;
      if (applied.sport && (exp.sport || '') !== applied.sport) return false;
      if (
        applied.paymentMethod &&
        normalizePaymentMethod(exp.paymentMethod) !== applied.paymentMethod
      ) {
        return false;
      }
      const sub = exp.subcategory || '';
      if (applied.expenseCategory && sub !== applied.expenseCategory) return false;
      if (applied.expenseLabel && (exp.description || '') !== applied.expenseLabel) {
        return false;
      }
      return true;
    });
  }, [data.expenses, applied]);

  const incomeRows = useMemo(
    () =>
      accumulate(
        filteredIncome.map((rev) => ({
          sport: rev.sport || '',
          category: rev.subcategory || rev.category || '',
          amount: rev.amount,
          paymentMethod: rev.paymentMethod,
        })),
      ),
    [filteredIncome],
  );

  const expenseRows = useMemo(
    () =>
      accumulate(
        filteredExpenses.map((exp) => ({
          sport: exp.sport || '',
          category: exp.subcategory || exp.category || '',
          amount: exp.amount,
          paymentMethod: exp.paymentMethod,
        })),
      ),
    [filteredExpenses],
  );

  const incomeTotal = filteredIncome.reduce((s, r) => s + r.amount, 0);
  const expenseTotal = filteredExpenses.reduce((s, r) => s + r.amount, 0);
  const balance = incomeTotal - expenseTotal;
  const activeFilterCount = countActiveFilters(applied, defaults);

  const periodLabel =
    applied.dateFrom || applied.dateTo
      ? `(${applied.dateFrom ? formatDate(applied.dateFrom) : '…'} - ${
          applied.dateTo ? formatDate(applied.dateTo) : '…'
        })`
      : '(Όλα)';

  function updateDraft<K extends keyof BalanceFilters>(key: K, value: BalanceFilters[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'incomeCategory') next.incomeLabel = '';
      if (key === 'expenseCategory') next.expenseLabel = '';
      if (key === 'dateFrom' || key === 'dateTo') setActiveSeason(null);
      return next;
    });
  }

  function applyView(next = draft) {
    setApplied(next);
    setFiltersOpen(false);
    setPeriodOpen(false);
  }

  function clearFilters() {
    const next = emptyFilters();
    setDraft(next);
    setApplied(next);
    setActiveSeason(String(currentSeasonStartYear()));
  }

  function applyPeriodPreset(
    range: { dateFrom: string; dateTo: string },
    seasonId: string | null = null,
  ) {
    setDraft((prev) => ({ ...prev, ...range }));
    setActiveSeason(seasonId);
  }

  function applySeasonId(id: string) {
    const season = seasons.find((s) => s.id === id);
    if (!season) return;
    applyPeriodPreset(
      { dateFrom: season.dateFrom, dateTo: season.dateTo },
      season.id,
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = Math.floor((month - 1) / 3) + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevMonthYear = month === 1 ? year - 1 : year;
  const prevQuarter = quarter === 1 ? 4 : quarter - 1;
  const prevQuarterYear = quarter === 1 ? year - 1 : year;

  return (
    <div className="stack-lg finance-balance-panel">
      <div className="balance-toolbar no-print">
        <div className="balance-toolbar-left">
          <h2 className="balance-title">
            Ισοζύγιο <span className="balance-period">{periodLabel}</span>
          </h2>
          <div className="balance-toolbar-actions">
            <div className="balance-filters-anchor" ref={filtersAnchorRef}>
              <Button
                type="button"
                variant="secondary"
                aria-expanded={filtersOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setFiltersOpen((o) => !o);
                  setPeriodOpen(false);
                }}
              >
                <Filter size={16} /> Φίλτρα
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Button>
            </div>
            <button
              type="button"
              className="btn btn-ghost balance-icon-btn"
              title="Ανανέωση"
              onClick={() => refresh()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className="balance-toolbar-right">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              exportBalanceCsv(
                incomeRows,
                expenseRows,
                `isozigio-${localDateIso()}.csv`,
              )
            }
          >
            Excel
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => window.print()}
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      <section className="stats-grid cols-3 balance-summary">
        <StatCard
          label="Έσοδα"
          value={formatCurrency(incomeTotal)}
          icon={TrendingUp}
          tone="positive"
        />
        <StatCard
          label="Έξοδα"
          value={formatCurrency(expenseTotal)}
          icon={TrendingDown}
          tone="negative"
        />
        <StatCard
          label="Υπόλοιπο"
          value={formatCurrency(balance)}
          icon={Wallet}
          tone={balance >= 0 ? 'positive' : 'negative'}
        />
      </section>

      <BalanceTable title="Έσοδα" rows={incomeRows} />
      <BalanceTable title="Έξοδα" rows={expenseRows} />

      <AppPopupLayer
        open={filtersOpen}
        onClose={() => {
          setFiltersOpen(false);
          setPeriodOpen(false);
        }}
        anchorRef={filtersAnchorRef}
        panelClassName="balance-filters no-print"
        backdropClassName="app-popup-backdrop--dim"
        align="left"
      >
        <aside role="dialog" aria-label="Φίλτρα ισοζυγίου">
          <div className="balance-filters-top">
            <Button type="button" onClick={() => applyView()}>
              Προβολή
            </Button>
            <button
              type="button"
              className="btn btn-ghost balance-icon-btn"
              title="Ανανέωση"
              onClick={() => refresh()}
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="balance-period-wrap">
            <button
              type="button"
              className={`btn btn-secondary balance-period-toggle${periodOpen ? ' is-open' : ''}`}
              onClick={() => setPeriodOpen((o) => !o)}
            >
              Συναλλαγές
            </button>
            {periodOpen ? (
              <div className="balance-period-panel">
                <div className="balance-period-presets">
                  <button type="button" onClick={() => applyPeriodPreset(dayBounds())}>
                    Σήμερα
                  </button>
                  <button type="button" onClick={() => applyPeriodPreset(weekBounds())}>
                    Τρέχουσα εβδομάδα
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPeriodPreset(monthBounds(year, month))}
                  >
                    Τρέχον μήνας
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPeriodPreset(monthBounds(prevMonthYear, prevMonth))}
                  >
                    Προηγούμενος μήνας
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPeriodPreset(quarterBounds(year, quarter))}
                  >
                    Τρέχον τρίμηνο
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyPeriodPreset(quarterBounds(prevQuarterYear, prevQuarter))
                    }
                  >
                    Προηγούμενο τρίμηνο
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyPeriodPreset({
                        dateFrom: `${year}-01-01`,
                        dateTo: `${year}-12-31`,
                      })
                    }
                  >
                    Τρέχον έτος
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPeriodPreset({ dateFrom: '', dateTo: '' }, null)}
                  >
                    Όλα
                  </button>
                </div>

                <label className="field">
                  <span>Σεζόν</span>
                  <select
                    value={activeSeason ?? ''}
                    onChange={(e) => applySeasonId(e.target.value)}
                  >
                    <option value="">—</option>
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="balance-period-custom">
                  <span>Επιλογή περιόδου</span>
                  <div className="balance-period-dates">
                    <input
                      type="date"
                      value={draft.dateFrom}
                      onChange={(e) => updateDraft('dateFrom', e.target.value)}
                    />
                    <input
                      type="date"
                      value={draft.dateTo}
                      onChange={(e) => updateDraft('dateTo', e.target.value)}
                    />
                  </div>
                </div>

                <div className="balance-period-actions">
                  <Button type="button" onClick={() => applyView()}>
                    OK
                  </Button>
                  <Button type="button" variant="secondary" onClick={clearFilters}>
                    Εκκαθάριση
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <label className="field">
            <span>Σωματείο</span>
            <select
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
          </label>

          <label className="field">
            <span>Αθλήματα</span>
            <select
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
          </label>

          <label className="field">
            <span>Τρόπος πληρωμής</span>
            <select
              value={draft.paymentMethod}
              onChange={(e) => updateDraft('paymentMethod', e.target.value)}
            >
              <option value="">Όλοι</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Κατηγορία εσόδων</span>
            <select
              value={draft.incomeCategory}
              onChange={(e) => updateDraft('incomeCategory', e.target.value)}
            >
              <option value="">Όλες</option>
              {incomeCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Ετικέτες Εσόδων</span>
            <select
              value={draft.incomeLabel}
              onChange={(e) => updateDraft('incomeLabel', e.target.value)}
              disabled={
                !draft.incomeCategory || isSubscriptionSubcategory(draft.incomeCategory)
              }
            >
              <option value="">Όλες</option>
              {incomeLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Ετικέτες Συνδρομών</span>
            <select
              value={draft.subscriptionLabel}
              onChange={(e) => updateDraft('subscriptionLabel', e.target.value)}
            >
              <option value="">Όλες</option>
              {subscriptionLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Κατηγορία εξόδων</span>
            <select
              value={draft.expenseCategory}
              onChange={(e) => updateDraft('expenseCategory', e.target.value)}
            >
              <option value="">Όλες</option>
              {expenseCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Ετικέτες Εξόδων</span>
            <select
              value={draft.expenseLabel}
              onChange={(e) => updateDraft('expenseLabel', e.target.value)}
              disabled={!draft.expenseCategory}
            >
              <option value="">Όλες</option>
              {expenseLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </aside>
      </AppPopupLayer>
    </div>
  );
}
