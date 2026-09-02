import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  Download,
  Filter,
  Pencil,
  Plus,
  Printer,
  SquarePen,
  X,
} from 'lucide-react';
import { ClassFormModal, saveClassForm } from '../components/ClassFormModal';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAppData } from '../hooks/useAppData';
import type { ClassInput } from '../schemas';
import type { Gender, Student, StudentStatus } from '../types';
import * as studentsService from '../api/services/studentsService';
import { activeClubSportSelectOptions } from '../utils/clubSports';
import {
  athleteAge,
  athleteAttendanceStats,
  athleteBirthYear,
  athleteClassStatusLabel,
  athleteFinancialClear,
  athleteHealthCardValid,
  classAgeRangeLabel,
  classGenderLabels,
  classToFormInput,
  coachDisplayName,
  isClassListedActive,
  studentBirthYear,
  studentGenderLabels,
  studentMatchesBirthYearFilter,
  studentMatchesGenderFilter,
} from '../utils/classHelpers';
import { localDateIso } from '../utils/dates';
import { studentClassIds, normalizeStudentClasses } from '../utils/studentClasses';
import { mutateData } from '../data/repository';
import { apiClient } from '../api/apiClient';

type ProfileTab =
  | 'overview'
  | 'schedule'
  | 'attendance'
  | 'athletes'
  | 'files'
  | 'video';

const PAGE_SIZES = [10, 25, 50, 100] as const;

const tabLabels: Record<ProfileTab, string> = {
  overview: 'Επισκόπηση',
  schedule: 'Πρόγραμμα',
  attendance: 'Παρουσίες',
  athletes: 'Αθλητές',
  files: 'Αρχεία',
  video: 'Βίντεο',
};

async function removeStudentFromClass(studentId: string, classId: string) {
  return apiClient(() => {
    mutateData((data) => {
      const index = data.students.findIndex((s) => s.id === studentId);
      if (index < 0) throw new Error('Ο αθλητής δεν βρέθηκε');
      const student = data.students[index];
      const kept = studentClassIds(student).filter((id) => id !== classId);
      const next = normalizeStudentClasses(kept, null);
      data.students[index] = { ...student, ...next };
    });
    return true;
  });
}

async function addStudentToClass(studentId: string, classId: string) {
  return apiClient(() => {
    mutateData((data) => {
      const index = data.students.findIndex((s) => s.id === studentId);
      if (index < 0) throw new Error('Ο αθλητής δεν βρέθηκε');
      const student = data.students[index];
      const ids = [...studentClassIds(student), classId];
      const next = normalizeStudentClasses(ids, classId);
      data.students[index] = { ...student, ...next };
    });
    return true;
  });
}

