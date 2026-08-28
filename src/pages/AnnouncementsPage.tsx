import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Bold,
  Building2,
  CalendarClock,
  Italic,
  Layers,
  List,
  ListOrdered,
  Pencil,
  Search,
  Send,
  Trash2,
  Trophy,
  Underline,
  Users,
  UserRound,
  UsersRound,
  GraduationCap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import * as announcementsService from '../api/services/announcementsService';
import * as notificationService from '../api/services/notificationService';
import { getSession } from '../auth/auth';
import { Button } from '../components/ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { AnnouncementInput } from '../schemas';
import type {
  Announcement,
  AnnouncementAudienceRole,
  AnnouncementRecipient,
  AnnouncementRecipientKind,
} from '../types';
import {
  announcementVisibleToAthlete,
  announcementVisibleToCoach,
  listParentRecipients,
} from '../utils/announcementAudience';
import {
  classIdsOf,
  resolveCoachRecord,
  sportsMatch,
  visibleClassesForSession,
  visibleStudentsForSession,
} from '../utils/coachScope';
import { normalizeSportKey } from '../utils/sport';
import { listActiveClubSportNames } from '../utils/clubSports';
import { studentClassIds, studentInClass } from '../utils/studentClasses';
import { studentHasSport, studentSports } from '../utils/studentSports';

const PAGE_SIZE = 5;

type AudiencePicker = AnnouncementAudienceRole | 'classes' | null;

const AUDIENCE_OPTIONS: Array<{
  id: AnnouncementAudienceRole;
  label: string;
  icon: typeof Users;
  recipientKind: AnnouncementRecipientKind;
}> = [
  { id: 'parents', label: 'Γονείς', icon: Users, recipientKind: 'parent' },
  { id: 'coaches', label: 'Προπονητές', icon: UserRound, recipientKind: 'coach' },
  { id: 'athletes', label: 'Αθλητές', icon: GraduationCap, recipientKind: 'athlete' },
  { id: 'staff', label: 'Προσωπικό', icon: UsersRound, recipientKind: 'staff' },
];

const emptyForm: AnnouncementInput = {
  title: '',
  message: '',
  targetType: 'club',
  targetId: null,
  highPriority: false,
  priority: 'normal',
  status: 'published',
  createdBy: '',
  imageUrl: null,
  visibleFrom: '',
  visibleUntil: '',
  showTo: '',
  sportCategories: '',
  teamsLabel: '',
  audienceRoles: [],
  classIds: [],
  recipientIds: [],
};

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function htmlToPlain(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.innerText || el.textContent || '').trim();
}

