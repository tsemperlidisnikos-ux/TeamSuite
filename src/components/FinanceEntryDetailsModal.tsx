import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import * as financeService from '../api/services/financeService';
import { useAppData } from '../hooks/useAppData';
import type { ExpenseInput, RevenueInput } from '../schemas';
import { PAYMENT_METHODS } from '../shared/paymentMethods';
import {
  isCanteenFinanceCategory,
  expenseSkipsSportAndClass,
  matchExpenseTotal,
  matchTravelTotal,
  normalizeMatchExpenseDetails,
} from '../shared/financeCategories';
import type { CashAccount, Expense, MatchExpenseDetails, PaymentMethod, Revenue } from '../types';
import { sportsMatch } from '../utils/coachScope';
import { formatCurrency, formatMoneyAmount, parseMoneyInput } from '../utils/labels';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

type Props =
  | {
      kind: 'revenue';
      entry: Revenue | null;
      cashAccounts: CashAccount[];
      onClose: () => void;
      onSaved: () => void;
    }
  | {
      kind: 'expense';
      entry: Expense | null;
      cashAccounts: CashAccount[];
      onClose: () => void;
      onSaved: () => void;
    };

const MATCH_AMOUNT_FIELDS: Array<{
  key: keyof Pick<
    MatchExpenseDetails,
    | 'referees'
    | 'judges'
    | 'commissioner'
    | 'observer'
    | 'doctor'
    | 'travelReferees'
    | 'travelJudges'
    | 'travelCommissioner'
    | 'travelObserver'
    | 'transportBus'
    | 'transportPlane'
    | 'transportShip'
    | 'transportOther'
    | 'accommodation'
    | 'food'
  >;
  label: string;
}> = [
  { key: 'referees', label: 'Έξοδα διαιτητές' },
  { key: 'judges', label: 'Έξοδα κριτές' },
  { key: 'commissioner', label: 'Έξοδα κομισάριου' },
  { key: 'observer', label: 'Έξοδα παρατηρητή / Video Observer' },
  { key: 'doctor', label: 'Έξοδα ιατρού' },
  { key: 'travelReferees', label: 'Οδοιπορικά διαιτητές' },
  { key: 'travelJudges', label: 'Οδοιπορικά κριτές' },
  { key: 'travelCommissioner', label: 'Οδοιπορικά κομισάριου' },
  { key: 'travelObserver', label: 'Οδοιπορικά παρατηρητή / Video Observer' },
  { key: 'transportBus', label: 'Λεωφορείο' },
  { key: 'transportPlane', label: 'Αεροπλάνο' },
  { key: 'transportShip', label: 'Πλοίο' },
  { key: 'transportOther', label: 'Άλλη μετακίνηση' },
  { key: 'accommodation', label: 'Διαμονή' },
  { key: 'food', label: 'Διατροφή' },
];

function MoneyAmountInput({
  value,
  onChange,
  min = 0,
  disabled,
  required,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  disabled?: boolean;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(formatMoneyAmount(value));
  return (
    <div className="ta-amount">
      <input
        type="number"
        min={min}
        step="0.01"
        inputMode="decimal"
        value={focused ? draft : formatMoneyAmount(value)}
        disabled={disabled}
        required={required}
        onFocus={() => {
          setFocused(true);
          setDraft(formatMoneyAmount(value));
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(parseMoneyInput(e.target.value));
        }}
        onBlur={() => setFocused(false)}
      />
      <span aria-hidden="true">€</span>
    </div>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`finance-entry-field${full ? ' full-width' : ''}`}>
      <span className="finance-entry-field-label">{label}</span>
      {children}
    </label>
  );
}

