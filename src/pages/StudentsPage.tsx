import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Download, FileImage, Plus, Pencil, SquarePen, Trash2, Search, X, HeartPulse } from 'lucide-react';
import * as publicClubCloudService from '../api/services/publicClubCloudService';
import * as registrationApplicationsService from '../api/services/registrationApplicationsService';
import * as studentsService from '../api/services/studentsService';
import { getSession } from '../auth/auth';
import { getClubById } from '../auth/clubs';
import { AthletesIcon } from '../components/icons/AthletesIcon';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import { getPreviewClubId } from '../platform/platformConfig';
import type { StudentInput } from '../schemas';
import type { RegistrationApplication, RegistrationApplicationKind, Student, StudentStatus } from '../types';
import { formatJoinExtrasText } from '../shared/publicJoinExtras';
import { formatAmkaForViewer } from '../utils/amkaAccess';
import {
  classIdsOf,
  visibleClassesForSession,
  visibleStudentsForSession,
} from '../utils/coachScope';
import { openAthleteHealthCardPreview } from '../utils/healthCardPreview';
import { activeClubSportSelectOptions, clubSportsMatch } from '../utils/clubSports';
import { studentStatusLabels } from '../utils/labels';
import { studentClassIds } from '../utils/studentClasses';
import { studentHasSport } from '../utils/studentSports';
import { downloadXlsx } from '../utils/xlsxDownload';
import {
  renderPublicJoinFormSnapshot,
  snapshotFieldsFromJoinSource,
} from '../utils/publicJoinFormSnapshot';

const draftAthlete: StudentInput = {
  firstName: 'ΝΕΟΣ',
  lastName: 'ΑΘΛΗΤΗΣ',
  email: '',
  phone: '',
  birthDate: '',
  guardianName: '',
  guardianPhone: '',
  classId: null,
  classIds: [],
  status: 'active',
  monthlyFee: 0,
  amka: '',
  gender: '',
  fatherFirstName: '',
  motherFirstName: '',
  fatherEmail: '',
  motherEmail: '',
  motherPhone: '',
  address: '',
  postalCode: '',
  city: '',
  clubName: '',
  registrationNumber: '',
  sport: '',
  sports: [],
  coachName: '',
  coachNames: [],
  healthCard: false,
  healthCardExpires: '',
  consentExpires: '',
  uniformReceived: false,
  uniformSize: '',
  registrationFee: 0,
  registrationCharge: true,
  monthlyCharge: true,
  seasonTicket: false,
  subscriptionDiscount: false,
  discountAmount: 0,
  discountReason: '',
  comments: '',
  photoUrl: null,
  gdprConsent: 'pending',
};

type EditDraft = {
  firstName: string;
  lastName: string;
  guardianName: string;
  guardianPhone: string;
  email: string;
  classId: string;
  kind: RegistrationApplicationKind;
  notes: string;
};

function applicationKindLabel(kind: RegistrationApplication['kind']): string {
  if (kind === 'trial') return 'Δοκιμαστική';
  if (kind === 'waitlist') return 'Αναμονή';
  return 'Πλήρης εγγραφή';
}

function toEditDraft(app: RegistrationApplication): EditDraft {
  return {
    firstName: app.firstName,
    lastName: app.lastName,
    guardianName: app.guardianName,
    guardianPhone: app.guardianPhone,
    email: app.email || '',
    classId: app.classId || '',
    kind: app.kind,
    notes: app.notes || '',
  };
}

