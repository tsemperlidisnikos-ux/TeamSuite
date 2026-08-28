import { z } from 'zod';
import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import type { StaffMember } from '../../types';
import { localDateIso } from '../../utils/dates';

export function splitStaffFullName(value: string): { lastName: string; firstName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { lastName: '', firstName: '' };
  if (parts.length === 1) return { lastName: parts[0], firstName: '' };
  return { lastName: parts[parts.length - 1], firstName: parts.slice(0, -1).join(' ') };
}

export function staffNameParts(member: Pick<StaffMember, 'fullName' | 'firstName' | 'lastName'>): {
  lastName: string;
  firstName: string;
} {
  const lastName = member.lastName?.trim() ?? '';
  const firstName = member.firstName?.trim() ?? '';
  if (lastName || firstName) return { lastName, firstName };
  return splitStaffFullName(member.fullName);
}

export function composeStaffFullName(lastName: string, firstName: string): string {
  return `${lastName.trim()} ${firstName.trim()}`.trim();
}

export const staffSchema = z.object({
  lastName: z.string().min(2, 'Το επώνυμο είναι υποχρεωτικό'),
  firstName: z.string().min(2, 'Το όνομα είναι υποχρεωτικό'),
  email: z.string().email('Μη έγκυρο email'),
  phone: z.string().optional().default(''),
  role: z.enum(['admin', 'coach', 'secretariat', 'employee']),
  active: z.boolean().default(true),
  teamLabel: z.string().optional().default(''),
  photoUrl: z.string().nullable().optional().default(null),
});

export type StaffInput = z.infer<typeof staffSchema>;

export async function getStaff() {
  return apiClient(() => getData().staff ?? []);
}

export async function createStaff(input: StaffInput) {
  return apiClient(() => {
    const parsed = staffSchema.parse(input);
    const fullName = composeStaffFullName(parsed.lastName, parsed.firstName);
    const member: StaffMember = {
      ...parsed,
      fullName,
      id: createId('staff'),
      hireDate: localDateIso(),
    };
    mutateData((data) => {
      if (!data.staff) data.staff = [];
      data.staff.push(member);
    });
    return member;
  });
}

export async function updateStaff(id: string, input: StaffInput) {
  return apiClient(() => {
    const parsed = staffSchema.parse(input);
    const fullName = composeStaffFullName(parsed.lastName, parsed.firstName);
    let updated: StaffMember | undefined;
    mutateData((data) => {
      if (!data.staff) data.staff = [];
      const index = data.staff.findIndex((s) => s.id === id);
      if (index === -1) throw new Error('Το μέλος προσωπικού δεν βρέθηκε');
      updated = { ...data.staff[index], ...parsed, fullName };
      data.staff[index] = updated;
    });
    return updated!;
  });
}

export async function deleteStaff(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.staff = (data.staff ?? []).filter((s) => s.id !== id);
    });
    return { id };
  });
}
