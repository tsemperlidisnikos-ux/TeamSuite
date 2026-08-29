import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';
import { getUserById } from '../../auth/auth';
import {
  getClubById,
  getClubPublicRegistration,
  getClubSmtp,
  updateClubPublicRegistration,
} from '../../auth/clubs';
import { getClubData, mutateClubData } from '../../data/repository';
import { collectClubSportOptions } from '../../shared/publicJoinPayload';
import type { RegistrationApplication, SizeChart } from '../../types';
import { parseImageDataUrl, uploadClubPhotoBlob } from './sessionService';

export type RemotePublicClub = {
  clubId: string;
  slug: string;
  name: string;
  city: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  enabled: boolean;
  autoApprove: boolean;
  allowTrial: boolean;
  allowWaitlist: boolean;
  classes: Array<{ id: string; name: string; sport?: string; maxStudents?: number }>;
  sports?: string[];
  sizeChart?: SizeChart;
  termsHtml: string;
};

function mediaUrlForPublish(value: string | null | undefined): string | null {
  if (!value) return null;
  // Data URLs (~700KB photos) blow the public-club JSON body and get dropped.
  // Blob / https / /api/club-media URLs stay as-is.
  if (value.startsWith('data:')) return null;
  return value;
}

async function persistDataUrlAsClubMedia(
  clubId: string,
  value: string | null | undefined,
  fileName: string,
): Promise<string | null> {
  const raw = value?.trim() || null;
  if (!raw) return null;
  if (!raw.startsWith('data:')) return raw;

  const parsed = parseImageDataUrl(raw);
  if (!parsed) throw new Error('Μη έγκυρη εικόνα.');
  const type = parsed.contentType === 'image/jpg' ? 'image/jpeg' : parsed.contentType;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) {
    throw new Error('Υποστηρίζονται JPG, PNG ή WEBP.');
  }

  const uploaded = await uploadClubPhotoBlob({
    clubId,
    fileName,
    contentType: type,
    dataBase64: parsed.dataBase64,
  });
  if (!uploaded.success || !uploaded.data?.url) {
    throw new Error(uploaded.error ?? 'Αποτυχία αποθήκευσης φωτογραφίας στο cloud.');
  }
  return uploaded.data.url;
}

async function readResponseJson<T extends Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.status === 404
        ? 'Το cloud API είναι διαθέσιμο μόνο στο production (Vercel).'
        : `Κενή απάντηση από τον διακομιστή (HTTP ${response.status}).`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Μη έγκυρη απάντηση από τον διακομιστή (HTTP ${response.status}).`);
  }
}

/** Publish public join + SMTP notify config to the server (Redis when configured). */
export async function publishPublicClubCloud(clubId: string) {
  return apiClient(async () => {
    const club = getClubById(clubId);
    if (!club) throw new Error('Ο σύλλογος δεν βρέθηκε.');
    const settings = getClubPublicRegistration(clubId);
    const smtpForm = getClubSmtp(clubId);
    // Prefer real password from storage (never publish blank / masked placeholders).
    const storedPassword = club.smtp?.password?.trim() ?? '';
    const publishPassword =
      storedPassword && storedPassword !== '********'
        ? storedPassword
        : smtpForm.password?.trim() && smtpForm.password !== '********'
          ? smtpForm.password.trim()
          : '';
    const data = getClubData(clubId);
    const adminEmail = getUserById(club.adminUserId)?.email?.trim() || '';

    const heroImageUrl = await persistDataUrlAsClubMedia(
      clubId,
      settings.heroImageUrl ?? null,
      'join-hero.jpg',
    );
    const logoUrl = await persistDataUrlAsClubMedia(clubId, club.logoUrl ?? null, 'club-logo.jpg');
    if (heroImageUrl !== (settings.heroImageUrl ?? null)) {
      updateClubPublicRegistration(clubId, {
        ...settings,
        notifyEmail: settings.notifyEmail ?? '',
        heroImageUrl,
      });
    }

    const response = await fetch('/api/public-club', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify({
        publicClub: {
          clubId,
          slug: settings.slug,
          name: club.name,
          city: club.city || '',
          logoUrl: mediaUrlForPublish(logoUrl),
          heroImageUrl: mediaUrlForPublish(heroImageUrl),
          enabled: settings.enabled,
          autoApprove: settings.autoApprove,
          allowTrial: settings.allowTrial,
          allowWaitlist: settings.allowWaitlist,
          classes: (data.classes ?? [])
            .filter((c) => c.name)
            .map((c) => ({
              id: c.id,
              name: c.name,
              sport: c.sport || '',
              maxStudents: c.maxStudents,
            })),
          sports: collectClubSportOptions(data),
          sizeChart: data.sizeChart ?? { kids: [], men: [], women: [] },
          termsHtml: data.termsOfUseHtml ?? '',
          updatedAt: new Date().toISOString(),
        },
        notify: {
          clubId,
          clubName: club.name,
          notifyEmail: (settings.notifyEmail || adminEmail || smtpForm.username || '').trim(),
          smtp: {
            enabled: smtpForm.enabled,
            host: smtpForm.host,
            port: smtpForm.port,
            username: smtpForm.username,
            password: publishPassword,
            fromName: smtpForm.fromName || club.name,
          },
          updatedAt: new Date().toISOString(),
        },
      }),
    });

    const json = await readResponseJson<{
      ok?: boolean;
      error?: string;
      durable?: boolean;
      slug?: string;
    }>(response);
    if (!response.ok || !json.ok) {
      throw new Error(
        (typeof json.error === 'string' && json.error) ||
          (response.status === 404
            ? 'Το cloud API είναι διαθέσιμο μόνο στο production (Vercel).'
            : `Publish HTTP ${response.status}`),
      );
    }
    return { slug: json.slug ?? settings.slug, durable: Boolean(json.durable) };
  });
}

export async function fetchPublicClubBySlug(slug: string) {
  return apiClient(async () => {
    const response = await fetch(`/api/public-club?slug=${encodeURIComponent(slug.trim())}`);
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      club?: RemotePublicClub;
      durable?: boolean;
    };
    if (response.status === 404) {
      throw new Error(json.error || 'Ο σύνδεσμος δεν βρέθηκε.');
    }
    if (!response.ok || !json.ok || !json.club) {
      throw new Error(json.error || `Public club HTTP ${response.status}`);
    }
    return { club: json.club, durable: Boolean(json.durable) };
  });
}

export type RemotePublicJoinInput = {
  slug: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  guardianName: string;
  guardianPhone: string;
  email: string;
  classId: string | null;
  kind: 'full' | 'trial' | 'waitlist';
  notes?: string;
  acceptedTerms: boolean;
  amka?: string;
  phone?: string;
  athleteEmail?: string;
  fatherFirstName?: string;
  motherFirstName?: string;
  fatherEmail?: string;
  motherEmail?: string;
  motherPhone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  county?: string;
  sport?: string;
  uniformSize?: string;
  joinExtras?: {
    clothingPackage: 'basic' | 'upgraded';
    istosProgram: 'yes' | 'no';
    preferredPayment: 'cash' | 'card' | 'transfer';
    healthDeclaration: 'allow' | 'deny';
    liabilityAcceptance: 'accept' | 'decline';
    mediaConsent: 'consent' | 'decline';
  };
  gdprItems?: {
    personalData: boolean;
    photoUse: boolean;
    gallery: boolean;
    communication: boolean;
    medical: boolean;
    amkaHealthCard?: boolean;
  };
  amkaConsentAt?: string;
  guardianSignature?: string;
  formSnapshotUrl?: string | null;
};

export async function submitPublicJoinRemote(input: RemotePublicJoinInput) {
  return apiClient(async () => {
    const response = await fetch('/api/public-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      mode?: 'athlete' | 'application';
      kind?: string;
      athleteId?: string | null;
      clubEmailSent?: boolean;
      guardianEmailSent?: boolean;
      message?: string;
    };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Public join HTTP ${response.status}`);
    }
    return {
      mode: json.mode ?? 'application',
      kind: json.kind ?? input.kind,
      athleteId: json.athleteId ?? null,
      clubEmailSent: Boolean(json.clubEmailSent),
      guardianEmailSent: Boolean(json.guardianEmailSent),
      message: json.message ?? 'Η αίτηση υποβλήθηκε.',
    };
  });
}

