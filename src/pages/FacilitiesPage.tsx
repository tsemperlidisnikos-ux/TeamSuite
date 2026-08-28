import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as facilitiesService from '../api/services/facilitiesService';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import type { FacilityInput } from '../schemas';
import type { Facility } from '../types';
import { listActiveClubSportNames } from '../utils/clubSports';
import { FACILITY_TIME_LAYOUTS, facilityLayoutLabel } from '../utils/facilityHours';

const emptyForm = (sortOrder: number): FacilityInput => ({
  name: '',
  active: true,
  sports: [],
  timeLayout: '08:00-00:00-15',
  sortOrder,
});

export function FacilitiesPage() {
  const { data, refresh } = useAppData();
  const facilities = useMemo(
    () =>
      [...(data.facilities ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'el'),
      ),
    [data.facilities],
  );
  const sportNames = useMemo(() => listActiveClubSportNames(data.sports), [data.sports]);
  const nextOrder = (facilities[facilities.length - 1]?.sortOrder ?? 0) + 1;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [form, setForm] = useState<FacilityInput>(() => emptyForm(1));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(Math.max(1, nextOrder)));
    setError('');
    setOpen(true);
  }

  function openEdit(item: Facility) {
    setEditing(item);
    setForm({
      name: item.name,
      active: item.active,
      sports: [...(item.sports ?? [])],
      timeLayout: (item.timeLayout as FacilityInput['timeLayout']) || '08:00-00:00-15',
      sortOrder: item.sortOrder ?? 1,
    });
    setError('');
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setError('');
  }

  function toggleSport(name: string) {
    setForm((prev) => {
      const has = prev.sports.includes(name);
      return {
        ...prev,
        sports: has ? prev.sports.filter((s) => s !== name) : [...prev.sports, name],
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const result = editing
      ? await facilitiesService.updateFacility(editing.id, form)
      : await facilitiesService.createFacility(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    closeModal();
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή εγκατάστασης;')) return;
    await facilitiesService.deleteFacility(id);
    refresh();
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Γήπεδο"
        subtitle="Εγκαταστάσεις και γήπεδα που εμφανίζονται στο ημερολόγιο."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus size={16} /> Προσθήκη εγκατάστασης
          </Button>
        }
      />

      <section className="panel table-wrap">
        {facilities.length === 0 ? (
          <div className="empty-state">
            <h3>Δεν υπάρχουν εγκαταστάσεις</h3>
            <p>Πρόσθεσε το πρώτο γήπεδο για να εμφανιστεί στο ημερολόγιο.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Σειρά</th>
                <th>Όνομα</th>
                <th>Αθλήματα</th>
                <th>Διάταξη ωρών</th>
                <th>Κατάσταση</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((item) => (
                <tr key={item.id}>
                  <td>{item.sortOrder}</td>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.sports?.join(', ') || '—'}</td>
                  <td>{facilityLayoutLabel(item.timeLayout)}</td>
                  <td>
                    <span className={`badge ${item.active ? 'badge-active' : 'badge-inactive'}`}>
                      {item.active ? 'Ενεργό' : 'Ανενεργό'}
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
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open ? (
        <div className="training-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="training-modal facility-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editing ? 'Επεξεργασία εγκατάστασης' : 'Προσθήκη εγκατάστασης'}</h2>
            <div className="training-modal-fields facility-modal-grid">
              <label>
                <span>
                  Όνομα <em className="req-mark">*</em>
                </span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                <span>
                  Ενεργό <em className="req-mark">*</em>
                </span>
                <select
                  value={form.active ? 'true' : 'false'}
                  onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}
                >
                  <option value="true">Ναι</option>
                  <option value="false">Όχι</option>
                </select>
              </label>
              <div className="is-full facility-field">
                <span>
                  Αθλήματα <em className="req-mark">*</em>
                </span>
                {sportNames.length === 0 ? (
                  <p className="class-modal-hint">
                    Δεν υπάρχουν ενεργά αθλήματα. Όρισε τα πρώτα στις Ρυθμίσεις → Άθλημα.
                  </p>
                ) : (
                  <div className="facility-sports-box">
                    {sportNames.map((name) => (
                      <label key={name} className="facility-sport-check">
                        <input
                          type="checkbox"
                          checked={form.sports.includes(name)}
                          onChange={() => toggleSport(name)}
                        />
                        <span>{name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <label>
                <span>
                  Διάταξη ωρών <em className="req-mark">*</em>
                </span>
                <select
                  value={form.timeLayout}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      timeLayout: e.target.value as FacilityInput['timeLayout'],
                    })
                  }
                >
                  {FACILITY_TIME_LAYOUTS.map((layout) => (
                    <option key={layout.id} value={layout.id}>
                      {layout.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  Σειρά εμφάνισης στο πρόγραμμα <em className="req-mark">*</em>
                </span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm({ ...form, sortOrder: Number(e.target.value) || 0 })
                  }
                />
              </label>
              {error ? <p className="form-error is-full">{error}</p> : null}
            </div>
            <div className="training-modal-actions">
              <button
                type="button"
                className="training-btn-save"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                Αποθήκευση
              </button>
              <button type="button" className="training-btn-cancel" onClick={closeModal}>
                Ακύρωση
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
