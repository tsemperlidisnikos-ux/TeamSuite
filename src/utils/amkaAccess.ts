import type { UserRole } from '../auth/auth';
import type { AmkaAccessLog } from '../types';

/** Roles allowed to view/edit AMKA and medical special-category data. */
const SENSITIVE_ACCESS_ROLES: ReadonlySet<string> = new Set<UserRole | string>([
  'platform_admin',
  'admin',
  'doctor',
]);

const AMKA_LOG_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

/** Greek AMKA is typically 11 digits; also catch labeled mentions. */
const AMKA_DIGIT_RE = /(?<!\d)\d{11}(?!\d)/g;
const AMKA_LABEL_RE = /ΑΜΚΑ\s*[:-]?\s*\d{5,}/gi;

export function canAccessAmka(role: string | null | undefined): boolean {
  if (!role) return false;
  return SENSITIVE_ACCESS_ROLES.has(role);
}

/** Same RBAC as AMKA: admin + doctor (+ platform admin). */
export function canAccessMedical(role: string | null | undefined): boolean {
  return canAccessAmka(role);
}

export function maskAmka(value: string | undefined | null): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length <= 4) return '••••';
  return `••••${digits.slice(-4)}`;
}

export function formatAmkaForViewer(
  value: string | undefined | null,
  allowed: boolean,
): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '—';
  return allowed ? trimmed : maskAmka(trimmed);
}

export function pruneAmkaAccessLogs(logs: AmkaAccessLog[]): AmkaAccessLog[] {
  const cutoff = Date.now() - AMKA_LOG_RETENTION_MS;
  return logs.filter((row) => {
    const t = Date.parse(row.at);
    return Number.isFinite(t) && t >= cutoff;
  });
}

/** Strip AMKA-like values from outbound email bodies. */
export function sanitizeOutboundEmailContent(content: string): string {
  if (!content) return content;
  return content
    .replace(AMKA_LABEL_RE, 'ΑΜΚΑ: [αποκρύφθηκε]')
    .replace(AMKA_DIGIT_RE, '[αποκρύφθηκε]');
}

export function sanitizeOutboundEmail(input: {
  subject: string;
  text: string;
  html?: string;
}): { subject: string; text: string; html?: string } {
  return {
    subject: sanitizeOutboundEmailContent(input.subject),
    text: sanitizeOutboundEmailContent(input.text),
    html: input.html !== undefined ? sanitizeOutboundEmailContent(input.html) : undefined,
  };
}
