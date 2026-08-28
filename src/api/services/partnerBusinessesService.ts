import { apiClient } from '../apiClient';
import { getSession } from '../../auth/auth';
import { createId, mutateData } from '../../data/repository';
import {
  partnerBusinessSchema,
  partnerOfferSchema,
  type PartnerBusinessInput,
  type PartnerOfferInput,
} from '../../schemas';
import type { PartnerBusiness, PartnerOffer } from '../../types';
import { localDateTimeIso } from '../../utils/dates';

function currentUserLabel(): string {
  const session = getSession();
  if (!session) return 'Σύστημα';
  return session.fullName?.trim() || session.email || 'Χρήστης';
}

export async function createPartnerBusiness(input: PartnerBusinessInput) {
  return apiClient(() => {
    const parsed = partnerBusinessSchema.parse(input);
    const now = localDateTimeIso();
    const business: PartnerBusiness = {
      ...parsed,
      id: createId('partner'),
      lastModifiedBy: currentUserLabel(),
      lastModifiedAt: now,
      createdAt: now,
    };
    mutateData((data) => {
      if (!data.partnerBusinesses) data.partnerBusinesses = [];
      data.partnerBusinesses.push(business);
    });
    return business;
  });
}

export async function updatePartnerBusiness(id: string, input: PartnerBusinessInput) {
  return apiClient(() => {
    const parsed = partnerBusinessSchema.parse(input);
    let updated: PartnerBusiness | undefined;
    mutateData((data) => {
      if (!data.partnerBusinesses) data.partnerBusinesses = [];
      const index = data.partnerBusinesses.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('Η επιχείρηση δεν βρέθηκε');
      updated = {
        ...data.partnerBusinesses[index],
        ...parsed,
        lastModifiedBy: currentUserLabel(),
        lastModifiedAt: localDateTimeIso(),
      };
      data.partnerBusinesses[index] = updated;
    });
    return updated!;
  });
}

export async function deletePartnerBusiness(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.partnerBusinesses = (data.partnerBusinesses ?? []).filter((item) => item.id !== id);
      data.partnerOffers = (data.partnerOffers ?? []).filter((item) => item.businessId !== id);
    });
    return { id };
  });
}

export async function setPartnerBusinessSponsors(sponsorIds: string[]) {
  return apiClient(() => {
    const selected = new Set(sponsorIds);
    mutateData((data) => {
      if (!data.partnerBusinesses) data.partnerBusinesses = [];
      const now = localDateTimeIso();
      const user = currentUserLabel();
      data.partnerBusinesses = data.partnerBusinesses.map((item) => {
        const isSponsor = selected.has(item.id);
        if (item.isSponsor === isSponsor) return item;
        return {
          ...item,
          isSponsor,
          lastModifiedBy: user,
          lastModifiedAt: now,
        };
      });
    });
    return { ok: true as const };
  });
}

export async function createPartnerOffer(input: PartnerOfferInput) {
  return apiClient(() => {
    const parsed = partnerOfferSchema.parse(input);
    const offer: PartnerOffer = {
      ...parsed,
      id: createId('offer'),
      createdAt: localDateTimeIso(),
    };
    mutateData((data) => {
      if (!data.partnerOffers) data.partnerOffers = [];
      const business = (data.partnerBusinesses ?? []).find((item) => item.id === parsed.businessId);
      if (!business) throw new Error('Η επιχείρηση δεν βρέθηκε');
      data.partnerOffers.push(offer);
    });
    return offer;
  });
}

export async function updatePartnerOffer(id: string, input: PartnerOfferInput) {
  return apiClient(() => {
    const parsed = partnerOfferSchema.parse(input);
    let updated: PartnerOffer | undefined;
    mutateData((data) => {
      if (!data.partnerOffers) data.partnerOffers = [];
      const business = (data.partnerBusinesses ?? []).find((item) => item.id === parsed.businessId);
      if (!business) throw new Error('Η επιχείρηση δεν βρέθηκε');
      const index = data.partnerOffers.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('Η προσφορά δεν βρέθηκε');
      updated = { ...data.partnerOffers[index], ...parsed };
      data.partnerOffers[index] = updated;
    });
    return updated!;
  });
}

export async function deletePartnerOffer(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.partnerOffers = (data.partnerOffers ?? []).filter((item) => item.id !== id);
    });
    return { id };
  });
}
