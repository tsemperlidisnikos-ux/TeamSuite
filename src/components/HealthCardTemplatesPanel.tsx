import { useMemo, useState } from 'react';
import * as healthCardTemplateService from '../api/services/healthCardTemplateService';
import { loadPlatformConfig, type HealthCardLayout, type PlatformConfig } from '../platform/platformConfig';
import { SPORTS_CATALOG } from '../shared/sportsCatalog';
import { isVolleyballSport } from '../utils/sport';
import { Button } from './ui/Button';

export function HealthCardTemplatesPanel({
  onSaved,
}: {
  onSaved: (text: string, config?: PlatformConfig) => void;
}) {
  const [query, setQuery] = useState('');
  const [busySport, setBusySport] = useState('');
  const [tick, setTick] = useState(0);
  const templates = useMemo(
    () => loadPlatformConfig().healthCardTemplatesBySport ?? {},
    [tick],
  );

  const q = query.trim().toLowerCase();

  async function handleFile(sportName: string, file: File | undefined, layout: HealthCardLayout) {
    if (!file) return;
    setBusySport(sportName);
    const result = await healthCardTemplateService.saveHealthCardSportMapping({
      sportName,
      layout,
      pdfFile: file,
    });
    setBusySport('');
    if (!result.success) {
      onSaved(result.error ?? 'Αποτυχία αποθήκευσης');
      return;
    }
    setTick((n) => n + 1);
    onSaved(`Αντιστοιχίστηκε κάρτα υγείας για «${sportName}».`, result.data);
  }

  async function handleLayout(sportName: string, layout: HealthCardLayout) {
    setBusySport(sportName);
    const result = await healthCardTemplateService.saveHealthCardSportMapping({
      sportName,
      layout,
    });
    setBusySport('');
    if (!result.success) {
      onSaved(result.error ?? 'Αποτυχία αποθήκευσης');
      return;
    }
    setTick((n) => n + 1);
    onSaved(`Ενημερώθηκε η διάταξη κάρτας για «${sportName}».`, result.data);
  }

  async function handleClear(sportName: string) {
    setBusySport(sportName);
    const result = await healthCardTemplateService.clearHealthCardSportMapping(sportName);
    setBusySport('');
    if (!result.success) {
      onSaved(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    setTick((n) => n + 1);
    onSaved(`Επαναφορά προεπιλεγμένης κάρτας για «${sportName}».`, result.data);
  }

  return (
    <div className="entry-form admin-entry">
      <p className="admin-entry-note">
        Ανεβάστε το επίσημο PDF κάρτας υγείας ανά άθλημα. Όταν ο αθλητής έχει αυτό το άθλημα,
        η προεπισκόπηση/εκτύπωση χρησιμοποιεί το αντίστοιχο PDF. Χωρίς αντιστοίχιση: μπάσκετ
        (βασικό) ή βόλεϊ (ενσωματωμένο πρότυπο). Η διάταξη πεδίων πρέπει να ταιριάζει στο έντυπο
        (βασική ≈ κάρτα μπάσκετ, πετοσφαίριση ≈ κάρτα βόλεϊ).
      </p>
      <label className="field">
        <span>Αναζήτηση αθλήματος</span>
        <input
          className="field-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="π.χ. Μπάσκετ, Βόλεϊ…"
        />
      </label>
      <div className="health-card-sport-list">
        {SPORTS_CATALOG.map((category) => {
          const sports = category.sports.filter((s) => {
            if (!q) return true;
            const hay = `${s.name} ${(s.aliases ?? []).join(' ')} ${category.label}`.toLowerCase();
            return hay.includes(q);
          });
          if (sports.length === 0) return null;
          return (
            <section key={category.id} className="health-card-sport-group">
              <h4>{category.label}</h4>
              {sports.map((sport) => {
                const mapped = templates[sport.name];
                const busy = busySport === sport.name;
                const layout: HealthCardLayout =
                  mapped?.layout ?? (isVolleyballSport(sport.name) ? 'volleyball' : 'standard');
                const hasCustomPdf = Boolean(mapped?.pdfUrl);
                const status = hasCustomPdf
                  ? 'Προσαρμοσμένο PDF'
                  : mapped
                    ? layout === 'volleyball'
                      ? 'Ενσωματωμένο βόλεϊ'
                      : 'Ενσωματωμένο βασικό'
                    : isVolleyballSport(sport.name)
                      ? 'Προεπιλογή βόλεϊ'
                      : 'Προεπιλογή βασική';
                return (
                  <div key={sport.name} className="health-card-sport-row">
                    <div>
                      <strong>{sport.name}</strong>
                      <span className="muted">{status}</span>
                    </div>
                    <label className="field">
                      <span className="sr-only">Διάταξη</span>
                      <select
                        className="field-input"
                        value={layout}
                        disabled={busy}
                        onChange={(e) =>
                          void handleLayout(sport.name, e.target.value as HealthCardLayout)
                        }
                      >
                        <option value="standard">Διάταξη βασική</option>
                        <option value="volleyball">Διάταξη πετοσφαίρισης</option>
                      </select>
                    </label>
                    <label className="btn btn-secondary health-card-upload-btn">
                      {busy ? 'Αποθήκευση…' : 'PDF'}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        hidden
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          void handleFile(sport.name, file, layout);
                        }}
                      />
                    </label>
                    {mapped ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void handleClear(sport.name)}
                      >
                        Καθαρισμός
                      </Button>
                    ) : null}
                    {hasCustomPdf ? (
                      <a href={mapped!.pdfUrl} target="_blank" rel="noreferrer">
                        Προβολή
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
