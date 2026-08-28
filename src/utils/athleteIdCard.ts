/** Public athlete ID card payload encoded in QR (no AMKA / medical / contact). */

export type AthleteIdCardPayload = {
  v: 1;
  clubName: string;
  season: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  athleteCode: string;
  /** Only short http(s) URLs — never data: URLs (QR size). */
  logoUrl?: string | null;
};

export function athletePublicCode(
  registrationNumber: string | undefined | null,
  athleteId: string,
): string {
  const fromReg = String(registrationNumber ?? '').trim();
  if (fromReg) return fromReg.toUpperCase();
  return athleteId.slice(-8).toUpperCase();
}

export function buildAthleteIdCardUrl(
  origin: string,
  payload: AthleteIdCardPayload,
): string {
  const json = JSON.stringify({
    v: 1 as const,
    clubName: payload.clubName.trim(),
    season: payload.season.trim(),
    lastName: payload.lastName.trim(),
    firstName: payload.firstName.trim(),
    birthDate: payload.birthDate.trim(),
    athleteCode: payload.athleteCode.trim(),
    logoUrl: publicLogoUrl(payload.logoUrl),
  });
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return `${origin.replace(/\/$/, '')}/id/card#${encoded}`;
}

export function parseAthleteIdCardHash(hash: string): AthleteIdCardPayload | null {
  try {
    const raw = hash.replace(/^#/, '').trim();
    if (!raw) return null;
    const json = decodeURIComponent(escape(atob(raw)));
    const data = JSON.parse(json) as Partial<AthleteIdCardPayload>;
    if (data.v !== 1) return null;
    if (!data.lastName || !data.firstName) return null;
    return {
      v: 1,
      clubName: String(data.clubName ?? '').trim(),
      season: String(data.season ?? '').trim(),
      lastName: String(data.lastName).trim(),
      firstName: String(data.firstName).trim(),
      birthDate: String(data.birthDate ?? '').trim(),
      athleteCode: String(data.athleteCode ?? '').trim(),
      logoUrl: publicLogoUrl(data.logoUrl),
    };
  } catch {
    return null;
  }
}

function publicLogoUrl(value: string | null | undefined): string | null {
  const url = (value ?? '').trim();
  if (!url) return null;
  if (url.startsWith('data:')) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (url.length > 400) return null;
  return url;
}
