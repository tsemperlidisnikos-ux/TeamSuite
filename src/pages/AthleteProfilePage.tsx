import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HeartPulse,
  History,
  IdCard,
  Megaphone,
  Shield,
  ShieldCheck,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import * as studentsService from '../api/services/studentsService';
import * as feeChargesService from '../api/services/feeChargesService';
import * as progressReportsService from '../api/services/progressReportsService';
import * as amkaAuditService from '../api/services/amkaAuditService';
import { getSession } from '../auth/auth';
import { getClubById, ensureSessionClub } from '../auth/clubs';
import { Button } from '../components/ui/Button';
import { AppPopupLayer } from '../components/ui/AppPopupLayer';
import { useAppData } from '../hooks/useAppData';
import type { StudentInput } from '../schemas';
import type { Gender, Student } from '../types';
import { formatJoinExtrasText } from '../shared/publicJoinExtras';
import { buildHealthCardPdf } from '../utils/healthCardPdf';
import { sizeChartOptGroups } from '../utils/sizeChartOptions';
import { formatDate } from '../utils/labels';
import { localDateIso } from '../utils/dates';
import { getPreviewClubId, getAppLogoUrl, loadPlatformConfig } from '../platform/platformConfig';
import { athletePublicCode, buildAthleteIdCardUrl } from '../utils/athleteIdCard';
import {
  AMKA_CONSENT_CHECKBOX,
  AMKA_CONSENT_LABEL,
  AMKA_CONSENT_TITLE,
  AMKA_PRIVACY_SECTION_HTML,
  MEDICAL_ACCESS_HINT,
} from '../shared/termsDefaults';
import { canAccessAmka, canAccessMedical, formatAmkaForViewer } from '../utils/amkaAccess';
import { announcementVisibleToAthlete } from '../utils/announcementAudience';
import {
  classIdsOf,
  visibleClassesForSession,
} from '../utils/coachScope';
import { studentClassIds, studentInAnyClass } from '../utils/studentClasses';
import { studentCoachNames } from '../utils/studentCoaches';
import { studentSports, normalizeStudentSports } from '../utils/studentSports';
import { activeClubSportSelectOptions } from '../utils/clubSports';
type ProfileTab =
  | 'personal'
  | 'identity'
  | 'fees'
  | 'health'
  | 'gdpr'
  | 'progress'
  | 'announcements'
  | 'history';

function htmlToPlain(html: string): string {
  if (typeof document === 'undefined') {
    return String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.innerText || el.textContent || '').trim();
}

function isAthleteMinor(birthDate: string | undefined): boolean {
  if (!birthDate) return true;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return true;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) {
    age -= 1;
  }
  return age < 18;
}
const PROFILE_TABS: { id: ProfileTab; label: string; icon: typeof User }[] = [
  { id: 'personal', label: 'Προσωπικά Στοιχεία', icon: User },
  { id: 'identity', label: 'AMKA & Ταυτοποίηση', icon: IdCard },
  { id: 'health', label: 'Κάρτα Υγείας', icon: HeartPulse },
  { id: 'announcements', label: 'Ανακοινώσεις', icon: Megaphone },
  { id: 'fees', label: 'Συνδρομές / Οφειλές', icon: CreditCard },
  { id: 'gdpr', label: 'Συγκαταθέσεις (GDPR)', icon: ShieldCheck },
  { id: 'progress', label: 'Πρόοδος', icon: TrendingUp },
  { id: 'history', label: 'Ιστορικό', icon: History },
];

const MONTH_LABELS = [
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
];

const DISCOUNT_REASONS = [
  { value: '', label: '—' },
  { value: 'siblings', label: 'Αδέλφια' },
  { value: 'annual', label: 'Ετήσια συνδρομή' },
  { value: 'social', label: 'Κοινωνικό κριτήριο' },
  { value: 'other', label: 'Άλλο' },
];

const YES_NO = [
  { value: 'yes', label: 'Ναι' },
  { value: 'no', label: 'Όχι' },
];

const BLOOD_TYPES = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const BLOOD_TYPE_LABEL: Record<string, string> = {
  '': '--',
  'A+': 'A+',
  'A-': 'A-',
  'B+': 'B+',
  'B-': 'B-',
  'AB+': 'AB+',
  'AB-': 'AB-',
  'O+': 'O+',
  'O-': 'O-',
};

function seasonMonths(startYear: number) {
  return MONTH_LABELS.map((label, index) => {
    const year = index < 5 ? startYear : startYear + 1;
    const month = ((index + 7) % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { label: `${label} ${year}`, key, year, month };
  });
}

function ageFromBirthDate(birthDate: string | undefined) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function statusBadgeLabel(status: Student['status']) {
  if (status === 'active') return 'ΕΝΕΡΓΟΣ';
  if (status === 'trial') return 'ΔΟΚΙΜΗ';
  return 'ΑΝΕΝΕΡΓΟΣ';
}

function statusText(status: Student['status']) {
  if (status === 'active') return 'Ενεργός';
  if (status === 'trial') return 'Δοκιμή';
  return 'Ανενεργός';
}

function toForm(student: Student): StudentInput {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    phone: student.phone,
    birthDate: student.birthDate,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    classId: student.classId,
    classIds: studentClassIds(student),
    status: student.status,
    monthlyFee: student.monthlyFee,
    amka: student.amka ?? '',
    gender: student.gender ?? '',
    fatherFirstName: student.fatherFirstName ?? '',
    motherFirstName: student.motherFirstName ?? '',
    fatherEmail: student.fatherEmail ?? '',
    motherEmail: student.motherEmail ?? '',
    motherPhone: student.motherPhone ?? '',
    address: student.address ?? '',
    postalCode: student.postalCode ?? '',
    city: student.city ?? '',
    clubName: student.clubName ?? '',
    registrationNumber: student.registrationNumber ?? '',
    ...(() => {
      const normalized = normalizeStudentSports(student.sports, student.sport);
      return { sport: normalized.sport, sports: normalized.sports };
    })(),
    healthCardStatus: student.healthCardStatus ?? '',
    healthCard: student.healthCard ?? student.healthCardStatus === 'Έγκυρη',
    healthCardExpires: student.healthCardExpires ?? '',
    consentExpires: student.consentExpires ?? '',
    uniformReceived: student.uniformReceived ?? false,
    uniformSize: student.uniformSize ?? '',
    joinExtras: student.joinExtras,
    registrationFee: student.registrationFee ?? 0,
    registrationCharge: student.registrationCharge ?? (student.registrationFee ?? 0) > 0,
    monthlyCharge: student.monthlyCharge ?? true,
    customCharge: student.customCharge ?? false,
    seasonTicket: student.seasonTicket ?? false,
    subscriptionDiscount: student.subscriptionDiscount ?? false,
    discountAmount: student.discountAmount ?? 0,
    discountReason: student.discountReason ?? '',
    comments: student.comments ?? '',
    photoUrl: student.photoUrl ?? null,
    gdprConsent: student.gdprConsent ?? 'pending',
    gdprItems: {
      personalData: false,
      photoUse: false,
      gallery: false,
      communication: false,
      medical: false,
      ...student.gdprItems,
      ...(student.gdprConsent === 'full' || student.gdprConsent === 'locked'
        ? {
            personalData: true,
            photoUse: true,
            gallery: true,
            communication: true,
            medical: true,
          }
        : {}),
      amkaHealthCard: Boolean(student.gdprItems?.amkaHealthCard),
    },
    amkaConsentAt: student.amkaConsentAt ?? '',
    healthCardSealedAt: student.healthCardSealedAt ?? '',
    placeOfBirth: student.placeOfBirth ?? '',
    nationality: student.nationality ?? '',
    communicationLanguage: student.communicationLanguage ?? 'Ελληνικά',
    county: student.county ?? '',
    jerseyNumber: student.jerseyNumber ?? '',
    position: student.position ?? '',
    athleticLevel: student.athleticLevel ?? '',
    athleticStartDate: student.athleticStartDate ?? '',
    coachName: student.coachName ?? '',
    coachNames: studentCoachNames(student),
    emergencyName: student.emergencyName ?? student.guardianName ?? '',
    emergencyPhone: student.emergencyPhone ?? student.guardianPhone ?? '',
    emergencyRelation: student.emergencyRelation ?? '',
    emergencyAltPhone: student.emergencyAltPhone ?? '',
    doctorName: student.doctorName ?? '',
    doctorPhone: student.doctorPhone ?? '',
    bloodType: student.bloodType ?? '',
    allergies: student.allergies ?? '',
    chronicConditions: student.chronicConditions ?? '',
    medication: student.medication ?? '',
    registrationExpires: student.registrationExpires ?? '',
    autoRenewal: student.autoRenewal ?? false,
  };
}

