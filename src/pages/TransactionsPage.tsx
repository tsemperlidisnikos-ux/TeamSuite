import { useEffect, useMemo, useRef, useState } from 'react';
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
import * as receiptBookService from '../api/services/receiptBookService';
import * as transactionsService from '../api/services/transactionsService';
import { getSession } from '../auth/auth';
import { ensureSessionClub, getClubById } from '../auth/clubs';
import {
  PaymentReceiptModal,
  type PaymentReceiptDraft,
} from '../components/PaymentReceiptModal';
import { useAppData } from '../hooks/useAppData';
import { useT } from '../i18n/LocaleContext';
import { getAppLogoUrl, getPreviewClubId } from '../platform/platformConfig';
import type { TransactionInput } from '../schemas';
import type { AthleteTransaction, Student } from '../types';
import { PAYMENT_METHODS, normalizePaymentMethod } from '../shared/paymentMethods';
import { localDateIso } from '../utils/dates';
import { formatCurrency, formatDate } from '../utils/labels';
import { amountToGreekWords } from '../utils/amountToGreekWords';
import {
  formatReceiptLabel,
  issueForTransaction,
  parseReceiptNumberInput,
  parseReceiptSeriesInput,
  previewNextReceipt,
  seriesOptions,
  validateReceiptNumberForIssue,
} from '../utils/receiptBook';
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

