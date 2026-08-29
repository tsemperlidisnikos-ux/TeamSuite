import { apiClient } from '../apiClient';
import {
  getSession,
  getUsers,
  prepareStoredPassword,
  saveUsers,
  type AppUser,
} from '../../auth/auth';
import { createId, getData, mutateData } from '../../data/repository';
import type { ParentAthleteLink, Student } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import { studentClassIds } from '../../utils/studentClasses';
import { motherFullName } from '../../utils/greekSurname';

export type ParentLinkRow = {
  linkId: string;
  parentUserId: string;
  parentName: string;
  parentEmail: string;
  athleteId: string;
  athleteName: string;
  createdAt: string;
};

export type ParentInviteStatus = 'active' | 'pending' | 'not_invited';

export type ParentDirectoryAthlete = {
  id: string;
  label: string;
  classId: string | null;
};

export type ParentDirectoryRow = {
  key: string;
  fullName: string;
  email: string;
  athletes: ParentDirectoryAthlete[];
  status: ParentInviteStatus;
  parentUserId: string | null;
  linkIds: string[];
  classIds: string[];
  isMother?: boolean;
};

export type ConnectParentInput = {
  clubId: string;
  fullName: string;
  email: string;
  password: string;
  athleteId: string;
};

export type InviteParentInput = {
  clubId: string;
  fullName: string;
  email: string;
  password: string;
  athleteId?: string | null;
};

function canManageParents(clubId: string): boolean {
  const session = getSession();
  if (!session) return false;
  if (session.role === 'platform_admin') return true;
  if (session.role === 'admin' && session.clubId === clubId) return true;
  if (session.role === 'secretariat' && session.clubId === clubId) return true;
  return false;
}

function athleteLabel(student: Student, classNameById: Map<string, string>): string {
  const name = `${student.firstName} ${student.lastName}`.trim();
  const className = studentClassIds(student)
    .map((id) => classNameById.get(id))
    .filter(Boolean)
    .join(', ');
  return className ? `${name} (${className})` : name;
}

function rowsWithEmail(map: Map<string, ParentDirectoryRow>, email: string): ParentDirectoryRow[] {
  const e = email.trim().toLowerCase();
  if (!e) return [];
  return [...map.values()].filter((row) => row.email === e);
}

function attachLinkedParent(
  map: Map<string, ParentDirectoryRow>,
  parent: AppUser,
  athlete: ParentDirectoryAthlete | null,
  linkId?: string,
) {
  const email = parent.email.toLowerCase();
  const matches = rowsWithEmail(map, email);
  if (matches.length === 0) {
    map.set(`f:${email}`, {
      key: `f:${email}`,
      fullName: parent.fullName,
      email,
      athletes: athlete ? [athlete] : [],
      status: parent.active ? 'active' : 'pending',
      parentUserId: parent.id,
      linkIds: linkId ? [linkId] : [],
      classIds: athlete?.classId ? [athlete.classId] : [],
    });
    return;
  }
  for (const existing of matches) {
    existing.parentUserId = parent.id;
    existing.email = email;
    if (!existing.isMother) {
      existing.fullName = parent.fullName || existing.fullName;
    }
    if (linkId && !existing.linkIds.includes(linkId)) existing.linkIds.push(linkId);
    if (athlete && !existing.athletes.some((a) => a.id === athlete.id)) {
      existing.athletes.push(athlete);
    }
    if (athlete?.classId && !existing.classIds.includes(athlete.classId)) {
      existing.classIds.push(athlete.classId);
    }
    if (existing.linkIds.length > 0 && parent.active) existing.status = 'active';
    else if (!existing.isMother) existing.status = parent.active ? 'pending' : existing.status;
  }
}

