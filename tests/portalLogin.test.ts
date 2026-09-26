import { describe, expect, it } from 'vitest';
import { formatPortalLoginMessage, type PortalLoginResult } from '../src/api/services/portalLoginService';
import { generatePortalPassword } from '../src/utils/tempPassword';

describe('generatePortalPassword', () => {
  it('starts with a short prefix and has extra characters', () => {
    const password = generatePortalPassword('pr');
    expect(password.startsWith('pr')).toBe(true);
    expect(password.length).toBeGreaterThan(6);
  });
});

describe('formatPortalLoginMessage', () => {
  const url = 'https://teamsuite-seven.vercel.app/app/coach';

  it('shows email and password for a new account', () => {
    const row: PortalLoginResult = {
      userId: 'u1',
      email: 'coach@example.com',
      role: 'coach',
      created: true,
      password: 'prabc123',
    };
    const text = formatPortalLoginMessage([row], url, 'προπονητή');
    expect(text).toContain('coach@example.com');
    expect(text).toContain('prabc123');
    expect(text).toContain(url);
  });

  it('says the existing account was linked', () => {
    const row: PortalLoginResult = {
      userId: 'u1',
      email: 'coach@example.com',
      role: 'coach',
      created: false,
      password: null,
    };
    const text = formatPortalLoginMessage([row], url, 'προπονητή');
    expect(text).toContain('συνδέθηκε');
    expect(text).not.toContain('Κωδικός');
  });
});
