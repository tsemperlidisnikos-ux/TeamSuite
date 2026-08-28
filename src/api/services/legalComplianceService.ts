import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';
import {
  DEFAULT_DATA_RETENTION_MONTHS,
  DEFAULT_DPA_HTML,
  DEFAULT_RETENTION_POLICY_HTML,
} from '../../shared/termsDefaults';
import type { Student } from '../../types';

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function readLegalDocs() {
  const data = getData();
  return {
    dpaHtml: data.dpaHtml?.trim() || DEFAULT_DPA_HTML,
    retentionPolicyHtml: data.retentionPolicyHtml?.trim() || DEFAULT_RETENTION_POLICY_HTML,
    dataRetentionMonths: data.dataRetentionMonths ?? DEFAULT_DATA_RETENTION_MONTHS,
  };
}

function clearSensitiveAthleteFields(student: Student): boolean {
  let changed = false;
  const wipe = (value: string | undefined): string => {
    if (value?.trim()) {
      changed = true;
      return '';
    }
    return value ?? '';
  };
  student.amka = wipe(student.amka);
  student.amkaConsentAt = wipe(student.amkaConsentAt);
  student.doctorName = wipe(student.doctorName);
  student.doctorPhone = wipe(student.doctorPhone);
  student.bloodType = wipe(student.bloodType);
  student.allergies = wipe(student.allergies);
  student.chronicConditions = wipe(student.chronicConditions);
  student.medication = wipe(student.medication);
  if (student.gdprItems?.amkaHealthCard) {
    student.gdprItems = { ...student.gdprItems, amkaHealthCard: false };
    changed = true;
  }
  return changed;
}

export async function getLegalComplianceDocs() {
  return apiClient(() => readLegalDocs());
}

export async function saveLegalComplianceDocs(input: {
  dpaHtml?: string;
  retentionPolicyHtml?: string;
  dataRetentionMonths?: number;
}) {
  return apiClient(() => {
    mutateData((data) => {
      if (input.dpaHtml !== undefined) data.dpaHtml = input.dpaHtml;
      if (input.retentionPolicyHtml !== undefined) {
        data.retentionPolicyHtml = input.retentionPolicyHtml;
      }
      if (input.dataRetentionMonths !== undefined) {
        data.dataRetentionMonths = Math.max(1, Math.min(120, Math.round(input.dataRetentionMonths)));
      }
    });
    return readLegalDocs();
  });
}

/** Clear AMKA + medical fields for inactive athletes past retention window. */
export async function applySensitiveDataRetention() {
  return apiClient(() => {
    const months = getData().dataRetentionMonths ?? DEFAULT_DATA_RETENTION_MONTHS;
    const cutoff = monthsAgoIso(months);
    let cleaned = 0;
    mutateData((data) => {
      for (const student of data.students) {
        if (student.status !== 'inactive') continue;
        const ref = (student.enrolledAt || '').slice(0, 10);
        if (!ref || ref > cutoff) continue;
        if (clearSensitiveAthleteFields(student)) cleaned += 1;
      }
    });
    return { cleaned, months, cutoff };
  });
}
