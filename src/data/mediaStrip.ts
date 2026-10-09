import type { AppData } from '../types';

const MAX_EMBEDDED_STRING = 80_000;

function slimDeep(value: unknown, depth = 0): unknown {
  if (depth > 12 || value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return value.startsWith('data:image') ? '' : '';
    if (value.length > MAX_EMBEDDED_STRING) return `${value.slice(0, 2_000)}…[truncated]`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => slimDeep(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = slimDeep(child, depth + 1);
    }
    return out;
  }
  return value;
}

/** Drop base64 payloads so AppData fits in localStorage / Vercel sync limits. */
export function stripHeavyMedia(data: AppData): AppData {
  const base: AppData = {
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
    facilities: (data.facilities ?? []).map((f) => ({
      ...f,
      photoUrl: f.photoUrl?.startsWith('data:') ? null : f.photoUrl,
    })),
    rentalSettings: data.rentalSettings
      ? {
          ...data.rentalSettings,
          heroImageUrl: data.rentalSettings.heroImageUrl?.startsWith('data:')
            ? null
            : data.rentalSettings.heroImageUrl,
        }
      : data.rentalSettings,
  };
  return slimDeep(base) as AppData;
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
