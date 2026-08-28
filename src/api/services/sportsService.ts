import { apiClient } from '../apiClient';
import { isPlatformAdmin } from '../../auth/auth';
import { createId, mutateData } from '../../data/repository';
import { sportItemSchema, type SportItemInput } from '../../schemas';
import {
  flattenCatalogSports,
  normalizeSportKey,
  resolveCatalogSportName,
} from '../../shared/sportsCatalog';
import type { SportItem } from '../../types';

export async function createSport(input: SportItemInput) {
  return apiClient(() => {
    if (!isPlatformAdmin()) {
      throw new Error('Μόνο Platform Admin μπορεί να προσθέσει άθλημα.');
    }
    const parsed = sportItemSchema.parse(input);
    const sport: SportItem = {
      ...parsed,
      id: createId('sport'),
    };
    mutateData((data) => {
      data.sports.push(sport);
    });
    return sport;
  });
}

export async function updateSport(id: string, input: SportItemInput) {
  return apiClient(() => {
    const parsed = sportItemSchema.parse(input);
    let updated: SportItem | undefined;
    mutateData((data) => {
      const index = data.sports.findIndex((s) => s.id === id);
      if (index === -1) throw new Error('Το άθλημα δεν βρέθηκε');
      updated = { ...data.sports[index], ...parsed };
      data.sports[index] = updated;
    });
    return updated!;
  });
}

export async function deleteSport(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.sports = data.sports.filter((s) => s.id !== id);
    });
    return { id };
  });
}

/** Ενεργοποίηση / απενεργοποίηση αθλήματος από τον κατάλογο (κατά όνομα). */
export async function toggleCatalogSport(catalogName: string, enabled: boolean) {
  return apiClient(() => {
    const canonical = resolveCatalogSportName(catalogName) ?? catalogName.trim();
    if (!canonical) throw new Error('Μη έγκυρο άθλημα');

    let result: SportItem | null = null;
    mutateData((data) => {
      const match = data.sports.find((s) => {
        const resolved = resolveCatalogSportName(s.name) ?? s.name;
        return normalizeSportKey(resolved) === normalizeSportKey(canonical);
      });

      if (enabled) {
        if (match) {
          match.name = canonical;
          match.active = true;
          result = match;
          return;
        }
        const sport: SportItem = {
          id: createId('sport'),
          name: canonical,
          active: true,
        };
        data.sports.push(sport);
        result = sport;
        return;
      }

      if (match) {
        match.active = false;
        result = match;
      }
    });
    return result;
  });
}

/** Συγχρονισμός επιλεγμένων ονομάτων καταλόγου → ενεργά αθλήματα συλλόγου. */
export async function syncCatalogSelection(selectedCanonicalNames: string[]) {
  return apiClient(() => {
    const wanted = new Set(
      selectedCanonicalNames
        .map((n) => resolveCatalogSportName(n) ?? n.trim())
        .filter(Boolean)
        .map((n) => normalizeSportKey(n)),
    );
    const catalog = flattenCatalogSports();

    mutateData((data) => {
      for (const entry of catalog) {
        const key = normalizeSportKey(entry.name);
        const shouldBeActive = wanted.has(key);
        const match = data.sports.find((s) => {
          const resolved = resolveCatalogSportName(s.name) ?? s.name;
          return normalizeSportKey(resolved) === key;
        });
        if (shouldBeActive) {
          if (match) {
            match.name = entry.name;
            match.active = true;
          } else {
            data.sports.push({
              id: createId('sport'),
              name: entry.name,
              active: true,
            });
          }
        } else if (match) {
          match.active = false;
        }
      }
    });

    return { selected: selectedCanonicalNames.length };
  });
}
