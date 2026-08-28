import { useMemo, useState } from 'react';
import {
  Activity,
  Bike,
  Dumbbell,
  Flame,
  Music2,
  Pencil,
  Plus,
  Snowflake,
  Target,
  Trash2,
  Trophy,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import * as sportsService from '../api/services/sportsService';
import { isPlatformAdmin } from '../auth/auth';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import type { SportItemInput } from '../schemas';
import {
  isSportSelected,
  resolveCatalogSportName,
  SPORTS_CATALOG,
  type SportCatalogCategoryId,
} from '../shared/sportsCatalog';
import type { SportItem } from '../types';

const emptyForm: SportItemInput = {
  name: '',
  active: true,
  category: 'other',
};

const CATEGORY_ICON: Record<SportCatalogCategoryId, LucideIcon> = {
  team: Trophy,
  individual: Bike,
  water: Waves,
  martial: Flame,
  racket: Target,
  dance: Music2,
  gym: Dumbbell,
  winter: Snowflake,
  other: Activity,
};

export function SportsPage() {
  const { data, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SportItem | null>(null);
  const [form, setForm] = useState<SportItemInput>(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const canCreateSports = isPlatformAdmin();

  const sports = useMemo(() => data.sports ?? [], [data.sports]);
  const activeNames = useMemo(
    () => sports.filter((s) => s.active).map((s) => s.name),
    [sports],
  );
  const customSports = useMemo(
    () =>
      sports.filter((s) => {
        const resolved = resolveCatalogSportName(s.name);
        return !resolved;
      }),
    [sports],
  );
  const activeCount = activeNames.length;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  function openEdit(item: SportItem) {
    setEditing(item);
    setForm({
      name: item.name,
      active: item.active,
      category: item.category ?? 'other',
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
      ? await sportsService.updateSport(editing.id, form)
      : await sportsService.createSport(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    closeModal();
    refresh();
    setMessage(editing ? 'Το άθλημα ενημερώθηκε.' : 'Το άθλημα προστέθηκε.');
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή αθλήματος;')) return;
    await sportsService.deleteSport(id);
    refresh();
  }

  async function handleToggleCatalog(name: string, next: boolean) {
    setToggling(name);
    setMessage('');
    setError('');
    const result = await sportsService.toggleCatalogSport(name, next);
    setToggling(null);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία ενημέρωσης');
      return;
    }
    refresh();
  }

  return (
    <div className="stack-lg sports-settings-page">
      <PageHeader
        title="Άθλημα"
        subtitle="Επίλεξε τα αθλήματα που προσφέρει η ακαδημία από τον κατάλογο."
        actions={
          canCreateSports ? (
            <Button type="button" onClick={openCreate}>
              <Plus size={16} /> Νέο άθλημα
            </Button>
          ) : null
        }
      />

      <p className="sports-catalog-summary">
        Ενεργά αθλήματα: <strong>{activeCount}</strong>
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      <div className="sports-catalog">
        {SPORTS_CATALOG.map((category) => {
          const Icon = CATEGORY_ICON[category.id];
          return (
            <section key={category.id} className="sports-catalog-section panel">
              <header className="sports-catalog-section-head">
                <Icon size={18} aria-hidden />
                <h2>{category.label}</h2>
              </header>
              <div className="sports-catalog-grid">
                {category.sports.map((sport) => {
                  const selected = isSportSelected(
                    activeNames,
                    sport.name,
                    sport.aliases,
                  );
                  const busy = toggling === sport.name;
                  return (
                    <label
                      key={sport.name}
                      className={`sports-catalog-item${selected ? ' is-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={busy}
                        onChange={(e) =>
                          void handleToggleCatalog(sport.name, e.target.checked)
                        }
                      />
                      <span className="sports-catalog-check" aria-hidden />
                      <span className="sports-catalog-name">{sport.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {customSports.length > 0 ? (
        <section className="panel table-wrap">
          <h2 className="sports-custom-title">Προσαρμοσμένα αθλήματα</h2>
          <table>
            <thead>
              <tr>
                <th>Όνομα</th>
                <th>Κατηγορία</th>
                <th>Κατάσταση</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customSports.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.category ?? 'other'}</td>
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
        </section>
      ) : null}

      {open ? (
        <div className="training-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="training-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editing ? 'Επεξεργασία αθλήματος' : 'Νέο προσαρμοσμένο άθλημα'}</h2>
            <div className="training-modal-fields">
              <label>
                <span>Όνομα</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                <span>Κατηγορία</span>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      category: e.target.value as SportItemInput['category'],
                    })
                  }
                >
                  {SPORTS_CATALOG.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Κατάσταση</span>
                <select
                  value={form.active ? 'true' : 'false'}
                  onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}
                >
                  <option value="true">Ενεργό</option>
                  <option value="false">Ανενεργό</option>
                </select>
              </label>
              {error ? <p className="form-error">{error}</p> : null}
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
