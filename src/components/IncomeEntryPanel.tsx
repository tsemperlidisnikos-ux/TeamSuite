import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import {
  ATHLETE_INCOME_SUBCATEGORY,
  ensureAthletePaymentRevenuesSynced,
} from '../api/services/athletePaymentRevenueBridge';
import { ensureLegacyPaymentsMatched } from '../api/services/paymentMatchingService';
import * as financeService from '../api/services/financeService';
import { assertFinanceMonthOpen } from '../api/services/financePeriodService';
import * as transactionsService from '../api/services/transactionsService';
import { getData } from '../data/repository';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { RevenueInput } from '../schemas';
import {
  isSubscriptionSubcategory,
  mapIncomeSubcategoryToCategory,
  personNameKind,
  requiresPersonName,
} from '../shared/financeCategories';
import {
  getConfiguredIncomeCategories,
  getConfiguredIncomeDescriptions,
} from '../platform/financeCatalog';
import { PAYMENT_METHODS } from '../shared/paymentMethods';
import { localDateIso } from '../utils/dates';
import { formatCurrency, formatDate } from '../utils/labels';
import type { PaymentMethod, Revenue } from '../types';

const today = () => localDateIso();

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

export function IncomeEntryPanel({ onSaved }: { onSaved: () => void }) {
  const { data, refresh } = useAppData();
  const [subcategory, setSubcategory] = useState<string>(ATHLETE_INCOME_SUBCATEGORY);
  const [clubName, setClubName] = useState('');
  const [sport, setSport] = useState('');
  const [studentId, setStudentId] = useState('');
  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [date, setDate] = useState(today);
  const [subscriptionPeriod, setSubscriptionPeriod] = useState(today().slice(0, 7));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [accountId, setAccountId] = useState('');
  const [vatRate, setVatRate] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const matched = ensureLegacyPaymentsMatched();
    const linkedBefore = getData().revenues.filter((r) => r.linkedTransactionId).length;
    ensureAthletePaymentRevenuesSynced();
    const linkedAfter = getData().revenues.filter((r) => r.linkedTransactionId).length;
    if (matched > 0 || linkedAfter !== linkedBefore) refresh();
  }, [refresh]);

  const incomeCategories = useMemo(() => {
    const configured = getConfiguredIncomeCategories().filter(
      (item) => item !== ATHLETE_INCOME_SUBCATEGORY,
    );
    return [ATHLETE_INCOME_SUBCATEGORY, ...configured];
  }, []);
  const isAthletePayments = subcategory === ATHLETE_INCOME_SUBCATEGORY;
  const showPersonFields = requiresPersonName(subcategory);
  const showSubscriptionPeriod = isSubscriptionSubcategory(subcategory);
  const nameKind = personNameKind(subcategory);
  const descriptions = getConfiguredIncomeDescriptions(subcategory);
  const cashAccounts = useMemo(
    () => (data.cashAccounts ?? []).filter((a) => a.active),
    [data.cashAccounts],
  );

  const clubs = useMemo(
    () => (data.associations ?? []).filter((a) => a.active !== false),
    [data.associations],
  );
  const sports = useMemo(() => (data.sports ?? []).filter((s) => s.active), [data.sports]);

  const registryPeople = useMemo(() => {
    if (nameKind !== 'athletes') return [];
    return [...data.students]
      .filter((s) => s.status !== 'inactive')
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [data.students, nameKind]);

  const filteredRevenues = useMemo(
    () =>
      [...data.revenues]
        .filter((r) => (r.subcategory || '') === subcategory)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.revenues, subcategory],
  );

  const subcategoryTotal = filteredRevenues.reduce((sum, r) => sum + r.amount, 0);

  function handleSubcategoryChange(next: string) {
    setSubcategory(next);
    setDescription('');
    setStudentId('');
    setSurname('');
    setFirstName('');
  }

  function handleRegistrySelect(id: string) {
    setStudentId(id);
    const student = data.students.find((s) => s.id === id);
    if (!student) {
      setSurname('');
      setFirstName('');
      return;
    }
    setSurname(student.lastName);
    setFirstName(student.firstName);
    if (student.clubName) setClubName(student.clubName);
    if (student.sport) setSport(student.sport);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!clubName) {
      setError('Επιλέξτε σωματείο');
      return;
    }
    if (!sport) {
      setError('Επιλέξτε άθλημα');
      return;
    }
    if (!description) {
      setError('Επιλέξτε περιγραφή');
      return;
    }
    if (amount <= 0) {
      setError('Το ποσό πρέπει να είναι θετικό');
      return;
    }
    if (showPersonFields && (!surname.trim() || !firstName.trim())) {
      setError('Συμπληρώστε επώνυμο και όνομα');
      return;
    }

    setSaving(true);
    setError('');
    const payload: RevenueInput = {
      date,
      amount,
      category: mapIncomeSubcategoryToCategory(subcategory, description),
      description,
      paymentStatus: 'paid',
      studentId: studentId || undefined,
      subcategory,
      clubName,
      sport,
      surname: showPersonFields ? surname.trim() : '',
      firstName: showPersonFields ? firstName.trim() : '',
      subscriptionPeriod: showSubscriptionPeriod ? subscriptionPeriod : '',
      notes,
      paymentMethod,
      accountId: accountId || '',
      vatRate,
    };
    const result = await financeService.createRevenue(payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setDescription('');
    setAmount(0);
    setNotes('');
    setStudentId('');
    setSurname('');
    setFirstName('');
    onSaved();
  }

  async function handleDelete(rev: Revenue) {
    const confirmMsg = rev.linkedTransactionId
      ? 'Διαγραφή πληρωμής αθλητή και των σχετικών εσόδων;'
      : 'Διαγραφή εσόδου;';
    if (!confirm(confirmMsg)) return;
    setDeletingId(rev.id);
    setError('');
    try {
      assertFinanceMonthOpen(rev.date);
    } catch (err) {
      setDeletingId(null);
      setError(err instanceof Error ? err.message : 'Δεν επιτρέπεται η διαγραφή');
      return;
    }
    const result = rev.linkedTransactionId
      ? await transactionsService.deleteTransaction(rev.linkedTransactionId)
      : await financeService.deleteRevenue(rev.id);
    setDeletingId(null);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα διαγραφής');
      return;
    }
    onSaved();
  }

  return (
    <section className="income-entry-panel">
      <div className="income-entry-heading">
        <div>
          <p className="eyebrow">Κατηγορία</p>
          <h2>ΕΣΟΔΑ</h2>
          <p className="lede">
            Καταχώρηση εσόδων συλλόγου ανά υποκατηγορία, μαζί με αυτόματες πληρωμές αθλητών
            (εγγραφές, συνδρομές, κάρτες διαρκείας).
          </p>
        </div>
        <div className="stat-pill">
          <span>Σύνολο υποκατηγορίας</span>
          <strong>{formatCurrency(subcategoryTotal)}</strong>
        </div>
      </div>

      <div className="entry-form subcategory-bar">
        <TitleAnalysisTable>
          <TitleAnalysisRow title="Υποκατηγορία" htmlFor="income-subcategory">
            <select
              id="income-subcategory"
              value={subcategory}
              onChange={(e) => handleSubcategoryChange(e.target.value)}
            >
              {incomeCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>
        </TitleAnalysisTable>
      </div>

      {isAthletePayments ? (
        <p className="admin-entry-note">
          Τα έσοδα αυτής της κατηγορίας προστίθενται αυτόματα από τις πληρωμές αθλητών
          (Συνδρομές / Κινήσεις / Viva): εγγραφές, μηνιαίες ή ετήσιες συνδρομές και κάρτες
          διαρκείας. Εμφανίζονται και στην Ανάλυση.
        </p>
      ) : null}

      {isAthletePayments ? null : (
      <form className="entry-form" onSubmit={(e) => void handleSubmit(e)}>
        <TitleAnalysisTable>
          <TitleAnalysisRow title="Σωματείο" htmlFor="income-club">
            <select
              id="income-club"
              value={clubName}
              onChange={(e) => {
                setClubName(e.target.value);
                setSport('');
              }}
              required
            >
              <option value="">Επιλέξτε σωματείο...</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>

          <TitleAnalysisRow title="Άθλημα" htmlFor="income-sport">
            <select
              id="income-sport"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              disabled={!clubName}
              required
            >
              <option value="">
                {clubName ? 'Επιλέξτε άθλημα...' : 'Επιλέξτε πρώτα σωματείο...'}
              </option>
              {sports.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>

          {showPersonFields ? (
            <>
              <TitleAnalysisRow title="Από μητρώο" htmlFor="income-registry">
                <select
                  id="income-registry"
                  value={studentId}
                  onChange={(e) => handleRegistrySelect(e.target.value)}
                >
                  <option value="">Επιλέξτε από μητρώο...</option>
                  {registryPeople.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.lastName} {s.firstName}
                    </option>
                  ))}
                </select>
                {nameKind === 'members' || registryPeople.length === 0 ? (
                  <p className="ta-hint ta-hint--warn">
                    Δεν υπάρχουν καταχωρήσεις στο μητρώο. Προσθέστε από τη σελίδα Μητρώο ή
                    συμπληρώστε χειροκίνητα.
                  </p>
                ) : null}
              </TitleAnalysisRow>
              <TitleAnalysisRow title="Επώνυμο" htmlFor="income-surname">
                <input
                  id="income-surname"
                  value={surname}
                  onChange={(e) => {
                    setSurname(e.target.value);
                    setStudentId('');
                  }}
                  placeholder={nameKind === 'members' ? 'Επώνυμο μέλους' : 'Επώνυμο αθλητή'}
                  required
                />
              </TitleAnalysisRow>
              <TitleAnalysisRow title="Όνομα" htmlFor="income-firstname">
                <input
                  id="income-firstname"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    setStudentId('');
                  }}
                  placeholder={nameKind === 'members' ? 'Όνομα μέλους' : 'Όνομα αθλητή'}
                  required
                />
              </TitleAnalysisRow>
            </>
          ) : null}

          <TitleAnalysisRow title="Ημερομηνία" htmlFor="income-date">
            <input
              id="income-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (showSubscriptionPeriod) {
                  setSubscriptionPeriod(e.target.value.slice(0, 7));
                }
              }}
              required
            />
          </TitleAnalysisRow>

          {showSubscriptionPeriod ? (
            <TitleAnalysisRow title="Μήνας συνδρομής" htmlFor="income-period">
              <input
                id="income-period"
                type="month"
                value={subscriptionPeriod}
                onChange={(e) => setSubscriptionPeriod(e.target.value)}
                required
              />
            </TitleAnalysisRow>
          ) : null}

          <TitleAnalysisRow title="Περιγραφή" htmlFor="income-description">
            <select
              id="income-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            >
              <option value="">Επιλέξτε περιγραφή...</option>
              {descriptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>

          <TitleAnalysisRow title="Τρόπος πληρωμής" htmlFor="income-method">
            <select
              id="income-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>

          <TitleAnalysisRow title="Ταμείο / λογαριασμός" htmlFor="income-account">
            <select
              id="income-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">— χωρίς ταμείο —</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </TitleAnalysisRow>

          <TitleAnalysisRow title="ΦΠΑ %" htmlFor="income-vat">
            <select
              id="income-vat"
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value) || 0)}
            >
              <option value={0}>0%</option>
              <option value={6}>6%</option>
              <option value={13}>13%</option>
              <option value={24}>24%</option>
            </select>
          </TitleAnalysisRow>

          <TitleAnalysisRow title="Ποσό" htmlFor="income-amount">
            <div className="ta-amount">
              <input
                id="income-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
              <span>€</span>
            </div>
          </TitleAnalysisRow>

          <TitleAnalysisRow title="Σημειώσεις" htmlFor="income-notes">
            <textarea
              id="income-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </TitleAnalysisRow>

          <TitleAnalysisRow title="Παραστατικό" htmlFor="income-file">
            <div className="ta-file">
              <input id="income-file" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple />
              <p className="ta-hint">Έως 2 αρχεία (PDF, JPG, PNG), max ~200KB το καθένα.</p>
            </div>
          </TitleAnalysisRow>
        </TitleAnalysisTable>

        <div className="income-entry-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Αποθήκευση…' : 'Καταχώρηση εσόδου'}
          </Button>
        </div>
      </form>
      )}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="income-entry-list">
        {filteredRevenues.length === 0 ? (
          <p className="income-entry-empty">
            {isAthletePayments
              ? 'Δεν υπάρχουν ακόμη πληρωμές αθλητών για εμφάνιση ως έσοδα.'
              : 'Δεν υπάρχουν εγγραφές ακόμη.'}
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ημερομηνία</th>
                <th>Περιγραφή</th>
                <th>Σωματείο</th>
                <th>Άθλημα</th>
                <th>Περίοδος</th>
                <th>Ποσό</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRevenues.map((rev) => (
                <tr key={rev.id}>
                  <td>{formatDate(rev.date)}</td>
                  <td>
                    {rev.description}
                    {rev.surname ? ` — ${rev.surname} ${rev.firstName}` : ''}
                  </td>
                  <td>{rev.clubName || '—'}</td>
                  <td>{rev.sport || '—'}</td>
                  <td>{rev.subscriptionPeriod || '—'}</td>
                  <td>{formatCurrency(rev.amount)}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label="Διαγραφή"
                      disabled={deletingId === rev.id}
                      onClick={() => void handleDelete(rev)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