function upsertGuardian(
  map: Map<string, ParentDirectoryRow>,
  opts: {
    email: string;
    fullName: string;
    athlete: ParentDirectoryAthlete;
    isMother?: boolean;
  },
) {
  const email = opts.email.trim().toLowerCase();
  const role = opts.isMother ? 'm' : 'f';
  const key = email
    ? `${role}:${email}`
    : `${role}:name:${opts.fullName.trim().toLowerCase()}:${opts.athlete.id}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      key,
      fullName: opts.fullName.trim() || 'Γονέας',
      email,
      athletes: [opts.athlete],
      status: 'not_invited',
      parentUserId: null,
      linkIds: [],
      classIds: studentClassIds(opts.athlete),
      isMother: Boolean(opts.isMother),
    });
    return;
  }
  if (opts.isMother) existing.isMother = true;
  else if (!existing.isMother) existing.isMother = false;
  if (!existing.athletes.some((a) => a.id === opts.athlete.id)) {
    existing.athletes.push(opts.athlete);
  }
  for (const classId of studentClassIds(opts.athlete)) {
    if (!existing.classIds.includes(classId)) {
      existing.classIds.push(classId);
    }
  }
  if (!existing.fullName || existing.fullName === 'Γονέας') {
    existing.fullName = opts.fullName.trim() || existing.fullName;
  }
}

export async function listParentDirectory(clubId: string) {
  return apiClient(() => {
    if (!canManageParents(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα διαχείρισης γονέων');
    }

    const data = getData();
    const classNameById = new Map(
      data.classes.map((cls) => [cls.id, cls.ageGroup || cls.name]),
    );
    const studentById = new Map(data.students.map((s) => [s.id, s]));
    const parentUsers = getUsers().filter((u) => u.clubId === clubId && u.role === 'parent');
    const parentById = new Map(parentUsers.map((u) => [u.id, u]));
    const parentByEmail = new Map(parentUsers.map((u) => [u.email.toLowerCase(), u]));

    const map = new Map<string, ParentDirectoryRow>();

    for (const student of data.students) {
      if (student.status === 'inactive') continue;
      const athlete: ParentDirectoryAthlete = {
        id: student.id,
        label: athleteLabel(student, classNameById),
        classId: student.classId,
      };

      if (student.fatherEmail?.trim()) {
        upsertGuardian(map, {
          email: student.fatherEmail,
          fullName:
            [student.fatherFirstName, student.lastName].filter(Boolean).join(' ') ||
            student.guardianName ||
            'Πατέρας',
          athlete,
        });
      }
      if (student.motherEmail?.trim()) {
        upsertGuardian(map, {
          email: student.motherEmail,
          fullName:
            motherFullName(student.motherFirstName, student.lastName) ||
            student.guardianName ||
            'Μητέρα',
          athlete,
          isMother: true,
        });
      }
      if (
        student.guardianName?.trim() &&
        !student.fatherEmail?.trim() &&
        !student.motherEmail?.trim()
      ) {
        upsertGuardian(map, {
          email: '',
          fullName: student.guardianName,
          athlete,
        });
      }
    }

    for (const link of data.parentLinks ?? []) {
      const parent = parentById.get(link.parentUserId);
      if (!parent) continue;
      const student = studentById.get(link.athleteId);
      const athlete: ParentDirectoryAthlete | null = student
        ? {
            id: student.id,
            label: athleteLabel(student, classNameById),
            classId: student.classId,
          }
        : null;
      attachLinkedParent(map, parent, athlete, link.id);
    }

    for (const parent of parentUsers) {
      attachLinkedParent(map, parent, null);
    }

    for (const row of map.values()) {
      if (!row.email) continue;
      const user = parentByEmail.get(row.email);
      if (!user) continue;
      row.parentUserId = user.id;
      if (!row.isMother) {
        row.fullName = user.fullName || row.fullName;
      }
      if (row.linkIds.length > 0 && user.active) row.status = 'active';
      else row.status = 'pending';
    }

    return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'el'));
  });
}

export async function listParentLinks(clubId: string) {
  return apiClient(() => {
    if (!canManageParents(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα διαχείρισης γονέων');
    }
    const data = getData();
    const users = getUsers().filter((u) => u.clubId === clubId && u.role === 'parent');
    const userById = new Map(users.map((u) => [u.id, u]));
    const studentById = new Map(data.students.map((s) => [s.id, s]));

    const rows: ParentLinkRow[] = [];
    for (const link of data.parentLinks ?? []) {
      const parent = userById.get(link.parentUserId);
      if (!parent) continue;
      const athlete = studentById.get(link.athleteId);
      rows.push({
        linkId: link.id,
        parentUserId: parent.id,
        parentName: parent.fullName,
        parentEmail: parent.email,
        athleteId: link.athleteId,
        athleteName: athlete
          ? `${athlete.lastName} ${athlete.firstName}`.trim()
          : '—',
        createdAt: link.createdAt,
      });
    }

    return rows.sort((a, b) => a.parentName.localeCompare(b.parentName, 'el'));
  });
}

export async function inviteParent(input: InviteParentInput) {
  return apiClient(async () => {
    if (!canManageParents(input.clubId)) {
      throw new Error('Δεν έχετε δικαίωμα πρόσκλησης γονέα');
    }

    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();
    const athleteId = input.athleteId ?? null;

    if (fullName.length < 2) throw new Error('Συμπληρώστε ονοματεπώνυμο γονέα');
    if (!email.includes('@')) throw new Error('Μη έγκυρο email');
    if (password.length < 6) throw new Error('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες');

    const users = getUsers();
    let parent = users.find((u) => u.email.toLowerCase() === email && u.clubId === input.clubId);

    if (parent && parent.role !== 'parent') {
      throw new Error('Το email ανήκει ήδη σε άλλο ρόλο');
    }

    const hashed = await prepareStoredPassword(password);

    if (!parent) {
      if (users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error('Υπάρχει ήδη λογαριασμός με αυτό το email');
      }
      parent = {
        id: createId('user'),
        email,
        password: hashed,
        fullName,
        role: 'parent',
        active: false,
        clubId: input.clubId,
        permissions: null,
      } satisfies AppUser;
      saveUsers([...users, parent]);
    } else {
      saveUsers(
        users.map((u) =>
          u.id === parent!.id
            ? { ...u, fullName, password: hashed, role: 'parent' as const, active: false }
            : u,
        ),
      );
    }

    if (athleteId) {
      const data = getData();
      const athlete = data.students.find((s) => s.id === athleteId);
      if (!athlete || athlete.status === 'inactive') {
        throw new Error('Ο αθλητής δεν βρέθηκε');
      }
      const parentUserId = parent.id;
      mutateData((store) => {
        if (!store.parentLinks) store.parentLinks = [];
        const exists = store.parentLinks.some(
          (link) => link.parentUserId === parentUserId && link.athleteId === athleteId,
        );
        if (exists) return;
        store.parentLinks.unshift({
          id: createId('plink'),
          parentUserId,
          athleteId,
          createdAt: localDateTimeIso(),
        });
      });
    }

    return { id: parent.id, email, status: 'pending' as const };
  });
}

export async function connectParent(input: ConnectParentInput) {
  return apiClient(async () => {
    if (!canManageParents(input.clubId)) {
      throw new Error('Δεν έχετε δικαίωμα σύνδεσης γονέα');
    }

    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();
    const athleteId = input.athleteId;

    if (fullName.length < 2) throw new Error('Συμπληρώστε ονοματεπώνυμο γονέα');
    if (!email.includes('@')) throw new Error('Μη έγκυρο email');
    if (password.length < 6) throw new Error('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες');
    if (!athleteId) throw new Error('Επιλέξτε αθλητή');

    const data = getData();
    const athlete = data.students.find((s) => s.id === athleteId);
    if (!athlete || athlete.status === 'inactive') {
      throw new Error('Ο αθλητής δεν βρέθηκε');
    }

    const users = getUsers();
    let parent = users.find(
      (u) => u.email.toLowerCase() === email && u.clubId === input.clubId,
    );

    if (parent && parent.role !== 'parent') {
      throw new Error('Το email ανήκει ήδη σε άλλο ρόλο');
    }

    const hashed = await prepareStoredPassword(password);

    if (!parent) {
      if (users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error('Υπάρχει ήδη λογαριασμός με αυτό το email');
      }
      parent = {
        id: createId('user'),
        email,
        password: hashed,
        fullName,
        role: 'parent',
        active: true,
        clubId: input.clubId,
        permissions: null,
      } satisfies AppUser;
      saveUsers([...users, parent]);
    } else {
      const next = users.map((u) =>
        u.id === parent!.id
          ? {
              ...u,
              fullName,
              password: hashed,
              active: true,
              role: 'parent' as const,
            }
          : u,
      );
      saveUsers(next);
    }

    const parentUserId = parent.id;
    let created: ParentAthleteLink | undefined;
    mutateData((store) => {
      if (!store.parentLinks) store.parentLinks = [];
      const exists = store.parentLinks.some(
        (link) => link.parentUserId === parentUserId && link.athleteId === athleteId,
      );
      if (exists) throw new Error('Ο γονέας είναι ήδη συνδεδεμένος με αυτόν τον αθλητή');
      created = {
        id: createId('plink'),
        parentUserId,
        athleteId,
        createdAt: localDateTimeIso(),
      };
      store.parentLinks.unshift(created);
    });

    return created!;
  });
}

export async function disconnectParentLink(clubId: string, linkId: string) {
  return apiClient(() => {
    if (!canManageParents(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα αποσύνδεσης');
    }
    mutateData((data) => {
      data.parentLinks = (data.parentLinks ?? []).filter((link) => link.id !== linkId);
    });
    return { id: linkId };
  });
}

export async function disconnectAllParentLinks(clubId: string, linkIds: string[]) {
  return apiClient(() => {
    if (!canManageParents(clubId)) {
      throw new Error('Δεν έχετε δικαίωμα αποσύνδεσης');
    }
    const set = new Set(linkIds);
    mutateData((data) => {
      data.parentLinks = (data.parentLinks ?? []).filter((link) => !set.has(link.id));
    });
    return { count: linkIds.length };
  });
}
