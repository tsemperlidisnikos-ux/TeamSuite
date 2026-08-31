import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Info,
  ArrowLeftRight,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ensureLegacyPaymentsMatched } from '../api/services/paymentMatchingService';
import * as transactionsService from '../api/services/transactionsService';
import { getSession } from '../auth/auth';
import { ensureSessionClub, getClubById } from '../auth/clubs';
import {
  PaymentReceiptModal,
  type PaymentReceiptDraft,
} from '../components/PaymentReceiptModal';
import { useAppData } from '../hooks/useAppData';
import { getAppLogoUrl, getPreviewClubId } from '../platform/platformConfig';
import type { TransactionInput } from '../schemas';
import type { AthleteTransaction, Student } from '../types';
import { PAYMENT_METHODS, normalizePaymentMethod } from '../shared/paymentMethods';
import { localDateIso } from '../utils/dates';
import { formatCurrency, formatDate } from '../utils/labels';
import { amountToGreekWords } from '../utils/amountToGreekWords';
import { seriesOptions } from '../utils/receiptBook';
import { canAccessAmka, formatAmkaForViewer } from '../utils/amkaAccess';
import { sportsMatch } from '../utils/coachScope';
import { studentClassIds } from '../utils/studentClasses';
import { studentHasSport } from '../utils/studentSports';

function toReceiptDate(isoOrEmpty: string): string {
  const raw = (isoOrEmpty || localDateIso()).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatReceiptAmount(value: number): string {
  return (Number(value) || 0).toFixed(2).replace('.', ',');
}

function athleteAddress(athlete: Student | null | undefined): string {
  if (!athlete) return '';
  return [athlete.address, athlete.postalCode, athlete.city].filter(Boolean).join(', ');
}

const MONTHS = [
  { value: 1, label: 'Ιανουάριος' },
  { value: 2, label: 'Φεβρουάριος' },
  { value: 3, label: 'Μάρτιος' },
  { value: 4, label: 'Απρίλιος' },
  { value: 5, label: 'Μάιος' },
  { value: 6, label: 'Ιούνιος' },
  { value: 7, label: 'Ιούλιος' },
  { value: 8, label: 'Αύγουστος' },
  { value: 9, label: 'Σεπτέμβριος' },
  { value: 10, label: 'Οκτώβριος' },
  { value: 11, label: 'Νοέμβριος' },
  { value: 12, label: 'Δεκέμβριος' },
];

const SEASON_MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];

function seasonMonthRows(startYear: number) {
  return SEASON_MONTHS.map((month) => {
    const year = month >= 8 ? startYear : startYear + 1;
    const label = MONTHS.find((m) => m.value === month)?.label ?? String(month);
    return { month, year, label: `${label} ${year}`, key: `${year}-${month}` };
  });
}

function txMonth(t: AthleteTransaction): number {
  return Number(t.month);
}

function txYear(t: AthleteTransaction): number {
  return Number(t.year);
}

function txAmount(t: AthleteTransaction): number {
  return Number(t.amount) || 0;
}

function seasonStartFromPeriod(month: number, year: number): number {
  return month >= 8 ? year : year - 1;
}

/** Υπόλοιπο αθλητή για συγκεκριμένη σεζόν (Αύγ→Ιούλ). */
function athleteSeasonBalance(
  athleteId: string,
  transactions: AthleteTransaction[],
  seasonStart: number,
) {
  return transactions
    .filter((t) => t.athleteId === athleteId)
    .filter((t) => seasonStartFromPeriod(txMonth(t), txYear(t)) === seasonStart)
    .reduce((sum, t) => sum + (t.type === 'charge' ? txAmount(t) : -txAmount(t)), 0);
}

function emptyForm(athleteId = '', seasonStart = 2026): TransactionInput {
  return {
    athleteId,
    amount: 0,
    receiptNumber: '',
    type: 'charge',
    month: 8,
    year: seasonStart,
    paymentMethod: '',
    comments: '',
  };
}

function PanelHeader({
  title,
  onPrev,
  onNext,
}: {
  title: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <div className="tx-panel-header">
      {onPrev ? (
        <button type="button" className="tx-nav" onClick={onPrev} aria-label="Προηγούμενο">
          <ChevronLeft size={18} />
        </button>
      ) : (
        <span className="tx-nav tx-nav-spacer" />
      )}
      <h2>{title}</h2>
      {onNext ? (
        <button type="button" className="tx-nav" onClick={onNext} aria-label="Επόμενο">
          <ChevronRight size={18} />
        </button>
      ) : (
        <span className="tx-nav tx-nav-spacer" />
      )}
    </div>
  );
}

