import { useMemo, useState } from 'react';
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react';
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
          <Button type="button" onClick={openCreate}>
            <Plus size={16} /> Νέα σεζόν
          </Button>
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
    </div>
  );
}