export function ClassProfilePage() {
  const { classId = '' } = useParams();
  const navigate = useNavigate();
  const { data, refresh } = useAppData();
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [page, setPage] = useState(1);

  const [addOpen, setAddOpen] = useState(false);
  const [addGender, setAddGender] = useState<'' | 'boy' | 'girl'>('');
  const [addBirthYear, setAddBirthYear] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<'' | StudentStatus>('');
  const [bulkGender, setBulkGender] = useState<'' | Gender>('');
  const [bulkSport, setBulkSport] = useState('');
  const [bulkHealthCard, setBulkHealthCard] = useState<'' | 'yes' | 'no'>('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ClassInput | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cls = useMemo(
    () => data.classes.find((c) => c.id === classId) ?? null,
    [data.classes, classId],
  );

  const roster = useMemo(() => {
    if (!cls) return [];
    const q = search.trim().toLowerCase();
    return data.students
      .filter((s) => studentClassIds(s).includes(cls.id))
      .filter((s) => {
        if (!q) return true;
        const hay = `${s.lastName} ${s.firstName} ${s.registrationNumber ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [cls, data.students, search]);

  const availableAthletes = useMemo(() => {
    if (!cls) return [];
    const q = addSearch.trim().toLowerCase();
    return data.students
      .filter((s) => s.status !== 'inactive')
      .filter((s) => !studentClassIds(s).includes(cls.id))
      .filter((s) => studentMatchesGenderFilter(s, addGender))
      .filter((s) => studentMatchesBirthYearFilter(s, addBirthYear))
      .filter((s) => {
        if (!q) return true;
        return `${s.lastName} ${s.firstName}`.toLowerCase().includes(q);
      })
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [cls, data.students, addGender, addBirthYear, addSearch]);

  const birthYearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const s of data.students) {
      if (s.status === 'inactive') continue;
      if (!studentClassIds(s).includes(classId)) {
        const y = studentBirthYear(s);
        if (y !== null) years.add(y);
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [data.students, classId]);

  const pageCount = Math.max(1, Math.ceil(roster.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = roster.slice((safePage - 1) * pageSize, safePage * pageSize);

  const bulkSportOptions = useMemo(
    () =>
      activeClubSportSelectOptions(data.sports, {
        includeEmpty: true,
        emptyLabel: 'Χωρίς αλλαγή',
        retain: bulkSport ? [bulkSport] : [],
      }),
    [data.sports, bulkSport],
  );

  const today = localDateIso();
  const todayDow = new Date().getDay();

  const todayEvents = useMemo(() => {
    if (!cls) return [];
    const events: Array<{
      id: string;
      startTime: string;
      endTime: string;
      location: string;
      title: string;
      type: string;
      notes: string;
    }> = [];
    for (const slot of data.schedule ?? []) {
      if (slot.classId !== cls.id || slot.dayOfWeek !== todayDow) continue;
      events.push({
        id: `slot-${slot.id}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        location: slot.location,
        title: cls.name,
        type: 'Πρόγραμμα',
        notes: '',
      });
    }
    for (const tr of data.trainings ?? []) {
      if (tr.classId !== cls.id || tr.date !== today) continue;
      events.push({
        id: `tr-${tr.id}`,
        startTime: tr.startTime,
        endTime: tr.endTime,
        location: tr.location,
        title: tr.notes || cls.name,
        type: 'Προπόνηση',
        notes: tr.notes ?? '',
      });
    }
    return events.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [cls, data.schedule, data.trainings, today, todayDow]);

  if (!cls) {
    return (
      <div className="classes-page stack-lg">
        <p className="muted">Το τμήμα δεν βρέθηκε.</p>
        <Button type="button" variant="secondary" onClick={() => navigate('/classes')}>
          Επιστροφή
        </Button>
      </div>
    );
  }

  const active = isClassListedActive(cls, data.clubSeasons);
  const seasonStart =
    new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  function openEdit() {
    if (!cls) return;
    setForm(classToFormInput(cls));
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form || !cls) return;
    setSaving(true);
    setError('');
    const result = await saveClassForm(cls, form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα');
      return;
    }
    setModalOpen(false);
    refresh();
  }

  async function handleRemoveAthlete(student: Student) {
    if (!confirm(`Αφαίρεση «${student.lastName} ${student.firstName}» από το τμήμα;`)) return;
    await removeStudentFromClass(student.id, classId);
    refresh();
  }

  async function handleAddAthlete(student: Student) {
    await addStudentToClass(student.id, classId);
    refresh();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllRoster() {
    const ids = roster.map((s) => s.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected(allOn ? [] : ids);
  }

  function openBulkEdit() {
    const ids = selected.length > 0 ? selected : roster.map((s) => s.id);
    if (ids.length === 0) {
      window.alert('Δεν υπάρχουν αθλητές στο τμήμα.');
      return;
    }
    if (selected.length === 0) setSelected(ids);
    setBulkStatus('');
    setBulkGender('');
    setBulkSport('');
    setBulkHealthCard('');
    setBulkOpen(true);
  }

  async function handleBulkEdit() {
    if (selected.length === 0) return;
    const patch: studentsService.StudentBulkPatch = { ids: selected };
    if (bulkStatus) patch.status = bulkStatus;
    if (bulkGender) patch.gender = bulkGender;
    if (bulkSport) patch.sport = bulkSport;
    if (bulkHealthCard === 'yes') patch.healthCard = true;
    if (bulkHealthCard === 'no') patch.healthCard = false;
    if (
      !patch.status &&
      patch.gender === undefined &&
      !patch.sport &&
      patch.healthCard === undefined
    ) {
      window.alert('Επιλέξτε τουλάχιστον ένα πεδίο για αλλαγή.');
      return;
    }
    setBulkSaving(true);
    const result = await studentsService.bulkPatchStudents(patch);
    setBulkSaving(false);
    if (!result.success || !result.data) {
      window.alert(result.error ?? 'Αποτυχία μαζικής αλλαγής');
      return;
    }
    const missing = result.data.missing.length;
    setBulkOpen(false);
    setSelected([]);
    refresh();
    window.alert(
      `Ενημερώθηκαν ${result.data.updated} αθλητές.` +
        (missing ? `\n${missing} επιλογές δεν βρέθηκαν.` : ''),
    );
  }

  function renderRosterTable(rows: Student[], rosterClass: NonNullable<typeof cls>) {
    return (
      <div className="table-wrap classes-table-wrap class-roster-table-wrap">
        <table className="data-table classes-table class-roster-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={roster.length > 0 && roster.every((s) => selected.includes(s.id))}
                  onChange={toggleAllRoster}
                  aria-label="Επιλογή όλων στο τμήμα"
                />
              </th>
              <th>Αρ. Μητρώου</th>
              <th>Επώνυμο</th>
              <th>Όνομα</th>
              <th>Κατάσταση</th>
              <th>Ηλικία</th>
              <th>Έτος γέννησης</th>
              <th>Τηλέφωνο</th>
              <th>Κάρτα υγείας</th>
              <th>Δελτίο</th>
              <th>Οικ. ενημερότητα</th>
              <th>Παρουσίες / Συνολικά</th>
              <th>Μέγεθος ρούχων</th>
              <th>Αρ. εμφάνισης</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="classes-empty muted">
                  Δεν υπάρχουν αθλητές στο τμήμα
                </td>
              </tr>
            ) : (
              rows.map((student) => {
                const att = athleteAttendanceStats(student.id, rosterClass.id, data.attendance);
                const finOk = athleteFinancialClear(
                  student.id,
                  data.transactions,
                  seasonStart,
                );
                const healthOk = athleteHealthCardValid(student);
                return (
                  <tr key={student.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(student.id)}
                        onChange={() => toggleSelected(student.id)}
                        aria-label={`Επιλογή ${student.lastName} ${student.firstName}`}
                      />
                    </td>
                    <td>{student.registrationNumber || '—'}</td>
                    <td>
                      <Link to={`/athletes/${student.id}`} className="classes-name-link">
                        {student.lastName}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/athletes/${student.id}`} className="classes-name-link">
                        {student.firstName}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge badge-${student.status}`}>
                        {athleteClassStatusLabel(student, rosterClass, data.clubSeasons)}
                      </span>
                    </td>
                    <td>{athleteAge(student.birthDate) ?? '—'}</td>
                    <td>{athleteBirthYear(student.birthDate)}</td>
                    <td>{student.phone || student.guardianPhone || '—'}</td>
                    <td className="class-icon-cell">
                      {healthOk ? (
                        <Check size={16} className="class-icon-ok" />
                      ) : (
                        <X size={16} className="class-icon-bad" />
                      )}
                    </td>
                    <td className="class-icon-cell">
                      {student.registrationNumber ? (
                        <Check size={16} className="class-icon-ok" />
                      ) : (
                        <X size={16} className="class-icon-bad" />
                      )}
                    </td>
                    <td className="class-icon-cell">
                      {finOk ? (
                        <Check size={16} className="class-icon-ok" />
                      ) : (
                        <X size={16} className="class-icon-bad" />
                      )}
                    </td>
                    <td>
                      {att.total > 0
                        ? `${att.present} / ${att.total} - ${att.pct}%`
                        : '—'}
                    </td>
                    <td>{student.uniformSize || '—'}</td>
                    <td>
                      {student.jerseyNumber ? (
                        student.jerseyNumber
                      ) : (
                        <span className="class-jersey-missing">Χωρίς</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="class-remove-link"
                        onClick={() => void handleRemoveAthlete(student)}
                      >
                        Διαγραφή
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const rosterPanel = (
    <section className="panel class-roster-panel">
      {tab === 'athletes' ? (
        <div className="class-athletes-tab-head">
          <h2>{roster.length} αθλητές στο τμήμα</h2>
          <div className="class-athletes-tab-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={roster.length === 0}
              onClick={openBulkEdit}
            >
              <SquarePen size={16} /> Μαζική αλλαγή
              {selected.length > 0
                ? ` (${selected.length})`
                : roster.length > 0
                  ? ` (${roster.length})`
                  : ''}
            </Button>
            <Button type="button" onClick={() => setAddOpen((o) => !o)}>
              <Plus size={16} /> Προσθήκη αθλητών
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'athletes' && addOpen ? (
        <div className="class-add-athletes">
          <h3>Προσθήκη αθλητών στο τμήμα</h3>
          <div className="class-add-filters">
            <label className="field">
              <span>Φύλο</span>
              <select
                value={addGender}
                onChange={(e) => setAddGender(e.target.value as '' | 'boy' | 'girl')}
              >
                <option value="">Όλα</option>
                <option value="girl">Θήλυ</option>
                <option value="boy">Άρρεν</option>
              </select>
            </label>
            <label className="field">
              <span>Έτος γέννησης</span>
              <select value={addBirthYear} onChange={(e) => setAddBirthYear(e.target.value)}>
                <option value="">Όλα</option>
                {birthYearOptions.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="field class-add-search">
              <span>Αναζήτηση</span>
              <input
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Επώνυμο, όνομα…"
              />
            </label>
          </div>

          <div className="table-wrap classes-table-wrap">
            <table className="data-table classes-table">
              <thead>
                <tr>
                  <th>Επώνυμο</th>
                  <th>Όνομα</th>
                  <th>Φύλο</th>
                  <th>Έτος γέννησης</th>
                  <th>Ηλικία</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {availableAthletes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="classes-empty muted">
                      Δεν βρέθηκαν διαθέσιμοι αθλητές με τα επιλεγμένα φίλτρα
                    </td>
                  </tr>
                ) : (
                  availableAthletes.map((student) => (
                    <tr key={student.id}>
                      <td>{student.lastName}</td>
                      <td>{student.firstName}</td>
                      <td>{studentGenderLabels[student.gender ?? '']}</td>
                      <td>{athleteBirthYear(student.birthDate)}</td>
                      <td>{athleteAge(student.birthDate) ?? '—'}</td>
                      <td>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void handleAddAthlete(student)}
                        >
                          <Plus size={14} /> Προσθήκη
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'overview' ? (
        <div className="class-roster-toolbar">
          <div className="class-roster-toolbar-left">
            <Button
              type="button"
              variant="secondary"
              disabled={roster.length === 0}
              onClick={openBulkEdit}
            >
              <SquarePen size={16} /> Μαζική αλλαγή
            </Button>
            <Button type="button" variant="secondary" disabled>
              <Filter size={16} /> Φίλτρα
            </Button>
            <Button type="button" variant="secondary" disabled>
              <Download size={16} /> Excel
            </Button>
            <Button type="button" variant="secondary" disabled>
              <Printer size={16} /> Print
            </Button>
          </div>
        </div>
      ) : null}

      <div className="classes-table-controls">
        <label className="classes-page-size">
          Δείξε{' '}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>{' '}
          εγγραφές
        </label>
        <label className="classes-search">
          <span>Αναζήτηση:</span>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      {renderRosterTable(pageRows, cls)}
    </section>
  );

  return (
    <div className="classes-page class-profile-page stack-lg">
      <header className="class-profile-head">
        <div>
          <h1>{cls.name}</h1>
          <span className={`badge ${active ? 'badge-active' : 'badge-inactive'}`}>
            {active ? 'Ενεργό' : 'Ανενεργό'}
          </span>
        </div>
        <Button type="button" variant="secondary" onClick={openEdit}>
          <Pencil size={16} /> Επεξεργασία
        </Button>
      </header>

      <nav className="class-profile-tabs" role="tablist">
        {(Object.keys(tabLabels) as ProfileTab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'is-active' : ''}
            onClick={() => setTab(key)}
          >
            {tabLabels[key]}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <>
          <div className="class-profile-cards">
            <section className="panel class-profile-card">
              <h2>Προφίλ</h2>
              <dl className="class-profile-dl">
                <div>
                  <dt>Φύλο</dt>
                  <dd>{classGenderLabels[cls.gender ?? '']}</dd>
                </div>
                <div>
                  <dt>Κατηγορία</dt>
                  <dd>{cls.ageGroup || '—'}</dd>
                </div>
                <div>
                  <dt>Εύρος ηλικιών</dt>
                  <dd>{classAgeRangeLabel(cls)}</dd>
                </div>
                <div>
                  <dt>Α&apos; Προπονητής</dt>
                  <dd>{coachDisplayName(cls.coachId, data.coaches)}</dd>
                </div>
              </dl>
            </section>

            <section className="panel class-profile-card">
              <h2>Σημερινό πρόγραμμα</h2>
              {todayEvents.length === 0 ? (
                <p className="muted class-profile-empty">
                  Δεν βρέθηκαν εκδηλώσεις για σήμερα.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table class-today-table">
                    <thead>
                      <tr>
                        <th>Ώρα</th>
                        <th>Εγκατάσταση</th>
                        <th>Τίτλος</th>
                        <th>Τύπος</th>
                        <th>Σχόλια</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayEvents.map((ev) => (
                        <tr key={ev.id}>
                          <td>
                            {ev.startTime}
                            {ev.endTime ? ` – ${ev.endTime}` : ''}
                          </td>
                          <td>{ev.location || '—'}</td>
                          <td>{ev.title}</td>
                          <td>{ev.type}</td>
                          <td>{ev.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
          {rosterPanel}
        </>
      ) : tab === 'athletes' ? (
        rosterPanel
      ) : tab === 'schedule' ? (
        <section className="panel class-profile-card">
          <p className="muted">
            Δείτε το εβδομαδιαίο πρόγραμμα στο{' '}
            <Link to={`/schedule?sport=${encodeURIComponent(cls.sport)}`}>Πρόγραμμα</Link>.
          </p>
        </section>
      ) : tab === 'attendance' ? (
        <section className="panel class-profile-card">
          <p className="muted">
            Καταχωρήστε παρουσίες στο{' '}
            <Link to="/attendance">Παρουσίες</Link>.
          </p>
        </section>
      ) : (
        <section className="panel class-profile-card">
          <p className="muted">Δεν υπάρχουν αρχεία ή βίντεο για αυτό το τμήμα.</p>
        </section>
      )}

      {form ? (
        <ClassFormModal
          open={modalOpen}
          editing={cls}
          form={form}
          error={error}
          saving={saving}
          onChange={setForm}
          onClose={() => setModalOpen(false)}
          onSave={() => void handleSave()}
        />
      ) : null}

      <Modal
        open={bulkOpen}
        title="Μαζική αλλαγή"
        onClose={() => !bulkSaving && setBulkOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              type="button"
              disabled={bulkSaving}
              onClick={() => setBulkOpen(false)}
            >
              Άκυρο
            </Button>
            <Button type="button" disabled={bulkSaving} onClick={() => void handleBulkEdit()}>
              {bulkSaving ? 'Εφαρμογή...' : 'Εφαρμογή'}
            </Button>
          </>
        }
      >
        <p className="muted">
          Θα ενημερωθούν {selected.length} αθλητές του τμήματος «{cls.name}». Αφήστε «Χωρίς αλλαγή»
          στα πεδία που δεν θέλετε να πειράξετε.
        </p>
        <label className="field">
          <span className="field-label">Κατάσταση</span>
          <select
            className="field-input"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as '' | StudentStatus)}
          >
            <option value="">Χωρίς αλλαγή</option>
            <option value="active">Ενεργός</option>
            <option value="trial">Δοκιμαστικός</option>
            <option value="inactive">Ανενεργός</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Φύλο</span>
          <select
            className="field-input"
            value={bulkGender}
            onChange={(e) => setBulkGender(e.target.value as '' | Gender)}
          >
            <option value="">Χωρίς αλλαγή</option>
            <option value="girl">Κορίτσι</option>
            <option value="boy">Αγόρι</option>
            <option value="other">Άλλο</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Άθλημα</span>
          <select
            className="field-input"
            value={bulkSport}
            onChange={(e) => setBulkSport(e.target.value)}
          >
            {bulkSportOptions.map((opt) => (
              <option key={opt.value || 'keep'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Κάρτα υγείας</span>
          <select
            className="field-input"
            value={bulkHealthCard}
            onChange={(e) => setBulkHealthCard(e.target.value as '' | 'yes' | 'no')}
          >
            <option value="">Χωρίς αλλαγή</option>
            <option value="no">Όχι</option>
            <option value="yes">Έγκυρη</option>
          </select>
        </label>
      </Modal>
    </div>
  );
}
