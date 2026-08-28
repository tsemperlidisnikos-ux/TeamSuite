import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as associationsService from '../api/services/associationsService';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import type { AssociationInput } from '../schemas';
import type { Association } from '../types';

const emptyForm: AssociationInput = {
  name: '',
  city: '',
  phone: '',
  email: '',
  address: '',
  active: true,
};

export function AssociationsPage() {
  const { data, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Association | null>(null);
  const [form, setForm] = useState<AssociationInput>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const associations = useMemo(() => data.associations ?? [], [data.associations]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  function openEdit(item: Association) {
    setEditing(item);
    setForm({
      name: item.name,
      city: item.city,
      phone: item.phone,
      email: item.email,
      address: item.address,
      active: item.active,
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
      ? await associationsService.updateAssociation(editing.id, form)
      : await associationsService.createAssociation(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    closeModal();
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή σωματείου;')) return;
    await associationsService.deleteAssociation(id);
    refresh();
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Σωματείο"
        subtitle="Σωματεία και σύλλογοι που συνδέονται με την ακαδημία."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus size={16} /> Νέο σωματείο
          </Button>
        }
      />

      <section className="panel table-wrap">
        {associations.length === 0 ? (
          <div className="empty-state">
            <h3>Δεν υπάρχουν σωματεία</h3>
            <p>Πρόσθεσε το πρώτο σωματείο.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Όνομα</th>
                <th>Πόλη</th>
                <th>Τηλέφωνο</th>
                <th>Email</th>
                <th>Κατάσταση</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {associations.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.city || '—'}</td>
                  <td>{item.phone || '—'}</td>
                  <td>{item.email || '—'}</td>
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
            className="training-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editing ? 'Επεξεργασία σωματείου' : 'Νέο σωματείο'}</h2>
            <div className="training-modal-fields">
              <label>
                <span>Όνομα</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                <span>Πόλη</span>
                <input
                  value={form.city ?? ''}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
              <label>
                <span>Τηλέφωνο</span>
                <input
                  value={form.phone ?? ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                <span>Διεύθυνση</span>
                <input
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
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