function ApField({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`ap-field ${className}`.trim()}>
      <span className="ap-field-label">{label}</span>
      {children}
    </label>
  );
}

function ApCard({
  title,
  children,
  className = '',
  actions,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`ap-card ${className}`.trim()}>
      <div className="ap-card-head">
        <h3 className="ap-card-title">{title}</h3>
        {actions ? <div className="ap-card-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ApMultiCheckDropdown({
  summary,
  options,
  disabled = false,
  emptyText = 'Δεν υπάρχουν επιλογές.',
  placeholder = 'Επιλογή…',
}: {
  summary: string;
  options: Array<{
    value: string;
    label: string;
    checked: boolean;
    onToggle: (checked: boolean) => void;
  }>;
  disabled?: boolean;
  emptyText?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={`ap-multi-dd ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="ap-multi-dd-trigger"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={summary ? undefined : 'ap-multi-dd-placeholder'}>
          {summary || placeholder}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="ap-multi-dd-panel" role="listbox" aria-multiselectable>
          {options.length === 0 ? (
            <p className="ap-muted">{emptyText}</p>
          ) : (
            options.map((option) => (
              <label key={option.value} className="ap-check ap-multi-dd-option">
                <input
                  type="checkbox"
                  checked={option.checked}
                  disabled={disabled}
                  onChange={(e) => option.onToggle(e.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AthleteProfilePage() {
  const { athleteId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, refresh } = useAppData();
  const session = getSession();
  const amkaAllowed = canAccessAmka(session?.role);
  const medicalAllowed = canAccessMedical(session?.role);
  const feesTabAllowed = session?.role !== 'coach';
  const isCoach = session?.role === 'coach';
  const visibleClasses = useMemo(
    () => visibleClassesForSession(data.classes, data.coaches, session, { seasons: data.clubSeasons }),
    [data.classes, data.coaches, data.clubSeasons, session],
  );
  const allowedClassIds = useMemo(() => classIdsOf(visibleClasses), [visibleClasses]);
  const student = data.students.find((s) => s.id === athleteId);
  const isSelfAthlete = useMemo(() => {
    if (session?.role !== 'athlete' || !athleteId) return false;
    if (session.athleteId && session.athleteId === athleteId) return true;
    const email = session.email?.toLowerCase() ?? '';
    if (!email || !student) return false;
    return student.email.toLowerCase() === email;
  }, [session, athleteId, student]);
  const canEditProfile = session?.role !== 'athlete' && session?.role !== 'parent';

  const [editing, setEditing] = useState(
    Boolean((location.state as { editing?: boolean } | null)?.editing),
  );
  const [profileTab, setProfileTab] = useState<ProfileTab>('personal');
  const [form, setForm] = useState<StudentInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [seasonStart, setSeasonStart] = useState(2026);
  const [progressTitle, setProgressTitle] = useState('');
  const [progressNotes, setProgressNotes] = useState('');
  const [progressRating, setProgressRating] = useState(3);
  const [progressDate, setProgressDate] = useState(localDateIso);
  const [progressError, setProgressError] = useState('');
  const [progressSaving, setProgressSaving] = useState(false);
  const [loadingHealthCardPreview, setLoadingHealthCardPreview] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsAnchorRef = useRef<HTMLDivElement>(null);
  const healthCardPreviewUrlRef = useRef<string | null>(null);
  const amkaViewLoggedRef = useRef<string | null>(null);

  const uniformSizeOptions = useMemo(() => {
    const sizes = sizeChartOptGroups(data.sizeChart).flatMap((g) => g.sizes);
    const all = new Set(sizes.map((s) => s.toUpperCase()));
    const current = (form?.uniformSize ?? student?.uniformSize ?? '').trim();
    if (current && !all.has(current.toUpperCase())) {
      return [...sizes, current];
    }
    return sizes;
  }, [data.sizeChart, form?.uniformSize, student?.uniformSize]);

  const athleteIds = useMemo(
    () =>
      [...data.students]
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
        )
        .map((s) => s.id),
    [data.students],
  );

  const athleteIndex = athleteId ? athleteIds.indexOf(athleteId) : -1;
  const prevAthleteId = athleteIndex > 0 ? athleteIds[athleteIndex - 1] : null;
  const nextAthleteId =
    athleteIndex >= 0 && athleteIndex < athleteIds.length - 1
      ? athleteIds[athleteIndex + 1]
      : null;

  useEffect(() => {
    if (student) setForm(toForm(student));
  }, [student]);

  useEffect(() => {
    if (!amkaAllowed || !student || !session) return;
    if (profileTab !== 'identity' && profileTab !== 'health' && profileTab !== 'personal') return;
    const amkaValue = (student.amka ?? '').trim();
    if (!amkaValue) return;
    const key = `${student.id}:${profileTab}`;
    if (amkaViewLoggedRef.current === key) return;
    amkaViewLoggedRef.current = key;
    void amkaAuditService.recordAmkaAccess({
      userId: session.id,
      userName: session.fullName || session.email || session.id,
      athleteId: student.id,
      athleteName: `${student.lastName} ${student.firstName}`.trim(),
      action: 'view',
    });
  }, [amkaAllowed, profileTab, session, student]);

  useEffect(() => {
    if (!feesTabAllowed && profileTab === 'fees') {
      setProfileTab('personal');
    }
  }, [feesTabAllowed, profileTab]);

  useEffect(() => {
    if (!feesTabAllowed || profileTab !== 'fees' || !athleteId) return;
    let cancelled = false;
    void (async () => {
      const result = await feeChargesService.syncAthleteSubscriptionDiscount(athleteId);
      if (!cancelled && result.success && (result.data?.updated ?? 0) > 0) refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    feesTabAllowed,
    profileTab,
    athleteId,
    student?.subscriptionDiscount,
    student?.discountAmount,
    refresh,
  ]);

  useEffect(() => {
    if ((location.state as { editing?: boolean } | null)?.editing) {
      setEditing(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    return () => {
      if (healthCardPreviewUrlRef.current) {
        URL.revokeObjectURL(healthCardPreviewUrlRef.current);
      }
    };
  }, []);

  const months = useMemo(() => seasonMonths(seasonStart), [seasonStart]);

  const clubOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [{ value: '', label: '—' }];
    const seen = new Set<string>();

    const push = (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ value: trimmed, label: trimmed });
    };

    // Μόνο σωματεία από Ρυθμίσεις → Σωματείο (όχι το όνομα του club-tenant).
    for (const assoc of data.associations ?? []) {
      if (assoc.active === false) continue;
      push(assoc.name);
    }

    // Κράτα παλιά τιμή αθλητή αν δεν υπάρχει πλέον στο κατάλογο.
    push(form?.clubName ?? '');

    return options;
  }, [data.associations, form?.clubName]);

  const sportOptions = useMemo(() => {
    return activeClubSportSelectOptions(data.sports, {
      includeEmpty: false,
      retain: studentSports(form ?? { sport: '', sports: [] }),
    });
  }, [data.sports, form?.sport, form?.sports]);

  const profileClubId = getPreviewClubId() ?? session?.clubId ?? null;
  const profileClub = useMemo(
    () => (profileClubId ? getClubById(profileClubId) : ensureSessionClub(session)),
    [profileClubId, session],
  );

  const qrSeasonLabel = useMemo(() => {
    const seasons = loadPlatformConfig().seasons ?? [];
    if (seasons.length > 0) return seasons[seasons.length - 1]!;
    return `${seasonStart}–${String(seasonStart + 1).slice(-2)}`;
  }, [seasonStart]);

  const clubLogoUrl = useMemo(
    () => profileClub?.logoUrl?.trim() || getAppLogoUrl() || null,
    [profileClub?.logoUrl],
  );

  const athleteQrPayload = useMemo(() => {
    if (!student || !form) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return buildAthleteIdCardUrl(origin, {
      v: 1,
      clubName: profileClub?.name || form.clubName || 'Σύλλογος',
      season: qrSeasonLabel,
      lastName: form.lastName,
      firstName: form.firstName,
      birthDate: form.birthDate,
      athleteCode: athletePublicCode(form.registrationNumber, student.id),
      logoUrl: clubLogoUrl,
    });
  }, [student, form, profileClub?.name, qrSeasonLabel, clubLogoUrl]);

  const athleteQrImageUrl = useMemo(() => {
    if (!athleteQrPayload) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(athleteQrPayload)}`;
  }, [athleteQrPayload]);

  const financeRows = useMemo(() => {
    if (!student) return [];
    const athleteTx = (data.transactions ?? []).filter((t) => t.athleteId === student.id);
    return months.map((m) => {
      const monthTx = athleteTx.filter(
        (t) => Number(t.month) === m.month && Number(t.year) === m.year,
      );
      const charge = monthTx
        .filter((t) => t.type === 'charge')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const payment = monthTx
        .filter((t) => t.type === 'payment')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const attendance = data.attendance.filter(
        (a) => a.studentId === student.id && a.date.startsWith(m.key),
      );
      const present = attendance.filter((a) => a.present).length;
      const absent = attendance.filter((a) => !a.present).length;
      return {
        ...m,
        charge,
        payment,
        balance: charge - payment,
        trainings: attendance.length,
        present,
        absent,
      };
    });
  }, [months, student, data.transactions, data.attendance]);

  const totals = useMemo(
    () =>
      financeRows.reduce(
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
    [financeRows],
  );

  const progressReports = useMemo(
    () => (data.progressReports ?? []).filter((r) => r.athleteId === athleteId),
    [data.progressReports, athleteId],
  );

  const athleteAnnouncements = useMemo(() => {
    if (!student) return [];
    const ids = studentClassIds(student);
    const classSport =
      ids
        .map((id) => data.classes.find((c) => c.id === id)?.sport)
        .find(Boolean) || null;
    return (data.announcements ?? [])
      .filter((a) =>
        announcementVisibleToAthlete(a, {
          athleteId: student.id,
          classId: student.classId,
          classIds: ids,
          sport: student.sport,
          clubName: student.clubName,
          classSport,
        }),
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [data.announcements, data.classes, student]);

  if (session?.role === 'doctor') {
    return <Navigate to="/athletes" replace />;
  }

  if (session?.role === 'athlete' && athleteId && !isSelfAthlete) {
    if (session.athleteId) {
      return <Navigate to={`/athletes/${session.athleteId}`} replace />;
    }
    return <Navigate to="/" replace />;
  }

  if (
    isCoach &&
    student &&
    !studentInAnyClass(student, allowedClassIds)
  ) {
    return <Navigate to="/athletes" replace />;
  }

  if (!student || !form) {
    return (
      <div className="stack-lg">
        <p className="form-error">Ο αθλητής δεν βρέθηκε.</p>
        <Link className="btn btn-primary" to="/athletes">
          Πίσω στους αθλητές
        </Link>
      </div>
    );
  }

  function setField<K extends keyof StudentInput>(key: K, value: StudentInput[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!form || !student) return;
    setSaving(true);
    setError('');
    const amkaValue = amkaAllowed ? (form.amka ?? '').trim() : (student.amka ?? '').trim();
    if (amkaAllowed && amkaValue && !form.gdprItems?.amkaHealthCard) {
      setSaving(false);
      setError(
        isAthleteMinor(form.birthDate)
          ? 'Απαιτείται ρητή συγκατάθεση γονέα για τη συλλογή του ΑΜΚΑ.'
          : 'Απαιτείται ρητή συγκατάθεση για τη συλλογή και επεξεργασία του ΑΜΚΑ.',
      );
      return;
    }
    const previousAmka = (student.amka ?? '').trim();
    const payload: StudentInput = {
      ...form,
      amka: amkaValue,
      amkaConsentAt: amkaValue
        ? form.amkaConsentAt || localDateIso()
        : '',
      // Preserve medical fields when role cannot access them
      doctorName: medicalAllowed ? form.doctorName : student.doctorName,
      doctorPhone: medicalAllowed ? form.doctorPhone : student.doctorPhone,
      bloodType: medicalAllowed ? form.bloodType : student.bloodType,
      allergies: medicalAllowed ? form.allergies : student.allergies,
      chronicConditions: medicalAllowed ? form.chronicConditions : student.chronicConditions,
      medication: medicalAllowed ? form.medication : student.medication,
      gdprItems: {
        personalData: Boolean(form.gdprItems?.personalData),
        photoUse: Boolean(form.gdprItems?.photoUse),
        gallery: Boolean(form.gdprItems?.gallery),
        communication: Boolean(form.gdprItems?.communication),
        medical: Boolean(form.gdprItems?.medical),
        amkaHealthCard: amkaValue ? Boolean(form.gdprItems?.amkaHealthCard) : false,
      },
      guardianName:
        form.guardianName ||
        (form.fatherFirstName
          ? `${form.fatherFirstName} ${form.lastName}`.trim()
          : form.guardianName),
      guardianPhone: form.guardianPhone || form.emergencyPhone || form.phone || '',
    };
    const result = await studentsService.updateStudent(student.id, payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    if (amkaAllowed && session) {
      const athleteName = `${payload.lastName} ${payload.firstName}`.trim();
      if (amkaValue !== previousAmka) {
        void amkaAuditService.recordAmkaAccess({
          userId: session.id,
          userName: session.fullName || session.email || session.id,
          athleteId: student.id,
          athleteName,
          action: amkaValue ? 'edit' : 'delete',
        });
      } else if (amkaValue && form.gdprItems?.amkaHealthCard && !student.gdprItems?.amkaHealthCard) {
        void amkaAuditService.recordAmkaAccess({
          userId: session.id,
          userName: session.fullName || session.email || session.id,
          athleteId: student.id,
          athleteName,
          action: 'consent',
        });
      }
    }
    setEditing(false);
    refresh();
  }

  function handleCancel() {
    if (!student) return;
    setForm(toForm(student));
    setEditing(false);
    setError('');
  }

  function handlePhoto(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setField('photoUrl', String(reader.result));
      setEditing(true);
    };
    reader.readAsDataURL(file);
  }

  function openAthleteQrCardPreview() {
    if (!form || !student) return;

    const clubName = profileClub?.name || form.clubName || 'Σύλλογος';
    const lastName = form.lastName || '—';
    const firstName = form.firstName || '—';
    const birthLabel = form.birthDate ? formatDate(form.birthDate) : '—';
    const athleteCode = athletePublicCode(form.registrationNumber, student.id);
    const season = qrSeasonLabel;
    const logo = clubLogoUrl || '';
    const qrSrc = athleteQrImageUrl || '';
    const initials = clubName.trim().slice(0, 2).toUpperCase() || 'SS';

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const popupWidth = Math.round(screen.availWidth * 0.6);
    const popupHeight = Math.round(screen.availHeight * 0.75);
    const popupLeft = Math.max(0, Math.round((screen.availWidth - popupWidth) / 2));
    const popupTop = Math.max(0, Math.round((screen.availHeight - popupHeight) / 2));
    const features = [
      'popup=yes',
      'noopener=no',
      'noreferrer=no',
      `width=${popupWidth}`,
      `height=${popupHeight}`,
      `left=${popupLeft}`,
      `top=${popupTop}`,
    ].join(',');

    const previewWindow = window.open('', 'athleteQrCardPreview', features);
    if (!previewWindow) {
      setError('Επίτρεψε τα pop-up για την προεπισκόπηση QR κάρτας');
      return;
    }

    try {
      previewWindow.resizeTo(popupWidth, popupHeight);
      previewWindow.moveTo(popupLeft, popupTop);
    } catch {
      // ignore — some browsers block resize/move
    }

    previewWindow.opener = null;
    const logoHtml = logo
      ? `<img class="logo" src="${escapeHtml(logo)}" alt="${escapeHtml(clubName)}" />`
      : `<div class="logo-fallback" aria-hidden="true">${escapeHtml(initials)}</div>`;
    const qrHtml = qrSrc
      ? `<img class="qr" src="${escapeHtml(qrSrc)}" alt="QR κάρτα" />`
      : `<div class="qr" aria-hidden="true"></div>`;

    previewWindow.document.write(`<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Προεπισκόπηση QR κάρτας</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: linear-gradient(180deg, #f0f4f8 0%, #e4ebf2 100%);
      color: #0f1b2d;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: #fff;
      border-bottom: 1px solid #d7dee8;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    header strong { font-size: 0.95rem; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button {
      font: inherit;
      font-weight: 700;
      border-radius: 8px;
      padding: 0.45rem 0.85rem;
      cursor: pointer;
      border: 1px solid #c9d4e0;
      background: #f5f7fa;
      color: #0f1b2d;
    }
    button.primary {
      background: #1e4a6e;
      border-color: #1e4a6e;
      color: #fff;
    }
    main {
      display: grid;
      place-items: center;
      padding: 1.5rem 1rem 2rem;
    }
    .card {
      width: min(400px, 100%);
      background: #fff;
      border: 1px solid #d7dee8;
      border-radius: 14px;
      padding: 1.15rem 1.25rem 1.25rem;
      box-shadow: 0 8px 24px rgba(15, 27, 45, 0.08);
    }
    .top {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      margin-bottom: 0.95rem;
    }
    .logo, .logo-fallback {
      width: 56px;
      height: 56px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      background: #f5f7fa;
      flex-shrink: 0;
      object-fit: contain;
    }
    .logo-fallback {
      display: grid;
      place-items: center;
      font-weight: 800;
      color: #5b6b7c;
    }
    .heading strong {
      display: block;
      font-size: 1.05rem;
      font-weight: 800;
      color: #0f1b2d;
    }
    .heading span {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.85rem;
      color: #5b6b7c;
    }
    .body {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 1rem;
      align-items: center;
    }
    .qr {
      width: 120px;
      height: 120px;
      border-radius: 8px;
      background: #f5f7fa;
      object-fit: contain;
    }
    .meta { display: grid; gap: 0.7rem; }
    .meta span {
      display: block;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #7a8796;
    }
    .meta strong {
      display: block;
      margin-top: 0.15rem;
      font-size: 1rem;
      font-weight: 800;
      color: #0f1b2d;
    }
    @media print {
      header { display: none !important; }
      html, body { background: #fff; }
      main { padding: 0; }
      .card { box-shadow: none; border-color: #ccc; }
    }
  </style>
</head>
<body>
  <header>
    <strong>Προεπισκόπηση QR κάρτας</strong>
    <div class="actions">
      <button type="button" class="primary" onclick="window.print()">Εκτύπωση</button>
      <button type="button" onclick="window.print()">Λήψη</button>
      <button type="button" onclick="window.close()">Κλείσιμο</button>
    </div>
  </header>
  <main>
    <article class="card">
      <div class="top">
        ${logoHtml}
        <div class="heading">
          <strong>ΤΑΥΤΟΤΗΤΑ ΑΘΛΗΤΗ</strong>
          <span>${escapeHtml(clubName)} · Σεζόν ${escapeHtml(season)}</span>
        </div>
      </div>
      <div class="body">
        ${qrHtml}
        <div class="meta">
          <div><span>Επώνυμο</span><strong>${escapeHtml(lastName)}</strong></div>
          <div><span>Όνομα</span><strong>${escapeHtml(firstName)}</strong></div>
          <div><span>Ημ. γέννησης</span><strong>${escapeHtml(birthLabel)}</strong></div>
          <div><span>Κωδ. αθλητή</span><strong>${escapeHtml(athleteCode)}</strong></div>
        </div>
      </div>
    </article>
  </main>
</body>
</html>`);
    previewWindow.document.close();
    try {
      previewWindow.focus();
    } catch {
      // ignore
    }
  }

  async function openHealthCardPreview() {
    if (!form) return;
    if (!amkaAllowed) {
      setError('Η προεπισκόπηση κάρτας υγείας με ΑΜΚΑ είναι διαθέσιμη μόνο σε διαχειριστή/ιατρό.');
      return;
    }
    setLoadingHealthCardPreview(true);
    setError('');
    const result = await buildHealthCardPdf({
      sport: form.sport,
      amka: form.amka,
      gender: form.gender,
      lastName: form.lastName,
      firstName: form.firstName,
      email: form.email,
      birthDate: form.birthDate,
      registrationNumber: form.registrationNumber,
      clubName: form.clubName,
      fatherFirstName: form.fatherFirstName,
      motherFirstName: form.motherFirstName,
      guardianPhone: form.guardianPhone,
      motherPhone: form.motherPhone,
      fatherEmail: form.fatherEmail,
      motherEmail: form.motherEmail,
      photoUrl: form.photoUrl,
    });
    setLoadingHealthCardPreview(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία δημιουργίας PDF κάρτας υγείας');
      return;
    }

    if (healthCardPreviewUrlRef.current) {
      URL.revokeObjectURL(healthCardPreviewUrlRef.current);
    }
    const pdfUrl = URL.createObjectURL(result.data);
    healthCardPreviewUrlRef.current = pdfUrl;

    const features = [
      'popup=yes',
      'noopener=no',
      'noreferrer=no',
      `width=${screen.availWidth}`,
      `height=${screen.availHeight}`,
      'left=0',
      'top=0',
    ].join(',');

    const previewWindow = window.open('', 'healthCardPreview', features);
    if (!previewWindow) {
      setError('Επίτρεψε τα pop-up για την προεπισκόπηση κάρτας υγείας');
      return;
    }

    previewWindow.opener = null;
    previewWindow.document.write(`<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="utf-8" />
  <title>Προεπισκόπηση κάρτας υγείας</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: "Segoe UI", system-ui, sans-serif; background: #525659; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; background: #fff; border-bottom: 1px solid #cfe0db; }
    iframe { width: 100%; height: calc(100% - 64px); border: 0; }
  </style>
</head>
<body>
  <header>
    <strong>Κάρτα υγείας — προεπισκόπηση</strong>
    <button type="button" onclick="window.close()">Κλείσιμο</button>
  </header>
  <iframe title="Κάρτα υγείας" src="${pdfUrl}"></iframe>
</body>
</html>`);
    previewWindow.document.close();
    try {
      previewWindow.focus();
    } catch {
      // ignore
    }
  }

  const inputClass = 'ap-input';
  const disabled = !editing || !canEditProfile;

  const textInput = (
    value: string | undefined,
    onChange: (v: string) => void,
    opts?: { type?: string; upper?: boolean; placeholder?: string },
  ) => (
    <input
      type={opts?.type ?? 'text'}
      className={inputClass}
      value={value ?? ''}
      disabled={disabled}
      placeholder={opts?.placeholder}
      onChange={(e) =>
        onChange(opts?.upper ? e.target.value.toUpperCase() : e.target.value)
      }
    />
  );

  const yesNo = (value: boolean, onChange: (v: boolean) => void) => (
    <select
      className={inputClass}
      value={value ? 'yes' : 'no'}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === 'yes')}
    >
      {YES_NO.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const selectedClassIds = studentClassIds(form);
  const selectedSports = studentSports(form);
  const sportLabel = selectedSports.join(', ') || '—';
  const classLabel =
    selectedClassIds
      .map((id) => data.classes.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(', ') || '—';
  const age = ageFromBirthDate(form.birthDate);

  return (
    <div className="athlete-profile-page ap-shell">
      <nav className="ap-breadcrumb" aria-label="Breadcrumb">
        {isSelfAthlete ? (
          <button type="button" className="ap-crumb-link" onClick={() => navigate('/')}>
            Αρχική
          </button>
        ) : (
          <button type="button" className="ap-crumb-link" onClick={() => navigate('/athletes')}>
            Αθλητές
          </button>
        )}
        <span className="ap-crumb-sep">›</span>
        <span>Προφίλ Αθλητή</span>
      </nav>

      <header className="ap-hero">
        <div className="ap-hero-main">
          <div className="ap-hero-photo-wrap">
            {form.photoUrl ? (
              <img src={form.photoUrl} alt="" className="ap-hero-photo" />
            ) : (
              <div className="ap-hero-photo ap-hero-photo--empty" aria-hidden="true" />
            )}
            {editing && canEditProfile ? (
              <div className="ap-hero-photo-actions">
                <label className="ap-hero-photo-upload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      handlePhoto(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  Αλλαγή
                </label>
                {form.photoUrl ? (
                  <button
                    type="button"
                    className="ap-hero-photo-delete"
                    onClick={() => setField('photoUrl', null)}
                  >
                    Διαγραφή
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="ap-hero-copy">
            <div className="ap-hero-title-row">
              <h1>
                {form.lastName} {form.firstName}
              </h1>
              <span className={`ap-status-badge ap-status-badge--${form.status}`}>
                {statusBadgeLabel(form.status)}
              </span>
            </div>
            <p className="ap-hero-meta">
              <span>Κωδ. Αθλητή: {form.registrationNumber || student.id.slice(-8).toUpperCase()}</span>
              <span className="ap-hero-dot">·</span>
              <span>Ημ/νία Εγγραφής: {formatDate(student.enrolledAt)}</span>
            </p>
            <div className="ap-hero-stats">
              <div className="ap-hero-stat">
                <Calendar size={16} aria-hidden />
                <span>
                  {form.birthDate
                    ? `${formatDate(form.birthDate)}${age != null ? ` (${age} ετών)` : ''}`
                    : '—'}
                </span>
              </div>
              <div className="ap-hero-stat">
                <Shield size={16} aria-hidden />
                <span>ΑΜΚΑ {formatAmkaForViewer(form.amka, amkaAllowed)}</span>
              </div>
              <div className="ap-hero-stat">
                <TrendingUp size={16} aria-hidden />
                <span>{sportLabel}</span>
              </div>
              <div className="ap-hero-stat">
                <Users size={16} aria-hidden />
                <span>{classLabel}</span>
              </div>
              <div className="ap-hero-stat">
                <span className={`ap-live-dot ap-live-dot--${form.status}`} aria-hidden />
                <span>Κατάσταση {statusText(form.status)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ap-hero-actions">
          <div className="ap-actions-menu" ref={actionsAnchorRef}>
            <button
              type="button"
              className="ap-actions-btn"
              onClick={() => setActionsOpen((v) => !v)}
              aria-expanded={actionsOpen}
            >
              Ενέργειες
              <ChevronDown size={14} className={actionsOpen ? 'ap-chevron-open' : ''} />
            </button>
          </div>
          <AppPopupLayer
            open={actionsOpen}
            onClose={() => setActionsOpen(false)}
            anchorRef={actionsAnchorRef}
            panelClassName="ap-actions-dropdown"
            align="right"
          >
            {!editing && canEditProfile ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setActionsOpen(false);
                }}
              >
                Επεξεργασία προφίλ
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                openAthleteQrCardPreview();
              }}
            >
              Προεπισκόπηση QR κάρτας
            </button>
            <button
              type="button"
              onClick={() => {
                setProfileTab('health');
                setActionsOpen(false);
                void openHealthCardPreview();
              }}
            >
              Προεπισκόπηση κάρτας υγείας
            </button>
            {form.photoUrl ? (
              <button
                type="button"
                onClick={() => {
                  setField('photoUrl', null);
                  setEditing(true);
                  setActionsOpen(false);
                }}
              >
                Διαγραφή φωτογραφίας
              </button>
            ) : null}
          </AppPopupLayer>
          <div className="ap-pager">
            <button
              type="button"
              className="ap-pager-btn"
              disabled={!prevAthleteId}
              onClick={() => prevAthleteId && navigate(`/athletes/${prevAthleteId}`)}
              aria-label="Προηγούμενος αθλητής"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="ap-pager-btn"
              disabled={!nextAthleteId}
              onClick={() => nextAthleteId && navigate(`/athletes/${nextAthleteId}`)}
              aria-label="Επόμενος αθλητής"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="ap-tabs" role="tablist" aria-label="Υποκατηγορίες προφίλ">
        {PROFILE_TABS.filter((tab) => tab.id !== 'fees' || feesTabAllowed).map(
          ({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={profileTab === id}
            className={`ap-tab ${profileTab === id ? 'active' : ''}`}
            onClick={() => setProfileTab(id)}
          >
            <Icon size={15} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="ap-tab-panels">
        {profileTab === 'personal' ? (
          <>
          <div className="ap-two-col">
            <div className="ap-col">
              <ApCard title="Βασικά Στοιχεία">
                <div className="ap-grid-2">
                  <ApField label="ΑΜΚΑ" className="ap-field-amka ap-span-2">
                    {amkaAllowed ? (
                      <>
                        {textInput(form.amka, (v) => setField('amka', v))}
                        {editing ? (
                          <button
                            type="button"
                            className="btn btn-ghost ap-amka-clear"
                            onClick={() => {
                              setField('amka', '');
                              setField('amkaConsentAt', '');
                              setField('gdprItems', {
                                personalData: false,
                                photoUse: false,
                                gallery: false,
                                communication: false,
                                medical: false,
                                ...form.gdprItems,
                                amkaHealthCard: false,
                              });
                            }}
                          >
                            Διαγραφή ΑΜΚΑ
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <input
                        className={inputClass}
                        value={formatAmkaForViewer(form.amka, false)}
                        disabled
                        readOnly
                      />
                    )}
                  </ApField>
                  <ApField label="Επώνυμο">
                    {textInput(form.lastName, (v) => setField('lastName', v), { upper: true })}
                  </ApField>
                  <ApField label="Όνομα">
                    {textInput(form.firstName, (v) => setField('firstName', v), { upper: true })}
                  </ApField>
                  <ApField label="Ημερομηνία γέννησης">
                    {textInput(form.birthDate, (v) => setField('birthDate', v), { type: 'date' })}
                  </ApField>
                  <ApField label="Φύλο">
                    <select
                      className={inputClass}
                      value={form.gender ?? ''}
                      disabled={disabled}
                      onChange={(e) => setField('gender', e.target.value as Gender)}
                    >
                      <option value="">—</option>
                      <option value="boy">Αγόρι</option>
                      <option value="girl">Κορίτσι</option>
                      <option value="other">Άλλο</option>
                    </select>
                  </ApField>
                  <ApField label="Email αθλητή">
                    {textInput(form.email, (v) => setField('email', v), { type: 'email' })}
                  </ApField>
                  <ApField label="Τηλέφωνο αθλητή">
                    {textInput(form.phone, (v) => setField('phone', v), { type: 'tel' })}
                  </ApField>
                  <ApField label="Πατρώνυμο">
                    {textInput(form.fatherFirstName, (v) => setField('fatherFirstName', v), {
                      upper: true,
                    })}
                  </ApField>
                  <ApField label="Μητρώνυμο">
                    {textInput(form.motherFirstName, (v) => setField('motherFirstName', v), {
                      upper: true,
                    })}
                  </ApField>
                  <ApField label="Email πατρός">
                    {textInput(form.fatherEmail, (v) => setField('fatherEmail', v), {
                      type: 'email',
                    })}
                  </ApField>
                  <ApField label="Email μητρός">
                    {textInput(form.motherEmail, (v) => setField('motherEmail', v), {
                      type: 'email',
                    })}
                  </ApField>
                  <ApField label="Τηλέφωνο πατρός">
                    {textInput(form.guardianPhone, (v) => setField('guardianPhone', v), {
                      type: 'tel',
                    })}
                  </ApField>
                  <ApField label="Τηλέφωνο μητρός">
                    {textInput(form.motherPhone, (v) => setField('motherPhone', v), { type: 'tel' })}
                  </ApField>
                  <ApField label="Διεύθυνση">
                    {textInput(form.address, (v) => setField('address', v), { upper: true })}
                  </ApField>
                  <ApField label="Τ.Κ.">
                    {textInput(form.postalCode, (v) => setField('postalCode', v))}
                  </ApField>
                  <ApField label="Πόλη">
                    {textInput(form.city, (v) => setField('city', v), { upper: true })}
                  </ApField>
                  <ApField label="Νομός">
                    {textInput(form.county, (v) => setField('county', v), { upper: true })}
                  </ApField>
                </div>
              </ApCard>

              <ApCard title="Σημειώσεις">
                <textarea
                  className={`${inputClass} ap-textarea`}
                  rows={4}
                  disabled={disabled}
                  value={form.comments ?? ''}
                  onChange={(e) => setField('comments', e.target.value)}
                  placeholder="Γενικές παρατηρήσεις…"
                />
              </ApCard>
              {form.joinExtras ? (
                <ApCard title="Επιλογές δημόσιας εγγραφής">
                  <p className="muted" style={{ whiteSpace: 'pre-line', margin: 0 }}>
                    {formatJoinExtrasText(form.joinExtras)}
                  </p>
                </ApCard>
              ) : null}
            </div>

            <div className="ap-col">
              <ApCard title="Αθλητική Πληροφορία">
                <div className="ap-grid-2">
                  <ApField label="Άθλημα">
                    <ApMultiCheckDropdown
                      summary={studentSports(form).join(', ')}
                      placeholder="Επιλογή αθλήματος…"
                      emptyText="Δεν υπάρχουν ενεργά αθλήματα. Επίλεξέ τα από Ρυθμίσεις → Άθλημα."
                      disabled={disabled}
                      options={sportOptions.map((o) => ({
                        value: o.value,
                        label: o.label,
                        checked: studentSports(form).some(
                          (s) => s.toLowerCase() === o.value.toLowerCase(),
                        ),
                        onToggle: (checked) => {
                          const current = studentSports(form);
                          const next = checked
                            ? [...current, o.value]
                            : current.filter(
                                (s) => s.toLowerCase() !== o.value.toLowerCase(),
                              );
                          const unique = [
                            ...new Set(next.map((s) => s.trim()).filter(Boolean)),
                          ];
                          setField('sports', unique);
                          setField(
                            'sport',
                            form.sport &&
                              unique.some(
                                (s) =>
                                  s.toLowerCase() === form.sport!.trim().toLowerCase(),
                              )
                              ? form.sport
                              : unique[0] ?? '',
                          );
                        },
                      }))}
                    />
                    {studentSports(form).length > 1 ? (
                      <div className="ap-primary-class">
                        <span>Κύριο άθλημα</span>
                        <select
                          className={inputClass}
                          value={form.sport ?? ''}
                          disabled={disabled}
                          onChange={(e) => setField('sport', e.target.value)}
                        >
                          {studentSports(form).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </ApField>
                  <ApField label="Τμήμα">
                    <ApMultiCheckDropdown
                      summary={
                        selectedClassIds
                          .map((id) => data.classes.find((c) => c.id === id)?.name)
                          .filter(Boolean)
                          .join(', ') || ''
                      }
                      placeholder="Επιλογή τμήματος…"
                      emptyText="Δεν υπάρχουν διαθέσιμα τμήματα."
                      disabled={disabled}
                      options={visibleClasses.map((c) => ({
                        value: c.id,
                        label: c.ageGroup ? `${c.name} · ${c.ageGroup}` : c.name,
                        checked: selectedClassIds.includes(c.id),
                        onToggle: (checked) => {
                          const next = checked
                            ? [...selectedClassIds, c.id]
                            : selectedClassIds.filter((id) => id !== c.id);
                          const unique = [...new Set(next)];
                          setField('classIds', unique);
                          setField(
                            'classId',
                            form.classId && unique.includes(form.classId)
                              ? form.classId
                              : unique[0] ?? null,
                          );
                        },
                      }))}
                    />
                    {selectedClassIds.length > 1 ? (
                      <div className="ap-primary-class">
                        <span>Κύριο τμήμα</span>
                        <select
                          className={inputClass}
                          value={form.classId ?? ''}
                          disabled={disabled}
                          onChange={(e) => setField('classId', e.target.value || null)}
                        >
                          {selectedClassIds.map((id) => {
                            const cls = data.classes.find((c) => c.id === id);
                            return (
                              <option key={id} value={id}>
                                {cls?.name || id}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    ) : null}
                  </ApField>
                  <ApField label="Αρ. Δελτίου">
                    {textInput(form.registrationNumber, (v) => setField('registrationNumber', v))}
                  </ApField>
                  <ApField label="Σωματείο">
                    <select
                      className={inputClass}
                      value={form.clubName ?? ''}
                      disabled={disabled}
                      onChange={(e) => setField('clubName', e.target.value)}
                    >
                      {clubOptions.map((o) => (
                        <option key={o.value || 'empty'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {!disabled && clubOptions.length <= 1 ? (
                      <p className="ap-field-hint">
                        Δεν υπάρχουν σωματεία. Πρόσθεσέ τα από Ρυθμίσεις → Σωματείο.
                      </p>
                    ) : null}
                  </ApField>
                  <ApField label="Παραλαβή στολής">
                    {yesNo(Boolean(form.uniformReceived), (v) => setField('uniformReceived', v))}
                  </ApField>
                  <ApField label="Μέγεθος στολής">
                    <select
                      className={inputClass}
                      value={form.uniformSize ?? ''}
                      disabled={disabled}
                      onChange={(e) => setField('uniformSize', e.target.value)}
                    >
                      <option value="">—</option>
                      {uniformSizeOptions.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </ApField>
                </div>
              </ApCard>

              <ApCard title="Ιατρικές Παρατηρήσεις">
                {medicalAllowed ? (
                  <div className="ap-grid-2">
                    <ApField label="Ομάδα αίματος" className="ap-span-2">
                      <select
                        className={inputClass}
                        value={form.bloodType ?? ''}
                        disabled={disabled}
                        onChange={(e) => setField('bloodType', e.target.value)}
                      >
                        {BLOOD_TYPES.map((t) => (
                          <option key={t || 'empty'} value={t}>
                            {BLOOD_TYPE_LABEL[t] ?? t}
                          </option>
                        ))}
                      </select>
                    </ApField>
                    <ApField label="Αλλεργίες" className="ap-span-2">
                      <textarea
                        className={`${inputClass} ap-textarea`}
                        rows={2}
                        disabled={disabled}
                        value={form.allergies ?? ''}
                        onChange={(e) => setField('allergies', e.target.value)}
                      />
                    </ApField>
                    <ApField label="Χρόνιες παθήσεις / παρατηρήσεις" className="ap-span-2">
                      <textarea
                        className={`${inputClass} ap-textarea`}
                        rows={2}
                        disabled={disabled}
                        value={form.chronicConditions ?? ''}
                        onChange={(e) => setField('chronicConditions', e.target.value)}
                      />
                    </ApField>
                    <ApField label="Φαρμακευτική αγωγή" className="ap-span-2">
                      <textarea
                        className={`${inputClass} ap-textarea`}
                        rows={2}
                        disabled={disabled}
                        value={form.medication ?? ''}
                        onChange={(e) => setField('medication', e.target.value)}
                      />
                    </ApField>
                  </div>
                ) : (
                  <p className="ap-field-hint">{MEDICAL_ACCESS_HINT}</p>
                )}
              </ApCard>

              <div className="ap-reg-footer">
                <ApField label="Κατάσταση">
                  <select
                    className={inputClass}
                    value={form.status}
                    disabled={disabled}
                    onChange={(e) =>
                      setField('status', e.target.value as Student['status'])
                    }
                  >
                    <option value="active">Ενεργός</option>
                    <option value="trial">Δοκιμή</option>
                    <option value="inactive">Ανενεργός</option>
                  </select>
                </ApField>
                <ApField label="Λήξη εγγραφής">
                  {textInput(form.registrationExpires, (v) => setField('registrationExpires', v), {
                    type: 'date',
                  })}
                </ApField>
                <label className="ap-check">
                  <input
                    type="checkbox"
                    checked={Boolean(form.autoRenewal)}
                    disabled={disabled}
                    onChange={(e) => setField('autoRenewal', e.target.checked)}
                  />
                  <span>Αυτόματη Ανανέωση</span>
                </label>
              </div>
            </div>
          </div>
          </>
        ) : null}

        {profileTab === 'identity' ? (
          <ApCard title="AMKA & Ταυτοποίηση">
            {amkaAllowed ? (
              <div
                className="ap-amka-privacy"
                dangerouslySetInnerHTML={{ __html: AMKA_PRIVACY_SECTION_HTML }}
              />
            ) : (
              <p className="ap-field-hint">
                Ο ΑΜΚΑ είναι ορατός μόνο σε διαχειριστή συλλόγου και ιατρό (RBAC).
              </p>
            )}
            {amkaAllowed ? (
              <ApField label={AMKA_CONSENT_TITLE}>
                <p className="ap-field-hint">{AMKA_CONSENT_LABEL}</p>
                <label className="ap-amka-consent">
                  <input
                    type="checkbox"
                    checked={Boolean(form.gdprItems?.amkaHealthCard)}
                    disabled={!editing}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setField('gdprItems', {
                        personalData: false,
                        photoUse: false,
                        gallery: false,
                        communication: false,
                        medical: false,
                        ...form.gdprItems,
                        amkaHealthCard: checked,
                      });
                      setField('amkaConsentAt', checked ? localDateIso() : '');
                    }}
                  />
                  <span>
                    {AMKA_CONSENT_CHECKBOX}
                    {isAthleteMinor(form.birthDate) ? (
                      <>
                        {' '}
                        <em>(γονέας)</em>
                      </>
                    ) : null}
                  </span>
                </label>
              </ApField>
            ) : null}
          </ApCard>
        ) : null}

        {profileTab === 'fees' && feesTabAllowed ? (
          <div className="ap-stack">
            <ApCard title="Συνδρομές & χρεώσεις">
              <div className="ap-grid-3">
                <ApField label="Χρέωση εγγραφής">{yesNo(Boolean(form.registrationCharge), (v) =>
                  setField('registrationCharge', v),
                )}</ApField>
                <ApField label="Χρέωση μήνα">
                  {yesNo(form.monthlyCharge !== false, (v) => setField('monthlyCharge', v))}
                </ApField>
                {profileClub?.customChargeLabel?.trim() ? (
                  <ApField label={profileClub.customChargeLabel.trim()}>
                    {yesNo(Boolean(form.customCharge), (v) => setField('customCharge', v))}
                  </ApField>
                ) : null}
                <ApField label="Εισιτήριο διαρκείας">
                  {yesNo(Boolean(form.seasonTicket), (v) => setField('seasonTicket', v))}
                </ApField>
                <ApField label="Έκπτωση συνδρομής">
                  {yesNo(Boolean(form.subscriptionDiscount), (v) =>
                    setField('subscriptionDiscount', v),
                  )}
                </ApField>
                <ApField label="Μηνιαίο ποσό έκπτωσης (€)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputClass}
                    value={form.discountAmount ?? 0}
                    disabled={disabled}
                    onChange={(e) => setField('discountAmount', Number(e.target.value))}
                  />
                </ApField>
                <ApField label="Λόγος έκπτωσης">
                  <select
                    className={inputClass}
                    value={form.discountReason ?? ''}
                    disabled={disabled}
                    onChange={(e) => setField('discountReason', e.target.value)}
                  >
                    {DISCOUNT_REASONS.map((o) => (
                      <option key={o.value || 'empty'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </ApField>
              </div>
            </ApCard>

            <ApCard title="Οφειλές σεζόν">
              <div className="ap-season-header">
                <button
                  type="button"
                  className="ap-pager-btn"
                  onClick={() => setSeasonStart((y) => y - 1)}
                  aria-label="Προηγούμενη σεζόν"
                >
                  <ChevronLeft size={16} />
                </button>
                <strong>
                  Σεζόν {seasonStart}–{String(seasonStart + 1).slice(-2)}
                </strong>
                <button
                  type="button"
                  className="ap-pager-btn"
                  onClick={() => setSeasonStart((y) => y + 1)}
                  aria-label="Επόμενη σεζόν"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="ap-finance-wrap">
                <table className="ap-finance-table">
                  <thead>
                    <tr>
                      <th>Μήνας</th>
                      <th>Χρέωση</th>
                      <th>Πληρωμή</th>
                      <th className="ap-balance-col">Υπόλοιπο</th>
                      <th>Παρ.</th>
                      <th>Απ.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeRows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td>{row.charge.toFixed(2)}</td>
                        <td>{row.payment.toFixed(2)}</td>
                        <td className="ap-balance-col">{row.balance.toFixed(2)}</td>
                        <td>{row.present}</td>
                        <td>{row.absent}</td>
                      </tr>
                    ))}
                    <tr className="ap-total-row">
                      <td>Σύνολο</td>
                      <td>{totals.charge.toFixed(2)}</td>
                      <td>{totals.payment.toFixed(2)}</td>
                      <td className="ap-balance-col">{totals.balance.toFixed(2)}</td>
                      <td>{totals.present}</td>
                      <td>{totals.absent}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </ApCard>
          </div>
        ) : null}

        {profileTab === 'health' ? (
          <ApCard title="Κάρτα Υγείας">
            <div className="ap-grid-2">
              <ApField label="Κάρτα υγείας">
                {yesNo(Boolean(form.healthCard), (v) => {
                  setField('healthCard', v);
                  setField('healthCardStatus', v ? 'Έγκυρη' : 'Όχι');
                })}
              </ApField>
              <ApField label="Λήξη κάρτας υγείας">
                {textInput(form.healthCardExpires, (v) => setField('healthCardExpires', v), {
                  type: 'date',
                })}
              </ApField>
              <div className="ap-field ap-field-actions">
                <span className="ap-field-label">Έγγραφο</span>
                <Button
                  type="button"
                  disabled={loadingHealthCardPreview || !form.healthCard || !amkaAllowed}
                  onClick={() => void openHealthCardPreview()}
                >
                  {loadingHealthCardPreview ? 'Φόρτωση…' : 'Προεπισκόπηση PDF'}
                </Button>
              </div>
            </div>
          </ApCard>
        ) : null}

        {profileTab === 'gdpr' ? (
          <ApCard title="Συγκαταθέσεις (GDPR)">
            <div className="ap-gdpr-pills">
              <span
                className={`ap-pill ${
                  form.gdprConsent === 'full' || form.gdprConsent === 'locked' ? 'ap-pill-ok' : ''
                }`}
              >
                {form.gdprConsent === 'full' || form.gdprConsent === 'locked'
                  ? 'Πλήρης συναίνεση'
                  : 'Εκκρεμής συναίνεση'}
              </span>
              <span className={`ap-pill ${form.gdprConsent === 'locked' ? 'ap-pill-locked' : ''}`}>
                {form.gdprConsent === 'locked' ? 'Κλειδωμένο' : 'Ξεκλείδωτο'}
              </span>
            </div>
            <ApField label="Λήξη συναίνεσης">
              {textInput(form.consentExpires, (v) => setField('consentExpires', v), {
                type: 'date',
              })}
            </ApField>
            <ul className="ap-gdpr-list">
              {(
                [
                  ['personalData', 'Επεξεργασία προσωπικών δεδομένων'],
                  ['photoUse', 'Χρήση φωτογραφίας'],
                  ['gallery', 'Δημοσίευση gallery'],
                  ['communication', 'Επικοινωνία'],
                  ['medical', 'Ιατρικά δεδομένα'],
                  ['amkaHealthCard', `${AMKA_CONSENT_CHECKBOX} — συγκατάθεση ΑΜΚΑ`],
                ] as const
              ).map(([key, label]) => (
                <li key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(form.gdprItems?.[key])}
                      disabled={
                        !editing ||
                        form.gdprConsent === 'locked' ||
                        (key === 'amkaHealthCard' && !amkaAllowed)
                      }
                      onChange={(e) => {
                        if (key === 'amkaHealthCard' && !amkaAllowed) return;
                        const next = {
                          personalData: false,
                          photoUse: false,
                          gallery: false,
                          communication: false,
                          medical: false,
                          amkaHealthCard: false,
                          ...form.gdprItems,
                          [key]: e.target.checked,
                        };
                        setField('gdprItems', next);
                        if (key === 'amkaHealthCard') {
                          setField('amkaConsentAt', e.target.checked ? localDateIso() : '');
                        }
                        const coreOn = (
                          ['personalData', 'photoUse', 'gallery', 'communication', 'medical'] as const
                        ).every((k) => next[k]);
                        setField('gdprConsent', coreOn ? 'full' : 'pending');
                      }}
                    />
                    <span>{label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </ApCard>
        ) : null}

        {profileTab === 'progress' ? (
          <ApCard title="Αναφορές προόδου">
            <div className="ap-stack">
              {progressReports.map((report) => (
                <article key={report.id} className="ap-progress-item">
                  <div className="ap-progress-item-head">
                    <strong>{report.title}</strong>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        if (!confirm('Διαγραφή αναφοράς;')) return;
                        void progressReportsService
                          .deleteProgressReport(report.id)
                          .then(() => refresh());
                      }}
                    >
                      Διαγραφή
                    </button>
                  </div>
                  <span className="muted">
                    {formatDate(report.date)} · Βαθμός {report.rating}/5 · {report.createdByName}
                  </span>
                  {report.notes ? <p>{report.notes}</p> : null}
                </article>
              ))}
              {progressReports.length === 0 ? (
                <p className="muted">Δεν υπάρχουν ακόμη καταχωρήσεις.</p>
              ) : null}

              <div className="ap-grid-2">
                <ApField label="Ημερομηνία">
                  <input
                    className={inputClass}
                    type="date"
                    value={progressDate}
                    onChange={(e) => setProgressDate(e.target.value)}
                  />
                </ApField>
                <ApField label="Βαθμός (1–5)">
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={5}
                    value={progressRating}
                    onChange={(e) => setProgressRating(Number(e.target.value) || 3)}
                  />
                </ApField>
                <ApField label="Τίτλος" className="ap-span-2">
                  <input
                    className={inputClass}
                    value={progressTitle}
                    onChange={(e) => setProgressTitle(e.target.value)}
                    placeholder="π.χ. Τεχνική / φυσική κατάσταση"
                  />
                </ApField>
                <ApField label="Σχόλια" className="ap-span-2">
                  <textarea
                    className={`${inputClass} ap-textarea`}
                    rows={3}
                    value={progressNotes}
                    onChange={(e) => setProgressNotes(e.target.value)}
                  />
                </ApField>
              </div>
              {progressError ? <p className="form-error">{progressError}</p> : null}
              <Button
                type="button"
                disabled={progressSaving}
                onClick={() => {
                  if (!athleteId) return;
                  setProgressSaving(true);
                  setProgressError('');
                  void progressReportsService
                    .createProgressReport({
                      athleteId,
                      date: progressDate,
                      title: progressTitle,
                      notes: progressNotes,
                      rating: progressRating,
                    })
                    .then((result) => {
                      setProgressSaving(false);
                      if (!result.success) {
                        setProgressError(result.error ?? 'Σφάλμα αποθήκευσης');
                        return;
                      }
                      setProgressTitle('');
                      setProgressNotes('');
                      setProgressRating(3);
                      setProgressDate(localDateIso());
                      refresh();
                    });
                }}
              >
                {progressSaving ? 'Αποθήκευση…' : 'Αποθήκευση αναφοράς'}
              </Button>
            </div>
          </ApCard>
        ) : null}

        {profileTab === 'announcements' ? (
          <ApCard title="Ανακοινώσεις">
            {athleteAnnouncements.length === 0 ? (
              <p className="muted">Δεν υπάρχουν ανακοινώσεις για αυτόν τον αθλητή.</p>
            ) : (
              <ul className="ap-athlete-announcements">
                {athleteAnnouncements.map((a) => {
                  const body = htmlToPlain(a.message || '');
                  const audience =
                    a.audienceRoles && a.audienceRoles.length > 0
                      ? a.audienceRoles
                          .map((r) =>
                            r === 'athletes'
                              ? 'Αθλητές'
                              : r === 'coaches'
                                ? 'Προπονητές'
                                : r === 'parents'
                                  ? 'Γονείς'
                                  : r === 'staff'
                                    ? 'Προσωπικό'
                                    : r,
                          )
                          .join(', ')
                      : 'Σύλλογος';
                  const scopeBits = [
                    a.sportCategories?.trim() ? `Άθλημα: ${a.sportCategories.trim()}` : '',
                    a.teamsLabel?.trim() ? `Σωματείο: ${a.teamsLabel.trim()}` : '',
                  ].filter(Boolean);
                  return (
                    <li key={a.id} className="ap-athlete-announcement">
                      <div className="ap-athlete-announcement-head">
                        <strong>{a.title}</strong>
                        <time dateTime={a.createdAt || undefined}>
                          {formatDate(a.createdAt)}
                        </time>
                      </div>
                      <p className="ap-athlete-announcement-meta">
                        {audience}
                        {scopeBits.length > 0 ? ` · ${scopeBits.join(' · ')}` : ''}
                      </p>
                      {body ? <p className="ap-athlete-announcement-body">{body}</p> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </ApCard>
        ) : null}

        {profileTab === 'history' ? (
          <div className="ap-stack">
            <ApCard title="Παρουσίες (τρέχουσα σεζόν)">
              <p className="muted">
                Παρουσίες: {totals.present} · Απουσίες: {totals.absent} · Σύνολο καταγραφών:{' '}
                {totals.trainings}
              </p>
            </ApCard>
          </div>
        ) : null}
      </div>

      <footer className="ap-footer-actions">
        {canEditProfile ? (
          editing ? (
            <>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Ακύρωση
              </Button>
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση Αλλαγών'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigate(`/transactions?athleteId=${encodeURIComponent(student.id)}`)
                }
              >
                Συναλλαγή
              </Button>
              <Button type="button" onClick={() => setEditing(true)}>
                Επεξεργασία προφίλ
              </Button>
            </>
          )
        ) : null}
      </footer>
    </div>
  );
}
