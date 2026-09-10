import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as trainingsService from '../api/services/trainingsService';
import * as classesService from '../api/services/classesService';
import * as notificationService from '../api/services/notificationService';
import { getSession } from '../auth/auth';
import { TrainingsIcon } from '../components/icons/TrainingsIcon';
import { useAppData } from '../hooks/useAppData';
import type { TrainingInput } from '../schemas';
import type { Training } from '../types';
import {
  classIdsOf,
  isClassInCoachScope,
  resolveCoachRecord,
  sportsMatch,
  visibleClassesForSession,
} from '../utils/coachScope';
import { formatDate } from '../utils/labels';
import { listActiveClubSportNames } from '../utils/clubSports';
import { listActiveFacilities } from '../utils/facilityHours';
import { normalizeSportKey } from '../utils/sport';
import { classToFormInput } from '../utils/classHelpers';
import { classRequiresAttendance } from '../utils/missingTrainingAttendance';

const emptyForm: TrainingInput = {
  date: '',
  startTime: '',
  endTime: '',
  location: '',
  notes: '',
  classId: null,
};

const emptyRecurring = {
  weekdays: [1] as number[],
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  weekdayTimes: {} as Record<number, { startTime: string; endTime: string; location: string }>,
  location: '',
  notes: '',
  classId: null as string | null,
};

const emptyBulk = {
  startTime: '',
  endTime: '',
  location: '',
};

const weekdays = [
  { value: 1, label: 'Δευτέρα' },
  { value: 2, label: 'Τρίτη' },
  { value: 3, label: 'Τετάρτη' },
  { value: 4, label: 'Πέμπτη' },
  { value: 5, label: 'Παρασκευή' },
  { value: 6, label: 'Σάββατο' },
  { value: 0, label: 'Κυριακή' },
];

