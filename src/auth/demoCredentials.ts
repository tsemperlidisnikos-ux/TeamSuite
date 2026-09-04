/** Presentation DEMO accounts (local-only). Keep this module free of repository imports. */

export const DEMO_CLUB_ID = 'club_demo_showcase';
export const DEMO_USER_ID = 'user_demo_admin';
export const DEMO_EMAIL = 'demo@teamsuite.app';
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_CLUB_NAME = 'DEMO';

export const DEMO_COACH_USER_ID = 'user_demo_coach';
export const DEMO_COACH_EMAIL = 'coach@teamsuite.app';
export const DEMO_PARENT_USER_ID = 'user_demo_parent';
export const DEMO_PARENT_EMAIL = 'parent@teamsuite.app';
export const DEMO_PARENT_B_USER_ID = 'user_demo_parent_b';
export const DEMO_PARENT_B_EMAIL = 'parent2@teamsuite.app';

export function getDemoLoginHint(): { email: string; password: string } {
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
}

export function getDemoRoleHints(): Array<{ role: string; email: string; password: string }> {
  return [
    { role: 'Διαχειριστής', email: DEMO_EMAIL, password: DEMO_PASSWORD },
    { role: 'Προπονητής', email: DEMO_COACH_EMAIL, password: DEMO_PASSWORD },
    { role: 'Γονέας', email: DEMO_PARENT_EMAIL, password: DEMO_PASSWORD },
  ];
}
