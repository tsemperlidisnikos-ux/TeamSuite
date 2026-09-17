import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import * as financeService from '../api/services/financeService';
import type { ExpenseInput, RevenueInput } from '../schemas';
import { PAYMENT_METHODS } from '../shared/paymentMethods';
import type { CashAccount, Expense, MatchExpenseDetails, PaymentMethod, Revenue } from '../types';
import { formatCurrency } from '../utils/labels';
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
    | 'travelAllowance'
    | 'transportBus'
    | 'transportPlane'
    | 'transportShip'
    | 'transportOther'
    | 'accommodation'
    | 'food'
  >;
  label: string;
}> = [
  { key: 'referees', label: 'Διαιτητές' },
  { key: 'judges', label: 'Κριτές' },
  { key: 'travelAllowance', label: 'Οδοιπορικά' },
  { key: 'transportBus', label: 'Λεωφορείο' },
  { key: 'transportPlane', label: 'Αεροπλάνο' },
  { key: 'transportShip', label: 'Πλοίο' },
  { key: 'transportOther', label: 'Άλλη μετακίνηση' },
  { key: 'accommodation', label: 'Διαμονή' },
  { key: 'food', label: 'Διατροφή' },
];

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
      <p className="admin-entry-note">
        <strong>Προέλευση:</strong> {source}
        {linked
          ? ' — η διόρθωση πρέπει να γίνει στην αρχική πληρωμή ή ενοικίαση ώστε να παραμείνουν σωστά τα συνδεδεμένα στοιχεία.'
          : ''}
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
            value={draft.amount}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
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
          <input
            value={draft.clubName ?? ''}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, clubName: e.target.value })}
          />
        </Field>
        <Field label="Άθλημα">
          <input
            value={draft.sport ?? ''}
            disabled={linked}
            onChange={(e) => setDraft({ ...draft, sport: e.target.value })}
          />
        </Field>
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

  useEffect(() => setDraft(entry), [entry]);

  const matchTotal = useMemo(
    () =>
      draft.matchDetails
        ? MATCH_AMOUNT_FIELDS.reduce(
            (sum, field) => sum + (Number(draft.matchDetails?.[field.key]) || 0),
            0,
          )
        : Number(draft.amount),
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
      clubName: draft.clubName ?? '',
      sport: draft.sport ?? '',
      className: draft.className ?? '',
      surname: draft.surname ?? '',
      firstName: draft.firstName ?? '',
      studentId: draft.studentId,
      notes: draft.notes ?? '',
      matchDetails: draft.matchDetails,
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
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={matchTotal}
            disabled={Boolean(draft.matchDetails)}
            onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
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
          <input
            value={draft.clubName ?? ''}
            onChange={(e) => setDraft({ ...draft, clubName: e.target.value })}
          />
        </Field>
        <Field label="Άθλημα">
          <input
            value={draft.sport ?? ''}
            onChange={(e) => setDraft({ ...draft, sport: e.target.value })}
          />
        </Field>
        <Field label="Τμήμα">
          <input
            value={draft.className ?? ''}
            onChange={(e) => setDraft({ ...draft, className: e.target.value })}
          />
        </Field>
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
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.matchDetails?.[field.key] ?? 0}
                  onChange={(e) => setMatchField(field.key, Number(e.target.value))}
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
      title={props.kind === 'revenue' ? 'Ανάλυση εσόδου' : 'Ανάλυση εξόδου'}
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
