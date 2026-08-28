import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import * as financeService from '../api/services/financeService';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { ExpenseInput } from '../schemas';
import type { MatchExpenseDetails } from '../types';
import {
  mapExpenseSubcategoryToCategory,
  matchExpenseTotal,
  personNameKind,
  requiresPersonName,
  usesMatchExpenseForm,
} from '../shared/financeCategories';
import {
  getConfiguredExpenseCategories,
  getConfiguredExpenseDescriptions,
} from '../platform/financeCatalog';
import { localDateIso } from '../utils/dates';
import { formatCurrency, formatDate } from '../utils/labels';
import { sportsMatch } from '../utils/coachScope';
import { studentClassIds, studentInClass } from '../utils/studentClasses';

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

function AmountField({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="ta-amount">
      <input
        id={id}
        type="number"
        min={0}
        step="0.01"
        value={value || ''}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      <span>€</span>
    </div>
  );
}

function emptyMatchDetails(): MatchExpenseDetails {
  return {
    sport: '',
    category: '',
    teams: '',
    referees: 0,
    judges: 0,
    travelAllowance: 0,
    transportBus: 0,
    transportPlane: 0,
    transportShip: 0,
    transportOther: 0,
    accommodation: 0,
    food: 0,
  };
}

export function ExpenseEntryPanel({ onSaved }: { onSaved: () => void }) {
  const { data } = useAppData();
  const [subcategory, setSubcategory] = useState<string>(
    () => getConfiguredExpenseCategories()[0] ?? 'ΑΓΩΝΕΣ',
  );
  const [clubName, setClubName] = useState('');
  const [sport, setSport] = useState('');
  const [className, setClassName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [matchDetails, setMatchDetails] = useState<MatchExpenseDetails>(emptyMatchDetails);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isMatch = usesMatchExpenseForm(subcategory);
  const isCoachExpense = subcategory === 'ΠΡΟΠΟΝΗΤΕΣ / ΓΥΜΝΑΣΤΕΣ';
  const isStaffExpense = subcategory === 'ΠΡΟΣΩΠΙΚΟ';
  const showPersonFields = !isMatch && requiresPersonName(subcategory);
  const showClassField = !isMatch && !isCoachExpense && !isStaffExpense;
  const nameKind = personNameKind(subcategory);
  const expenseCategories = getConfiguredExpenseCategories();
  const descriptions = getConfiguredExpenseDescriptions(subcategory);
  const matchTotal = useMemo(() => matchExpenseTotal(matchDetails), [matchDetails]);

  const clubs = useMemo(
    () => (data.associations ?? []).filter((a) => a.active !== false),
    [data.associations],
  );
  const sports = useMemo(() => (data.sports ?? []).filter((s) => s.active), [data.sports]);

  const classOptions = useMemo(() => {
    const list = data.classes ?? [];
    if (!sport) return list;
    return list.filter((c) => sportsMatch(c.sport, sport));
  }, [data.classes, sport]);

  const selectedClassId = useMemo(() => {
    if (!className) return null;
    return (
      classOptions.find((c) => c.name === className)?.id ??
      data.classes.find((c) => c.name === className)?.id ??
      null
    );
  }, [className, classOptions, data.classes]);

  const registryPeople = useMemo(() => {
    if (nameKind !== 'athletes') return [];
    return [...data.students]
      .filter((s) => s.status !== 'inactive')
      .filter((s) => {
        if (selectedClassId) return studentInClass(s, selectedClassId);
        if (sport) {
          const athleteSports = [s.sport, ...(s.sports ?? [])].filter(Boolean);
          return athleteSports.some((sp) => sportsMatch(sp, sport));
        }
        return true;
      })
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [data.students, nameKind, selectedClassId, sport]);

  const registryCoaches = useMemo(() => {
    if (!isCoachExpense) return [];
    return [...(data.coaches ?? [])]
      .filter((c) => c.active)
      .filter((c) => !sport || sportsMatch(c.sport, sport))
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [data.coaches, isCoachExpense, sport]);

  const registryStaff = useMemo(() => {
    if (!isStaffExpense) return [];
    return [...(data.staff ?? [])]
      .filter((m) => m.active)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'el'));
  }, [data.staff, isStaffExpense]);

  useEffect(() => {
    if (!studentId) return;
    const stillValid = isCoachExpense
      ? registryCoaches.some((c) => c.id === studentId)
      : isStaffExpense
        ? registryStaff.some((m) => m.id === studentId)
        : showPersonFields
          ? registryPeople.some((s) => s.id === studentId)
          : true;
    if (stillValid) return;
    setStudentId('');
    setSurname('');
    setFirstName('');
  }, [
    registryPeople,
    registryCoaches,
    registryStaff,
    studentId,
    isCoachExpense,
    isStaffExpense,
    showPersonFields,
  ]);

  const filteredExpenses = useMemo(
    () =>
      [...data.expenses]
        .filter((e) => (e.subcategory || '') === subcategory)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.expenses, subcategory],
  );

  const subcategoryTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  function handleSubcategoryChange(next: string) {
    setSubcategory(next);
    setDescription('');
    setStudentId('');
    setSurname('');
    setFirstName('');
    setClassName('');
    setMatchDetails(emptyMatchDetails());
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
    const primaryClassId = student.classId || studentClassIds(student)[0];
    const cls = primaryClassId
      ? data.classes.find((c) => c.id === primaryClassId)
      : undefined;
    if (cls?.name) setClassName(cls.name);
  }

  function handleCoachRegistrySelect(id: string) {
    setStudentId(id);
    const coach = data.coaches.find((c) => c.id === id);
    if (!coach) {
      setSurname('');
      setFirstName('');
      return;
    }
    setSurname(coach.lastName);
    setFirstName(coach.firstName);
    if (coach.sport) setSport(coach.sport);
  }

  function handleStaffRegistrySelect(id: string) {
    setStudentId(id);
    const member = data.staff.find((m) => m.id === id);
    if (!member) {
      setSurname('');
      setFirstName('');
      return;
    }
    const parts = member.fullName.trim().split(/\s+/);
    setSurname(parts[0] ?? member.fullName);
    setFirstName(parts.slice(1).join(' '));
  }

  function setMatchField<K extends keyof MatchExpenseDetails>(
    key: K,
    value: MatchExpenseDetails[K],
  ) {
    setMatchDetails((prev) => ({ ...prev, [key]: value }));
  }

  async function saveExpense(payload: ExpenseInput) {
    setSaving(true);
    setError('');
    const result = await financeService.createExpense(payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return false;
    }
    return true;
  }

  async function handleGenericSubmit(event: FormEvent) {
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
    if (isCoachExpense && (!studentId || !surname.trim() || !firstName.trim())) {
      setError('Επιλέξτε προπονητή από το μητρώο');
      return;
    }
    if (isStaffExpense && (!studentId || !surname.trim())) {
      setError('Επιλέξτε μέλος προσωπικού από το μητρώο');
      return;
    }

    const ok = await saveExpense({
      date,
      amount,
      category: mapExpenseSubcategoryToCategory(subcategory),
      description,
      vendor: '',
      subcategory,
      clubName,
      sport,
      className: isCoachExpense || isStaffExpense ? '' : className,
      surname:
        showPersonFields || isCoachExpense || isStaffExpense ? surname.trim() : '',
      firstName:
        showPersonFields || isCoachExpense || isStaffExpense ? firstName.trim() : '',
      studentId:
        showPersonFields || isCoachExpense || isStaffExpense
          ? studentId || undefined
          : undefined,
      notes,
    });
    if (!ok) return;

    setDescription('');
    setAmount(0);
    setNotes('');
    setStudentId('');
    setSurname('');
    setFirstName('');
    onSaved();
  }

  async function handleMatchSubmit(event: FormEvent) {
    event.preventDefault();
    if (!clubName) {
      setError('Επιλέξτε σωματείο');
      return;
    }
    if (!matchDetails.sport) {
      setError('Επιλέξτε άθλημα');
      return;
    }
    if (!matchDetails.category.trim()) {
      setError('Συμπληρώστε κατηγορία αγώνα');
      return;
    }
    if (!matchDetails.teams.trim()) {
      setError('Συμπληρώστε ομάδες');
      return;
    }
    if (matchTotal <= 0) {
      setError('Το σύνολο εξόδων αγώνα πρέπει να είναι θετικό');
      return;
    }

    const ok = await saveExpense({
      date,
      amount: matchTotal,
      category: mapExpenseSubcategoryToCategory('ΑΓΩΝΕΣ'),
      description: `Αγώνας: ${matchDetails.teams.trim()}`,
      vendor: '',
      subcategory: 'ΑΓΩΝΕΣ',
      clubName,
      className: '',
      sport: matchDetails.sport,
      surname: '',
      firstName: '',
      notes,
      matchDetails,
    });
    if (!ok) return;

    setNotes('');
    setMatchDetails(emptyMatchDetails());
    onSaved();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή εξόδου;')) return;
    setDeletingId(id);
    const result = await financeService.deleteExpense(id);
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
          <h2>ΕΞΟΔΑ</h2>
          <p className="lede">
            Καταχώρηση εξόδων συλλόγου. Τα έξοδα αγώνων έχουν αναλυτική φόρμα.
          </p>
        </div>
        <div className="stat-pill">
          <span>Σύνολο υποκατηγορίας</span>
          <strong>{formatCurrency(subcategoryTotal)}</strong>
        </div>
      </div>

      <div className="entry-form subcategory-bar">
        <TitleAnalysisTable>
          <TitleAnalysisRow title="Υποκατηγορία" htmlFor="expense-subcategory">
            <select
              id="expense-subcategory"
              value={subcategory}
              onChange={(e) => handleSubcategoryChange(e.target.value)}
            >
              {expenseCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {isMatch ? (
              <p className="ta-hint">Η υποκατηγορία ανοίγει αναλυτική φόρμα εξόδων αγώνα.</p>
            ) : null}
          </TitleAnalysisRow>
        </TitleAnalysisTable>
      </div>

      {isMatch ? (
        <form className="entry-form" onSubmit={(e) => void handleMatchSubmit(e)}>
          <TitleAnalysisTable>
            <TitleAnalysisRow title="Σωματείο" htmlFor="match-club">
              <select
                id="match-club"
                value={clubName}
                onChange={(e) => {
                  setClubName(e.target.value);
                  setMatchField('sport', '');
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
            <TitleAnalysisRow title="Ημερομηνία" htmlFor="match-date">
              <input
                id="match-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Άθλημα" htmlFor="match-sport">
              <select
                id="match-sport"
                value={matchDetails.sport}
                onChange={(e) => setMatchField('sport', e.target.value)}
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
            <TitleAnalysisRow title="Κατηγορία" htmlFor="match-category">
              <input
                id="match-category"
                value={matchDetails.category}
                onChange={(e) => setMatchField('category', e.target.value)}
                placeholder="π.χ. U16"
                required
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Ομάδες" htmlFor="match-teams">
              <input
                id="match-teams"
                value={matchDetails.teams}
                onChange={(e) => setMatchField('teams', e.target.value)}
                placeholder="π.χ. Ολυμπιακός - Παναθηναϊκός"
                required
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Έξοδα Διαιτητών" htmlFor="match-referees">
              <AmountField
                id="match-referees"
                value={matchDetails.referees}
                onChange={(v) => setMatchField('referees', v)}
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Κριτών" htmlFor="match-judges">
              <AmountField
                id="match-judges"
                value={matchDetails.judges}
                onChange={(v) => setMatchField('judges', v)}
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Οδοιπορικά" htmlFor="match-travel">
              <AmountField
                id="match-travel"
                value={matchDetails.travelAllowance}
                onChange={(v) => setMatchField('travelAllowance', v)}
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Μετακίνηση">
              <div className="transport-group">
                <label className="transport-item" htmlFor="match-bus">
                  <span>Λεωφορείο</span>
                  <AmountField
                    id="match-bus"
                    value={matchDetails.transportBus}
                    onChange={(v) => setMatchField('transportBus', v)}
                  />
                </label>
                <label className="transport-item" htmlFor="match-plane">
                  <span>Αεροπλάνο</span>
                  <AmountField
                    id="match-plane"
                    value={matchDetails.transportPlane}
                    onChange={(v) => setMatchField('transportPlane', v)}
                  />
                </label>
                <label className="transport-item" htmlFor="match-ship">
                  <span>Πλοίο</span>
                  <AmountField
                    id="match-ship"
                    value={matchDetails.transportShip}
                    onChange={(v) => setMatchField('transportShip', v)}
                  />
                </label>
                <label className="transport-item" htmlFor="match-other">
                  <span>Άλλο</span>
                  <AmountField
                    id="match-other"
                    value={matchDetails.transportOther}
                    onChange={(v) => setMatchField('transportOther', v)}
                  />
                </label>
              </div>
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Διαμονή" htmlFor="match-accommodation">
              <AmountField
                id="match-accommodation"
                value={matchDetails.accommodation}
                onChange={(v) => setMatchField('accommodation', v)}
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Διατροφή" htmlFor="match-food">
              <AmountField
                id="match-food"
                value={matchDetails.food}
                onChange={(v) => setMatchField('food', v)}
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Σύνολο αγώνα">
              <strong className="ta-total">{formatCurrency(matchTotal)}</strong>
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Σημειώσεις" htmlFor="match-notes">
              <textarea
                id="match-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </TitleAnalysisRow>
            <TitleAnalysisRow title="Παραστατικό" htmlFor="match-file">
              <div className="ta-file">
                <input id="match-file" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple />
                <p className="ta-hint">Έως 2 αρχεία (PDF, JPG, PNG), max ~200KB το καθένα.</p>
              </div>
            </TitleAnalysisRow>
          </TitleAnalysisTable>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="income-entry-actions">
            <Button type="submit" disabled={saving}>
              {saving ? 'Αποθήκευση…' : 'Καταχώρηση εξόδου αγώνα'}
            </Button>
          </div>
        </form>
      ) : (
        <form className="entry-form" onSubmit={(e) => void handleGenericSubmit(e)}>
          <TitleAnalysisTable>
            <TitleAnalysisRow title="Σωματείο" htmlFor="expense-club">
              <select
                id="expense-club"
                value={clubName}
                onChange={(e) => {
                  setClubName(e.target.value);
                  setSport('');
                  setClassName('');
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

            <TitleAnalysisRow title="Άθλημα" htmlFor="expense-sport">
              <select
                id="expense-sport"
                value={sport}
                onChange={(e) => {
                  setSport(e.target.value);
                  setClassName('');
                  setStudentId('');
                  setSurname('');
                  setFirstName('');
                }}
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

            {showClassField ? (
              <TitleAnalysisRow title="Τμήμα" htmlFor="expense-class">
                <select
                  id="expense-class"
                  value={className}
                  onChange={(e) => {
                    setClassName(e.target.value);
                    setStudentId('');
                    setSurname('');
                    setFirstName('');
                  }}
                  disabled={!sport}
                >
                  <option value="">
                    {sport ? 'Επιλέξτε τμήμα...' : 'Επιλέξτε πρώτα άθλημα...'}
                  </option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.ageGroup ? `${c.name} · ${c.ageGroup}` : c.name}
                    </option>
                  ))}
                </select>
              </TitleAnalysisRow>
            ) : null}

            {isCoachExpense ? (
              <TitleAnalysisRow title="Μητρώο" htmlFor="expense-coach-registry">
                <select
                  id="expense-coach-registry"
                  value={studentId}
                  onChange={(e) => handleCoachRegistrySelect(e.target.value)}
                  disabled={!sport}
                  required
                >
                  <option value="">
                    {sport ? 'Επιλέξτε προπονητή...' : 'Επιλέξτε πρώτα άθλημα...'}
                  </option>
                  {registryCoaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.lastName} {c.firstName}
                      {c.sport ? ` · ${c.sport}` : ''}
                    </option>
                  ))}
                </select>
                {sport && registryCoaches.length === 0 ? (
                  <p className="ta-hint ta-hint--warn">
                    Δεν υπάρχουν ενεργοί προπονητές για αυτό το άθλημα.
                  </p>
                ) : null}
              </TitleAnalysisRow>
            ) : null}

            {isStaffExpense ? (
              <TitleAnalysisRow title="Μητρώο" htmlFor="expense-staff-registry">
                <select
                  id="expense-staff-registry"
                  value={studentId}
                  onChange={(e) => handleStaffRegistrySelect(e.target.value)}
                  required
                >
                  <option value="">Επιλέξτε από μητρώο προσωπικού...</option>
                  {registryStaff.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
                {registryStaff.length === 0 ? (
                  <p className="ta-hint ta-hint--warn">
                    Δεν υπάρχουν ενεργά μέλη προσωπικού στο μητρώο.
                  </p>
                ) : null}
              </TitleAnalysisRow>
            ) : null}

            {showPersonFields ? (
              <>
                <TitleAnalysisRow title="Από μητρώο" htmlFor="expense-registry">
                  <select
                    id="expense-registry"
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
                  {registryPeople.length === 0 ? (
                    <p className="ta-hint ta-hint--warn">
                      Δεν υπάρχουν καταχωρήσεις στο μητρώο. Προσθέστε από τη σελίδα Μητρώο ή
                      συμπληρώστε χειροκίνητα.
                    </p>
                  ) : null}
                </TitleAnalysisRow>
                <TitleAnalysisRow title="Επώνυμο" htmlFor="expense-surname">
                  <input
                    id="expense-surname"
                    value={surname}
                    onChange={(e) => {
                      setSurname(e.target.value);
                      setStudentId('');
                    }}
                    placeholder="Επώνυμο αθλητή"
                    required
                  />
                </TitleAnalysisRow>
                <TitleAnalysisRow title="Όνομα" htmlFor="expense-firstname">
                  <input
                    id="expense-firstname"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setStudentId('');
                    }}
                    placeholder="Όνομα αθλητή"
                    required
                  />
                </TitleAnalysisRow>
              </>
            ) : null}

            <TitleAnalysisRow title="Ημερομηνία" htmlFor="expense-date">
              <input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </TitleAnalysisRow>

            <TitleAnalysisRow title="Περιγραφή" htmlFor="expense-description">
              <select
                id="expense-description"
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

            <TitleAnalysisRow title="Ποσό" htmlFor="expense-amount">
              <AmountField id="expense-amount" value={amount} onChange={setAmount} />
            </TitleAnalysisRow>

            <TitleAnalysisRow title="Σημειώσεις" htmlFor="expense-notes">
              <textarea
                id="expense-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </TitleAnalysisRow>

            <TitleAnalysisRow title="Παραστατικό" htmlFor="expense-file">
              <div className="ta-file">
                <input id="expense-file" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple />
                <p className="ta-hint">Έως 2 αρχεία (PDF, JPG, PNG), max ~200KB το καθένα.</p>
              </div>
            </TitleAnalysisRow>
          </TitleAnalysisTable>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="income-entry-actions">
            <Button type="submit" disabled={saving}>
              {saving ? 'Αποθήκευση…' : 'Καταχώρηση εξόδου'}
            </Button>
          </div>
        </form>
      )}

      <div className="income-entry-list">
        {filteredExpenses.length === 0 ? (
          <p className="income-entry-empty">Δεν υπάρχουν εγγραφές ακόμη.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ημερομηνία</th>
                <th>Περιγραφή</th>
                <th>Σωματείο</th>
                <th>Άθλημα</th>
                <th>Τμήμα</th>
                <th>Ποσό</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp) => (
                <tr key={exp.id}>
                  <td>{formatDate(exp.date)}</td>
                  <td>
                    {exp.description}
                    {exp.surname ? ` — ${exp.surname} ${exp.firstName}` : ''}
                  </td>
                  <td>{exp.clubName || '—'}</td>
                  <td>{exp.sport || '—'}</td>
                  <td>{exp.className || '—'}</td>
                  <td>{formatCurrency(exp.amount)}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label="Διαγραφή"
                      disabled={deletingId === exp.id}
                      onClick={() => void handleDelete(exp.id)}
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
