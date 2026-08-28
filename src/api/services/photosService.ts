import { apiClient } from '../apiClient';
import { createId, mutateData } from '../../data/repository';
import { resolveActiveClubId } from '../../data/store';
import { galleryPhotoSchema, type GalleryPhotoInput } from '../../schemas';
import type { GalleryPhoto } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import { assertGalleryConsentForAthletes } from './gdprSubjectService';
import { uploadClubPhotoBlob } from './sessionService';
import { getData } from '../../data/repository';

function isMinorBirthDate(birthDate: string | undefined): boolean {
  const raw = (birthDate || '').slice(0, 10);
  if (!raw) return false;
  const born = new Date(raw);
  if (Number.isNaN(born.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age < 18;
}

export async function createPhoto(input: GalleryPhotoInput) {
  return apiClient(async () => {
    const parsed = galleryPhotoSchema.parse(input);
    const athleteIds = [...new Set((parsed.athleteIds ?? []).filter(Boolean))];
    const consent = assertGalleryConsentForAthletes(athleteIds);
    if (!consent.ok) {
      throw new Error(consent.error || 'Λείπει συγκατάθεση φωτογραφίας.');
    }

    let imageUrl = parsed.imageUrl;
    const clubId = resolveActiveClubId();

    // Prefer cloud Blob for data-URLs so mirrors stay small.
    if (clubId && imageUrl.startsWith('data:')) {
      const contentType =
        imageUrl.slice(5, imageUrl.indexOf(';')) || 'image/jpeg';
      const uploaded = await uploadClubPhotoBlob({
        clubId,
        fileName: parsed.fileName.trim() || 'photo.jpg',
        contentType,
        dataBase64: imageUrl,
      });
      if (uploaded.success && uploaded.data?.url) {
        imageUrl = uploaded.data.url;
      }
    }

    const students = getData().students;
    const includesMinors = athleteIds.some((id) => {
      const s = students.find((row) => row.id === id);
      return s ? isMinorBirthDate(s.birthDate) : false;
    });

    const photo: GalleryPhoto = {
      id: createId('photo'),
      imageUrl,
      caption: parsed.caption.trim(),
      fileName: parsed.fileName.trim(),
      album: (parsed.album ?? '').trim(),
      athleteIds,
      includesMinors,
      consentVerifiedAt: localDateTimeIso(),
      createdAt: localDateTimeIso(),
    };
    mutateData((data) => {
      if (!data.photos) data.photos = [];
      data.photos.unshift(photo);
    });
    return photo;
  });
}

export async function deletePhoto(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.photos = (data.photos ?? []).filter((item) => item.id !== id);
    });
    return { id };
  });
}