/** Pull remote pending applications into the active club local store. */
export async function pullRemoteRegistrationApplications(clubId: string) {
  return apiClient(async () => {
    const response = await fetch(`/api/public-join?clubId=${encodeURIComponent(clubId)}`, {
      headers: syncAuthHeaders(false),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      applications?: RegistrationApplication[];
    };
    if (response.status === 404) {
      return { merged: 0 };
    }
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Pending apps HTTP ${response.status}`);
    }
    const remote = json.applications ?? [];
    if (remote.length === 0) return { merged: 0 };

    let merged = 0;
    mutateClubData(clubId, (data) => {
      const existing = data.registrationApplications ?? [];
      const byId = new Set(existing.map((a) => a.id));
      const incoming: RegistrationApplication[] = remote
        .filter((a) => a?.id && !byId.has(a.id))
        .map((a) => ({
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
          birthDate: a.birthDate || '',
          gender:
            a.gender === 'boy' || a.gender === 'girl' || a.gender === 'other' || a.gender === ''
              ? a.gender
              : '',
          guardianName: a.guardianName,
          guardianPhone: a.guardianPhone,
          email: a.email || '',
          classId: a.classId ?? null,
          kind: a.kind,
          status: a.status,
          notes: a.notes || '',
          createdAt: a.createdAt || '',
          athleteId: a.athleteId ?? null,
          amka: a.amka,
          phone: a.phone,
          athleteEmail: a.athleteEmail,
          fatherFirstName: a.fatherFirstName,
          motherFirstName: a.motherFirstName,
          fatherEmail: a.fatherEmail,
          motherEmail: a.motherEmail,
          motherPhone: a.motherPhone,
          address: a.address,
          postalCode: a.postalCode,
          city: a.city,
          county: a.county,
          sport: a.sport,
          uniformSize: a.uniformSize,
          joinExtras: a.joinExtras,
          gdprItems: a.gdprItems,
          amkaConsentAt: a.amkaConsentAt,
          guardianSignature: a.guardianSignature,
          formSnapshotUrl: a.formSnapshotUrl ?? null,
        }));
      merged = incoming.length;
      if (incoming.length) {
        data.registrationApplications = [...incoming, ...existing];
      }
    });
    return { merged };
  });
}
