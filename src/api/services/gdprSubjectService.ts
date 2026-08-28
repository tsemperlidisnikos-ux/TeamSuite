import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { localDateTimeIso } from '../../utils/dates';
import type { GdprAuditLog, Student } from '../../types';
function isAthleteMinor(student: Student): boolean {
  const raw = (student.birthDate || '').slice(0, 10);
  if (!raw) return false;
  const born = new Date(raw);
  if (Number.isNaN(born.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age < 18;
}

function recordGdprAudit(entry: Omit<GdprAuditLog, 'id' | 'at'>) {
  mutateData((data) => {
    if (!data.gdprAuditLogs) data.gdprAuditLogs = [];
    data.gdprAuditLogs.unshift({
      id: createId('gdpr'),
      at: localDateTimeIso(),
      ...entry,
    });
    // keep 24 months max roughly by count cap
    if (data.gdprAuditLogs.length > 5000) {
      data.gdprAuditLogs = data.gdprAuditLogs.slice(0, 5000);
    }
  });
}

function matchSubject(student: Student, subject: { athleteId?: string; email?: string }) {
  if (subject.athleteId && student.id === subject.athleteId) return true;
  const email = (subject.email || '').trim().toLowerCase();
  if (!email) return false;
  return (
    student.email?.trim().toLowerCase() === email ||
    student.fatherEmail?.trim().toLowerCase() === email ||
    student.motherEmail?.trim().toLowerCase() === email
  );
}

export async function exportSubjectData(input: {
  athleteId?: string;
  email?: string;
  actorUserId?: string;
  actorEmail?: string;
}) {
  return apiClient(() => {
    const data = getData();
    const students = data.students.filter((s) => matchSubject(s, input));
    if (!students.length) throw new Error('Δεν βρέθηκε υποκείμενο δεδομένων.');

    const athleteIds = new Set(students.map((s) => s.id));
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      students: students.map((s) => ({
        ...s,
        // never export encrypted blobs as "secret" — still include fields user owns
      })),
      transactions: data.transactions.filter((t) => athleteIds.has(t.athleteId)),
      attendance: data.attendance.filter((a) => athleteIds.has(a.studentId)),
      parentLinks: (data.parentLinks ?? []).filter((l) => athleteIds.has(l.athleteId)),
      progressReports: (data.progressReports ?? []).filter((r) => athleteIds.has(r.athleteId)),
      photos: (data.photos ?? []).filter(
        (p) => p.athleteIds?.some((id) => athleteIds.has(id)) ?? false,
      ),
    };

    recordGdprAudit({
      action: 'export',
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      subjectAthleteId: students[0]?.id,
      subjectEmail: input.email,
      detail: `Exported ${students.length} athlete record(s)`,
    });

    return exportPayload;
  });
}

export async function eraseSubjectData(input: {
  athleteId?: string;
  email?: string;
  actorUserId?: string;
  actorEmail?: string;
}) {
  return apiClient(() => {
    let erased = 0;
    mutateData((data) => {
      for (const student of data.students) {
        if (!matchSubject(student, input)) continue;
        erased += 1;
        student.firstName = 'Διαγραμμένο';
        student.lastName = 'Υποκείμενο';
        student.email = '';
        student.fatherEmail = '';
        student.motherEmail = '';
        student.phone = '';
        student.guardianPhone = '';
        student.motherPhone = '';
        student.address = '';
        student.city = '';
        student.postalCode = '';
        student.amka = '';
        student.amkaConsentAt = '';
        student.doctorName = '';
        student.doctorPhone = '';
        student.bloodType = '';
        student.allergies = '';
        student.chronicConditions = '';
        student.medication = '';
        student.emergencyName = '';
        student.emergencyPhone = '';
        student.emergencyRelation = '';
        student.emergencyAltPhone = '';
        student.photoUrl = null;
        student.comments = '';
        student.status = 'inactive';
        student.gdprConsent = 'locked';
        student.gdprItems = {
          personalData: false,
          photoUse: false,
          gallery: false,
          communication: false,
          medical: false,
          amkaHealthCard: false,
        };
      }
      const erasedIds = new Set(
        data.students
          .filter((s) => s.firstName === 'Διαγραμμένο' && s.lastName === 'Υποκείμενο')
          .map((s) => s.id),
      );
      data.photos = (data.photos ?? []).filter(
        (p) => !p.athleteIds?.some((id) => erasedIds.has(id)),
      );
    });
    if (!erased) throw new Error('Δεν βρέθηκε υποκείμενο για διαγραφή.');
    recordGdprAudit({
      action: 'erase',
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      subjectAthleteId: input.athleteId,
      subjectEmail: input.email,
      detail: `Erased ${erased} record(s)`,
    });
    return { erased };
  });
}

export async function correctSubjectData(input: {
  athleteId: string;
  patch: Partial<
    Pick<
      Student,
      | 'firstName'
      | 'lastName'
      | 'email'
      | 'phone'
      | 'address'
      | 'city'
      | 'postalCode'
      | 'fatherEmail'
      | 'motherEmail'
      | 'guardianPhone'
      | 'motherPhone'
    >
  >;
  actorUserId?: string;
  actorEmail?: string;
}) {
  return apiClient(() => {
    let updated: Student | null = null;
    mutateData((data) => {
      const student = data.students.find((s) => s.id === input.athleteId);
      if (!student) return;
      Object.assign(student, input.patch);
      updated = student;
    });
    if (!updated) throw new Error('Ο αθλητής δεν βρέθηκε.');
    recordGdprAudit({
      action: 'correct',
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      subjectAthleteId: input.athleteId,
      detail: `Corrected fields: ${Object.keys(input.patch).join(', ')}`,
    });
    return updated;
  });
}

export async function setSubjectConsent(input: {
  athleteId: string;
  items: NonNullable<Student['gdprItems']>;
  revoke?: boolean;
  actorUserId?: string;
  actorEmail?: string;
}) {
  return apiClient(() => {
    let updated: Student | null = null;
    mutateData((data) => {
      const student = data.students.find((s) => s.id === input.athleteId);
      if (!student) return;
      if (input.revoke) {
        student.gdprItems = {
          personalData: false,
          photoUse: false,
          gallery: false,
          communication: false,
          medical: false,
          amkaHealthCard: false,
        };
        student.gdprConsent = 'locked';
      } else {
        student.gdprItems = { ...input.items };
        const all =
          input.items.personalData &&
          input.items.photoUse &&
          input.items.gallery &&
          input.items.communication &&
          input.items.medical;
        student.gdprConsent = all ? 'full' : 'pending';
      }
      updated = student;
    });
    if (!updated) throw new Error('Ο αθλητής δεν βρέθηκε.');
    recordGdprAudit({
      action: input.revoke ? 'consent_revoke' : 'consent',
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      subjectAthleteId: input.athleteId,
      detail: input.revoke ? 'Consent revoked' : 'Consent updated',
    });
    return updated;
  });
}

export function assertGalleryConsentForAthletes(athleteIds: string[]): {
  ok: boolean;
  error?: string;
} {
  if (!athleteIds.length) {
    return {
      ok: false,
      error: 'Επιλέξτε τουλάχιστον έναν αθλητή με συγκατάθεση gallery/φωτογραφίας.',
    };
  }
  const data = getData();
  for (const id of athleteIds) {
    const student = data.students.find((s) => s.id === id);
    if (!student) return { ok: false, error: 'Άγνωστος αθλητής στη λίστα φωτογραφίας.' };
    const items = student.gdprItems;
    if (!items?.photoUse || !items?.gallery) {
      return {
        ok: false,
        error: `Λείπει συγκατάθεση φωτογραφίας/gallery για ${student.firstName} ${student.lastName}.`,
      };
    }
    if (isAthleteMinor(student) && student.gdprConsent === 'locked') {
      return {
        ok: false,
        error: `Η συγκατάθεση για ανήλικο (${student.firstName}) είναι κλειδωμένη/ανακλημένη.`,
      };
    }
  }
  return { ok: true };
}

export async function applyFullRetentionPass() {
  return apiClient(() => {
    const months = getData().dataRetentionMonths ?? 36;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const photoCutoff = new Date();
    photoCutoff.setMonth(photoCutoff.getMonth() - 24);
    const photoCutoffIso = photoCutoff.toISOString();

    let cleanedAthletes = 0;
    let removedPhotos = 0;
    let prunedLogs = 0;

    mutateData((data) => {
      for (const student of data.students) {
        if (student.status !== 'inactive') continue;
        const ref = (student.enrolledAt || '').slice(0, 10);
        if (!ref || ref > cutoffDate) continue;
        student.amka = '';
        student.doctorName = '';
        student.doctorPhone = '';
        student.bloodType = '';
        student.allergies = '';
        student.chronicConditions = '';
        student.medication = '';
        cleanedAthletes += 1;
      }

      const before = data.photos?.length ?? 0;
      data.photos = (data.photos ?? []).filter((p) => (p.createdAt || '') >= photoCutoffIso);
      removedPhotos = before - (data.photos?.length ?? 0);

      const logCutoff = new Date();
      logCutoff.setMonth(logCutoff.getMonth() - 12);
      const logIso = logCutoff.toISOString();
      const amkaBefore = data.amkaAccessLogs?.length ?? 0;
      data.amkaAccessLogs = (data.amkaAccessLogs ?? []).filter((l) => l.at >= logIso);
      const gdprBefore = data.gdprAuditLogs?.length ?? 0;
      data.gdprAuditLogs = (data.gdprAuditLogs ?? []).filter((l) => l.at >= logIso);
      prunedLogs = amkaBefore + gdprBefore - (data.amkaAccessLogs.length + data.gdprAuditLogs.length);
    });

    recordGdprAudit({
      action: 'retention',
      detail: `athletes=${cleanedAthletes}, photos=${removedPhotos}, logs=${prunedLogs}`,
    });

    return { cleanedAthletes, removedPhotos, prunedLogs, months, cutoffDate };
  });
}