export function TrainingsPage() {
  const { data, refresh } = useAppData();
  const session = getSession();
  const isCoach = session?.role === 'coach';
  const coach = useMemo(
    () => resolveCoachRecord(data.coaches, session?.coachId),
    [data.coaches, session?.coachId],
  );
  const visibleClasses = useMemo(
    () => visibleClassesForSession(data.classes, data.coaches, session, { seasons: data.clubSeasons }),
    [data.classes, data.coaches, data.clubSeasons, session],
  );
  const allowedClassIds = useMemo(() => classIdsOf(visibleClasses), [visibleClasses]);
  const facilityLocations = useMemo(
    () => listActiveFacilities(data.facilities).map((item) => item.name),
    [data.facilities],
  );

  const sportOptions = useMemo(() => {
    const activeNames = listActiveClubSportNames(data.sports);
    const toItems = (names: string[]) =>
      names.map((name, i) => ({ id: `sport-${i}-${name}`, name, active: true }));
    if (isCoach && coach?.sport) {
      const key = normalizeSportKey(coach.sport);
      const matched = activeNames.filter((n) => normalizeSportKey(n) === key);
      return matched.length > 0
        ? toItems(matched)
        : [{ id: 'coach-sport', name: coach.sport, active: true }];
    }
    if (activeNames.length > 0) return toItems(activeNames);
    const fromClasses = new Map<string, string>();
    for (const cls of visibleClasses) {
      const name = (cls.sport ?? '').trim();
      if (!name) continue;
      const key = normalizeSportKey(name);
      if (!fromClasses.has(key)) fromClasses.set(key, name);
    }
    return toItems([...fromClasses.values()]);
  }, [data.sports, isCoach, coach, visibleClasses]);

  const [showAdd, setShowAdd] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [editing, setEditing] = useState<Training | null>(null);
  const [form, setForm] = useState<TrainingInput>(emptyForm);
  const [formSport, setFormSport] = useState('');
  const [recForm, setRecForm] = useState(emptyRecurring);
  const [recSport, setRecSport] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkForm, setBulkForm] = useState(emptyBulk);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [error, setError] = useState('');
  const [notifying, setNotifying] = useState(false);

  const classesForFormSport = useMemo(() => {
    if (!formSport.trim()) return visibleClasses;
    return visibleClasses.filter((c) => sportsMatch(c.sport, formSport));
  }, [visibleClasses, formSport]);

  const classesForRecSport = useMemo(() => {
    if (!recSport.trim()) return visibleClasses;
    return visibleClasses.filter((c) => sportsMatch(c.sport, recSport));
  }, [visibleClasses, recSport]);

  const trainings = useMemo(
    () =>
      [...(data.trainings ?? [])]
        .filter((t) => isClassInCoachScope(t.classId, allowedClassIds, isCoach))
        .sort((a, b) => {
          const byDate = b.date.localeCompare(a.date);
          if (byDate !== 0) return byDate;
          return b.startTime.localeCompare(a.startTime);
        }),
    [data.trainings, allowedClassIds, isCoach],
  );

  const allSelected =
    trainings.length > 0 && trainings.every((t) => selectedIds.has(t.id));

  function defaultSport(): string {
    return isCoach && coach?.sport ? coach.sport : '';
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormSport(defaultSport());
    setError('');
    setShowAdd(true);
  }

  function openEdit(training: Training) {
    setEditing(training);
    const cls = training.classId
      ? visibleClasses.find((c) => c.id === training.classId) ??
        data.classes.find((c) => c.id === training.classId)
      : undefined;
    setForm({
      date: training.date,
      startTime: training.startTime,
      endTime: training.endTime,
      location: training.location,
      notes: training.notes,
      classId: training.classId,
    });
    setFormSport(cls?.sport || defaultSport());
    setError('');
    setShowAdd(true);
  }

  function openRecurring() {
    setRecForm(emptyRecurring);
    setRecSport(defaultSport());
    setError('');
    setShowRecurring(true);
  }

  function closeModals() {
    setShowAdd(false);
    setShowRecurring(false);
    setShowBulkEdit(false);
    setEditing(null);
    setFormSport('');
    setRecSport('');
    setError('');
  }

  function handleFormSportChange(sport: string) {
    setFormSport(sport);
    setForm((prev) => {
      if (!prev.classId) return prev;
      const stillValid = visibleClasses.some(
        (c) => c.id === prev.classId && (!sport.trim() || sportsMatch(c.sport, sport)),
      );
      return stillValid ? prev : { ...prev, classId: null };
    });
  }

  function handleRecSportChange(sport: string) {
    setRecSport(sport);
    setRecForm((prev) => {
      if (!prev.classId) return prev;
      const stillValid = visibleClasses.some(
        (c) => c.id === prev.classId && (!sport.trim() || sportsMatch(c.sport, sport)),
      );
      return stillValid ? prev : { ...prev, classId: null };
    });
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(trainings.map((t) => t.id)));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const result = editing
      ? await trainingsService.updateTraining(editing.id, form)
      : await trainingsService.createTraining(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    closeModals();
    refresh();
  }

  async function handleClassAttendanceRequired(classId: string | null, required: boolean) {
    if (!classId) return;
    const cls = data.classes.find((item) => item.id === classId);
    if (!cls) return;
    const result = await classesService.updateClass(classId, {
      ...classToFormInput(cls),
      attendanceRequired: required,
    });
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία ενημέρωσης παρουσιολογίου');
      return;
    }
    refresh();
  }

  async function handleSaveRecurring() {
    const weekdaysSelected = recForm.weekdays;
    if (weekdaysSelected.length === 0) {
      setError('Επιλέξτε τουλάχιστον μία ημέρα.');
      return;
    }
    setSaving(true);
    setError('');
    const weekdayTimes: Record<number, { startTime: string; endTime: string }> = {};
    for (const day of weekdaysSelected) {
      const row = recForm.weekdayTimes[day];
      weekdayTimes[day] = {
        startTime: (row?.startTime || recForm.startTime).trim(),
        endTime: (row?.endTime || recForm.endTime).trim(),
      };
    }
    const result = await trainingsService.createRecurringTrainings({
      weekdays: weekdaysSelected,
      startDate: recForm.startDate,
      endDate: recForm.endDate,
      startTime: recForm.startTime,
      endTime: recForm.endTime,
      weekdayTimes,
      location: recForm.location,
      notes: recForm.notes,
      classId: recForm.classId,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    const skipped = result.data?.skipped ?? [];
    closeModals();
    refresh();
    if (skipped.length) {
      window.alert(
        `Δημιουργήθηκαν ${result.data?.count ?? 0} προπονήσεις. Παραλείφθηκαν λόγω σύγκρουσης γηπέδου:\n${skipped
          .slice(0, 8)
          .join('\n')}${skipped.length > 8 ? `\n… και ${skipped.length - 8} ακόμη` : ''}`,
      );
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Διαγραφή ${selectedIds.size} προπονήσεων;`)) return;
    setBulkDeleting(true);
    await trainingsService.bulkDeleteTrainings([...selectedIds]);
    setBulkDeleting(false);
    setSelectedIds(new Set());
    refresh();
  }

  async function handleBulkUpdate() {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    setError('');
    const result = await trainingsService.bulkUpdateTrainings([...selectedIds], {
      startTime: bulkForm.startTime,
      endTime: bulkForm.endTime,
      location: bulkForm.location,
    });
    setBulkUpdating(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα ενημέρωσης');
      return;
    }
    const skipped = result.data?.skipped ?? [];
    closeModals();
    setSelectedIds(new Set());
    refresh();
    if (skipped.length) {
      window.alert(
        `Ενημερώθηκαν ${result.data?.updated ?? 0}. Παραλείφθηκαν λόγω σύγκρουσης:\n${skipped
          .slice(0, 8)
          .join('\n')}${skipped.length > 8 ? `\n… και ${skipped.length - 8} ακόμη` : ''}`,
      );
    }
  }

  async function handleDelete(id: string) {
    const training = data.trainings?.find((row) => row.id === id);
    if (!confirm('Διαγραφή προπόνησης;')) return;
    const notify =
      Boolean(training?.classId) &&
      confirm('Να ειδοποιηθούν οι αθλητές του τμήματος (email/SMS);');
    if (notify && training?.classId && session?.clubId) {
      await notificationService.notifyClassSessionMessage({
        clubId: session.clubId,
        classId: training.classId,
        date: training.date,
        startTime: training.startTime,
        kind: 'cancelled',
      });
    }
    await trainingsService.deleteTraining(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    refresh();
  }

  async function handleNotifyTomorrow() {
    if (!session?.clubId) return;
    if (!confirm('Να σταλούν υπενθυμίσεις (email/SMS) για τις προπονήσεις αύριο;')) return;
    setNotifying(true);
    setError('');
    const result = await notificationService.notifyTomorrowTrainings(session.clubId);
    setNotifying(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία υπενθύμισης');
      return;
    }
    window.alert(
      `Υπενθυμίσεις: στάλθηκαν σε ${result.data?.sent ?? 0} αθλητές (παραλείφθηκαν ${result.data?.skipped ?? 0}).`,
    );
  }

  return (
    <div className="stack-lg trainings-page">
      <header className="page-header">
        <div>
          <h1>Προπονήσεις</h1>
          <p>Καταχώρηση και διαχείριση προπονήσεων της ακαδημίας.</p>
        </div>
        <div className="trainings-actions">
          <button type="button" className="trn-btn trn-btn-secondary" onClick={openRecurring}>
            Επαναλαμβανόμενες προπονήσεις
          </button>
          <button
            type="button"
            className="trn-btn trn-btn-secondary"
            disabled={notifying || isCoach}
            onClick={() => void handleNotifyTomorrow()}
          >
            {notifying ? 'Αποστολή…' : 'Υπενθύμιση αύριο'}
          </button>
          <button
            type="button"
            className="trn-btn trn-btn-secondary"
            disabled={selectedIds.size === 0 || bulkUpdating}
            onClick={() => {
              setBulkForm(emptyBulk);
              setError('');
              setShowBulkEdit(true);
            }}
          >
            Μαζική επεξεργασία
          </button>
          <button
            type="button"
            className="trn-btn trn-btn-danger"
            disabled={selectedIds.size === 0 || bulkDeleting}
            onClick={() => void handleBulkDelete()}
          >
            {bulkDeleting ? 'Διαγραφή...' : 'Μαζική διαγραφή'}
          </button>
          <button type="button" className="trn-btn trn-btn-primary" onClick={openCreate}>
            <Plus size={16} /> Νέα προπόνηση
          </button>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel table-wrap">
        {trainings.length === 0 ? (
          <div className="empty-state">
            <TrainingsIcon size={28} />
            <h3>Δεν υπάρχουν προπονήσεις</h3>
            <p>Πάτα «+ Νέα προπόνηση» για να προσθέσεις την πρώτη.</p>
            <button type="button" className="trn-btn trn-btn-primary" onClick={openCreate}>
              <Plus size={16} /> Νέα προπόνηση
            </button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="table-check-col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Επιλογή όλων"
                  />
                </th>
                <th>Ημερομηνία</th>
                <th>Έναρξη</th>
                <th>Λήξη</th>
                <th>Τοποθεσία</th>
                <th>Άθλημα</th>
                <th>Τμήμα</th>
                <th>Σημειώσεις</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trainings.map((training) => {
                const cls = data.classes.find((c) => c.id === training.classId);
                return (
                  <tr
                    key={training.id}
                    className={selectedIds.has(training.id) ? 'is-selected' : ''}
                  >
                    <td className="table-check-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(training.id)}
                        onChange={() => toggleRow(training.id)}
                        aria-label="Επιλογή γραμμής"
                      />
                    </td>
                    <td>{formatDate(training.date)}</td>
                    <td>{training.startTime}</td>
                    <td>{training.endTime}</td>
                    <td>{training.location || '—'}</td>
                    <td>{cls?.sport || '—'}</td>
                    <td>{cls?.name ?? '—'}</td>
                    <td>{training.notes || '—'}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => openEdit(training)}
                        aria-label="Επεξεργασία"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void handleDelete(training.id)}
                        aria-label="Διαγραφή"
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
      </section>

      {showAdd ? (
        <div className="training-modal-backdrop" role="presentation" onClick={closeModals}>
          <div
            className="training-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="training-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="training-modal-title">
              {editing ? 'Επεξεργασία προπόνησης' : 'Νέα προπόνηση'}
            </h2>
            <div className="training-modal-fields">
              <label>
                <span>Ημερομηνία</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label>
                <span>Ώρα έναρξης</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </label>
              <label>
                <span>Ώρα λήξης</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </label>
              <label>
                <span>Τοποθεσία / Γήπεδο</span>
                <select
                  value={form.location ?? ''}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                >
                  <option value="">—</option>
                  {form.location && !facilityLocations.includes(form.location) ? (
                    <option value={form.location}>{form.location}</option>
                  ) : null}
                  {facilityLocations.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Άθλημα</span>
                <select
                  value={formSport}
                  disabled={isCoach}
                  onChange={(e) => handleFormSportChange(e.target.value)}
                >
                  {isCoach ? null : <option value="">—</option>}
                  {sportOptions.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Τμήμα</span>
                <select
                  value={form.classId ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, classId: e.target.value ? e.target.value : null })
                  }
                >
                  <option value="">—</option>
                  {classesForFormSport.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Παρουσιολόγιο</span>
                <select
                  disabled={!form.classId}
                  value={
                    form.classId &&
                    !classRequiresAttendance(visibleClasses.find((c) => c.id === form.classId) ?? data.classes.find((c) => c.id === form.classId))
                      ? 'no'
                      : 'yes'
                  }
                  onChange={(e) =>
                    void handleClassAttendanceRequired(form.classId, e.target.value !== 'no')
                  }
                >
                  <option value="yes">Απαιτείται</option>
                  <option value="no">Δεν απαιτείται (π.χ. ανδρική ομάδα)</option>
                </select>
              </label>
              <label>
                <span>Σημειώσεις</span>
                <textarea
                  rows={4}
                  value={form.notes ?? ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <div className="training-modal-actions">
              <button
                type="button"
                className="training-btn-save"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
              </button>
              <button type="button" className="training-btn-cancel" onClick={closeModals}>
                Ακύρωση
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRecurring ? (
        <div className="training-modal-backdrop" role="presentation" onClick={closeModals}>
          <div
            className="training-modal training-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recurring-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="recurring-modal-title">Επαναλαμβανόμενες προπονήσεις</h2>
            <div className="training-modal-fields">
              <label>
                <span>Άθλημα</span>
                <select
                  value={recSport}
                  disabled={isCoach}
                  onChange={(e) => handleRecSportChange(e.target.value)}
                >
                  {isCoach ? null : <option value="">—</option>}
                  {sportOptions.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Τμήμα</span>
                <select
                  value={recForm.classId ?? ''}
                  onChange={(e) =>
                    setRecForm({
                      ...recForm,
                      classId: e.target.value ? e.target.value : null,
                    })
                  }
                >
                  <option value="">—</option>
                  {classesForRecSport.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Παρουσιολόγιο</span>
                <select
                  disabled={!recForm.classId}
                  value={
                    recForm.classId &&
                    !classRequiresAttendance(
                      visibleClasses.find((c) => c.id === recForm.classId) ??
                        data.classes.find((c) => c.id === recForm.classId),
                    )
                      ? 'no'
                      : 'yes'
                  }
                  onChange={(e) =>
                    void handleClassAttendanceRequired(recForm.classId, e.target.value !== 'no')
                  }
                >
                  <option value="yes">Απαιτείται</option>
                  <option value="no">Δεν απαιτείται (π.χ. ανδρική ομάδα)</option>
                </select>
              </label>
              <div className="training-weekdays">
                <span>Ημέρες εβδομάδας</span>
                <div className="training-weekday-row" role="group" aria-label="Ημέρες εβδομάδας">
                  {weekdays.map((d) => {
                    const on = recForm.weekdays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        className={on ? 'training-weekday is-on' : 'training-weekday'}
                        aria-pressed={on}
                        onClick={() => {
                          setRecForm((prev) => {
                            const has = prev.weekdays.includes(d.value);
                            const next = has
                              ? prev.weekdays.filter((w) => w !== d.value)
                              : [...prev.weekdays, d.value].sort((a, b) => {
                                  const order = (n: number) => (n === 0 ? 7 : n);
                                  return order(a) - order(b);
                                });
                            const weekdayTimes = { ...prev.weekdayTimes };
                            if (has) {
                              delete weekdayTimes[d.value];
                            } else if (!weekdayTimes[d.value]) {
                              weekdayTimes[d.value] = {
                                startTime: prev.startTime,
                                endTime: prev.endTime,
                                location: prev.location,
                              };
                            }
                            return { ...prev, weekdays: next, weekdayTimes };
                          });
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label>
                <span>Ημ. έναρξης</span>
                <input
                  type="date"
                  value={recForm.startDate}
                  onChange={(e) => setRecForm({ ...recForm, startDate: e.target.value })}
                />
              </label>
              <label>
                <span>Ημ. λήξης</span>
                <input
                  type="date"
                  value={recForm.endDate}
                  min={recForm.startDate || undefined}
                  onChange={(e) => setRecForm({ ...recForm, endDate: e.target.value })}
                />
              </label>
              <label>
                <span>Ώρα έναρξης (προεπιλογή)</span>
                <input
                  type="time"
                  value={recForm.startTime}
                  onChange={(e) => setRecForm({ ...recForm, startTime: e.target.value })}
                />
              </label>
              <label>
                <span>Ώρα λήξης (προεπιλογή)</span>
                <input
                  type="time"
                  value={recForm.endTime}
                  onChange={(e) => setRecForm({ ...recForm, endTime: e.target.value })}
                />
              </label>
              {recForm.weekdays.length > 0 ? (
                <div className="training-weekday-times">
                  <span>Ώρες ανά ημέρα</span>
                  {weekdays
                    .filter((d) => recForm.weekdays.includes(d.value))
                    .map((d) => {
                      const row = recForm.weekdayTimes[d.value] ?? {
                        startTime: recForm.startTime,
                        endTime: recForm.endTime,
                        location: recForm.location,
                      };
                      return (
                        <div key={d.value} className="training-weekday-time-row">
                          <strong>{d.label}</strong>
                          <input
                            type="time"
                            aria-label={`${d.label} έναρξη`}
                            value={row.startTime}
                            onChange={(e) =>
                              setRecForm((prev) => ({
                                ...prev,
                                weekdayTimes: {
                                  ...prev.weekdayTimes,
                                  [d.value]: { ...row, startTime: e.target.value },
                                },
                              }))
                            }
                          />
                          <input
                            type="time"
                            aria-label={`${d.label} λήξη`}
                            value={row.endTime}
                            onChange={(e) =>
                              setRecForm((prev) => ({
                                ...prev,
                                weekdayTimes: {
                                  ...prev.weekdayTimes,
                                  [d.value]: { ...row, endTime: e.target.value },
                                },
                              }))
                            }
                          />
                          <select
                            aria-label={`${d.label} γήπεδο`}
                            value={row.location}
                            onChange={(e) =>
                              setRecForm((prev) => ({
                                ...prev,
                                weekdayTimes: {
                                  ...prev.weekdayTimes,
                                  [d.value]: { ...row, location: e.target.value },
                                },
                              }))
                            }
                          >
                            <option value="">—</option>
                            {row.location && !facilityLocations.includes(row.location) ? (
                              <option value={row.location}>{row.location}</option>
                            ) : null}
                            {facilityLocations.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                </div>
              ) : null}
              <label>
                <span>Τοποθεσία / Γήπεδο</span>
                <select
                  value={recForm.location}
                  onChange={(e) => setRecForm({ ...recForm, location: e.target.value })}
                >
                  <option value="">—</option>
                  {recForm.location && !facilityLocations.includes(recForm.location) ? (
                    <option value={recForm.location}>{recForm.location}</option>
                  ) : null}
                  {facilityLocations.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Σημειώσεις</span>
                <textarea
                  rows={3}
                  value={recForm.notes}
                  onChange={(e) => setRecForm({ ...recForm, notes: e.target.value })}
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <div className="training-modal-actions">
              <button
                type="button"
                className="training-btn-save"
                disabled={saving}
                onClick={() => void handleSaveRecurring()}
              >
                {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
              </button>
              <button type="button" className="training-btn-cancel" onClick={closeModals}>
                Ακύρωση
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBulkEdit ? (
        <div className="training-modal-backdrop" role="presentation" onClick={closeModals}>
          <div
            className="training-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-edit-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bulk-edit-modal-title">Μαζική επεξεργασία ({selectedIds.size})</h2>
            <p className="muted">Κενό πεδίο = χωρίς αλλαγή.</p>
            <div className="training-modal-fields">
              <label>
                <span>Ώρα έναρξης</span>
                <input
                  type="time"
                  value={bulkForm.startTime}
                  onChange={(e) => setBulkForm({ ...bulkForm, startTime: e.target.value })}
                />
              </label>
              <label>
                <span>Ώρα λήξης</span>
                <input
                  type="time"
                  value={bulkForm.endTime}
                  onChange={(e) => setBulkForm({ ...bulkForm, endTime: e.target.value })}
                />
              </label>
              <label>
                <span>Τοποθεσία / Γήπεδο</span>
                <select
                  value={bulkForm.location}
                  onChange={(e) => setBulkForm({ ...bulkForm, location: e.target.value })}
                >
                  <option value="">— χωρίς αλλαγή —</option>
                  {facilityLocations.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <div className="training-modal-actions">
              <button
                type="button"
                className="training-btn-save"
                disabled={bulkUpdating}
                onClick={() => void handleBulkUpdate()}
              >
                {bulkUpdating ? 'Ενημέρωση...' : 'Εφαρμογή'}
              </button>
              <button type="button" className="training-btn-cancel" onClick={closeModals}>
                Ακύρωση
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
