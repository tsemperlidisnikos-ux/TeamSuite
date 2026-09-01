import { apiClient } from '../apiClient';
import {
  deleteUser,
  getSession,
  getUsers,
  prepareStoredPassword,
  roleLabels,
  saveUsers,
  updateUser,
  type AppUser,
  type UserRole,
} from '../../auth/auth';
import { createId, getData, mutateData } from '../../data/repository';
import { composeStaffFullName, staffNameParts } from './staffService';
import {
  CLUB_ROLE_LABELS,
  CLUB_ROLES,
  clearStampedRoleDefaultPermissions,
  getPermissionsForClubRole,
  isClubRole,
  permissionsToStoreForRole,
  usesPlatformRolePermissionDefaults,
  type ClubPermission,
  type ClubRole,
} from '../../platform/platformConfig';

export type ClubDirectoryKind = 'user' | 'athlete' | 'coach' | 'staff';

export type ClubDirectoryRow = {
  id: string;
  kind: ClubDirectoryKind;
  fullName: string;
  email: string;
  roleLabel: string;
  active: boolean;
  hasLogin: boolean;
  userId?: string;
  entityId?: string;
  customPermissions: boolean;
  /** π.χ. «Συνδεδεμένος: Παπαδόπουλος Γιάννης» */
  linkedLabel?: string;
};

export type InviteClubUserInput = {
  clubId: string;
  fullName: string;
  email: string;
  password: string;
  role: ClubRole;
  permissions: ClubPermission[];
  athleteId?: string | null;
  coachId?: string | null;
  financeOwnEntriesOnly?: boolean;
};

function canManageClubUsers(clubId: string): boolean {
  const session = getSession();
  if (!session) return false;
  if (session.role === 'platform_admin') return true;
  if (session.role !== 'admin') return false;
  return session.clubId === clubId;
}

export async function listClubUsers(clubId: string) {
  return apiClient(() => {
    if (!canManageClubUsers(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα διαχείρισης χρηστών');
    }
    return getUsers()
      .filter((u) => u.clubId === clubId && u.role !== 'platform_admin')
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'el'));
  });
}

function normalizeEmail(email: string | undefined | null): string {
  return (email ?? '').trim().toLowerCase();
}