export function TransactionsPage() {
  const { data, refresh } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();
  const transactions = data.transactions ?? [];
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seasonStart, setSeasonStart] = useState(2026);
  const [form, setForm] = useState<TransactionInput>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptAthlete, setReceiptAthlete] = useState<Student | null>(null);
  const [receiptTransactionId, setReceiptTransactionId] = useState<string | null>(null);
  const [receiptDraft, setReceiptDraft] = useState<PaymentReceiptDraft>({
    date: '',
    series: '',
    number: '',
    amount: '',
    receivedFrom: '',
    address: '',
    amountWords: '',
    reason: '',
  });

  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;
  const club = useMemo(
    () => (clubId ? getClubById(clubId) : ensureSessionClub(session)),
    [clubId, session],
  );
  const clubLogoUrl = club?.logoUrl?.trim() || getAppLogoUrl() || null;
  const clubName = club?.name?.trim() || 'Σύλλογος';

  useEffect(() => {
    ensureLegacyPaymentsMatched();
    refresh();
  }, [refresh]);

  const selected = data.students.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    const fromUrl = searchParams.get('athleteId')?.trim();
    if (!fromUrl) return;
    const athlete = data.students.find((s) => s.id === fromUrl);
    if (!athlete) return;
    setSport('');
    setQuery('');
    setSelectedId(athlete.id);
    setEditingId(null);
    setForm(emptyForm(athlete.id, seasonStart));
    setError('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('athleteId');
        return next;
      },
      { replace: true },
    );
  }, [data.students, searchParams, seasonStart, setSearchParams]);

  const amkaAllowed = canAccessAmka(session?.role);

  const sportOptions = useMemo(() => {
    const fromCatalog = (data.sports ?? [])
      .filter((s) => s.active)
      .map((s) => s.name);
    const fromClasses = (data.classes ?? []).map((c) => c.sport).filter(Boolean);
    const fromAthletes = (data.students ?? []).map((s) => s.sport).filter(Boolean);
    return Array.from(new Set([...fromCatalog, ...fromClasses, ...fromAthletes]))
      .filter((n): n is string => Boolean(n && String(n).trim()))
      .sort((a, b) => a.localeCompare(b, 'el'));
  }, [data.sports, data.classes, data.students]);

  const filteredAthletes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.students.filter((s) => {
      if (s.status === 'inactive') return false;
      if (sport) {
        if (studentHasSport(s, sport)) {
          /* ok */
        } else {
          const ok = studentClassIds(s).some((id) =>
            sportsMatch(data.classes.find((c) => c.id === id)?.sport, sport),
          );
          if (!ok) return false;
        }
      }
      if (!q) return true;
      const amkaPart = amkaAllowed ? (s.amka ?? '') : '';
      const hay = `${amkaPart} ${s.registrationNumber ?? ''} ${s.lastName} ${s.firstName} ${s.fatherFirstName ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data.students, data.classes, query, sport, amkaAllowed]);

  useEffect(() => {
    if (!selectedId) return;
    if (!filteredAthletes.some((s) => s.id === selectedId)) {
      setSelectedId(null);
      setEditingId(null);
      setForm(emptyForm('', seasonStart));
    }
  }, [filteredAthletes, selectedId, seasonStart]);

  const selectedTx = useMemo(
    () =>
      selected
        ? transactions
            .filter((t) => t.athleteId === selected.id)
            .filter(
              (t) => seasonStartFromPeriod(txMonth(t), txYear(t)) === seasonStart,
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [transactions, selected, seasonStart],
  );

  const monthRows = useMemo(() => {
    const rows = seasonMonthRows(seasonStart);
    return rows.map((row) => {
      const monthTx = selectedTx.filter(
        (t) => txMonth(t) === row.month && txYear(t) === row.year,
      );
      const charge = monthTx
        .filter((t) => t.type === 'charge')
        .reduce((sum, t) => sum + txAmount(t), 0);
      const payment = monthTx
        .filter((t) => t.type === 'payment')
        .reduce((sum, t) => sum + txAmount(t), 0);
      const attendance = selected
        ? data.attendance.filter(
            (a) =>
              a.studentId === selected.id &&
              a.date.startsWith(`${row.year}-${String(row.month).padStart(2, '0')}`),
          )
        : [];
      return {
        ...row,
        charge,
        payment,
        balance: charge - payment,
        trainings: attendance.length,
        present: attendance.filter((a) => a.present).length,
        absent: attendance.filter((a) => !a.present).length,
      };
    });
  }, [seasonStart, selectedTx, selected, data.attendance]);

  const totals = useMemo(
    () =>
      monthRows.reduce(
        (acc, row) => ({
          charge: acc.charge + row.charge,
          payment: acc.payment + row.payment,
          balance: acc.balance + row.balance,
          trainings: acc.trainings + row.trainings,
          present: acc.present + row.present,
          absent: acc.absent + row.absent,
        }),
        { charge: 0, payment: 0, balance: 0, trainings: 0, present: 0, absent: 0 },
      ),
    [monthRows],
  );

  function changeSeason(nextStart: number) {
    setSeasonStart(nextStart);
    setForm((prev) => ({
      ...prev,
      year: prev.month >= 8 ? nextStart : nextStart + 1,
    }));
  }

  function selectAthlete(athlete: Student) {
    setSelectedId(athlete.id);
    setEditingId(null);
    setForm(emptyForm(athlete.id, seasonStart));
    setError('');
  }

  function startEdit(tx: AthleteTransaction) {
    setSelectedId(tx.athleteId);
    setEditingId(tx.id);
    setForm({
      athleteId: tx.athleteId,
      amount: tx.amount,
      receiptNumber: tx.receiptNumber,
      type: tx.type,
      month: tx.month,
      year: tx.year,
      paymentMethod: normalizePaymentMethod(tx.paymentMethod),
      comments: tx.comments || '',
    });
    setSeasonStart(seasonStartFromPeriod(tx.month, tx.year));
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm(selectedId ?? '', seasonStart));
    setError('');
  }

  async function handleDelete(tx: AthleteTransaction) {
    if (!confirm('Διαγραφή κίνησης;')) return;
    const result = await transactionsService.deleteTransaction(tx.id);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα διαγραφής');
      return;
    }
    if (editingId === tx.id) cancelEdit();
    refresh();
  }

  async function handleSave() {
    if (!selectedId && !form.athleteId) {
      setError('Επιλέξτε αθλητή από τη λίστα');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      athleteId: form.athleteId || selectedId || '',
      paymentMethod: (normalizePaymentMethod(form.paymentMethod) || 'cash') as TransactionInput['paymentMethod'],
    };
    const result = editingId
      ? await transactionsService.updateTransaction(editingId, payload)
      : await transactionsService.createTransaction(payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }

    if (payload.type === 'payment' && result.data) {
      const athlete =
        data.students.find((s) => s.id === payload.athleteId) ?? selected ?? null;
      const monthLabel = MONTHS.find((m) => m.value === payload.month)?.label ?? '';
      const books = seriesOptions(data.receiptNumberRanges, data.receiptIssues);
      const openSeries = books.find((row) => !row.blocked) ?? books[0];
      setReceiptDraft({
        date: toReceiptDate(localDateIso()),
        series: result.data.receiptSeries || openSeries?.series || '',
        number: result.data.receiptSeq
          ? String(result.data.receiptSeq)
          : openSeries?.next
            ? String(openSeries.next)
            : '',
        amount: formatReceiptAmount(payload.amount),
        receivedFrom: athlete
          ? `${athlete.lastName} ${athlete.firstName}`.trim()
          : '',
        address: athleteAddress(athlete),
        amountWords: amountToGreekWords(payload.amount),
        reason:
          payload.comments?.trim() ||
          (monthLabel ? `Συνδρομή ${monthLabel} ${payload.year}` : ''),
      });
      setReceiptAthlete(athlete);
      setReceiptTransactionId(result.data.id);
      setReceiptOpen(true);
    }

    if (payload.athleteId) setSelectedId(payload.athleteId);
    const txSeason = seasonStartFromPeriod(payload.month, payload.year);
    setSeasonStart(txSeason);
    setEditingId(null);
    setForm(emptyForm(payload.athleteId, txSeason));
    refresh();
  }

  return (
    <div className="tx-page">
      <header className="tx-page-header">
        <div>
          <h1>Συναλλαγές</h1>
          <p>Χρεώσεις, πληρωμές και υπόλοιπα αθλητών ανά σεζόν.</p>
        </div>
        <span className="tx-page-icon">
          <ArrowLeftRight size={20} />
        </span>
      </header>

      <div className="tx-grid">
        <div className="tx-left">
          <section className="tx-panel">
            <PanelHeader
              title={`Αθλητές · ${seasonStart}-${seasonStart + 1}`}
              onPrev={() => changeSeason(seasonStart - 1)}
              onNext={() => changeSeason(seasonStart + 1)}
            />
            <div className="tx-filters">
              <label className="tx-filter-field" htmlFor="tx-sport">
                <span>Άθλημα</span>
                <select
                  id="tx-sport"
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                >
                  <option value="">Όλα τα αθλήματα</option>
                  {sportOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="tx-table-wrap tx-table-wrap--athletes">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>ΑΜΚΑ</th>
                    <th>Αρ. Δελτίου</th>
                    <th>Επώνυμο</th>
                    <th>Όνομα</th>
                    <th>Πατρώνυμο</th>
                    <th>Ημ. Γέννησης</th>
                    <th>Υπόλοιπο σεζόν</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAthletes.map((athlete) => {
                    const balance = athleteSeasonBalance(
                      athlete.id,
                      transactions,
                      seasonStart,
                    );
                    return (
                      <tr
                        key={athlete.id}
                        className={selectedId === athlete.id ? 'is-selected' : ''}
                        onClick={() => selectAthlete(athlete)}
                      >
                        <td>{formatAmkaForViewer(athlete.amka, amkaAllowed)}</td>
                        <td>{athlete.registrationNumber || '—'}</td>
                        <td>{athlete.lastName}</td>
                        <td>{athlete.firstName}</td>
                        <td>{athlete.fatherFirstName || '—'}</td>
                        <td>{athlete.birthDate ? formatDate(athlete.birthDate) : '—'}</td>
                        <td className="tx-balance-cell">{balance.toFixed(2)} €</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tx-panel-footer">
              <input
                className="tx-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Αναζήτηση αθλητών..."
              />
              <span>{filteredAthletes.length} Εγγραφές</span>
            </div>
          </section>

          <section className="tx-panel">
            <PanelHeader title={editingId ? 'Επεξεργασία κίνησης' : 'Νέα κίνηση'} />
            <form
              className="tx-form athlete-payment-form"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              <div className="tx-form-grid">
                <label className="tx-field">
                  <span>Ονοματεπώνυμο</span>
                  <input
                    type="text"
                    value={
                      selected
                        ? `${selected.lastName} ${selected.firstName}`
                        : ''
                    }
                    readOnly
                    disabled
                    placeholder="Επιλέξτε αθλητή από τη λίστα"
                  />
                </label>

                <label className="tx-field">
                  <span>Τύπος κίνησης</span>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as TransactionInput['type'] })
                    }
                  >
                    <option value="charge">Χρέωση</option>
                    <option value="payment">Πληρωμή</option>
                  </select>
                </label>

                <label className="tx-field">
                  <span>Ποσό (€)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount || ''}
                    onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  />
                </label>

                <div className="tx-field">
                  <div className="tx-field-row">
                    <label className="tx-field-col">
                      <span>Μήνας</span>
                      <select
                        value={form.month}
                        onChange={(e) => {
                          const month = Number(e.target.value);
                          setForm({
                            ...form,
                            month,
                            year: month >= 8 ? seasonStart : seasonStart + 1,
                          });
                        }}
                      >
                        {MONTHS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="tx-field-col">
                      <span>Έτος</span>
                      <select
                        value={form.year}
                        onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                      >
                        {[2025, 2026, 2027, 2028].map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <label className="tx-field">
                  <span>Αρ. Απόδειξης</span>
                  <input
                    type="text"
                    value={form.receiptNumber}
                    onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })}
                  />
                </label>

                <label className="tx-field">
                  <span>Τρόπος πληρωμής</span>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        paymentMethod: e.target.value as TransactionInput['paymentMethod'],
                      })
                    }
                  >
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="tx-field tx-field-notes">
                  <span>Σχόλια</span>
                  <textarea
                    rows={2}
                    maxLength={90}
                    placeholder="Προαιρετικά σχόλια για τη κίνηση"
                    value={form.comments}
                    onChange={(e) => setForm({ ...form, comments: e.target.value.slice(0, 90) })}
                  />
                </label>
              </div>

              {error ? <p className="form-error">{error}</p> : null}

              <div className="tx-form-actions">
                {editingId ? (
                  <button type="button" className="tx-cancel-btn" onClick={cancelEdit}>
                    <X size={16} /> Ακύρωση
                  </button>
                ) : null}
                <button type="submit" className="tx-save-btn" disabled={saving}>
                  {saving ? 'Αποθήκευση...' : editingId ? 'Ενημέρωση' : 'Αποθήκευση'}
                </button>
              </div>
            </form>
          </section>
        </div>

        <div className="tx-right">
          <section className="tx-panel tx-panel-soft">
            <PanelHeader
              title={`${seasonStart}-${seasonStart + 1}`}
              onPrev={() => changeSeason(seasonStart - 1)}
              onNext={() => changeSeason(seasonStart + 1)}
            />
            <p className="tx-hint">
              Εμφανίζονται μόνο καταχωρημένες χρεώσεις και πληρωμές της επιλεγμένης σεζόν.
            </p>
            <div className="tx-table-wrap">
              <table className="tx-table tx-finance-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>Μήνας/Έτος</th>
                    <th colSpan={3}>ΟΙΚΟΝΟΜΙΚΑ ΣΤΟΙΧΕΙΑ</th>
                    <th colSpan={3}>ΠΑΡΟΥΣΙΟΛΟΓΙΟ</th>
                  </tr>
                  <tr>
                    <th>Χρέωση</th>
                    <th>Πληρωμή</th>
                    <th className="tx-balance-col">Υπόλοιπο</th>
                    <th>Προπονήσεις</th>
                    <th>Παρουσίες</th>
                    <th>Απουσίες</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{row.charge.toFixed(2)} €</td>
                      <td>{row.payment.toFixed(2)} €</td>
                      <td className="tx-balance-col">{row.balance.toFixed(2)} €</td>
                      <td>{row.trainings || ''}</td>
                      <td>{row.present || ''}</td>
                      <td>{row.absent || ''}</td>
                    </tr>
                  ))}
                  <tr className="tx-total-row">
                    <td>Σύνολο</td>
                    <td>{totals.charge.toFixed(2)} €</td>
                    <td>{totals.payment.toFixed(2)} €</td>
                    <td className="tx-balance-col">{totals.balance.toFixed(2)} €</td>
                    <td>{totals.trainings || ''}</td>
                    <td>{totals.present || ''}</td>
                    <td>{totals.absent || ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="tx-panel">
            <PanelHeader title={`Κινήσεις ${seasonStart}-${seasonStart + 1}`} />
            {!selected ? (
              <div className="tx-empty-info">
                <Info size={18} />
                <p>
                  Αναζητήστε και επιλέξτε αθλητή για να εμφανιστούν τα οικονομικά στοιχεία και οι
                  συναλλαγές.
                </p>
              </div>
            ) : selectedTx.length === 0 ? (
              <div className="tx-empty-info">
                <Info size={18} />
                <p>Δεν υπάρχουν κινήσεις για τον αθλητή στη σεζόν {seasonStart}-{seasonStart + 1}.</p>
              </div>
            ) : (
              <div className="tx-table-wrap tx-table-wrap--movements">
                <table className="tx-table tx-table--movements">
                  <thead>
                    <tr>
                      <th>Ημ/νία</th>
                      <th>Τύπος</th>
                      <th>Περίοδος</th>
                      <th>Απόδειξη</th>
                      <th>Ποσό</th>
                      <th className="tx-comments-col">Σχόλια</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTx.map((tx) => (
                      <tr key={tx.id} className={editingId === tx.id ? 'is-selected' : ''}>
                        <td>{formatDate(tx.createdAt.slice(0, 10))}</td>
                        <td>{tx.type === 'charge' ? 'Χρέωση' : 'Πληρωμή'}</td>
                        <td>
                          {MONTHS.find((m) => m.value === tx.month)?.label} {tx.year}
                        </td>
                        <td>{tx.receiptNumber || '—'}</td>
                        <td>{formatCurrency(tx.amount)}</td>
                        <td className="tx-comments-col">
                          <span className="tx-comments-text">{tx.comments || '—'}</span>
                        </td>
                        <td className="tx-row-actions">
                          <button
                            type="button"
                            className="tx-icon-btn"
                            aria-label="Επεξεργασία"
                            title="Επεξεργασία"
                            onClick={() => startEdit(tx)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="tx-icon-btn tx-icon-btn--danger"
                            aria-label="Διαγραφή"
                            title="Διαγραφή"
                            onClick={() => void handleDelete(tx)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="tx-panel-footer tx-panel-footer-end">
              <span>{selected ? selectedTx.length : 0} Εγγραφές</span>
            </div>
          </section>
        </div>
      </div>

      <PaymentReceiptModal
        open={receiptOpen}
        logoUrl={clubLogoUrl}
        clubName={clubName}
        clubId={clubId}
        athleteId={receiptAthlete?.id ?? null}
        transactionId={receiptTransactionId}
        fatherEmail={receiptAthlete?.fatherEmail}
        motherEmail={receiptAthlete?.motherEmail}
        initial={receiptDraft}
        onClose={() => {
          setReceiptOpen(false);
          setReceiptTransactionId(null);
        }}
      />
    </div>
  );
}