function seasonMonthRows(startYear: number, t: (text: string) => string) {
  return SEASON_MONTHS.map((month) => {
    const year = month >= 8 ? startYear : startYear + 1;
    const label = MONTHS.find((m) => m.value === month)?.label ?? String(month);
    return { month, year, label: `${t(label)} ${year}`, key: `${year}-${month}` };
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

function seasonYearForMonth(month: number, startYear: number): number {
  return month >= 8 ? startYear : startYear + 1;
}

function sortSeasonMonths(months: number[]): number[] {
  return [...months].sort(
    (a, b) => SEASON_MONTHS.indexOf(a) - SEASON_MONTHS.indexOf(b),
  );
}

function monthTriggerLabel(months: number[]): string {
  const sorted = sortSeasonMonths(months);
  if (!sorted.length) return 'Επιλέξτε μήνες';
  const names = sorted.map(
    (value) => MONTHS.find((m) => m.value === value)?.label ?? String(value),
  );
  if (names.length <= 3) return names.join(', ');
  return `${names.length} μήνες`;
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
  const { t } = useT();
  const { data, refresh } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();
  const transactions = data.transactions ?? [];
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seasonStart, setSeasonStart] = useState(2026);
  const [form, setForm] = useState<TransactionInput>(emptyForm());
  const [formMonths, setFormMonths] = useState<number[]>([8]);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const monthMenuRef = useRef<HTMLDivElement>(null);
  const [receiptSeries, setReceiptSeries] = useState('');
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
  const receiptBooks = useMemo(
    () =>
      seriesOptions(data.receiptNumberRanges, data.receiptIssues, data.receiptNextBySeries),
    [data.receiptNumberRanges, data.receiptIssues, data.receiptNextBySeries],
  );

  useEffect(() => {
    if (form.type !== 'payment' || editingId || receiptBooks.length === 0) return;
    if (form.receiptNumber.trim() && receiptSeries) return;
    const suggested = applySuggestedReceipt(receiptSeries);
    if (!suggested.number) return;
    setForm((prev) =>
      prev.receiptNumber.trim() ? prev : { ...prev, receiptNumber: suggested.number },
    );
  }, [form.type, editingId, receiptBooks]);

  function applySuggestedReceipt(preferredSeries = '') {
    const chosen =
      receiptBooks.find((row) => row.series === preferredSeries) ??
      receiptBooks.find((row) => !row.blocked) ??
      receiptBooks[0];
    if (!chosen) {
      setReceiptSeries('');
      return { series: '', number: '', blocked: false, error: '' };
    }
    setReceiptSeries(chosen.series);
    return {
      series: chosen.series,
      number: chosen.next != null ? String(chosen.next) : '',
      blocked: chosen.blocked,
      error: chosen.error ?? '',
    };
  }

  function applyNewForm(athleteId = '', start = seasonStart) {
    setForm(emptyForm(athleteId, start));
    setFormMonths([8]);
    setMonthMenuOpen(false);
  }

  function toggleFormMonth(month: number) {
    setFormMonths((prev) => {
      const next = editingId
        ? [month]
        : prev.includes(month)
          ? prev.filter((value) => value !== month)
          : [...prev, month];
      const months = next.length ? next : prev;
      const primary = sortSeasonMonths(months)[0] ?? month;
      setForm((current) => ({
        ...current,
        month: primary,
        year: seasonYearForMonth(primary, seasonStart),
      }));
      return months;
    });
  }

  useEffect(() => {
    if (!monthMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!monthMenuRef.current?.contains(e.target as Node)) setMonthMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [monthMenuOpen]);

  useEffect(() => {
    const fromUrl = searchParams.get('athleteId')?.trim();
    if (!fromUrl) return;
    const athlete = data.students.find((s) => s.id === fromUrl);
    if (!athlete) return;
    setSport('');
    setQuery('');
    setSelectedId(athlete.id);
    setEditingId(null);
    applyNewForm(athlete.id, seasonStart);
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
      applyNewForm('', seasonStart);
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
    const rows = seasonMonthRows(seasonStart, t);
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
  }, [seasonStart, selectedTx, selected, data.attendance, t]);

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
    applyNewForm(athlete.id, seasonStart);
    setReceiptSeries('');
    setError('');
  }

  function startEdit(tx: AthleteTransaction) {
    setSelectedId(tx.athleteId);
    setEditingId(tx.id);
    const series =
      tx.receiptSeries || parseReceiptSeriesInput(tx.receiptNumber) || receiptSeries;
    const parsedNumber = tx.receiptSeq ?? parseReceiptNumberInput(tx.receiptNumber);
    setReceiptSeries(series);
    setForm({
      athleteId: tx.athleteId,
      amount: tx.amount,
      receiptNumber:
        tx.type === 'payment' && parsedNumber
          ? String(parsedNumber)
          : tx.receiptNumber,
      type: tx.type,
      month: tx.month,
      year: tx.year,
      paymentMethod: normalizePaymentMethod(tx.paymentMethod),
      comments: tx.comments || '',
    });
    setFormMonths([tx.month]);
    setMonthMenuOpen(false);
    if (tx.type === 'payment' && !parsedNumber && receiptBooks.length) {
      const suggested = applySuggestedReceipt(series);
      setForm((prev) => ({ ...prev, receiptNumber: suggested.number }));
    }
    setSeasonStart(seasonStartFromPeriod(tx.month, tx.year));
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    applyNewForm(selectedId ?? '', seasonStart);
    setReceiptSeries('');
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
    const isCharge = form.type === 'charge';
    const payload = {
      ...form,
      athleteId: form.athleteId || selectedId || '',
      receiptNumber: isCharge ? '' : form.receiptNumber,
      paymentMethod: isCharge
        ? ''
        : ((normalizePaymentMethod(form.paymentMethod) || 'cash') as TransactionInput['paymentMethod']),
    };
    const rangesConfigured = (data.receiptNumberRanges ?? []).length > 0;
    let receiptSeriesToIssue = receiptSeries;
    let receiptNumberToIssue: number | null = parseReceiptNumberInput(form.receiptNumber);
    if (payload.type === 'payment' && rangesConfigured) {
      if (!receiptSeriesToIssue) {
        receiptSeriesToIssue = receiptBooks.find((row) => !row.blocked)?.series || receiptBooks[0]?.series || '';
      }
      if (receiptNumberToIssue == null) {
        const preview = previewNextReceipt(
          receiptSeriesToIssue,
          data.receiptNumberRanges,
          data.receiptIssues,
          data.receiptNextBySeries,
        );
        if (!preview.ok) {
          setError(preview.error);
          return;
        }
        receiptNumberToIssue = preview.number;
      }
      const existingIssue = issueForTransaction(data.receiptIssues, editingId);
      const checked = validateReceiptNumberForIssue(
        receiptSeriesToIssue,
        receiptNumberToIssue,
        data.receiptNumberRanges,
        data.receiptIssues,
        { transactionId: editingId, nextBySeries: data.receiptNextBySeries },
      );
      if (!checked.ok) {
        setError(checked.error);
        return;
      }
      if (existingIssue && existingIssue.number !== checked.number) {
        setError('Ο αριθμός απόδειξης αυτής της κίνησης έχει ήδη εκδοθεί και δεν αλλάζει από εδώ.');
        return;
      }
      payload.receiptNumber = formatReceiptLabel(checked.series, checked.number);
      receiptSeriesToIssue = checked.series;
      receiptNumberToIssue = checked.number;
    }

    const monthsToSave = editingId
      ? [payload.month]
      : sortSeasonMonths(formMonths);
    if (!monthsToSave.length) {
      setError('Επιλέξτε τουλάχιστον έναν μήνα');
      return;
    }

    setSaving(true);
    setError('');
    setMonthMenuOpen(false);

    const monthPayloads = monthsToSave.map((month) => ({
      ...payload,
      month,
      year:
        monthsToSave.length === 1 ? payload.year : seasonYearForMonth(month, seasonStart),
    }));

    if (!editingId && payload.type === 'charge') {
      const result = await transactionsService.createTransactions(monthPayloads);
      setSaving(false);
      if (!result.success || !result.data?.length) {
        setError(result.error ?? 'Σφάλμα αποθήκευσης');
        return;
      }
      const lastPayload = monthPayloads[monthPayloads.length - 1];
      if (lastPayload.athleteId) setSelectedId(lastPayload.athleteId);
      const txSeason = seasonStartFromPeriod(lastPayload.month, lastPayload.year);
      setSeasonStart(txSeason);
      setEditingId(null);
      applyNewForm(lastPayload.athleteId, txSeason);
      setReceiptSeries('');
      refresh();
      return;
    }

    let saved: AthleteTransaction | null = null;
    let lastPayload = payload;
    let nextReceiptNumber = receiptNumberToIssue;

    for (let i = 0; i < monthPayloads.length; i += 1) {
      const one = { ...monthPayloads[i] };
      if (
        one.type === 'payment' &&
        rangesConfigured &&
        receiptSeriesToIssue &&
        nextReceiptNumber &&
        !editingId
      ) {
        one.receiptNumber = formatReceiptLabel(receiptSeriesToIssue, nextReceiptNumber);
      }

      const result = editingId
        ? await transactionsService.updateTransaction(editingId, one)
        : await transactionsService.createTransaction(one);
      if (!result.success || !result.data) {
        setSaving(false);
        setError(
          result.error ??
            (i > 0
              ? `Αποθηκεύτηκαν ${i} κινήσεις. Σφάλμα στον μήνα ${MONTHS.find((m) => m.value === one.month)?.label ?? one.month}.`
              : 'Σφάλμα αποθήκευσης'),
        );
        refresh();
        return;
      }

      saved = result.data;
      lastPayload = one;
      const existingIssue = issueForTransaction(data.receiptIssues, saved.id);
      if (
        one.type === 'payment' &&
        rangesConfigured &&
        receiptSeriesToIssue &&
        nextReceiptNumber &&
        !existingIssue
      ) {
        const athlete =
          data.students.find((s) => s.id === one.athleteId) ?? selected ?? null;
        const monthLabel = t(MONTHS.find((m) => m.value === one.month)?.label ?? '');
        const issued = await receiptBookService.allocateReceiptIssue({
          series: receiptSeriesToIssue,
          number: nextReceiptNumber,
          transactionId: result.data.id,
          athleteId: one.athleteId,
          amount: one.amount,
          receivedFrom: athlete
            ? `${athlete.lastName} ${athlete.firstName}`.trim()
            : '',
          reason:
            one.comments?.trim() ||
            (monthLabel ? `Συνδρομή ${monthLabel} ${one.year}` : ''),
          kind: 'subscription',
        });
        if (!issued.success || !issued.data) {
          setSaving(false);
          setError(issued.error ?? 'Η πληρωμή αποθηκεύτηκε, αλλά ο αριθμός απόδειξης δεν εκδόθηκε.');
          refresh();
          return;
        }
        saved = {
          ...saved,
          receiptSeries: issued.data.series,
          receiptSeq: issued.data.number,
          receiptNumber: formatReceiptLabel(issued.data.series, issued.data.number),
        };
        nextReceiptNumber = issued.data.number + 1;
      }
    }
    setSaving(false);

    if (lastPayload.type === 'payment' && saved && monthsToSave.length === 1) {
      const athlete =
        data.students.find((s) => s.id === lastPayload.athleteId) ?? selected ?? null;
      const monthLabel = t(MONTHS.find((m) => m.value === lastPayload.month)?.label ?? '');
      setReceiptDraft({
        date: toReceiptDate(localDateIso()),
        series: saved.receiptSeries || receiptSeriesToIssue || '',
        number: saved.receiptSeq
          ? String(saved.receiptSeq)
          : receiptNumberToIssue
            ? String(receiptNumberToIssue)
            : '',
        amount: formatReceiptAmount(lastPayload.amount),
        receivedFrom: athlete
          ? `${athlete.lastName} ${athlete.firstName}`.trim()
          : '',
        address: athleteAddress(athlete),
        amountWords: amountToGreekWords(lastPayload.amount),
        reason:
          lastPayload.comments?.trim() ||
          (monthLabel ? `Συνδρομή ${monthLabel} ${lastPayload.year}` : ''),
      });
      setReceiptAthlete(athlete);
      setReceiptTransactionId(saved.id);
      setReceiptOpen(true);
    }

    if (lastPayload.athleteId) setSelectedId(lastPayload.athleteId);
    const txSeason = seasonStartFromPeriod(lastPayload.month, lastPayload.year);
    setSeasonStart(txSeason);
    setEditingId(null);
    applyNewForm(lastPayload.athleteId, txSeason);
    setReceiptSeries('');
    refresh();
  }

  return (
    <div className="tx-page">
      <header className="tx-page-header">
        <div>
          <h1>{t('Συναλλαγές')}</h1>
          <p>{t('Χρεώσεις, πληρωμές και υπόλοιπα αθλητών ανά σεζόν.')}</p>
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
                <span>{t('Άθλημα')}</span>
                <select
                  id="tx-sport"
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                >
                  <option value="">{t('Όλα τα αθλήματα')}</option>
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
                    <th>{t('Αρ. Δελτίου')}</th>
                    <th>{t('Επώνυμο')}</th>
                    <th>{t('Όνομα')}</th>
                    <th>{t('Πατρώνυμο')}</th>
                    <th>{t('Ημ. Γέννησης')}</th>
                    <th>{t('Υπόλοιπο σεζόν')}</th>
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
                placeholder={t('Αναζήτηση αθλητών...')}
              />
              <span>
                {filteredAthletes.length} {t('Εγγραφές')}
              </span>
            </div>
          </section>

          <section className="tx-panel">
            <PanelHeader title={editingId ? t('Επεξεργασία κίνησης') : t('Νέα κίνηση')} />
            <form
              className="tx-form athlete-payment-form"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              <div className="tx-form-grid">
                <label className="tx-field">
                  <span>{t('Ονοματεπώνυμο')}</span>
                  <input
                    type="text"
                    value={
                      selected
                        ? `${selected.lastName} ${selected.firstName}`
                        : ''
                    }
                    readOnly
                    disabled
                    placeholder={t('Επιλέξτε αθλητή από τη λίστα')}
                  />
                </label>

                <label className="tx-field">
                  <span>{t('Τύπος κίνησης')}</span>
                  <select
                    value={form.type}
                    onChange={(e) => {
                      const type = e.target.value as TransactionInput['type'];
                      if (type !== 'payment') {
                        setReceiptSeries('');
                        setForm({
                          ...form,
                          type,
                          receiptNumber: '',
                          paymentMethod: '',
                        });
                        return;
                      }
                      const suggested = applySuggestedReceipt(receiptSeries);
                      setForm({
                        ...form,
                        type,
                        receiptNumber: suggested.number || form.receiptNumber,
                      });
                      if (suggested.blocked && suggested.error) setError(suggested.error);
                    }}
                  >
                    <option value="charge">{t('Χρέωση')}</option>
                    <option value="payment">{t('Πληρωμή')}</option>
                  </select>
                </label>

                <label className="tx-field">
                  <span>{t('Ποσό (€)')}</span>
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
                    <div className="tx-field-col" ref={monthMenuRef}>
                      <span>{t('Μήνας')}</span>
                      <div className="tx-month-dropdown">
                        <button
                          type="button"
                          className="tx-month-trigger"
                          aria-haspopup="listbox"
                          aria-expanded={monthMenuOpen}
                          onClick={() => setMonthMenuOpen((open) => !open)}
                        >
                          <span>{monthTriggerLabel(formMonths)}</span>
                        </button>
                        {monthMenuOpen ? (
                          <div className="tx-month-panel" role="listbox" aria-multiselectable={!editingId}>
                            {MONTHS.map((m) => (
                              <label key={m.value} className="tx-month-option">
                                <input
                                  type="checkbox"
                                  checked={formMonths.includes(m.value)}
                                  onChange={() => toggleFormMonth(m.value)}
                                />
                                <span>{m.label}</span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <label className="tx-field-col">
                      <span>{t('Έτος')}</span>
                      <select
                        value={form.year}
                        disabled={formMonths.length > 1}
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

                {form.type === 'payment' && receiptBooks.length > 0 ? (
                  <div className="tx-field">
                    <div className="tx-field-row">
                      <label className="tx-field-col">
                        <span>{t('Σειρά')}</span>
                        {receiptBooks.length > 1 ? (
                          <select
                            value={receiptSeries}
                            onChange={(e) => {
                              const series = e.target.value;
                              const suggested = applySuggestedReceipt(series);
                              setForm({ ...form, receiptNumber: suggested.number });
                              if (suggested.blocked && suggested.error) setError(suggested.error);
                              else setError('');
                            }}
                          >
                            {receiptBooks.map((row) => (
                              <option key={row.series} value={row.series}>
                                {row.series}
                                {row.blocked ? ' · εξαντλήθηκε' : row.next ? ` · επόμ. ${row.next}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input value={receiptSeries || receiptBooks[0]?.series || ''} readOnly />
                        )}
                      </label>
                      <label className="tx-field-col">
                        <span>{t('Αρ. Απόδειξης')}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={form.receiptNumber}
                          onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })}
                        />
                      </label>
                    </div>
                    {receiptBooks.find((row) => row.series === receiptSeries)?.blocked ? (
                      <p className="form-error">
                        {receiptBooks.find((row) => row.series === receiptSeries)?.error}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <label className="tx-field">
                    <span>{t('Αρ. Απόδειξης')}</span>
                    <input
                      type="text"
                      value={form.type === 'charge' ? '' : form.receiptNumber}
                      disabled={form.type === 'charge'}
                      readOnly={form.type === 'charge'}
                      onChange={(e) => {
                        if (form.type === 'charge') return;
                        setForm({ ...form, receiptNumber: e.target.value });
                      }}
                    />
                  </label>
                )}

                <label className="tx-field">
                  <span>{t('Τρόπος πληρωμής')}</span>
                  <select
                    value={form.type === 'charge' ? '' : form.paymentMethod}
                    disabled={form.type === 'charge'}
                    onChange={(e) => {
                      if (form.type === 'charge') return;
                      setForm({
                        ...form,
                        paymentMethod: e.target.value as TransactionInput['paymentMethod'],
                      });
                    }}
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
                  <span>{t('Σχόλια')}</span>
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
                    <X size={16} /> {t('Ακύρωση')}
                  </button>
                ) : null}
                <button type="submit" className="tx-save-btn" disabled={saving}>
                  {saving ? t('Αποθήκευση...') : editingId ? t('Ενημέρωση') : t('Αποθήκευση')}
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
              {t('Εμφανίζονται μόνο καταχωρημένες χρεώσεις και πληρωμές της επιλεγμένης σεζόν.')}
            </p>
            <div className="tx-table-wrap">
              <table className="tx-table tx-finance-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>{t('Μήνας/Έτος')}</th>
                    <th colSpan={3}>{t('ΟΙΚΟΝΟΜΙΚΑ ΣΤΟΙΧΕΙΑ')}</th>
                    <th colSpan={3}>{t('ΠΑΡΟΥΣΙΟΛΟΓΙΟ')}</th>
                  </tr>
                  <tr>
                    <th>{t('Χρέωση')}</th>
                    <th>{t('Πληρωμή')}</th>
                    <th className="tx-balance-col">{t('Υπόλοιπο')}</th>
                    <th>{t('Προπονήσεις')}</th>
                    <th>{t('Παρουσίες')}</th>
                    <th>{t('Απουσίες')}</th>
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
                        <td>{tx.type === 'charge' ? t('Χρέωση') : t('Πληρωμή')}</td>
                        <td>
                          {t(MONTHS.find((m) => m.value === tx.month)?.label ?? '')} {tx.year}
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
