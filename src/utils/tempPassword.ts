/** Temporary login password for portal invites (coach / parent). */
export function generatePortalPassword(prefix: string): string {
  const token = Math.random().toString(36).slice(2, 8);
  const clean = prefix.replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase() || 'ts';
  return `${clean}${token}`;
}