/** Όλοι οι εγγεγραμμένοι (λογαριασμοί + αθλητές + προπονητές + προσωπικό). */
export async function listClubDirectory(clubId: string) {
  return apiClient(() => {
    if (!canManageClubUsers(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα διαχείρισης χρηστών');
    }

    const data = getData();
    const users = getUsers().filter(
      (u) => u.clubId === clubId && u.role !== 'platform_admin',
    );

    const rows: ClubDirectoryRow[] = [];
    const claimedAthleteIds = new Set<string>();
    const claimedCoachIds = new Set<string>();
    const claimedStaffIds = new Set<string>();

    for (const user of users) {
      const email = normalizeEmail(user.email);

      let kind: ClubDirectoryKind = 'user';
      let entityId: string | undefined;
      let active = user.active;
      let roleLabel =
        CLUB_ROLE_LABELS[user.role as ClubRole] ?? roleFallback(user.role);

      let linkedLabel: string | undefined;

      if (user.role === 'athlete' || user.athleteId) {
        const student =
          data.students.find((s) => s.id === user.athleteId) ??
          data.students.find((s) => normalizeEmail(s.email) === email && email);
        if (student) {
          kind = 'athlete';
          entityId = student.id;
          claimedAthleteIds.add(student.id);
          active = student.status !== 'inactive' && user.active;
          roleLabel = 'Αθλητής';
          linkedLabel = `Συνδεδεμένος αθλητής: ${student.lastName} ${student.firstName}`.trim();
        } else if (user.role === 'athlete') {
          kind = 'athlete';
          roleLabel = 'Αθλητής';
          linkedLabel = user.athleteId
            ? 'Σύνδεση αθλητή: εκκρεμεί (μη έγκυρο id)'
            : 'Χωρίς σύνδεση αθλητή';
        }
      } else if (user.role === 'coach') {
        const coach =
          data.coaches.find((c) => c.id === user.coachId) ??
          data.coaches.find((c) => normalizeEmail(c.email) === email && email);
        if (coach) {
          kind = 'coach';
          entityId = coach.id;
          claimedCoachIds.add(coach.id);
          active = coach.active && user.active;
          roleLabel = 'Προπονητής';
          linkedLabel = `Συνδεδεμένος προπονητής: ${coach.lastName} ${coach.firstName}`.trim();
        } else {
          linkedLabel = user.coachId
            ? 'Σύνδεση προπονητή: εκκρεμεί (μη έγκυρο id)'
            : 'Χωρίς σύνδεση προπονητή';
        }
      } else if (user.role === 'secretariat' || user.role === 'admin') {
        const staff = (data.staff ?? []).find(
          (s) => normalizeEmail(s.email) === email && email,
        );
        if (staff) {
          kind = 'staff';
          entityId = staff.id;
          claimedStaffIds.add(staff.id);
          active = staff.active && user.active;
          roleLabel =
            staff.role === 'admin'
              ? 'Διαχειριστής συλλόγου'
              : staff.role === 'coach'
                ? 'Προπονητής'
                : 'Γραμματεία';
        }
      }

      rows.push({
        id: `user:${user.id}`,
        kind,
        fullName: user.fullName,
        email: user.email,
        roleLabel,
        active,
        hasLogin: true,
        userId: user.id,
        entityId,
        customPermissions: !usesPlatformRolePermissionDefaults(user.role, user.permissions),
        linkedLabel,
      });
    }

    // Μητρώο αθλητών/προπονητών/προσωπικού — χωρίς φίλτρο clubName
    // (το store είναι ήδη του συλλόγου· το όνομα στο προφίλ μπορεί να διαφέρει).
    for (const student of data.students) {
      if (claimedAthleteIds.has(student.id)) continue;
      rows.push({
        id: `athlete:${student.id}`,
        kind: 'athlete',
        fullName: `${student.lastName} ${student.firstName}`.trim() || 'Αθλητής',
        email: student.email || '—',
        roleLabel: 'Αθλητής',
        active: student.status !== 'inactive',
        hasLogin: false,
        entityId: student.id,
        customPermissions: false,
      });
    }

    for (const coach of data.coaches) {
      if (claimedCoachIds.has(coach.id)) continue;
      rows.push({
        id: `coach:${coach.id}`,
        kind: 'coach',
        fullName: `${coach.lastName} ${coach.firstName}`.trim() || 'Προπονητής',
        email: coach.email || '—',
        roleLabel: 'Προπονητής',
        active: coach.active,
        hasLogin: false,
        entityId: coach.id,
        customPermissions: false,
      });
    }

    for (const member of data.staff ?? []) {
      if (claimedStaffIds.has(member.id)) continue;
      const names = staffNameParts(member);
      rows.push({
        id: `staff:${member.id}`,
        kind: 'staff',
        fullName:
          composeStaffFullName(names.lastName, names.firstName) || member.fullName || 'Προσωπικό',
        email: member.email || '—',
        roleLabel:
          member.role === 'admin'
            ? 'Διαχειριστής συλλόγου'
            : member.role === 'coach'
              ? 'Προπονητής'
              : 'Γραμματεία',
        active: member.active,
        hasLogin: false,
        entityId: member.id,
        customPermissions: false,
      });
    }

    const kindOrder: Record<ClubDirectoryKind, number> = {
      user: 0,
      staff: 1,
      coach: 2,
      athlete: 3,
    };

    return rows.sort((a, b) => {
      const byKind = kindOrder[a.kind] - kindOrder[b.kind];
      if (byKind !== 0) return byKind;
      return a.fullName.localeCompare(b.fullName, 'el');
    });
  });
}

function roleFallback(role: string): string {
  return roleLabels[role as keyof typeof roleLabels] ?? role;
}

/** Ενεργοποίηση / απενεργοποίηση μέλους (λογαριασμός + μητρώο). */
export async function setClubMemberActive(
  clubId: string,
  row: Pick<ClubDirectoryRow, 'kind' | 'userId' | 'entityId'>,
  active: boolean,
) {
  return apiClient(() => {
    if (!canManageClubUsers(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα επεξεργασίας χρηστών');
    }

    const session = getSession();
    if (!active && row.userId && session?.id === row.userId) {
      throw new Error('Δεν μπορείτε να απενεργοποιήσετε τον ενεργό λογαριασμό');
    }

    if (row.userId) {
      const target = getUsers().find((u) => u.id === row.userId);
      if (!target || target.clubId !== clubId) {
        throw new Error('Ο χρήστης δεν βρέθηκε στον σύλλογο');
      }
      const result = updateUser(row.userId, { active });
      if (!result.success) throw new Error(result.error ?? 'Αποτυχία ενημέρωσης');
    }

    if (row.kind === 'athlete' && row.entityId) {
      mutateData((data) => {
        const index = data.students.findIndex((s) => s.id === row.entityId);
        if (index === -1) return;
        data.students[index] = {
          ...data.students[index],
          status: active ? 'active' : 'inactive',
        };
      });
    }

    if (row.kind === 'coach' && row.entityId) {
      mutateData((data) => {
        const index = data.coaches.findIndex((c) => c.id === row.entityId);
        if (index === -1) return;
        data.coaches[index] = { ...data.coaches[index], active };
      });
    }

    if (row.kind === 'staff' && row.entityId) {
      mutateData((data) => {
        const index = data.staff.findIndex((s) => s.id === row.entityId);
        if (index === -1) return;
        data.staff[index] = { ...data.staff[index], active };
      });
    }

    return { active };
  });
}

export async function inviteClubUser(input: InviteClubUserInput) {
  return apiClient(async () => {
    if (!canManageClubUsers(input.clubId)) {
      throw new Error('Δεν έχετε δικαίωμα πρόσκλησης χρηστών');
    }

    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();

    if (!fullName) throw new Error('Το ονοματεπώνυμο είναι υποχρεωτικό');
    if (!email.includes('@')) throw new Error('Μη έγκυρο email');
    if (password.length < 6) throw new Error('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες');
    if (!isClubRole(input.role)) throw new Error('Μη έγκυρος ρόλος');

    const users = getUsers();
    if (users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Το email χρησιμοποιείται ήδη');
    }

    const permissions = permissionsToStoreForRole(input.role, input.permissions);

    const user: AppUser = {
      id: createId('user'),
      fullName,
      email,
      password: await prepareStoredPassword(password),
      role: input.role as UserRole,
      active: true,
      clubId: input.clubId,
      permissions,
      athleteId: input.role === 'athlete' ? input.athleteId || null : null,
      coachId: input.role === 'coach' ? input.coachId || null : null,
      financeOwnEntriesOnly:
        input.role !== 'admin' && input.role !== 'doctor'
          ? Boolean(input.financeOwnEntriesOnly)
          : false,
    };

    saveUsers([...users, user]);
    return user;
  });
}

export async function updateClubUser(
  clubId: string,
  userId: string,
  patch: {
    fullName?: string;
    role?: ClubRole;
    permissions?: ClubPermission[];
    password?: string;
    active?: boolean;
    athleteId?: string | null;
    coachId?: string | null;
    financeOwnEntriesOnly?: boolean;
  },
) {
  return apiClient(async () => {
    if (!canManageClubUsers(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα επεξεργασίας χρηστών');
    }

    const target = getUsers().find((u) => u.id === userId);
    if (!target || target.clubId !== clubId) {
      throw new Error('Ο χρήστης δεν βρέθηκε στον σύλλογο');
    }

    const nextPatch: Parameters<typeof updateUser>[1] = {};
    if (patch.fullName !== undefined) nextPatch.fullName = patch.fullName.trim();
    if (patch.role !== undefined) {
      if (!CLUB_ROLES.includes(patch.role)) throw new Error('Μη έγκυρος ρόλος');
      nextPatch.role = patch.role;
    }
    if (patch.permissions !== undefined) {
      const nextRole = patch.role ?? (target.role as ClubRole);
      nextPatch.permissions = permissionsToStoreForRole(nextRole, patch.permissions);
    }
    if (patch.password !== undefined && patch.password.trim()) {
      if (patch.password.trim().length < 6) {
        throw new Error('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες');
      }
      nextPatch.password = await prepareStoredPassword(patch.password.trim());
    }
    if (patch.active !== undefined) nextPatch.active = patch.active;

    const nextRole = patch.role ?? (target.role as ClubRole);
    if (patch.athleteId !== undefined || patch.role !== undefined) {
      nextPatch.athleteId =
        nextRole === 'athlete' ? patch.athleteId ?? target.athleteId ?? null : null;
    }
    if (patch.coachId !== undefined || patch.role !== undefined) {
      nextPatch.coachId =
        nextRole === 'coach' ? patch.coachId ?? target.coachId ?? null : null;
    }
    if (patch.financeOwnEntriesOnly !== undefined || patch.role !== undefined) {
      nextPatch.financeOwnEntriesOnly =
        nextRole === 'admin' || nextRole === 'doctor'
          ? false
          : Boolean(patch.financeOwnEntriesOnly ?? target.financeOwnEntriesOnly);
    }

    const result = updateUser(userId, nextPatch);
    if (!result.success) throw new Error(result.error ?? 'Αποτυχία ενημέρωσης');
    return result.data!;
  });
}

export async function removeClubUser(clubId: string, userId: string) {
  return apiClient(() => {
    if (!canManageClubUsers(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα διαγραφής χρηστών');
    }
    const session = getSession();
    if (session?.id === userId) {
      throw new Error('Δεν μπορείτε να διαγράψετε τον ενεργό λογαριασμό');
    }
    const target = getUsers().find((u) => u.id === userId);
    if (!target || target.clubId !== clubId) {
      throw new Error('Ο χρήστης δεν βρέθηκε στον σύλλογο');
    }
    const result = deleteUser(userId);
    if (!result.success) throw new Error(result.error ?? 'Αποτυχία διαγραφής');
    return true;
  });
}

/** Διαγραφή μέλους μητρώου και/ή λογαριασμού. */
export async function removeClubDirectoryMember(
  clubId: string,
  row: Pick<ClubDirectoryRow, 'kind' | 'userId' | 'entityId' | 'fullName'>,
) {
  return apiClient(() => {
    if (!canManageClubUsers(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα διαγραφής χρηστών');
    }

    const session = getSession();
    if (row.userId && session?.id === row.userId) {
      throw new Error('Δεν μπορείτε να διαγράψετε τον ενεργό λογαριασμό');
    }

    if (row.userId) {
      const target = getUsers().find((u) => u.id === row.userId);
      if (!target || target.clubId !== clubId) {
        throw new Error('Ο χρήστης δεν βρέθηκε στον σύλλογο');
      }
      const result = deleteUser(row.userId);
      if (!result.success) throw new Error(result.error ?? 'Αποτυχία διαγραφής');
    }

    if (row.kind === 'athlete' && row.entityId) {
      mutateData((data) => {
        data.students = data.students.filter((s) => s.id !== row.entityId);
        data.attendance = data.attendance.filter((a) => a.studentId !== row.entityId);
        const deleted = data.deletedStudentIds ?? [];
        if (row.entityId && !deleted.includes(row.entityId)) {
          data.deletedStudentIds = [...deleted, row.entityId].slice(-5000);
        }
      });
    }

    if (row.kind === 'coach' && row.entityId) {
      mutateData((data) => {
        data.coaches = data.coaches.filter((c) => c.id !== row.entityId);
        data.classes = data.classes.map((c) =>
          c.coachId === row.entityId ? { ...c, coachId: null } : c,
        );
      });
    }

    if (row.kind === 'staff' && row.entityId) {
      mutateData((data) => {
        data.staff = data.staff.filter((s) => s.id !== row.entityId);
      });
    }

    if (!row.userId && !row.entityId) {
      throw new Error('Δεν βρέθηκε εγγραφή για διαγραφή');
    }

    return true;
  });
}

export function defaultPermissionsForRole(role: ClubRole): ClubPermission[] {
  return getPermissionsForClubRole(role);
}

/** Καθαρίζει stamped defaults ώστε οι χρήστες να ακολουθούν το Platform Admin. */
export function migrateUsersToPlatformRoleDefaults(): number {
  const users = getUsers();
  const next = clearStampedRoleDefaultPermissions(users);
  let changed = 0;
  for (let i = 0; i < users.length; i += 1) {
    if (users[i].permissions !== next[i].permissions) changed += 1;
  }
  if (changed > 0) saveUsers(next);
  return changed;
}
