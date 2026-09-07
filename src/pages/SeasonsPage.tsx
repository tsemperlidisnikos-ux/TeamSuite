import { useMemo, useState } from 'react';
import { CalendarRange, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import * as clubSeasonsService from '../api/services/clubSeasonsService';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import type { ClubSeasonInput } from '../schemas';
import type { ClubSeason } from '../types';
import {
  isSeasonActive,
  isSeasonExpired,
  seasonDisplayName,
} from '../utils/clubSeasons';
import { formatDate } from '../utils/labels';

const emptyForm: ClubSeasonInput = {
  name: '',
  startDate: '',
  endDate: '',
};

export function SeasonsPage() {
  const { data, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClubSeason | null>(null);
  const [form, setForm] = useState<ClubSeasonInput>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSourceId, setWizardSourceId] = useState<string | null>(null);
  const [copyClasses, setCopyClasses] = useState(true);
  const [archiveSourceClasses, setArchiveSourceClasses] = useState(true);
  const [moveAthletes, setMoveAthletes] = useState(true);
  const [generateCharges, setGenerateCharges] = useState(true);
  const [wizardSaving, setWizardSaving] = useState(false);

  const seasons = useMemo(() => data.clubSeasons ?? [], [data.clubSeasons]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  function openEdit(item: ClubSeason) {
    setEditing(item);
    setForm({
      name: item.name,
      startDate: item.startDate,
      endDate: item.endDate,
    });
    setError('');
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setError('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const result = editing
      ? await clubSeasonsService.updateClubSeason(editing.id, form)
      : await clubSeasonsService.createClubSeason(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    closeModal();
    refresh();
  }

  function openWizard() {
    const source =
      seasons.find((s) => isSeasonActive(s)) ??
      seasons.find((s) => isSeasonExpired(s)) ??
      seasons[0] ??
      null;
    setWizardSourceId(source?.id ?? null);
    setCopyClasses(true);
    setArchiveSourceClasses(true);
    setMoveAthletes(true);
    setGenerateCharges(true);
    setForm(emptyForm);
    setError('');
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
    setError('');
  }

  async function handleWizard() {
    setWizardSaving(true);
    setError('');
    const result = await clubSeasonsService.rolloverToNewSeason({
      ...form,
      sourceSeasonId: wizardSourceId,
      copyClasses,
      archiveSourceClasses,
      moveAthletes,
      generateCharges,
    });
    setWizardSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία οδηγού');
      return;
    }
    closeWizard();
    refresh();
    const d = result.data;
    window.alert(
      [
        `Δημιουργήθηκε η σεζόν «${d?.seasonName ?? ''}».`,
        d?.copiedClasses ? `Τμήματα: ${d.copiedClasses}` : null,
        d?.archivedClasses ? `Αρχειοθετημένα παλιά τμήματα: ${d.archivedClasses}` : null,
        d?.movedAthletes ? `Αθλητές που μεταφέρθηκαν: ${d.movedAthletes}` : null,
        d?.clonedTemplates ? `Πρότυπα χρεώσεων: ${d.clonedTemplates}` : null,
        d?.generatedCharges ? `Νέες χρεώσεις: ${d.generatedCharges}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή σεζόν;')) return;
    const result = await clubSeasonsService.deleteClubSeason(id);
    if (!result.success) {
      alert(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    refresh();
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Σεζόν"
        subtitle="Ορίστε την περίοδο σεζόν του συλλόγου. Τα τμήματα και οι εγγραφές αθλητών ισχύουν μόνο εντός της ενεργής σεζόν· μετά τη λήξη οι αθλητές αποδεσμεύονται από τα τμήματα."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={openWizard}>
              <Sparkles size={16} /> Οδηγός νέας σεζόν
            </Button>
            <Button type="button" onClick={openCreate}>
              <Plus size={16} /> Νέα σεζόν
            </Button>
          </>
        }
      />

      <section className="panel table-wrap">
        {seasons.length === 0 ? (
          <div className="empty-state">
            <CalendarRange size={28} aria-hidden />
            <h3>Δεν υπάρχουν σεζόν</h3>
            <p>Πρόσθεσε την πρώτη σεζόν (π.χ. 01/08/2026 έως 31/08/2027).</p>
            <Button type="button" onClick={openCreate}>
              <Plus size={16} /> Νέα σεζόν
            </Button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Όνομα</th>
                <th>Από</th>
                <th>Έως</th>
                <th>Κατάσταση</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {seasons.map((item) => {
                const active = isSeasonActive(item);
                const expired = isSeasonExpired(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{seasonDisplayName(item)}</strong>
                    </td>
                    <td>{formatDate(item.startDate)}</td>
                    <td>{formatDate(item.endDate)}</td>
                    <td>
                      <span
                        className={`badge ${
                          active
                            ? 'badge-active'
                            : expired
                              ? 'badge-inactive'
                              : 'badge-trial'
                        }`}
                      >
                        {active ? 'Ενεργή' : expired ? 'Ληγμένη' : 'Προσεχής'}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => openEdit(item)}
                        aria-label="Επεξεργασία"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void handleDelete(item.id)}
                        aria-label="Διαγραφή"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {open ? (
        <div className="training-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="training-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="season-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="season-modal-title">
              {editing ? 'Επεξεργασία σεζόν' : 'Νέα σεζόν'}
            </h2>
            <div className="training-modal-fields">
              <label>
                <span>Όνομα (προαιρετικό)</span>
                <input
                  type="text"
                  placeholder="π.χ. Σεζόν 2026–2027"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                <span>Από ημερομηνία *</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </label>
              <label>
                <span>Έως ημερομηνία *</span>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <div className="training-modal-actions">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Ακύρωση
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {wizardOpen ? (
        <div className="training-modal-backdrop" role="presentation" onClick={closeWizard}>
          <div
            className="training-modal training-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="season-wizard-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="season-wizard-title">Οδηγός νέας σεζόν</h2>
            <p className="muted">
              Δημιουργεί νέα σεζόν, αντιγράφει τμήματα/πρόγραμμα, αρχειοθετεί τα παλιά, μεταφέρει
              ενεργούς αθλητές και προαιρετικά ανοίγει χρεώσεις από τα πρότυπα.
            </p>
            <div className="training-modal-fields">
              <label>
                <span>Όνομα νέας σεζόν</span>
                <input
                  type="text"
                  placeholder="π.χ. Σεζόν 2026–2027"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                <span>Από ημερομηνία *</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </label>
              <label>
                <span>Έως ημερομηνία *</span>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </label>
              <label>
                <span>Αντιγραφή από σεζόν</span>
                <select
                  value={wizardSourceId ?? ''}
                  onChange={(e) => setWizardSourceId(e.target.value || null)}
                >
                  <option value="">— χωρίς αντιγραφή —</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {seasonDisplayName(s)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="season-wizard-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={copyClasses}
                    disabled={!wizardSourceId}
                    onChange={(e) => setCopyClasses(e.target.checked)}
                  />
                  Αντιγραφή τμημάτων και ωραρίου
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={archiveSourceClasses}
                    disabled={!wizardSourceId}
                    onChange={(e) => setArchiveSourceClasses(e.target.checked)}
                  />
                  Αρχειοθέτηση παλιών τμημάτων (μη ενεργά)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={moveAthletes}
                    disabled={!wizardSourceId || !copyClasses}
                    onChange={(e) => setMoveAthletes(e.target.checked)}
                  />
                  Μεταφορά ενεργών αθλητών στα νέα τμήματα
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={generateCharges && Boolean(wizardSourceId)}
                    disabled={!wizardSourceId}
                    onChange={(e) => setGenerateCharges(e.target.checked)}
                  />
                  Νέες χρεώσεις από τα πρότυπα συνδρομών
                </label>
              </div>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <div className="training-modal-actions">
              <Button type="button" variant="secondary" onClick={closeWizard}>
                Ακύρωση
              </Button>
              <Button
                type="button"
                disabled={wizardSaving}
                onClick={() => void handleWizard()}
              >
                {wizardSaving ? 'Εκτέλεση…' : 'Εκτέλεση οδηγού'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
