import type { AppData } from '../types';

/** Drop base64 payloads so AppData fits in localStorage. */
export function stripHeavyMedia(data: AppData): AppData {
  return {
    ...data,
    photos: (data.photos ?? []).map((p) => ({
      ...p,
      imageUrl: p.imageUrl?.startsWith('data:') ? '' : p.imageUrl,
    })),
    students: (data.students ?? []).map((s) => ({
      ...s,
      photoUrl: s.photoUrl?.startsWith('data:') ? null : s.photoUrl,
      registrationFormImageUrl: s.registrationFormImageUrl?.startsWith('data:')
        ? null
        : s.registrationFormImageUrl,
    })),
    announcements: (data.announcements ?? []).map((a) => ({
      ...a,
      imageUrl: a.imageUrl?.startsWith('data:') ? null : a.imageUrl,
    })),
    registrationApplications: (data.registrationApplications ?? []).map((a) => ({
      ...a,
      formSnapshotUrl: a.formSnapshotUrl?.startsWith('data:') ? null : a.formSnapshotUrl,
    })),
  };
}

export function appDataWeight(data: AppData | null | undefined): number {
  if (!data) return 0;
  return (
    (data.students?.length ?? 0) * 10 +
    (data.transactions?.length ?? 0) * 2 +
    (data.classes?.length ?? 0) * 5 +
    (data.revenues?.length ?? 0) +
    (data.expenses?.length ?? 0) +
    (data.trainings?.length ?? 0)
  );
}

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.code === 22 ||
    e.code === 1014 ||
    /quota/i.test(e.message ?? '')
  );
}