export function AnnouncementsPage() {
  const { data, refresh } = useAppData();
  const session = getSession();
  const composeRef = useRef<HTMLElement | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementInput>(emptyForm);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);

  const [audienceFilter, setAudienceFilter] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState<AudiencePicker>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [classesEnabled, setClassesEnabled] = useState(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      createdBy: session?.fullName || 'Διαχειριστής',
    }));
  }, [session?.fullName]);

  const visibleClasses = useMemo(
    () => visibleClassesForSession(data.classes, data.coaches, session, { seasons: data.clubSeasons }),
    [data.classes, data.coaches, data.clubSeasons, session],
  );
  const allowedClassIds = useMemo(() => classIdsOf(visibleClasses), [visibleClasses]);

  const coachOptions = useMemo(() => {
    const sport = (form.sportCategories ?? '').trim();
    return (data.coaches ?? [])
      .filter((c) => c.active)
      .filter((c) => !sport || sportsMatch(c.sport, sport))
      .map((c) => ({
        id: c.id,
        label: `${c.lastName} ${c.firstName}`.trim(),
        hint: c.email,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'el'));
  }, [data.coaches, form.sportCategories]);

  const scopedStudents = useMemo(() => {
    const sport = (form.sportCategories ?? '').trim();
    const club = (form.teamsLabel ?? '').trim();
    const clubKey = normalizeSportKey(club);
    return visibleStudentsForSession(data.students, allowedClassIds, session)
      .filter((s) => s.status !== 'inactive')
      .filter((s) => {
        if (clubKey && normalizeSportKey(s.clubName) !== clubKey) return false;
        if (!sport) return true;
        if (studentHasSport(s, sport)) return true;
        return studentClassIds(s).some((id) =>
          sportsMatch(data.classes.find((c) => c.id === id)?.sport, sport),
        );
      });
  }, [
    data.students,
    data.classes,
    allowedClassIds,
    session,
    form.sportCategories,
    form.teamsLabel,
  ]);

  const athleteOptions = useMemo(() => {
    const classFilter = form.classIds ?? [];
    return scopedStudents
      .filter((s) =>
        classFilter.length === 0
          ? true
          : studentClassIds(s).some((id) => classFilter.includes(id)),
      )
      .map((s) => {
        const className = studentClassIds(s)
          .map((id) => data.classes.find((c) => c.id === id)?.name)
          .filter(Boolean)
          .join(', ');
        const sport =
          studentSports(s)[0] ||
          studentClassIds(s)
            .map((id) => data.classes.find((c) => c.id === id)?.sport)
            .find(Boolean) ||
          '';
        return {
          id: s.id,
          label: `${s.lastName} ${s.firstName}`.trim(),
          hint: [className, sport].filter(Boolean).join(' · '),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'el'));
  }, [scopedStudents, data.classes, form.classIds]);

  const parentOptions = useMemo(() => {
    const all = listParentRecipients();
    const sport = (form.sportCategories ?? '').trim();
    const club = (form.teamsLabel ?? '').trim();
    if (!sport && !club) return all;
    const athleteIds = new Set(scopedStudents.map((s) => s.id));
    return all.filter((p) =>
      (data.parentLinks ?? []).some(
        (link) => link.parentUserId === p.id && athleteIds.has(link.athleteId),
      ),
    );
  }, [data.parentLinks, scopedStudents, form.sportCategories, form.teamsLabel]);

  const staffOptions = useMemo(
    () =>
      (data.staff ?? [])
        .filter((s) => s.active)
        .map((s) => ({
          id: s.id,
          label: s.fullName || s.email,
          hint: s.email,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'el')),
    [data.staff],
  );

  const classOptions = useMemo(() => {
    const sport = (form.sportCategories ?? '').trim();
    const club = (form.teamsLabel ?? '').trim();
    const clubKey = normalizeSportKey(club);
    return visibleClasses
      .filter((c) => !sport || sportsMatch(c.sport, sport))
      .filter((c) => {
        if (!clubKey) return true;
        return (data.students ?? []).some(
          (s) =>
            studentInClass(s, c.id) &&
            s.status !== 'inactive' &&
            normalizeSportKey(s.clubName) === clubKey,
        );
      })
      .map((c) => ({
        id: c.id,
        label: c.name,
        hint: c.ageGroup || c.sport || '',
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'el'));
  }, [visibleClasses, data.students, form.sportCategories, form.teamsLabel]);

  const sportFilterOptions = useMemo(() => {
    const active = listActiveClubSportNames(data.sports);
    if (active.length > 0) return active;
    const names = new Set<string>();
    for (const c of visibleClasses) {
      if (c.sport?.trim()) names.add(c.sport.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'el'));
  }, [data.sports, visibleClasses]);

  const clubFilterOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of data.associations ?? []) {
      if (a.active && a.name?.trim()) names.add(a.name.trim());
    }
    for (const s of data.students ?? []) {
      if (s.clubName?.trim()) names.add(s.clubName.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'el'));
  }, [data.associations, data.students]);

  const announcements = useMemo(
    () =>
      [...(data.announcements ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.announcements],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const coach = resolveCoachRecord(data.coaches, session?.coachId);
    const athlete =
      session?.role === 'athlete' && session.athleteId
        ? data.students.find((s) => s.id === session.athleteId)
        : null;
    const athleteClassSport = athlete?.classId
      ? data.classes.find((c) => c.id === athlete.classId)?.sport
      : null;

    return announcements.filter((item) => {
      if (item.status === 'draft') return false;
      if (session?.role === 'athlete' && athlete) {
        if (
          !announcementVisibleToAthlete(item, {
            athleteId: athlete.id,
            classId: athlete.classId,
            sport: athlete.sport,
            clubName: athlete.clubName,
            classSport: athleteClassSport,
          })
        ) {
          return false;
        }
      }
      if (session?.role === 'coach' && coach) {
        if (!announcementVisibleToCoach(item, coach.id, coach.sport)) return false;
      }
      if (audienceFilter) {
        const roles = item.audienceRoles ?? [];
        if (roles.length > 0 && !roles.includes(audienceFilter as AnnouncementAudienceRole)) {
          return false;
        }
      }
      if (!q) return true;
      const hay = `${item.title} ${htmlToPlain(item.message)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [
    announcements,
    audienceFilter,
    query,
    session,
    data.coaches,
    data.students,
    data.classes,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  function resetCompose() {
    setEditing(null);
    setForm({
      ...emptyForm,
      createdBy: session?.fullName || 'Διαχειριστής',
      priority: 'normal',
      status: 'published',
    });
    setScheduleMode('now');
    setSendEmail(false);
    setError('');
    setPickerOpen(null);
    setPickerQuery('');
    setClassesEnabled(false);
  }

  function focusCompose() {
    resetCompose();
    composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openEdit(item: Announcement) {
    setEditing(item);
    setForm({
      title: item.title,
      message: htmlToPlain(item.message),
      targetType: item.targetType,
      targetId: item.targetId,
      highPriority: false,
      priority: 'normal',
      status: item.status ?? 'published',
      createdBy: item.createdBy || session?.fullName || 'Διαχειριστής',
      imageUrl: item.imageUrl ?? null,
      visibleFrom: item.visibleFrom ?? '',
      visibleUntil: item.visibleUntil ?? '',
      showTo: item.showTo ?? '',
      sportCategories: item.sportCategories ?? '',
      teamsLabel: item.teamsLabel ?? '',
      audienceRoles: item.audienceRoles ?? [],
      classIds: item.classIds ?? [],
      recipientIds: item.recipientIds ?? [],
    });
    setClassesEnabled((item.classIds ?? []).length > 0);
    setScheduleMode(item.visibleFrom ? 'later' : 'now');
    setError('');
    setPickerOpen(null);
    setPickerQuery('');
    composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function recipientCount(kind: AnnouncementRecipientKind): number {
    return (form.recipientIds ?? []).filter((r) => r.kind === kind).length;
  }

  function applyAudienceScope(next: { sport?: string; club?: string }) {
    const sport = next.sport !== undefined ? next.sport : (form.sportCategories ?? '');
    const club = next.club !== undefined ? next.club : (form.teamsLabel ?? '');
    const sportKey = sport.trim();
    const clubKey = normalizeSportKey(club);

    const nextClassIds = (form.classIds ?? []).filter((id) => {
      const cls = data.classes.find((c) => c.id === id);
      if (!cls) return false;
      if (sportKey && !sportsMatch(cls.sport, sportKey)) return false;
      if (clubKey) {
        const hasClubAthlete = (data.students ?? []).some(
          (s) =>
            studentInClass(s, id) &&
            s.status !== 'inactive' &&
            normalizeSportKey(s.clubName) === clubKey,
        );
        if (!hasClubAthlete) return false;
      }
      return true;
    });

    const allowedAthleteIds = new Set(
      (data.students ?? [])
        .filter((s) => s.status !== 'inactive')
        .filter((s) => {
          if (clubKey && normalizeSportKey(s.clubName) !== clubKey) return false;
          if (!sportKey) return true;
          if (studentHasSport(s, sportKey)) return true;
          return studentClassIds(s).some((cid) =>
            sportsMatch(data.classes.find((c) => c.id === cid)?.sport, sportKey),
          );
        })
        .map((s) => s.id),
    );

    const allowedCoachIds = new Set(
      (data.coaches ?? [])
        .filter((c) => c.active)
        .filter((c) => !sportKey || sportsMatch(c.sport, sportKey))
        .map((c) => c.id),
    );

    const allowedParentIds = new Set(
      listParentRecipients()
        .filter((p) =>
          !sportKey && !clubKey
            ? true
            : (data.parentLinks ?? []).some(
                (link) => link.parentUserId === p.id && allowedAthleteIds.has(link.athleteId),
              ),
        )
        .map((p) => p.id),
    );

    setForm((prev) => ({
      ...prev,
      sportCategories: sport,
      teamsLabel: club,
      classIds: nextClassIds,
      recipientIds: (prev.recipientIds ?? []).filter((r) => {
        if (r.kind === 'athlete') return allowedAthleteIds.has(r.id);
        if (r.kind === 'coach') return allowedCoachIds.has(r.id);
        if (r.kind === 'parent') return allowedParentIds.has(r.id);
        return true;
      }),
    }));
  }

  function toggleAudience(role: AnnouncementAudienceRole) {
    const option = AUDIENCE_OPTIONS.find((o) => o.id === role);
    const active = (form.audienceRoles ?? []).includes(role);

    if (!active) {
      setForm((prev) => ({
        ...prev,
        audienceRoles: [...(prev.audienceRoles ?? []), role],
      }));
      setPickerOpen(role);
      setPickerQuery('');
      return;
    }

    if (pickerOpen === role) {
      setForm((prev) => ({
        ...prev,
        audienceRoles: (prev.audienceRoles ?? []).filter((r) => r !== role),
        recipientIds: (prev.recipientIds ?? []).filter((r) => r.kind !== option?.recipientKind),
      }));
      setPickerOpen(null);
      setPickerQuery('');
      return;
    }

    setPickerOpen(role);
    setPickerQuery('');
  }

  function toggleClassesTarget() {
    if (!classesEnabled) {
      setClassesEnabled(true);
      setPickerOpen('classes');
      setPickerQuery('');
      return;
    }

    if (pickerOpen === 'classes') {
      setClassesEnabled(false);
      setForm((f) => ({ ...f, classIds: [] }));
      setPickerOpen(null);
      setPickerQuery('');
      return;
    }

    setPickerOpen('classes');
    setPickerQuery('');
  }

  function toggleRecipient(kind: AnnouncementRecipientKind, id: string) {
    setForm((prev) => {
      const current = prev.recipientIds ?? [];
      const exists = current.some((r) => r.kind === kind && r.id === id);
      const next: AnnouncementRecipient[] = exists
        ? current.filter((r) => !(r.kind === kind && r.id === id))
        : [...current, { kind, id }];
      return { ...prev, recipientIds: next };
    });
  }

  function toggleClassId(classId: string) {
    setForm((prev) => {
      const current = prev.classIds ?? [];
      const next = current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId];
      return { ...prev, classIds: next };
    });
  }

  function isRecipientSelected(kind: AnnouncementRecipientKind, id: string): boolean {
    return (form.recipientIds ?? []).some((r) => r.kind === kind && r.id === id);
  }

  function wrapMessage(prefix: string, suffix = prefix) {
    const el = messageRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = form.message;
    const selected = value.slice(start, end) || 'κείμενο';
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    setForm((prev) => ({ ...prev, message: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  async function persist(status: 'draft' | 'published') {
    const message = form.message.trim();
    const title = form.title.trim();
    if (!title) {
      setError('Ο τίτλος είναι υποχρεωτικός');
      return;
    }
    if (!message) {
      setError('Το περιεχόμενο είναι υποχρεωτικό');
      return;
    }

    setSaving(true);
    setError('');

    const priority = 'normal' as const;
    const roles = form.audienceRoles ?? [];
    const classIds = form.classIds ?? [];
    const recipientIds = form.recipientIds ?? [];
    const audienceLabels: string[] = [];
    for (const role of roles) {
      const base = AUDIENCE_OPTIONS.find((o) => o.id === role)?.label ?? role;
      const kind = AUDIENCE_OPTIONS.find((o) => o.id === role)?.recipientKind;
      const count = kind ? recipientIds.filter((r) => r.kind === kind).length : 0;
      audienceLabels.push(count > 0 ? `${base} (${count})` : base);
    }
    if (classIds.length > 0) {
      audienceLabels.push(
        classIds.length === 1
          ? classOptions.find((c) => c.id === classIds[0])?.label ?? 'Τμήμα'
          : `Τμήματα (${classIds.length})`,
      );
    }

    if (form.teamsLabel?.trim()) {
      audienceLabels.unshift(`Σωματείο: ${form.teamsLabel.trim()}`);
    }
    if (form.sportCategories?.trim()) {
      audienceLabels.unshift(`Άθλημα: ${form.sportCategories.trim()}`);
    }

    const payload: AnnouncementInput = {
      ...form,
      title,
      message,
      priority,
      status,
      highPriority: false,
      createdBy: session?.fullName || form.createdBy || 'Διαχειριστής',
      audienceRoles: roles,
      classIds,
      recipientIds,
      sportCategories: form.sportCategories ?? '',
      teamsLabel: form.teamsLabel ?? '',
      targetType: classIds.length === 1 ? 'team' : 'club',
      targetId: classIds.length === 1 ? classIds[0] : null,
      showTo: audienceLabels.length > 0 ? audienceLabels.join(', ') : 'Ολόκληρος σύλλογος',
      visibleFrom: scheduleMode === 'later' ? form.visibleFrom || '' : '',
    };

    const result = editing
      ? await announcementsService.updateAnnouncement(editing.id, payload)
      : await announcementsService.createAnnouncement(payload);

    if (!result.success) {
      setSaving(false);
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }

    if (status === 'published' && sendEmail && !editing) {
      const clubId = session?.clubId;
      if (clubId) {
        const emails = notificationService.resolveAnnouncementEmails(payload);
        if (emails.length > 0) {
          await notificationService.sendAnnouncementEmails({
            clubId,
            title: payload.title,
            message: payload.message,
            emails,
          });
        }
      }
    }

    setSaving(false);
    resetCompose();
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή ανακοίνωσης;')) return;
    await announcementsService.deleteAnnouncement(id);
    refresh();
  }

  function audienceRolesOf(item: Announcement): AnnouncementAudienceRole[] {
    if (item.audienceRoles && item.audienceRoles.length > 0) return item.audienceRoles;
    return ['parents', 'coaches', 'athletes', 'staff'];
  }

  return (
    <div className="ann-page">
      <header className="ann-page-head">
        <div>
          <h1>Ανακοινώσεις</h1>
          <p>Δημιουργία και αποστολή ανακοινώσεων σε γονείς, προπονητές και αθλητές.</p>
        </div>
        <Button type="button" onClick={focusCompose}>
          <Send size={16} /> Νέα Ανακοίνωση
        </Button>
      </header>

      <section className="ann-compose panel" ref={composeRef}>
        <h2>{editing ? 'Επεξεργασία ανακοίνωσης' : 'Νέα ανακοίνωση'}</h2>
        <div className="ann-compose-grid">
          <div className="ann-compose-main">
            <label className="ann-field">
              <span className="ann-label">Τίτλος *</span>
              <input
                value={form.title}
                placeholder="Πληκτρολογήστε τίτλο ανακοίνωσης"
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </label>

            <div className="ann-field">
              <span className="ann-label">Περιεχόμενο *</span>
              <div className="ann-editor">
                <div className="ann-editor-toolbar" role="toolbar" aria-label="Μορφοποίηση">
                  <button type="button" onClick={() => wrapMessage('**', '**')} aria-label="Έντονα">
                    <Bold size={15} />
                  </button>
                  <button type="button" onClick={() => wrapMessage('_', '_')} aria-label="Πλάγια">
                    <Italic size={15} />
                  </button>
                  <button type="button" onClick={() => wrapMessage('__', '__')} aria-label="Υπογράμμιση">
                    <Underline size={15} />
                  </button>
                  <button type="button" onClick={() => wrapMessage('\n- ', '')} aria-label="Λίστα">
                    <List size={15} />
                  </button>
                  <button type="button" onClick={() => wrapMessage('\n1. ', '')} aria-label="Αρίθμηση">
                    <ListOrdered size={15} />
                  </button>
                </div>
                <textarea
                  ref={messageRef}
                  className="ann-message-textarea"
                  rows={8}
                  placeholder="Γράψτε το περιεχόμενο της ανακοίνωσης..."
                  value={form.message}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    setForm((prev) => ({ ...prev, message: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <aside className="ann-compose-side">
            <div className="ann-side-block">
              <span className="ann-label">Ακροατήριο</span>
              <div className="ann-audience-scope">
                <label className="ann-scope-field">
                  <span>
                    <Trophy size={14} aria-hidden /> Άθλημα
                  </span>
                  <select
                    value={form.sportCategories ?? ''}
                    onChange={(e) => applyAudienceScope({ sport: e.target.value })}
                  >
                    <option value="">Όλα τα αθλήματα</option>
                    {sportFilterOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ann-scope-field">
                  <span>
                    <Building2 size={14} aria-hidden /> Σωματείο
                  </span>
                  <select
                    value={form.teamsLabel ?? ''}
                    onChange={(e) => applyAudienceScope({ club: e.target.value })}
                  >
                    <option value="">Όλα τα σωματεία</option>
                    {clubFilterOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="ann-audience-toggles">
                {AUDIENCE_OPTIONS.filter((option) => option.id !== 'staff').map((option) => {
                  const Icon = option.icon;
                  const active = (form.audienceRoles ?? []).includes(option.id);
                  const count = recipientCount(option.recipientKind);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`ann-audience-btn${active ? ' is-active' : ''}${
                        pickerOpen === option.id ? ' is-open' : ''
                      }`}
                      onClick={() => toggleAudience(option.id)}
                    >
                      <Icon size={16} />
                      <span className="ann-audience-btn-label">
                        {option.label}
                        {active ? (
                          <em>{count > 0 ? `${count} επιλεγμένοι` : 'Όλοι'}</em>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`ann-audience-btn${classesEnabled ? ' is-active' : ''}${
                    pickerOpen === 'classes' ? ' is-open' : ''
                  }`}
                  onClick={toggleClassesTarget}
                >
                  <Layers size={16} />
                  <span className="ann-audience-btn-label">
                    Τμήματα
                    {classesEnabled ? (
                      <em>
                        {(form.classIds ?? []).length > 0
                          ? `${(form.classIds ?? []).length} επιλεγμένα`
                          : 'Επιλογή'}
                      </em>
                    ) : null}
                  </span>
                </button>
                {(() => {
                  const option = AUDIENCE_OPTIONS.find((o) => o.id === 'staff');
                  if (!option) return null;
                  const Icon = option.icon;
                  const active = (form.audienceRoles ?? []).includes('staff');
                  const count = recipientCount('staff');
                  return (
                    <button
                      type="button"
                      className={`ann-audience-btn${active ? ' is-active' : ''}${
                        pickerOpen === 'staff' ? ' is-open' : ''
                      }`}
                      onClick={() => toggleAudience('staff')}
                    >
                      <Icon size={16} />
                      <span className="ann-audience-btn-label">
                        {option.label}
                        {active ? (
                          <em>{count > 0 ? `${count} επιλεγμένοι` : 'Όλοι'}</em>
                        ) : null}
                      </span>
                    </button>
                  );
                })()}
              </div>

              {pickerOpen ? (
                <div className="ann-audience-picker">
                  <label className="ann-audience-search">
                    <Search size={14} aria-hidden />
                    <input
                      type="search"
                      placeholder="Αναζήτηση..."
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                    />
                  </label>
                  <div className="ann-audience-list" role="group">
                    {(() => {
                      const q = pickerQuery.trim().toLowerCase();
                      if (pickerOpen === 'classes') {
                        const rows = classOptions.filter(
                          (row) =>
                            !q ||
                            row.label.toLowerCase().includes(q) ||
                            row.hint.toLowerCase().includes(q),
                        );
                        if (rows.length === 0) {
                          return <p className="ann-hint">Δεν βρέθηκαν τμήματα.</p>;
                        }
                        return rows.map((row) => {
                          const checked = (form.classIds ?? []).includes(row.id);
                          return (
                            <label key={row.id} className={`ann-pick-row${checked ? ' is-on' : ''}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleClassId(row.id)}
                              />
                              <span>
                                <strong>{row.label}</strong>
                                {row.hint ? <em>{row.hint}</em> : null}
                              </span>
                            </label>
                          );
                        });
                      }

                      const option = AUDIENCE_OPTIONS.find((o) => o.id === pickerOpen);
                      if (!option) return null;
                      const kind = option.recipientKind;
                      const rows =
                        kind === 'coach'
                          ? coachOptions
                          : kind === 'athlete'
                            ? athleteOptions
                            : kind === 'staff'
                              ? staffOptions
                              : parentOptions.map((p) => ({
                                  id: p.id,
                                  label: p.label,
                                  hint: p.email,
                                }));
                      const filteredRows = rows.filter(
                        (row) =>
                          !q ||
                          row.label.toLowerCase().includes(q) ||
                          (row.hint || '').toLowerCase().includes(q),
                      );
                      if (filteredRows.length === 0) {
                        return (
                          <p className="ann-hint">
                            {kind === 'parent'
                              ? 'Δεν υπάρχουν συνδεδεμένοι γονείς. Χωρίς επιλογή → όλοι οι γονείς.'
                              : 'Δεν βρέθηκαν εγγραφές.'}
                          </p>
                        );
                      }
                      return filteredRows.map((row) => {
                        const checked = isRecipientSelected(kind, row.id);
                        return (
                          <div key={row.id} className={`ann-pick-row${checked ? ' is-on' : ''}`}>
                            <label className="ann-pick-check">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRecipient(kind, row.id)}
                              />
                              <span>
                                <strong>{row.label}</strong>
                                {row.hint ? <em>{row.hint}</em> : null}
                              </span>
                            </label>
                            {kind === 'athlete' ? (
                              <Link className="ann-pick-profile" to={`/athletes/${row.id}`}>
                                Προφίλ
                              </Link>
                            ) : null}
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <p className="ann-hint">
                    Χωρίς τικ → όλη η κατηγορία
                    {pickerOpen === 'classes' ? ' (όλα τα τμήματα αν δεν επιλέξετε).' : '.'}
                  </p>
                </div>
              ) : (
                <p className="ann-hint">
                  Χωρίς επιλογή → ολόκληρος σύλλογος. Κλικ σε κατηγορία για συγκεκριμένους παραλήπτες.
                </p>
              )}
            </div>

            <div className="ann-side-block">
              <span className="ann-label">Προγραμματισμός</span>
              <label className="ann-schedule-select">
                <CalendarClock size={16} aria-hidden />
                <select
                  value={scheduleMode}
                  onChange={(e) => setScheduleMode(e.target.value as 'now' | 'later')}
                >
                  <option value="now">Δημοσίευση τώρα</option>
                  <option value="later">Προγραμματισμός</option>
                </select>
              </label>
              {scheduleMode === 'later' ? (
                <input
                  type="datetime-local"
                  className="ann-schedule-datetime"
                  value={form.visibleFrom ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, visibleFrom: e.target.value }))
                  }
                />
              ) : null}
            </div>

            {!editing ? (
              <label className="ann-email-check">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                />
                <span>Αποστολή και με email</span>
              </label>
            ) : null}
          </aside>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="ann-compose-actions">
          <button
            type="button"
            className="ann-draft-btn"
            disabled={saving}
            onClick={() => void persist('draft')}
          >
            Αποθήκευση ως πρόχειρο
          </button>
          <Button type="button" variant="secondary" disabled={saving} onClick={resetCompose}>
            Άκυρο
          </Button>
          <Button type="button" disabled={saving} onClick={() => void persist('published')}>
            <Send size={16} /> {saving ? 'Αποστολή…' : 'Αποστολή'}
          </Button>
        </div>
      </section>

      <section className="ann-list panel">
        <div className="ann-list-head">
          <h2>Λίστα ανακοινώσεων</h2>
          <div className="ann-list-filters">
            <select
              value={audienceFilter}
              onChange={(e) => {
                setAudienceFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Όλα τα ακροατήρια</option>
              {AUDIENCE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="ann-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder="Αναζήτηση..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
        </div>

        {pageRows.length === 0 ? (
          <p className="ann-empty">Δεν υπάρχουν ανακοινώσεις με αυτά τα κριτήρια.</p>
        ) : (
          <div className="table-wrap ann-table-wrap">
            <table className="ann-table">
              <thead>
                <tr>
                  <th>Τίτλος</th>
                  <th>Ακροατήριο</th>
                  <th>Δημοσίευση</th>
                  <th>Δημιουργός</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) => {
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="ann-title-cell">
                          <div>
                            <strong>{item.title}</strong>
                            <span>{htmlToPlain(item.message).slice(0, 90)}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="ann-role-pills">
                          {audienceRolesOf(item).map((role) => {
                            const kind = AUDIENCE_OPTIONS.find((o) => o.id === role)?.recipientKind;
                            const count = kind
                              ? (item.recipientIds ?? []).filter((r) => r.kind === kind).length
                              : 0;
                            return (
                              <span key={role} className={`ann-role-pill is-${role}`}>
                                {AUDIENCE_OPTIONS.find((o) => o.id === role)?.label ?? role}
                                {count > 0 ? ` · ${count}` : ''}
                              </span>
                            );
                          })}
                          {(item.classIds ?? []).length > 0 ? (
                            <span className="ann-role-pill is-classes">
                              Τμήματα · {(item.classIds ?? []).length}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>{formatDate(item.visibleFrom || item.createdAt)}</td>
                      <td>{item.createdBy || 'Διαχειριστής'}</td>
                      <td className="ann-row-actions">
                        <div className="ann-row-btns">
                          <button
                            type="button"
                            className="ann-icon-btn"
                            aria-label="Επεξεργασία"
                            title="Επεξεργασία"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="ann-icon-btn is-danger"
                            aria-label="Διαγραφή"
                            title="Διαγραφή"
                            onClick={() => void handleDelete(item.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="ann-pager">
          <span>
            {from}-{to} από {filtered.length}
          </span>
          <div className="ann-pager-btns">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(0, 5)
              .map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === safePage ? 'is-active' : ''}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