function exportAthletesXlsx(
  rows: Student[],
  classes: { id: string; name: string }[],
  isDoctor: boolean,
) {
  downloadXlsx(
    'Αθλητές',
    isDoctor
      ? ['Επώνυμο', 'Όνομα', 'Άθλημα', 'ΑΜΚΑ', 'Γονέας', 'Κατάσταση']
      : ['Επώνυμο', 'Όνομα', 'Άθλημα', 'Τμήμα', 'Γονέας', 'Email', 'Κατάσταση'],
    rows.map((s) => {
      const classNames = studentClassIds(s)
        .map((id) => classes.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(', ');
      if (isDoctor) {
        return [
          s.lastName,
          s.firstName,
          s.sport || '',
          s.amka || '',
          s.guardianName || '',
          studentStatusLabels[s.status],
        ];
      }
      return [
        s.lastName,
        s.firstName,
        s.sport || '',
        classNames,
        s.guardianName || '',
        s.email || '',
        studentStatusLabels[s.status],
      ];
    }),
    `athlites-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export function StudentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, refresh } = useAppData();
  const session = getSession();
  const isDoctor = session?.role === 'doctor';
  const isCoach = session?.role === 'coach';
  const canDeleteJoinForm =
    session?.role === 'admin' ||
    session?.role === 'secretariat' ||
    session?.role === 'platform_admin';
  const visibleClasses = useMemo(
    () => visibleClassesForSession(data.classes, data.coaches, session, { seasons: data.clubSeasons }),
    [data.classes, data.coaches, data.clubSeasons, session],
  );
  const allowedClassIds = useMemo(() => classIdsOf(visibleClasses), [visibleClasses]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const sportFilter = (searchParams.get('sport') ?? '').trim();
  const [creating, setCreating] = useState(false);
  const [busyAppId, setBusyAppId] = useState<string | null>(null);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [appMessage, setAppMessage] = useState('');
  const [appError, setAppError] = useState('');
  const [healthCardBusyId, setHealthCardBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<StudentStatus>('inactive');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [joinFormApp, setJoinFormApp] = useState<RegistrationApplication | null>(null);
  const [joinFormImage, setJoinFormImage] = useState<string | null>(null);
  const [joinFormBusy, setJoinFormBusy] = useState(false);

  useEffect(() => {
    const clubId = getSession()?.clubId ?? getPreviewClubId();
    if (!clubId) return;
    void publicClubCloudService.pullRemoteRegistrationApplications(clubId).then((result) => {
      if (result.success && (result.data?.merged ?? 0) > 0) {
        refresh();
        setAppMessage(`Συγχρονίστηκαν ${result.data!.merged} νέες αιτήσεις από το cloud.`);
      }
    });
  }, [refresh]);

  const pendingApplications = useMemo(
    () =>
      (data.registrationApplications ?? [])
        .filter((app) => {
          if (app.status !== 'pending') return false;
          if (!isCoach) return true;
          return Boolean(app.classId && allowedClassIds.has(app.classId));
        })
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
        ),
    [data.registrationApplications, isCoach, allowedClassIds],
  );

  const sportOptions = useMemo(
    () =>
      activeClubSportSelectOptions(data.sports, {
        includeEmpty: true,
        emptyLabel: 'Όλα τα αθλήματα',
        retain: sportFilter ? [sportFilter] : [],
      }),
    [data.sports, sportFilter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = visibleStudentsForSession(data.students, allowedClassIds, session);
    return scoped
      .filter((s) => {
        if (statusFilter) {
          if (s.status !== statusFilter) return false;
        } else if (s.status === 'inactive') {
          return false;
        }
        if (sportFilter) {
          const classSports = studentClassIds(s).map(
            (id) => data.classes.find((c) => c.id === id)?.sport,
          );
          const inSport =
            studentHasSport(s, sportFilter) ||
            classSports.some((classSport) => clubSportsMatch(classSport, sportFilter));
          if (!inSport) return false;
        }
        if (!q) return true;
        const hay = isDoctor
          ? `${s.firstName} ${s.lastName} ${s.amka ?? ''} ${s.guardianName}`.toLowerCase()
          : `${s.firstName} ${s.lastName} ${s.email} ${s.guardianName}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [data.students, data.classes, query, sportFilter, statusFilter, isDoctor, allowedClassIds, session]);

  function setSportFilter(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set('sport', value.trim());
    else next.delete('sport');
    setSearchParams(next, { replace: true });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllVisible() {
    const ids = filtered.map((s) => s.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((prev) =>
      allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  }

  function openBulkStatus() {
    if (selected.length === 0) return;
    setBulkStatus(statusFilter === 'inactive' ? 'active' : 'inactive');
    setBulkOpen(true);
  }

  async function handleBulkStatus() {
    if (selected.length === 0) return;
    setBulkSaving(true);
    for (const id of selected) {
      const student = data.students.find((s) => s.id === id);
      if (!student) continue;
      const { id: _id, enrolledAt: _enrolled, ...rest } = student;
      const result = await studentsService.updateStudent(id, {
        ...rest,
        status: bulkStatus,
      } as StudentInput);
      if (!result.success) {
        setBulkSaving(false);
        window.alert(result.error ?? 'Αποτυχία μαζικής αλλαγής');
        return;
      }
    }
    setBulkSaving(false);
    setBulkOpen(false);
    setSelected([]);
    refresh();
  }

  async function handleHealthCard(studentId: string) {
    const student = data.students.find((s) => s.id === studentId);
    if (!student) return;
    setHealthCardBusyId(studentId);
    const result = await openAthleteHealthCardPreview(student);
    setHealthCardBusyId(null);
    if (!result.success) {
      window.alert(result.error ?? 'Αποτυχία προεπισκόπησης κάρτας υγείας');
    }
  }

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    const result = await studentsService.createStudent(draftAthlete);
    setCreating(false);
    if (!result.success || !result.data) {
      window.alert(result.error ?? 'Αποτυχία δημιουργίας αθλητή');
      return;
    }
    refresh();
    navigate(`/athletes/${result.data.id}`, { state: { editing: true } });
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή αθλητή;')) return;
    await studentsService.deleteStudent(id);
    refresh();
  }

  function startEdit(app: RegistrationApplication) {
    setEditingAppId(app.id);
    setEditDraft(toEditDraft(app));
    setAppError('');
    setAppMessage('');
  }

  function cancelEdit() {
    setEditingAppId(null);
    setEditDraft(null);
  }

  async function openJoinForm(app: RegistrationApplication) {
    setJoinFormApp(app);
    setJoinFormBusy(true);
    setJoinFormImage(null);
    if (app.formSnapshotUrl) {
      setJoinFormImage(app.formSnapshotUrl);
      setJoinFormBusy(false);
      return;
    }
    const clubName = getClubById(getSession()?.clubId)?.name || 'Σύλλογος';
    try {
      const url = await renderPublicJoinFormSnapshot(
        snapshotFieldsFromJoinSource(app, clubName),
      );
      setJoinFormImage(url);
    } catch {
      setJoinFormImage(null);
    } finally {
      setJoinFormBusy(false);
    }
  }

  async function handleDeleteJoinForm(app: RegistrationApplication) {
    if (!canDeleteJoinForm) return;
    if (
      !window.confirm(
        'Διαγραφή του αποθηκευμένου JPEG (και της υπογραφής) αυτής της αίτησης; Η αίτηση μένει εκκρεμής.',
      )
    ) {
      return;
    }
    setBusyAppId(app.id);
    setAppError('');
    const result = await registrationApplicationsService.deleteJoinFormSnapshotForApplication(
      app.id,
    );
    setBusyAppId(null);
    if (!result.success) {
      setAppError(result.error ?? 'Αποτυχία διαγραφής φόρμας');
      return;
    }
    if (joinFormApp?.id === app.id) {
      setJoinFormApp(null);
      setJoinFormImage(null);
    }
    refresh();
    setAppMessage('Διαγράφηκε το JPEG της φόρμας εγγραφής.');
  }

  async function handleSaveEdit(appId: string) {
    if (!editDraft || busyAppId) return;
    setBusyAppId(appId);
    setAppError('');
    setAppMessage('');
    const result = await registrationApplicationsService.updateRegistrationApplication(appId, {
      firstName: editDraft.firstName,
      lastName: editDraft.lastName,
      guardianName: editDraft.guardianName,
      guardianPhone: editDraft.guardianPhone,
      email: editDraft.email,
      classId: editDraft.classId || null,
      kind: editDraft.kind,
      notes: editDraft.notes,
    });
    setBusyAppId(null);
    if (!result.success) {
      setAppError(result.error ?? 'Αποτυχία αποθήκευσης αίτησης');
      return;
    }
    refresh();
    cancelEdit();
    setAppMessage('Η αίτηση ενημερώθηκε.');
  }

  async function handleApprove(appId: string, force = false) {
    if (busyAppId) return;
    setBusyAppId(appId);
    setAppError('');
    setAppMessage('');
    const result = await registrationApplicationsService.approveRegistrationApplication(appId, {
      force,
    });
    setBusyAppId(null);
    if (!result.success || !result.data) {
      const err = result.error ?? 'Αποτυχία έγκρισης';
      if (!force && err.includes('διπλότυπο')) {
        const ok = window.confirm(`${err}\n\nΘέλετε να συνεχίσετε την έγκριση;`);
        if (ok) {
          await handleApprove(appId, true);
          return;
        }
      }
      setAppError(err);
      return;
    }
    refresh();
    cancelEdit();
    const athleteId = result.data.athleteId;
    setAppMessage('Η αίτηση εγκρίθηκε και καταχωρήθηκε στους αθλητές.');
    if (athleteId) {
      navigate(`/athletes/${athleteId}`, { state: { editing: true } });
    }
  }

  async function handleReject(appId: string) {
    if (busyAppId) return;
    if (!confirm('Απόρριψη αίτησης;')) return;
    setBusyAppId(appId);
    setAppError('');
    setAppMessage('');
    const result = await registrationApplicationsService.rejectRegistrationApplication(appId);
    setBusyAppId(null);
    if (!result.success) {
      setAppError(result.error ?? 'Αποτυχία απόρριψης');
      return;
    }
    refresh();
    cancelEdit();
    setAppMessage('Η αίτηση απορρίφθηκε.');
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Αθλητές"
        subtitle={
          sportFilter
            ? `Αθλητές ${sportFilter}`
            : isDoctor
              ? 'Μητρώο αθλητών για κάρτα υγείας (ΑΜΚΑ / γονέας).'
              : 'Μητρώο αθλητών, γονείς και σύνδεση με τμήματα.'
        }
        actions={
          isDoctor ? undefined : (
            <Button type="button" disabled={creating} onClick={() => void handleCreate()}>
              <Plus size={16} /> {creating ? 'Δημιουργία...' : 'Νέος αθλητής'}
            </Button>
          )
        }
      />

      {!isDoctor && pendingApplications.length > 0 ? (
        <section className="panel registration-apps-panel">
          <div className="registration-apps-head">
            <h3>Εκκρεμείς αιτήσεις εγγραφής</h3>
            <span className="badge badge-pending">{pendingApplications.length}</span>
          </div>
          <p className="lede">
            Από δημόσια φόρμα. Οι αιτήσεις μένουν σε αναμονή μέχρι να πατήσετε Έγκριση (ενεργός
            αθλητής). Το JPEG της φόρμας ανοίγει με «Φόρμα εγγραφής».
          </p>
          {appError ? <p className="form-error">{appError}</p> : null}
          {appMessage ? <p className="settings-success">{appMessage}</p> : null}
          <div className="registration-apps-list">
            {pendingApplications.map((app) => {
              const cls = data.classes.find((c) => c.id === app.classId);
              const busy = busyAppId === app.id;
              const editing = editingAppId === app.id && editDraft;
              return (
                <article key={app.id} className="registration-app-card">
                  {editing ? (
                    <div className="registration-app-edit">
                      <div className="public-join-grid">
                        <label className="field">
                          <span className="field-label">Επώνυμο</span>
                          <input
                            className="field-input"
                            value={editDraft.lastName}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, lastName: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Όνομα</span>
                          <input
                            className="field-input"
                            value={editDraft.firstName}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, firstName: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Γονέας</span>
                          <input
                            className="field-input"
                            value={editDraft.guardianName}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, guardianName: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Τηλέφωνο</span>
                          <input
                            className="field-input"
                            value={editDraft.guardianPhone}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, guardianPhone: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Email</span>
                          <input
                            className="field-input"
                            value={editDraft.email}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, email: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Τμήμα</span>
                          <select
                            className="field-input"
                            value={editDraft.classId}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, classId: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {visibleClasses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span className="field-label">Τύπος</span>
                          <select
                            className="field-input"
                            value={editDraft.kind}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                kind: e.target.value as RegistrationApplicationKind,
                              })
                            }
                          >
                            <option value="full">Πλήρης εγγραφή</option>
                            <option value="trial">Δοκιμαστική</option>
                            <option value="waitlist">Λίστα αναμονής</option>
                          </select>
                        </label>
                        <label className="field">
                          <span className="field-label">Σχόλια</span>
                          <input
                            className="field-input"
                            value={editDraft.notes}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, notes: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <div className="row-actions registration-app-edit-actions">
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSaveEdit(app.id)}
                        >
                          Αποθήκευση αλλαγών
                        </Button>
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleApprove(app.id)}
                        >
                          <Check size={16} /> Έγκριση
                        </Button>
                        <Button type="button" variant="secondary" onClick={cancelEdit}>
                          Ακύρωση
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="registration-app-card-grid">
                        <div>
                          <strong>
                            {app.lastName} {app.firstName}
                          </strong>
                          {app.email ? <div className="muted">{app.email}</div> : null}
                          {app.notes ? <div className="muted">{app.notes}</div> : null}
                          {app.joinExtras ? (
                            <div className="muted" style={{ whiteSpace: 'pre-line' }}>
                              {formatJoinExtrasText(app.joinExtras)}
                            </div>
                          ) : null}
                        </div>
                        <div>
                          <span className="muted">Γονέας</span>
                          <div>{app.guardianName}</div>
                          <div className="muted">{app.guardianPhone}</div>
                        </div>
                        <div>
                          <span className="muted">Τμήμα</span>
                          <div>{cls?.name ?? '—'}</div>
                        </div>
                        <div>
                          <span className="muted">Τύπος / Ημ/νία</span>
                          <div>{applicationKindLabel(app.kind)}</div>
                          <div className="muted">{(app.createdAt || '').slice(0, 10) || '—'}</div>
                        </div>
                      </div>
                      <div className="row-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || Boolean(busyAppId)}
                          onClick={() => void openJoinForm(app)}
                        >
                          <FileImage size={16} /> Φόρμα εγγραφής
                        </Button>
                        {canDeleteJoinForm ? (
                          <Button
                            type="button"
                            variant="danger"
                            disabled={busy || Boolean(busyAppId)}
                            onClick={() => void handleDeleteJoinForm(app)}
                          >
                            Διαγραφή φόρμας
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || Boolean(busyAppId)}
                          onClick={() => startEdit(app)}
                        >
                          <Pencil size={16} /> Επεξεργασία
                        </Button>
                        <Button
                          type="button"
                          disabled={busy || Boolean(busyAppId)}
                          onClick={() => void handleApprove(app.id)}
                        >
                          <Check size={16} /> {busy ? '…' : 'Έγκριση'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || Boolean(busyAppId)}
                          onClick={() => void handleReject(app.id)}
                        >
                          <X size={16} /> Απόρριψη
                        </Button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isDoctor
                ? 'Αναζήτηση αθλητή, ΑΜΚΑ ή γονέα...'
                : 'Αναζήτηση αθλητή ή γονέα...'
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Άθλημα</span>
          <select
            className="field-input"
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
          >
            {sportOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Κατάσταση</span>
          <select
            className="field-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Όλα</option>
            <option value="active">Ενεργός</option>
            <option value="trial">Δοκιμαστικός</option>
            <option value="inactive">Ανενεργός</option>
          </select>
        </label>
        {!isDoctor ? (
          <Button
            type="button"
            variant="secondary"
            disabled={selected.length === 0}
            onClick={openBulkStatus}
          >
            <SquarePen size={16} /> Μαζική αλλαγή κατάστασης
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => exportAthletesXlsx(filtered, data.classes, isDoctor)}
        >
          <Download size={16} /> Εξαγωγή
        </Button>
      </div>

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((s) => selected.includes(s.id))}
                  onChange={toggleAllVisible}
                  aria-label="Επιλογή όλων"
                />
              </th>
              <th>Επώνυμο</th>
              <th>Όνομα</th>
              <th>Άθλημα</th>
              <th>{isDoctor ? 'ΑΜΚΑ' : 'Τμήμα'}</th>
              <th>Γονέας</th>
              <th>Κατάσταση</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((student) => {
              const classNames = studentClassIds(student)
                .map((id) => data.classes.find((c) => c.id === id)?.name)
                .filter(Boolean)
                .join(', ');
              return (
                <tr
                  key={student.id}
                  className={isDoctor ? undefined : 'clickable-row'}
                  onClick={
                    isDoctor ? undefined : () => navigate(`/athletes/${student.id}`)
                  }
                >
                  <td
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(student.id)}
                      onChange={() => toggleSelected(student.id)}
                      aria-label={`Επιλογή ${student.lastName} ${student.firstName}`}
                    />
                  </td>
                  <td>
                    <div className="athlete-cell">
                      <span className="athlete-avatar" aria-hidden="true">
                        {student.photoUrl ? (
                          <img src={student.photoUrl} alt="" />
                        ) : (
                          <AthletesIcon size={22} />
                        )}
                      </span>
                      {isDoctor ? (
                        <strong>{student.lastName}</strong>
                      ) : (
                        <Link
                          to={`/athletes/${student.id}`}
                          className="athlete-name-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <strong>{student.lastName}</strong>
                        </Link>
                      )}
                    </div>
                  </td>
                  <td>
                    {isDoctor ? (
                      <strong>{student.firstName}</strong>
                    ) : (
                      <Link
                        to={`/athletes/${student.id}`}
                        className="athlete-name-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <strong>{student.firstName}</strong>
                      </Link>
                    )}
                    {!isDoctor ? <div className="muted">{student.email}</div> : null}
                  </td>
                  <td>{student.sport || '—'}</td>
                  <td>
                    {isDoctor
                      ? formatAmkaForViewer(student.amka, true)
                      : (classNames || '—')}
                  </td>
                  <td>
                    {isDoctor ? (
                      student.guardianName || '—'
                    ) : (
                      <>
                        {student.guardianName || '—'}
                        {student.guardianPhone ? (
                          <div className="muted">{student.guardianPhone}</div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${student.status}`}>
                      {studentStatusLabels[student.status]}
                    </span>
                  </td>
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    {isDoctor ? (
                      <Button
                        variant="ghost"
                        type="button"
                        title="Προεπισκόπηση / εκτύπωση κάρτας υγείας"
                        disabled={healthCardBusyId === student.id}
                        onClick={() => void handleHealthCard(student.id)}
                      >
                        <HeartPulse size={16} />
                        <span className="btn-label-inline">
                          {healthCardBusyId === student.id
                            ? '…'
                            : 'Κάρτα υγείας'}
                        </span>
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() =>
                            navigate(`/athletes/${student.id}`, { state: { editing: true } })
                          }
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => void handleDelete(student.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(joinFormApp)}
        title="Φόρμα δημόσιας εγγραφής"
        wide
        onClose={() => {
          setJoinFormApp(null);
          setJoinFormImage(null);
        }}
        footer={
          <>
            {joinFormImage ? (
              <a
                className="btn btn-secondary"
                href={joinFormImage}
                download={`forma-eggrafis-${joinFormApp?.lastName ?? 'aitisi'}.jpg`}
              >
                Λήψη JPEG
              </a>
            ) : null}
            {canDeleteJoinForm && joinFormApp ? (
              <Button
                type="button"
                variant="danger"
                disabled={Boolean(busyAppId)}
                onClick={() => void handleDeleteJoinForm(joinFormApp)}
              >
                Διαγραφή
              </Button>
            ) : null}
          </>
        }
      >
        {joinFormBusy ? (
          <p className="muted">Φόρτωση στιγμιότυπου…</p>
        ) : joinFormImage ? (
          <img
            className="join-form-snapshot-preview"
            src={joinFormImage}
            alt="Στιγμιότυπο φόρμας εγγραφής"
          />
        ) : (
          <p className="muted">Δεν υπάρχει αποθηκευμένο στιγμιότυπο για αυτή την αίτηση.</p>
        )}
      </Modal>

      <Modal
        open={bulkOpen}
        title="Μαζική αλλαγή κατάστασης"
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
            <Button type="button" disabled={bulkSaving} onClick={() => void handleBulkStatus()}>
              {bulkSaving ? 'Εφαρμογή...' : 'Εφαρμογή'}
            </Button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">
            Νέα κατάσταση για {selected.length} εγγραφές
          </span>
          <select
            className="field-input"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as StudentStatus)}
          >
            <option value="active">Ενεργός</option>
            <option value="trial">Δοκιμαστικός</option>
            <option value="inactive">Ανενεργός</option>
          </select>
        </label>
      </Modal>
    </div>
  );
}
