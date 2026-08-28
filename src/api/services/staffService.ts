import { z } from 'zod';
import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import type { StaffMember } from '../../types';
import { localDateIso } from '../../utils/dates';

export const staffSchema = z.object({
  fullName: z.string().min(2, 'Το ονοματεπώνυμο είναι υποχρεωτικό'),
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
    const member: StaffMember = {
      ...parsed,
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
    let updated: StaffMember | undefined;
    mutateData((data) => {
      if (!data.staff) data.staff = [];
      const index = data.staff.findIndex((s) => s.id === id);
      if (index === -1) throw new Error('Το μέλος προσωπικού δεν βρέθηκε');
      updated = { ...data.staff[index], ...parsed };
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
