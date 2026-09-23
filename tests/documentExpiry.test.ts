import { describe, expect, it } from 'vitest';
import { classifyExpiry, deriveHealthCardStatus } from '../src/api/services/documentExpiryService';
import { healthCardNoticeText } from '../src/api/services/healthCardNoticeService';
import { feePaymentLoginUrl } from '../src/api/services/feeChargesService';

describe('classifyExpiry', () => {
  it('marks past dates as expired', () => {
    expect(classifyExpiry('2026-09-01', '2026-09-24', 30)).toEqual({
      daysLeft: -23,
      status: 'expired',
    });
  });

  it('marks dates within the window as soon', () => {
    expect(classifyExpiry('2026-10-10', '2026-09-24', 30)).toEqual({
      daysLeft: 16,
      status: 'soon',
    });
  });

  it('marks distant dates as ok', () => {
    expect(classifyExpiry('2027-01-01', '2026-09-24', 30).status).toBe('ok');
  });
});

describe('deriveHealthCardStatus', () => {
  it('returns missing when empty', () => {
    expect(deriveHealthCardStatus('')).toBe('Όχι');
  });
});

describe('healthCardNoticeText', () => {
  it('mentions expiry date and athlete', () => {
    const text = healthCardNoticeText('DEMO', {
      athleteId: 'a1',
      athleteName: 'Πέτρος Ιωάννου',
      kind: 'healthCard',
      expiresAt: '2026-10-01',
      daysLeft: 7,
      status: 'soon',
    });
    expect(text).toContain('Πέτρος Ιωάννου');
    expect(text).toContain('2026-10-01');
    expect(text).toContain('7 ημέρες');
  });
});

describe('feePaymentLoginUrl', () => {
  it('opens the parent app payments tab', () => {
    expect(feePaymentLoginUrl('https://teamsuite-seven.vercel.app')).toBe(
      'https://teamsuite-seven.vercel.app/app/parent?tab=payments',
    );
  });
});