function CatalogSelect({
  value,
  options,
  emptyLabel,
  disabled,
  onChange,
}: {
  value: string;
  options: string[];
  emptyLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const names = options.filter(Boolean);
  if (value && !names.includes(value)) names.unshift(value);
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function useFinanceOrgOptions(sportFilter = '') {
  const { data } = useAppData();
  const clubs = useMemo(
    () => (data.associations ?? []).filter((a) => a.active !== false).map((a) => a.name),
    [data.associations],
  );
  const sports = useMemo(
    () => (data.sports ?? []).filter((s) => s.active).map((s) => s.name),
    [data.sports],
  );
  const classes = useMemo(() => {
    const list = data.classes ?? [];
    if (!sportFilter) return list.map((item) => item.name);
    return list.filter((item) => sportsMatch(item.sport, sportFilter)).map((item) => item.name);
  }, [data.classes, sportFilter]);
  return { clubs, sports, classes };
}

function RevenueEditor({
  entry,
  cashAccounts,
  onClose,
  onSaved,
}: {
  entry: Revenue;
  cashAccounts: CashAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(entry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const linked = Boolean(entry.linkedTransactionId || entry.linkedRentalBookingId);
  const skipSportAndClass = isCanteenFinanceCategory(draft.subcategory ?? '');
  const { clubs, sports } = useFinanceOrgOptions(draft.sport ?? '');

  useEffect(() => setDraft(entry), [entry]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (linked) return;
    setSaving(true);
    setError('');
    const payload: RevenueInput = {
      date: draft.date,
      amount: Number(draft.amount),
      category: draft.category,
      description: draft.description,
      paymentStatus: draft.paymentStatus,
      studentId: draft.studentId,
      subcategory: draft.subcategory ?? '',
      clubName: draft.clubName ?? '',
      sport: draft.sport ?? '',
      surname: draft.surname ?? '',
      firstName: draft.firstName ?? '',
      subscriptionPeriod: draft.subscriptionPeriod ?? '',
      notes: draft.notes ?? '',
      paymentMethod: draft.paymentMethod ?? '',
      accountId: draft.accountId ?? '',
      vatRate: draft.vatRate ?? 0,
    };
    const result = await financeService.updateRevenue(entry.id, payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Η διόρθωση δεν αποθηκεύτηκε');
      return;
    }
    onSaved();
    onClose();
  }

  const source = entry.linkedTransactionId
    ? 'Αυτόματη εγγραφή από πληρωμή αθλητή'
    : entry.linkedRentalBookingId
      ? 'Αυτόματη εγγραφή από είσπραξη ενοικίασης'
      : 'Χειροκίνητη καταχώρηση';

  return (
    <form className="finance-entry-details-form" onSubmit={(event) => void submit(event)}>
      <div className="finance-entry-details-scroll">
      <p className="admin-entry-note">
        <strong>Προέλευση:</strong> {source}
        {linked
          ? ' — η διόρθωση πρέπει να γίνει στην αρχική πληρωμή ή ενοικίαση ώστε να παραμείνουν σωστά τα συνδεδεμένα στοιχεία.'
          : ' — μπορείτε να αλλάξετε ή να αδειάσετε οποιοδήποτε πεδίο και να πατήσετε «Αποθήκευση διόρθωσης».'}
      </p>
      <div className="form-grid">
        <Field label="Ημερομηνία">
          <input
            type="date"
            value={draft.date}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            required
          />
        </Field>
        <Field label="Ποσό">
          <input
            type="number"
            min={0.01}
            step="0.01"
            inputMode="decimal"
            value={draft.amount}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, amount: parseMoneyInput(e.target.value) })}
            required
          />
        </Field>
        <Field label="Υποκατηγορία">
          <input
            value={draft.subcategory ?? ''}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, subcategory: e.target.value })}
          />
        </Field>
        <Field label="Κατάσταση">
          <select
            value={draft.paymentStatus}
            disabled={linked}
            onChange={(e) =>
              setDraft({
                ...draft,
                paymentStatus: e.target.value as Revenue['paymentStatus'],
              })
            }
          >
            <option value="paid">Πληρωμένο</option>
            <option value="pending">Σε αναμονή</option>
            <option value="overdue">Εκπρόθεσμο</option>
          </select>
        </Field>
        <Field label="Περιγραφή" full>
          <input
            value={draft.description}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            required
          />
        </Field>
        <Field label="Σωματείο">
          <CatalogSelect
            value={draft.clubName ?? ''}
            options={clubs}
            emptyLabel={skipSportAndClass ? 'Δεν απαιτείται' : '— χωρίς σωματείο —'}
            disabled={linked}
            onChange={(clubName) => setDraft({ ...draft, clubName })}
          />
        </Field>
        <Field label="Άθλημα">
          <CatalogSelect
            value={draft.sport ?? ''}
            options={sports}
            emptyLabel={skipSportAndClass ? 'Δεν απαιτείται' : '— χωρίς άθλημα —'}
            disabled={linked}
            onChange={(sport) => setDraft({ ...draft, sport })}
          />
        </Field>
        {skipSportAndClass && !linked && (draft.clubName || draft.sport) ? (
          <div className="finance-entry-field full-width">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraft({ ...draft, clubName: '', sport: '' })}
            >
              Άδειασμα σωματείου / αθλήματος
            </Button>
          </div>
        ) : null}
        <Field label="Επώνυμο">
          <input
            value={draft.surname ?? ''}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, surname: e.target.value })}
          />
        </Field>
        <Field label="Όνομα">
          <input
            value={draft.firstName ?? ''}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
          />
        </Field>
        <Field label="Μήνας συνδρομής">
          <input
            type="month"
            value={draft.subscriptionPeriod ?? ''}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, subscriptionPeriod: e.target.value })}
          />
        </Field>
        <Field label="Τρόπος πληρωμής">
          <select
            value={draft.paymentMethod ?? ''}
            disabled={linked}
            onChange={(e) =>
              setDraft({ ...draft, paymentMethod: e.target.value as PaymentMethod })
            }
          >
            <option value="">— χωρίς τρόπο —</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ταμείο / λογαριασμός">
          <select
            value={draft.accountId ?? ''}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
          >
            <option value="">— χωρίς ταμείο —</option>
            {cashAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ΦΠΑ %">
          <input
            type="number"
            min={0}
            max={100}
            value={draft.vatRate ?? 0}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, vatRate: Number(e.target.value) })}
          />
        </Field>
        <Field label="Σημειώσεις" full>
          <textarea
            rows={3}
            value={draft.notes ?? ''}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </Field>
      </div>
      <p className="ta-hint">
        Κωδικός: {entry.id}
        {entry.createdByEmail ? ` · Καταχώρηση από: ${entry.createdByEmail}` : ''}
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      </div>
      <div className="finance-entry-modal-actions">
        <Button type="button" variant="secondary" onClick={onClose}>
          Κλείσιμο
        </Button>
        {!linked ? (
          <Button type="submit" disabled={saving}>
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση διόρθωσης'}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ExpenseEditor({
  entry,
  cashAccounts,
  onClose,
  onSaved,
}: {
  entry: Expense;
  cashAccounts: CashAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(entry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const skipSportAndClass = isCanteenFinanceCategory(draft.subcategory ?? '');
  const skipSportClassFields = expenseSkipsSportAndClass(draft.subcategory ?? '');
  const { clubs, sports, classes } = useFinanceOrgOptions(draft.sport ?? '');

  useEffect(
    () =>
      setDraft(
        entry.matchDetails
          ? { ...entry, matchDetails: normalizeMatchExpenseDetails(entry.matchDetails) }
          : entry,
      ),
    [entry],
  );

  const matchTotal = useMemo(
    () => (draft.matchDetails ? matchExpenseTotal(draft.matchDetails) : Number(draft.amount)),
    [draft.amount, draft.matchDetails],
  );

  function setMatchField<K extends keyof MatchExpenseDetails>(
    key: K,
    value: MatchExpenseDetails[K],
  ) {
    if (!draft.matchDetails) return;
    setDraft({ ...draft, matchDetails: { ...draft.matchDetails, [key]: value } });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload: ExpenseInput = {
      date: draft.date,
      amount: matchTotal,
      category: draft.category,
      description: draft.description,
      vendor: draft.vendor ?? '',
      subcategory: draft.subcategory ?? '',
      clubName: skipSportAndClass ? '' : (draft.clubName ?? ''),
      sport: skipSportClassFields ? '' : (draft.sport ?? ''),
      className: skipSportClassFields ? '' : (draft.className ?? ''),
      surname: draft.surname ?? '',
      firstName: draft.firstName ?? '',
      studentId: draft.studentId,
      notes: draft.notes ?? '',
      matchDetails: draft.matchDetails
        ? {
            ...normalizeMatchExpenseDetails(draft.matchDetails),
            travelAllowance: matchTravelTotal(draft.matchDetails),
          }
        : undefined,
      paymentMethod: draft.paymentMethod ?? '',
      accountId: draft.accountId ?? '',
      vatRate: draft.vatRate ?? 0,
    };
    const result = await financeService.updateExpense(entry.id, payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Η διόρθωση δεν αποθηκεύτηκε');
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <form className="finance-entry-details-form" onSubmit={(event) => void submit(event)}>
      <div className="finance-entry-details-scroll">
      <p className="admin-entry-note">
        Μπορείτε να αλλάξετε ή να αδειάσετε οποιοδήποτε πεδίο και να πατήσετε «Αποθήκευση
        διόρθωσης».
        {skipSportAndClass
          ? ' Για καντίνα / κυλικείο το σωματείο, το άθλημα και το τμήμα δεν απαιτούνται.'
          : skipSportClassFields
            ? ' Το άθλημα και το τμήμα δεν απαιτούνται για αυτή την υποκατηγορία.'
            : ''}
      </p>
      <div className="form-grid">
        <Field label="Ημερομηνία">
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            required
          />
        </Field>
        <Field label={draft.matchDetails ? 'Σύνολο αγώνα' : 'Ποσό'}>
          <MoneyAmountInput
            min={0.01}
            value={matchTotal}
            disabled={Boolean(draft.matchDetails)}
            onChange={(amount) => setDraft({ ...draft, amount })}
            required
          />
        </Field>
        <Field label="Υποκατηγορία">
          <input
            value={draft.subcategory ?? ''}
            onChange={(e) => setDraft({ ...draft, subcategory: e.target.value })}
          />
        </Field>
        <Field label="Περιγραφή">
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            required
          />
        </Field>
        <Field label="Σωματείο">
          <CatalogSelect
            value={draft.clubName ?? ''}
            options={clubs}
            emptyLabel={skipSportAndClass ? 'Δεν απαιτείται' : '— χωρίς σωματείο —'}
            onChange={(clubName) => setDraft({ ...draft, clubName })}
          />
        </Field>
        <Field label="Άθλημα">
          <CatalogSelect
            value={skipSportClassFields ? '' : (draft.sport ?? '')}
            options={sports}
            emptyLabel={skipSportClassFields ? 'Δεν απαιτείται' : '— χωρίς άθλημα —'}
            disabled={skipSportClassFields}
            onChange={(sport) => setDraft({ ...draft, sport, className: '' })}
          />
        </Field>
        <Field label="Τμήμα">
          <CatalogSelect
            value={skipSportClassFields ? '' : (draft.className ?? '')}
            options={classes}
            emptyLabel={skipSportClassFields ? 'Δεν απαιτείται' : '— χωρίς τμήμα —'}
            disabled={skipSportClassFields}
            onChange={(className) => setDraft({ ...draft, className })}
          />
        </Field>
        {skipSportAndClass && (draft.clubName || draft.sport || draft.className) ? (
          <div className="finance-entry-field full-width">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraft({ ...draft, clubName: '', sport: '', className: '' })}
            >
              Άδειασμα σωματείου / αθλήματος / τμήματος
            </Button>
          </div>
        ) : null}
        {!draft.matchDetails ? (
          <>
            <Field label="Προμηθευτής">
              <input
                value={draft.vendor ?? ''}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              />
            </Field>
            <Field label="Επώνυμο">
              <input
                value={draft.surname ?? ''}
                onChange={(e) => setDraft({ ...draft, surname: e.target.value })}
              />
            </Field>
            <Field label="Όνομα">
              <input
                value={draft.firstName ?? ''}
                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
              />
            </Field>
          </>
        ) : null}
        {draft.matchDetails ? (
          <>
            <Field label="Κατηγορία αγώνα">
              <input
                value={draft.matchDetails.category}
                onChange={(e) => setMatchField('category', e.target.value)}
              />
            </Field>
            <Field label="Ομάδες">
              <input
                value={draft.matchDetails.teams}
                onChange={(e) =>
                  setDraft((current) =>
                    current.matchDetails
                      ? {
                          ...current,
                          description: `Αγώνας: ${e.target.value.trim()}`,
                          matchDetails: { ...current.matchDetails, teams: e.target.value },
                        }
                      : current,
                  )
                }
              />
            </Field>
            {MATCH_AMOUNT_FIELDS.map((field) => (
              <Field key={field.key} label={field.label}>
                <MoneyAmountInput
                  value={draft.matchDetails?.[field.key] ?? 0}
                  onChange={(value) => setMatchField(field.key, value)}
                />
              </Field>
            ))}
          </>
        ) : null}
        <Field label="Τρόπος πληρωμής">
          <select
            value={draft.paymentMethod ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, paymentMethod: e.target.value as PaymentMethod })
            }
          >
            <option value="">— χωρίς τρόπο —</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ταμείο / λογαριασμός">
          <select
            value={draft.accountId ?? ''}
            onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
          >
            <option value="">— χωρίς ταμείο —</option>
            {cashAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ΦΠΑ %">
          <input
            type="number"
            min={0}
            max={100}
            value={draft.vatRate ?? 0}
            onChange={(e) => setDraft({ ...draft, vatRate: Number(e.target.value) })}
          />
        </Field>
        <Field label="Σημειώσεις" full>
          <textarea
            rows={3}
            value={draft.notes ?? ''}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </Field>
      </div>
      <p className="ta-hint">
        Κωδικός: {entry.id}
        {entry.createdByEmail ? ` · Καταχώρηση από: ${entry.createdByEmail}` : ''}
        {' · Τρέχον σύνολο: '}
        {formatCurrency(matchTotal)}
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      </div>
      <div className="finance-entry-modal-actions">
        <Button type="button" variant="secondary" onClick={onClose}>
          Κλείσιμο
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση διόρθωσης'}
        </Button>
      </div>
    </form>
  );
}

export function FinanceEntryDetailsModal(props: Props) {
  return (
    <Modal
      open={Boolean(props.entry)}
      title={props.kind === 'revenue' ? 'Ανάλυση / Διόρθωση εσόδου' : 'Ανάλυση / Διόρθωση εξόδου'}
      onClose={props.onClose}
      className="finance-entry-modal"
      wide
    >
      {props.kind === 'revenue' && props.entry ? (
        <RevenueEditor
          entry={props.entry}
          cashAccounts={props.cashAccounts}
          onClose={props.onClose}
          onSaved={props.onSaved}
        />
      ) : null}
      {props.kind === 'expense' && props.entry ? (
        <ExpenseEditor
          entry={props.entry}
          cashAccounts={props.cashAccounts}
          onClose={props.onClose}
          onSaved={props.onSaved}
        />
      ) : null}
    </Modal>
  );
}
